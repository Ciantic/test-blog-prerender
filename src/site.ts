// Site-wide, blog-specific config. Single source of truth for things like
// the blog name, its public URL, and feed metadata — import these instead of
// hardcoding the strings in each file.

/** Canonical origin of the deployed site, with no trailing slash. */
export const SITE_URL = 'https://ciantic.iki.fi';

/** The name of the blog/site, shown in the navbar, `<title>`, and the feed. */
export const SITE_NAME = 'Ciantic\'s Blog';

export const SITE_TITLE = 'Ciantic\'s Blog - Guides so old you don\'t need them, the usual.';

/** Human-readable description, used in the RSS `<channel>`. */
export const SITE_DESCRIPTION = 'Guides so old you don\'t need them, the usual.';

/** `xml:lang`/`<language>` for the feed. */
export const SITE_LANGUAGE = 'en';

/** Copyright string for the feed; empty disables the footer line. */
export const SITE_COPYRIGHT = '';
