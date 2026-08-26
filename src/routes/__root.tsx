import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router';
import { HydrationScript } from '@solidjs/web';
import type { ParentProps } from 'solid-js';
import appCss from '../App.css?url';

// The root route: the site-wide layout every route renders inside, plus the
// not-found boundary. <HeadContent /> renders whatever the matched routes
// declare in their `head` options (titles here).
export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'Solid App' }],
    links: [
      { rel: 'stylesheet', href: appCss },
      // RSS autodiscovery — lets feed readers find the feed from any page.
      { rel: 'alternate', type: 'application/rss+xml', title: 'My Blog', href: '/rss.xml' },
    ],
  }),
  component: () => (
    <RootDocument>
      <div class="flex min-h-screen flex-col">
        <div class="navbar bg-base-200 shadow-sm">
        <div class="navbar-start">
          <Link to="/" class="btn btn-ghost text-lg">
            My Blog
          </Link>
        </div>
        <div class="navbar-center">
          <ul class="menu menu-horizontal gap-1">
            <li>
              <Link to="/">All posts</Link>
            </li>
            <li>
              <Link to="/about/">About</Link>
            </li>
          </ul>
        </div>
        <div class="navbar-end">
          {/* 
            Theme Controller from here: 
            https://daisyui.com/components/theme-controller/ 
          */}
          <label class="swap swap-rotate btn btn-ghost btn-circle" title="Toggle dark mode">
            <input type="checkbox" class="theme-controller" value="sunset" aria-label="Toggle dark mode" />
            <svg
              class="swap-off h-6 w-6 fill-current"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />
            </svg>
            <svg
              class="swap-on h-6 w-6 fill-current"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z" />
            </svg>
          </label>
        </div>
      </div>
      <Outlet />
        <footer class="footer footer-center bg-base-200 text-base-content/70 mt-auto p-6 text-sm">
        <nav class="flex gap-4">
          <Link to="/" class="link link-hover">
            Home
          </Link>
          <Link to="/about/" class="link link-hover">
            About
          </Link>
          <a href="/rss.xml" class="link link-hover">
            RSS
          </a>
          <a
            href="https://docs.solidjs.com"
            target="_blank"
            rel="noreferrer"
            class="link link-hover"
          >
            Solid Docs
          </a>
        </nav>
        <aside>
          <p>&copy; {new Date().getFullYear()} My Blog. Built with SolidJS.</p>
        </aside>
        </footer>
      </div>
    </RootDocument>
  ),
  notFoundComponent: () => (
    <main class="container mx-auto px-4 py-16 text-center">
      <h1 class="text-4xl font-bold mb-4">Page Not Found</h1>
      <p>
        Visit{' '}
        <a href="https://docs.solidjs.com" target="_blank" rel="noreferrer" class="link link-primary">
          docs.solidjs.com
        </a>{' '}
        to learn how to build Solid apps.
      </p>
    </main>
  ),
});

// The document shell — the full <html> document. TanStack Start renders this
// on the server and hydrates it on the client.
function RootDocument(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
