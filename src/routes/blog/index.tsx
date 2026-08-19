import { Link, createFileRoute } from '@tanstack/solid-router';

// Dummy post data, embedded directly. Swap for any API endpoint — the loader
// stays async so the shape is identical to a real fetch.
const posts: Record<string, { title: string; excerpt: string }> = {
  'hello-solid': {
    title: 'Hello Solid',
    excerpt: 'Getting started with Solid and TanStack Router.',
  },
  'loaders-explained': {
    title: 'Loaders Explained',
    excerpt: 'How loader-driven data fetching works in TanStack Router.',
  },
  prerendering: {
    title: 'Prerendering',
    excerpt: 'Serving static HTML for every route at build time.',
  },
};

// Dummy async — mimics a network round-trip so the loader behaves like a real
// fetch during SSR/prerendering.
async function fetchPosts() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return posts;
}

function BlogIndex() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {Object.entries(posts()).map(([slug, post]) => (
          <li>
            <Link to="/blog/$slug" params={{ slug }}>
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export const Route = createFileRoute('/blog/')({
  loader: () => fetchPosts(),
  head: () => ({ meta: [{ title: 'Blog - Solid App' }] }),
  component: BlogIndex,
});
