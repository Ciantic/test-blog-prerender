
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Marked, Renderer } from 'marked';
import type { MarkedExtension, Token, Tokens } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { imageSize } from 'image-size';
import { codeToHtml, ShikiError } from 'shiki';


/** An image token with pixel dims attached by the async sizing step. */
interface SizedImage extends Tokens.Image {
  dims?: { width: number; height: number };
}

/** A code token with the highlighted HTML attached by the async walkTokens step. */
interface HighlightedCode extends Tokens.Code {
  highlighted?: string;
}

/**
 * Rewrite a relative ref (link href / image src) to be site-relative.
 * Returns null to leave it untouched. External URLs, absolute paths and
 * fragment anchors pass through; `.md` refs point at the rendered post URL.
 */
function rewriteRef(target: string): string | null {
  if (/^(https?:)?\/\//i.test(target) || target.startsWith('/') || target.startsWith('#')) {
    return null;
  }
  const clean = target.replace(/^\.\//, '');
  if (clean.endsWith('.md')) {
    return `../${clean.slice(0, -'.md'.length)}/`;
  }
  return `../${clean}`;
}

/** Plain text of an inline token tree (used for the excerpt). */
function inlineText(tokens: Token[]): string {
  let out = '';
  for (const token of tokens) {
    if (token.type === 'br') {
      out += ' ';
    } else if (token.type === 'footnote_ref') {
      // Drop footnote references ([^1]) from the excerpt text — the plain-text
      // number would otherwise leak into the excerpt.
      continue;
    } else {
      const anyToken = token as Token & { tokens?: Token[]; text?: string };
      if (anyToken.tokens) out += inlineText(anyToken.tokens);
      else if (anyToken.text) out += anyToken.text;
    }
  }
  return out;
}

class PostImageRenderer extends Renderer {
  link(this: PostImageRenderer, token: Tokens.Link): string {
    // Rewrite the href in place so super.link() handles escaping/cleaning.
    const rewritten = rewriteRef(token.href);
    if (rewritten !== null) token.href = rewritten;
    return super.link(token) as string;
  }
  image(this: PostImageRenderer, token: Tokens.Image): string {
    // dims were computed by the async walkTokens step, which ran before this
    // renderer (the parser awaits walkTokens when async: true).
    const dims = (token as SizedImage).dims;
    const dimsAttr = dims ? ` width="${dims.width}" height="${dims.height}"` : '';
    const href = rewriteRef(token.href) ?? token.href;
    return `<img src="${href}" alt="${token.text ?? ''}"${dimsAttr}>`;
  }
  code(this: PostImageRenderer, token: Tokens.Code): string {
    // highlighted HTML was computed by the async walkTokens step (which runs
    // before rendering when async: true). Fall back to the default escaped
    // render for blocks that didn't get highlighted.
    const highlighted = (token as HighlightedCode).highlighted;
    if (highlighted) return highlighted;
    return super.code(token) as string;
  }
}

/**
 * Escape HTML in a plain-text title so it can't break out of the injected
 * <h1> element (or XSS). Used when the body has no heading of its own and we
 * inject one from frontmatter.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Options for {@link markedShiki}. */
interface ShikiOptions {
  /** Dual themes so code colors follow the light/dark theme. */
  themes: { light: string; dark: string };
  /** How the dual-theme colors are resolved. Defaults to light-dark(). */
  defaultColor?: string;
  /** Included in error messages for context (e.g. the post path). */
  absPath?: string;
}

/**
 * A marked extension that highlights fenced code blocks with shiki.
 * Works like markedFootnote()/markedAlert(): register it in the Marked
 * constructor and its walkTokens composes with any others.
 */
function markedShiki(options: ShikiOptions): MarkedExtension {
  const { themes, defaultColor = 'light-dark()', absPath } = options;
  const walkTokens = async (token: Token): Promise<void> => {
    if (token.type !== 'code') return;
    const code = token as HighlightedCode;
    // First word of the info string is the language (e.g. "tsx" from "```tsx").
    // Normalize to a lowercase shiki language id so e.g. "C#" highlights as C#.
    const lang = (code.lang ?? '').trim().split(/\s+/)[0].toLowerCase();
    // Dual themes emit --shiki-light/--shiki-dark CSS vars on each span so
    // the code colors follow the site's light/dark scheme automatically.
    // Unknown/unrecognized languages are rendered as plain text (the `text`
    // special lang) instead of throwing and failing the whole post render.
    try {
      code.highlighted = await codeToHtml(code.text, {
        lang: lang || 'text',
        themes,
        // light-dark() resolves colors from the inherited `color-scheme`,
        // which the vanilla theme toggle in App.css drives via a hidden
        // .theme-controller checkbox (`:root:has(:checked)` sets
        // color-scheme: dark). No data-theme attr needed.
        // This makes code colors follow the theme toggle automatically.
        defaultColor,
      });
    } catch (error) {
      if (error instanceof ShikiError) {
        console.warn(`Shiki error${absPath ? ` in ${absPath}` : ''}: ${error.message}. Falling back to unhighlighted code.`);
        code.highlighted = await codeToHtml(code.text, {
          lang: 'text',
          themes,
          defaultColor,
        });
      } else {
        throw error;
      }
    }
  };
  return { walkTokens };
}

/** A marked extension that also exposes a computed value. */
interface ExcerptExtension extends MarkedExtension {
  /** The first paragraph of the document as plain text. */
  getExcerpt(): string;
}

/**
 * A marked extension that captures the first paragraph (in document order)
 * as plain text — the excerpt fallback. Use it like markedFootnote(): pass it
 * to the Marked constructor, then read getExcerpt() after parsing.
 */
function markedExcerpt(): ExcerptExtension {
  let excerpt = '';
  const walkTokens = (token: Token): void => {
    // First paragraph (in document order) as plain text — the excerpt fallback.
    if (token.type === 'paragraph' && !excerpt && token.tokens) {
      excerpt = inlineText(token.tokens).replace(/\s+/g, ' ').trim();
    }
  };
  return { walkTokens, getExcerpt: () => excerpt };
}

/** Options for {@link markedImageSizes}. */
interface ImageSizesOptions {
  /** Absolute path to the markdown file, used to resolve its image refs. */
  absPath: string;
}

/**
 * A marked extension that sizes the images in a post by reading each image
 * from disk with non-blocking I/O (only the images that actually appear) and
 * stashing the pixel dims on the token, which the renderer reads when building
 * the <img> tag. Missing/unreadable images are silently left without dims.
 */
function markedImageSizes(options: ImageSizesOptions): MarkedExtension {
  // The post's directory — image refs in the markdown are relative to it.
  const postDir = dirname(options.absPath);
  const walkTokens = async (token: Token): Promise<void> => {
    if (token.type !== 'image') return;
    const image = token as SizedImage;
    try {
      const dims = imageSize(await readFile(join(postDir, image.href.replace(/^\.\//, ''))));
      // SVGs from image-size report width/height only when set explicitly.
      if (dims.width && dims.height) {
        image.dims = { width: dims.width, height: dims.height };
      }
    } catch {
      // Unreadable or unsupported image — leave it without dimensions.
    }
  };
  return { walkTokens };
}

/** A marked extension that also exposes computed values. */
interface CollectAssetsExtension extends MarkedExtension {
  /** Local files referenced (relative to the post dir), e.g. "img/a.png". */
  getAssets(): string[];
  /** URLs referenced: external links, absolute paths, and internal `.md` links. */
  getLinks(): string[];
}

/**
 * A marked extension that collects the assets and links a document references
 * from its image srcs and link hrefs. Use it like markedExcerpt(): pass it to
 * the Marked constructor, then read getAssets()/getLinks() after parsing.
 */
function markedCollectAssets(): CollectAssetsExtension {
  // Local files the document references, relative to the document directory
  // (e.g. "img/test-image.png").
  const assets: string[] = [];
  // URLs the document references: external links, absolute paths, and
  // internal `.md` post links.
  const links: string[] = [];
  const walkTokens = (token: Token): void => {
    if (token.type === 'image') {
      collectRef((token as SizedImage).href, assets, links);
    } else if (token.type === 'link') {
      collectRef((token as Tokens.Link).href, assets, links);
    }
  };
  return {
    walkTokens,
    getAssets: () => assets,
    getLinks: () => links,
  };
}

/**
 * Categorize a reference (link href / image src) into the post's assets
 * (local files, relative to the post dir) or links (external URLs, absolute
 * paths, and internal `.md` post links). Fragment anchors are dropped.
 */
function collectRef(target: string, assets: string[], links: string[]): void {
  const value = target.trim();
  if (!value || value.startsWith('#')) return;
  // External URL (scheme or protocol-relative), absolute path, or an internal
  // post link (`.md` refs render as post URLs) — all are link targets.
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || value.startsWith('/') || value.endsWith('.md')) {
    if (!links.includes(value)) links.push(value);
  } else {
    const rel = value.replace(/^\.\//, '');
    if (!assets.includes(rel)) assets.push(rel);
  }
}

export function renderMarkdown({
  markdown,
  absPath,
  title,
}: {
  markdown: string,
  absPath: string,
  title?: string,
}): Promise<{ html: string; excerpt: string; assets: string[]; links: string[] }> {
  const postDir = dirname(absPath);
  // Per-render extension instances: their walkTokens run during parsing and
  // their getters expose the computed values afterward.
  const excerptExt = markedExcerpt();
  const collectAssetsExt = markedCollectAssets();
  const marked = new Marked(
    markedAlert(),
    markedImageSizes({ absPath }),
    markedShiki({ themes: { light: 'github-light', dark: 'github-dark' }, absPath }),
    excerptExt,
    collectAssetsExt,
    markedFootnote({ refMarkers: true }),
    {
      async: true,
    },
  );
  return marked.parse(markdown, {
    async: true,
    renderer: new PostImageRenderer(),
  }).then((html) => {
    // Prepend H1 from frontmatter, if the markdown body has no heading of its own.
    if (!/<h1[\s>]/i.test(html) && title) {
      html = `<h1>${escapeHtml(title)}</h1>\n${html}`;
    }
    return {
      html,
      excerpt: excerptExt.getExcerpt(),
      assets: collectAssetsExt.getAssets(),
      links: collectAssetsExt.getLinks(),
    };
  });
}
