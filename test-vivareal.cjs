const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test Viva Real
  try {
    await page.goto('https://www.vivareal.com.br/venda/espirito-santo/serra/bairros/laranjeiras/casa_residencial/', 
      { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    const url = page.url();
    const blocked = await page.$('text=Verifique se você é humano') || 
                    await page.$('text=Just a moment') ||
                    await page.$('#challenge-form');
    console.log(`Viva Real: ${blocked ? 'BLOCKED (Cloudflare)' : 'OK'} - Title: ${title}`);
    console.log(`URL: ${url}`);
    
    // Get first listing link
    const links = await page.$$eval('a[href*="/imovel/"]', els => els.slice(0,3).map(e => e.href));
    console.log(`Found ${links.length} listing links`);
    links.forEach(l => console.log(`  ${l}`));
  } catch(e) {
    console.log(`Viva Real: ERROR - ${e.message}`);
  }
  
  await browser.close();
})();
