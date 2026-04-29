const { chromium } = require('playwright');

async function scrape(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // This is a generic extractor. We'll refine it based on the site structure.
    const listings = await page.evaluate(() => {
      const items = [];
      // Common patterns for real estate sites: cards, articles, or specific classes
      const cards = document.querySelectorAll('[class*="card"], [class*="item"], article');
      
      cards.forEach(card => {
        const link = card.querySelector('a')?.href;
        const priceText = card.innerText.match(/(R\$|Real)\s?([\d.]+)/i)?.[0];
        const areaText = card.innerText.match(/(\d+)\s?m²/i)?.[0];
        
        if (link) {
          items.push({
            url: link,
            price: priceText || 'N/A',
            area: areaText || 'N/A',
            text: card.innerText.substring(0, 200).replace(/\n/g, ' ')
          });
        }
      });
      return items;
    });
    
    await browser.close();
    return listings;
  } catch (e) {
    console.error(`Error scraping ${url}: ${e.message}`);
    await browser.close();
    return [];
  }
}

(async () => {
  const urls = [
    'https://imovelgrandevitoria.com.br/imoveis/a-venda/serra-es/parque-residencial-laranjeiras',
    'https://imovelgrandevitoria.com.br/imoveis/a-venda/serra-es/laranjeiras',
    'https://imovelgrandevitoria.com.br/imoveis/a-venda/vitoria-es',
    'https://imovelgrandevitoria.com.br/imoveis/a-venda/vila-velha-es'
  ];

  const allResults = [];
  for (const url of urls) {
    const results = await scrape(url);
    allResults.push(...results);
  }

  console.log(JSON.stringify(allResults, null, 2));
})();
