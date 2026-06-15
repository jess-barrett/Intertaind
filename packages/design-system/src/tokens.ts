/**
 * TypeScript-typed view of the design tokens.
 *
 * Runtime values live in ./tokens.cjs (a CommonJS file so Tailwind's
 * Node-side config loader can `require()` it without transpilation).
 * This file re-exports them with `as const` so callers get autocomplete
 * on `colors.brand`, `colors["accent-book"]`, etc., plus the
 * `ColorToken` union type for places that need to constrain a string
 * to a valid token key.
 */

// `require` here is intentional — we want the same module instance
// Tailwind loads, not a parallel ESM transpile of the .cjs file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const raw = require("./tokens.cjs") as { colors: Record<string, string> };

export const colors = raw.colors as {
  readonly brand: string;
  readonly "brand-light": string;
  readonly "brand-dark": string;
  readonly "surface-default": string;
  readonly "surface-raised": string;
  readonly "surface-overlay": string;
  readonly "surface-border": string;
  readonly "accent-book": string;
  readonly "accent-movie": string;
  readonly "accent-tv": string;
  readonly "accent-game": string;
  readonly "text-primary": string;
  readonly "text-secondary": string;
  readonly "text-muted": string;
  readonly background: string;
  readonly foreground: string;
};

export type ColorToken = keyof typeof colors;
