import { useEffect, useState } from "react";

import type { TodoOut } from "../api/types";
import { TodoForm } from "../components/todos/todo-form";
import { TodoList } from "../components/todos/todo-list";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../lib/api";

export function Root() {
  const [todos, setTodos] = useState<TodoOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listTodos();
        setTodos(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load todos");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const handleCreate = async (title: string) => {
    const newTodo = await createTodo({ title });
    setTodos((current) => [...current, newTodo]);
  };

  const handleToggle = async (todoId: number, completed: boolean) => {
    const updated = await updateTodo(todoId, { completed });
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? updated : todo)),
    );
  };

  const handleDelete = async (todoId: number) => {
    await deleteTodo(todoId);
    setTodos((current) => current.filter((todo) => todo.id !== todoId));
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listTodos();
      setTodos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh todos");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-semibold">404less</h1>
            <p className="text-sm text-muted-foreground">
              Reference implementation for the FastAPI backend.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Todos</CardTitle>
            <CardDescription>
              Track tasks and keep your stack tidy. edited
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TodoForm onSubmit={handleCreate} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading todos...</p>
            ) : (
              <TodoList
                todos={todos}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
