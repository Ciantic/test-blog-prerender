/// <reference types="vite/client" />

declare module 'virtual:post-meta' {
  export interface PostMeta {
    /** URL path inside the site (no leading/trailing slash), e.g. '2026/my-post'. */
    urlPath: string;
    /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
    date: string;
    /** Whether the post appears in the blog index and RSS feed. */
    indexed: boolean;
  }
  export const postMetas: PostMeta[];
}
