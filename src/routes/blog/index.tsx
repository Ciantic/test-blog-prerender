import { Link, createFileRoute } from '@tanstack/solid-router';
import { getRequestEvent } from '@solidjs/web';

// Loader-driven data: TanStack runs the loader when navigation starts (and
// caches it per params), so the component renders with data in hand — no
// in-component fetching. Swap the static JSON for any API endpoint.
async function fetchPosts() {
  // Same-origin URLs need an explicit origin when this runs during SSR
  // (getRequestEvent() is undefined in the browser, where location wins).
  const origin = getRequestEvent()?.request.url ?? location.origin;
  const response = await fetch(new URL('/blog.json', origin));
  const posts: Record<string, { title: string; excerpt: string }> =
    await response.json();
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
