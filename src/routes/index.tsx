import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPosts } from '../lib/blog';

function Home() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  return (
    <main class="container mx-auto max-w-3xl px-4 py-10">
      <h1 class="text-4xl font-bold mb-8">Blog</h1>
      <ul class="flex flex-col gap-6">
        {posts().map((post) => (
          <li class="card bg-base-100 shadow-md transition-shadow hover:shadow-lg">
            <Link
              to="/$year/$slug/"
              params={{ year: String(post.year), slug: post.slug }}
              class="card-body"
            >
              <h2 class="card-title text-2xl">{post.title}</h2>
              <p class="text-base-content/70">{post.excerpt}</p>
              <div class="text-sm text-base-content/50 mt-2">
                {post.year}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export const Route = createFileRoute('/')({
  loader: () => getPosts(),
  head: () => ({ meta: [{ title: 'Blog - Solid App' }] }),
  component: Home,
});
