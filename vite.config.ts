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
// Posts live in posts/, optionally organized into subdirectories. The URL
// structure mirrors the posts/ directory exactly:
//   posts/foo.md              -> /foo/
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /img/test-image.png
// Posts with no commit yet are skipped entirely (they don't exist as far as
// the blog is concerned).

export interface PostMeta {
  /** URL path inside the site (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Path of the markdown file inside posts/, e.g. '2026/my-post.md'. */
  path: string;
  /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
  date: string;
  /**
   * Whether the post appears in the blog index and RSS feed. Only posts
   * inside a numeric directory (e.g. \d+/my-post.md) are listed; other
   * top-level files are still routable but unlisted.
   */
  indexed: boolean;
}

const postsDir = join(import.meta.dirname, 'posts');

/** All files under posts/ recursively, as slash-separated relative paths. */
const postFiles = readdirSync(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name).slice(postsDir.length + 1).replaceAll('\\', '/'));

function getPostMetas(): PostMeta[] {
  const files = postFiles.filter((f) => f.endsWith('.md'));

  const metas: PostMeta[] = [];
  for (const file of files) {
    try {
      const out = execFileSync(
        'git',
        [
          'log',
          // Only the commit that added the file — its creation date, so
          // later edits don't change the post's date metadata.
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
      metas.push({
        urlPath: file.replace(/\.md$/, ''),
        path: file,
        date,
        indexed: /^\d+\//.test(file),
      });
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

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function mimeTypeOf(path: string): string {
  return MIME_TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
}

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
          res.setHeader('Content-Type', mimeTypeOf(rel));
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
function rssPlugin(): Plugin {
  return {
    name: 'rss-xml-generator',
    apply: 'build',
    generateBundle() {
      const feed = new Feed({
        title: 'My Blog',
        description: 'Static-prerendered Solid blog demo.',
        id: `${SITE_URL}/`,
        link: `${SITE_URL}/`,
        language: 'fi',
        copyright: '',
      });

      // Newest first. Only indexed posts appear in the feed.
      for (const meta of [...postMetas]
        .filter((m) => m.indexed)
        .sort((a, b) => b.date.localeCompare(a.date))) {
        const url = `${SITE_URL}/${meta.urlPath}/`;
        // Use the post's `# Heading` as the title; fall back to the slug.
        const md = readFileSync(join(postsDir, meta.path), 'utf-8');
        const title =
          md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? meta.urlPath.split('/').pop()!;
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
      // unlisted ones. Paths mirror the posts/ directory structure.
      pages: postMetas.map((meta) => ({
        path: `/${meta.urlPath}/`,
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
