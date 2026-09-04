import { Link, createFileRoute } from '@tanstack/solid-router';
import { SITE_NAME } from '../../site';

function AboutPage() {
  return (
    <main class="container page">
      <div class="prose">
        <h1>About</h1>
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
        <p>I've tried to remove all JavaScript, if blog post needs script tags then it will be only on that post.</p>
      </div>
      <p class="post-back">
        <Link to="/" class="btn btn-soft">
          &larr; Back to blog
        </Link>
      </p>
    </main>
  );
}

export const Route = createFileRoute('/about/')({
  head: () => ({ meta: [{ title: `About - ${SITE_NAME}` }] }),
  component: AboutPage,
});
