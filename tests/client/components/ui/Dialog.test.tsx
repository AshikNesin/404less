import { describe, expect, it } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTrigger } from "@groot/ui/dialog";
import { Button } from "@groot/ui/button";

function Example({ dismissOnOutsideClick }: { dismissOnOutsideClick?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent dismissOnOutsideClick={dismissOnOutsideClick}>
        <h2>Dialog body</h2>
      </DialogContent>
    </Dialog>
  );
}

/** The overlay is what a user actually clicks "outside" on; body is pointer-events:none while open. */
async function clickOutside(user: ReturnType<typeof userEvent.setup>) {
  const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
  expect(overlay).not.toBeNull();
  await user.click(overlay!);
}

describe("DialogContent", () => {
  it("dismisses on a click outside by default", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Dialog body")).toBeVisible();

    await clickOutside(user);

    await waitFor(() => expect(screen.queryByText("Dialog body")).not.toBeInTheDocument());
  });

  it("stays open on a click outside when opted out", async () => {
    const user = userEvent.setup();
    render(<Example dismissOnOutsideClick={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    await clickOutside(user);

    expect(screen.getByText("Dialog body")).toBeVisible();
  });
});
