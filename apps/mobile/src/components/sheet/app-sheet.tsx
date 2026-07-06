/**
 * AppSheet — the single reusable bottom-sheet chrome for Intertaind's
 * mobile flows. Every M2 log/review/season/episode/Intertain sheet
 * mounts inside one of these so they all share the same surface: a
 * near-black raised background, a muted grab handle, a dimming backdrop,
 * and keyboard-aware resizing.
 *
 * Built on `@gorhom/bottom-sheet` v5's `BottomSheetModal`. The modal is
 * IMPERATIVE — it isn't shown by a boolean prop, callers open/close it
 * through a ref:
 *
 *   const sheetRef = useRef<AppSheetRef>(null);
 *   ...
 *   <AppSheet ref={sheetRef} title="Log movie">
 *     ...form...
 *   </AppSheet>
 *   // present:
 *   sheetRef.current?.present();
 *   // dismiss (e.g. after a successful save):
 *   sheetRef.current?.dismiss();
 *
 * Sizing: dynamic by default — the sheet grows to fit its content
 * (children are rendered inside a `BottomSheetView`, which reports its
 * measured height to the modal). Pass `snapPoints` to pin it to fixed
 * heights instead (e.g. `["50%", "90%"]`), which also disables dynamic
 * sizing.
 *
 * Colors: `backgroundStyle` / `handleIndicatorStyle` are style OBJECTS,
 * not classNames — NativeWind can't reach them — so they read straight
 * from the `colors` token object in `@intertaind/design-system` (same
 * rule as star-rating.tsx's SVG fills). Any chrome INSIDE the sheet
 * (children) uses className tokens as usual.
 *
 * For text inputs inside a sheet, use `BottomSheetTextInput` (re-exported
 * from `@gorhom/bottom-sheet`) rather than RN's `TextInput` so the sheet
 * tracks focus and keeps the field above the keyboard.
 */
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { colors } from "@intertaind/design-system";

/** Imperative handle callers use to open/close the sheet. */
export type AppSheetRef = {
  /** Open the sheet. */
  present: () => void;
  /** Close the sheet. */
  dismiss: () => void;
};

type AppSheetProps = {
  children: ReactNode;
  /**
   * Fixed snap points (e.g. `["50%", "90%"]`). Omit for dynamic sizing,
   * where the sheet grows to fit its content.
   */
  snapPoints?: (string | number)[];
  /**
   * Called after the sheet finishes dismissing — fires for BOTH a
   * programmatic `dismiss()` AND a swipe-to-close, so use it only for
   * cleanup (e.g. resetting form state), never for save side-effects.
   */
  onDismiss?: () => void;
  /** Accessibility label for the sheet content. */
  accessibilityLabel?: string;
};

/** Dimming backdrop: fades in as the sheet opens, tap-to-dismiss. */
function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.6}
    />
  );
}

const AppSheet = forwardRef<AppSheetRef, AppSheetProps>(function AppSheet(
  { children, snapPoints, onDismiss, accessibilityLabel },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  useImperativeHandle(
    ref,
    () => ({
      present: () => modalRef.current?.present(),
      dismiss: () => modalRef.current?.dismiss(),
    }),
    [],
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      // Fixed snap points OR dynamic sizing (mutually exclusive in v5).
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      // Keep a tall (dynamic-height or "90%") sheet from growing under the
      // status bar / notch on the reference log/review forms.
      topInset={insets.top}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      // Intertaind surface: raised near-black bg + muted grab handle.
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
      // Keyboard-aware: the sheet rides above the keyboard as fields focus
      // (`interactive`), restores its position on blur, and on Android
      // resizes the window so inputs stay visible.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView
        style={styles.content}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors["surface-raised"],
  },
  handleIndicator: {
    backgroundColor: colors["surface-border"],
  },
  content: {
    // Sensible base padding so dynamically-sized sheets aren't flush to
    // the edges; children add their own layout on top.
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});

export default AppSheet;
