import { RouterProvider } from '@tanstack/solid-router';

import { getRouter } from './router';

// The app root: TanStack Start's generated entries call getRouter() and
// render <RouterProvider> through StartClient/StartServer.
export default function App() {
  return <RouterProvider router={getRouter()} />;
}
