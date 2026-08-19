import { Link, createFileRoute } from '@tanstack/solid-router';
import { getRequestEvent } from '@solidjs/web';

// Loader-driven data: TanStack runs the loader when navigation starts (and
// caches it per params), so the component renders with data in hand — no
// in-component fetching. Swap the static JSON for any API endpoint.
async function fetchPost(slug: string) {
  // Same-origin URLs need an explicit origin when this runs during SSR
  // (getRequestEvent() is undefined in the browser, where location wins).
  const origin = getRequestEvent()?.request.url ?? location.origin;
  const response = await fetch(new URL('/blog.json', origin));
  const posts: Record<string, { title: string; excerpt: string; body: string }> =
    await response.json();
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
