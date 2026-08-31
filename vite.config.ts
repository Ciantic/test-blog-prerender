import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { dirname, join, normalize } from 'node:path';
import { initFileCache } from './src/markdown/cache';
import { getPostMetas } from './src/markdown/posts';
import { postAssetsPlugin } from './src/lib/vite-post-assets-plugin';

const POSTS_DIR = join(import.meta.dirname, 'posts');
const CACHE_DIR = join(import.meta.dirname, 'node_modules/.vite');

export default defineConfig(async () => {
  await initFileCache({ 
    cacheDir: CACHE_DIR,

    // Clear cache if `--force` is passed or CLEAR_CACHE=1 is set
    clearCache: process.argv.includes('--force') || !!process.env.CLEAR_CACHE
  });

  const metas = await getPostMetas({ postsDir: POSTS_DIR });
  const assetPaths = metas.flatMap((meta) =>
    meta.assets.map((asset) => normalize(join(dirname(meta.path), asset))),
  );

  return {
    cacheDir: CACHE_DIR,
    define: {
      'import.meta.env.VITE_POSTS_DIR': JSON.stringify(POSTS_DIR),
      'import.meta.env.VITE_CACHE_DIR': JSON.stringify(CACHE_DIR),
    },

    plugins: [
      postAssetsPlugin(POSTS_DIR, assetPaths),
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
        // Prerender each committed post at /<urlPath>/, including unlisted
        // ones. Derived from getPostMetas, the same source that drives asset
        // emission — a post without a git commit is skipped by both.
        pages: [
          // The RSS feed is a server route (src/routes/rss.xml.ts) with no
          // component, so autoStaticPathsDiscovery skips it. Prerender it here
          // so dist/client/rss.xml is emitted as raw XML.
          { path: '/rss.xml' },
          ...metas.map((meta) => ({ path: `/${meta.urlPath}/` })),
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
  };
});
