// Blog data access. Posts are markdown files in posts/ (its own git repo),
// inlined at build time via import.meta.glob; dates come from git via the
// virtual:post-meta module (see vite.config.ts). URLs mirror posts/ exactly:
//   posts/2026/my-post.md     -> /2026/my-post/
//   posts/img/test-image.png  -> /2026/img/test-image.png

import { marked } from 'marked';
import type { Renderer, Tokens } from 'marked';
import matter from 'gray-matter';
import { postMetas, imageDims } from 'virtual:post-meta';

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

/**
 * Frontmatter via gray-matter: a leading `---` block parsed as YAML.
 * Supports the scalar fields this blog uses (title, date, excerpt); unknown
 * keys are ignored. Posts without frontmatter parse as-is.
 */
function parseFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
} {
  const { data, content } = matter(markdown);
  // Coerce to strings — YAML may parse dates as Date objects, etc.
  const strData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') strData[key] = value;
    else if (value instanceof Date) strData[key] = value.toISOString().slice(0, 10);
    else if (value != null) strData[key] = String(value);
  }
  return { data: strData, body: content };
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

/**
 * Custom image renderer that adds width/height attributes from the
 * build-time-measured dimensions (see vite.config.ts). Markdown image srcs
 * are relative to the post's own directory, so they're resolved against it
 * before looking up the dimensions map (keyed by path inside posts/).
 * Images without a known size render unchanged.
 *
 * marked.use() merges the renderer (a partial `renderer` option in parse()
 * would replace the whole one), so the post's directory is passed via a
 * module-level variable set before each parse.
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

const metaByUrlPath = new Map(postMetas.map((meta) => [meta.urlPath, meta]));

// Only include posts that have a git commit (i.e. appear in postMetas).
const posts = Object.entries(modules)
  .map(([path, markdown]) => {
    const urlPath = urlPathFromPath(path);
    const meta = metaByUrlPath.get(urlPath);
    if (!meta) return undefined;
    const { data, body } = parseFrontmatter(markdown);
    return {
      urlPath,
      // Frontmatter date overrides the git-derived publish date.
      date: data.date ?? meta.date,
      title: data.title ?? extractTitle(body, urlPath),
      excerpt: data.excerpt ?? extractExcerpt(body),
      html: rewriteRefs(renderMarkdown(body, urlPath)),
    };
  })
  .filter((post): post is BlogPost => post !== undefined);

const byUrlPath = new Map(posts.map((post) => [post.urlPath, post]));

/** Index entries for listed posts only (those inside a numeric directory), newest first. */
export function getPosts(): BlogIndexEntry[] {
  return postMetas
    .filter((meta) => meta.indexed)
    .map((meta) => byUrlPath.get(meta.urlPath))
    .filter((post): post is BlogPost => post !== undefined)
    .map(({ urlPath, date, title, excerpt }) => ({ urlPath, date, title, excerpt }))
    .sort((a, b) => b.date.localeCompare(a.date));
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
