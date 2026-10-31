import { Button } from "@groot/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@groot/ui/dropdown-menu";
import { Input } from "@groot/ui/input";
import { useAvailableJobs } from "@groot/jobs/client/queries";
import type { JobName } from "@groot/jobs/client/types";
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

type Props = {
  id: string;
  value: JobName | "";
  onChange: (value: JobName) => void;
  disabled?: boolean;
};

/** Searchable job-type picker used by the add-job and schedule dialogs. */
export function JobTypeSelect({ id, value, onChange, disabled }: Props) {
  const availableJobs = useAvailableJobs();
  const [search, setSearch] = useState("");
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          id={id}
          className="w-full justify-between border-input pr-2.5 pl-3 font-normal hover:bg-transparent aria-expanded:bg-transparent dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className={value ? "" : "text-muted-foreground"}>{value || "Select job type"}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <div className="px-2 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search job types..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 border-0 bg-transparent focus-visible:ring-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[180px] overflow-y-auto">
          {availableJobs.map((job) =>
            job.toLowerCase().includes(search.toLowerCase()) ? (
              <DropdownMenuItem key={job} onSelect={() => onChange(job)}>
                {job}
              </DropdownMenuItem>
            ) : null,
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
