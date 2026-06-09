(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([
  "object" == typeof document ? document.currentScript : void 0,
  97780,
  (e) => {
    "use strict";
    var r = e.i(43476),
      a = e.i(932),
      l = e.i(71645);
    function o(e) {
      let o,
        d,
        n,
        c,
        i,
        u,
        m = (0, a.c)(13),
        { dark: b, light: h } = e,
        v = (function (e, r) {
          let a = new Map();
          for (let r of e)
            for (let e of r.tokens)
              a.has(e.value) ||
                a.set(e.value, { darkVars: new Set(), lightVars: new Set() }),
                a.get(e.value)?.darkVars.add(e.var);
          for (let e of r)
            for (let r of e.tokens)
              a.has(r.value) ||
                a.set(r.value, { darkVars: new Set(), lightVars: new Set() }),
                a.get(r.value)?.lightVars.add(r.var);
          return Array.from(a.entries()).map(
            ([e, { darkVars: r, lightVars: a }]) => ({
              value: e,
              darkVars: Array.from(r),
              lightVars: Array.from(a),
            }),
          );
        })(b, h),
        [x, p] = (0, l.useState)(null),
        f = (0, l.useRef)(null),
        g = function (e, r) {
          let a = e.currentTarget.getBoundingClientRect(),
            l = f.current?.getBoundingClientRect();
          l &&
            p({ entry: r, x: a.left - l.left + a.width / 2, y: a.top - l.top });
        };
      m[0] === Symbol.for("react.memo_cache_sentinel")
        ? ((o = (0, r.jsx)("h2", {
            className: "mb-4 text-lg font-semibold",
            children: "Palette",
          })),
          (d = (0, r.jsx)("p", {
            className: "mb-5 text-sm text-muted-foreground",
            children:
              "Every unique color value in the design system — hover a swatch to see its OKLCH value and all custom property aliases.",
          })),
          (m[0] = o),
          (m[1] = d))
        : ((o = m[0]), (d = m[1]));
      let k = v.map((e) =>
        (0, r.jsx)(
          "button",
          {
            type: "button",
            className:
              "group relative h-12 w-16 flex-none cursor-default overflow-hidden rounded-lg border border-border transition-transform hover:scale-110 hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            style: { background: e.value },
            onMouseEnter: (r) => g(r, e),
            onMouseLeave: () => p(null),
            onFocus: (r) => g(r, e),
            onBlur: () => p(null),
            "aria-label": e.value,
          },
          e.value,
        ),
      );
      return (
        m[2] !== k
          ? ((n = (0, r.jsx)("div", {
              className: "flex flex-wrap gap-2",
              children: k,
            })),
            (m[2] = k),
            (m[3] = n))
          : (n = m[3]),
        m[4] !== x
          ? ((c =
              x &&
              (0, r.jsxs)("div", {
                className:
                  "pointer-events-none absolute z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-lg",
                style: {
                  left: Math.min(x.x, 900),
                  top: x.y - 8,
                  transform: "translate(-50%, -100%)",
                },
                children: [
                  (0, r.jsx)("div", {
                    className:
                      "mb-3 h-10 w-full rounded-md border border-border",
                    style: { background: x.entry.value },
                  }),
                  (0, r.jsx)("p", {
                    className:
                      "mb-2 break-all font-mono text-[11px] font-semibold text-foreground",
                    children: x.entry.value,
                  }),
                  x.entry.darkVars.length > 0 &&
                    (0, r.jsxs)("div", {
                      className: "mb-2",
                      children: [
                        (0, r.jsx)("p", {
                          className:
                            "mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground",
                          children: "Dark",
                        }),
                        (0, r.jsx)("div", {
                          className: "flex flex-wrap gap-1",
                          children: x.entry.darkVars.map(s),
                        }),
                      ],
                    }),
                  x.entry.lightVars.length > 0 &&
                    (0, r.jsxs)("div", {
                      children: [
                        (0, r.jsx)("p", {
                          className:
                            "mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground",
                          children: "Light",
                        }),
                        (0, r.jsx)("div", {
                          className: "flex flex-wrap gap-1",
                          children: x.entry.lightVars.map(t),
                        }),
                      ],
                    }),
                ],
              })),
            (m[4] = x),
            (m[5] = c))
          : (c = m[5]),
        m[6] !== n || m[7] !== c
          ? ((i = (0, r.jsxs)("div", {
              ref: f,
              className: "relative",
              children: [n, c],
            })),
            (m[6] = n),
            (m[7] = c),
            (m[8] = i))
          : (i = m[8]),
        m[9] !== o || m[10] !== d || m[11] !== i
          ? ((u = (0, r.jsxs)("section", {
              className: "mb-12",
              children: [o, d, i],
            })),
            (m[9] = o),
            (m[10] = d),
            (m[11] = i),
            (m[12] = u))
          : (u = m[12]),
        u
      );
    }
    function t(e) {
      return (0, r.jsx)(
        "code",
        {
          className:
            "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70",
          children: e,
        },
        e,
      );
    }
    function s(e) {
      return (0, r.jsx)(
        "code",
        {
          className:
            "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-accent",
          children: e,
        },
        e,
      );
    }
    let d = [
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
      n = [
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
      c = [
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
      i = [
        { label: "radius-sm", value: "calc(0.875rem - 6px) = 8px" },
        { label: "radius-md", value: "calc(0.875rem - 3px) = 11px" },
        { label: "radius-lg", value: "0.875rem = 14px" },
        { label: "radius-xl", value: "calc(0.875rem + 6px) = 20px" },
      ],
      u = [
        { label: "font-sans", value: "Geist Sans → ui-sans-serif, system-ui" },
        { label: "font-mono", value: "Geist Mono → ui-monospace" },
        { label: "font-serif", value: "PT Serif → ui-serif" },
      ],
      m = [
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
    function b(e) {
      let l,
        o,
        t = (0, a.c)(5),
        { value: s } = e;
      return (
        t[0] !== s
          ? ((l = { background: s }), (t[0] = s), (t[1] = l))
          : (l = t[1]),
        t[2] !== l || t[3] !== s
          ? ((o = (0, r.jsx)("div", {
              className: "h-8 w-14 flex-none rounded border border-border",
              style: l,
              title: s,
            })),
            (t[2] = l),
            (t[3] = s),
            (t[4] = o))
          : (o = t[4]),
        o
      );
    }
    function h(e) {
      let l,
        o,
        t,
        s,
        d,
        n,
        c = (0, a.c)(15),
        { token: i } = e;
      return (
        c[0] !== i.value
          ? ((l = (0, r.jsx)(b, { value: i.value })),
            (c[0] = i.value),
            (c[1] = l))
          : (l = c[1]),
        c[2] !== i.label
          ? ((o = (0, r.jsx)("p", {
              className: "text-sm font-medium",
              children: i.label,
            })),
            (c[2] = i.label),
            (c[3] = o))
          : (o = c[3]),
        c[4] !== i.value
          ? ((t = (0, r.jsx)("p", {
              className: "font-mono text-[11px] text-muted-foreground",
              children: i.value,
            })),
            (c[4] = i.value),
            (c[5] = t))
          : (t = c[5]),
        c[6] !== o || c[7] !== t
          ? ((s = (0, r.jsxs)("div", {
              className: "min-w-0 flex-1",
              children: [o, t],
            })),
            (c[6] = o),
            (c[7] = t),
            (c[8] = s))
          : (s = c[8]),
        c[9] !== i.var
          ? ((d = (0, r.jsx)("code", {
              className:
                "hidden shrink-0 font-mono text-[11px] text-faint lg:block",
              children: i.var,
            })),
            (c[9] = i.var),
            (c[10] = d))
          : (d = c[10]),
        c[11] !== l || c[12] !== s || c[13] !== d
          ? ((n = (0, r.jsxs)("div", {
              className:
                "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3",
              children: [l, s, d],
            })),
            (c[11] = l),
            (c[12] = s),
            (c[13] = d),
            (c[14] = n))
          : (n = c[14]),
        n
      );
    }
    function v(e) {
      let l,
        o,
        t,
        s,
        d,
        n = (0, a.c)(12),
        { title: c, groups: i, mode: u } = e,
        m = "dark" === u ? "dark" : "";
      return (
        n[0] !== c
          ? ((l = (0, r.jsx)("div", {
              className: "border-b border-border px-8 py-5",
              children: (0, r.jsx)("h2", {
                className: "text-xl font-bold",
                children: c,
              }),
            })),
            (n[0] = c),
            (n[1] = l))
          : (l = n[1]),
        n[2] !== i ? ((o = i.map(x)), (n[2] = i), (n[3] = o)) : (o = n[3]),
        n[4] !== o
          ? ((t = (0, r.jsx)("div", {
              className: "space-y-8 p-8",
              children: o,
            })),
            (n[4] = o),
            (n[5] = t))
          : (t = n[5]),
        n[6] !== l || n[7] !== t
          ? ((s = (0, r.jsxs)("div", {
              className: "bg-background text-foreground",
              children: [l, t],
            })),
            (n[6] = l),
            (n[7] = t),
            (n[8] = s))
          : (s = n[8]),
        n[9] !== m || n[10] !== s
          ? ((d = (0, r.jsx)("div", { className: m, children: s })),
            (n[9] = m),
            (n[10] = s),
            (n[11] = d))
          : (d = n[11]),
        d
      );
    }
    function x(e) {
      return (0, r.jsxs)(
        "div",
        {
          children: [
            (0, r.jsx)("h3", {
              className:
                "mb-3 text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground",
              children: e.title,
            }),
            (0, r.jsx)("div", {
              className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
              children: e.tokens.map(p),
            }),
          ],
        },
        e.title,
      );
    }
    function p(e) {
      return (0, r.jsx)(h, { token: e }, e.label);
    }
    function f(e) {
      return (0, r.jsxs)(
        "div",
        {
          className: "rounded-lg border border-border bg-card px-4 py-3",
          children: [
            (0, r.jsx)("code", {
              className: "font-mono text-xs text-accent",
              children: e.label,
            }),
            (0, r.jsx)("p", {
              className: "mt-1 text-xs text-muted-foreground",
              children: e.value,
            }),
          ],
        },
        e.label,
      );
    }
    function g(e, a) {
      return (0, r.jsxs)(
        "div",
        {
          className: `rounded-lg border border-border bg-card p-5 ${["shadow-[var(--shadow-2xs)]", "shadow-[var(--shadow-xs)]", "shadow-[var(--shadow-sm)]", "shadow-[var(--shadow)]", "shadow-[var(--shadow-md)]", "shadow-[var(--shadow-lg)]", "shadow-[var(--shadow-xl)]", "shadow-[var(--shadow-2xl)]"][a]}`,
          children: [
            (0, r.jsx)("p", {
              className: "font-mono text-xs font-medium",
              children: e.label,
            }),
            (0, r.jsx)("p", {
              className: "mt-1 text-[11px] text-muted-foreground",
              children: e.value,
            }),
          ],
        },
        e.label,
      );
    }
    function k(e, a) {
      return (0, r.jsxs)(
        "div",
        {
          className: "flex flex-col items-center gap-2",
          children: [
            (0, r.jsx)("div", {
              className: `h-14 w-14 border-2 border-primary bg-primary/10 ${["rounded-sm", "rounded-md", "rounded-[0.875rem]", "rounded-xl"][a]}`,
            }),
            (0, r.jsx)("p", {
              className:
                "text-center font-mono text-[11px] text-muted-foreground",
              children: e.label,
            }),
            (0, r.jsx)("p", {
              className: "text-center text-[10px] text-faint",
              children: e.value.split(" = ")[1],
            }),
          ],
        },
        e.label,
      );
    }
    function j(e) {
      return (0, r.jsxs)(
        "div",
        {
          className: "rounded-lg border border-border bg-card p-4",
          children: [
            (0, r.jsx)("p", {
              className: "text-sm font-medium",
              children: e.label,
            }),
            (0, r.jsx)("p", {
              className: "mt-1 text-xs text-muted-foreground",
              children: e.value,
            }),
            (0, r.jsx)("p", {
              className: "mt-3 text-2xl",
              style: {
                fontFamily:
                  "font-mono" === e.label
                    ? "var(--font-mono)"
                    : "font-serif" === e.label
                      ? "var(--font-serif)"
                      : "var(--font-sans)",
              },
              children: "Aa Bb Cc",
            }),
          ],
        },
        e.label,
      );
    }
    e.s([
      "default",
      0,
      function () {
        let e,
          l,
          t,
          s,
          b,
          h,
          x,
          p,
          y,
          N,
          w,
          S,
          _,
          C,
          R,
          V,
          B,
          A,
          M,
          P = (0, a.c)(19);
        return (
          P[0] === Symbol.for("react.memo_cache_sentinel")
            ? ((e = (0, r.jsx)("h1", {
                className: "text-3xl font-bold tracking-tight",
                children: "Design System",
              })),
              (P[0] = e))
            : (e = P[0]),
          P[1] === Symbol.for("react.memo_cache_sentinel")
            ? ((l = (0, r.jsx)("div", {
                className: "border-b border-border px-8 py-6",
                children: (0, r.jsxs)("div", {
                  className: "mx-auto max-w-7xl",
                  children: [
                    e,
                    (0, r.jsxs)("p", {
                      className: "mt-1 text-muted-foreground",
                      children: [
                        "Dark-first brand · Purple primary + Emerald accent · CSS-first Tailwind v4 ",
                        (0, r.jsx)("code", {
                          className: "font-mono text-xs",
                          children: "@theme",
                        }),
                      ],
                    }),
                  ],
                }),
              })),
              (P[1] = l))
            : (l = P[1]),
          P[2] === Symbol.for("react.memo_cache_sentinel")
            ? ((t = (0, r.jsx)(o, { dark: n, light: d })),
              (s = (0, r.jsx)("h2", {
                className: "mb-6 text-lg font-semibold",
                children: "Color Tokens",
              })),
              (P[2] = t),
              (P[3] = s))
            : ((t = P[2]), (s = P[3])),
          P[4] === Symbol.for("react.memo_cache_sentinel")
            ? ((b = (0, r.jsx)(v, {
                title: "Dark Mode (brand default)",
                groups: n,
                mode: "dark",
              })),
              (P[4] = b))
            : (b = P[4]),
          P[5] === Symbol.for("react.memo_cache_sentinel")
            ? ((h = (0, r.jsxs)("section", {
                children: [
                  s,
                  (0, r.jsxs)("div", {
                    className:
                      "overflow-hidden rounded-2xl border border-border",
                    children: [
                      b,
                      (0, r.jsx)("div", {
                        className: "border-t border-border",
                        children: (0, r.jsx)(v, {
                          title: "Light Mode",
                          groups: d,
                          mode: "light",
                        }),
                      }),
                    ],
                  }),
                ],
              })),
              (x = (0, r.jsx)("h2", {
                className: "mb-4 text-lg font-semibold",
                children: "Typography",
              })),
              (P[5] = h),
              (P[6] = x))
            : ((h = P[5]), (x = P[6])),
          P[7] === Symbol.for("react.memo_cache_sentinel")
            ? ((p = (0, r.jsxs)("section", {
                children: [
                  x,
                  (0, r.jsx)("div", {
                    className: "grid gap-3 sm:grid-cols-3",
                    children: u.map(j),
                  }),
                ],
              })),
              (y = (0, r.jsx)("h2", {
                className: "mb-4 text-lg font-semibold",
                children: "Border Radius",
              })),
              (P[7] = p),
              (P[8] = y))
            : ((p = P[7]), (y = P[8])),
          P[9] === Symbol.for("react.memo_cache_sentinel")
            ? ((w = (0, r.jsxs)("section", {
                children: [
                  y,
                  (0, r.jsx)("div", {
                    className: "flex flex-wrap gap-4",
                    children: i.map(k),
                  }),
                ],
              })),
              (N = (0, r.jsx)("h2", {
                className: "mb-4 text-lg font-semibold",
                children: "Shadows",
              })),
              (P[9] = N),
              (P[10] = w))
            : ((N = P[9]), (w = P[10])),
          P[11] === Symbol.for("react.memo_cache_sentinel")
            ? ((S = (0, r.jsxs)("section", {
                children: [
                  N,
                  (0, r.jsx)("div", {
                    className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
                    children: c.map(g),
                  }),
                ],
              })),
              (_ = (0, r.jsx)("h2", {
                className: "mb-4 text-lg font-semibold",
                children: "CSS Utilities",
              })),
              (P[11] = S),
              (P[12] = _))
            : ((S = P[11]), (_ = P[12])),
          P[13] === Symbol.for("react.memo_cache_sentinel")
            ? ((C = (0, r.jsxs)("section", {
                children: [
                  _,
                  (0, r.jsx)("div", {
                    className: "grid gap-2 sm:grid-cols-2",
                    children: m.map(f),
                  }),
                ],
              })),
              (R = (0, r.jsx)("h2", {
                className: "mb-4 text-lg font-semibold",
                children: "Live Previews",
              })),
              (P[13] = C),
              (P[14] = R))
            : ((C = P[13]), (R = P[14])),
          P[15] === Symbol.for("react.memo_cache_sentinel")
            ? ((V = (0, r.jsxs)("div", {
                className: "rounded-2xl border border-border p-6",
                children: [
                  (0, r.jsx)("p", {
                    className:
                      "mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                    children: "Gradient text",
                  }),
                  (0, r.jsx)("p", {
                    className:
                      "text-gradient-brand text-3xl font-bold tracking-tight",
                    children: "VectorMatch",
                  }),
                ],
              })),
              (P[15] = V))
            : (V = P[15]),
          P[16] === Symbol.for("react.memo_cache_sentinel")
            ? ((B = (0, r.jsxs)("div", {
                className: "rounded-2xl border border-border p-6",
                children: [
                  (0, r.jsx)("p", {
                    className:
                      "mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                    children: "Brand button",
                  }),
                  (0, r.jsx)("button", {
                    type: "button",
                    className:
                      "btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold",
                    children: "Get Early Access",
                  }),
                ],
              })),
              (P[16] = B))
            : (B = P[16]),
          P[17] === Symbol.for("react.memo_cache_sentinel")
            ? ((A = (0, r.jsxs)("div", {
                className: "hero-aura rounded-2xl border border-border p-6",
                children: [
                  (0, r.jsx)("p", {
                    className:
                      "text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                    children: ".hero-aura",
                  }),
                  (0, r.jsx)("p", {
                    className: "mt-2 text-sm text-muted-foreground",
                    children: "Radial purple glow",
                  }),
                ],
              })),
              (P[17] = A))
            : (A = P[17]),
          P[18] === Symbol.for("react.memo_cache_sentinel")
            ? ((M = (0, r.jsxs)("div", {
                className: "min-h-screen bg-background text-foreground",
                children: [
                  l,
                  (0, r.jsxs)("div", {
                    className: "mx-auto max-w-7xl space-y-12 px-8 py-10",
                    children: [
                      t,
                      h,
                      p,
                      w,
                      S,
                      C,
                      (0, r.jsxs)("section", {
                        children: [
                          R,
                          (0, r.jsxs)("div", {
                            className: "grid gap-4 sm:grid-cols-2",
                            children: [
                              V,
                              B,
                              A,
                              (0, r.jsxs)("div", {
                                className:
                                  "how-surface rounded-2xl border border-border p-6",
                                children: [
                                  (0, r.jsx)("p", {
                                    className:
                                      "text-xs font-semibold tracking-widest uppercase text-muted-foreground",
                                    children: ".how-surface",
                                  }),
                                  (0, r.jsx)("p", {
                                    className:
                                      "mt-2 text-sm text-muted-foreground",
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
              })),
              (P[18] = M))
            : (M = P[18]),
          M
        );
      },
    ]);
  },
]);
