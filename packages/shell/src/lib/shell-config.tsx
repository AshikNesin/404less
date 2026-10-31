import { createContext, useContext, type ReactNode } from "react";
import { LayoutDashboard, type LucideIcon } from "lucide-react";

export interface LoginFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

/**
 * One place the app can go. Every destination is a ⌘K command; a `primary`
 * one is also a sidebar row, the rest are rows in the account (profile) menu.
 */
export interface NavDestination {
  label: string;
  icon?: LucideIcon;
  to: string;
  primary?: boolean;
}

export interface ShellBrand {
  label: string;
  /** Logo mark; defaults to `LayoutDashboard`. */
  icon?: LucideIcon;
  /** Where the logo links; defaults to `/`. */
  to?: string;
}

export interface ShellConfig {
  brand?: ShellBrand;
  /** The app's destinations, in display order. Logout and the theme menu are always added. */
  nav?: NavDestination[];
  login?: {
    tagline?: string;
    description?: string;
    features?: LoginFeature[];
  };
}

const ShellConfigContext = createContext<ShellConfig>({});

export function ShellProvider({ config, children }: { config: ShellConfig; children: ReactNode }) {
  return <ShellConfigContext.Provider value={config}>{children}</ShellConfigContext.Provider>;
}

/** The provided config with the shell's defaults filled in. */
export function useShellConfig() {
  const config = useContext(ShellConfigContext);
  const brand: Required<ShellBrand> = {
    label: config.brand?.label ?? "Groot",
    icon: config.brand?.icon ?? LayoutDashboard,
    to: config.brand?.to ?? "/",
  };
  return { ...config, brand, nav: config.nav ?? [] };
}
