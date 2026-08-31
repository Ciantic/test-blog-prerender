/// <reference types="vite/client" />

// Type the custom env vars injected from vite.config.ts (see the `define`
// block there). Extending ImportMetaEnv gives type safety on
// import.meta.env.VITE_* anywhere in the codebase.
interface ImportMetaEnv {
  /** Resolved absolute path to the posts/ directory, injected at build time. */
  readonly MARKDOWN_POSTS_DIR: string;
  /** Resolved absolute path to the file cache dir, injected at build time. */
  readonly MARKDOWN_CACHE_DIR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
