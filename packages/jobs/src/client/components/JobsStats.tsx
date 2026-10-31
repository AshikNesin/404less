import { Card } from "@groot/ui/card";
import { StatTile } from "@groot/ui/stat-tile";
import { useJobStats } from "@groot/jobs/client/queries";
import { Activity, CheckCircle, Clock, X, XCircle } from "lucide-react";
import { JobsStatsSkeleton } from "./skeletons";

type StatItem = {
  key: string;
  label: string;
  value: number;
  colorClass: string;
  icon: React.ReactNode;
};

type Props = {
  activeState: string;
  onSelectState: (state: string) => void;
};

/** Compact, clickable stat row that filters the jobs list by state. */
export function JobsStats({ activeState, onSelectState }: Props) {
  const { data: stats } = useJobStats();
  if (!stats) {
    return <JobsStatsSkeleton />;
  }

  const items: StatItem[] = [
    {
      key: "all",
      label: "Total",
      value: stats.active + stats.created + stats.failed + stats.completed + stats.cancelled,
      colorClass: "text-foreground",
      icon: <Activity className="size-3.5" />,
    },
    {
      key: "active",
      label: "Active",
      value: stats.active,
      colorClass: "text-info",
      icon: <Activity className="size-3.5" />,
    },
    {
      key: "created",
      label: "Created",
      value: stats.created,
      colorClass: "text-muted-foreground",
      icon: <Clock className="size-3.5" />,
    },
    {
      key: "failed",
      label: "Failed",
      value: stats.failed,
      colorClass: "text-destructive",
      icon: <XCircle className="size-3.5" />,
    },
    {
      key: "completed",
      label: "Completed",
      value: stats.completed,
      colorClass: "text-success",
      icon: <CheckCircle className="size-3.5" />,
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: stats.cancelled,
      colorClass: "text-muted-foreground",
      icon: <X className="size-3.5" />,
    },
  ];

  return (
    <Card size="sm" className="flex flex-row flex-wrap items-stretch gap-0 p-0">
      {items.map((item, idx) => (
        <StatTile
          key={item.key}
          label={item.label}
          value={item.value.toLocaleString()}
          icon={item.icon}
          valueClassName={item.colorClass}
          active={activeState === item.key}
          onClick={() => onSelectState(item.key)}
          className={idx !== 0 ? "border-l border-border/60" : undefined}
        />
      ))}
    </Card>
  );
}
