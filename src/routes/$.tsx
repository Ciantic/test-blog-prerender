import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPost } from '../lib/api';
import { formatDateFinnish } from '../lib/date';
import { Show, createEffect } from 'solid-js';
import { mountWidgets } from '../lib/widgets';

function PostPage() {
  // Typed by the loader's return type; reactive to param changes.
  const post = Route.useLoaderData();
  let articleEl: HTMLElement | undefined;

  // The post HTML is static (injected via innerHTML), so Solid widgets like
  // <Counter /> can't render during parsing. After the content lands in the
  // DOM, mount the real components into their data-widget placeholders.
  // createEffect is a no-op on the server, so prerendered HTML keeps just
  // the placeholder and hydrates the widget on the client. The effect
  // re-runs (and unmounts the old widgets) when navigating to another post.
  //
  // We defer the actual mount to a macrotask: the effect runs synchronously
  // during the app's initial hydration pass, while Solid's shared hydration
  // context (sharedConfig.hydrating) is still true. render() inside that
  // window would try to claim hydration keys for a root that was never
  // server-rendered, so we wait until hydration completes before mounting.
  createEffect(
    // Compute (tracked): re-run the effect whenever the post content changes.
    () => post().html,
    // Effect: schedule the mount, and return a cleanup that cancels it if
    // the post changes (or the route unmounts) before the timer fires.
    () => {
      if (!articleEl) return;
      let dispose: (() => void) | undefined;
      const timer = window.setTimeout(() => {
        dispose = mountWidgets(articleEl!);
      }, 0);
      return () => {
        window.clearTimeout(timer);
        dispose?.();
      };
    },
  );

  return (
    <main class="container mx-auto max-w-3xl px-4 py-10">
      <Show when={post().indexed}>
        <p class="text-sm text-base-content/50 mb-6">
          {formatDateFinnish(post().date)}
        </p>
      </Show>
      <article ref={articleEl} class="prose lg:prose-lg">
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
  head: ({ params }) => ({
    meta: [{ title: `${params._splat?.split('/').pop()} - Solid App` }],
  }),
  component: PostPage,
});
