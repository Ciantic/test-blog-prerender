
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { marked, Renderer } from 'marked';
import type { Token, Tokens } from 'marked';
import { imageSize } from 'image-size';


/** An image token with pixel dims attached by the async sizing step. */
interface SizedImage extends Tokens.Image {
  dims?: { width: number; height: number };
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
}

export function renderMarkdown(markdown: string, absPath: string): Promise<string> {
  // The post's directory — image refs in the markdown are relative to it.
  const postDir = dirname(absPath);
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
    }
  };
  return marked.parse(markdown, {
    async: true,
    walkTokens,
    renderer: new PostImageRenderer(),
  }) as Promise<string>;
}
