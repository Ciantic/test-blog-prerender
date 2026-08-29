import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPost } from '../lib/api';
import { formatDateFinnish } from '../lib/date';
import { Show } from 'solid-js';
import { SITE_NAME } from '../site';

function PostPage() {
  // Typed by the loader's return type; reactive to param changes.
  const post = Route.useLoaderData();
  return (
    <main class="container mx-auto max-w-3xl px-4 py-10">
      <Show when={post().indexed}>
        <p class="text-sm text-base-content/50 mb-6">
          {formatDateFinnish(post().date)}
        </p>
      </Show>
      <article class="prose lg:prose-lg">
        <div innerHTML={post().html} />
      </article>
      <Show when={post().indexed}>
        <p class="mt-20">
          <Link to="/" class="btn btn-soft">
            &larr; Back to blog
          </Link>
        </p>
      </Show>
    </main>
  );
}

export const Route = createFileRoute('/$')({
  // Splat route: the whole URL path (minus leading slash) is `params._splat`,
  // e.g. /2026/hello-world -> '2026/hello-world'. This mirrors the posts/
  // directory structure exactly. 404s if there's no post for that path.
  // The post data (with rendered HTML) is fetched lazily from a per-post
  // JSON file, so client navigation only loads the post being viewed.
  loader: async ({ params }) => {
    const post = await getPost({ data: params._splat ?? '' });
    if (!post) throw new Error('Post not found');
    return post;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title} - ${SITE_NAME}` }],
  }),
  component: PostPage,
});
