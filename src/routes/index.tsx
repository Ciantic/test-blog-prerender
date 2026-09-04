import { Link, createFileRoute } from '@tanstack/solid-router';
import { formatDate, formatDateShort } from '../lib/date';
import type { PostMetaIndex } from '../markdown/types';
import { getPosts } from '../lib/api';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '../site';

function Home() {
  // Typed by the loader's return type.
  const posts = Route.useLoaderData();

  // Group posts by year (from their publish date — frontmatter may override
  // both the git date and what the URL path suggests) for the year-marked
  // list layout.
  const byYear = () => {
    const groups = new Map<number, PostMetaIndex[]>();
    for (const post of posts()) {
      const year = post.date.getUTCFullYear();
      const list = groups.get(year);
      if (list) list.push(post);
      else groups.set(year, [post]);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  };

  return (
    <main class="container page">
      <header class="home-head">
        <h1 class="sr-only">{SITE_NAME}</h1>
        <p class="home-tagline">{SITE_DESCRIPTION}</p>
      </header>

      {byYear().map(([year, yearPosts]) => (
        <section class="year">
          <h2 class="year__title">{year}</h2>
          <ul class="post-list">
            {yearPosts.map((post) => (
              <li class="post-list__item">
                <Link
                  to="/$/"
                  params={{ _splat: post.urlPath }}
                  class="post-link"
                >
                  <time
                    datetime={post.date.toISOString()}
                    class="post-link__date"
                  >
                    {formatDateShort(post.date)}
                  </time>
                  <div class="post-link__body">
                    <h3 class="post-link__title">
                      {post.title}
                      {post.draft && (
                        <span
                          class="chip chip--warn"
                          title="Not published to production"
                        >
                          Draft
                        </span>
                      )}
                      <span
                        class="post-link__arrow"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </h3>
                    <p class="post-link__excerpt">{post.excerpt}</p>
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
  loader: async () => getPosts(),
  head: () => ({ meta: [{ title: SITE_TITLE }] }),
  component: Home,
});
