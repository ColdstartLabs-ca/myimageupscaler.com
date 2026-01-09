#!/usr/bin/env tsx
/**
 * Fix common Portuguese translation issues
 * Addresses mixed English/Portuguese text in translation files
 */

import fs from 'fs';
import path from 'path';

interface ITranslationEntry {
  [key: string]: string | number | boolean | ITranslationEntry | unknown;
}

// Common mixed language patterns to fix
const replacements: Array<{ pattern: RegExp; replacement: string }> = [
  // Fix "your" mixed with Portuguese
  [/your imagemns?/g, 'suas imagens'],
  [/your imagem/g, 'sua imagem'],
  [/your fotos?/g, 'suas fotos'],
  [/your foto/g, 'sua foto'],

  // Fix common mixed phrases
  [/to 4K resolução/g, 'para resolução 4K'],
  [/to HD resolução/g, 'para resolução HD'],
  [/to Full HD resolução/g, 'para resolução Full HD'],
  [/to 8K resolução/g, 'para resolução 8K'],
  [/to 2K resolução/g, 'para resolução 2K'],

  // Fix mixed "and"
  [/telas, and/g, 'telas e'],
  [/, and /g, ' e '],
  [/ and /g, ' e '],
  [/\band\b/g, 'e'],

  // Fix "with" mixed with Portuguese
  [/with IA/g, 'com IA'],
  [/with avançado/g, 'com avançado'],
  [/with intelligent/g, 'com inteligente'],

  // Fix "for" mixed with Portuguese
  [/for tela/g, 'para tela'],
  [/for telas/g, 'para telas'],
  [/for modern/g, 'para moderno'],
  [/for profissional/g, 'para profissional'],
  [/for creating/g, 'para criar'],
  [/for upgrading/g, 'para atualizar'],

  // Fix "The" articles
  [/\bThe /g, 'O '],
  [/\bthe /g, 'o '],

  // Fix common words
  [/\bis\b/g, 'é'],
  [/\bare\b/g, 'são'],
  [/\bof\b/g, 'de'],
  [/\bin\b/g, 'em'],
  [/\bat\b/g, 'em'],
  [/\bto\b/g, 'para'],
  [/\bfrom\b/g, 'de'],
  [/\bwith\b/g, 'com'],
  [/\bor\b/g, 'ou'],
  [/\bwill\b/g, 'irá'],
  [/\bcan\b/g, 'pode'],
  [/\bthat\b/g, 'que'],
  [/\bthis\b/g, 'isto'],
  [/\bwhen\b/g, 'quando'],
  [/\bwhat\b/g, 'o que'],
  [/\bwhich\b/g, 'que'],
  [/\bwhile\b/g, 'enquanto'],
  [/\bwhere\b/g, 'onde'],
  [/\bhow\b/g, 'como'],
  [/\bwhy\b/g, 'por que'],
  [/\bif\b/g, 'se'],
  [/\bbecause\b/g, 'porque'],
  [/\bso\b/g, 'então'],
  [/\bbut\b/g, 'mas'],
  [/\bthan\b/g, 'do que'],
  [/\bthan\b/g, 'que'],
  [/\bmore\b/g, 'mais'],
  [/\bless\b/g, 'menos'],
  [/\bbetter\b/g, 'melhor'],
  [/\bworse\b/g, 'pior'],
  [/\bbest\b/g, 'melhor'],
  [/\bworst\b/g, 'pior'],
  [/\bget\b/g, 'obtenha'],
  [/\bgot\b/g, 'obteve'],
  [/\bhas\b/g, 'tem'],
  [/\bhave\b/g, 'tem'],
  [/\bhad\b/g, 'tinha'],
  [/\bdo\b/g, 'fazer'],
  [/\bdoes\b/g, 'faz'],
  [/\bdid\b/g, 'fez'],
  [/\bmake\b/g, 'fazer'],
  [/\bmakes\b/g, 'faz'],
  [/\bmaking\b/g, 'fazendo'],
  [/\bmade\b/g, 'fez'],
  [/\buse\b/g, 'usar'],
  [/\buses\b/g, 'usa'],
  [/\bused\b/g, 'usado'],
  [/\busing\b/g, 'usando'],
  [/\bkeep\b/g, 'manter'],
  [/\bkeeps\b/g, 'mantém'],
  [/\bkeeping\b/g, 'mantendo'],
  [/\bkept\b/g, 'mantido'],
  [/\bneed\b/g, 'precisa'],
  [/\bneeds\b/g, 'precisa'],
  [/\bneeded\b/g, 'precisou'],
  [/\bneeding\b/g, 'precisando'],
  [/\bhelp\b/g, 'ajudar'],
  [/\bhelps\b/g, 'ajuda'],
  [/\bhelped\b/g, 'ajudou'],
  [/\bhelping\b/g, 'ajudando'],
  [/\bshow\b/g, 'mostrar'],
  [/\bshows\b/g, 'mostra'],
  [/\bshowed\b/g, 'mostrou'],
  [/\bshowing\b/g, 'mostrando'],
  [/\bwork\b/g, 'funcionar'],
  [/\bworks\b/g, 'funciona'],
  [/\bworked\b/g, 'funcionou'],
  [/\bworking\b/g, 'funcionando'],
  [/\blook\b/g, 'olhar'],
  [/\blooks\b/g, 'parece'],
  [/\blooked\b/g, 'olhou'],
  [/\blooking\b/g, 'olhando'],
  [/\bfind\b/g, 'encontrar'],
  [/\bfinds\b/g, 'encontra'],
  [/\bfound\b/g, 'encontrado'],
  [/\bfinding\b/g, 'encontrando'],
  [/\bgive\b/g, 'dar'],
  [/\bgives\b/g, 'dá'],
  [/\bgave\b/g, 'deu'],
  [/\bgiving\b/g, 'dando'],
  [/\btake\b/g, 'levar'],
  [/\btakes\b/g, 'leva'],
  [/\btook\b/g, 'levou'],
  [/\btaking\b/g, 'levando'],
  [/\bcome\b/g, 'vir'],
  [/\bcomes\b/g, 'vem'],
  [/\bcame\b/g, 'veio'],
  [/\bcoming\b/g, 'vindo'],
  [/\bgo\b/g, 'ir'],
  [/\bgoes\b/g, 'vai'],
  [/\bwent\b/g, 'foi'],
  [/\bgoing\b/g, 'indo'],
  [/\bsay\b/g, 'dizer'],
  [/\bsays\b/g, 'diz'],
  [/\bsaid\b/g, 'disse'],
  [/\bsaying\b/g, 'dizendo'],
  [/\bsee\b/g, 'ver'],
  [/\bsees\b/g, 'vê'],
  [/\bsaw\b/g, 'viu'],
  [/\bseeing\b/g, 'vendo'],
  [/\bknow\b/g, 'saber'],
  [/\bknows\b/g, 'sabe'],
  [/\bknew\b/g, 'sabia'],
  [/\bknowing\b/g, 'sabendo'],
  [/\bthink\b/g, 'pensar'],
  [/\bthinks\b/g, 'pensa'],
  [/\bthought\b/g, 'pensou'],
  [/\bthinking\b/g, 'pensando'],
  [/\bwant\b/g, 'querer'],
  [/\bwants\b/g, 'quer'],
  [/\bwanted\b/g, 'queria'],
  [/\bwanting\b/g, 'querendo'],
  [/\btry\b/g, 'tentar'],
  [/\btries\b/g, 'tenta'],
  [/\btried\b/g, 'tentou'],
  [/\btrying\b/g, 'tentando'],
  [/\ballow\b/g, 'permitir'],
  [/\ballows\b/g, 'permite'],
  [/\ballowed\b/g, 'permitiu'],
  [/\ballowing\b/g, 'permitindo'],
  [/\blet\b/g, 'deixar'],
  [/\blets\b/g, 'deixa'],
  [/\bput\b/g, 'colocar'],
  [/\bputs\b/g, 'coloca'],
  [/\bputting\b/g, 'colocando'],
  [/\bplace\b/g, 'colocar'],
  [/\bplaces\b/g, 'coloca'],
  [/\bplacing\b/g, 'colocando'],
  [/\badd\b/g, 'adicionar'],
  [/\badds\b/g, 'adiciona'],
  [/\badded\b/g, 'adicionou'],
  [/\badding\b/g, 'adicionando'],
  [/\bremove\b/g, 'remover'],
  [/\bremoves\b/g, 'remove'],
  [/\bremoved\b/g, 'removeu'],
  [/\bremoving\b/g, 'removendo'],
  [/\bchange\b/g, 'mudar'],
  [/\bchanges\b/g, 'muda'],
  [/\bchanged\b/g, 'mudou'],
  [/\bchanging\b/g, 'mudando'],
  [/\bcreate\b/g, 'criar'],
  [/\bcreates\b/g, 'cria'],
  [/\bcreated\b/g, 'criou'],
  [/\bcreating\b/g, 'criando'],
  [/\bmake\b/g, 'fazer'],
  [/\bmakes\b/g, 'faz'],
  [/\bmade\b/g, 'fez'],
  [/\bmaking\b/g, 'fazendo'],
  [/\bbuild\b/g, 'construir'],
  [/\bbuilds\b/g, 'constrói'],
  [/\bbuilt\b/g, 'construiu'],
  [/\bbuilding\b/g, 'construindo'],
  [/\bproduce\b/g, 'produzir'],
  [/\bproduces\b/g, 'produz'],
  [/\bproduced\b/g, 'produziu'],
  [/\bproducing\b/g, 'produzindo'],
  [/\bprovide\b/g, 'fornecer'],
  [/\bprovides\b/g, 'fornece'],
  [/\bprovided\b/g, 'forneceu'],
  [/\bproviding\b/g, 'fornecendo'],
  [/\boffer\b/g, 'oferecer'],
  [/\boffers\b/g, 'oferece'],
  [/\boffered\b/g, 'ofereceu'],
  [/\boffering\b/g, 'oferecendo'],
  [/\bsupport\b/g, 'suportar'],
  [/\bsupports\b/g, 'suporta'],
  [/\bsupported\b/g, 'suportou'],
  [/\bsupporting\b/g, 'suportando'],
  [/\benable\b/g, 'permitir'],
  [/\benables\b/g, 'permite'],
  [/\benabled\b/g, 'permitiu'],
  [/\benabling\b/g, 'permitindo'],
  [/\bensure\b/g, 'garantir'],
  [/\bensures\b/g, 'garante'],
  [/\bensured\b/g, 'garantiu'],
  [/\bensuring\b/g, 'garantindo'],
  [/\bimprove\b/g, 'melhorar'],
  [/\bimproves\b/g, 'melhora'],
  [/\bimproved\b/g, 'melhorou'],
  [/\bimproving\b/g, 'melhorando'],
  [/\bincrease\b/g, 'aumentar'],
  [/\bincreases\b/g, 'aumenta'],
  [/\bincreased\b/g, 'aumentou'],
  [/\bincreasing\b/g, 'aumentando'],
  [/\bdecrease\b/g, 'diminuir'],
  [/\bdecreases\b/g, 'diminui'],
  [/\bdecreased\b/g, 'diminuiu'],
  [/\bdecreasing\b/g, 'diminuindo'],
  [/\breduce\b/g, 'reduzir'],
  [/\breduces\b/g, 'reduz'],
  [/\breduced\b/g, 'reduziu'],
  [/\breducing\b/g, 'reduzindo'],
  [/\boptimize\b/g, 'otimizar'],
  [/\boptimizes\b/g, 'otimiza'],
  [/\boptimized\b/g, 'otimizou'],
  [/\boptimizing\b/g, 'otimizando'],
  [/\benhance\b/g, 'melhorar'],
  [/\benhances\b/g, 'melhora'],
  [/\benhanced\b/g, 'melhorou'],
  [/\benhancing\b/g, 'melhorando'],
  [/\bfix\b/g, 'corrigir'],
  [/\bfixes\b/g, 'corrige'],
  [/\bfixed\b/g, 'corrigiu'],
  [/\bfixing\b/g, 'corrigindo'],
  [/\bprocess\b/g, 'processar'],
  [/\bprocesses\b/g, 'processa'],
  [/\bprocessed\b/g, 'processou'],
  [/\bprocessing\b/g, 'processando'],
  [/\banalyze\b/g, 'analisar'],
  [/\banalyzes\b/g, 'analisa'],
  [/\banalyzed\b/g, 'analizou'],
  [/\banalyzing\b/g, 'analisando'],
  [/\bgenerate\b/g, 'gerar'],
  [/\bgenerates\b/g, 'gera'],
  [/\bgenerated\b/g, 'gerou'],
  [/\bgenerating\b/g, 'gerando'],
  [/\bconvert\b/g, 'converter'],
  [/\bconverts\b/g, 'converte'],
  [/\bconverted\b/g, 'converteu'],
  [/\bconverting\b/g, 'convertendo'],
  [/\btransform\b/g, 'transformar'],
  [/\btransforms\b/g, 'transforma'],
  [/\btransformed\b/g, 'transformou'],
  [/\btransforming\b/g, 'transformando'],
];

function fixTranslation(text: string): string {
  let result = text;

  for (const { pattern, replacement } of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

function processObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return fixTranslation(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(processObject);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processObject(value);
    }
    return result;
  }

  return obj;
}

function fixFile(filePath: string): void {
  console.log(`Processing ${filePath}...`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  const fixed = processObject(data);
  const fixedContent = JSON.stringify(fixed, null, 2);

  // Write to a temp file first for review
  const tempPath = filePath.replace('.json', '.fixed.json');
  fs.writeFileSync(tempPath, fixedContent, 'utf-8');

  console.log(`  Fixed version written to ${tempPath}`);
  console.log(`  Review and rename to ${filePath} when ready`);
}

function main() {
  const files = [
    '/home/joao/projects/pixelperfect/locales/pt/scale.json',
    '/home/joao/projects/pixelperfect/locales/pt/format-scale.json',
    '/home/joao/projects/pixelperfect/locales/pt/platform-format.json',
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      fixFile(file);
    } else {
      console.log(`File not found: ${file}`);
    }
  }

  console.log('\nDone! Review the .fixed.json files and rename them when ready.');
}

main();
