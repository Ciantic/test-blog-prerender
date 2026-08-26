# Getting Started with SolidJS

SolidJS is a declarative JavaScript library for building user interfaces.
It uses fine-grained reactivity instead of a virtual DOM.

## Key concepts

- **Signals** — reactive values that update the UI automatically
- **Effects** — run code when dependencies change
- **Memos** — derived values that cache their results

```tsx
import { createSignal } from "solid-js";

const [count, setCount] = createSignal(0);

<button onClick={() => setCount(count() + 1)}>
  Count: {count()}
</button>
```

That's all you need to get going!
