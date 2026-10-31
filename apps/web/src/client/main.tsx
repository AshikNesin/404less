import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ApiError } from "./lib/api";
import "./styles.css";

// Light only: the shell's theme (initTheme) is not used, so `.dark` is never applied.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // a 4xx (not found, forbidden) won't change on a second try
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
    // Mutations are not idempotent: a retried POST can create a duplicate.
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
