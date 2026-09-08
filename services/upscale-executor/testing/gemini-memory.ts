import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { GeminiAdapter as GeminiAdapterType } from '../gemini-adapter';
import type { IExecutorAttempt, IExecutorExecution } from '../advance';

// Import the production bundle itself so the memory gate measures its exact code.
const artifactPath = process.argv[2] ?? 'dist/upscale-executor/index.mjs';
// The gate must load the emitted artifact selected on the command line rather
// than the TypeScript source, so this dynamic import is intentional.
// eslint-disable-next-line no-restricted-syntax
const { GeminiAdapter } = (await import(pathToFileURL(resolve(artifactPath)).href)) as {
  GeminiAdapter: typeof GeminiAdapterType;
};
const outputBytes = 128 * 1024 * 1024;
const inputBytes = 25 * 1024 * 1024;
const encodedBytes = Math.ceil(outputBytes / 3) * 4;
const opening =
  '{"candidates":[{"finishReason":"STOP","content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"';
const closing = '"}}]}}],"padding":"';
const tail = '"}';
const transportBytes = 192 * 1024 * 1024;
const server = createServer(async (_request, response) => {
  for await (const chunk of _request) {
    void chunk;
  }
  response.setHeader('content-type', 'application/json');
  response.setHeader('content-length', transportBytes);
  response.write(opening);
  let remaining = encodedBytes - 4;
  const block = Buffer.alloc(64 * 1024, 65);
  while (remaining > 0) {
    const chunk = block.subarray(0, Math.min(block.length, remaining));
    remaining -= chunk.length;
    if (!response.write(chunk)) await once(response, 'drain');
  }
  response.write('AAA=');
  response.write(closing);
  remaining = transportBytes - opening.length - encodedBytes - closing.length - tail.length;
  while (remaining > 0) {
    const chunk = block.subarray(0, Math.min(block.length, remaining));
    remaining -= chunk.length;
    if (!response.write(chunk)) await once(response, 'drain');
  }
  response.end(tail);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('fixture did not listen');
let decodedBytes = 0;
const adapter = new GeminiAdapter({
  apiKey: 'fixture',
  apiOrigin: `http://127.0.0.1:${address.port}`,
  fetch: (input, options) =>
    String(input).startsWith('https://storage.test/')
      ? Promise.resolve(new Response(Buffer.alloc(inputBytes, 1)))
      : fetch(input, options),
  publishOutput: async output => {
    decodedBytes = output.bytes.byteLength;
    process.stderr.write(JSON.stringify({ atPublish: process.memoryUsage() }) + '\n');
    return 'https://storage.test/output.png';
  },
});
try {
  await adapter.createPrediction(
    {
      job_id: '11111111-1111-4111-8111-111111111111',
      user_id: 'u',
      provider: 'gemini',
      model_version: 'gemini-2.5-flash-image',
      input_storage_path: 'u/input.png',
      input_mime_type: 'image/png',
      config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
    } as IExecutorExecution,
    {
      job_id: '11111111-1111-4111-8111-111111111111',
      attempt_id: 'attempt',
      provider: 'gemini',
    } as IExecutorAttempt,
    'https://storage.test/input.png'
  );
  const peakRssBytes =
    Number(/VmHWM:\s+(\d+) kB/.exec(readFileSync('/proc/self/status', 'utf8'))?.[1]) * 1024;
  process.stdout.write(
    JSON.stringify({
      artifactPath,
      inputBytes,
      transportBytes,
      decodedBytes,
      peakRssBytes,
      launcherResourceMaxRssBytes: process.resourceUsage().maxRSS * 1024,
    }) + '\n'
  );
  assert.equal(decodedBytes, outputBytes, 'The maximum output must actually be decoded');
  assert.ok(Number.isFinite(peakRssBytes) && peakRssBytes > 0, 'Peak RSS evidence is required');
  assert.ok(
    peakRssBytes < 0.7 * 1024 ** 3,
    'Executor peak RSS exceeds 70% of its 1GiB memory limit'
  );
} finally {
  server.closeAllConnections();
  server.close();
}
