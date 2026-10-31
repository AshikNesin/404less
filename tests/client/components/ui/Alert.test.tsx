/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vite-plus/test";
import { Alert, AlertDescription, AlertTitle } from "@groot/ui/alert";

describe("Alert", () => {
  it("renders title and description", () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something happened.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Something happened.")).toBeInTheDocument();
  });

  it("defaults to the default variant styling", () => {
    render(
      <Alert data-testid="alert">
        <AlertDescription>plain</AlertDescription>
      </Alert>,
    );
    const el = screen.getByTestId("alert");
    expect(el.getAttribute("class")).toContain("bg-card");
  });

  it("applies the destructive variant", () => {
    render(
      <Alert variant="destructive" data-testid="alert">
        <AlertDescription>danger</AlertDescription>
      </Alert>,
    );
    const el = screen.getByTestId("alert");
    expect(el.getAttribute("class")).toContain("text-destructive");
  });
});
