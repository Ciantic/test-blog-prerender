import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Feed } from 'feed';
import type { Plugin } from 'vite';

// --- Git-derived post metadata -------------------------------------------
//
// Posts live in posts/, optionally organized into YYYY directories
// (e.g. posts/2026/my-post.md). The URL year comes from that leading year
// directory when present; otherwise it falls back to the post's git add
// date. The slug is always just the filename (directories never appear in
// URLs). Posts with no commit yet are skipped entirely (they don't exist as
// far as the blog is concerned).

export interface PostMeta {
  /** Filename-derived slug, e.g. 'my-post'. */
  slug: string;
  /** Path of the markdown file inside posts/, e.g. '2026/my-post.md'. */
  path: string;
  /** Year of the post's last git commit, e.g. 2026. */
  year: number;
  /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
  date: string;
}

const postsDir = join(import.meta.dirname, 'posts');

function getPostMetas(): PostMeta[] {
  const files = readdirSync(postsDir, { recursive: true, encoding: 'utf-8' })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => f.endsWith('.md'));

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
      // Leading YYYY/ directory wins over the git date.
      const dirYear = file.match(/^(\d{4})\//)?.[1];
      metas.push({
        slug: file.split('/').pop()!.replace(/\.md$/, ''),
        path: file,
        year: Number(dirYear ?? date.slice(0, 4)),
        date,
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

// Public location of the posts repo's assets. Markdown image refs are
// rewritten to this prefix (see src/lib/blog.ts).
export const POST_ASSETS_PREFIX = '/assets/posts';

// All non-markdown files in the posts repo (recursively). These are the
// posts' embeddable assets, served at /assets/posts/<rel>.
function postAssetFiles(): string[] {
  return readdirSync(postsDir, { recursive: true, encoding: 'utf-8' })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => {
      if (f.endsWith('.md')) return false;
      try {
        return statSync(join(postsDir, f)).isFile();
      } catch {
        return false;
      }
    });
}

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

// Serves the posts repo's assets at /assets/posts/<rel> (rel = path inside
// the posts repo).
//
// The posts/ directory is its own repo with its own internal structure;
// authors reference images relatively (e.g. ![](img/foo.png)), and those refs
// are rewritten (see src/lib/blog.ts) to this global asset location:
//   - dev: middleware reads straight from posts/
//   - build: files are copied to dist/assets/posts/
function postsAssetsPlugin(): Plugin {
  return {
    name: 'post-assets-server',
    configureServer(server) {
      server.middlewares.use(`${POST_ASSETS_PREFIX}/`, (req, res, next) => {
        // req.url here is stripped of the mount prefix, e.g. 'img/foo.png'.
        const rel = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
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
      for (const rel of postAssetFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `${POST_ASSETS_PREFIX.replace(/^\//, '')}/${rel}`,
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

      // Newest first.
      for (const meta of [...postMetas].sort((a, b) => b.date.localeCompare(a.date))) {
        const url = `${SITE_URL}/${meta.year}/${meta.slug}/`;
        // Use the post's `# Heading` as the title; fall back to the slug.
        const md = readFileSync(join(postsDir, meta.path), 'utf-8');
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
