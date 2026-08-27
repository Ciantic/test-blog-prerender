/// <reference types="vite/client" />

// The PostMeta interfaces live in src/post-meta.ts (shared with
// vite.config.ts); re-export them here so the virtual module is fully typed.
declare module 'virtual:post-data-server' {
  /** Full post data including html — server-side (SSR/prerender) use only. */
  export const fullPostMetas: import('./post-meta').PostMeta[];
}
