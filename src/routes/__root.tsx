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
import { installInsecureContextPolyfills } from '../lib/insecure-context-polyfill';
import PageLayout from '../components/PageLayout';
import { SITE_NAME } from '../site';

// crypto.subtle is only available in secure contexts (HTTPS/localhost).
// The static server function middleware needs it to hash cache keys, so
// polyfill it before any navigation can trigger a server function call.
// Module side effect — runs once when the client bundle loads.
installInsecureContextPolyfills();

// The root route: the site-wide layout every route renders inside, plus the
// not-found boundary. <HeadContent /> renders whatever the matched routes
// declare in their `head` options (titles here).
export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: SITE_NAME }],
    links: [
      { rel: 'stylesheet', href: appCss },
      // RSS autodiscovery — lets feed readers find the feed from any page.
      { rel: 'alternate', type: 'application/rss+xml', title: SITE_NAME, href: '/rss.xml' },
    ],
  }),
  component: () => (
    <RootDocument>
      <PageLayout><Outlet /></PageLayout>
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
