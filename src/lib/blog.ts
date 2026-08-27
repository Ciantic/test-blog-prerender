
import { createServerFn } from '@tanstack/solid-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { getPostIndexData, getPostData } from './markdown';


export const getPosts = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware as any])
  .handler(async () => {
    return await getPostIndexData(process.cwd() + '/posts');
  });

export const getPost = createServerFn({ method: 'GET' })
  .validator((urlPath: string) => urlPath)
  .middleware([staticFunctionMiddleware as any])
  .handler(async ({ data: urlPath }) => {
    return await getPostData(process.cwd() + '/posts', urlPath);
  });

export function formatDateFinnish(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y}`;
}
