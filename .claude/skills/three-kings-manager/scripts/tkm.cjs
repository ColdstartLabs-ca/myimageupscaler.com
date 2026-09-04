#!/usr/bin/env node
// Three Kings Manager: per-URL ladder ledger, gate checker, and post-edit monitor.
//
//   check         classify every ledgered URL and judge completed edit windows
//                 node tkm.cjs check --gsc=/tmp/gsc-daily.json --ledger=docs/SEO/maintenance/three-kings-ledger.json
//   record-edit   close a rung and open the 14-day verdict window
//                 node tkm.cjs record-edit --url=/blog/foo --rung=1 --note="new title" --ledger=...
//   record-revert protective rollback after a REGRESSION flag (no ladder advance)
//                 node tkm.cjs record-revert --url=/blog/foo --note="restored prior title" --ledger=...
//   status        print the ledger without GSC data
//
// Ladder: rung 1 = SERP title, rung 2 = meta description, rung 3 = proof-led body.
// Edits are executed via seo-content-3-kings-technique / blog-edit, never by this script.
const fs = require('fs');

const RUNG_FIELDS = { 1: 'seo_title', 2: 'seo_description', 3: 'proof-led body pass' };
const WINDOW_DAYS = 14;
const WIN_THRESHOLD = 1.2;   // post clicks/d >= 1.2x pre  -> WIN
const LOSS_THRESHOLD = 0.8;  // post clicks/d <= 0.8x pre  -> LOSS
const POS_DEGRADE_LIMIT = 2; // position degraded > 2 with no click gain -> LOSS

const shift = (date, days) => { const dt = new Date(date + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + days); return dt.toISOString().slice(0, 10); };

function windowClose(lastEditDate, days = WINDOW_DAYS) {
  return shift(lastEditDate, days);
}

// Pure gate classifier. metrics = { current, prior } 14-day totals: { impressions, clicks, position }.
// Verdicts: EDIT_NOW | HOLD | GATED | STOP | VERDICT.
function classify(entry, metrics, today) {
  const { current, prior } = metrics;
  const win = windowClose(entry.lastEdit, entry.windowDays || WINDOW_DAYS);
  if (entry.stopRule) {
    return { verdict: 'STOP', reason: `stop rule fired ${entry.stopRule.date}: ${entry.stopRule.reason}`, nextRung: null };
  }
  if (today < win) {
    return { verdict: 'HOLD', reason: `verdict window open until ${win} (last edit ${entry.lastEdit})`, nextRung: null };
  }
  const impDelta = prior.impressions ? (current.impressions / prior.impressions - 1) * 100 : null;
  const posDelta = prior.position ? current.position - prior.position : null;
  const ctr = current.impressions ? current.clicks / current.impressions : 0;
  // Order matters: junk-position bloat first — at position > 30 a numerically stable
  // position is still junk, and must not be misread as a benign demand change.
  if (impDelta !== null && impDelta > 40 && current.position > 30) {
    return { verdict: 'GATED', reason: `junk-position bloat: impressions +${impDelta.toFixed(0)}% at pos ${current.position.toFixed(1)}`, nextRung: null };
  }
  if (impDelta !== null && Math.abs(impDelta) > 40 && posDelta !== null && Math.abs(posDelta) < 1.5 && current.position <= 30) {
    return { verdict: 'GATED', reason: `demand change: impressions ${impDelta > 0 ? '+' : ''}${impDelta.toFixed(0)}% with position stable (${prior.position.toFixed(1)}→${current.position.toFixed(1)}) — no edit`, nextRung: null };
  }
  if (current.impressions > 5000 && ctr < 0.001 && current.position >= 8 && current.position <= 12) {
    return { verdict: 'GATED', reason: `phantom/SERP-feature signature: CTR ${(ctr * 100).toFixed(3)}% at pos ${current.position.toFixed(1)} — inspect SERP, do not edit`, nextRung: null };
  }
  const nextRung = (entry.rung || 0) + 1;
  if (nextRung > 3) {
    return { verdict: 'VERDICT', reason: `all 3 rungs complete (last ${entry.lastEdit}); judge with gsc-causation-correlation pre/post windows, then restart the ladder only with new evidence`, nextRung: null };
  }
  return { verdict: 'EDIT_NOW', reason: `window closed ${win}; next rung: ${nextRung} (${RUNG_FIELDS[nextRung]})`, nextRung };
}

function dailySeries(rows) {
  const byDay = new Map();
  for (const r of rows || []) {
    const d = r.keys[0];
    const cur = byDay.get(d) || { clicks: 0, impressions: 0 };
    cur.clicks += r.clicks; cur.impressions += r.impressions;
    byDay.set(d, cur);
  }
  return byDay;
}

