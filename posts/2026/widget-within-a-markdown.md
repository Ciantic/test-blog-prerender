# Widget Within a Markdown File

This post demonstrates how to include a Solid component (widget) within a Markdown file. The widget is represented as a self-closing tag with a capitalized name, like `<Counter />`. During the Markdown processing, this tag is replaced with a `<div>` that has a `data-widget` attribute. The client-side code then mounts the actual Solid component into this `<div>` after the initial hydration of the app.

<Counter />

It is a bit hack, but works!