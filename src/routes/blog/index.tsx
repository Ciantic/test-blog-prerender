import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPosts } from '../../lib/blog';

function BlogIndex() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts().map((post) => (
          <li>
            <Link to="/$year/$slug/" params={{ year: String(post.year), slug: post.slug }}>
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
  loader: () => getPosts(),
  head: () => ({ meta: [{ title: 'Blog - Solid App' }] }),
  component: BlogIndex,
});