// Window totals with weighted position, aggregated across multi-URL rows per day.
function windowStats(rows, end, days) {
  const series = dailySeries(rows);
  let clicks = 0, imps = 0, daysSeen = 0;
  let d = shift(end, -(days - 1));
  while (d <= end) {
    const v = series.get(d);
    if (v) { clicks += v.clicks; imps += v.impressions; daysSeen++; }
    d = shift(d, 1);
  }
  if (!daysSeen || !imps) return null;
  const rowsInWindow = (rows || []).filter((r) => r.keys[0] >= shift(end, -(days - 1)) && r.keys[0] <= end);
  const pos = rowsInWindow.reduce((a, r) => a + r.position * r.impressions, 0) / imps;
  return { impressions: imps, clicks, position: pos };
}

// Judge every completed edit window once: WIN / FLAT / LOSS, written back to the ledger.
// A LOSS on the most recent edit raises the REGRESSION flag (rollback recommendation).
function judgeEdits(entry, rows, dataEnd) {
  const wd = entry.windowDays || WINDOW_DAYS;
  for (const h of entry.history) {
    if (h.outcome) continue;
    const postEnd = shift(h.date, wd - 1);
    if (dataEnd < postEnd) continue; // window not complete in this export
    const pre = windowStats(rows, shift(h.date, -1), wd);
    const post = windowStats(rows, postEnd, wd);
    if (!pre || !post) continue;
    const preCpd = pre.clicks / wd;
    const postCpd = post.clicks / wd;
    let verdict = 'FLAT';
    if (preCpd === 0 && postCpd > 0) verdict = 'WIN';
    else if (preCpd > 0 && postCpd >= preCpd * WIN_THRESHOLD) verdict = 'WIN';
    else if (preCpd > 0 && postCpd <= preCpd * LOSS_THRESHOLD) verdict = 'LOSS';
    const posDeg = post.position - pre.position;
    const impDelta = pre.impressions ? (post.impressions / pre.impressions - 1) * 100 : null;
    if (verdict !== 'LOSS' && posDeg > POS_DEGRADE_LIMIT && postCpd <= preCpd) verdict = 'LOSS';
    h.outcome = { verdict, preCpd: +preCpd.toFixed(2), postCpd: +postCpd.toFixed(2), posDelta: +posDeg.toFixed(1), impDelta: impDelta === null ? null : +impDelta.toFixed(0), measuredThrough: postEnd };
  }
  const judged = entry.history.filter((h) => h.outcome);
  const latest = entry.history[entry.history.length - 1];
  return { judged: judged.length, latestOutcome: latest?.outcome?.verdict || null };
}

