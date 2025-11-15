import type { TodoCreate, TodoOut, TodoUpdate } from "../api/types"

// Auth types (these should match the backend schemas)
interface MagicLinkRequest {
  email: string
}

interface MagicLinkVerify {
  token: string
}

interface TokenOut {
  access_token: string
  token_type: string
  user: {
    id: number
    email: string
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${BASE_URL}${path}`, {
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
		...init,
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(message || response.statusText)
	}

	if (response.status === 204) {
		return undefined as T
	}

	return (await response.json()) as T
}

export async function listTodos(): Promise<TodoOut[]> {
	return request<TodoOut[]>("/v1/todos")
}

export async function createTodo(payload: TodoCreate): Promise<TodoOut> {
	return request<TodoOut>("/v1/todos", {
		method: "POST",
		body: JSON.stringify(payload),
	})
}

export async function updateTodo(
	todoId: number,
	payload: TodoUpdate,
): Promise<TodoOut> {
	return request<TodoOut>(`/v1/todos/${todoId}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	})
}

export async function deleteTodo(todoId: number): Promise<void> {
	await request(`/v1/todos/${todoId}`, { method: "DELETE" })
}

// Auth API functions
export async function requestMagicLink(email: string): Promise<{ message: string; magic_url?: string; expires_in_minutes?: number }> {
	return request<{ message: string; magic_url?: string; expires_in_minutes?: number }>("/v1/auth/magic-link", {
		method: "POST",
		body: JSON.stringify({ email }),
	})
}

export async function verifyMagicLink(token: string): Promise<TokenOut> {
	return request<TokenOut>("/v1/auth/verify", {
		method: "POST",
		body: JSON.stringify({ token }),
	})
}

// Store and retrieve auth token
export function setAuthToken(token: string): void {
	localStorage.setItem("auth_token", token)
}

export function getAuthToken(): string | null {
	return localStorage.getItem("auth_token")
}

export function removeAuthToken(): void {
	localStorage.removeItem("auth_token")
}

// Store current user info
export function setCurrentUser(user: { id: number; email: string }): void {
	localStorage.setItem("current_user", JSON.stringify(user))
}

export function getCurrentUser(): { id: number; email: string } | null {
	const userStr = localStorage.getItem("current_user")
	return userStr ? JSON.parse(userStr) : null
}

export function removeCurrentUser(): void {
	localStorage.removeItem("current_user")
}
