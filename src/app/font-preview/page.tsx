type FontOption = {
  name: string;
  approximates?: string;
  style: React.CSSProperties;
};

// ITC Benguiat (Adobe Fonts) — added via layout <link>
const benguiatFonts: FontOption[] = [
  { name: "Benguiat Book 400", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 400 } },
  { name: "Benguiat Medium 500", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 500 } },
  { name: "Benguiat Bold 700", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 700 } },
  { name: "Benguiat Book Italic", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 400, fontStyle: "italic" } },
  { name: "Benguiat Medium Italic", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 500, fontStyle: "italic" } },
  { name: "Benguiat Bold Italic", style: { fontFamily: '"itc-benguiat", serif', fontWeight: 700, fontStyle: "italic" } },
  { name: "Benguiat Condensed Book 400", style: { fontFamily: '"itc-benguiat-condensed", sans-serif', fontWeight: 400 } },
  { name: "Benguiat Condensed Medium 500", style: { fontFamily: '"itc-benguiat-condensed", sans-serif', fontWeight: 500 } },
  { name: "Benguiat Condensed Bold 700", style: { fontFamily: '"itc-benguiat-condensed", sans-serif', fontWeight: 700 } },
  { name: "Benguiat Condensed Bold Italic", style: { fontFamily: '"itc-benguiat-condensed", sans-serif', fontWeight: 700, fontStyle: "italic" } },
];

const colorCombos = [
  { label: "White + magenta brand", left: "text-text-primary", right: "text-brand" },
  { label: "Magenta brand + green", left: "text-brand", right: "text-accent-book" },
  { label: "Rose + violet", left: "text-accent-movie", right: "text-accent-tv" },
  { label: "Yellow + magenta", left: "text-accent-game", right: "text-brand" },
  { label: "Green + yellow", left: "text-accent-book", right: "text-accent-game" },
];

export default function FontPreviewPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary">Font Preview</h1>
        <p className="mt-2 text-sm text-text-muted">
          ITC Benguiat from Adobe Fonts. Pick a weight + color combo and I&apos;ll apply it.
        </p>
      </header>

      <div className="space-y-10">
        {benguiatFonts.map((font) => (
          <section
            key={font.name}
            className="rounded-xl border border-surface-border bg-surface-raised p-6"
          >
            <div className="mb-4 flex items-baseline justify-between border-b border-surface-border pb-3">
              <h2 className="text-lg font-semibold text-text-primary">
                {font.name}
              </h2>
            </div>

            <div className="space-y-4">
              {colorCombos.map((combo) => (
                <div key={combo.label} className="flex items-baseline gap-6">
                  <div className="text-4xl tracking-wider" style={font.style}>
                    <span className={combo.left}>inter</span>
                    <span className={combo.right}>taind</span>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-text-muted">
                    {combo.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-surface-border pt-6 text-xs text-text-muted">
        This is a preview page. Delete <code>src/app/font-preview</code> when done.
      </footer>
    </div>
  );
}
