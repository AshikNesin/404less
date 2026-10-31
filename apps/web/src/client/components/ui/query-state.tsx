// Loading, error with retry, or content for one query. A failed refetch keeps
// the loaded content on screen, with the error above it (open-seo pattern).
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { TableSkeleton } from "./skeleton";

export function QueryError({
  error,
  fallback,
  onRetry,
  isRetrying,
  variant = "card",
}: {
  error?: unknown;
  fallback: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  variant?: "card" | "plain";
}) {
  const message =
    error instanceof Error && error.message && error.message !== "Failed to fetch"
      ? error.message
      : fallback;
  return (
    <EmptyState
      kind="error"
      variant={variant === "card" ? "card" : "plain"}
      size="sm"
      title={fallback}
      description={message !== fallback ? message : undefined}
      action={
        onRetry && (
          <Button variant="outline" size="sm" pending={isRetrying} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function QueryState<TData>({
  query,
  errorFallback,
  loading = <TableSkeleton />,
  children,
}: {
  query: UseQueryResult<TData>;
  errorFallback: string;
  loading?: React.ReactNode;
  children: (data: TData) => React.ReactNode;
}) {
  if (query.isPending) return <>{loading}</>;
  const error = query.isError ? (
    <QueryError
      error={query.error}
      fallback={errorFallback}
      onRetry={() => void query.refetch()}
      isRetrying={query.isFetching}
    />
  ) : null;
  if (query.data === undefined) return error;
  return (
    <>
      {error}
      {children(query.data)}
    </>
  );
}
