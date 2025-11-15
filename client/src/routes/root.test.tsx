import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Root } from "./root"

vi.mock("../lib/api", () => ({
	listTodos: vi.fn(() =>
		Promise.resolve([{ id: 1, title: "Existing", completed: false }]),
	),
	createTodo: vi.fn((payload: { title: string }) =>
		Promise.resolve({ id: 2, title: payload.title, completed: false }),
	),
	updateTodo: vi.fn((todoId: number, payload: { completed: boolean }) =>
		Promise.resolve({
			id: todoId,
			title: "Existing",
			completed: payload.completed,
		}),
	),
	deleteTodo: vi.fn(() => Promise.resolve()),
}))

describe("Root route", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it("renders todos fetched from the API", async () => {
		render(<Root />)

		await waitFor(() => {
			expect(screen.getByText("Existing")).toBeInTheDocument()
		})
	})

	it("creates a new todo", async () => {
		render(<Root />)

		await waitFor(() => screen.getByText("Existing"))

		fireEvent.change(screen.getByLabelText("Todo title"), {
			target: { value: "New todo" },
		})
		fireEvent.click(screen.getByRole("button", { name: /add/i }))

		await waitFor(() => {
			expect(screen.getByText("New todo")).toBeInTheDocument()
		})
	})
})
