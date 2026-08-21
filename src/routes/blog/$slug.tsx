import { Link, createFileRoute } from '@tanstack/solid-router';
import { fetchPost } from '../../lib/blog';

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
          <Link to="/blog/">Back to blog</Link>
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
