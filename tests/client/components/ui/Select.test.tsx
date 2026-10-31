/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vite-plus/test";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@groot/ui/select";

function SelectFixture({ onValueChange }: { onValueChange?: (v: string) => void }) {
  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders the placeholder before any selection", () => {
    render(<SelectFixture />);
    expect(screen.getByText("Pick a fruit")).toBeInTheDocument();
  });

  it("opens the listbox and reports the chosen value", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onValueChange = vi.fn();
    render(<SelectFixture onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    const option = await screen.findByRole("option", { name: "Banana" });
    await user.click(option);

    expect(onValueChange).toHaveBeenCalledWith("banana");
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });
});
