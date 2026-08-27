/**
 * Post metadata produced at build time by vite.config.ts and shipped to app
 * code through the virtual:post-meta module. This file is the single source
 * of truth for the shape — both vite.config.ts (producer) and src/lib/blog.ts
 * (consumer) import it from here.
 */
export interface PostMeta {
  /** URL path inside the site (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Path of the markdown file inside posts/, e.g. '2026/my-post.md'. */
  path: string;
  /** Commit date as ISO 8601, e.g. 2026-01-30T14:45:02+02:00. */
  date: string;
  /**
   * Whether the post appears in the blog index and RSS feed. Only posts
   * inside a numeric directory (e.g. \d+/my-post.md) are listed; other
   * top-level files are still routable but unlisted.
   */
  indexed: boolean;
  /** Frontmatter parsed at build time. Only supported scalar fields kept. */
  frontmatter: {
    title?: string;
    date?: string;
    excerpt?: string;
  };
  /** Effective title: frontmatter > first `# Heading` > slug-derived. */
  title: string;
  /** Effective excerpt: frontmatter > first paragraph of rendered HTML. */
  excerpt: string;
  /** Markdown body rendered to HTML at build time (frontmatter stripped). */
  html: string;
}
