import { Clock, Check, Eye, Pause, X } from "lucide-react";
import type { TrackingStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  TrackingStatus,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  want: { label: "Want", color: "text-brand-light", bg: "bg-brand/10", icon: Eye },
  in_progress: { label: "In Progress", color: "text-accent-game", bg: "bg-accent-game/10", icon: Clock },
  completed: { label: "Completed", color: "text-accent-book", bg: "bg-accent-book/10", icon: Check },
  dropped: { label: "Dropped", color: "text-accent-movie", bg: "bg-accent-movie/10", icon: X },
  on_hold: { label: "On Hold", color: "text-text-secondary", bg: "bg-surface-overlay", icon: Pause },
};

export default function StatusBadge({ status }: { status: TrackingStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.color} ${config.bg}`}
    >
      <Icon size={12} />
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };
