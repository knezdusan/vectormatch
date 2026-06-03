"use client";

import { useRef, useState } from "react";

type ColorToken = { label: string; var: string; value: string };
type TokenGroup = { title: string; tokens: ColorToken[] };

type PaletteEntry = {
  value: string;
  darkVars: string[];
  lightVars: string[];
};

function buildPalette(dark: TokenGroup[], light: TokenGroup[]): PaletteEntry[] {
  const map = new Map<
    string,
    { darkVars: Set<string>; lightVars: Set<string> }
  >();

  for (const group of dark) {
    for (const t of group.tokens) {
      if (!map.has(t.value))
        map.set(t.value, { darkVars: new Set(), lightVars: new Set() });
      map.get(t.value)?.darkVars.add(t.var);
    }
  }
  for (const group of light) {
    for (const t of group.tokens) {
      if (!map.has(t.value))
        map.set(t.value, { darkVars: new Set(), lightVars: new Set() });
      map.get(t.value)?.lightVars.add(t.var);
    }
  }

  return Array.from(map.entries()).map(([value, { darkVars, lightVars }]) => ({
    value,
    darkVars: Array.from(darkVars),
    lightVars: Array.from(lightVars),
  }));
}

type PopupState = { entry: PaletteEntry; x: number; y: number } | null;

