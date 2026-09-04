const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const LINK_TAG = /<link\b[^>]*>\s*/gi;
const HYDRATION_KEY = /\s_hk=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const HYDRATION_MARKER = /<!--(?:!?\$|\/|xs)-->/g;

function getAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function isJavascriptPreload(tag: string): boolean {
  const rel = getAttribute(tag, 'rel')?.toLowerCase();
  if (rel !== 'modulepreload' && rel !== 'preload') return false;

  return getAttribute(tag, 'as')?.toLowerCase() === 'script'
    || /\.js(?:[?#]|$)/i.test(getAttribute(tag, 'href') ?? '');
}

/** Removes hydration and client-bundle markup from prerendered HTML. */
export function removeJavaScriptFromHtml(html: string): string {
  return html
    .replace(SCRIPT_TAG, '')
    .replace(LINK_TAG, (tag) => isJavascriptPreload(tag) ? '' : tag)
    .replace(HYDRATION_KEY, '')
    .replace(HYDRATION_MARKER, '');
}