function loadLedger(path) {
  if (!fs.existsSync(path)) throw new Error(`ledger not found: ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function saveLedger(path, ledger) {
  fs.writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=');
    out[k] = rest.join('=');
  }
  return out;
}

function cmdCheck(args) {
  const ledger = loadLedger(args.ledger);
  const data = JSON.parse(fs.readFileSync(args.gsc, 'utf8'));
  const today = args.date || data.end;
  const report = [];
  let ledgerDirty = false;
  for (const entry of ledger.entries) {
    const rows = data.pages[entry.label];
    if (!rows || !rows.length) { report.push({ url: entry.url, verdict: 'NO_DATA', reason: 'no series in export' }); continue; }
    const { judged, latestOutcome } = judgeEdits(entry, rows, data.end);
    if (judged) ledgerDirty = true;
    const current = windowStats(rows, data.end, 14);
    const prior = windowStats(rows, shift(data.end, -14), 14);
    if (!current || !prior) { report.push({ url: entry.url, verdict: 'NO_DATA', reason: 'insufficient window data' }); continue; }
    const v = classify(entry, { current, prior }, today);
    const row = { url: entry.url, rung: entry.rung, lastEdit: entry.lastEdit, current14: `${current.clicks.toFixed(0)}c/${current.impressions.toFixed(0)}i pos ${current.position.toFixed(1)}`, prior14: `${prior.clicks.toFixed(0)}c pos ${prior.position.toFixed(1)}`, ...v };
    if (latestOutcome === 'LOSS') {
      const latest = entry.history[entry.history.length - 1];
      row.verdict = 'REGRESSION';
      row.reason = `latest edit ${latest.date} (${latest.field}) judged LOSS: ${latest.outcome.preCpd.toFixed(2)}→${latest.outcome.postCpd.toFixed(2)} clicks/d, pos ${latest.outcome.posDelta > 0 ? '+' : ''}${latest.outcome.posDelta}. Rollback: restore the prior ${latest.field} (from backups/blog API), then run record-revert. Do not re-edit for 14 days.`;
    }
    report.push(row);
  }
  if (ledgerDirty) saveLedger(args.ledger, ledger);
  console.log(`# Three Kings Manager — check ${today} (data through ${data.end})\n`);
  const displayRank = { REGRESSION: -1, EDIT_NOW: 0, VERDICT: 1, HOLD: 2, GATED: 3, STOP: 4, NO_DATA: 5 };
  for (const r of report.sort((a, b) => displayRank[a.verdict] - displayRank[b.verdict])) {
    console.log(`[${r.verdict}] ${r.url}${r.rung ? ` (rung ${r.rung})` : ''}`);
    console.log(`  ${r.reason || ''}`);
    if (r.current14) console.log(`  last 14d: ${r.current14} | prior 14d: ${r.prior14}`);
  }
  const by = (v) => report.filter((r) => r.verdict === v).length;
  console.log(`\nREGRESSION: ${by('REGRESSION')} | EDIT_NOW: ${by('EDIT_NOW')} | HOLD: ${by('HOLD')} | GATED: ${by('GATED')} | STOP: ${by('STOP')} | VERDICT: ${by('VERDICT')} | NO_DATA: ${by('NO_DATA')}`);
  return report;
}

function findEntry(ledger, url) {
  const entry = ledger.entries.find((e) => e.url === url);
  if (!entry) throw new Error(`no ledger entry for ${url}`);
  return entry;
}

function cmdRecordEdit(args) {
  const ledger = loadLedger(args.ledger);
  const entry = ledger.entries.find((e) => e.url === args.url);
  if (!entry) throw new Error(`no ledger entry for ${args.url}`);
  if (entry.stopRule) throw new Error(`stop rule active for ${entry.url}: ${entry.stopRule.reason}`);
  const date = args.date || new Date().toISOString().slice(0, 10);
  const rung = parseInt(args.rung, 10);
  if (![1, 2, 3].includes(rung)) throw new Error('--rung must be 1 (title), 2 (meta), or 3 (body)');
  if (date < windowClose(entry.lastEdit, entry.windowDays || WINDOW_DAYS)) {
    throw new Error(`window still open until ${windowClose(entry.lastEdit, entry.windowDays || WINDOW_DAYS)}; same-page edits must wait ${WINDOW_DAYS} days`);
  }
  if (rung !== entry.rung + 1) throw new Error(`ladder violation: next rung for ${entry.url} is ${entry.rung + 1}, not ${rung}`);
  entry.rung = rung;
  entry.lastEdit = date;
  const row = { date, rung, field: RUNG_FIELDS[rung], note: args.note || '', outcome: null };
  if (args.previous) row.previousValue = args.previous; // rollback anchor for REGRESSION flags
  entry.history.push(row);
  saveLedger(args.ledger, ledger);
  console.log(`recorded: ${entry.url} rung ${rung} (${RUNG_FIELDS[rung]}) on ${date}; window closes ${windowClose(date)}`);
}

function cmdRecordRevert(args) {
  const ledger = loadLedger(args.ledger);
  const entry = ledger.entries.find((e) => e.url === args.url);
  if (!entry) throw new Error(`no ledger entry for ${args.url}`);
  const date = args.date || new Date().toISOString().slice(0, 10);
  entry.lastEdit = date;
  entry.history.push({ date, rung: entry.rung, field: 'rollback', note: args.note || '', outcome: null });
  saveLedger(args.ledger, ledger);
  console.log(`revert recorded: ${entry.url} on ${date}; cooling-off window closes ${windowClose(date)}`);
}

function cmdStatus(args) {
  const ledger = loadLedger(args.ledger);
  for (const e of ledger.entries) {
    const win = windowClose(e.lastEdit, e.windowDays || WINDOW_DAYS);
    const outcomes = e.history.map((h) => (h.outcome ? `${h.date}:${h.outcome.verdict}` : `${h.date}:pending`)).join(' ');
    console.log(`[${e.stopRule ? 'STOP' : 'LEDGERED'}] ${e.url} rung=${e.rung} lastEdit=${e.lastEdit} windowCloses=${win}${e.stopRule ? ` (${e.stopRule.reason})` : ''}`);
    console.log(`  edits: ${outcomes}`);
  }
}

const commands = { check: cmdCheck, 'record-edit': cmdRecordEdit, 'record-revert': cmdRecordRevert, status: cmdStatus };

if (require.main === module) {
  const cmd = process.argv[2];
  if (!commands[cmd]) {
    console.error('usage: tkm.cjs <check|record-edit|record-revert|status> [--gsc=...] [--ledger=...] [--url=...] [--rung=...] [--note=...] [--date=YYYY-MM-DD]');
    process.exit(1);
  }
  commands[cmd](parseArgs(process.argv.slice(3)));
}

module.exports = { classify, judgeEdits, windowClose, dailySeries, windowStats, cmdRecordEdit, cmdRecordRevert, RUNG_FIELDS, WINDOW_DAYS };