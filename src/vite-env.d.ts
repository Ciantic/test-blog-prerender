/// <reference types="vite/client" />

// The PostMeta interface lives in src/post-meta.ts (shared with
// vite.config.ts); re-export it here so the virtual module is fully typed.
declare module 'virtual:post-meta' {
  export const postMetas: import('./post-meta').PostMeta[];
  /** Image dimensions keyed by path inside posts/, e.g. '2026/img/test-image.png'. */
  export const imageDims: Record<string, { width: number; height: number }>;
}
