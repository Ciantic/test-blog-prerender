import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup as mimeTypeOf } from 'mime-types';
import type { Plugin } from 'vite';
import { getPostFiles } from './src/lib/markdown';

const POSTS_DIR = join(import.meta.dirname, 'posts');
const POSTS_FILES = getPostFiles(POSTS_DIR);


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
          const data = readFileSync(join(POSTS_DIR, rel));
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
      for (const rel of POSTS_FILES.filter((f) => !f.endsWith('.md'))) {
        this.emitFile({
          type: 'asset',
          fileName: rel,
          source: readFileSync(join(POSTS_DIR, rel)),
        });
      }
    },
  };
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_POSTS_DIR': JSON.stringify(POSTS_DIR),
  },
  // TanStack Start owns the entries, dev serving, and the build. It scans
  // src/routes and generates src/routeTree.gen.ts, and prerenders the app to
  // static HTML at build time.
  plugins: [
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
      pages: [
        // The RSS feed is a server route (src/routes/rss.xml.ts) with no
        // component, so autoStaticPathsDiscovery skips it. Prerender it here
        // so dist/client/rss.xml is emitted as raw XML.
        { path: '/rss.xml' },
        ...POSTS_FILES
          .filter((f) => f.endsWith('.md'))
          .map((f) => ({ path: `/${f.replace(/\.md$/, '')}/` })),
      ],
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
