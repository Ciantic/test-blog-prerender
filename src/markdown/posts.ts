import type { PostMeta, PostMetaIndex } from './types';
import { Feed } from 'feed';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { renderMarkdown } from './render';
import { memoize } from './cache';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_COPYRIGHT,
} from '../site';

const execFileAsync = promisify(execFile);

const PROD = process.env.NODE_ENV === 'production';

/** All files under a posts/ dir recursively, as absolute paths. */
async function getPostFiles(postsDir: string): Promise<string[]> {
  return (await readdir(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true }))
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name));
}

// Expensive work (git date + markdown render) cached to the cache dir and
// invalidated when the post file's mtime/size change. See cache.ts.
async function computePostMeta(
  { absPath, postsDir }: { absPath: string; postsDir: string },
): Promise<PostMeta | null> {
  const fileStamp = async (): Promise<string | null> => {
    const st = await stat(absPath).catch(() => null);
    return st ? `${st.mtimeMs}:${st.size}` : null;
  };
  return memoize({
    key: absPath + postsDir,
    label: absPath,
    stamp: fileStamp,
    build: () => computePostMetaUncached(absPath, postsDir),
  });
}

async function getGitCommitDate(absPath: string): Promise<Date | null> {
  const { stdout } = await execFileAsync(
    'git',
    [
      'log',
      // Only the commit that added the file — its creation date, so
      // later edits don't change the post's date metadata.
      '--diff-filter=A',
      '--format=%ad',
      // ISO 8601 with time part — parseable by new Date() in posts.ts.
      '--date=format:%Y-%m-%dT%H:%M:%S%z',
      '--',
      basename(absPath),
    ],
    { cwd: dirname(absPath), encoding: 'utf-8' },
  );
  const out = stdout.trim();
  if (!out) return null; // No commit for this file yet — skip it.
  return new Date(out);
}

async function getModifiedDate(absPath: string): Promise<Date | null> {
  const st = await stat(absPath).catch(() => null);
  return st ? new Date(st.mtimeMs) : null;
}

async function computePostMetaUncached(
  absPath: string,
  postsDir: string,
): Promise<PostMeta | null> {
    try {
      const file = absPath.slice(postsDir.length + 1).replaceAll('\\', '/');
      const urlPath = file.replace(/\.md$/, '');
      const { data: frontmatter, content: markdown } = matter(await readFile(absPath, 'utf-8'));
      const title = typeof frontmatter.title === 'string' ? frontmatter.title : markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Unknown title";
      let date: Date | undefined;
      if (frontmatter.date) {
        if (frontmatter.date instanceof Date) {
          date = frontmatter.date;
        } else {
          date = new Date(frontmatter.date);
          if (Number.isNaN(date.getTime())) {
            throw new Error(`Post ${file} has an unparseable frontmatter date`);
          }
        }
      } else {
        date = await getGitCommitDate(absPath) ?? await getModifiedDate(absPath) ?? undefined;
      }

      if (!date) {
        throw new Error(`Post date could not be determined for ${file}`);
      }
      const draft = basename(file).startsWith("_");
      const excerpt = typeof frontmatter.excerpt === 'string' ? frontmatter.excerpt : undefined;
      const { html, excerpt: excerptFromHtml, assets, links } = await renderMarkdown({ markdown, absPath, title });
      const indexed = /^\d+\//.test(file); // Only posts in a numeric directory are listed.
      return {
        urlPath,
        path: file,
        date: date,
        draft,
        indexed,
        title,
        excerpt: excerpt ?? excerptFromHtml ?? '',
        html,
        assets,
        links,
      };
    } catch {
    return null; // Not a git repo or git unavailable — skip.
  }
}

/** All committed posts (listed and unlisted), unsorted. */
export async function getPostMetas(options: { postsDir: string }): Promise<PostMeta[]> {
  if (!options.postsDir) {
    throw new Error('getPostMetas() requires postsDir in options');
  }
  const files = (await getPostFiles(options.postsDir)).filter((f) => f.endsWith('.md'));
  const results = await Promise.all(files.map((f) => computePostMeta({
    absPath: f, postsDir: options.postsDir })));
  return results
    .filter((m): m is PostMeta => m !== null)
    .filter((m) => !(PROD && m.draft));
}

/** A single post by its URL path, or undefined if it doesn't exist. */
export async function getPostData(
  options: { postsDir: string; urlPath: string },
): Promise<PostMeta | undefined> {
  if (!options.postsDir) {
    throw new Error('getPostData() requires postsDir in options');
  }

  const absPath = join(options.postsDir, `${options.urlPath}.md`);
  if (!(await getPostFiles(options.postsDir)).includes(absPath)) return undefined;
  return (await computePostMeta({ absPath, postsDir: options.postsDir })) ?? undefined;
}

/** Lean, date-sorted index of listed posts (no html/assets/links). */
export async function getPostIndexData(options: { postsDir: string }): Promise<PostMetaIndex[]> {
  if (!options.postsDir) {
    throw new Error('getPostIndexData() requires postsDir in options');
  }

  return (await getPostMetas(options))
    .filter((meta) => meta.indexed)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    // assets/links are build-only concerns (asset emission); keep them out of
    // the lean index/RSS shape, same as the rendered html.
    .map(({ html: _html, assets: _assets, links: _links, ...index }) => index);
}

// Builds the RSS feed (raw XML string) from the committed, indexed posts.
// Runs server-side only; the route that serves /rss.xml wraps this in a
// Response. api.ts's getRssXml server fn just calls this.
export async function getRssXmlData(options: { postsDir: string }): Promise<string> {
  if (!options.postsDir) {
    throw new Error('getRssXmlData() requires postsDir in options');
  }
  const feed = new Feed({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: SITE_LANGUAGE,
    copyright: SITE_COPYRIGHT,
  });

  // Newest first, by the effective date (frontmatter overrides git date).
  // Only indexed posts appear in the feed — exactly what getPostIndexData()
  // returns (title already resolved: frontmatter > `# Heading` > slug).
  const items = (await getPostIndexData(options)).map((meta) => ({
    url: `${SITE_URL}/${meta.urlPath}/`,
    title: meta.title,
    date: meta.date,
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
}
