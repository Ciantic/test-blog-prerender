
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { marked, Renderer } from 'marked';
import type { Token, Tokens } from 'marked';
import { imageSize } from 'image-size';


/** An image token with pixel dims attached by the async sizing step. */
interface SizedImage extends Tokens.Image {
  dims?: { width: number; height: number };
}

class PostImageRenderer extends Renderer {
  image(this: PostImageRenderer, token: Tokens.Image): string {
    // dims were computed by the async walkTokens step, which ran before this
    // renderer (the parser awaits walkTokens when async: true).
    const dims = (token as SizedImage).dims;
    const dimsAttr = dims ? ` width="${dims.width}" height="${dims.height}"` : '';
    return `<img src="${token.href}" alt="${token.text ?? ''}"${dimsAttr}>`;
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
