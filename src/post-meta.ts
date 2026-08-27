/**
 * Post metadata produced at build time by vite.config.ts and shipped to app
 * code through the virtual:post-meta modules. This file is the single source
 * of truth for the shapes — both vite.config.ts (producer) and src/lib/blog.ts
 * (consumer) import it from here.
 */
export interface PostMetaIndex {
  /** URL path inside the site (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Path of the markdown file inside posts/, e.g. '2026/my-post.md'. */
  path: string;
  /**
   * Effective publish date, resolved at build time (frontmatter overrides
   * git commit date) and normalized: YYYY-MM-DD for date-only posts,
   * YYYY-MM-DDTHH:mm when a time part is present. Sorts lexicographically.
   */
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
}

/** Full post data: everything in PostMetaIndex plus the rendered HTML. */
export interface PostMeta extends PostMetaIndex {
  /** Markdown body rendered to HTML at build time (frontmatter stripped). */
  html: string;
}
