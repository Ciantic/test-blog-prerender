# Notes on File-Based Routing

File-based routing maps files in a directory tree to URL routes.

## Example

```
src/routes/
  index.tsx        -> /
  about.tsx        -> /about
  blog/
    index.tsx      -> /blog
    $slug.tsx      -> /blog/:slug
```

Dynamic segments like `$slug` become route params you can read in loaders.

<Counter />