import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  // TanStack Start owns the entries, dev serving, and the build. It scans
  // src/routes and generates src/routeTree.gen.ts, and prerenders the app to
  // static HTML at build time.
  plugins: [
    // Must be registered before solid().
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
      // Explicitly prerender every blog post from the dummy data.
      pages: [
        { path: '/blog/hello-solid' },
        { path: '/blog/loaders-explained' },
        { path: '/blog/prerendering' },
      ],
    }),
    // @solidjs/vite-plugin in plain SSR transform mode — TanStack Start owns
    // the entries and server, so we only need the JSX/SSR transforms.
    solid({ ssr: true }),
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
