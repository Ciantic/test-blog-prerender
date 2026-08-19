import { Link, createFileRoute } from '@tanstack/solid-router';

// Dummy post data, embedded directly. Swap for any API endpoint — the loader
// stays async so the shape is identical to a real fetch.
const posts: Record<string, { title: string; excerpt: string; body: string }> = {
  'hello-solid': {
    title: 'Hello Solid',
    excerpt: 'Getting started with Solid and TanStack Router.',
    body: 'Solid is a declarative JavaScript library for building user interfaces. Combined with TanStack Router, you get type-safe, loader-driven routing out of the box.',
  },
  'loaders-explained': {
    title: 'Loaders Explained',
    excerpt: 'How loader-driven data fetching works in TanStack Router.',
    body: 'TanStack Router runs loaders when navigation starts and caches the result per params. The component then renders with data already in hand — no in-component fetching required.',
  },
  prerendering: {
    title: 'Prerendering',
    excerpt: 'Serving static HTML for every route at build time.',
    body: 'With prerendering, every route is rendered to static HTML at build time. This gives you fast first paint and great SEO while keeping the full SPA experience.',
  },
};

// Dummy async — mimics a network round-trip so the loader behaves like a real
// fetch during SSR/prerendering.
async function fetchPost(slug: string) {
  "use server";
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return posts[slug] ?? { title: 'Unknown', excerpt: '', body: 'No such post' };
}

function PostPage() {
  // Typed by the loader's return type; reactive to param changes.
  const post = Route.useLoaderData();

  return (
    <main>
      <h1>Blog</h1>
      <section>
        <h2>{post().title}</h2>
        <p>{post().body}</p>
        <p>
          <Link to="/blog">Back to blog</Link>
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => fetchPost(params.slug),
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} - Solid App` }],
  }),
  component: PostPage,
});
