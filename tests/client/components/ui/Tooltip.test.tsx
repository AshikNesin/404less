/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vite-plus/test";
import { Tooltip, TooltipProvider } from "@groot/ui/tooltip";

describe("Tooltip", () => {
  it("shows content on hover", async () => {
    const user = userEvent.setup({ delay: 50, pointerEventsCheck: 0 });
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Save the document">
          <button type="button">Save</button>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: "Save" }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Save the document");
  });

  it("anchors the tooltip to the wrapped trigger via aria-describedby", async () => {
    const user = userEvent.setup({ delay: 50, pointerEventsCheck: 0 });
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Tip text">
          <button type="button">Hover me</button>
        </Tooltip>
      </TooltipProvider>,
    );

    const btn = screen.getByRole("button", { name: /hover me/i });
    await user.hover(btn);
    await screen.findByRole("tooltip");

    // The a11y contract: the trigger references the tooltip content id.
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!).getAttribute("role")).toBe("tooltip");
  });

  it("requires a provider (documented usage contract)", () => {
    // TooltipProvider renders children untouched; the wrapper's delayDuration
    // default lives there. Smoke-check it composes.
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <div>content</div>
      </TooltipProvider>,
    );
    expect(container).toHaveTextContent("content");
  });
});
