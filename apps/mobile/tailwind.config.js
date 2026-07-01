// Canonical design tokens — single source of truth at
// packages/design-system/src/tokens.cjs. Importing the .cjs path so
// Tailwind's Node-side config loader can `require()` it without
// needing a TS transpile step at config time.
const { colors } = require('@intertaind/design-system/tokens.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // Shared workspace packages that emit Tailwind class strings (e.g.
    // `MEDIA_TYPE_CONFIG` in `@intertaind/types` returns
    // "text-accent-book", "bg-accent-book/10", etc.). Without these
    // globs the JIT compiler doesn't see those classes and they get
    // tree-shaken out of the mobile bundle.
    '../../packages/types/src/**/*.{js,ts}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
    },
  },
  plugins: [],
};
