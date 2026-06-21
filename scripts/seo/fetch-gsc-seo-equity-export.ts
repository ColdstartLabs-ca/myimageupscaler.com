function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

const outPath = getArg('out') ?? 'tmp/gsc/seo-equity-latest.json';

console.log(
  [
    'SEO equity GSC fetch is intentionally not implemented for local runs.',
    'This repository consumes saved GSC exports only; no live GSC/API request was made.',
    `Provide an reviewed export to the generator with --gsc=${outPath} or another saved path.`,
  ].join('\n')
);
