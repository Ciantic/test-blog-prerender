import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';

// Vite's cache directory (default node_modules/.vite). Defined in
// vite.config.ts so it always matches Vite's own cacheDir. Defined there via
// `define` → inlined at build time, so it's never undefined when this module
// runs; a missing value means the config wasn't wired up — fail loudly.
const CACHE_DIR: string = (() => {
  const dir = import.meta.env.VITE_CACHE_DIR as string | undefined;
  if (!dir) throw new Error('VITE_CACHE_DIR is not set (see vite.config.ts cacheDir/define)');
  return dir;
})();

// The path to log for a source file: relative to cwd when it's under cwd,
// otherwise the full path. Keeps logs short but unambiguous.
function displayPath(sourcePath: string): string {
  return isAbsolute(sourcePath) ? relative(process.cwd(), sourcePath) : sourcePath;
}

interface CacheEntry<T> {
  // The source file's identity at write time. If either value differs on a
  // later read, the file was edited and the entry is stale.
  source: { mtimeMs: number; size: number };
  value: T;
}

// Dedupes concurrent calls for the same key within this process. Without it,
// the check-then-write below isn't atomic, so concurrent callers (index page,
// RSS feed, per-post prerender all run at once) race past the cache read and
// each recompute on a cold cache.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `build` once and reuse the result across dev restarts / rebuilds.
 *
 * Persists to Vite's cache dir keyed by a hash of `key`. Invalidated when
 * `sourcePath` changes: its mtime+size are stored alongside the value and
 * compared on every read. A missing or stale entry is recomputed and
 * rewritten. Null results are never cached (a value that's null today may
 * not be tomorrow). Cache I/O is best-effort — failures just recompute.
 */
export async function memoizeFile<T>(
  key: string,
  sourcePath: string,
  build: () => Promise<T | null>,
): Promise<T | null> {
  const hash = createHash('sha1').update(key).digest('hex');
  const file = join(CACHE_DIR, `file-${hash}.json`);

  // Reuse an already-running computation for this key rather than racing it.
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T | null>;

  const run = (async () => {
    const st = await stat(sourcePath).catch(() => null);
    if (st) {
      const raw = await readFile(file, 'utf-8').catch(() => null);
      if (raw) {
        try {
          const entry = JSON.parse(raw) as CacheEntry<T>;
          if (entry.source.mtimeMs === st.mtimeMs && entry.source.size === st.size) {
            console.log(`[vite-caching] HIT ${displayPath(sourcePath)}`);
            return entry.value;
          }
        } catch {
          // Corrupt/partial entry — fall through and recompute.
        }
      }
    }

    console.log(`[vite-caching] MISS ${displayPath(sourcePath)}`);
    const value = await build();
    if (value !== null && st) {
      await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
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
