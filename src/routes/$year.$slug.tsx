import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPost, formatDateFinnish } from '../lib/blog';

function PostPage() {
  // Typed by the loader's return type; reactive to param changes.
  const post = Route.useLoaderData();

  return (
    <main class="container mx-auto max-w-3xl px-4 py-10">
      <p class="text-sm text-base-content/50 mb-6">
        {formatDateFinnish(post().date)}
      </p>
      <article class="prose lg:prose-lg">
        <div innerHTML={post().html} />
      </article>
      <p class="mt-20">
        <Link to="/" class="btn btn-soft">
          &larr; Back to blog
        </Link>
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
