// Routes for the dashboard SPA (served under /app; the marketing site owns /).
import { Component, useEffect, type ReactNode } from "react";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { NuqsAdapter } from "nuqs/adapters/react-router";
import { GrootUIProvider } from "@groot/ui/provider";
import { ProtectedRoute } from "@groot/shell/components/ProtectedRoute";
import { useAuthStore } from "@groot/shell/store/auth";
import { AppShell } from "./components/app-shell";
import { Button } from "./components/ui/button";
import { EmptyState } from "./components/ui/empty-state";
import { BASENAME, Link } from "./lib/router";
import { ApiKeysPage } from "./pages/api-keys";
import { AppIndexPage } from "./pages/app-index";
import { ChannelsPage } from "./pages/channels";
import { CrawlPage } from "./pages/crawl";
import { LinkDetailPage } from "./pages/link-detail";
import { LinksPage } from "./pages/links-list";
import { LoginPage } from "./pages/login";
import { NewSitePage } from "./pages/new-site";
import { OverviewPage } from "./pages/site-overview";
import { SiteLayout } from "./pages/site-layout";
import { SettingsPage } from "./pages/site-settings";

export default function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter basename={BASENAME}>
      <NuqsAdapter>
        <GrootUIProvider>
          <ScrollOnNavigate />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PageErrorBoundary>
                      <Outlet />
                    </PageErrorBoundary>
                  </AppShell>
                </ProtectedRoute>
              }
            >
              <Route index element={<AppIndexPage />} />
              <Route path="sites/new" element={<NewSitePage />} />
              <Route path="sites/:siteId" element={<SiteLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="links" element={<LinksPage />} />
                <Route path="links/:linkId" element={<LinkDetailPage />} />
                <Route path="crawl" element={<CrawlPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="settings/channels" element={<ChannelsPage />} />
              <Route path="settings/api-keys" element={<ApiKeysPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </GrootUIProvider>
      </NuqsAdapter>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        variant="plain"
        size="lg"
        title="Page not found"
        description="Ironic, we know. The page you asked for isn’t part of the app."
        action={
          <Link to="/app">
            <Button variant="outline">Back to the app</Button>
          </Link>
        }
      />
    </div>
  );
}

/** A new page starts at the top; a #hash scrolls to its section once it has rendered. */
function ScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 20) {
        clearInterval(timer);
        el?.scrollIntoView({ block: "start" });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [pathname, hash]);
  return null;
}

/** A page that throws shows the error with a retry, inside the app shell. Resets on navigation. */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState
          kind="error"
          variant="plain"
          size="lg"
          title="Something went wrong"
          description={error instanceof Error ? error.message : String(error)}
          action={
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
}
