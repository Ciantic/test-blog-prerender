/// <reference types="vite/client" />

declare module 'virtual:post-meta' {
  export interface PostMeta {
    slug: string;
    year: number;
  }
  export const postMetas: PostMeta[];
}
