/**
 * Build-time post processing: git dates, frontmatter parsing, markdown
 * rendering. Runs only in Node (vite.config.ts and the server side of the
 * static server functions in src/lib/blog.ts) — never in the browser.
 *
 * The URL structure mirrors the posts/ directory exactly:
 *   posts/foo.md              -> /foo/
 *   posts/2026/my-post.md     -> /2026/my-post/
 *   posts/img/test-image.png  -> /img/test-image.png
 * Posts with no commit yet are skipped entirely (they don't exist as far as
 * the blog is concerned).
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import matter from 'gray-matter';
import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';
import { imageSize } from 'image-size';
import type { PostMeta, PostMetaIndex } from '../post-meta';


export interface PostsContext {
  /** Absolute path to the posts/ directory. */
  dir: string;
  /** All files under posts/ recursively, as slash-separated relative paths. */
  postFiles: string[];
  /** Relative image path (inside posts/) -> pixel dims, for CLS-free <img> tags. */
  imageDims: Record<string, { width: number; height: number }>;
}

/** All files under a posts/ dir recursively, as slash-separated relative paths. */
export function getPostFiles(postsDir: string): string[] {
  return readdirSync(postsDir, { recursive: true, encoding: 'utf-8', withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name).slice(postsDir.length + 1).replaceAll('\\', '/'));
}

const execFileAsync = promisify(execFile);

async function getImageDims(postsDir: string, postFiles: string[]): Promise<Record<string, { width: number; height: number }>> {
  const imageFiles = postFiles.filter((rel) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(rel));
  const results = await Promise.all(
    imageFiles.map(async (rel) => {
      try {
        const dims = imageSize(await readFile(join(postsDir, rel)));
        // SVGs from image-size report width/height only when set explicitly.
        if (dims.width && dims.height) return [rel, { width: dims.width, height: dims.height }] as const;
        return null;
      } catch {
        return null; // Unreadable or unsupported image — leave it without dimensions.
      }
    }),
  );
  return Object.fromEntries(results.filter((r) => r !== null));
}

async function buildContext(postsDir: string): Promise<PostsContext> {
  const postFiles = getPostFiles(postsDir);
  const imageDims = await getImageDims(postsDir, postFiles);
  return { dir: postsDir, postFiles, imageDims };
}

const contexts = new Map<string, Promise<PostsContext>>();
function getContext(postsDir: string): Promise<PostsContext> {
  let ctx = contexts.get(postsDir);
  if (!ctx) {
    ctx = buildContext(postsDir);
    contexts.set(postsDir, ctx);
  }
  return ctx;
}

function rewriteRefs(html: string): string {
  return html.replace(/\b(src|href)="([^"]*)"/g, (_all, attr: string, target: string) => {
    if (/^(https?:)?\/\//i.test(target) || target.startsWith('/') || target.startsWith('#')) {
      return _all;
    }
    const clean = target.replace(/^\.\//, '');
    if (clean.endsWith('.md')) {
      return `${attr}="../${clean.slice(0, -'.md'.length)}/"`;
    }
    return `${attr}="../${clean}"`;
  });
}

class PostImageRenderer extends Renderer {
  constructor(
    private readonly imageDims: Record<string, { width: number; height: number }>,
    private readonly postDir: string,
  ) {
    super();
  }
  image(this: PostImageRenderer, token: Tokens.Image): string {
    const clean = token.href.replace(/^\.\//, '');
    const dims = this.imageDims[`${this.postDir}${clean}`];
    const dimsAttr = dims ? ` width="${dims.width}" height="${dims.height}"` : '';
    return `<img src="${token.href}" alt="${token.text ?? ''}"${dimsAttr}>`;
  }
}

function renderMarkdown(markdown: string, urlPath: string, ctx: PostsContext): string {
  const postDir = urlPath.includes('/') ? `${urlPath.split('/').slice(0, -1).join('/')}/` : '';
  return marked.parse(markdown, { async: false, renderer: new PostImageRenderer(ctx.imageDims, postDir) }) as string;
}

/** Fallback title derived from the slug: 'my-post' -> 'My Post'. */
function extractTitle(urlPath: string): string {
  return urlPath
    .split('/')
    .pop()!
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractExcerptFromHtml(html: string): string {
  const first = html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
  return first.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function computePostMeta(file: string, ctx: PostsContext): Promise<PostMeta | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        // Only the commit that added the file — its creation date, so
        // later edits don't change the post's date metadata.
        '--diff-filter=A',
        '--format=%ad',
        // ISO 8601 with time part — parseable by new Date() in blog.ts.
        '--date=format:%Y-%m-%dT%H:%M:%S%z',
        '--',
        file,
      ],
      { cwd: ctx.dir, encoding: 'utf-8' },
    );
    const out = stdout.trim();
    if (!out) return null; // No commit for this file yet — skip it.
    const date = out.split('\n')[0];
    // Parse frontmatter once here so app code never needs gray-matter
    // (which doesn't work in the browser). Unquoted YAML dates become
    // Date objects — normalize them to ISO strings.
    const { data, content } = matter(readFileSync(join(ctx.dir, file), 'utf-8'));
    const pick = (key: string): string | undefined => {
      const value = data[key];
      if (typeof value === 'string') return value;
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return undefined;
    };
    const urlPath = file.replace(/\.md$/, '');
    // Render the body (frontmatter stripped) to HTML here, so app code
    // never needs marked either.
    const html = rewriteRefs(renderMarkdown(content, urlPath, ctx));
    // Effective title/excerpt resolved here too: frontmatter wins, then
    // the markdown heading / first paragraph, then the slug.
    const title = pick('title') ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? extractTitle(urlPath);
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
      excerpt: pick('excerpt') ?? extractExcerptFromHtml(html),
      html,
    };
  } catch {
    return null; // Not a git repo or git unavailable — skip.
  }
}

async function getPostMetas(ctx: PostsContext): Promise<PostMeta[]> {
  const files = ctx.postFiles.filter((f) => f.endsWith('.md'));
  const results = await Promise.all(files.map((f) => computePostMeta(f, ctx)));
  return results.filter((m) => m !== null);
}


export async function getPostData(postsDir: string, urlPath: string): Promise<PostMeta | undefined> {
  const ctx = await getContext(postsDir);
  const file = `${urlPath}.md`;
  if (!ctx.postFiles.includes(file)) return undefined;
  return (await computePostMeta(file, ctx)) ?? undefined;
}


export async function getPostIndexData(postsDir: string): Promise<PostMetaIndex[]> {
  const ctx = await getContext(postsDir);
  return (await getPostMetas(ctx))
    .filter((meta) => meta.indexed)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ html: _html, ...index }) => index);
}
