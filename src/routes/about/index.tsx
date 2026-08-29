import { Link, createFileRoute } from '@tanstack/solid-router';

function AboutPage() {
  return (
    <main class="container mx-auto max-w-3xl px-4 py-12">
      <h1 class="text-5xl font-bold tracking-tight">About</h1>
      <div class="prose lg:prose-lg mt-8">
        <p>
          Software developer. I think I will figure out something here before merging with the machines.
        </p>
        <ul>
          <li>
            <a href="https://github.com/Ciantic" target="_blank" rel="noopener noreferrer">
              My GitHub page
            </a>
          </li>
        </ul>
        <h2>Technical details about this blog</h2>
        <p>Uses SolidJS v2 and Tanstack Start with pre-rendering. I have <a href="https://github.com/Ciantic/test-blog-prerender" target="_blank">an example clean blog setup here</a>.</p>
        <p>This blog should work without JavaScript enabled, HTML generated still has script tags, but they are mostly harmless bloat.</p>
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
