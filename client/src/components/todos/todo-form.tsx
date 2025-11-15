import { type FormEvent, useState } from "react"

import { Button } from "../ui/button"
import { Input } from "../ui/input"

interface TodoFormProps {
	onSubmit: (title: string) => Promise<void>
}

export function TodoForm({ onSubmit }: TodoFormProps) {
	const [title, setTitle] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!title.trim()) {
			return
		}
		setError(null)
		setIsSubmitting(true)
		try {
			await onSubmit(title.trim())
			setTitle("")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong")
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-2 md:flex-row md:items-center"
		>
			<Input
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				placeholder="Add a todo"
				aria-label="Todo title"
				disabled={isSubmitting}
			/>
			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Adding..." : "Add"}
			</Button>
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
		</form>
	)
}
