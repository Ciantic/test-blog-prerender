// Shared blog data access.
//
// Posts live as markdown files in the `posts/` directory (its own git repo).
// The markdown is inlined at build time via Vite's `import.meta.glob`, and
// each post's publish year comes from its last git commit date, provided by
// the `virtual:post-meta` module (see vite.config.ts). Posts without a git
// commit are excluded from the virtual module and therefore from the blog.
//
// URLs are /<year>/<slug>/, e.g. /2026/hello-world/.

import { marked } from 'marked';
import { postMetas } from 'virtual:post-meta';

// Must match POST_ASSETS_PREFIX in vite.config.ts.
const POST_ASSETS_PREFIX = '/assets/posts';

export interface BlogPost {
  slug: string;
  /** Year of the post's last git commit. */
  year: number;
  /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
  date: string;
  title: string;
  excerpt: string;
  /** Rendered HTML from the post's markdown body. */
  html: string;
}

export interface BlogIndexEntry {
  slug: string;
  year: number;
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

function slugFromPath(path: string): string {
  // '/posts/2026/foo.md' -> 'foo' — directories never appear in URLs.
  return path.split('/').pop()!.replace(/\.md$/, '');
}

/** Directory of a markdown file inside posts/, '' if top-level. */
function dirFromPath(path: string): string {
  const rel = path.replace(/^\/posts\//, '');
  return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
}

/** First `# Heading` line, or a title-cased fallback derived from the slug. */
function extractTitle(markdown: string, slug: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return slug
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
 * Rewrite references in a post's *rendered HTML* so the posts repo's
 * internal structure maps onto the blog's URL structure:
 *
 *   <a href="./other.md">     -> /<year>/other/          (post-to-post links)
 *   <img src="img/foo.png"> -> /assets/posts/img/foo.png (embedded assets)
 *
 * Assets are served from a single global location mirroring the posts repo's
 * structure (served/copied by postsAssetsPlugin in vite.config.ts).
 *
 * Doing this after markdown->HTML conversion is more robust than regexing
 * the markdown source: marked normalizes every link syntax (inline,
 * reference-style, titles, angle brackets) into plain src/href attributes.
 *
 * External URLs, absolute paths and anchors are left untouched.
 */
function rewriteRefs(html: string, dir: string): string {
  const metaBySlug = new Map(postMetas.map((m) => [m.slug, m]));

  return html.replace(/\b(src|href)="([^"]*)"/g, (_all, attr: string, target: string) => {
    const resolved = resolveRelative(dir, target);
    if (!resolved) return _all;
    if (attr === 'src') {
      // Embedded asset: rebase onto the global posts asset location.
      return `${attr}="${POST_ASSETS_PREFIX}/${resolved}"`;
    }
    if (resolved.endsWith('.md')) {
      // Link to another post: translate to its blog URL.
      const meta = metaBySlug.get(resolved.replace(/\.md$/, ''));
      if (meta) return `${attr}="/${meta.year}/${meta.slug}/"`;
    }
    return `${attr}="/${resolved}"`; // Non-md relative link — root-relative path.
  });
}

const metaBySlug = new Map(postMetas.map((meta) => [meta.slug, meta]));

// Only include posts that have a git commit (i.e. appear in postMetas).
const posts = Object.entries(modules)
  .map(([path, markdown]) => {
    const slug = slugFromPath(path);
    const dir = dirFromPath(path);
    const meta = metaBySlug.get(slug);
    if (!meta) return undefined; // Uncommitted — skip.
    return {
      slug,
      year: meta.year,
      date: meta.date,
      title: extractTitle(markdown, slug),
      excerpt: extractExcerpt(markdown),
      html: rewriteRefs(marked.parse(markdown, { async: false }) as string, dir),
    };
  })
  .filter((post): post is BlogPost => post !== undefined);

const byYearSlug = new Map(posts.map((post) => [`${post.year}/${post.slug}`, post]));

export function getPosts(): BlogIndexEntry[] {
  return posts.map(({ slug, year, date, title, excerpt }) => ({ slug, year, date, title, excerpt }));
}

export function getPost(year: number | string, slug: string): BlogPost | undefined {
  return byYearSlug.get(`${year}/${slug}`);
}

/** Formats a YYYY-MM-DD date in Finnish style, e.g. 30.1.2026. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
