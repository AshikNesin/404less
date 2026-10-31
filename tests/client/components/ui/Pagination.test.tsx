/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vite-plus/test";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@groot/ui/pagination";

function PageFixture({ page, onPage }: { page: number; onPage: (n: number) => void }) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" onClick={() => onPage(page - 1)} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive={page === 1} onClick={() => onPage(1)}>
            1
          </PaginationLink>
          <PaginationLink href="#" isActive={page === 2} onClick={() => onPage(2)}>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" onClick={() => onPage(page + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

describe("Pagination", () => {
  it("renders page links with navigation landmarks", () => {
    render(<PageFixture page={1} onPage={() => {}} />);
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("marks the active page and fires navigation callbacks", async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<PageFixture page={1} onPage={onPage} />);

    await user.click(screen.getByText("2"));
    expect(onPage).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole("link", { name: /go to next page/i }));
    expect(onPage).toHaveBeenCalledWith(2); // page 1 + 1
  });

  it("aria-current marks the active link", () => {
    render(<PageFixture page={2} onPage={() => {}} />);
    const active = screen.getByText("2");
    expect(active.getAttribute("aria-current")).toBe("page");
  });
});
