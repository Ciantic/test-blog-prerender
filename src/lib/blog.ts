// Shared blog data access.
//
// During SSR / prerendering (build time) we read the JSON straight from disk
// with Node's fs — no HTTP round-trip, so the prerender step works without a
// running server. On the client we fetch the static JSON files, which are
// copied verbatim from `public/` into the build output.
//
// `import.meta.env.SSR` is true in the server/prerender build and false in the
// client bundle, so the fs branch is tree-shaken out of the client code.

export interface BlogPost {
  title: string;
  excerpt: string;
  body: string;
}

export interface BlogIndexEntry {
  slug: string;
  title: string;
  excerpt: string;
}

async function readJson<T>(path: string): Promise<T> {
  if (import.meta.env.SSR) {
    // During SSR/prerender the CWD is the project root, so public/ is here.
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const raw = await readFile(join(process.cwd(), 'public', path), 'utf-8');
    return JSON.parse(raw) as T;
  }

  const res = await fetch(`/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchPosts(): Promise<BlogIndexEntry[]> {
  return readJson<BlogIndexEntry[]>('blog/index.json');
}

export function fetchPost(slug: string): Promise<BlogPost> {
  return readJson<BlogPost>(`blog/${slug}.json`);
}
