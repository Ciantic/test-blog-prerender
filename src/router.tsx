import { createRouter } from '@tanstack/solid-router';
import { routeTree } from './routeTree.gen';

// You must export a getRouter function that returns a new router instance
// each time — TanStack Start calls it per request on the server and once on
// the client, so the router is always bound to the current request.
export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPendingComponent: () => <main>Loading…</main>,
    scrollRestoration: true,
  });

  return router;
}

// Registers the router's types library-wide, so `to`/`params` on every
// <Link> typecheck against the actual routes.
declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
