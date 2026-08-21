import { Link, createFileRoute } from '@tanstack/solid-router';
import { fetchPosts } from '../../lib/blog';

function BlogIndex() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts().map((post) => (
          <li>
            <Link to="/blog/$slug/" params={{ slug: post.slug }}>
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
