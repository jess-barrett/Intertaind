/**
 * Status pill — the RN mirror of web's `apps/web/src/components/
 * status-badge.tsx`. Presentation only: renders a tracking status as a
 * colored pill with its lucide icon + label. The per-status color map
 * (text + bg-at-10%) and the icon map are shared with the tracking
 * panel's status chips so the two never drift.
 *
 * Icon coloring: lucide-react-native icons render through
 * react-native-svg, so their color comes from the `color` PROP (a hex
 * string from `colors[...]`), NOT a NativeWind `className` — className
 * color utilities don't reach the SVG. Size comes from the `size` prop.
 * That's why STATUS_BADGE_CONFIG carries both the className `color`
 * token (for the label Text) and a `iconColor` hex (for the icon).
 */
import { Text, View } from "react-native";
import { Check, Clock, Eye, Pause, X, type LucideIcon } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { TrackingStatus } from "@intertaind/types";

/**
 * Per-status label + Tailwind color classes + lucide icon, mirroring
 * web's STATUS_CONFIG. `color` is the label text token; `bg` the
 * 10%-tint surface; `iconColor` the matching hex (icons take a color
 * prop, not a className — see file header); `icon` the lucide glyph
 * (want→Eye, in_progress→Clock, completed→Check, dropped→X,
 * on_hold→Pause). Exported so the tracking panel reuses the exact same
 * mapping (icons + colors) — single source, no drift.
 */
export const STATUS_BADGE_CONFIG: Record<
  TrackingStatus,
  { label: string; color: string; bg: string; iconColor: string; icon: LucideIcon }
> = {
  want: {
    label: "Want",
    color: "text-brand-light",
    bg: "bg-brand/10",
    iconColor: colors["brand-light"],
    icon: Eye,
  },
  in_progress: {
    label: "In Progress",
    color: "text-accent-game",
    bg: "bg-accent-game/10",
    iconColor: colors["accent-game"],
    icon: Clock,
  },
  completed: {
    label: "Completed",
    color: "text-accent-book",
    bg: "bg-accent-book/10",
    iconColor: colors["accent-book"],
    icon: Check,
  },
  dropped: {
    label: "Dropped",
    color: "text-accent-movie",
    bg: "bg-accent-movie/10",
    iconColor: colors["accent-movie"],
    icon: X,
  },
  on_hold: {
    label: "On Hold",
    color: "text-text-secondary",
    bg: "bg-surface-overlay",
    iconColor: colors["text-secondary"],
    icon: Pause,
  },
};

export default function StatusBadge({ status }: { status: TrackingStatus }) {
  const config = STATUS_BADGE_CONFIG[status];
  const Icon = config.icon;
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full px-3 py-1 ${config.bg}`}
    >
      <Icon size={12} color={config.iconColor} />
      <Text className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </Text>
    </View>
  );
}
