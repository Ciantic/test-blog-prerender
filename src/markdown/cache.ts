import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import pc from 'picocolors';

const cyan = pc.cyan;

/** Options for {@link createFileCache}. */
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

/**
 * A content-agnostic memoization engine for expensive per-file computations.
 * Results are stored as JSON in `cacheDir` and reused across process runs
 * while the source file's mtime/size are unchanged. Nothing here knows about
 * Vite — the Vite plugin layer was removed; vite.config.ts just constructs
 * an instance with Vite's logger.
 */
export interface FileCache {
  /**
   * Run `build` once per (key, source file version) and reuse the JSON-cached
   * result afterwards. Returns `null` unchanged (null results are not cached).
   */
  memoize<T>(
    key: string,
    sourcePath: string,
    build: () => Promise<T | null>,
  ): Promise<T | null>;
  /** Remove all cached entries. Best effort; logs how many were removed. */
  clear(reason: string): Promise<void>;
}

export function createFileCache(options: FileCacheOptions): FileCache {
  const { cacheDir } = options;
  const log = options.log ?? ((msg: string) => console.log(`${cyan('[markdown-cache]')} ${msg}`));

  // Dedupes concurrent calls for the same key within this process. Without
  // it, the check-then-write below isn't atomic, so concurrent callers
  // (index page, RSS feed, per-post prerender all run at once) race past
  // the cache read and each recompute on a cold cache.
  const inFlight = new Map<string, Promise<unknown>>();

  const cache: FileCache = {
    async memoize<T>(key: string, sourcePath: string, build: () => Promise<T | null>) {
      const hash = createHash('sha1').update(key).digest('hex');
      const file = join(cacheDir, `file-${hash}.json`);

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
          await mkdir(cacheDir, { recursive: true }).catch(() => {});
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
    },

    async clear(reason: string) {
      const entries = await readdir(cacheDir).catch(() => []);
      const targets = entries.filter((e) => e.startsWith('file-') && e.endsWith('.json'));
      await Promise.all(targets.map((e) => unlink(join(cacheDir, e))));
      log(`cleared ${targets.length} cache file(s) (${reason})`);
    },
  };

  if (options.clearOnCreate ?? (process.argv.includes('--force') || !!process.env.CLEAR_CACHE)) {
    const reason = process.argv.includes('--force') ? '--force' : 'CLEAR_CACHE';
    void cache.clear(reason);
  }

  return cache;
}
