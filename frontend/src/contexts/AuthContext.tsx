import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { getAuthToken, getCurrentUser, removeAuthToken, removeCurrentUser } from "../lib/api"

interface User {
  id: number
  email: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => void
  login: (user: User, token: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check authentication status on mount
  useEffect(() => {
    const token = getAuthToken()
    const storedUser = getCurrentUser()

    if (token && storedUser) {
      setUser(storedUser)
    }
    setIsLoading(false)
  }, [])

  const login = (userData: User, token: string) => {
    setUser(userData)
    // The token is already set in the api.ts functions
    // We just need to set the user data
  }

  const logout = () => {
    setUser(null)
    removeAuthToken()
    removeCurrentUser()
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    login,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}