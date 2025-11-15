import type { TodoOut } from "../../api/types"
import { TodoItem } from "./todo-item"

interface TodoListProps {
	todos: TodoOut[]
	onToggle: (todoId: number, completed: boolean) => Promise<void>
	onDelete: (todoId: number) => Promise<void>
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
	if (todos.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No todos yet. Create one above!
			</p>
		)
	}

	return (
		<ul className="flex flex-col gap-3">
			{todos.map((todo) => (
				<TodoItem
					key={todo.id}
					todo={todo}
					onToggle={onToggle}
					onDelete={onDelete}
				/>
			))}
		</ul>
	)
}
