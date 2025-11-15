import { useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { requestMagicLink } from "../../lib/api"

interface MagicLinkFormProps {
  onSuccess?: (email: string) => void
  onCancel?: () => void
}

export function MagicLinkForm({ onSuccess, onCancel }: MagicLinkFormProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    try {
      const response = await requestMagicLink(email)

      if (response.magic_url) {
        // Development mode - show the magic link
        setSuccess(`Magic link generated! ${response.message}. In development: ${response.magic_url}`)
      } else {
        // Production mode - email would be sent
        setSuccess(response.message)
      }

      onSuccess?.(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="w-full"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
            {success}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? "Sending..." : "Send Magic Link"}
          </Button>

          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}