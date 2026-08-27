import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { Feed } from 'feed';
import matter from 'gray-matter';
import { marked } from 'marked';
import type { Renderer, Tokens } from 'marked';
import { lookup as mimeTypeOf } from 'mime-types';
import { imageSize } from 'image-size';
import type { Plugin } from 'vite';
import type { PostMeta } from './src/post-meta';

// --- Git-derived post metadata -------------------------------------------
//
// Posts live in posts/, optionally organized into subdirectories. The URL
// structure mirrors the posts/ directory exactly:
//   posts/foo.md              -> /foo/
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /img/test-image.png
// Posts with no commit yet are skipped entirely (they don't exist as far as
// the blog is concerned).
//
// The PostMeta interface is declared once in src/vite-env.d.ts (as part of
// the virtual:post-meta module declaration) and imported here.

const postsDir = join(import.meta.dirname, 'posts');

/** All files under posts/ recursively, as slash-separated relative paths. */
const postFiles = readdirSync(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name).slice(postsDir.length + 1).replaceAll('\\', '/'));

const execFileAsync = promisify(execFile);

// --- Image dimensions ------------------------------------------------------
//
// Measures every image in posts/ once at config time so markdown-rendered
// <img> tags can include width/height (prevents layout shift / CLS).
// Keyed by the path inside posts/, e.g. '2026/img/test-image.png'.
// Computed before postMetas because the markdown renderer uses it.
async function getImageDims(): Promise<Record<string, { width: number; height: number }>> {
  const imageFiles = postFiles.filter((rel) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(rel));
  const results = await Promise.all(
    imageFiles.map(async (rel) => {
      try {
        const dims = imageSize(await readFile(join(postsDir, rel)));
        // SVGs from image-size report width/height only when set explicitly.
        if (dims.width && dims.height) return [rel, { width: dims.width, height: dims.height }] as const;
        return null;
      } catch {
        return null; // Unreadable or unsupported image — leave it without dimensions.
      }
    }),
  );
  return Object.fromEntries(results.filter((r) => r !== null));
}

const imageDims = await getImageDims();

/**
 * Rewrite relative refs in rendered HTML so they resolve against the page's
 * directory URL. A post at posts/2026/x.md is served at /2026/x/, whose base
 * is one segment deeper than the file's own directory — prefixing '../'
 * cancels that out:
 *   <a href="./other.md">   -> ../other/      -> /2026/other/
 *   <img src="img/f.png">   -> ../img/f.png   -> /2026/img/f.png
 * External URLs, absolute paths and anchors are left untouched.
 */
function rewriteRefs(html: string): string {
  return html.replace(/\b(src|href)="([^"]*)"/g, (_all, attr: string, target: string) => {
    if (/^(https?:)?\/\//i.test(target) || target.startsWith('/') || target.startsWith('#')) {
      return _all;
    }
    const clean = target.replace(/^\.\//, '');
    if (clean.endsWith('.md')) {
      return `${attr}="../${clean.slice(0, -'.md'.length)}/"`;
    }
    return `${attr}="../${clean}"`;
  });
}

/**
 * Custom image renderer adding width/height from imageDims. Markdown image
 * srcs are relative to the post's own directory, resolved against it before
 * the lookup. marked.use() merges the renderer (a partial `renderer` option
 * in parse() would replace the whole one), so the post's directory is passed
 * via a module-level variable set before each parse.
 */