function PaletteStrip({
  dark,
  light,
}: {
  dark: TokenGroup[];
  light: TokenGroup[];
}) {
  const palette = buildPalette(dark, light);
  const [popup, setPopup] = useState<PopupState>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  function handleEnter(e: React.MouseEvent, entry: PaletteEntry) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();
    if (!stripRect) return;
    setPopup({
      entry,
      x: rect.left - stripRect.left + rect.width / 2,
      y: rect.top - stripRect.top,
    });
  }

  return (
    <section className="mb-12">
      <h2 className="mb-4 text-lg font-semibold">Palette</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Every unique color value in the design system — hover a swatch to see
        its OKLCH value and all custom property aliases.
      </p>
      <div ref={stripRef} className="relative">
        <div className="flex flex-wrap gap-2">
          {palette.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className="group relative h-12 w-16 flex-none cursor-default overflow-hidden rounded-lg border border-border transition-transform hover:scale-110 hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: entry.value }}
              onMouseEnter={(e) => handleEnter(e, entry)}
              onMouseLeave={() => setPopup(null)}
              onFocus={(e) =>
                handleEnter(e as unknown as React.MouseEvent, entry)
              }
              onBlur={() => setPopup(null)}
              aria-label={entry.value}
            />
          ))}
        </div>

        {popup && (
          <div
            className="pointer-events-none absolute z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-lg"
            style={{
              left: Math.min(popup.x, 900),
              top: popup.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="mb-3 h-10 w-full rounded-md border border-border"
              style={{ background: popup.entry.value }}
            />
            <p className="mb-2 break-all font-mono text-[11px] font-semibold text-foreground">
              {popup.entry.value}
            </p>
            {popup.entry.darkVars.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  Dark
                </p>
                <div className="flex flex-wrap gap-1">
                  {popup.entry.darkVars.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-accent"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {popup.entry.lightVars.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  Light
                </p>
                <div className="flex flex-wrap gap-1">
                  {popup.entry.lightVars.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const LIGHT: TokenGroup[] = [
  {
    title: "Base",
    tokens: [
      {
        label: "background",
        var: "--background",
        value: "oklch(0.98 0.005 270)",
      },
      {
        label: "foreground",
        var: "--foreground",
        value: "oklch(0.22 0.03 274)",
      },
      { label: "card", var: "--card", value: "oklch(0.98 0.005 270)" },
      {
        label: "card-foreground",
        var: "--card-foreground",
        value: "oklch(0.22 0.03 274)",
      },
      { label: "popover", var: "--popover", value: "oklch(0.98 0.005 270)" },
      {
        label: "popover-foreground",
        var: "--popover-foreground",
        value: "oklch(0.22 0.03 274)",
      },
    ],
  },
  {
    title: "Primary — Purple",
    tokens: [
      { label: "primary", var: "--primary", value: "oklch(0.60 0.23 292)" },
      {
        label: "primary-foreground",
        var: "--primary-foreground",
        value: "oklch(0.98 0.005 270)",
      },
      {
        label: "primary-bright",
        var: "--primary-bright",
        value: "oklch(0.66 0.22 296)",
      },
      { label: "primary-2", var: "--primary-2", value: "oklch(0.62 0.21 312)" },
    ],
  },
  {
    title: "Accent — Emerald",
    tokens: [
      { label: "accent", var: "--accent", value: "oklch(0.72 0.15 165)" },
      {
        label: "accent-foreground",
        var: "--accent-foreground",
        value: "oklch(0.22 0.03 274)",
      },
      { label: "accent-2", var: "--accent-2", value: "oklch(0.7 0.15 150)" },
    ],
  },
  {
    title: "Secondary / Muted",
    tokens: [
      {
        label: "secondary",
        var: "--secondary",
        value: "oklch(0.98 0.005 270)",
      },
      {
        label: "secondary-foreground",
        var: "--secondary-foreground",
        value: "oklch(0.32 0.03 274)",
      },
      { label: "muted", var: "--muted", value: "oklch(0.98 0.005 270)" },
      {
        label: "muted-foreground",
        var: "--muted-foreground",
        value: "oklch(0.58 0.02 270)",
      },
      { label: "faint", var: "--faint", value: "oklch(0.58 0.02 270)" },
    ],
  },
  {
    title: "Surface Layers",
    tokens: [
      { label: "bg-2", var: "--bg-2", value: "oklch(0.98 0.005 270)" },
      { label: "bg-3", var: "--bg-3", value: "oklch(0.98 0.005 270)" },
    ],
  },
  {
    title: "Borders & Ring",
    tokens: [
      { label: "border", var: "--border", value: "oklch(0.88 0.009 270)" },
      {
        label: "border-soft",
        var: "--border-soft",
        value: "oklch(0.78 0.02 270 / 0.55)",
      },
      { label: "input", var: "--input", value: "oklch(0.88 0.009 270)" },
      { label: "ring", var: "--ring", value: "oklch(0.60 0.23 292)" },
    ],
  },
  {
    title: "Destructive",
    tokens: [
      {
        label: "destructive",
        var: "--destructive",
        value: "oklch(0.6368 0.2078 25.3313)",
      },
      {
        label: "destructive-foreground",
        var: "--destructive-foreground",
        value: "oklch(0.98 0.005 270)",
      },
    ],
  },
  {
    title: "Charts",
    tokens: [
      { label: "chart-1", var: "--chart-1", value: "oklch(0.60 0.23 292)" },
      { label: "chart-2", var: "--chart-2", value: "oklch(0.72 0.15 165)" },
      { label: "chart-3", var: "--chart-3", value: "oklch(0.66 0.21 300)" },
      { label: "chart-4", var: "--chart-4", value: "oklch(0.62 0.19 312)" },
      { label: "chart-5", var: "--chart-5", value: "oklch(0.54 0.135 278)" },
    ],
  },
];

const DARK: TokenGroup[] = [
  {
    title: "Base",
    tokens: [
      {
        label: "background",
        var: "--background",
        value: "oklch(0.14 0.018 274)",
      },
      {
        label: "foreground",
        var: "--foreground",
        value: "oklch(0.98 0.005 270)",
      },
      { label: "card", var: "--card", value: "oklch(0.24 0.03 274)" },
      {
        label: "card-foreground",
        var: "--card-foreground",
        value: "oklch(0.98 0.005 270)",
      },
      { label: "popover", var: "--popover", value: "oklch(0.24 0.03 274)" },
      {
        label: "popover-foreground",
        var: "--popover-foreground",
        value: "oklch(0.98 0.005 270)",
      },
    ],
  },
  {
    title: "Primary — Purple",
    tokens: [
      { label: "primary", var: "--primary", value: "oklch(0.60 0.23 292)" },
      {
        label: "primary-foreground",
        var: "--primary-foreground",
        value: "oklch(0.98 0.005 270)",
      },
      {
        label: "primary-bright",
        var: "--primary-bright",
        value: "oklch(0.7 0.22 296)",
      },
      { label: "primary-2", var: "--primary-2", value: "oklch(0.64 0.21 312)" },
    ],
  },
  {
    title: "Accent — Emerald",
    tokens: [
      { label: "accent", var: "--accent", value: "oklch(0.79 0.17 165)" },
      {
        label: "accent-foreground",
        var: "--accent-foreground",
        value: "oklch(0.17 0.025 274)",
      },
      { label: "accent-2", var: "--accent-2", value: "oklch(0.78 0.15 150)" },
    ],
  },
  {
    title: "Secondary / Muted",
    tokens: [
      { label: "secondary", var: "--secondary", value: "oklch(0.24 0.03 274)" },
      {
        label: "secondary-foreground",
        var: "--secondary-foreground",
        value: "oklch(0.9 0.012 270)",
      },
      { label: "muted", var: "--muted", value: "oklch(0.24 0.03 274)" },
      {
        label: "muted-foreground",
        var: "--muted-foreground",
        value: "oklch(0.72 0.022 270)",
      },
      { label: "faint", var: "--faint", value: "oklch(0.58 0.02 270)" },
    ],
  },
  {
    title: "Surface Layers",
    tokens: [
      { label: "bg-2", var: "--bg-2", value: "oklch(0.14 0.018 274)" },
      { label: "bg-3", var: "--bg-3", value: "oklch(0.14 0.018 274)" },
    ],
  },
  {
    title: "Borders & Ring",
    tokens: [
      { label: "border", var: "--border", value: "oklch(0.3 0.03 274)" },
      {
        label: "border-soft",
        var: "--border-soft",
        value: "oklch(0.42 0.036 274 / 0.45)",
      },
      { label: "input", var: "--input", value: "oklch(0.3 0.03 274)" },
      { label: "ring", var: "--ring", value: "oklch(0.60 0.23 292)" },
    ],
  },
  {
    title: "Destructive",
    tokens: [
      {
        label: "destructive",
        var: "--destructive",
        value: "oklch(0.68 0.19 18)",
      },
      {
        label: "destructive-foreground",
        var: "--destructive-foreground",
        value: "oklch(0.98 0.005 270)",
      },
    ],
  },
  {
    title: "Charts",
    tokens: [
      { label: "chart-1", var: "--chart-1", value: "oklch(0.60 0.23 292)" },
      { label: "chart-2", var: "--chart-2", value: "oklch(0.79 0.17 165)" },
      { label: "chart-3", var: "--chart-3", value: "oklch(0.66 0.21 300)" },
      { label: "chart-4", var: "--chart-4", value: "oklch(0.62 0.19 312)" },
      { label: "chart-5", var: "--chart-5", value: "oklch(0.54 0.135 278)" },
    ],
  },
];

const SHADOWS = [
  { label: "shadow-2xs", value: "0px 1px 2px hsl(…/0.1 light / 0.3 dark)" },
  { label: "shadow-xs", value: "0px 2px 6px" },
  { label: "shadow-sm", value: "0px 4px 12px" },
  { label: "shadow", value: "0px 8px 24px" },
  { label: "shadow-md", value: "0px 12px 32px" },
  { label: "shadow-lg", value: "0px 20px 48px" },
  { label: "shadow-xl", value: "0px 28px 64px" },
  { label: "shadow-2xl", value: "0px 40px 90px" },
];

const RADIUS = [
  { label: "radius-sm", value: "calc(0.875rem - 6px) = 8px" },
  { label: "radius-md", value: "calc(0.875rem - 3px) = 11px" },
  { label: "radius-lg", value: "0.875rem = 14px" },
  { label: "radius-xl", value: "calc(0.875rem + 6px) = 20px" },
];

const TYPOGRAPHY = [
  { label: "font-sans", value: "Geist Sans → ui-sans-serif, system-ui" },
  { label: "font-mono", value: "Geist Mono → ui-monospace" },
  { label: "font-serif", value: "PT Serif → ui-serif" },
];

const UTILITIES = [
  {
    label: ".text-gradient-brand",
    value: "Linear gradient text: primary-bright → primary-2",
  },
  { label: ".btn-brand", value: "CTA button: gradient fill + glow shadow" },
  { label: ".hero-aura", value: "Radial purple glow (hero section)" },
  { label: ".how-surface", value: "Radial emerald + teal gradient background" },
  { label: ".pitch-surface", value: "Radial purple gradient background" },
  { label: ".scene-vignette", value: "Dark radial vignette overlay" },
  { label: ".scrollbar-hide", value: "Cross-browser scrollbar suppression" },
];

function Chip({ value }: { value: string }) {
  return (
    <div
      className="h-8 w-14 flex-none rounded border border-border"
      style={{ background: value }}
      title={value}
    />
  );
}

function TokenRow({ token }: { token: ColorToken }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Chip value={token.value} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{token.label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {token.value}
        </p>
      </div>
      <code className="hidden shrink-0 font-mono text-[11px] text-faint lg:block">
        {token.var}
      </code>
    </div>
  );
}

function ModeSection({
  title,
  groups,
  mode,
}: {
  title: string;
  groups: TokenGroup[];
  mode: "light" | "dark";
}) {
  return (
    <div className={mode === "dark" ? "dark" : ""}>
      <div className="bg-background text-foreground">
        <div className="border-b border-border px-8 py-5">
          <h2 className="text-xl font-bold">{title}</h2>
        </div>
        <div className="space-y-8 p-8">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                {group.title}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.tokens.map((token) => (
                  <TokenRow key={token.label} token={token} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ThemePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border px-8 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
          <p className="mt-1 text-muted-foreground">
            Dark-first brand · Purple primary + Emerald accent · CSS-first
            Tailwind v4 <code className="font-mono text-xs">@theme</code>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-8 py-10">
        <PaletteStrip dark={DARK} light={LIGHT} />
        {/* Color tokens */}
        <section>
          <h2 className="mb-6 text-lg font-semibold">Color Tokens</h2>
          <div className="overflow-hidden rounded-2xl border border-border">
            <ModeSection
              title="Dark Mode (brand default)"
              groups={DARK}
              mode="dark"
            />
            <div className="border-t border-border">
              <ModeSection title="Light Mode" groups={LIGHT} mode="light" />
            </div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Typography</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {TYPOGRAPHY.map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm font-medium">{t.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.value}</p>
                <p
                  className="mt-3 text-2xl"
                  style={{
                    fontFamily:
                      t.label === "font-mono"
                        ? "var(--font-mono)"
                        : t.label === "font-serif"
                          ? "var(--font-serif)"
                          : "var(--font-sans)",
                  }}
                >
                  Aa Bb Cc
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Border radius */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Border Radius</h2>
          <div className="flex flex-wrap gap-4">
            {RADIUS.map((r, i) => {
              const radiusMap = [
                "rounded-sm",
                "rounded-md",
                "rounded-[0.875rem]",
                "rounded-xl",
              ];
              return (
                <div key={r.label} className="flex flex-col items-center gap-2">
                  <div
                    className={`h-14 w-14 border-2 border-primary bg-primary/10 ${radiusMap[i]}`}
                  />
                  <p className="text-center font-mono text-[11px] text-muted-foreground">
                    {r.label}
                  </p>
                  <p className="text-center text-[10px] text-faint">
                    {r.value.split(" = ")[1]}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Shadows */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Shadows</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SHADOWS.map((s, i) => {
              const shadowMap = [
                "shadow-[var(--shadow-2xs)]",
                "shadow-[var(--shadow-xs)]",
                "shadow-[var(--shadow-sm)]",
                "shadow-[var(--shadow)]",
                "shadow-[var(--shadow-md)]",
                "shadow-[var(--shadow-lg)]",
                "shadow-[var(--shadow-xl)]",
                "shadow-[var(--shadow-2xl)]",
              ];
              return (
                <div
                  key={s.label}
                  className={`rounded-lg border border-border bg-card p-5 ${shadowMap[i]}`}
                >
                  <p className="font-mono text-xs font-medium">{s.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.value}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Utilities */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">CSS Utilities</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {UTILITIES.map((u) => (
              <div
                key={u.label}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <code className="font-mono text-xs text-accent">{u.label}</code>
                <p className="mt-1 text-xs text-muted-foreground">{u.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Live previews */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Live Previews</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border p-6">
              <p className="mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                Gradient text
              </p>
              <p className="text-gradient-brand text-3xl font-bold tracking-tight">
                VectorMatch
              </p>
            </div>
            <div className="rounded-2xl border border-border p-6">
              <p className="mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                Brand button
              </p>
              <button
                type="button"
                className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                Get Early Access
              </button>
            </div>
            <div className="hero-aura rounded-2xl border border-border p-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                .hero-aura
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Radial purple glow
              </p>
            </div>
            <div className="how-surface rounded-2xl border border-border p-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                .how-surface
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Radial emerald + teal gradient
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
