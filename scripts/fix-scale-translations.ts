#!/usr/bin/env tsx
/**
 * Fix Portuguese translation for scale.json
 * Compares English and Portuguese versions, fixes mixed language content
 */

import fs from 'fs';

// Read files
const enContent = fs.readFileSync(
  '/home/joao/projects/pixelperfect/locales/en/scale.json',
  'utf-8'
);
const ptContent = fs.readFileSync(
  '/home/joao/projects/pixelperfect/locales/pt/scale.json',
  'utf-8'
);

const enData = JSON.parse(enContent);
const ptData = JSON.parse(ptContent);

// Translation map for common terms
const translations: Record<string, string> = {
  // Common phrases
  'Upscale To': 'Ampliar Para',
  'Upscale Images to': 'Ampliar Imagens Para',
  Upscale: 'Ampliar',
  'Enhance your images to': 'Melhore suas imagens para',
  'Transform your images to': 'Transforme suas imagens para',
  'Transform your images with': 'Transforme suas imagens com',
  'Enhance your images by': 'Melhore suas imagens',
  Enhance: 'Melhore',
  Transform: 'Transforme',
  Increase: 'Aumente',
  Double: 'Dobre',
  Quadruple: 'Quadruplique',
  Resolution: 'Resolução',
  resolution: 'resolução',
  'with AI': 'com IA',
  'with AI-powered': 'com tecnologia de IA',
  'with advanced AI': 'com IA avançada',
  'with our': 'com nosso',
  'Perfect for': 'Perfeito para',
  'Perfeito para': 'Perfeito para',
  Perfect: 'Perfeito',
  professional: 'profissional',
  Professional: 'Profissional',
  Quality: 'Qualidade',
  quality: 'qualidade',
  stunning: 'impressionante',
  breathtaking: 'deslumbrante',
  images: 'imagens',
  image: 'imagem',
  pictures: 'fotos',
  photos: 'fotos',
  pixel: 'pixel',
  pixels: 'pixels',
  upscaling: 'ampliação',
  upscale: 'ampliar',
  'modern displays': 'telas modernas',
  'large prints': 'impressões grandes',
  'large format printing': 'impressão em grande formato',
  'digital presentations': 'apresentações digitais',
  'cinema-quality': 'qualidade de cinema',
  'future-proof': 'à prova de futuro',
  'print at large sizes': 'imprimir em grandes tamanhos',
  crisp: 'nítido',
  'ultra-high': 'ultra alta',
  'high detail': 'alto detalhe',
  'maximum detail': 'detalhe máximo',
  'professional standard': 'padrão profissional',
  'professional photography': 'fotografia profissional',
  'cinema production': 'produção cinematográfica',
  'architectural visualization': 'visualização arquitetônica',
  'ultra high definition': 'ultra alta definição',
  'web-optimized': 'otimizado para web',
  'fast processing': 'processamento rápido',
  'universal compatibility': 'compatibilidade universal',
  'sweet spot': 'ponto ideal',
  'massive file sizes': 'tamanhos de arquivo massivos',
  'target resolution': 'resolução alvo',
  'works perfectly': 'funciona perfeitamente',
  'virtually all': 'praticamente todas',
  'supported everywhere': 'suportado em todos os lugares',
  'what is': 'o que é',
  "what's the difference": 'qual é a diferença',
  'can i': 'posso eu',
  'will my': 'minha',
  'how long does it take': 'quanto tempo leva',
  typically: 'tipicamente',
  'depending on': 'dependendo de',
  larger: 'maiores',
  'slightly longer': 'ligeiramente mais',
  exactly: 'exatamente',
  'times more': 'vezes mais',
  'times the': 'vezes a',
  'also called': 'também chamado',
  'comes from': 'vem de',
  approximately: 'aproximadamente',
  horizontal: 'horizontal',
  however: 'no entanto',
  'starting with': 'começando com',
  'higher quality': 'maior qualidade',
  'source images': 'imagens de origem',
  'yield better': 'produzir melhores',
  below: 'abaixo de',
  'may show': 'podem mostrar',
  'some artifacts': 'alguns artefatos',
  'when scaled': 'quando escaladas',
  'look good': 'parecer bom',
  'look excellent': 'parecer excelente',
  automatically: 'automaticamente',
  downscaled: 'reduzida',
  'looking great': 'parecendo ótimo',
  lower: 'inferior',
  "it's better": 'é melhor',
  'to have': 'ter',
  'and scale down': 'e reduzir',
  'than the opposite': 'do que o oposto',
  is: 'é',
  are: 'são',
  for: 'para',
  with: 'com',
  and: 'e',
  or: 'ou',
  the: 'o/a',
  a: 'um/uma',
  an: 'um/uma',
  to: 'para',
  of: 'de',
  in: 'em',
  at: 'em',
  on: 'em',
  from: 'de',
  by: 'por',
  about: 'sobre',
  as: 'como',
  into: 'em',
  over: 'sobre',
  between: 'entre',
  during: 'durante',
  including: 'incluindo',
  until: 'até',
  while: 'enquanto',
  without: 'sem',
  within: 'dentro de',
  upon: 'sobre',
  besides: 'além de',
  through: 'através de',
  towards: 'em direção a',
  concerning: 'sobre',
  regarding: 'sobre',
  via: 'via',
  plus: 'mais',
  vs: 'versus',
  versus: 'versus',
};

