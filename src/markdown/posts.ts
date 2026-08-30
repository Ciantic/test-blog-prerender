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

async function computePostMetaUncached(
  absPath: string,
  postsDir: string,
): Promise<PostMeta | null> {
    try {
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
      const date = out.split('\n')[0];
      // Parse frontmatter once here so app code never needs gray-matter
      // (which doesn't work in the browser). Unquoted YAML dates become
      // Date objects — normalize them to ISO strings.
      const { data, content } = matter(await readFile(absPath, 'utf-8'));
      const pick = (key: string): string | undefined => {
        const value = data[key];
        if (typeof value === 'string') return value;
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return undefined;
      };
      // Path relative to the posts dir, used for the URL slug and the `path` field.
      const file = absPath.slice(postsDir.length + 1).replaceAll('\\', '/');
      const urlPath = file.replace(/\.md$/, '');
      // Render the body (frontmatter stripped) to HTML here, so app code
      // never needs marked either. The excerpt fallback (first paragraph as
      // plain text) is derived from the token tree at the same time.
      // assets/links are the local files and URLs the post references, collected
      // by the markdown pipeline. The build uses `assets` to emit only the files
      // a post actually needs (see vite-post-assets-plugin.ts).
      const { html, excerpt, assets, links } = await renderMarkdown({ markdown: content, absPath, title: pick('title') });
      // Effective title/excerpt resolved here too: frontmatter wins, then
      // the markdown heading / first paragraph, then the slug.
      const title = pick('title') ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Unknown title";
      // Effective publish date: frontmatter overrides git date. Normalized
      // so app code never needs Date parsing: date-only posts stay
      // YYYY-MM-DD (Finnish formatter + year grouping), datetimes become
      // YYYY-MM-DDTHH:mm. Sorting works lexicographically on both forms.
      const fmDate = data.date instanceof Date ? data.date : undefined;
      const parsed = fmDate ?? new Date(pick('date') ?? date);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Post ${file} has an unparseable date`);
      }
      const iso = parsed.toISOString();
      const effectiveDate = iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16);
      return {
        urlPath,
        path: file,
        date: effectiveDate,
        indexed: /^\d+\//.test(file),
        frontmatter: {
          title: pick('title'),
          date: pick('date'),
          excerpt: pick('excerpt'),
        },
        title,
        excerpt: pick('excerpt') ?? excerpt,
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
  return results.filter((m) => m !== null);
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
    .sort((a, b) => b.date.localeCompare(a.date))
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
}
