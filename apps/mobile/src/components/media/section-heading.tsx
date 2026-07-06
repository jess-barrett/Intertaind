/**
 * Shared section heading for the media detail screen's content blocks
 * (Cast, About the author, Seasons, …) — a semibold primary-text section
 * lead-in, the RN mirror of web's `SectionHeader`. Extracted so every
 * content block uses ONE definition (it was previously copy-pasted into
 * each component and would have drifted as M2/M4 add more sections).
 */
import { Text } from "react-native";

export function SectionHeading({ children }: { children: string }) {
  return (
    <Text className="text-lg font-semibold text-text-primary">{children}</Text>
  );
}
