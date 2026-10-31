/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Box, CheckSquare, HardDrive, Settings as SettingsIcon, Star } from "lucide-react";
import { type ShellConfig, ShellProvider } from "@groot/shell/lib/shell-config";
import { Layout } from "@groot/shell/components/Layout";
import { Login } from "@groot/shell/pages/auth/Login";
import { useAuthStore } from "@groot/shell/store/auth";
import { useCommandPaletteStore } from "@groot/shell/store/command-palette";

const CONFIG: ShellConfig = {
  brand: { label: "Acme" },
  nav: [
    { label: "Todos", icon: CheckSquare, to: "/todos", primary: true },
    { label: "Storage", icon: HardDrive, to: "/storage" },
    { label: "Settings", icon: SettingsIcon, to: "/settings" },
  ],
};

function renderLayout(config: ShellConfig, props: Parameters<typeof Layout>[0] = {}) {
  useAuthStore.setState({ user: { id: 1, email: "demo@example.com", name: "Demo User" } });
  return render(
    <MemoryRouter initialEntries={["/todos"]}>
      <ShellProvider config={config}>
        <Routes>
          <Route path="/" element={<Layout {...props} />}>
            <Route path="todos" element={<p>todos page</p>} />
          </Route>
        </Routes>
      </ShellProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  useCommandPaletteStore.setState({ open: false });
  useAuthStore.setState({ user: null });
});

describe("ShellConfig", () => {
  it("overrides Login brand and marketing copy", () => {
    render(
      <MemoryRouter>
        <ShellProvider
          config={{
            brand: { label: "Acme" },
            login: {
              tagline: "Ship smarter.",
              features: [{ icon: Box, title: "Custom feature", desc: "Custom description" }],
            },
          }}
        >
          <Login />
        </ShellProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Ship smarter.")).toBeInTheDocument();
    expect(screen.getByText("Custom feature")).toBeInTheDocument();
  });

  it("keeps the Groot Login defaults without a provider", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText("Groot")).toBeInTheDocument();
  });

  it("puts primary destinations in the sidebar", () => {
    renderLayout(CONFIG);
    const todos = screen.getAllByRole("link", { name: "Todos" });
    expect(todos.length).toBeGreaterThan(0);
    for (const link of todos) expect(link).toHaveAttribute("href", "/todos");
    expect(screen.queryByRole("link", { name: "Storage" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
  });

  it("puts the other destinations, the theme menu and log out in the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderLayout(CONFIG);
    await user.click(screen.getAllByRole("button", { name: /demo user/i })[0]!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Storage" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Todos" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Theme" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
  });

  it("lists every destination in ⌘K, and keeps Theme and Log out next to app groups", () => {
    useCommandPaletteStore.setState({ open: true });
    renderLayout(CONFIG, {
      commandGroups: [
        { heading: "Actions", items: [{ label: "Star", icon: Star, onSelect() {} }] },
      ],
    });
    const palette = screen.getByRole("dialog");
    for (const name of ["Todos", "Storage", "Settings", "Star", "Dark theme", "Log out"]) {
      expect(within(palette).getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("keeps log out in the account menu when the app has no destinations", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderLayout({});
    await user.click(screen.getAllByRole("button", { name: /demo user/i })[0]!);
    expect(await screen.findByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Theme" })).toBeInTheDocument();
  });
});
