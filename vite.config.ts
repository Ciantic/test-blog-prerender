import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Feed } from 'feed';
import { lookup as mimeTypeOf } from 'mime-types';
import type { Plugin } from 'vite';
import { getPostIndexData, getPostFiles } from './src/lib/markdown';

// All content processing (git dates, frontmatter, markdown rendering) lives
// in src/lib/markdown.ts, shared with the static server functions in
// src/lib/blog.ts. This config only consumes the results: prerender page
// list, RSS feed, and asset copying.

// The posts/ root is resolved from this file's own directory — always the
// project root, in dev and build alike — and passed into markdown.ts. (The
// module itself can't hardcode it: its location differs between source and
// the built server bundle.) blog.ts resolves the same root from
// process.cwd() on the prerender server.
const postsDir = join(import.meta.dirname, 'posts');
const postFiles = getPostFiles(postsDir);


// Canonical site origin. Used to build absolute URLs in the RSS feed
// (RSS requires absolute link elements). Adjust when deploying.
export const SITE_URL = 'https://example.com';


// Serves the posts repo's non-markdown files one-to-one at /<rel> (rel =
// path inside the posts repo), so post assets like images are reachable at
// URLs mirroring the posts/ layout:
//   - dev: middleware reads straight from posts/
//   - build: files are copied to dist/client/<rel>
function postsAssetsPlugin(): Plugin {
  return {
    name: 'post-assets-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        // Only handle paths that don't belong to Vite/app code. App code
        // lives under /src, /@fs, /@id, /node_modules and known routes.
        if (!url.startsWith('/') || url.startsWith('/@') || url.startsWith('/src/') || url.startsWith('/node_modules/')) {
          return next();
        }
        const rel = decodeURIComponent(url.replace(/^\//, ''));
        if (!rel || rel.includes('..')) return next();
        try {
          const data = readFileSync(join(postsDir, rel));
          res.setHeader('Content-Type', mimeTypeOf(rel) || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      // Only the client build produces deployable static assets.
      if (this.environment.name !== 'client') return;
      for (const rel of postFiles.filter((f) => !f.endsWith('.md'))) {
        this.emitFile({
          type: 'asset',
          fileName: rel,
          source: readFileSync(join(postsDir, rel)),
        });
      }
    },
  };
}

// Emits /rss.xml as a plain static asset at build time. Doing this in Vite
// (rather than as a route) keeps the feed outside TanStack Start's HTML
// document shell — it's raw XML, not a page.
// Builds the RSS feed from committed, indexed posts. Shared by the build
// plugin (emits rss.xml as a static asset) and the dev middleware.
async function buildRssXml(): Promise<string> {
  const feed = new Feed({
    title: 'My Blog',
    description: 'Static-prerendered Solid blog demo.',
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'fi',
    copyright: '',
  });

  // Newest first, by the effective date (frontmatter overrides git date).
  // Only indexed posts appear in the feed — exactly what getPostIndexData()
  // returns (title already resolved: frontmatter > `# Heading` > slug).
  const items = (await getPostIndexData(postsDir)).map((meta) => ({
    url: `${SITE_URL}/${meta.urlPath}/`,
    title: meta.title,
    date: new Date(meta.date),
  }));

  for (const { url, title, date } of items) {
    feed.addItem({
      title,
      id: url,
      link: url,
      date,
    });
  }

  return feed.rss2();
}

function rssPlugin(): Plugin {
  return {
    name: 'rss-xml-generator',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/rss.xml') return next();
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(await buildRssXml());
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'rss.xml', source: await buildRssXml() });
    },
  };
}

export default defineConfig({
  // TanStack Start owns the entries, dev serving, and the build. It scans
  // src/routes and generates src/routeTree.gen.ts, and prerenders the app to
  // static HTML at build time.
  plugins: [
    rssPlugin(),
    postsAssetsPlugin(),
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
      // Explicitly prerender every committed post at /<urlPath>/, including
      // unlisted ones. Paths mirror the posts/ directory structure. Derived
      // straight from the posts/ file listing — posts without a git commit
      // are still attempted but will 404 during prerendering, same as
      // before (getPostMetas skips them, so this is a superset).
      pages: postFiles
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ path: `/${f.replace(/\.md$/, '')}/` })),
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
