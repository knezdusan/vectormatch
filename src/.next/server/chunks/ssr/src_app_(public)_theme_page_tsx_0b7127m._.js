module.exports = [
  22192,
  (a) => {
    "use strict";
    var b = a.i(87924),
      c = a.i(72131);
    function d({ dark: a, light: e }) {
      let f = (function (a, b) {
          let c = new Map();
          for (let b of a)
            for (let a of b.tokens)
              c.has(a.value) ||
                c.set(a.value, { darkVars: new Set(), lightVars: new Set() }),
                c.get(a.value)?.darkVars.add(a.var);
          for (let a of b)
            for (let b of a.tokens)
              c.has(b.value) ||
                c.set(b.value, { darkVars: new Set(), lightVars: new Set() }),
                c.get(b.value)?.lightVars.add(b.var);
          return Array.from(c.entries()).map(
            ([a, { darkVars: b, lightVars: c }]) => ({
              value: a,
              darkVars: Array.from(b),
              lightVars: Array.from(c),
            }),
          );
        })(a, e),
        [g, h] = (0, c.useState)(null),
        i = (0, c.useRef)(null);
      function j(a, b) {
        let c = a.currentTarget.getBoundingClientRect(),
          d = i.current?.getBoundingClientRect();
        d &&
          h({ entry: b, x: c.left - d.left + c.width / 2, y: c.top - d.top });
      }
      return (0, b.jsxs)("section", {
        className: "mb-12",
        children: [
          (0, b.jsx)("h2", {
            className: "mb-4 text-lg font-semibold",
            children: "Palette",
          }),
          (0, b.jsx)("p", {
            className: "mb-5 text-sm text-muted-foreground",
            children:
              "Every unique color value in the design system — hover a swatch to see its OKLCH value and all custom property aliases.",
          }),
          (0, b.jsxs)("div", {
            ref: i,
            className: "relative",
            children: [
              (0, b.jsx)("div", {
                className: "flex flex-wrap gap-2",
                children: f.map((a) =>
                  (0, b.jsx)(
                    "button",
                    {
                      type: "button",
                      className:
                        "group relative h-12 w-16 flex-none cursor-default overflow-hidden rounded-lg border border-border transition-transform hover:scale-110 hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      style: { background: a.value },
                      onMouseEnter: (b) => j(b, a),
                      onMouseLeave: () => h(null),
                      onFocus: (b) => j(b, a),
                      onBlur: () => h(null),
                      "aria-label": a.value,
                    },
                    a.value,
                  ),
                ),
              }),
              g &&
                (0, b.jsxs)("div", {
                  className:
                    "pointer-events-none absolute z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-lg",
                  style: {
                    left: Math.min(g.x, 900),
                    top: g.y - 8,
                    transform: "translate(-50%, -100%)",
                  },
                  children: [
                    (0, b.jsx)("div", {
                      className:
                        "mb-3 h-10 w-full rounded-md border border-border",
                      style: { background: g.entry.value },
                    }),
                    (0, b.jsx)("p", {
                      className:
                        "mb-2 break-all font-mono text-[11px] font-semibold text-foreground",
                      children: g.entry.value,
                    }),
                    g.entry.darkVars.length > 0 &&
                      (0, b.jsxs)("div", {
                        className: "mb-2",
                        children: [
                          (0, b.jsx)("p", {
                            className:
                              "mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground",
                            children: "Dark",
                          }),
                          (0, b.jsx)("div", {
                            className: "flex flex-wrap gap-1",
                            children: g.entry.darkVars.map((a) =>
                              (0, b.jsx)(
                                "code",
                                {
                                  className:
                                    "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-accent",
                                  children: a,
                                },
                                a,
                              ),
                            ),
                          }),
                        ],
                      }),
                    g.entry.lightVars.length > 0 &&
                      (0, b.jsxs)("div", {
                        children: [
                          (0, b.jsx)("p", {
                            className:
                              "mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground",
                            children: "Light",
                          }),
                          (0, b.jsx)("div", {
                            className: "flex flex-wrap gap-1",
                            children: g.entry.lightVars.map((a) =>
                              (0, b.jsx)(
                                "code",
                                {
                                  className:
                                    "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70",
                                  children: a,
                                },
                                a,
                              ),
                            ),
                          }),
                        ],
                      }),
                  ],
                }),
            ],
          }),
        ],
      });
    }
    let e = [
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
            {
              label: "popover",
              var: "--popover",
              value: "oklch(0.98 0.005 270)",
            },
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
            {
              label: "primary",
              var: "--primary",
              value: "oklch(0.60 0.23 292)",
            },
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
            {
              label: "primary-2",
              var: "--primary-2",
              value: "oklch(0.62 0.21 312)",
            },
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
            {
              label: "accent-2",
              var: "--accent-2",
              value: "oklch(0.7 0.15 150)",
            },
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
            {
              label: "border",
              var: "--border",
              value: "oklch(0.88 0.009 270)",
            },
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
            {
              label: "chart-1",
              var: "--chart-1",
              value: "oklch(0.60 0.23 292)",
            },
            {
              label: "chart-2",
              var: "--chart-2",
              value: "oklch(0.72 0.15 165)",
            },
            {
              label: "chart-3",
              var: "--chart-3",
              value: "oklch(0.66 0.21 300)",
            },
            {
              label: "chart-4",
              var: "--chart-4",
              value: "oklch(0.62 0.19 312)",
            },
            {
              label: "chart-5",
              var: "--chart-5",
              value: "oklch(0.54 0.135 278)",
            },
          ],
        },
      ],
      f = [
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
            {
              label: "popover",
              var: "--popover",
              value: "oklch(0.24 0.03 274)",
            },
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
            {
              label: "primary",
              var: "--primary",
              value: "oklch(0.60 0.23 292)",
            },
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
            {
              label: "primary-2",
              var: "--primary-2",
              value: "oklch(0.64 0.21 312)",
            },
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
            {
              label: "accent-2",
              var: "--accent-2",
              value: "oklch(0.78 0.15 150)",
            },
          ],
        },
        {
          title: "Secondary / Muted",
          tokens: [
            {
              label: "secondary",
              var: "--secondary",
              value: "oklch(0.24 0.03 274)",
            },
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
            {
              label: "chart-1",
              var: "--chart-1",
              value: "oklch(0.60 0.23 292)",
            },
            {
              label: "chart-2",
              var: "--chart-2",
              value: "oklch(0.79 0.17 165)",
            },
            {
              label: "chart-3",
              var: "--chart-3",
              value: "oklch(0.66 0.21 300)",
            },
            {
              label: "chart-4",
              var: "--chart-4",
              value: "oklch(0.62 0.19 312)",
            },
            {
              label: "chart-5",
              var: "--chart-5",
              value: "oklch(0.54 0.135 278)",
            },
          ],
        },
      ],
      g = [
        {
          label: "shadow-2xs",
          value: "0px 1px 2px hsl(…/0.1 light / 0.3 dark)",
        },
        { label: "shadow-xs", value: "0px 2px 6px" },
        { label: "shadow-sm", value: "0px 4px 12px" },
        { label: "shadow", value: "0px 8px 24px" },
        { label: "shadow-md", value: "0px 12px 32px" },
        { label: "shadow-lg", value: "0px 20px 48px" },
        { label: "shadow-xl", value: "0px 28px 64px" },
        { label: "shadow-2xl", value: "0px 40px 90px" },
      ],
      h = [
        { label: "radius-sm", value: "calc(0.875rem - 6px) = 8px" },
        { label: "radius-md", value: "calc(0.875rem - 3px) = 11px" },
        { label: "radius-lg", value: "0.875rem = 14px" },
        { label: "radius-xl", value: "calc(0.875rem + 6px) = 20px" },
      ],
      i = [
        { label: "font-sans", value: "Geist Sans → ui-sans-serif, system-ui" },
        { label: "font-mono", value: "Geist Mono → ui-monospace" },
        { label: "font-serif", value: "PT Serif → ui-serif" },
      ],
      j = [
        {
          label: ".text-gradient-brand",
          value: "Linear gradient text: primary-bright → primary-2",
        },
        {
          label: ".btn-brand",
          value: "CTA button: gradient fill + glow shadow",
        },
        { label: ".hero-aura", value: "Radial purple glow (hero section)" },
        {
          label: ".how-surface",
          value: "Radial emerald + teal gradient background",
        },
        { label: ".pitch-surface", value: "Radial purple gradient background" },
        { label: ".scene-vignette", value: "Dark radial vignette overlay" },
        {
          label: ".scrollbar-hide",
          value: "Cross-browser scrollbar suppression",
        },
      ];
    function k({ value: a }) {
      return (0, b.jsx)("div", {
        className: "h-8 w-14 flex-none rounded border border-border",
        style: { background: a },
        title: a,
      });
    }
    function l({ token: a }) {
      return (0, b.jsxs)("div", {
        className:
          "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3",
        children: [
          (0, b.jsx)(k, { value: a.value }),
          (0, b.jsxs)("div", {
            className: "min-w-0 flex-1",
            children: [
              (0, b.jsx)("p", {
                className: "text-sm font-medium",
                children: a.label,
              }),
              (0, b.jsx)("p", {
                className: "font-mono text-[11px] text-muted-foreground",
                children: a.value,
              }),
            ],
          }),
          (0, b.jsx)("code", {
            className:
              "hidden shrink-0 font-mono text-[11px] text-faint lg:block",
            children: a.var,
          }),
        ],
      });
    }
    function m({ title: a, groups: c, mode: d }) {
      return (0, b.jsx)("div", {
        className: "dark" === d ? "dark" : "",
        children: (0, b.jsxs)("div", {
          className: "bg-background text-foreground",
          children: [
            (0, b.jsx)("div", {
              className: "border-b border-border px-8 py-5",
              children: (0, b.jsx)("h2", {
                className: "text-xl font-bold",
                children: a,
              }),
            }),
            (0, b.jsx)("div", {
              className: "space-y-8 p-8",
              children: c.map((a) =>
                (0, b.jsxs)(
                  "div",
                  {
                    children: [
                      (0, b.jsx)("h3", {
                        className:
                          "mb-3 text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground",
                        children: a.title,
                      }),
                      (0, b.jsx)("div", {
                        className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
                        children: a.tokens.map((a) =>
                          (0, b.jsx)(l, { token: a }, a.label),
                        ),
                      }),
                    ],
                  },
                  a.title,
                ),
              ),
            }),
          ],
        }),
      });
    }
    a.s([
      "default",
      0,
      function () {
        return (0, b.jsxs)("div", {
          className: "min-h-screen bg-background text-foreground",
          children: [
            (0, b.jsx)("div", {
              className: "border-b border-border px-8 py-6",
              children: (0, b.jsxs)("div", {
                className: "mx-auto max-w-7xl",
                children: [
                  (0, b.jsx)("h1", {
                    className: "text-3xl font-bold tracking-tight",
                    children: "Design System",
                  }),
                  (0, b.jsxs)("p", {
                    className: "mt-1 text-muted-foreground",
                    children: [
                      "Dark-first brand · Purple primary + Emerald accent · CSS-first Tailwind v4 ",
                      (0, b.jsx)("code", {
                        className: "font-mono text-xs",
                        children: "@theme",
                      }),
                    ],
                  }),
                ],
              }),
            }),
            (0, b.jsxs)("div", {
              className: "mx-auto max-w-7xl space-y-12 px-8 py-10",
              children: [
                (0, b.jsx)(d, { dark: f, light: e }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-6 text-lg font-semibold",
                      children: "Color Tokens",
                    }),
                    (0, b.jsxs)("div", {
                      className:
                        "overflow-hidden rounded-2xl border border-border",
                      children: [
                        (0, b.jsx)(m, {
                          title: "Dark Mode (brand default)",
                          groups: f,
                          mode: "dark",
                        }),
                        (0, b.jsx)("div", {
                          className: "border-t border-border",
                          children: (0, b.jsx)(m, {
                            title: "Light Mode",
                            groups: e,
                            mode: "light",
                          }),
                        }),
                      ],
                    }),
                  ],
                }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-4 text-lg font-semibold",
                      children: "Typography",
                    }),
                    (0, b.jsx)("div", {
                      className: "grid gap-3 sm:grid-cols-3",
                      children: i.map((a) =>
                        (0, b.jsxs)(
                          "div",
                          {
                            className:
                              "rounded-lg border border-border bg-card p-4",
                            children: [
                              (0, b.jsx)("p", {
                                className: "text-sm font-medium",
                                children: a.label,
                              }),
                              (0, b.jsx)("p", {
                                className: "mt-1 text-xs text-muted-foreground",
                                children: a.value,
                              }),
                              (0, b.jsx)("p", {
                                className: "mt-3 text-2xl",
                                style: {
                                  fontFamily:
                                    "font-mono" === a.label
                                      ? "var(--font-mono)"
                                      : "font-serif" === a.label
                                        ? "var(--font-serif)"
                                        : "var(--font-sans)",
                                },
                                children: "Aa Bb Cc",
                              }),
                            ],
                          },
                          a.label,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-4 text-lg font-semibold",
                      children: "Border Radius",
                    }),
                    (0, b.jsx)("div", {
                      className: "flex flex-wrap gap-4",
                      children: h.map((a, c) =>
                        (0, b.jsxs)(
                          "div",
                          {
                            className: "flex flex-col items-center gap-2",
                            children: [
                              (0, b.jsx)("div", {
                                className: `h-14 w-14 border-2 border-primary bg-primary/10 ${["rounded-sm", "rounded-md", "rounded-[0.875rem]", "rounded-xl"][c]}`,
                              }),
                              (0, b.jsx)("p", {
                                className:
                                  "text-center font-mono text-[11px] text-muted-foreground",
                                children: a.label,
                              }),
                              (0, b.jsx)("p", {
                                className: "text-center text-[10px] text-faint",
                                children: a.value.split(" = ")[1],
                              }),
                            ],
                          },
                          a.label,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-4 text-lg font-semibold",
                      children: "Shadows",
                    }),
                    (0, b.jsx)("div", {
                      className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
                      children: g.map((a, c) =>
                        (0, b.jsxs)(
                          "div",
                          {
                            className: `rounded-lg border border-border bg-card p-5 ${["shadow-[var(--shadow-2xs)]", "shadow-[var(--shadow-xs)]", "shadow-[var(--shadow-sm)]", "shadow-[var(--shadow)]", "shadow-[var(--shadow-md)]", "shadow-[var(--shadow-lg)]", "shadow-[var(--shadow-xl)]", "shadow-[var(--shadow-2xl)]"][c]}`,
                            children: [
                              (0, b.jsx)("p", {
                                className: "font-mono text-xs font-medium",
                                children: a.label,
                              }),
                              (0, b.jsx)("p", {
                                className:
                                  "mt-1 text-[11px] text-muted-foreground",
                                children: a.value,
                              }),
                            ],
                          },
                          a.label,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-4 text-lg font-semibold",
                      children: "CSS Utilities",
                    }),
                    (0, b.jsx)("div", {
                      className: "grid gap-2 sm:grid-cols-2",
                      children: j.map((a) =>
                        (0, b.jsxs)(
                          "div",
                          {
                            className:
                              "rounded-lg border border-border bg-card px-4 py-3",
                            children: [
                              (0, b.jsx)("code", {
                                className: "font-mono text-xs text-accent",
                                children: a.label,
                              }),
                              (0, b.jsx)("p", {
                                className: "mt-1 text-xs text-muted-foreground",
                                children: a.value,
                              }),
                            ],
                          },
                          a.label,
                        ),
                      ),
                    }),
                  ],
                }),
                (0, b.jsxs)("section", {
                  children: [
                    (0, b.jsx)("h2", {
                      className: "mb-4 text-lg font-semibold",
                      children: "Live Previews",
                    }),
                    (0, b.jsxs)("div", {
                      className: "grid gap-4 sm:grid-cols-2",
                      children: [
                        (0, b.jsxs)("div", {
                          className: "rounded-2xl border border-border p-6",
                          children: [
                            (0, b.jsx)("p", {
                              className:
                                "mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                              children: "Gradient text",
                            }),
                            (0, b.jsx)("p", {
                              className:
                                "text-gradient-brand text-3xl font-bold tracking-tight",
                              children: "VectorMatch",
                            }),
                          ],
                        }),
                        (0, b.jsxs)("div", {
                          className: "rounded-2xl border border-border p-6",
                          children: [
                            (0, b.jsx)("p", {
                              className:
                                "mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                              children: "Brand button",
                            }),
                            (0, b.jsx)("button", {
                              type: "button",
                              className:
                                "btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold",
                              children: "Get Early Access",
                            }),
                          ],
                        }),
                        (0, b.jsxs)("div", {
                          className:
                            "hero-aura rounded-2xl border border-border p-6",
                          children: [
                            (0, b.jsx)("p", {
                              className:
                                "text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                              children: ".hero-aura",
                            }),
                            (0, b.jsx)("p", {
                              className: "mt-2 text-sm text-muted-foreground",
                              children: "Radial purple glow",
                            }),
                          ],
                        }),
                        (0, b.jsxs)("div", {
                          className:
                            "how-surface rounded-2xl border border-border p-6",
                          children: [
                            (0, b.jsx)("p", {
                              className:
                                "text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                              children: ".how-surface",
                            }),
                            (0, b.jsx)("p", {
                              className: "mt-2 text-sm text-muted-foreground",
                              children: "Radial emerald + teal gradient",
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      },
    ]);
  },
];

//# sourceMappingURL=src_app_%28public%29_theme_page_tsx_0b7127m._.js.map
