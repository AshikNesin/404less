import { Badge } from "@groot/ui/badge";
import { Button } from "@groot/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@groot/ui/dropdown-menu";
import { Input } from "@groot/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@groot/ui/tabs";
import {
  primaryOptions,
  secondaryOptions,
  type JobsQueryPatch,
  type StateTab,
} from "@groot/jobs/client/constants";
import { useAvailableJobs } from "@groot/jobs/client/queries";
import { useState } from "react";
import { Calendar as CalendarIcon, Filter, MoreHorizontal, Search, X } from "lucide-react";

type QueryParams = {
  state: string;
  queue: string;
  search: string;
  datePreset: string;
};

type Props = {
  queryParams: QueryParams;
  setQueryParams: (patch: JobsQueryPatch) => void;
  activeSecondaryTab?: { value: StateTab; label: string };
  hasActiveFilters: boolean;
  handlePresetChange: (value: string) => void;
  handleClearFilters: () => void;
};

/** State tabs + search + queue + date-preset filters for the jobs list. */
export function JobsFilters({
  queryParams,
  setQueryParams,
  activeSecondaryTab,
  hasActiveFilters,
  handlePresetChange,
  handleClearFilters,
}: Props) {
  const availableJobs = useAvailableJobs();
  const [queueSearch, setQueueSearch] = useState("");
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs
        value={queryParams.state}
        onValueChange={(value) => setQueryParams({ state: value, page: 0 })}
      >
        <TabsList>
          {primaryOptions.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`inline-flex h-[calc(100%-1px)] items-center justify-center whitespace-nowrap rounded-lg border border-transparent px-1.5 py-0.5 text-sm font-medium focus-visible:outline-none ${
                  activeSecondaryTab
                    ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                    : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
                }`}
              >
                {activeSecondaryTab ? (
                  <span className="max-w-[5rem] truncate">{activeSecondaryTab.label}</span>
                ) : (
                  <MoreHorizontal className="size-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {secondaryOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => setQueryParams({ state: option.value, page: 0 })}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-40 lg:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={queryParams.search}
            onChange={(e) => setQueryParams({ search: e.target.value, page: 0 })}
            className="pl-9"
          />
        </div>
        {availableJobs.length > 0 && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setQueueSearch("");
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="size-4" />
                <span className="hidden md:inline max-w-[6rem] truncate">
                  {queryParams.queue !== "all" ? queryParams.queue : "Queue"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 pt-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search queues..."
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    className="pl-7 h-8 border-0 bg-transparent focus-visible:ring-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-[200px] overflow-y-auto">
                <DropdownMenuItem onSelect={() => setQueryParams({ queue: "all", page: 0 })}>
                  All Queues
                </DropdownMenuItem>
                {availableJobs.map((jobName) =>
                  jobName.toLowerCase().includes(queueSearch.toLowerCase()) ? (
                    <DropdownMenuItem
                      key={jobName}
                      onSelect={() => setQueryParams({ queue: jobName, page: 0 })}
                    >
                      {jobName}
                    </DropdownMenuItem>
                  ) : null,
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <CalendarIcon className="size-4" />
              <span className="hidden md:inline">
                {queryParams.datePreset !== "all"
                  ? queryParams.datePreset.replace(/-/g, " ")
                  : "Date"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handlePresetChange("today")}>Today</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlePresetChange("last-7-days")}>
              Last 7 Days
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlePresetChange("this-month")}>
              This Month
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlePresetChange("all")}>All Time</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {queryParams.queue !== "all" && (
          <Badge variant="secondary" className="h-9 gap-1 px-3 whitespace-nowrap">
            {queryParams.queue}
            <X
              className="size-3 cursor-pointer"
              onClick={() => setQueryParams({ queue: "all", page: 0 })}
            />
          </Badge>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" onClick={handleClearFilters}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
