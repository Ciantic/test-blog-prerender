/**
 * Post metadata produced by src/markdown/posts.ts and consumed by app code.
 * This file is the single source of truth for the shapes — both
 * vite.config.ts (producer) and src/lib/api.ts (consumer) import it from here.
 */
export interface PostMetaIndex {
  /** URL path inside the site (no leading/trailing slash), e.g. '2026/my-post'. */
  urlPath: string;
  /** Path of the markdown file inside posts/, e.g. '2026/my-post.md'. */
  path: string;
  /** Date is determined first from frontmatter field date, secondarily from
   * git commit date, and tertiarily from file modification time */
  date: Date;
  draft: boolean;
  /** Is the markdown file part of the blog/RSS index (listed) as post */
  indexed: boolean;
  title: string;
  excerpt: string;
}

/** Full post data: everything in PostMetaIndex plus the rendered HTML. */
export interface PostMeta extends PostMetaIndex {
  /** Markdown body rendered to HTML at build time (frontmatter stripped). */
  html: string;
  /**
   * Local files the post references (image srcs / link hrefs), relative to
   * the post's own directory (e.g. "img/a.png"). Collected by the markdown
   * pipeline and used by the build to emit only referenced assets.
   */
  assets: string[];
  /** URLs the post references: external links, absolute paths, `.md` post links. */
  links: string[];
}
