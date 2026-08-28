import { Link, createFileRoute } from '@tanstack/solid-router';

function AboutPage() {
  return (
    <main class="container mx-auto max-w-3xl px-4 py-12">
      <h1 class="text-5xl font-bold tracking-tight">About</h1>
      <div class="prose lg:prose-lg mt-8">
        <p>
          This is a demo blog built with <strong>SolidJS v2</strong>,{' '}
          <strong>TanStack Start</strong> and full static prerendering. Every
          page you see is emitted as plain HTML at build time — no server
          required at runtime.
        </p>
        <ul>
          <li>
            Posts live as Markdown files in the <code>posts/</code> directory.
          </li>
          <li>Post dates and years are derived from git commit history.</li>
          <li>
            An RSS feed is generated at build time at{' '}
            <a href="/rss.xml">/rss.xml</a>.
          </li>
          <li>
            Image dimensions are computed at build time and emitted as width/height attributes.
          </li>
          <li>
            Supports "non-indexed" posts (drafts) that are not linked from the blog index or RSS feed.
          </li>
        </ul>
        What it doesn't do at least yet: 

        <ul>
          <li>Comments or other dynamic functionality</li>
          <li>RSS paging</li>
          <li>Might not be very performant</li>
        </ul>
      </div>
      <p class="mt-20">
        <Link to="/" class="btn btn-soft">
          &larr; Back to blog
        </Link>
      </p>
    </main>
  );
}

export const Route = createFileRoute('/about/')({
  head: () => ({ meta: [{ title: 'About - Solid App' }] }),
  component: AboutPage,
});
