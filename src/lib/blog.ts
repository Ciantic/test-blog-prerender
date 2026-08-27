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

let serverMetasPromise: Promise<PostMeta[]> | undefined;

/**
 * Load the full post data on the server (memoized). Dynamic import keeps the
 * module out of the client bundle entirely; on SSR/prerender it always
 * reflects the current in-memory postMetas (fresh in dev live reload too).
 */
function ensureServerMetas(): Promise<PostMeta[]> {
  serverMetasPromise ??= import('virtual:post-data-server').then(
    ({ fullPostMetas }) => fullPostMetas,
  );
  return serverMetasPromise;
}

/**
 * Listed posts (those inside a numeric directory) with their effective
 * publish date resolved, newest first.
 *
 * SSR/prerender reads the in-memory virtual module; on the client it fetches
 * /posts-data/index.json so the post list isn't bundled into JS.
 */
export async function getPosts(): Promise<PostMetaIndex[]> {
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
export async function getPost(urlPath: string): Promise<PostMeta | undefined> {
  if (import.meta.env.SSR) {
    return (await ensureServerMetas()).find((m) => m.urlPath === urlPath);
  }
  const res = await fetch(`/posts-data/${urlPath}.json`);
  if (!res.ok) return undefined;
  return (await res.json()) as PostMeta;
}

/** Formats a post date in Finnish style (j.n.Y), e.g. 30.1.2026. Any
 *  time part is ignored for display; it remains in the raw date string
 *  for sorting and the <time datetime> attribute. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
