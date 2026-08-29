---
title: Supported Markdown
date: 2026-08-29
excerpt: A tour of the extra markdown features supported by this blog — GFM alerts, footnotes, and more.
---

# Supported Markdown

This post showcases the markdown features this blog supports beyond plain text.
Everything here is rendered from the `.md` source at build time.

## Alerts

GitHub-style alerts turn a blockquote into a colored callout. Start a blockquote
with one of `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`, or `[!IMPORTANT]`.

> [!NOTE]
> Useful information that users should know, even when skimming.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!WARNING]
> Content that could cause problems if ignored.

> [!CAUTION]
> Potentially destructive or risky content.

> [!IMPORTANT]
> Key information users need to know to succeed.

## Footnotes

Use `[^1]` in the text and define the note anywhere in the file[^1]. The note
renders at the bottom of the post[^2], and each reference links back to its
definition[^1].

[^1]: The first footnote. References can repeat and still link to the same note.
[^2]: Footnotes render in a list at the end of the document, in order of first reference.

## Code

Fenced code blocks are syntax-highlighted with Shiki and follow the theme.

```ts
import { createSignal } from "solid-js";

const [count, setCount] = createSignal(0);
```

Language-less blocks render as plain text:

```
just some plain output
```

## Links & images

Relative links and images are rewritten to work under the post's URL path.

[Back to the blog index](/)
![A test image](./img/test-image.png)