// Common mixed patterns to fix
const mixedPatterns = [
  { pattern: /your image(n)?s?/gi, replacement: 'suas imagens' },
  { pattern: /your foto(s)?/gi, replacement: 'suas fotos' },
  { pattern: /your imagem/gi, replacement: 'sua imagem' },
  { pattern: /your imagemns/gi, replacement: 'suas imagens' },
  { pattern: /to 4K resolução/gi, replacement: 'para resolução 4K' },
  { pattern: /to HD resolução/gi, replacement: 'para resolução HD' },
  { pattern: /to Full HD resolução/gi, replacement: 'para resolução Full HD' },
  { pattern: /to 8K resolução/gi, replacement: 'para resolução 8K' },
  { pattern: /to 2K resolução/gi, replacement: 'para resolução 2K' },
  { pattern: /imagemns/gi, replacement: 'imagens' },
  { pattern: /imagemm/gi, replacement: 'imagem' },
  { pattern: /telas, and/gi, replacement: 'telas e' },
  { pattern: /, and /gi, replacement: ' e ' },
  { pattern: /\sand\s/gi, replacement: ' e ' },
  { pattern: /\bwith\b/gi, replacement: 'com' },
  { pattern: /\bfor\b/gi, replacement: 'para' },
  { pattern: /\bThe\b/gi, replacement: 'O' },
  { pattern: /\bthe\b/gi, replacement: 'o' },
  { pattern: /\bof\b/gi, replacement: 'de' },
  { pattern: /\bin\b/gi, replacement: 'em' },
  { pattern: /\bat\b/gi, replacement: 'em' },
  { pattern: /\bto\b/gi, replacement: 'para' },
  { pattern: /\bis\b/gi, replacement: 'é' },
  { pattern: /\bare\b/gi, replacement: 'são' },
  { pattern: /ampliador\b/gi, replacement: 'ampliador' },
];

function translateText(text: string): string {
  let result = text;

  // Apply mixed pattern fixes first
  for (const { pattern, replacement } of mixedPatterns) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

// Simple translation function for scale.json
function translatePage(
  enPage: Record<string, unknown>,
  ptPage: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...ptPage };

  // Translate intro
  if (enPage.intro) {
    result.intro = translateText(String(enPage.intro));
  }

  // Translate meta title and description
  if (enPage.metaTitle) {
    result.metaTitle = translateText(String(enPage.metaTitle));
  }
  if (enPage.metaDescription) {
    result.metaDescription = translateText(String(enPage.metaDescription));
  }

  // Translate h1
  if (enPage.h1) {
    result.h1 = translateText(String(enPage.h1));
  }

  // Translate benefits
  if (enPage.benefits && Array.isArray(enPage.benefits)) {
    result.benefits = enPage.benefits.map((benefit: Record<string, unknown>, idx: number) => {
      const ptBenefit = (ptPage.benefits as Array<Record<string, unknown>>)?.[idx] || {};
      return {
        ...ptBenefit,
        title: translateText(String(benefit.title)),
        description: translateText(String(benefit.description)),
        metric: benefit.metric, // Keep metric as is
      };
    });
  }

  // Translate FAQ
  if (enPage.faq && Array.isArray(enPage.faq)) {
    result.faq = enPage.faq.map((item: Record<string, unknown>) => {
      return {
        question: translateText(String(item.question)),
        answer: translateText(String(item.answer)),
      };
    });
  }

  // Translate technical specs descriptions
  if (enPage.technicalSpecs) {
    result.technicalSpecs = { ...ptPage.technicalSpecs };
    // Technical specs values should stay mostly the same
  }

  // Translate target uses if they're not just arrays
  if (enPage.targetUses && Array.isArray(enPage.targetUses)) {
    // Target uses can stay similar or be translated
    result.targetUses = enPage.targetUses;
  }

  return result;
}

// Process all pages
const fixedPages = enData.pages.map((enPage: Record<string, unknown>, idx: number) => {
  const ptPage = ptData.pages[idx] || enPage;
  return translatePage(enPage, ptPage as Record<string, unknown>);
});

const fixedData = {
  ...ptData,
  pages: fixedPages,
};

// Write output
const outputPath = '/home/joao/projects/pixelperfect/locales/pt/scale.fixed.json';
fs.writeFileSync(outputPath, JSON.stringify(fixedData, null, 2), 'utf-8');

console.log(`Fixed version written to: ${outputPath}`);
console.log(`Review the file and then rename to scale.json when ready`);
