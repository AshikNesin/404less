// SegmentedTabs: a controlled pill group (@groot/ui Tabs) for switching what a
// table or snippet shows, with optional counts.
import { Tabs, TabsList, TabsTrigger } from "@groot/ui/tabs";
import { cn } from "../../lib/utils";

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList>
        {items.map((it) => (
          <TabsTrigger key={it.value} value={it.value} className="px-2.5 text-xs">
            {it.label}
            {it.count !== undefined && (
              <span
                className={cn(
                  "num rounded px-1 text-[0.6875rem]",
                  it.value === value
                    ? "bg-foreground/[0.06] text-foreground/70"
                    : "text-foreground/45",
                )}
              >
                {it.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
