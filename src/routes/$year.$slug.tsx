import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPost } from '../lib/blog';

function PostPage() {
  // Typed by the loader's return type; reactive to param changes.
  const post = Route.useLoaderData();

  return (
    <main>
      <section innerHTML={post().html} />
      <p>
        <Link to="/blog/">Back to blog</Link>
      </p>
    </main>
  );
}

export const Route = createFileRoute('/$year/$slug')({
  // 404s if there's no post for that year/slug combination.
  beforeLoad: ({ params }) => {
    if (!getPost(params.year, params.slug)) {
      throw new Error('Post not found');
    }
  },
  loader: ({ params }) => getPost(params.year, params.slug)!,
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} - Solid App` }],
  }),
  component: PostPage,
});
