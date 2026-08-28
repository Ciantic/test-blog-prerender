import { createFileRoute } from '@tanstack/solid-router';
import { getRssXml } from '../lib/api';

// Serves /rss.xml as raw XML, outside the HTML document shell. A pure server
// route: the GET handler returns a Response (content-type has no "html", so
// prerender writes the body verbatim to dist/client/rss.xml instead of an
// HTML page). No component — a browser visiting /rss.xml just gets the XML.
export const Route = createFileRoute('/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        const xml = await getRssXml();
        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      },
    },
  },
});
