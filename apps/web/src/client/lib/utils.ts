// Class merging for the app. tailwind-merge does not know the app's own type
// scale (styles.css), so by default it reads `text-metric`, `text-meta`, … as
// text *colors* and drops them when a real color follows: `cn("text-metric",
// "text-destructive")` used to lose the size. Registering them as font sizes
// keeps both.
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-page-title",
        "text-section-title",
        "text-eyebrow",
        "text-caption",
        "text-meta",
        "text-metric",
        "text-code",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
