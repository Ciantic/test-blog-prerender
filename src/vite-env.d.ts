/// <reference types="vite/client" />

declare module 'virtual:post-meta' {
  export interface PostMeta {
    slug: string;
    year: number;
    /** Commit date as YYYY-MM-DD, e.g. 2026-01-30. */
    date: string;
  }
  export const postMetas: PostMeta[];
}
