import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = 'dist/upscale-executor';
const buildId = process.argv[2] ?? 'local';
if (buildId !== 'local' && !/^[a-f0-9]{40}$/.test(buildId)) throw new Error('Build ID must be a full source SHA or local');
await mkdir(directory, { recursive: true });
const options = { bundle: true, platform: 'node', format: 'esm', target: 'node22',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};
const result = await build({ ...options, define: { __UPSCALE_BUILD_ID__: JSON.stringify(buildId) }, entryPoints: ['services/upscale-executor/index.ts'], outfile: `${directory}/index.mjs`, metafile: true });
const inputs = Object.keys(result.metafile.inputs);
const forbidden = inputs.filter(path => /node_modules\/(next|replicate|@opennextjs|@google\/genai)\//.test(path));
if (forbidden.length) throw new Error(`Executor includes forbidden runtime dependencies: ${forbidden.join(', ')}`);
await build({ ...options, entryPoints: ['services/upscale-executor/testing/gemini-memory.ts'], outfile: `${directory}/gemini-memory.mjs` });
const artifact = await readFile(`${directory}/index.mjs`);
await writeFile(`${directory}/manifest.json`, JSON.stringify({ buildId, sha256: createHash('sha256').update(artifact).digest('hex'), bytes: artifact.length, inputs }, null, 2));
process.stdout.write(JSON.stringify({ artifact: `${directory}/index.mjs`, bytes: artifact.length, inputModules: inputs.length, forbiddenModules: forbidden.length }) + '\n');
