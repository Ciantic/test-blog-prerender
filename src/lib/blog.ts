// Blog data access. All heavy lifting (frontmatter parsing, markdown
// rendering, git dates) happens at build time in vite.config.ts. Data is
// split to keep the JS bundle small:
//   - SSR/prerender: virtual:post-data-server (dynamic import so it never
//     lands in the client bundle), backed by in-memory build data
//   - Client: static JSON under /posts-data/ fetched lazily
//     (index.json for the list, <urlPath>.json per post)
// URLs mirror posts/ exactly:
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /2026/img/test-image.png
import type { PostMeta, PostMetaIndex } from '../post-meta';

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

/** Resolve the effective publish date: frontmatter overrides git date. */
function effectiveDate(meta: PostMetaIndex): string {
  const publishDate = parseDateValue(meta.frontmatter.date ?? meta.date);
  if (!publishDate) throw new Error(`Post ${meta.urlPath} has an unparseable date`);
  return formatPostDate(publishDate);
}

function toIndexEntry(meta: PostMetaIndex): BlogIndexEntry {
  return {
    urlPath: meta.urlPath,
    date: effectiveDate(meta),
    title: meta.title,
    excerpt: meta.excerpt,
  };
}

/**
 * Load the full post data on the server. Dynamic import keeps the module out
 * of the client bundle entirely; on SSR/prerender it always reflects the
 * current in-memory postMetas (fresh in dev live reload too).
 */
async function loadServerMetas(): Promise<PostMeta[]> {
  if (!import.meta.env.SSR) return [];
  const { fullPostMetas } = await import('virtual:post-data-server');
  return fullPostMetas;
}

const postByUrlPath = new Map(
  // Built lazily on first use; safe because loaders run after this module's
  // top-level await resolves.
  [] as [string, BlogIndexEntry][],
);
let serverMetasPromise: Promise<PostMeta[]> | undefined;

function ensureServerMetas(): Promise<PostMeta[]> {
  serverMetasPromise ??= loadServerMetas();
  return serverMetasPromise;
}

/**
 * Index entries for listed posts only (those inside a numeric directory),
 * newest first.
 *
 * SSR/prerender reads the in-memory virtual module; on the client it fetches
 * /posts-data/index.json so the post list isn't bundled into JS.
 */
export async function getPosts(): Promise<BlogIndexEntry[]> {
  let metas: PostMetaIndex[];
  if (import.meta.env.SSR) {
    metas = await ensureServerMetas();
  } else {
    const res = await fetch('/posts-data/index.json');
    if (!res.ok) return [];
    metas = (await res.json()) as PostMetaIndex[];
  }
  return metas
    .filter((meta) => meta.indexed)
    .map(toIndexEntry)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fetch a single post's full data (including rendered HTML).
 *
 * Data sources by environment:
 *   - SSR/prerender: virtual:post-data-server, which always reflects the
 *     current in-memory postMetas (fresh in dev live reload too).
 *   - Client: per-post static JSON at /posts-data/<urlPath>.json, fetched
 *     lazily so client navigation only loads the post being viewed.
 */
export async function getPost(urlPath: string): Promise<BlogPost | undefined> {
  if (import.meta.env.SSR) {
    const meta = (await ensureServerMetas()).find((m) => m.urlPath === urlPath);
    return meta ? { ...toIndexEntry(meta), html: meta.html } : undefined;
  }
  const res = await fetch(`/posts-data/${urlPath}.json`);
  if (!res.ok) return undefined;
  const fetched = (await res.json()) as PostMeta;
  return {
    urlPath: fetched.urlPath,
    date: effectiveDate(fetched),
    title: fetched.title,
    excerpt: fetched.excerpt,
    html: fetched.html,
  };
}

/** Formats a post date in Finnish style (j.n.Y), e.g. 30.1.2026. Any
 *  time part is ignored for display; it remains in the raw date string
 *  for sorting and the <time datetime> attribute. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
