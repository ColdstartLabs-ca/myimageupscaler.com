/**
 * Browser-side Search Console extractor for reports that have no public API.
 *
 * Run: paste this file into mcp__claude-in-chrome__javascript_tool on any
 * search.google.com/search-console tab, poll `window.__gscUi.status` until "done",
 * then read the rendered <pre> with get_page_text. See SKILL.md "UI-Only Reports".
 * Its output replaces the tab body, so navigate the tab away after the read.
 *
 * Read-only: GET requests to report pages. Report pages embed their datasets in
 * AF_initDataCallback blocks. The format is private, so parsers match data shapes,
 * not ds:N keys, and every report records its own parse errors in `gaps`.
 */
(function (root) {
  const SITE = 'sc-domain:myimageupscaler.com';
  const REPORTS = {
    pageIndexing: 'index',
    videoIndexing: 'video-index',
    crawlStats: 'settings/crawl-stats',
    coreWebVitals: 'core-web-vitals',
    generativeAi: 'performance/search-analytics/ai',
    insights: 'performance/insights',
    links: 'links',
    productSnippets: 'r/product',
    merchantListings: 'r/merchant-listings',
    breadcrumbs: 'r/breadcrumbs',
    reviewSnippets: 'r/review-snippet',
  };
  // Mapped against the rendered Validation column on 2026-11-01.
  const VALIDATION_STATES = {
    1: 'passed',
    2: 'started',
    3: 'not_started',
    4: 'failed',
  };
  // Codes without a confirmed label stay numeric on purpose.
  const CRAWL_LABELS = {
    2: {
      name: 'byResponse',
      1: 'ok_200',
      17: 'moved_301',
      4: 'other_4xx',
      2: 'not_found_404',
      9: 'server_5xx',
      20: 'not_modified_304',
      12: 'page_unreachable',
    },
    3: {
      name: 'byFileType',
      1: 'html',
      4: 'javascript',
      7: 'other',
      2: 'image',
      5: 'css',
      9: 'unknown_failed',
    },
    4: { name: 'byPurpose', 1: 'discovery', 2: 'refresh' },
    5: {
      name: 'byGooglebot',
      1: 'smartphone',
      2: 'desktop',
      3: 'image',
      5: 'page_resource',
      6: 'other_agent',
      7: 'adsbot',
    },
  };
  const RPC = {
    indexing: 30,
    videoIndexing: 53,
    enhancement: 6,
    crawlDaily: 45,
    cwvDaily: 38,
    aiDaily: 27,
    aiTable: 32,
  };
  const ADDITIONAL_SOURCES = { 2: 'image', 7: 'multimodal' };
  const MAX_ROWS = 25;
  const MAX_SAMPLE_URLS = 8;

  function splitDs(html) {
    const marker = "AF_initDataCallback({key: '";
    const blocks = {};
    let index = 0;
    while ((index = html.indexOf(marker, index)) >= 0) {
      const keyStart = index + marker.length;
      const key = html.slice(keyStart, html.indexOf("'", keyStart));
      const dataStart = html.indexOf('data:', keyStart);
      const dataEnd = html.indexOf(', sideChannel', dataStart);
      if (dataStart < 0 || dataEnd < 0) break;
      try {
        blocks[key] = JSON.parse(html.slice(dataStart + 5, dataEnd));
      } catch {
        blocks[key] = null;
      }
      index = dataEnd;
    }
    return blocks;
  }

  function walk(node, visit, ancestors = []) {
    if (!Array.isArray(node)) return;
    visit(node, ancestors);
    const next = ancestors.concat([node]);
    for (const child of node) walk(child, visit, next);
  }

  const isoDate = ms => new Date(ms).toISOString().slice(0, 10);
  const isEpochMs = value => typeof value === 'number' && value > 1e12 && value < 1e13;
  const cleanNumber = value => (typeof value === 'number' ? value : null);
  const blocksOf = ds => Object.values(ds).filter(Array.isArray);

  function pathGroup(url) {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean);
      const hasLocale = /^(de|es|fr|it|ja|pt)$/.test(segments[0] || '');
      const section = (hasLocale ? segments[1] : segments[0]) || '(home)';
      return { locale: hasLocale ? segments[0] : 'en', section };
    } catch {
      return { locale: 'unknown', section: 'unknown' };
    }
  }

  function tally(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] || 0) + 1;
    return Object.fromEntries(
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
    );
  }

  /** Rows like [ms, [a, b, c], ...]: daily series. Longest series per block wins. */
  function parseDailySeries(block) {
    let longest = [];
    walk(block, node => {
      const rows = node.filter(
        row => Array.isArray(row) && isEpochMs(row[0]) && Array.isArray(row[1])
      );
      if (rows.length > longest.length) longest = rows;
    });
    return longest.map(row => ({ date: isoDate(row[0]), values: row[1].map(cleanNumber) }));
  }

  /** Issue rows: [[SEVERITY, ...], [itemKey], ...] with a [null, count] closing an ancestor. */
  function parseIssues(ds) {
    const issues = new Map();
    for (const block of blocksOf(ds)) {
      walk(block, (node, ancestors) => {
        const head = node[0];
        const keyCell = node[1];
        if (
          !Array.isArray(head) ||
          !/^[A-Z_]+$/.test(head[0] || '') ||
          !Array.isArray(keyCell) ||
          typeof keyCell[0] !== 'string' ||
          issues.has(keyCell[0])
        ) {
          return;
        }
        const owner = ancestors
          .slice()
          .reverse()
          .find(ancestor => {
            const last = ancestor[ancestor.length - 1];
            return Array.isArray(last) && last[0] === null && typeof last[1] === 'number';
          });
        let type = null;
        let field = null;
        let trend = [];
        walk(owner || node, child => {
          if (!type && child[0] === null && child[1] === head[0] && typeof child[2] === 'string') {
            type = child[2];
            field = Array.isArray(child[3]) ? child[3].join('.') : null;
          }
          const points = child.filter(
            row => Array.isArray(row) && row.length === 2 && isEpochMs(row[0])
          );
          if (points.length > trend.length) trend = points;
        });
        if (!type) return;
        const stateCell = node.find(cell => Array.isArray(cell) && cell[2] === 0);
        const lastPoint = trend[trend.length - 1];
        issues.set(keyCell[0], {
          key: keyCell[0],
          severity: head[0],
          type,
          field,
          count: lastPoint ? cleanNumber(lastPoint[1]) : null,
          validation: stateCell ? VALIDATION_STATES[stateCell[6]] || stateCell[6] : null,
          trend: thinTrend(trend).map(point => [isoDate(point[0]), cleanNumber(point[1])]),
        });
      });
    }
    return [...issues.values()];
  }

  /** Drilldown URL rows: [[url, ...], [null, lastCrawlEpochSeconds]]. */
  function parseDrilldownUrls(ds) {
    const urls = new Map();
    for (const block of blocksOf(ds)) {
      walk(block, node => {
        const cell = node[0];
        const metric = node[1];
        if (
          Array.isArray(cell) &&
          typeof cell[0] === 'string' &&
          /^https?:\/\//.test(cell[0]) &&
          Array.isArray(metric) &&
          metric[0] === null
        ) {
          urls.set(cell[0], metric[1]);
        }
      });
    }
    const list = [...urls.entries()];
    const latestSeconds = Math.max(0, ...list.map(([, seconds]) => seconds || 0));
    return {
      listed: list.length,
      byLocale: tally(list.map(([url]) => pathGroup(url).locale)),
      bySection: tally(list.map(([url]) => pathGroup(url).section)),
      latestCrawl: latestSeconds ? isoDate(latestSeconds * 1000) : null,
      sampleUrls: list.slice(0, MAX_SAMPLE_URLS).map(([url]) => url),
    };
  }

  function strictLabel(cell) {
    if (!Array.isArray(cell)) return null;
    const strings = [];
    const objects = [];
    (function collect(value) {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') objects.push(value);
    })(cell);
    if (strings.length) return strings[strings.length - 1];
    return objects.length ? JSON.stringify(objects[0]) : null;
  }

  /** Dimension tables: [[dimensionCell], [null, value], ...] nested under one list. */
  function parseTable(block) {
    const rows = [];
    walk(block, node => {
      const metric = node[1];
      if (
        Array.isArray(node[0]) &&
        Array.isArray(metric) &&
        metric[0] === null &&
        typeof metric[1] === 'number'
      ) {
        const label = strictLabel(node[0]);
        if (label) rows.push({ label, value: metric[1], secondary: node[2]?.[1] ?? null });
      }
    });
    return rows;
  }

  const blockConfig = block => (Array.isArray(block?.[0]) ? JSON.stringify(block[0]) : '');
  const rpcId = block => (Array.isArray(block?.[0]) ? block[0][1] : null);

  function thinTrend(points) {
    if (points.length <= 20) return points;
    return points.filter((_, index) => (points.length - 1 - index) % 7 === 0);
  }

  function seriesForRpc(ds, rpc) {
    return blocksOf(ds)
      .filter(candidate => rpcId(candidate) === rpc)
      .map(parseDailySeries)
      .reduce((longest, series) => (series.length > longest.length ? series : longest), []);
  }

  function compactSeries(series, labels) {
    if (!series.length) return null;
    const pick = point =>
      Object.fromEntries(labels.map((label, index) => [label, point.values[index] ?? null]));
    const weekly = series.filter((_, index) => (series.length - 1 - index) % 7 === 0);
    return {
      from: series[0].date,
      to: series[series.length - 1].date,
      weekly: weekly.map(point => ({ date: point.date, ...pick(point) })),
    };
  }

  function parseIssueReport(ds, rpc, dailyLabels) {
    return {
      daily: compactSeries(seriesForRpc(ds, rpc), dailyLabels),
      issues: parseIssues(ds),
    };
  }

  function parseCrawlStats(ds) {
    const blocks = blocksOf(ds);
    const hosts = blocks
      .map(parseTable)
      .flat()
      .filter(row => /^[a-z0-9.-]+\.[a-z]+$/.test(row.label));
    const breakdowns = {};
    for (const block of blocks) {
      walk(block, node => {
        const cell = node[0]?.[0];
        const share = node[1];
        if (cell && cell['529361656'] && share?.[0] === null && typeof share[1] === 'number') {
          const code = cell['529361656'];
          const position = code.findIndex(value => value !== null);
          const labels = CRAWL_LABELS[position] || { name: `enum${position}` };
          breakdowns[labels.name] = breakdowns[labels.name] || {};
          breakdowns[labels.name][labels[code[position]] || `code_${code[position]}`] = Number(
            share[1].toFixed(4)
          );
        }
      });
    }
    return {
      daily: compactSeries(seriesForRpc(ds, RPC.crawlDaily), [
        'requests',
        'downloadBytes',
        'avgResponseMs',
      ]),
      hosts: [...new Map(hosts.map(row => [row.label, row.value])).entries()],
      breakdowns,
    };
  }

  function parseCoreWebVitals(ds) {
    const out = {};
    const labels = ['poor', 'needsImprovement', 'good'];
    for (const block of blocksOf(ds)) {
      if (rpcId(block) !== RPC.cwvDaily) continue;
      const config = blockConfig(block);
      const device = config.includes('[17,null,null,1]')
        ? 'desktop'
        : config.includes('[17,null,null,2]')
          ? 'mobile'
          : null;
      if (device) out[device] = compactSeries(parseDailySeries(block), labels);
    }
    return out;
  }

  function parseGenerativeAi(ds) {
    const out = { daily: null, pages: [], countries: [], totalPageRows: 0 };
    for (const block of blocksOf(ds)) {
      if (rpcId(block) === RPC.aiDaily && !out.daily) {
        const series = parseDailySeries(block);
        if (series.length > 10) out.daily = compactSeries(series, ['impressions']);
      }
      if (rpcId(block) !== RPC.aiTable) continue;
      const rows = parseTable(block);
      const pages = rows.filter(row => /^https?:\/\//.test(row.label));
      if (pages.length) {
        out.totalPageRows = pages.length;
        out.pages = pages.slice(0, MAX_ROWS).map(row => [row.label, row.value]);
        const bySection = {};
        for (const row of pages) {
          const { section } = pathGroup(row.label);
          bySection[section] = (bySection[section] || 0) + row.value;
        }
        out.pageBySection = Object.fromEntries(
          Object.entries(bySection)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
        );
      } else {
        out.countries = rows
          .slice(0, MAX_ROWS)
          .map(row => [row.label.replace(/[^a-z]/g, '').replace(/^\d+/, ''), row.value]);
      }
    }
    return out;
  }

  function parseInsights(ds) {
    const out = { brandedClickShare: null, additionalSources: {}, queryGroups: [] };
    for (const block of blocksOf(ds)) {
      if (block.length === 2 && block[0] === 1 && typeof block[1] === 'number') {
        out.brandedClickShare = Number(block[1].toFixed(4));
      }
      const pairs = block[0];
      if (
        Array.isArray(pairs) &&
        pairs.length &&
        pairs.every(p => Array.isArray(p) && ADDITIONAL_SOURCES[p[0]] && typeof p[1] === 'number')
      ) {
        for (const [code, clicks] of pairs)
          out.additionalSources[ADDITIONAL_SOURCES[code]] = clicks;
      }
      if (Array.isArray(pairs) && Array.isArray(pairs[0]?.[1]) && pairs[0][0] === null) {
        out.queryGroups = pairs.slice(0, MAX_ROWS).map(group => {
          const metrics = group.find(
            cell => Array.isArray(cell) && typeof cell[0] === 'number' && cell.length <= 3
          );
          return {
            head: group[1]?.[0] ?? null,
            memberCount: group[1]?.length ?? 0,
            clicks: metrics?.[0] ?? null,
            clickDelta: metrics?.[1] ?? null,
            clickDeltaPct: metrics?.[2] ?? null,
          };
        });
      }
    }
    return out;
  }

  function parseLinks(ds) {
    const out = {};
    const top = rows => rows.slice(0, MAX_ROWS).map(row => [row.label, row.value, row.secondary]);
    for (const block of blocksOf(ds)) {
      const config = blockConfig(block);
      const id = rpcId(block);
      if (id === 31) {
        const totals = parseDailySeries(block).pop();
        if (totals) {
          out.asOf = totals.date;
          out.internalLinks = totals.values[0];
          out.externalLinks = totals.values[1];
        }
      } else if (id === 40 && config.includes('"false"')) {
        out.topExternallyLinkedPages = top(parseTable(block));
      } else if (id === 40 && config.includes('"true"')) {
        out.topInternallyLinkedPages = top(parseTable(block));
      } else if (id === 42) {
        out.topLinkingSites = top(parseTable(block));
      } else if (id === 39) {
        const anchors = [];
        walk(block, node => {
          if (typeof node[0] === 'string' && node.length === 1) anchors.push(node[0]);
        });
        out.topAnchors = anchors.filter(anchor => anchor !== SITE).slice(0, MAX_ROWS);
      }
    }
    return out;
  }

  function parseReport(name, ds) {
    const indexingLabels = ['notIndexed', 'indexed', 'impressions'];
    if (name === 'pageIndexing') return parseIssueReport(ds, RPC.indexing, indexingLabels);
    if (name === 'videoIndexing') return parseIssueReport(ds, RPC.videoIndexing, indexingLabels);
    if (name === 'crawlStats') return parseCrawlStats(ds);
    if (name === 'coreWebVitals') return parseCoreWebVitals(ds);
    if (name === 'generativeAi') return parseGenerativeAi(ds);
    if (name === 'insights') return parseInsights(ds);
    if (name === 'links') return parseLinks(ds);
    return parseIssueReport(ds, RPC.enhancement, ['invalid', 'valid']);
  }

  async function run(window) {
    const state = (window.__gscUi = { status: 'running', progress: [], result: null });
    const query = `resource_id=${encodeURIComponent(SITE)}`;
    const load = async (accountPath, path, extra = '') => {
      const url = `${accountPath}/search-console/${path}?${query}${extra}`;
      const response = await window.fetch(url, { credentials: 'include' });
      const html = await response.text();
      return { status: response.status, finalUrl: response.url, ds: splitDs(html) };
    };

    let accountPath = null;
    for (const index of [0, 1, 2, 3, 4]) {
      const probe = await load(`/u/${index}`, 'manual-actions');
      if (!probe.finalUrl.includes('not-verified') && probe.finalUrl.includes(`/u/${index}/`)) {
        accountPath = `/u/${index}`;
        break;
      }
    }
    if (!accountPath) {
      state.status = 'failed';
      state.error = 'No signed-in Google account in this browser can access the property';
      return;
    }

    const result = {
      capturedAt: new Date().toISOString(),
      site: SITE,
      accountPath,
      reports: {},
      gaps: [],
    };
    for (const [name, path] of Object.entries(REPORTS)) {
      try {
        const page = await load(accountPath, path);
        if (page.status !== 200) result.gaps.push(`${name}: HTTP ${page.status}`);
        const parsed = parseReport(name, page.ds);
        if (parsed.issues && (name === 'pageIndexing' || name === 'videoIndexing')) {
          const drill = name === 'pageIndexing' ? 'index/drilldown' : 'video-index/drilldown';
          for (const issue of parsed.issues) {
            if (!issue.count) continue;
            const detail = await load(accountPath, drill, `&item_key=${issue.key}`);
            issue.urls = parseDrilldownUrls(detail.ds);
          }
        }
        result.reports[name] = parsed;
        state.progress.push(`${name}:${page.status}`);
      } catch (error) {
        result.gaps.push(`${name}: ${error.message}`);
      }
    }
    for (const [name, report] of Object.entries(result.reports)) {
      if (
        !Object.values(report).some(value =>
          Array.isArray(value) ? value.length : value && typeof value === 'object'
        )
      ) {
        result.gaps.push(`${name}: no recognized data shape`);
      }
    }

    state.result = result;
    const pre = window.document.createElement('pre');
    pre.textContent = JSON.stringify(result);
    const article = window.document.createElement('article');
    article.append(pre);
    window.document.body.replaceChildren(article);
    state.status = 'done';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      splitDs,
      parseIssues,
      parseIssueReport,
      parseDrilldownUrls,
      parseDailySeries,
      parseTable,
      parseCrawlStats,
      parseCoreWebVitals,
      parseGenerativeAi,
      parseInsights,
      parseLinks,
      pathGroup,
    };
  } else {
    run(root).catch(error => {
      root.__gscUi = { status: 'failed', error: String(error) };
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
('started');
