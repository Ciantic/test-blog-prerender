// Shared blog data access.
//
// Posts live as markdown files in the `posts/` directory (its own git repo).
// The markdown is inlined at build time via Vite's `import.meta.glob`, and
// each post's publish date comes from its git add date, provided by the
// `virtual:post-meta` module (see vite.config.ts). Posts without a git
// commit are excluded from the virtual module and therefore from the blog.
//
// The URL structure mirrors the posts/ directory exactly:
//   posts/foo.md              -> /foo/
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /img/test-image.png

import { marked } from 'marked';
import { postMetas } from 'virtual:post-meta';

export interface BlogPost {
  /** URL path (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
  date: string;
  title: string;
  excerpt: string;
  /** Rendered HTML from the post's markdown body. */
  html: string;
}

export interface BlogIndexEntry {
  urlPath: string;
  date: string;
  title: string;
  excerpt: string;
}

// Load every markdown file under posts/ (recursively) as a raw string. Eager
// so we can build the index synchronously on both server and client.
const modules = import.meta.glob('/posts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** '/posts/2026/foo.md' -> '2026/foo' */
function urlPathFromPath(path: string): string {
  return path.replace(/^\/posts\//, '').replace(/\.md$/, '');
}

/** Directory of a markdown file inside posts/, '' if top-level. */
function dirFromPath(path: string): string {
  const rel = path.replace(/^\/posts\//, '');
  return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
}

/** First `# Heading` line, or a title-cased fallback derived from the slug. */
function extractTitle(markdown: string, urlPath: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return urlPath
    .split('/')
    .pop()!
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Everything before the first heading (or first blank line after it) is used
 * as the excerpt; falls back to the first paragraph of the body.
 */
function extractExcerpt(markdown: string): string {
  const withoutTitle = markdown.replace(/^#\s+.+$/m, '').trim();
  const paragraph = withoutTitle.split(/\n\s*\n/)[0] ?? '';
  return paragraph.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a link/image target like './foo.md' or '../img/x.png' against the
 * directory of the markdown file that contains it. Returns a normalized,
 * posts-repo-root-relative path (no leading slash), or undefined for
 * absolute/external/anchor targets.
 */
function resolveRelative(fromDir: string, target: string): string | undefined {
  if (/^(https?:)?\/\//i.test(target) || target.startsWith('/') || target.startsWith('#')) {
    return undefined;
  }
  const parts = `${fromDir}/${target}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * Rewrite references in a post's *rendered HTML* so relative refs map onto
 * the site's URL structure (which mirrors the posts/ layout):
 *
 *   <a href="./other.md">     -> /other/          (post-to-post links)
 *   <img src="img/foo.png">   -> /img/foo.png     (embedded assets)
 *
 * Doing this after markdown->HTML conversion is more robust than regexing
 * the markdown source: marked normalizes every link syntax (inline,
 * reference-style, titles, angle brackets) into plain src/href attributes.
 *
 * External URLs, absolute paths and anchors are left untouched.
 */
function rewriteRefs(html: string, dir: string): string {
  const metaByUrlPath = new Map(postMetas.map((m) => [m.urlPath, m]));

  return html.replace(/\b(src|href)="([^"]*)"/g, (_all, attr: string, target: string) => {
    const resolved = resolveRelative(dir, target);
    if (!resolved) return _all;
    if (resolved.endsWith('.md')) {
      // Link to another post: translate to its blog URL.
      const meta = metaByUrlPath.get(resolved.replace(/\.md$/, ''));
      if (meta) return `${attr}="/${meta.urlPath}/"`;
    }
    // Assets and other files live at the root, mirroring posts/.
    return `${attr}="/${resolved}"`;
  });
}

const metaByUrlPath = new Map(postMetas.map((meta) => [meta.urlPath, meta]));

// Only include posts that have a git commit (i.e. appear in postMetas).
const posts = Object.entries(modules)
  .map(([path, markdown]) => {
    const urlPath = urlPathFromPath(path);
    const dir = dirFromPath(path);
    const meta = metaByUrlPath.get(urlPath);
    if (!meta) return undefined; // Uncommitted — skip.
    return {
      urlPath,
      date: meta.date,
      title: extractTitle(markdown, urlPath),
      excerpt: extractExcerpt(markdown),
      html: rewriteRefs(marked.parse(markdown, { async: false }) as string, dir),
    };
  })
  .filter((post): post is BlogPost => post !== undefined);

const byUrlPath = new Map(posts.map((post) => [post.urlPath, post]));

export function getPosts(): BlogIndexEntry[] {
  // Only posts inside a numeric directory (e.g. 2026/foo.md) are listed;
  // other committed posts are routable but unlisted.
  return postMetas
    .filter((meta) => meta.indexed)
    .map((meta) => byUrlPath.get(meta.urlPath))
    .filter((post): post is BlogPost => post !== undefined)
    .map(({ urlPath, date, title, excerpt }) => ({ urlPath, date, title, excerpt }));
}

/** Looks up a post by its URL path, e.g. getPost('2026/hello-world'). */
export function getPost(urlPath: string): BlogPost | undefined {
  return byUrlPath.get(urlPath);
}

/** Formats a YYYY-MM-DD date in Finnish style, e.g. 30.1.2026. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
