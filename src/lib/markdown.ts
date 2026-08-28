
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { marked, Renderer } from 'marked';
import type { Token, Tokens } from 'marked';
import { imageSize } from 'image-size';
import { codeToHtml } from 'shiki';


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

export function renderMarkdown(markdown: string, absPath: string): Promise<{ html: string; excerpt: string }> {
  // The post's directory — image refs in the markdown are relative to it.
  const postDir = dirname(absPath);
  // First paragraph (in document order) as plain text — the excerpt fallback.
  let excerpt = '';
  // walkTokens runs for every token before rendering. Making it async lets us
  // read each image in this post with non-blocking I/O (only the images that
  // actually appear) and stash the dims on the token for the renderer above.
  const walkTokens = async (token: Token): Promise<void> => {
    if (token.type === 'image') {
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
    } else if (token.type === 'paragraph' && !excerpt && token.tokens) {
      excerpt = inlineText(token.tokens).replace(/\s+/g, ' ').trim();
    } else if (token.type === 'html') {
      // Widget placeholders: a self-closing tag with a capitalized name like
      // <Counter /> becomes a mountable <div data-widget="Counter">. The
      // client (src/lib/widgets.ts) swaps in the real Solid component.
      const htmlToken = token as Tokens.HTML;
      htmlToken.text = htmlToken.text.replace(
        /<([A-Z][A-Za-z0-9]*)\s*\/\s*>/g,
        '<div data-widget="$1"></div>',
      );
    } else if (token.type === 'code') {
      const code = token as HighlightedCode;
      // First word of the info string is the language (e.g. "tsx" from "```tsx").
      const lang = (code.lang ?? '').trim().split(/\s+/)[0];
      // Dual themes emit --shiki-light/--shiki-dark CSS vars on each span so
      // the code colors follow the daisyUI light/dark theme automatically.
      code.highlighted = await codeToHtml(code.text, {
        lang: lang || 'text',
        themes: { light: 'github-light', dark: 'github-dark' },
        // light-dark() resolves colors from the inherited `color-scheme`,
        // which daisyUI drives via its theme-controller (it sets
        // color-scheme: dark on :root in dark mode, no data-theme attr).
        // This makes code colors follow the theme toggle automatically.
        defaultColor: 'light-dark()',
      });
    }
  };
  return marked.parse(markdown, {
    async: true,
    walkTokens,
    renderer: new PostImageRenderer(),
  }).then((html) => ({ html, excerpt }));
}
