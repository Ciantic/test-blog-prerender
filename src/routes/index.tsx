import { Link, createFileRoute } from '@tanstack/solid-router';
import { getPosts, formatDateFinnish, type BlogIndexEntry } from '../lib/blog';

function Home() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  // Group posts by year (from their publish date — frontmatter may override
  // both the git date and what the URL path suggests) for the year-marked
  // list layout.
  const byYear = () => {
    const groups = new Map<number, BlogIndexEntry[]>();
    for (const post of posts()) {
      const year = Number(post.date.slice(0, 4));
      const list = groups.get(year);
      if (list) list.push(post);
      else groups.set(year, [post]);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  };

  return (
    <main class="container mx-auto max-w-3xl px-4 py-12">
      <header class="mb-10">
        <h1 class="text-5xl font-bold tracking-tight">Blog</h1>
        <p class="mt-3 text-base-content/60">
          Notes on SolidJS, routing and prerendering.
        </p>
      </header>

      {byYear().map(([year, yearPosts]) => (
        <section class="mb-12">
          <h2 class="mb-4 flex items-center gap-4 text-sm font-semibold uppercase tracking-widest text-base-content/50">
            {year}
            <span class="h-px flex-1 bg-base-content/15" aria-hidden="true" />
          </h2>
          <ul>
            {yearPosts.map((post) => (
              <li class="border-b border-base-content/10 last:border-b-0">
                <Link
                  to="/$/"
                  params={{ _splat: post.urlPath }}
                  class="group flex items-baseline gap-6 py-5 transition-colors"
                >
                  <time
                    datetime={post.date}
                    class="w-24 shrink-0 tabular-nums text-sm text-base-content/50"
                  >
                    {formatDateFinnish(post.date)}
                  </time>
                  <div class="min-w-0">
                    <h3 class="text-xl font-semibold group-hover:text-primary">
                      {post.title}
                      <span
                        class="ml-2 inline-block opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </h3>
                    <p class="mt-1 line-clamp-2 text-sm leading-relaxed text-base-content/60">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

export const Route = createFileRoute('/')({
  loader: () => getPosts(),
  head: () => ({ meta: [{ title: 'Blog - Solid App' }] }),
  component: Home,
});
