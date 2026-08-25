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

export interface BlogPost {
  slug: string;
  /** Year of the post's last git commit. */
  year: number;
  title: string;
  excerpt: string;
  /** Rendered HTML from the post's markdown body. */
  html: string;
}

export interface BlogIndexEntry {
  slug: string;
  year: number;
  title: string;
  excerpt: string;
}

// Load every markdown file under posts/ as a raw string. Eager so we can
// build the index synchronously on both server and client.
const modules = import.meta.glob('/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/, '');
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

const metaBySlug = new Map(postMetas.map((meta) => [meta.slug, meta.year]));

// Only include posts that have a git commit (i.e. appear in postMetas).
const posts = Object.entries(modules)
  .map(([path, markdown]) => {
    const slug = slugFromPath(path);
    const year = metaBySlug.get(slug);
    if (year === undefined) return undefined; // Uncommitted — skip.
    return {
      slug,
      year,
      title: extractTitle(markdown, slug),
      excerpt: extractExcerpt(markdown),
      html: marked.parse(markdown, { async: false }) as string,
    };
  })
  .filter((post): post is BlogPost => post !== undefined);

const byYearSlug = new Map(posts.map((post) => [`${post.year}/${post.slug}`, post]));

export function getPosts(): BlogIndexEntry[] {
  return posts.map(({ slug, year, title, excerpt }) => ({ slug, year, title, excerpt }));
}

export function getPost(year: number | string, slug: string): BlogPost | undefined {
  return byYearSlug.get(`${year}/${slug}`);
}
