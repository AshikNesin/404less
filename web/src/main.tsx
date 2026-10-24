import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { ToastProvider } from './components/ui/toast';
import { EmptyState } from './components/ui/empty-state';
import { Button } from './components/ui/button';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultErrorComponent: ({ error, reset }) => (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState kind="error" variant="plain" size="lg" title="Something went wrong"
        description={error instanceof Error ? error.message : String(error)}
        action={<Button variant="outline" onClick={reset}>Try again</Button>} />
    </div>
  ),
  defaultNotFoundComponent: () => (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState variant="plain" size="lg" title="Page not found" description="Ironic, we know. The page you asked for isn’t part of the app."
        action={<Button variant="outline" onClick={() => router.navigate({ to: '/app' })}>Back to the app</Button>} />
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
