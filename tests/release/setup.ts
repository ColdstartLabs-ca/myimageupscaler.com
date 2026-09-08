import { spawn } from 'node:child_process';
import { env as hostEnvironment, execPath } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function setup(): Promise<void> {
  // Always rebuild: an old passing artifact must never authorize a new release.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const child = spawn(
    execPath,
    [
      path.join(root, 'node_modules/tsx/dist/cli.mjs'),
      'tests/helpers/async-upscale-runtime.ts',
      '--subject=candidate',
      '--build-only',
    ],
    {
      cwd: root,
      env: { PATH: hostEnvironment.PATH, HOME: hostEnvironment.HOME, LANG: 'C.UTF-8' },
      stdio: 'inherit',
    }
  );
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`Release build failed (${code})`))
    );
  });
}
