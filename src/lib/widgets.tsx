import { render } from '@solidjs/web';
import type { Component } from 'solid-js';
import Counter from '../components/Counter';

/**
 * Registry of Solid components that can be embedded in blog posts.
 *
 * Posts declare a widget with a self-closing tag in their markdown, e.g.
 * `<Counter />`. renderMarkdown rewrites that into a placeholder element
 * `<div data-widget="Counter"></div>` in the static HTML. On the client,
 * mountWidgets() swaps the real Solid component into each placeholder,
 * giving it full interactivity (signals, effects, events).
 */
const widgets: Record<string, Component> = {
  Counter,
};

/**
 * Mount every widget placeholder found under `container` and return a
 * disposer that unmounts them all (e.g. for use with onCleanup).
 */
export function mountWidgets(container: ParentNode): () => void {
  const disposers: Array<() => void> = [];
  container.querySelectorAll<HTMLElement>('[data-widget]').forEach((el) => {
    const name = el.dataset.widget;
    const Component = name ? widgets[name] : undefined;
    if (!Component) return;
    // render() creates its own root, separate from the app tree — exactly
    // what we want for mounting a component into an innerHTML-managed node.
    // NOTE: this must only run after the app's initial hydration has
    // finished (sharedConfig.hydrating === false); otherwise the component's
    // compiled JSX tries to claim hydration keys that don't exist for a
    // root that was never server-rendered. The caller defers to a macrotask.
    disposers.push(render(() => <Component />, el));
  });
  return () => disposers.forEach((dispose) => dispose());
}
