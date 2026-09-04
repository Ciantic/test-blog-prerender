import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Plugin } from 'vite';

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const LINK_TAG = /<link\b[^>]*>\s*/gi;
const HYDRATION_KEY = /\s_hk=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const HYDRATION_MARKER = /<!--(?:!?\$|\/|xs)-->/g;

function getAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function isJavascriptPreload(tag: string): boolean {
  const rel = getAttribute(tag, 'rel')?.toLowerCase();
  if (rel !== 'modulepreload' && rel !== 'preload') return false;

  return getAttribute(tag, 'as')?.toLowerCase() === 'script'
    || /\.js(?:[?#]|$)/i.test(getAttribute(tag, 'href') ?? '');
}

/** Removes hydration and client-bundle markup from prerendered HTML. */
export function removeJavaScriptFromHtml(html: string): string {
  return html
    .replace(SCRIPT_TAG, '')
    .replace(LINK_TAG, (tag) => isJavascriptPreload(tag) ? '' : tag)
    .replace(HYDRATION_KEY, '')
    .replace(HYDRATION_MARKER, '');
}

/** Deletes client bundles and records final static output after prerendering. */
export function removeClientBundlesPlugin(outDir: string, reportPath: string): Plugin {
  let cleanedUp = false;

  async function cleanUp(): Promise<void> {
    if (cleanedUp) return;
    cleanedUp = true;

    await removeJavaScriptFiles(outDir);
    await rm(join(outDir, '__tsr'), { force: true, recursive: true });
    await writeBuildReport(outDir, reportPath);
  }

  return {
    name: 'remove-client-bundles',
    apply: 'build',
    async closeBundle() {
      // TanStack writes static server-function caches after Vite's bundle
      // hooks, so clean the final static output immediately before exit.
      process.once('beforeExit', cleanUp);
    },
  };
}

async function removeJavaScriptFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeJavaScriptFiles(path);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      await rm(path);
    }
  }));
}

async function writeBuildReport(outDir: string, reportPath: string): Promise<void> {
  const files = await getFiles(outDir);
  const lines = await Promise.all(files.map(async (file) => {
    const { size } = await stat(file);
    return `${relative(dirname(reportPath), file)} ${formatSize(size)}`;
  }));

  await writeFile(reportPath, `${lines.sort().join('\n')}\n`);
}

async function getFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? getFiles(path) : [path];
  }));
  return files.flat();
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}