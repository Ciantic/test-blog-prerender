import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Feed } from 'feed';
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
  /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
  date: string;
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
          '--date=format:%Y-%m-%d',
          '--',
          file,
        ],
        { cwd: postsDir, encoding: 'utf-8' },
      ).trim();
      if (!out) continue; // No commit for this file yet — skip it.
      const date = out.split('\n')[0];
      metas.push({ slug: file.replace(/\.md$/, ''), year: Number(date.slice(0, 4)), date });
    } catch {
      // Not a git repo or git unavailable — skip.
    }
  }
  return metas;
}

const postMetas = getPostMetas();

const virtualPostMeta = 'virtual:post-meta';

// Canonical site origin. Used to build absolute URLs in the RSS feed
// (RSS requires absolute link elements). Adjust when deploying.
export const SITE_URL = 'https://example.com';

// Emits /rss.xml as a plain static asset at build time. Doing this in Vite
// (rather than as a route) keeps the feed outside TanStack Start's HTML
// document shell — it's raw XML, not a page.
function rssPlugin(): Plugin {
  return {
    name: 'rss-xml-generator',
    apply: 'build',
    generateBundle() {
      const postsDir = join(import.meta.dirname, 'posts');
      const feed = new Feed({
        title: 'My Blog',
        description: 'Static-prerendered Solid blog demo.',
        id: `${SITE_URL}/`,
        link: `${SITE_URL}/`,
        language: 'fi',
        copyright: '',
      });

      // Newest first.
      for (const meta of [...postMetas].sort((a, b) => b.date.localeCompare(a.date))) {
        const url = `${SITE_URL}/${meta.year}/${meta.slug}/`;
        // Use the post's `# Heading` as the title; fall back to the slug.
        const md = readFileSync(join(postsDir, `${meta.slug}.md`), 'utf-8');
        const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? meta.slug;
        feed.addItem({
          title,
          id: url,
          link: url,
          date: new Date(`${meta.date}T00:00:00Z`),
        });
      }

      this.emitFile({ type: 'asset', fileName: 'rss.xml', source: feed.rss2() });
    },
  };
}

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
    rssPlugin(),
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
