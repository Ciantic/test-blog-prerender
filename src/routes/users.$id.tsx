import { Link, createFileRoute } from '@tanstack/solid-router';

// Dummy user data, embedded directly. Swap for any API endpoint — the loader
// stays async so the shape is identical to a real fetch.
const users: Record<string, { name: string; title: string }> = {
  '1': { name: 'Ada Lovelace', title: 'First programmer' },
  '2': { name: 'Grace Hopper', title: 'Compiler pioneer' },
  '3': { name: 'Margaret Hamilton', title: 'Software engineering' },
};

// Dummy async — mimics a network round-trip so the loader behaves like a real
// fetch during SSR/prerendering.
async function fetchUser(id: string) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return users[id] ?? { name: 'Unknown', title: 'No such user' };
}

function UserPage() {
  // Typed by the loader's return type; reactive to param changes.
  const user = Route.useLoaderData();

  return (
    <main>
      <h1>Users</h1>
      <section>
        <h2>{user().name}</h2>
        <p>{user().title}</p>
        <p>
          <Link
            to="/users/$id"
            params={(prev) => ({ id: String(Number(prev.id) + 1) })}
          >
            Next user
          </Link>
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/users/$id')({
  loader: ({ params }) => fetchUser(params.id),
  head: ({ params }) => ({
    meta: [{ title: `User ${params.id} - Solid App` }],
  }),
  component: UserPage,
});
