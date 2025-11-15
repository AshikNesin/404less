import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { SignInModal } from "../components/auth/SignInModal";
import { MagicLinkVerifier } from "../components/auth/MagicLinkVerifier";
import { useAuth } from "../contexts/AuthContext";
import { Card } from "../components/ui/card";

export function Root() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Show sign-in modal if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowSignInModal(true);
    }
  }, [isLoading, isAuthenticated]);

  const handleVerificationSuccess = () => {
    setVerificationError(null);
    setShowSignInModal(false);
  };

  const handleVerificationError = (error: string) => {
    setVerificationError(error);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="text-2xl font-bold text-foreground">404less</div>
        {isLoading ? (
          <div className="animate-pulse bg-muted h-9 w-24 rounded"></div>
        ) : isAuthenticated ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Sign Out
            </Button>
          </div>
        ) : null}
      </nav>

      {/* Main Content */}
      {isAuthenticated ? (
        <main className="px-6 py-8 max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your websites for 404 errors in real-time
            </p>
          </div>

          {/* Empty State */}
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                No websites yet
              </h2>
              <p className="text-muted-foreground mb-6">
                Get started by adding your first website to monitor for 404 errors
              </p>
              <Button>Add Website</Button>
            </div>
          </Card>
        </main>
      ) : (
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-4">Welcome to 404less</h1>
            <p className="text-muted-foreground mb-6">Sign in to start monitoring your websites</p>
            <Button onClick={() => setShowSignInModal(true)}>Sign In</Button>
          </div>
        </div>
      )}

      {/* Authentication Components */}
      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        onSuccess={handleVerificationSuccess}
      />

      {/* Magic Link Verification - handles URL token verification */}
      <MagicLinkVerifier
        onVerified={handleVerificationSuccess}
        onError={handleVerificationError}
      />

      {/* Verification Error Display */}
      {verificationError && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            <h4 className="font-semibold mb-1">Authentication Error</h4>
            <p>{verificationError}</p>
            <button
              onClick={() => setVerificationError(null)}
              className="mt-2 text-red-600 underline text-xs hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
