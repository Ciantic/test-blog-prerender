import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import pc from 'picocolors';
import { stringify as devalueStringify, parse as devalueParse } from 'devalue';

const cyan = pc.cyan;

/** Options for {@link initFileCache}. */
export interface FileCacheOptions {
  cacheDir: string;
  log?: (msg: string) => void;
  clearCache?: boolean;
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
 * Run `build` once per (key, source stamp) and reuse the JSON-cached result
 * afterwards. Results are stored as JSON in the cache dir and reused across
 * process runs while `stamp()` keeps returning the same value. The stamp is
 * an opaque "current version" of the source(s) that feed `build` — for files
 * that's typically mtime+size, but any stable string works (content hash, git
 * sha, multiple files). Return `null` to both skip the cache check and avoid
 * writing an entry. `build` returning `null` is also not cached.
 */
export async function memoize<T>({
  key,
  build,
  stamp,
  label,
}: {
  key: string;
  /** Async computation to memoize. */
  build: () => Promise<T | null>;
  /** Current version of the source(s) behind `build`. */
  stamp: () => Promise<string | null>;
  /** Optional log label (e.g. a file path); defaults to `key`. */
  label?: string;
}): Promise<T | null> {
  ensureInit();
  const hash = createHash('sha1').update(key).digest('hex');
  const file = join(cacheDir!, `file-${hash}.json`);
  const tag = label ?? key;

  // Reuse an already-running computation for this key rather than racing it.
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T | null>;

  const run = (async () => {
    const current = await stamp();
    if (current !== null) {
      const raw = await readFile(file, 'utf-8').catch(() => null);
      if (raw) {
        try {
          const entry = devalueParse(raw) as { stamp: string; value: T };
          if (entry.stamp === current) {
            log(`HIT ${displayPath(tag)}`);
            return entry.value;
          }
        } catch {
          // Corrupt/partial entry — fall through and recompute.
        }
      }
    }

    log(`MISS ${displayPath(tag)}`);
    const value = await build();
    if (value !== null && current !== null) {
      await mkdir(cacheDir!, { recursive: true }).catch(() => {});
      // devalue (not JSON.stringify) so Date values round-trip: JSON would
      // flatten them to ISO strings, losing the Date type on cache reads.
      await writeFile(file, devalueStringify({ stamp: current, value })).catch(() => {});
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
export async function clearCache(): Promise<void> {
  ensureInit();
  const entries = await readdir(cacheDir!).catch(() => []);
  const targets = entries.filter((e) => e.startsWith('file-') && e.endsWith('.json'));
  await Promise.all(targets.map((e) => unlink(join(cacheDir!, e))));
  log(`cleared ${targets.length} cache file(s)`);
}

export async function initFileCache(options: FileCacheOptions): Promise<void> {
  if (cacheDir) {
    throw new Error('File cache already initialized; call initFileCache only once.');
  }
  cacheDir = options.cacheDir;
  log = options.log ?? ((msg: string) => console.log(`${cyan('[markdown-cache]')} ${msg}`));

  if (options?.clearCache) {
    await clearCache();
  }
}
