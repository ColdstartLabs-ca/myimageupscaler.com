#!/usr/bin/env node

import fs from 'fs';
import dns from 'dns/promises';
import { spawn } from 'child_process';

// Top keywords from your CSV (focused on high-search-volume terms)
const TOP_KEYWORDS = [
  'image upscaler',
  'ai photo enhancer',
  'ai image enhancer',
  'ai image upscaler',
  'ai upscale',
  'photo quality enhancer',
  'upscale image',
  'image quality enhancer',
  'ai enhance image',
  'image resolution enhancer',
  'ai image enlarger',
  'photo enhancer',
  'image enlarger',
  'enhance image quality',
  'upscaler',
  'enhance photo',
  'photo enhancer ai',
  'image enhancer ai',
  'ai increase resolution',
  'upre image',
  'ai to improve image quality',
  'pixel perfect',
  'image ai',
  'photo ai',
  'enhance ai',
  'resolution ai',
  'quality ai',
  'upscale ai',
  'enhancer pro',
  'upscaler pro',
  'image pro',
  'photo pro'
];

// Domain extensions to check
const EXTENSIONS = ['.com', '.io', '.app', '.ai', '.co', '.dev', '.tech', '.tools', '.pro'];

// Template patterns for domain suggestions
const DOMAIN_PATTERNS = [
  (keyword) => keyword.replace(/\s+/g, '').toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, 'ai').toLowerCase(),
  (keyword) => `get${keyword.replace(/\s+/g, '')}`.toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, 'pro').toLowerCase(),
  (keyword) => `my${keyword.replace(/\s+/g, '')}`.toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, '').replace('image', 'img').toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, '').replace('photo', 'pic').toLowerCase(),
  (keyword) => keyword.replace('ai ', '').replace(/\s+/g, '').toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}hq`.toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}lab`.toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}studio`.toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}online`.toLowerCase(),
  (keyword) => `the${keyword.replace(/\s+/g, '')}`.toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, 'x').toLowerCase(),
  (keyword) => keyword.replace(/\s+/g, 'ify').toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}now`.toLowerCase(),
  (keyword) => `pix${keyword.replace(/\s+/g, '')}`.toLowerCase(),
  (keyword) => `${keyword.replace(/\s+/g, '')}plus`.toLowerCase()
];

function generateDomainSuggestions() {
  const domains = new Set();

  TOP_KEYWORDS.forEach(keyword => {
    DOMAIN_PATTERNS.forEach(pattern => {
      const domain = pattern(keyword);
      if (domain.length > 3 && domain.length < 20) {
        EXTENSIONS.forEach(ext => {
          domains.add(domain + ext);
        });
      }
    });
  });

  return Array.from(domains);
}

async function checkDomainAvailabilityDNS(domain) {
  try {
    // Try to resolve the domain - if it resolves, it's taken
    const addresses = await dns.resolve4(domain);
    return {
      domain,
      available: false,
      reason: `DNS resolves to: ${addresses.slice(0, 2).join(', ')}${addresses.length > 2 ? ` (+${addresses.length - 2} more)` : ''}`
    };
  } catch (error) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
      return {
        domain,
        available: true,
        reason: 'No DNS records found'
      };
    } else {
      return {
        domain,
        available: 'unknown',
        reason: `DNS error: ${error.code}`
      };
    }
  }
}

async function checkDomainAvailabilityWHOIS(domain) {
  return new Promise((resolve) => {
    const whois = spawn('whois', [domain]);
    let output = '';
    let errorOutput = '';

    whois.stdout.on('data', (data) => {
      output += data.toString();
    });

    whois.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    whois.on('close', (code) => {
      const available = isDomainAvailable(output, errorOutput, domain);
      resolve({
        domain,
        available,
        reason: available ? getAvailableReason(output, errorOutput) : getTakenReason(output)
      });
    });

    setTimeout(() => {
      whois.kill();
      resolve({
        domain,
        available: 'unknown',
        reason: 'Timeout - checking failed'
      });
    }, 10000);
  });
}

function isDomainAvailable(output, errorOutput, domain) {
  const outputLower = output.toLowerCase();
  const errorLower = errorOutput.toLowerCase();

  const availableIndicators = [
    'no match for domain',
    'domain not found',
    'no entries found',
    'not found',
    'status: free',
    'status: available',
    'no data found',
    'domain status: no object',
    'object does not exist'
  ];

  for (const indicator of availableIndicators) {
    if (outputLower.includes(indicator) || errorLower.includes(indicator)) {
      return true;
    }
  }

  const takenIndicators = [
    'creation date',
    'registrant',
    'registrar',
    'registry domain id',
    'domain status: client',
    'status: connect',
    'status: active',
    'registered on',
    'expires on'
  ];

  for (const indicator of takenIndicators) {
    if (outputLower.includes(indicator)) {
      return false;
    }
  }

  return 'unknown';
}

function getAvailableReason(output, errorOutput) {
  if (errorOutput.includes('no match for domain')) return 'No match found';
  if (output.includes('domain not found')) return 'Domain not found';
  if (output.includes('status: free')) return 'Status: Free';
  if (output.includes('status: available')) return 'Status: Available';
  return 'Available';
}

function getTakenReason(output) {
  const outputLower = output.toLowerCase();

  if (outputLower.includes('creation date')) {
    const match = output.match(/creation date:\s*(.+)/i);
    if (match) return `Created: ${match[1].trim()}`;
  }

  if (outputLower.includes('registered on')) {
    const match = output.match(/registered on:\s*(.+)/i);
    if (match) return `Registered: ${match[1].trim()}`;
  }

  if (outputLower.includes('registrar')) {
    const match = output.match(/registrar:\s*(.+)/i);
    if (match) return `Registrar: ${match[1].trim()}`;
  }

  return 'Taken';
}

async function checkDomainAvailability(domain) {
  // Try DNS first (fast and reliable)
  const dnsResult = await checkDomainAvailabilityDNS(domain);

  if (dnsResult.available === true) {
    return dnsResult;
  } else if (dnsResult.available === false) {
    return dnsResult;
  }

  // If DNS check is inconclusive, try WHOIS if available
  try {
    return await checkDomainAvailabilityWHOIS(domain);
  } catch (error) {
    return {
      domain,
      available: 'unknown',
      reason: 'WHOIS unavailable'
    };
  }
}

async function checkDomainsBatch(domains, batchSize = 10) {
  const results = [];
  console.log(`\n🔍 Checking ${domains.length} domains in batches of ${batchSize}...\n`);

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchPromises = batch.map(domain => checkDomainAvailability(domain));

    process.stdout.write(`\r📊 Progress: ${Math.min(i + batchSize, domains.length)}/${domains.length} (${Math.round(Math.min(i + batchSize, domains.length) / domains.length * 100)}%)`);

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay to be respectful
    if (i + batchSize < domains.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n');
  return results;
}

function displayResults(results) {
  const available = results.filter(r => r.available === true);
  const taken = results.filter(r => r.available === false);
  const unknown = results.filter(r => r.available === 'unknown');

  console.log('\n🎉 === AVAILABLE DOMAINS ===');
  if (available.length === 0) {
    console.log('❌ No available domains found in this batch');
  } else {
    available.forEach((result, index) => {
      console.log(`✅ ${index + 1}. ${result.domain} - ${result.reason}`);
    });
  }

  console.log('\n💼 === TOP RECOMMENDATIONS ===');
  const recommendations = available
    .filter(d => d.domain.endsWith('.com') || d.domain.endsWith('.io') || d.domain.endsWith('.ai') || d.domain.endsWith('.app'))
    .slice(0, 15);

  if (recommendations.length > 0) {
    recommendations.forEach((result, index) => {
      console.log(`⭐ ${index + 1}. ${result.domain}`);
    });
  } else if (available.length > 0) {
    available.slice(0, 10).forEach((result, index) => {
      console.log(`⭐ ${index + 1}. ${result.domain}`);
    });
  } else {
    console.log('❌ No recommended domains available');
  }

  console.log('\n📊 === SUMMARY ===');
  console.log(`✅ Available: ${available.length}`);
  console.log(`❌ Taken: ${taken.length}`);
  console.log(`❓ Unknown: ${unknown.length}`);
  console.log(`📈 Success Rate: ${results.length > 0 ? Math.round(available.length / results.length * 100) : 0}%`);

  // Show best available domains
  const bestAvailable = available
    .filter(d => d.domain.length <= 12 && (d.domain.endsWith('.com') || d.domain.endsWith('.io') || d.domain.endsWith('.ai')))
    .slice(0, 5);

  if (bestAvailable.length > 0) {
    console.log('\n🏆 === BEST AVAILABLE DOMAINS ===');
    bestAvailable.forEach((result, index) => {
      console.log(`🎯 ${index + 1}. ${result.domain} (short & premium extension)`);
    });
  }
}

function saveResults(results, filename = 'domain-check-results.json') {
  const timestamp = new Date().toISOString().split('T')[0];
  const fullFilename = `domain-check-${timestamp}-${filename}`;

  fs.writeFileSync(fullFilename, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${fullFilename}`);
}

