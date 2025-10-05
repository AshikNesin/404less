import type { TodoCreate, TodoOut, TodoUpdate } from "../api/types"

const BASE_URL = "/api"

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
	return request<TodoOut[]>("/todos")
}

export async function createTodo(payload: TodoCreate): Promise<TodoOut> {
	return request<TodoOut>("/todos", {
		method: "POST",
		body: JSON.stringify(payload),
	})
}

export async function updateTodo(
	todoId: number,
	payload: TodoUpdate,
): Promise<TodoOut> {
	return request<TodoOut>(`/todos/${todoId}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	})
}

export async function deleteTodo(todoId: number): Promise<void> {
	await request(`/todos/${todoId}`, { method: "DELETE" })
}
