# Prerendering Explained

Prerendering generates static HTML at build time so pages load instantly.

## How it works

1. The build tool visits each route
2. It renders the page to HTML
3. The output is written to disk and served statically

## Benefits

- Faster first paint
- Better SEO
- No server required at runtime
