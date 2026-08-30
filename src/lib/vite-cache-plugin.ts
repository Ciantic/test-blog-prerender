import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import type { Logger, Plugin } from 'vite';
import pc from 'picocolors';

const cyan = pc.cyan;

// The vite.config.ts plugin and the SSR app run as separate module bundles,
// so they can't share a module instance. They do share a Node process, so
// we hand the cache engine (with Vite's real logger) across on globalThis.
// A Symbol.for key keeps it collision-free across bundles.
const BRIDGE_KEY = Symbol.for('test-blog.vite-cache');

// The `cache dir:` line is informational setup; print it once per process
// even though configResolved can fire several times and the config module
// gets re-bundled during a build (TanStack loads it more than once). The
// flag lives on globalThis so it survives separate module bundles, same as
// the engine bridge above. Same reasoning applies to the clear-once flag.
const ANNOUNCED_KEY = Symbol.for('test-blog.vite-cache-announced');
const CLEARED_KEY = Symbol.for('test-blog.vite-cache-cleared');

interface CacheEngine {
  memoize<T>(
    key: string,
    sourcePath: string,
    build: () => Promise<T | null>,
  ): Promise<T | null>;
}

// The path to log for a source file: relative to cwd when it's under cwd,
// otherwise the full path. Keeps logs short but unambiguous.
function displayPath(sourcePath: string): string {
  return isAbsolute(sourcePath) ? relative(process.cwd(), sourcePath) : sourcePath;
}

function makeEngine(cacheDir: string, logger: Logger, withTimestamp: boolean): CacheEngine {
  // Dedupes concurrent calls for the same key within this process. Without
  // it, the check-then-write below isn't atomic, so concurrent callers
  // (index page, RSS feed, per-post prerender all run at once) race past
  // the cache read and each recompute on a cold cache.
  const inFlight = new Map<string, Promise<unknown>>();

  // Dev's logger prefixes lines with a timestamp; the build logger doesn't.
  // Match the surrounding Vite output either way. Vite's logger only colors
  // the `[vite]` prefix, never the message body, so the cyan tag we insert
  // below is preserved as-is.
  const log = (msg: string) => logger.info(msg, { timestamp: withTimestamp });

  return {
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
                log(`${cyan('[vite-caching]')} HIT ${displayPath(sourcePath)}`);
                return entry.value;
              }
            } catch {
              // Corrupt/partial entry — fall through and recompute.
            }
          }
        }

        log(`${cyan('[vite-caching]')} MISS ${displayPath(sourcePath)}`);
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
  };
}

// A minimal logger for the config-time pass in ensureCacheEngine, used before
// Vite's real logger exists (the config factory runs before configResolved).
// Mirrors Vite's `[vite]` prefix + optional timestamp so early HIT/MISS lines
// look consistent with the plugin's. configResolved later swaps in the real
// logger, so this only ever shows the config-time getPostMetas pass.
const fallbackLogger: Logger = {
  info: (msg, options) => {
    const ts = options?.timestamp ? `${new Date().toLocaleTimeString()} ` : '';
    console.log(`[vite]${ts}${msg}`);
  },
  warn: (msg) => console.warn(`[vite] ${msg}`),
  warnOnce: (msg) => console.warn(`[vite] ${msg}`),
  error: (msg) => console.error(`[vite] ${msg}`),
  clearScreen: () => {},
  hasErrorLogged: () => false,
  hasWarned: false,
};

