
import { createServerFn } from '@tanstack/solid-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { Feed } from 'feed';
import { getPostIndexData, getPostData } from './markdown';

const SITE_URL = 'https://example.com';


export const getPosts = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware as any])
  .handler(async () => {
    return await getPostIndexData();
  });

export const getPost = createServerFn({ method: 'GET' })
  .validator((urlPath: string) => urlPath)
  .middleware([staticFunctionMiddleware as any])
  .handler(async ({ data: urlPath }) => {
    return await getPostData(urlPath);
  });

// Builds the RSS feed (raw XML string) from the committed, indexed posts.
// Runs server-side only; the route that serves /rss.xml wraps this in a
// Response. Kept here with the other server fns so `feed` + markdown stay
// out of the client bundle.
export const getRssXml = createServerFn({ method: 'GET' }).handler(async () => {
  const feed = new Feed({
    title: 'My Blog',
    description: 'Static-prerendered Solid blog demo.',
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'fi',
    copyright: '',
  });

  // Newest first, by the effective date (frontmatter overrides git date).
  // Only indexed posts appear in the feed — exactly what getPostIndexData()
  // returns (title already resolved: frontmatter > `# Heading` > slug).
  const items = (await getPostIndexData()).map((meta) => ({
    url: `${SITE_URL}/${meta.urlPath}/`,
    title: meta.title,
    date: new Date(meta.date),
  }));

  for (const { url, title, date } of items) {
    feed.addItem({
      title,
      id: url,
      link: url,
      date,
    });
  }

  return feed.rss2();
});

export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
