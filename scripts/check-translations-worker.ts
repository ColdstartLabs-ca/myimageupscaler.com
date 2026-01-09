#!/usr/bin/env node
/**
 * Translation fixer for German locale files
 * Identifies and fixes common mixed English/German translation patterns
 */

import fs from 'fs';
import path from 'path';

// Common mixed translation patterns to fix
const patterns = [
  // English phrases that should be German
  { from: 'Format Explained:', to: 'Format erklärt:' },
  { from: 'Complete Guide', to: 'Vollständiger Leitfaden' },
  { from: 'Complete Leitfaden', to: 'Vollständiger Leitfaden' },
  { from: 'Master', to: 'Meistern Sie' },
  { from: ' covering ', to: ' die ' },
  { from: 'war ist', to: 'Was ist' },
  { from: 'work mit', to: 'arbeiten mit' },
  { from: 'hinein', to: 'in' },
  { from: 'Upscalen', to: 'skalieren' },
  { from: 'upscale', to: 'skalieren' },
  { from: 'Enhancement', to: 'Verbesserung' },
  { from: 'Verbessern', to: 'Verbessern Sie' },
  { from: 'Am besten', to: 'Am besten' },
  { from: 'der/die/das', to: 'das' },
  { from: ' ein/eine ', to: ' ' },
  { from: 'Format:', to: 'Format:' },
  { from: 'Guide', to: 'Leitfaden' },
  { from: 'Best Practices', to: 'Bewährte Verfahren' },
  { from: 'best practices', to: 'bewährte Verfahren' },
  { from: 'Understanding', to: 'Verstehen' },
  { from: 'explained', to: 'erklärt' },
  { from: 'Explained', to: 'Erklärt' },
  { from: 'used by', to: 'verwendet von' },
  { from: 'Learn how', to: 'Lernen Sie, wie' },
  { from: 'Try free', to: 'Kostenlos testen' },
  { from: 'Professional', to: 'Professionell' },
  { from: 'Advanced', to: 'Fortgeschritten' },
  { from: 'Essential', to: 'Wesentlich' },
  { from: 'Recommended', to: 'Empfohlen' },
  { from: 'Optimal', to: 'Optimal' },
  { from: 'Suitable', to: 'Geeignet' },
  { from: 'Available', to: 'Verfügbar' },
  { from: 'Compatible', to: 'Kompatibel' },
];

function fixTranslation(content) {
  let fixed = content;
  let fixCount = 0;

  patterns.forEach(pattern => {
    const regex = new RegExp(pattern.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = fixed.match(regex);
    if (matches) {
      fixCount += matches.length;
      fixed = fixed.replace(regex, pattern.to);
    }
  });

  return { content: fixed, fixCount };
}

function processFile(filePath) {
  console.log(`Processing: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const { content: fixed, fixCount } = fixTranslation(content);

  if (fixCount > 0) {
    console.log(`  Fixed ${fixCount} occurrences`);
    fs.writeFileSync(filePath, fixed, 'utf8');
    return fixCount;
  } else {
    console.log('  No fixes needed');
    return 0;
  }
}

function main() {
  const localeDir = path.join(__dirname, '../locales/de');
  const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.json'));

  console.log(`Found ${files.length} German locale files\n`);

  let totalFixes = 0;
  files.forEach(file => {
    const filePath = path.join(localeDir, file);
    totalFixes += processFile(filePath);
  });

  console.log(`\nTotal fixes applied: ${totalFixes}`);
}

if (require.main === module) {
  main();
}

module.exports = { fixTranslation };
