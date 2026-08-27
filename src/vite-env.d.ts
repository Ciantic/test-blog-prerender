/// <reference types="vite/client" />

// Type the custom env vars injected from vite.config.ts (see the `define`
// block there). Extending ImportMetaEnv gives type safety on
// import.meta.env.VITE_* anywhere in the codebase.
interface ImportMetaEnv {
  /** Resolved absolute path to the posts/ directory, injected at build time. */
  readonly VITE_POSTS_DIR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The PostMeta interfaces live in src/post-meta.ts (shared with
// vite.config.ts); re-export them here so the virtual module is fully typed.
declare module 'virtual:post-data-server' {
  /** Full post data including html — server-side (SSR/prerender) use only. */
  export const fullPostMetas: import('./post-meta').PostMeta[];
}
