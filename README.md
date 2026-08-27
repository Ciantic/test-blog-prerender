# SolidJS + TanStack Start test

Static-prerendered solid blog demo.

```bash
pnpm install
pnpm dev            # dev server at http://localhost:3000
pnpm build          # build + prerender static site into dist/client
pnpm serve:static   # serve prerendered dist/client at http://localhost:4173
```

To add your own posts, make a new repository, and symbolic link it into the `posts` folder. In this example posts are not in separate repository, but tucked in this same repository.

## Currently implemented

- Directory structure for posts is mirrored from the `posts` directory.
- Each post is a `.md` and is rendered into a static page.
- Post publish date is read from git repository commit history.
- Frontmatter (`title`, `date`, `excerpt`) overrides the derived title,
  first-paragraph excerpt and git-derived publish date.
- Blog index is grouped by year and sorted newest first.
- Everything is prerendered
- Pages load without JavaScript
- RSS feed (basic, no paging)
- Blog index (basic, no paging)


## Not implemented

- Paging for the blog index and RSS feed