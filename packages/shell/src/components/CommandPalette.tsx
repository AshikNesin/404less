import * as React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Search, type LucideIcon } from "lucide-react";
import { useCommandPaletteStore } from "@groot/shell/store/command-palette";
import { useShellConfig } from "@groot/shell/lib/shell-config";
import { THEME_OPTIONS, useTheme } from "@groot/shell/lib/theme";
import { useSignOut } from "@groot/shell/hooks/useSignOut";
import { Dialog, DialogContent, DialogTitle } from "@groot/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@groot/ui/command";

/** A single selectable entry inside a command-palette group. */
export interface CommandItemEntry {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  variant?: "default" | "destructive";
  /** Stable React key. Defaults to `label`; set when labels may duplicate. */
  id?: string;
}

/** A labeled group of commands in the palette. */
export interface CommandGroupEntry {
  heading: string;
  items: CommandItemEntry[];
  /** Stable React key. Defaults to `heading`; set when headings may duplicate. */
  id?: string;
}

/** Icon button that opens the shared command palette dialog. */
export function CommandPaletteTrigger() {
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Search (⌘K)"
      className="inline-flex size-8 items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Search className="size-4" />
    </button>
  );
}

/**
 * The command palette dialog: render once at the app root. It lists the
 * `ShellConfig.nav` destinations, then the app's own `groups`, then the
 * built-in Theme and Account (log out) commands.
 */
export function CommandPaletteDialog({ groups = [] }: { groups?: CommandGroupEntry[] }) {
  const open = useCommandPaletteStore((state) => state.open);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const navigate = useNavigate();
  const { nav } = useShellConfig();
  const { setTheme } = useTheme();
  const signOut = useSignOut();

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  const resolvedGroups: CommandGroupEntry[] = [
    ...(nav.length > 0
      ? [
          {
            id: "shell-navigation",
            heading: "Navigation",
            items: nav.map((item) => ({
              id: item.to,
              label: item.label,
              icon: item.icon,
              onSelect: () => navigate(item.to),
            })),
          },
        ]
      : []),
    ...groups,
    {
      id: "shell-theme",
      heading: "Theme",
      items: THEME_OPTIONS.map(({ value, label, icon }) => ({
        id: `theme-${value}`,
        label: `${label} theme`,
        icon,
        onSelect: () => setTheme(value),
      })),
    },
    {
      id: "shell-account",
      heading: "Account",
      items: [{ label: "Log out", icon: LogOut, onSelect: signOut, variant: "destructive" }],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">Command Menu</DialogTitle>
        <Command className="[&_[cmdk-input-wrapper]]:border-b-0">
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {resolvedGroups.map((group, idx) => (
              <React.Fragment key={group.id ?? group.heading}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.items.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <CommandItem
                        key={entry.id ?? entry.label}
                        onSelect={() => runCommand(entry.onSelect)}
                        className={
                          entry.variant === "destructive"
                            ? "text-destructive data-[selected=true]:text-destructive"
                            : undefined
                        }
                      >
                        {Icon ? <Icon /> : null}
                        <span>{entry.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
