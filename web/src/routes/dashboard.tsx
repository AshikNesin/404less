import { createFileRoute, redirect } from '@tanstack/react-router';

// Legacy path (pre-SPA verify emails) -> app home
export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => { throw redirect({ to: '/app' }); },
});
