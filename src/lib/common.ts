import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** All files under a posts/ dir recursively, as absolute paths. */
export function getPostFiles(postsDir: string): string[] {
  return readdirSync(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name));
}