// Installs the cache engine on globalThis (where the SSR app's memoizeFile
// finds it), honoring the clear-once and announce-once flags. Called from the
// plugin's configResolved (with Vite's real logger) and from the config
// factory via ensureCacheEngine (with the fallback logger). The two are safe
// to both run: the announce/clear flags prevent duplicate side effects, and
// the engine is just overwritten with the real-logger one at configResolved.
function installEngine(
  cacheDir: string,
  logger: Logger,
  withTimestamp: boolean,
  forced: boolean,
): void {
  const global = globalThis as Record<PropertyKey, unknown>;
  const log = (msg: string) => logger.info(msg, { timestamp: withTimestamp });
  if (forced && !global[CLEARED_KEY]) {
    global[CLEARED_KEY] = true;
    const reason = process.argv.includes('--force') ? '--force' : 'CLEAR_CACHE';
    void clearFileCache(cacheDir, reason, log);
  }
  global[BRIDGE_KEY] = makeEngine(cacheDir, logger, withTimestamp);
  if (!global[ANNOUNCED_KEY]) {
    global[ANNOUNCED_KEY] = true;
    log(`${cyan('[vite-caching]')} cache dir: ${displayPath(cacheDir)} (clear: vite --force or CLEAR_CACHE=1)`);
  }
}

/**
 * Make sure the cache engine is installed before expensive work starts.
 * vite.config.ts calls this before getPostMetas, because the config factory
 * runs before the plugin's configResolved hook. Uses the fallback logger
 * until configResolved swaps in Vite's real one.
 */
export function ensureCacheEngine(cacheDir: string): void {
  const isDev = !process.argv.includes('build');
  const forced = process.argv.includes('--force') || !!process.env.CLEAR_CACHE;
  installEngine(cacheDir, fallbackLogger, isDev, forced);
}

/**
 * Vite plugin that owns the blog file cache. Installs a CacheEngine (with
 * Vite's native `logger`, so HIT/MISS lines match Vite's color + timestamp
 * styling) onto globalThis, where the SSR app's `memoizeFile` can reach it.
 * Also clears the memoized cache (`file-*.json`) whenever Vite runs with
 * `--force` (exposed as `config.optimizeDeps.force`; dev server only) or the
 * `CLEAR_CACHE` env var is set (works for dev and build alike). Both force
 * a full recompute of the blog file cache.
 */
export function viteCachePlugin(cacheDir: string): Plugin {
  return {
    name: 'vite-cache',
    configResolved(config) {
      // Timestamps only make sense on the dev server logger; the build
      // (prerender) logger prints plain `[vite]` lines with no clock. Detect
      // the mode from argv rather than config.command: TanStack's prerender
      // step runs a `serve`-command server *during* the build, so command
      // alone can't tell dev apart from build.
      const isDev = !process.argv.includes('build');
      const forced = !!config.optimizeDeps.force || !!process.env.CLEAR_CACHE;
      // Re-install the engine now that Vite's real logger exists. If the
      // config factory already ran ensureCacheEngine, this just swaps in the
      // real-logger engine (announce/clear flags prevent duplicate output).
      installEngine(cacheDir, config.logger, isDev, forced);
    },
  };
}

// Remove all memoized file-cache entries (`file-*.json`) in `dir`. Best
// effort — failures are ignored (a missing dir is fine; a partial clear just
// means some entries recompute). Logs how many entries were removed.
// `reason` is what triggered the clear (`--force` or `CLEAR_CACHE`) and is
// surfaced in the log.
async function clearFileCache(
  dir: string,
  reason: string,
  log: (msg: string) => void,
) {
  const entries = await readdir(dir).catch(() => []);
  const targets = entries.filter((e) => e.startsWith('file-') && e.endsWith('.json'));
  await Promise.all(targets.map((e) => unlink(join(dir, e))));
  log(
    `${cyan('[vite-caching]')} cleared ${targets.length} cache file(s) (${reason})`,
  );
}

/**
 * App-side entry point. Runs `build` once and reuses the result across dev
 * restarts / rebuilds, delegating to the plugin's engine (which logs via
 * Vite's logger). When the plugin isn't driving (e.g. vitest, where the
 * config isn't loaded) falls back to a plain uncached call.
 */
export async function memoizeFile<T>(
  key: string,
  sourcePath: string,
  build: () => Promise<T | null>,
): Promise<T | null> {
  const engine = (globalThis as Record<PropertyKey, unknown>)[BRIDGE_KEY] as
    | CacheEngine
    | undefined;
  if (engine) return engine.memoize<T>(key, sourcePath, build);
  return build();
}
