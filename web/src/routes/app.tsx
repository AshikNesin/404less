// Authenticated app: sidebar shell wraps all /app pages.
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const res = await fetch('/api/teams');
    if (res.status === 401) {
      window.location.href = '/';
      await new Promise(() => {}); // halt navigation; browser redirects
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