let currentPostDir = '';
marked.use({
  renderer: {
    image(this: Renderer, token: Tokens.Image): string {
      const clean = token.href.replace(/^\.\//, '');
      const dims = imageDims[`${currentPostDir}${clean}`];
      const dimsAttr = dims ? ` width="${dims.width}" height="${dims.height}"` : '';
      return `<img src="${token.href}" alt="${token.text ?? ''}"${dimsAttr}>`;
    },
  },
});

function renderMarkdown(markdown: string, urlPath: string): string {
  currentPostDir = urlPath.includes('/') ? `${urlPath.split('/').slice(0, -1).join('/')}/` : '';
  return marked.parse(markdown, { async: false }) as string;
}

/** Fallback title derived from the slug: 'my-post' -> 'My Post'. */
function extractTitle(urlPath: string): string {
  return urlPath
    .split('/')
    .pop()!
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Fallback excerpt from rendered HTML: first <p> content, tags stripped. */
function extractExcerptFromHtml(html: string): string {
  const first = html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
  return first.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function getPostMetas(): Promise<PostMeta[]> {
  const files = postFiles.filter((f) => f.endsWith('.md'));

  // Run all git queries concurrently — each is an independent process spawn.
  const results = await Promise.all(
    files.map(async (file): Promise<PostMeta | null> => {
      try {
        const { stdout } = await execFileAsync(
          'git',
          [
            'log',
            // Only the commit that added the file — its creation date, so
            // later edits don't change the post's date metadata.
            '--diff-filter=A',
            '--format=%ad',
            // ISO 8601 with time part — parseable by new Date() in blog.ts.
            '--date=format:%Y-%m-%dT%H:%M:%S%z',
            '--',
            file,
          ],
          { cwd: postsDir, encoding: 'utf-8' },
        );
        const out = stdout.trim();
        if (!out) return null; // No commit for this file yet — skip it.
        const date = out.split('\n')[0];
        // Parse frontmatter once here so app code never needs gray-matter
        // (which doesn't work in the browser). Unquoted YAML dates become
        // Date objects — normalize them to ISO strings.
        const { data, content } = matter(readFileSync(join(postsDir, file), 'utf-8'));
        const pick = (key: string): string | undefined => {
          const value = data[key];
          if (typeof value === 'string') return value;
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'number' || typeof value === 'boolean') return String(value);
          return undefined;
        };
        const urlPath = file.replace(/\.md$/, '');
        // Render the body (frontmatter stripped) to HTML here, so app code
        // never needs marked either.
        const html = rewriteRefs(renderMarkdown(content, urlPath));
        // Effective title/excerpt resolved here too: frontmatter wins, then
        // the markdown heading / first paragraph, then the slug.
        const title = pick('title') ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? extractTitle(urlPath);
        return {
          urlPath,
          path: file,
          date,
          indexed: /^\d+\//.test(file),
          frontmatter: {
            title: pick('title'),
            date: pick('date'),
            excerpt: pick('excerpt'),
          },
          title,
          excerpt: pick('excerpt') ?? extractExcerptFromHtml(html),
          html,
        };
      } catch {
        return null; // Not a git repo or git unavailable — skip.
      }
    }),
  );
  return results.filter((m) => m !== null);
}

// Mutable so dev-mode file watching can refresh it (see postMetaPlugin).
let postMetas = await getPostMetas();

const virtualPostMeta = 'virtual:post-meta';

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
function buildRssXml(): string {
  const feed = new Feed({
    title: 'My Blog',
    description: 'Static-prerendered Solid blog demo.',
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'fi',
    copyright: '',
  });

  // Newest first, by the effective date (frontmatter overrides git date).
  // Only indexed posts appear in the feed.
  const items = [...postMetas]
    .filter((m) => m.indexed)
    .map((meta) => {
      const url = `${SITE_URL}/${meta.urlPath}/`;
      const md = readFileSync(join(postsDir, meta.path), 'utf-8');
      const fm = meta.frontmatter;
      // Frontmatter overrides: title beats `# Heading`, date beats git date.
      const title =
        fm.title ?? md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? meta.urlPath.split('/').pop()!;
      return { url, title, date: new Date(fm.date ?? meta.date) };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

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
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/rss.xml') return next();
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(buildRssXml());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'rss.xml', source: buildRssXml() });
    },
  };
}

// Exposes post data to app code. Split into two parts to keep the JS bundle
// small:
//   - virtual:post-meta       -> lightweight index (no html) for the blog
//                                list/RSS-style consumers
//   - /posts-data/<urlPath>.json -> per-post JSON files with the full html,
//                                emitted as static assets at build time and
//                                served by middleware in dev. Fetched lazily
//                                by route loaders on client navigation.
// In dev mode it also watches posts/ for markdown changes and invalidates
// the virtual module, so editing a post live-reloads without restarting.
function postMetaPlugin(): Plugin {
  const resolvedId = '\0' + virtualPostMeta;
  const generateVirtualModule = () =>
    `export const postMetas = ${JSON.stringify(
      postMetas.map(({ html, ...rest }) => rest),
    )};`;
  return {
    name: 'post-meta-virtual-module',
    resolveId(id) {
      if (id === virtualPostMeta) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      return generateVirtualModule();
    },
    configureServer(server) {
      server.watcher.add(postsDir);
      let refreshing = false;

      // Live-reload post metas in dev server when updating a post file.
      const refresh = async () => {
        if (refreshing) return; // Editors often fire several events per save.
        refreshing = true;
        try {
          postMetas = await getPostMetas();
          const mod = server.moduleGraph.getModuleById(resolvedId);
          if (mod) await server.moduleGraph.invalidateModule(mod);
        } finally {
          refreshing = false;
        }
      };
      server.watcher.on('change', refresh);
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

// Emits each post's full data as /posts-data/<urlPath>.json (client build
// only). Dev mode serves the same paths from memory via middleware.
function postDataPlugin(): Plugin {
  const jsonFor = (meta: PostMeta) => JSON.stringify(meta);
  return {
    name: 'post-data-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const match = url.match(/^\/posts-data\/(.+)\.json$/);
        if (!match) return next();
        const meta = postMetas.find((m) => m.urlPath === match[1]);
        if (!meta) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(jsonFor(meta));
      });
    },
    generateBundle() {
      // Only the client build produces deployable static assets.
      if (this.environment.name !== 'client') return;
      for (const meta of postMetas) {
        this.emitFile({
          type: 'asset',
          fileName: `posts-data/${meta.urlPath}.json`,
          source: jsonFor(meta),
        });
      }
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
    postDataPlugin(),
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
