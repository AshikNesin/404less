import { create } from "zustand";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { ApiError, apiClient } from "@groot/shell/lib/api";
import type { SessionUser } from "@groot/core/auth/auth.schema";

/** The signed-in user, as `/auth/me` and both sign-in routes return it.
 *  Defined once in `@groot/core` (type-only import, erased at build). */
export type { SessionUser };

interface AuthState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  /** False until the first `checkAuth()` settles. */
  hasCheckedAuth: boolean;
  /**
   * Bumped on every sign-in and sign-out. A request that records it when sent
   * can tell whether its 401 belongs to the current session.
   */
  generation: number;

  /** Sign in with email and password. Word a rejection with `loginErrorDescription`. */
  login: (email: string, password: string) => Promise<SessionUser>;
  /** Sign in with a passkey (WebAuthn). Word a rejection with `loginErrorDescription`. */
  loginWithPasskey: () => Promise<SessionUser>;
  /** Clear the server cookie and the local session. Never rejects. */
  logout: () => Promise<void>;
  /** Resolve the session from the cookie on app load. */
  checkAuth: () => Promise<void>;
  /** End the local session without a server call (the cookie is already gone). */
  clearAuth: () => void;
}

/**
 * The wording a person sees when sign-in fails. A 401 is always "wrong
 * credentials" for the person typing; a `TypeError` from `fetch` means the
 * request never reached the server.
 */
export function loginErrorDescription(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.status === 401 ? "Invalid email or password." : error.message || fallback;
  }
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "Passkey sign-in was cancelled or not allowed. Please try again.";
  }
  if (error instanceof Error && error.name === "NotSupportedError") {
    return "Passkeys are not supported in this browser.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function passkeySignIn(): Promise<SessionUser> {
  const optionsJSON = await apiClient.post<PublicKeyCredentialRequestOptionsJSON>(
    "/passkey/login/options",
    {},
  );
  const response = await startAuthentication({ optionsJSON });
  try {
    const { user } = await apiClient.post<{ user: SessionUser }>("/passkey/login/verify", {
      response,
    });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new Error("This passkey could not be verified. Try another one or use your password.", {
        cause: error,
      });
    }
    throw error;
  }
}

/** When `generation` last changed (`performance.now()`), for the 401 hook below. */
let generationChangedAt = 0;

/**
 * The client session: who is signed in, how they sign in and out, and what a
 * 401 means. The server keeps the session in an HttpOnly cookie, so this
 * holds only the user.
 */
export const useAuthStore = create<AuthState>((set) => {
  const change = (user: SessionUser | null) => {
    generationChangedAt = performance.now();
    set((s) => ({ user, isAuthenticated: user !== null, generation: s.generation + 1 }));
  };

  const signIn = async (run: () => Promise<SessionUser>) => {
    try {
      const user = await run();
      change(user);
      return user;
    } catch (error) {
      set({ user: null, isAuthenticated: false });
      throw error;
    }
  };

  return {
    user: null,
    isAuthenticated: false,
    hasCheckedAuth: false,
    generation: 0,

    login: (email, password) =>
      signIn(async () => {
        const { user } = await apiClient.post<{ user: SessionUser }>("/auth/login", {
          email,
          password,
        });
        return user;
      }),

    loginWithPasskey: () => signIn(passkeySignIn),

    logout: async () => {
      try {
        await apiClient.post("/auth/logout");
      } catch {
        // An expired cookie answers 401; the local session ends either way.
      }
      change(null);
    },

    checkAuth: async () => {
      let user: SessionUser | null = null;
      try {
        user = await apiClient.get<SessionUser>("/auth/me");
      } catch {
        // No session cookie, or an expired one.
      }
      change(user);
      set({ hasCheckedAuth: true });
    },

    clearAuth: () => change(null),
  };
});

// A 401 mid-session means the cookie expired: drop the user so
// <ProtectedRoute> sends them to /login. A 401 for a request sent before the
// last sign-in or sign-out belongs to an earlier session and is ignored.
apiClient.onUnauthorized(({ sentAt }) => {
  if (useAuthStore.getState().isAuthenticated && sentAt >= generationChangedAt) {
    useAuthStore.getState().clearAuth();
  }
});
