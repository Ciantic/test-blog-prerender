/**
 * Build-time post processing: git dates, frontmatter parsing, markdown
 * rendering. Runs only in Node (vite.config.ts and the server side of the
 * static server functions in src/lib/blog.ts) — never in the browser.
 *
 * The URL structure mirrors the posts/ directory exactly:
 *   posts/foo.md              -> /foo/
 *   posts/2026/my-post.md     -> /2026/my-post/
 *   posts/img/test-image.png  -> /img/test-image.png
 * Posts with no commit yet are skipped entirely (they don't exist as far as
 * the blog is concerned).
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import type { Renderer, Tokens } from 'marked';
import { imageSize } from 'image-size';
import type { PostMeta, PostMetaIndex } from '../post-meta';

// This module runs both from the source tree (vite.config.ts, dev SSR) and
// from the built server bundle (dist/server/assets/), so a fixed relative
// path like '../../posts' breaks after bundling. Walk up from this module's
// directory until we find the repo's posts/ folder.
function findPostsDir(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 10 && dir; i++) {
    const candidate = join(dir, 'posts');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Could not locate the posts/ directory from ' + import.meta.dirname);
}

export const postsDir = findPostsDir();

/** All files under posts/ recursively, as slash-separated relative paths. */
export const postFiles = readdirSync(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name).slice(postsDir.length + 1).replaceAll('\\', '/'));

const execFileAsync = promisify(execFile);

// --- Image dimensions ------------------------------------------------------
//
// Measures every image in posts/ once at startup so markdown-rendered <img>
// tags can include width/height (prevents layout shift / CLS). Keyed by the
// path inside posts/, e.g. '2026/img/test-image.png'. Computed before any
// rendering because the markdown renderer uses it.
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

/**
 * Produce full metadata for a single post file: git creation date,
 * frontmatter, rendered HTML, effective title/excerpt/date. Returns null for
 * posts with no commit yet (they don't exist as far as the blog is
 * concerned). Shared by both the single-post lookup and the index scan, so
 * both paths resolve posts identically.
 */
async function computePostMeta(file: string): Promise<PostMeta | null> {
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
    // Effective publish date: frontmatter overrides git date. Normalized
    // so app code never needs Date parsing: date-only posts stay
    // YYYY-MM-DD (Finnish formatter + year grouping), datetimes become
    // YYYY-MM-DDTHH:mm. Sorting works lexicographically on both forms.
    const fmDate = data.date instanceof Date ? data.date : undefined;
    const parsed = fmDate ?? new Date(pick('date') ?? date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Post ${file} has an unparseable date`);
    }
    const iso = parsed.toISOString();
    const effectiveDate = iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16);
    return {
      urlPath,
      path: file,
      date: effectiveDate,
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
}

/**
 * Scan posts/ and produce full metadata for every committed post, running
 * all per-post computations concurrently — each is an independent process
 * spawn. Called on demand by the static server functions in src/lib/blog.ts
 * during SSR/prerender, and by vite.config.ts (RSS feed).
 */
async function getPostMetas(): Promise<PostMeta[]> {
  const files = postFiles.filter((f) => f.endsWith('.md'));
  const results = await Promise.all(files.map(computePostMeta));
  return results.filter((m) => m !== null);
}

/**
 * Full data for a single post (including rendered HTML), by URL path.
 * Used by the getPost() static server function in src/lib/blog.ts.
 *
 * Computes only the requested post (one git spawn + one render) instead of
 * scanning every post — no O(N) work per lookup, no cache needed.
 */
export async function getPostData(urlPath: string): Promise<PostMeta | undefined> {
  const file = `${urlPath}.md`;
  if (!postFiles.includes(file)) return undefined;
  return (await computePostMeta(file)) ?? undefined;
}

/**
 * Lightweight index of listed posts (those inside a numeric directory)
 * with their effective publish date resolved, newest first. No rendered
 * HTML, so the whole index fits in a single server-function cache file.
 * Used by the getPosts() static server function in src/lib/blog.ts.
 */
export async function getPostIndexData(): Promise<PostMetaIndex[]> {
  return (await getPostMetas())
    .filter((meta) => meta.indexed)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ html: _html, ...index }) => index);
}
