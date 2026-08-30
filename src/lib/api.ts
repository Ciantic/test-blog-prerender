import { createServerFn } from '@tanstack/solid-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { getPostData, getPostIndexData, getRssXmlData } from '../markdown/posts';

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
// Response.
export const getRssXml = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware as any])
  .handler(async () => {
    return await getRssXmlData();
  });