async function main() {
  console.log('🚀 PixelPerfect Domain Availability Checker (DNS + WHOIS)');
  console.log('=======================================================\n');

  console.log('📝 Generating domain suggestions from top keywords...');
  const domains = generateDomainSuggestions();
  console.log(`✨ Generated ${domains.length} potential domains\n`);

  // Get priority domains first
  const priorityExtensions = ['.com', '.io', '.ai', '.app'];
  const priorityDomains = domains
    .filter(d => priorityExtensions.some(ext => d.endsWith(ext)))
    .filter(d => d.replace(/\.(com|io|ai|app)/, '').length <= 15)
    .slice(0, 100);

  console.log(`🎯 Checking ${priorityDomains.length} high-priority domains...\n`);

  const results = await checkDomainsBatch(priorityDomains);

  displayResults(results);
  saveResults(results);

  console.log('\n🏁 Domain checking complete!');
  console.log('\n💡 Tips:');
  console.log('   • .com domains are most valuable');
  console.log('   • .ai is perfect for AI tools like PixelPerfect');
  console.log('   • .io works well for tech products');
  console.log('   • .app is good for web applications');
  console.log('   • Shorter names are easier to remember');
  console.log('   • Consider brandability over keyword density');
  console.log('\n🔧 Note: DNS checking shows if a domain is actively hosted,');
  console.log('   but some purchased domains may not have DNS records yet.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  generateDomainSuggestions,
  checkDomainAvailability,
  checkDomainsBatch
};