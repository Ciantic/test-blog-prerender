# Notes on File-Based Routing

> [!NOTE]
> This is just an example blog post; the route setup here doesn't reflect the setup in this app.

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
