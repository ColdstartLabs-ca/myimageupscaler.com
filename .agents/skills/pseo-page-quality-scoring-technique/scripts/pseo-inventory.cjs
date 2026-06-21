#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dataDir = path.join(root, "app/seo/data");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function routeForFamily(family, slug) {
  const map = {
    comparison: "compare",
    "format-conversion": "tools/convert",
    "interactive-tools": "tools",
  };
  const routeFamily = map[family] || family;
  return `/${routeFamily}/${slug}`.replace(/\/+/g, "/");
}

function inferIntent(family, page) {
  const text = [
    family,
    page.primaryKeyword,
    page.metaTitle,
    page.title,
    page.ctaText,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/price|pricing|alternative|vs|compare|comparison/.test(text)) return "comparison";
  if (/tool|upscale|resize|compress|convert|remove|enhance|sharpen|restore/.test(text)) return "tool";
  if (/guide|how|what|why|tutorial/.test(text)) return "informational";
  return "landing-page";
}

function uniqueFieldCount(page) {
  const fields = [
    "uniqueIntro",
    "expandedDescription",
    "pageSpecificDetails",
    "technicalSpecs",
    "useCases",
    "benefits",
    "features",
    "faq",
    "commonQuestions",
    "externalSources",
    "beforeAfterImages",
  ];
  return fields.filter((field) => {
    const value = page[field];
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return String(value).trim().length > 0;
  }).length;
}

function main() {
  if (!fs.existsSync(dataDir)) {
    console.error(`Missing data dir: ${dataDir}`);
    process.exit(1);
  }

  const inventory = [];
  for (const file of fs.readdirSync(dataDir).filter((name) => name.endsWith(".json")).sort()) {
    const family = file.replace(/\.json$/, "");
    const fullPath = path.join(dataDir, file);
    const data = readJson(fullPath);
    const pages = Array.isArray(data.pages) ? data.pages : [];

    for (const page of pages) {
      if (!page || !page.slug) continue;
      inventory.push({
        url: routeForFamily(family, page.slug),
        family,
        templateHint: `${family} template`,
        slug: page.slug,
        intent: inferIntent(family, page),
        primaryKeyword: page.primaryKeyword || null,
        secondaryKeywordCount: Array.isArray(page.secondaryKeywords) ? page.secondaryKeywords.length : 0,
        uniqueFieldCount: uniqueFieldCount(page),
        hasFaq: Array.isArray(page.faq) && page.faq.length > 0,
        hasCta: Boolean(page.ctaText || page.ctaUrl),
        ctaText: page.ctaText || null,
        ctaUrl: page.ctaUrl || null,
        lastUpdated: page.lastUpdated || data.meta?.lastUpdated || data.meta?.updatedAt || null,
        sourceFile: path.relative(root, fullPath),
      });
    }
  }

  const families = {};
  for (const item of inventory) {
    families[item.family] ||= { pages: 0, withCta: 0, withFaq: 0, avgUniqueFieldCount: 0 };
    families[item.family].pages += 1;
    families[item.family].withCta += item.hasCta ? 1 : 0;
    families[item.family].withFaq += item.hasFaq ? 1 : 0;
    families[item.family].avgUniqueFieldCount += item.uniqueFieldCount;
  }
  for (const family of Object.keys(families)) {
    families[family].avgUniqueFieldCount = Number((families[family].avgUniqueFieldCount / families[family].pages).toFixed(2));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalPages: inventory.length,
    families,
    inventory,
  };

  const outArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outArg) {
    const out = outArg.split("=")[1];
    fs.writeFileSync(out, JSON.stringify(output, null, 2));
    console.error(`[pSEO inventory] Wrote ${inventory.length} pages to ${out}`);
  } else {
    process.stdout.write(JSON.stringify(output, null, 2));
  }
}

main();
