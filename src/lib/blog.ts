// Blog data access. All heavy lifting (frontmatter parsing, markdown
// rendering, git dates) happens at build time in src/lib/markdown.ts. Data
// is exposed through *static server functions*: during prerendering the
// handlers run on the server (calling getPostMetas() directly) and their
// results are cached as static JSON under /__tsr/staticServerFnCache/,
// which the client fetches on subsequent navigations — no runtime server
// needed.
// URLs mirror posts/ exactly:
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /2026/img/test-image.png
import { createServerFn } from '@tanstack/solid-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import type { PostMeta } from '../post-meta';

/**
 * Listed posts (those inside a numeric directory) with their effective
 * publish date resolved, newest first. Not memoized: like getPost below,
 * it calls into markdown.ts on every invocation so dev live reload stays
 * fresh; the static server function cache makes this cheap in production.
 *
 * Static server function: runs on the server during prerendering, cached
 * as static JSON for client-side navigations. The list is lightweight
 * (no html), so the whole index lands in a single cache file.
 */
export const getPosts = createServerFn({ method: 'GET' })
  // `as any`: the alpha static-functions package types its middleware against
  // an older start-client-core than our rc solid-start uses, so TS sees a
  // version mismatch. Runtime API is identical; drop the cast once versions
  // align.
  .middleware([staticFunctionMiddleware as any])
  .handler(async () => {
    // Dynamic import so the markdown module (and all post HTML) stays out
    // of the client bundle entirely.
    const { getPostIndexData } = await import('./markdown');
    return getPostIndexData();
  });

/**
 * Fetch a single post's full data (including rendered HTML).
 *
 * Static server function: runs on the server during prerendering, cached
 * as static JSON for client-side navigations (one cache file per post,
 * keyed by the urlPath payload).
 */
export const getPost = createServerFn({ method: 'GET' })
  .validator((urlPath: string) => urlPath)
  // `as any`: the alpha static-functions package types its middleware against
  // an older start-client-core than our rc solid-start uses, so TS sees a
  // version mismatch. Runtime API is identical; drop the cast once versions
  // align.
  .middleware([staticFunctionMiddleware as any])
  .handler(async ({ data: urlPath }) => {
    const { getPostData } = await import('./markdown');
    return getPostData(urlPath);
  });

/** Formats a post date in Finnish style (j.n.Y), e.g. 30.1.2026. Any
 *  time part is ignored for display; it remains in the raw date string
 *  for sorting and the <time datetime> attribute. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
