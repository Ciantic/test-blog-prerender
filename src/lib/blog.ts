// Blog data access. All heavy lifting (frontmatter parsing, markdown
// rendering, git dates) happens at build time in vite.config.ts. Data is
// split to keep the JS bundle small:
//   - virtual:post-meta          -> lightweight index (no html)
//   - /posts-data/<urlPath>.json -> per-post JSON with full html, fetched
//                                   lazily by getPost()
// URLs mirror posts/ exactly:
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /2026/img/test-image.png

import { postMetas } from 'virtual:post-meta';
import type { PostMeta } from '../post-meta';

export interface BlogPost {
  /** URL path (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Publish date/time, normalized: YYYY-MM-DD or YYYY-MM-DDTHH:mm. */
  date: string;
  title: string;
  excerpt: string;
  html: string;
}

export interface BlogIndexEntry {
  urlPath: string;
  date: string;
  title: string;
  excerpt: string;
}

/**
 * Coerce a date-ish value into a Date. Accepts ISO strings (from frontmatter
 * or git) and epoch numbers.
 */
function parseDateValue(value: string | number): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Format a post date for storage/display: date-only posts stay `YYYY-MM-DD`
 * (so the Finnish formatter and year grouping work unchanged), while
 * datetimes with a time component render as `YYYY-MM-DDTHH:mm`.
 */
function formatPostDate(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16);
}

const metaByUrlPath = new Map(postMetas.map((meta) => [meta.urlPath, meta]));

// Reshape the build-time index entries. The only runtime logic left is
// resolving the effective publish date (frontmatter overrides git date).
const posts = postMetas.map((meta) => {
  const publishDate = parseDateValue(meta.frontmatter.date ?? meta.date);
  if (!publishDate) throw new Error(`Post ${meta.urlPath} has an unparseable date`);
  return {
    urlPath: meta.urlPath,
    date: formatPostDate(publishDate),
    title: meta.title,
    excerpt: meta.excerpt,
  };
});

const postByUrlPath = new Map(posts.map((post) => [post.urlPath, post]));

/** Index entries for listed posts only (those inside a numeric directory), newest first. */
export function getPosts(): BlogIndexEntry[] {
  return posts
    .filter((post) => metaByUrlPath.get(post.urlPath)?.indexed)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fetch a single post's full data (including rendered HTML). The data lives
 * in per-post static JSON files, so client-side navigation only loads the
 * post being viewed instead of every post bundled into JS.
 *
 * On the server (SSR/prerender) there is no HTTP server to fetch from, so
 * the JSON is read straight from dist/client/posts-data/ instead. In dev,
 * vite-plugin-solid's SSR environment also can't reach the middleware via a
 * relative fetch, so the same file read applies (posts-data/ may not exist
 * yet — fall back to an empty result).
 */
export async function getPost(urlPath: string): Promise<BlogPost | undefined> {
  const summary = postByUrlPath.get(urlPath);
  if (!summary) return undefined;
  if (import.meta.env.SSR) {
    try {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      // import.meta.dirname points at src/ in dev and dist/server in build;
      // resolve the client output relative to the project root instead.
      const root = process.cwd();
      const file = join(root, 'dist', 'client', 'posts-data', `${urlPath}.json`);
      const meta = JSON.parse(readFileSync(file, 'utf-8')) as PostMeta;
      return { ...summary, html: meta.html };
    } catch {
      return undefined;
    }
  }
  const res = await fetch(`/posts-data/${urlPath}.json`);
  if (!res.ok) return undefined;
  const meta = (await res.json()) as PostMeta;
  return { ...summary, html: meta.html };
}

/** Formats a post date in Finnish style (j.n.Y), e.g. 30.1.2026. Any
 *  time part is ignored for display; it remains in the raw date string
 *  for sorting and the <time datetime> attribute. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
