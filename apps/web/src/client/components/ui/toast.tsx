// Toasts go through @groot/ui's Toaster (sonner, mounted by GrootUIProvider).
// `useToast()` keeps 404less's (kind, message) call shape.
import { useCallback } from "react";
import { toast } from "sonner";

export function useToast() {
  return useCallback((kind: "success" | "error" | "info", message: string) => {
    if (kind === "success") toast.success(message);
    else if (kind === "error") toast.error(message, { duration: 6000 });
    else toast.info(message);
  }, []);
}
