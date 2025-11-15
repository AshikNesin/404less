import { useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { MagicLinkForm } from "./MagicLinkForm"
import { useAuth } from "../../contexts/AuthContext"

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function SignInModal({ isOpen, onClose, onSuccess }: SignInModalProps) {
  const { isAuthenticated } = useAuth()
  const [showSuccess, setShowSuccess] = useState(false)

  // If already authenticated, don't show the modal
  if (isAuthenticated || !isOpen) {
    return null
  }

  const handleSuccess = () => {
    setShowSuccess(true)
    setTimeout(() => {
      onClose()
      onSuccess?.()
    }, 2000)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Enter your email to receive a magic link for instant access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showSuccess ? (
            <MagicLinkForm
              onSuccess={handleSuccess}
              onCancel={onClose}
            />
          ) : (
            <div className="text-center py-8">
              <div className="text-green-600 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Check your email</h3>
              <p className="text-muted-foreground">
                Magic link sent! Click the link in your email to sign in.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}