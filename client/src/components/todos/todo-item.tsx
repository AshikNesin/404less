import { useState } from "react"

import type { CheckedState } from "@radix-ui/react-checkbox"

import type { TodoOut } from "../../api/types"
import { Button } from "../ui/button"
import { Checkbox } from "../ui/checkbox"

interface TodoItemProps {
	todo: TodoOut
	onToggle: (todoId: number, completed: boolean) => Promise<void>
	onDelete: (todoId: number) => Promise<void>
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
	const [isProcessing, setIsProcessing] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleToggle = async (checked: CheckedState) => {
		setIsProcessing(true)
		setError(null)
		try {
			await onToggle(todo.id, Boolean(checked))
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to update todo")
		} finally {
			setIsProcessing(false)
		}
	}

	const handleDelete = async () => {
		setIsProcessing(true)
		setError(null)
		try {
			await onDelete(todo.id)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to delete todo")
		} finally {
			setIsProcessing(false)
		}
	}

	return (
		<li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 shadow-sm">
			<Checkbox
				checked={todo.completed}
				onCheckedChange={handleToggle}
				disabled={isProcessing}
			/>
			<div className="flex flex-1 flex-col">
				<span
					className={
						todo.completed
							? "text-muted-foreground line-through"
							: "text-foreground"
					}
				>
					{todo.title}
				</span>
				{error ? (
					<span className="text-xs text-destructive">{error}</span>
				) : null}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={handleDelete}
				disabled={isProcessing}
			>
				Delete
			</Button>
		</li>
	)
}
