import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// --- Git-derived post metadata -------------------------------------------
//
// Each post's year comes from the date of its last git commit in the posts/
// repo. Posts with no commit yet are skipped entirely (they don't exist as
// far as the blog is concerned).

export interface PostMeta {
  slug: string;
  /** Year of the post's last git commit, e.g. 2026. */
  year: number;
}

function getPostMetas(): PostMeta[] {
  const postsDir = join(import.meta.dirname, 'posts');
  const files = readdirSync(postsDir).filter((f) => f.endsWith('.md'));

  const metas: PostMeta[] = [];
  for (const file of files) {
    try {
      const out = execFileSync(
        'git',
        [
          'log',
          // Only the commit that added the file — its creation date, so
          // later edits don't change the post's URL year.
          '--diff-filter=A',
          '--format=%ad',
          '--date=format:%Y',
          '--',
          file,
        ],
        { cwd: postsDir, encoding: 'utf-8' },
      ).trim();
      if (!out) continue; // No commit for this file yet — skip it.
      metas.push({ slug: file.replace(/\.md$/, ''), year: Number(out) });
    } catch {
      // Not a git repo or git unavailable — skip.
    }
  }
  return metas;
}

const postMetas = getPostMetas();

const virtualPostMeta = 'virtual:post-meta';

// Exposes `postMetas` to app code in every build (dev, SSR, client).
function postMetaPlugin(): Plugin {
  const resolvedId = '\0' + virtualPostMeta;
  return {
    name: 'post-meta-virtual-module',
    resolveId(id) {
      if (id === virtualPostMeta) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      return `export const postMetas = ${JSON.stringify(postMetas)};`;
    },
  };
}

export default defineConfig({
  // TanStack Start owns the entries, dev serving, and the build. It scans
  // src/routes and generates src/routeTree.gen.ts, and prerenders the app to
  // static HTML at build time.
  plugins: [
    // Must be registered before solid().
    postMetaPlugin(),
    tanstackStart({
      prerender: {
        // Enable prerendering.
        enabled: true,
        // Emit pages at /page/index.html instead of /page.html.
        autoSubfolderIndex: true,
        // Discover static routes automatically and merge with `pages`.
        autoStaticPathsDiscovery: true,
        // Extract links from prerendered HTML and prerender those too.
        crawlLinks: true,
        // Don't prerender the dynamic /users/* routes — they'd generate an
        // unbounded set of directories.
        filter: ({ path }) => !path.startsWith('/users'),
      },
      // Explicitly prerender every blog post at /<year>/<slug>/. Years come
      // from the posts/ git repo's last-commit dates.
      pages: postMetas.map((meta) => ({
        path: `/${meta.year}/${meta.slug}/`,
      })),
    }),
    // vite-plugin-solid in SSR mode — the supported Solid plugin for
    // TanStack Start. It injects the client entry and handles the SSR
    // transforms that tanstackStart's server entry relies on.
    solid({ ssr: true }),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    // if you have few tests, try commenting this
    // out to improve performance:
    isolate: false,
  },
  build: {
    target: 'esnext',
    // Keep images as asset files instead of inlining them into the JS bundle.
    assetsInlineLimit: 0,
  },
});
