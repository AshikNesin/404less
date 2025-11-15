import { useEffect, useState } from "react"
import { verifyMagicLink, setAuthToken, setCurrentUser } from "../../lib/api"
import { useAuth } from "../../contexts/AuthContext"

interface MagicLinkVerifierProps {
  token?: string
  onVerified?: () => void
  onError?: (error: string) => void
}

export function MagicLinkVerifier({ token, onVerified, onError }: MagicLinkVerifierProps) {
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const urlToken = token || new URLSearchParams(window.location.search).get("token")

  // If no token found, don't render anything
  if (!urlToken) {
    return null
  }

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await verifyMagicLink(urlToken)

        // Store the authentication data
        setAuthToken(response.access_token)
        setCurrentUser(response.user)

        // Update auth context
        login(response.user, response.access_token)

        // Clean up URL
        if (window.location.search) {
          const url = new URL(window.location.href)
          url.searchParams.delete("token")
          window.history.replaceState({}, "", url.toString())
        }

        onVerified?.()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to verify magic link"
        setError(errorMsg)
        onError?.(errorMsg)
      } finally {
        setIsLoading(false)
      }
    }

    verifyToken()
  }, [urlToken, login, onVerified, onError])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying magic link...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="text-red-600 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">Invalid Magic Link</h3>
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  return null
}