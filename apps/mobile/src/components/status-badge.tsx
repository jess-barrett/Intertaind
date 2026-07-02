/**
 * Status pill — the RN mirror of web's `apps/web/src/components/
 * status-badge.tsx`. Presentation only: renders a tracking status as a
 * colored pill. The per-status color map (text + bg-at-10%) is shared
 * with the tracking panel's status chips so the two never drift.
 *
 * v1 is text-only. Follow-up: add lucide-equivalent status icons
 * (web uses Eye/Clock/Check/X/Pause) via react-native-svg to reach
 * full visual parity with the web badge.
 */
import { Text, View } from "react-native";
import type { TrackingStatus } from "@intertaind/types";

/**
 * Per-status label + Tailwind color classes, mirroring web's
 * STATUS_CONFIG. `color` is the text token; `bg` the 10%-tint surface.
 * Exported so the tracking panel reuses the exact same mapping.
 */
export const STATUS_BADGE_CONFIG: Record<
  TrackingStatus,
  { label: string; color: string; bg: string }
> = {
  want: { label: "Want", color: "text-brand-light", bg: "bg-brand/10" },
  in_progress: {
    label: "In Progress",
    color: "text-accent-game",
    bg: "bg-accent-game/10",
  },
  completed: {
    label: "Completed",
    color: "text-accent-book",
    bg: "bg-accent-book/10",
  },
  dropped: {
    label: "Dropped",
    color: "text-accent-movie",
    bg: "bg-accent-movie/10",
  },
  on_hold: {
    label: "On Hold",
    color: "text-text-secondary",
    bg: "bg-surface-overlay",
  },
};

export default function StatusBadge({ status }: { status: TrackingStatus }) {
  const config = STATUS_BADGE_CONFIG[status];
  return (
    <View className={`self-start rounded-full px-3 py-1 ${config.bg}`}>
      <Text className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </Text>
    </View>
  );
}
