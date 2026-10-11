/**
 * R2 gallery source backup (SQR-01 gap close).
 *
 * The original SQR-01 backup copies Supabase Storage. Images saved to R2 after
 * the migration never enter that backup. This reusable engine backs the
 * R2-backed saved-images gallery to both machines by reusing the reviewed
 * `runBackup` engine: frozen inventory, local SHA256 gate, laptop proof and the
 * two-copy receipt are all inherited. Only the logical bucket and the source
 * store differ.
 *
 * Scope: this is an intentional source-gallery backup of the immutable `saved/`
 * prefix. It makes no claim to cover the whole R2 bucket (ephemeral inputs and
 * archives already verified on both machines stay out).
 *
 * The R2 inventory and download are injected adapter dependencies. The adapter
 * lists the DB-referenced R2 saved rows, so no bucket XML listing is needed.
 *
 * The CLI is read-only: it writes backup files under the common backup root and
 * on the laptop only, and performs no DB or R2 mutation. The operator adapters
 * load through injected options, so a hermetic test never reads a real secret.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { GALLERY_BUCKET } from './backup-verification.mjs';
import { createDb, runBackup } from './backup-and-purge.mjs';

export const R2_GALLERY_BUCKETS = [GALLERY_BUCKET];
export const R2_SOURCE_STORE = 'r2';

/**
 * Back up the R2-backed saved-images gallery. Thin wrapper over `runBackup`:
 * it fixes the bucket to saved-images and the source store to r2, and passes
 * the injected R2 listing/download adapters straight through.
 */
export async function runR2GalleryBackup(options = {}) {
  const {
    listObjects,
    downloadObject,
    outputRoot,
    resumeDir,
    runner,
    laptop,
    log,
    dbRefs,
  } = options;
  return runBackup({
    outputRoot,
    resumeDir,
    buckets: R2_GALLERY_BUCKETS,
    sourceStore: R2_SOURCE_STORE,
    listObjects,
    downloadObject,
    runCommand: runner,
    laptop,
    log,
    dbRefs: dbRefs ?? new Set(),
    inventoryRetries: 2,
  });
}

// =============================================================================
// CLI
// =============================================================================

function defaultRunCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    timeout: options.timeoutMs ?? 120_000,
  });
}

function log(message) {
  process.stdout.write(`[r2-gallery] ${message}\n`);
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

async function loadOperatorConfig() {
  const { loadR2OperatorConfig } = await import('./r2-gallery-operator-adapters.mjs');
  return loadR2OperatorConfig();
}

async function buildOperatorAdapters(options) {
  const { createR2GalleryAdapters } = await import('./r2-gallery-operator-adapters.mjs');
  return createR2GalleryAdapters(options);
}

const BACKUP_FLAGS = new Map([
  ['--output-root', 'outputRoot'],
  ['--resume', 'resume'],
]);

/** Parse `backup` flags. Unknown, duplicate and missing flags all fail closed. */
export function parseBackupArgs(argv = []) {
  const args = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const key = BACKUP_FLAGS.get(token);
    if (key === undefined) throw new Error(`unknown flag: ${token}`);
    if (seen.has(key)) throw new Error(`duplicate flag: ${token}`);
    seen.add(key);
    const value = argv[index + 1];
    if (value === undefined || BACKUP_FLAGS.has(value)) {
      throw new Error(`missing value for ${token}`);
    }
    if (!path.isAbsolute(value)) throw new Error(`${token} must be an absolute path`);
    args[key] = value;
    index += 1;
  }
  return args;
}

/**
 * Run the read-only source backup. Dependencies are injected as plain function
 * options so a hermetic CLI test can assert call order and the `finally` close.
 */
export async function cmdBackup(args = {}, deps = {}) {
  const {
    loadConfig = loadOperatorConfig,
    createDbClient = createDb,
    createAdapters = buildOperatorAdapters,
    runner = defaultRunCommand,
    log: logFn = log,
    backup = runR2GalleryBackup,
  } = deps;

  const config = await loadConfig();
  const db = await createDbClient(config.dbConfig);
  try {
    const runDir = args.resume;
    const adapters = await createAdapters({
      db,
      signing: config.signing,
      runDir,
      runner,
    });
    return await backup({
      listObjects: adapters.listObjects,
      downloadObject: adapters.downloadObject,
      outputRoot: args.outputRoot,
      resumeDir: runDir,
      runner,
      dbRefs: adapters.dbRefs,
      log: logFn,
    });
  } finally {
    await db.end();
  }
}

export function usage(out = process.stdout) {
  out.write(
    [
      'Usage: node scripts/storage/r2-gallery-backup.mjs <command>',
      '  backup [--output-root <absolute-dir>] [--resume <absolute-run-dir>]',
      '  --help',
    ].join('\n') + '\n'
  );
}

export async function main(argv = process.argv.slice(2), deps = {}, io = {}) {
  const out = io.out ?? process.stdout;
  const err = io.err ?? process.stderr;
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h' || rest.includes('--help') || rest.includes('-h')) {
    usage(out);
    return 0;
  }
  if (command !== 'backup') {
    usage(out);
    return 1;
  }
  let args;
  try {
    args = parseBackupArgs(rest);
  } catch (error) {
    err.write(`[r2-gallery] ${errorMessage(error)}\n`);
    return 1;
  }
  try {
    await cmdBackup(args, deps);
    return 0;
  } catch (error) {
    err.write(`[r2-gallery] error: ${errorMessage(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(`[r2-gallery] error: ${errorMessage(error)}\n`);
      process.exitCode = 1;
    });
}
