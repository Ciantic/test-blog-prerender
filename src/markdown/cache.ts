import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import pc from 'picocolors';

const cyan = pc.cyan;

/** Options for {@link initFileCache}. */
export interface FileCacheOptions {
  /** Directory where `file-<hash>.json` entries are stored. */
  cacheDir: string;
  /**
   * Logger for HIT/MISS/clear lines. Defaults to console.log with a
   * `[markdown-cache]` prefix; Vite's logger can be injected so output
   * matches the surrounding Vite styling.
   */
  log?: (msg: string) => void;
  /**
   * Clear the cache directory on creation (e.g. `vite --force` or the
   * `CLEAR_CACHE` env var). Defaults to detecting those triggers itself.
   */
  clearOnCreate?: boolean;
}

/**
 * The path to log for a source file: relative to cwd when it's under cwd,
 * otherwise the full path. Keeps logs short but unambiguous.
 */
function displayPath(sourcePath: string): string {
  return isAbsolute(sourcePath) ? relative(process.cwd(), sourcePath) : sourcePath;
}

let cacheDir: string | undefined;
let log: (msg: string) => void;

// Dedupes concurrent calls for the same key within this process. Without
// it, the check-then-write below isn't atomic, so concurrent callers
// (index page, RSS feed, per-post prerender all run at once) race past
// the cache read and each recompute on a cold cache.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Make sure the cache is initialized. Explicit init (vite.config.ts) wins;
 * otherwise fall back to the Vite define of VITE_CACHE_DIR on first use —
 * the SSR/prerender bundles never call initFileCache themselves.
 */
function ensureInit(): void {
  if (cacheDir) return;
  if (!import.meta.env.VITE_CACHE_DIR) {
    throw new Error(
      'File cache not initialized: call initFileCache() or define VITE_CACHE_DIR in vite.config.ts.',
    );
  }
  cacheDir = import.meta.env.VITE_CACHE_DIR;
  log = (msg: string) => console.log(`${cyan('[markdown-cache]')} ${msg}`);
}

/**
 * Run `build` once per (key, source file version) and reuse the JSON-cached
 * result afterwards. Results are stored as JSON in the cache dir and reused
 * across process runs while the source file's mtime/size are unchanged.
 * Returns `null` unchanged (null results are not cached).
 */
export async function memoize<T>({
  key,
  sourcePath,
  build,
}: {
  key: string;
  sourcePath: string;
  build: () => Promise<T | null>;
}): Promise<T | null> {
  ensureInit();
  const hash = createHash('sha1').update(key).digest('hex');
  const file = join(cacheDir!, `file-${hash}.json`);

  // Reuse an already-running computation for this key rather than racing it.
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T | null>;

  const run = (async () => {
    const st = await stat(sourcePath).catch(() => null);
    if (st) {
      const raw = await readFile(file, 'utf-8').catch(() => null);
      if (raw) {
        try {
          const entry = JSON.parse(raw) as {
            source: { mtimeMs: number; size: number };
            value: T;
          };
          if (entry.source.mtimeMs === st.mtimeMs && entry.source.size === st.size) {
            log(`HIT ${displayPath(sourcePath)}`);
            return entry.value;
          }
        } catch {
          // Corrupt/partial entry — fall through and recompute.
        }
      }
    }

    log(`MISS ${displayPath(sourcePath)}`);
    const value = await build();
    if (value !== null && st) {
      await mkdir(cacheDir!, { recursive: true }).catch(() => {});
      await writeFile(
        file,
        JSON.stringify({ source: { mtimeMs: st.mtimeMs, size: st.size }, value }),
      ).catch(() => {});
    }
    return value;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/** Remove all cached entries. Best effort; logs how many were removed. */
export async function clearCache(reason: string): Promise<void> {
  ensureInit();
  const entries = await readdir(cacheDir!).catch(() => []);
  const targets = entries.filter((e) => e.startsWith('file-') && e.endsWith('.json'));
  await Promise.all(targets.map((e) => unlink(join(cacheDir!, e))));
  log(`cleared ${targets.length} cache file(s) (${reason})`);
}

/**
 * Explicitly initialize the process-wide file cache. Optional: `memoize`
 * self-initializes from the Vite define of VITE_CACHE_DIR on first use.
 * Explicit init exists for the one caller that runs before Vite's `define`
 * replacement applies (the vite.config.ts factory, where import.meta.env is
 * still undefined) and lets it inject a custom logger. Throws if already
 * initialized, so a stray second init can't silently redirect the cache.
 */
export async function initFileCache(options: FileCacheOptions): Promise<void> {
  if (cacheDir) {
    throw new Error('File cache already initialized; call initFileCache only once.');
  }
  cacheDir = options.cacheDir;
  log = options.log ?? ((msg: string) => console.log(`${cyan('[markdown-cache]')} ${msg}`));

  if (options?.clearOnCreate ?? (process.argv.includes('--force') || !!process.env.CLEAR_CACHE)) {
    const reason = process.argv.includes('--force') ? '--force' : 'CLEAR_CACHE';
    await clearCache(reason);
  }
}
