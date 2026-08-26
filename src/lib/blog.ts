// Blog data access. Posts are markdown files in posts/ (its own git repo),
// inlined at build time via import.meta.glob; dates come from git via the
// virtual:post-meta module (see vite.config.ts). URLs mirror posts/ exactly:
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /2026/img/test-image.png

import { marked } from 'marked';
import { postMetas } from 'virtual:post-meta';

export interface BlogPost {
  /** URL path (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
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

const modules = import.meta.glob('/posts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** '/posts/2026/foo.md' -> '2026/foo' */
function urlPathFromPath(path: string): string {
  return path.replace(/^\/posts\//, '').replace(/\.md$/, '');
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

/** First paragraph after the title heading. */
function extractExcerpt(markdown: string): string {
  const withoutTitle = markdown.replace(/^#\s+.+$/m, '').trim();
  const paragraph = withoutTitle.split(/\n\s*\n/)[0] ?? '';
  return paragraph.replace(/\s+/g, ' ').trim();
}

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

const metaByUrlPath = new Map(postMetas.map((meta) => [meta.urlPath, meta]));

// Only include posts that have a git commit (i.e. appear in postMetas).
const posts = Object.entries(modules)
  .map(([path, markdown]) => {
    const urlPath = urlPathFromPath(path);
    const meta = metaByUrlPath.get(urlPath);
    if (!meta) return undefined;
    return {
      urlPath,
      date: meta.date,
      title: extractTitle(markdown, urlPath),
      excerpt: extractExcerpt(markdown),
      html: rewriteRefs(marked.parse(markdown, { async: false }) as string),
    };
  })
  .filter((post): post is BlogPost => post !== undefined);

const byUrlPath = new Map(posts.map((post) => [post.urlPath, post]));

/** Index entries for listed posts only (those inside a numeric directory). */
export function getPosts(): BlogIndexEntry[] {
  return postMetas
    .filter((meta) => meta.indexed)
    .map((meta) => byUrlPath.get(meta.urlPath))
    .filter((post): post is BlogPost => post !== undefined)
    .map(({ urlPath, date, title, excerpt }) => ({ urlPath, date, title, excerpt }));
}

export function getPost(urlPath: string): BlogPost | undefined {
  return byUrlPath.get(urlPath);
}

/** Formats a YYYY-MM-DD date in Finnish style, e.g. 30.1.2026. */
export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
