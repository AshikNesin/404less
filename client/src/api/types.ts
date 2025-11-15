// This file is generated via `pnpm typegen`. Temporary definitions keep the app functional
// during initial scaffolding and will be overwritten by the generator.

export interface TodoOut {
	id: number
	title: string
	completed: boolean
}

export interface TodoCreate {
	title: string
}

export interface TodoUpdate {
	title?: string
	completed?: boolean
}
