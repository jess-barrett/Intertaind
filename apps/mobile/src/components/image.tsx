/**
 * expo-image's `Image`, pre-wired for NativeWind.
 *
 * NativeWind only auto-wires core RN components; expo-image's Image is
 * third-party, so it needs an explicit `cssInterop` call to resolve
 * `className` → `style`. That call is a module-level side effect — all
 * screens must import expo-image via this module (never from
 * "expo-image" directly) so the NativeWind wiring is guaranteed to have
 * run regardless of import order.
 */
import { Image } from "expo-image";
import { cssInterop } from "nativewind";

cssInterop(Image, { className: "style" });

export { Image };
