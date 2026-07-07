/**
 * FilterPicker — the mobile analogue of web's FilterDropdown (the
 * filmography filter/sort controls). A compact labeled chip that, on tap,
 * presents a bottom-sheet radio list of options.
 *
 * Why a sheet and not a hover dropdown: touch has no hover, so web's
 * hover/click <select>-style dropdown becomes a tap-to-open, tap-to-apply
 * bottom sheet — the same tap-to-apply radio pattern as game-status-sheet.
 *
 * The caller controls the option set. To offer a "clear the filter"
 * choice it includes a leading `{ value: "", label: "Any …" }` option;
 * selecting it fires `onChange("")`. When `value` is "" the chip shows the
 * `placeholder` in a muted tone.
 */
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";

/** One selectable option in the picker. */
export interface FilterOption {
  value: string;
  label: string;
}

/** One selectable row in the sheet — label + a Check on the current one. */
function OptionRow({
  option,
  selected,
  onPress,
}: {
  option: FilterOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 rounded-sm px-3 py-3 active:opacity-70 ${
        selected ? "bg-surface-overlay" : ""
      }`}
      onPress={onPress}
    >
      <Text className="flex-1 text-sm font-semibold text-text-primary">
        {option.label}
      </Text>
      {selected ? <Check size={18} color={colors.brand} /> : null}
    </Pressable>
  );
}

/**
 * A labeled chip + bottom-sheet radio picker. Owns its own `AppSheetRef`,
 * so it's self-contained — the caller just supplies the current value,
 * options, and an `onChange`.
 */
export function FilterPicker({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const sheetRef = useRef<AppSheetRef>(null);

  const selected = options.find((o) => o.value === value);
  // Show the selected label, or the placeholder (muted) when unset ("").
  const hasValue = value !== "";
  const triggerLabel = selected?.label ?? placeholder;

  function pick(option: FilterOption) {
    onChange(option.value);
    sheetRef.current?.dismiss();
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${placeholder}: ${triggerLabel}`}
        className="flex-row items-center gap-1.5 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 active:opacity-70"
        onPress={() => sheetRef.current?.present()}
      >
        <Text
          className={`text-sm ${
            hasValue ? "text-text-primary" : "text-text-muted"
          }`}
        >
          {triggerLabel}
        </Text>
        <ChevronDown size={14} color={colors["text-muted"]} />
      </Pressable>

      <AppSheet ref={sheetRef} accessibilityLabel={placeholder}>
        <View className="gap-4">
          <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {placeholder}
          </Text>
          <View className="gap-0.5">
            {options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                selected={option.value === value}
                onPress={() => pick(option)}
              />
            ))}
          </View>
        </View>
      </AppSheet>
    </>
  );
}
