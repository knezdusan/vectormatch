module.exports = [
  20635,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/server/app-render/action-async-storage.external.js",
      () =>
        require("next/dist/server/app-render/action-async-storage.external.js"),
    );
  },
  18622,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",
      () =>
        require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"),
    );
  },
  56704,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/server/app-render/work-async-storage.external.js",
      () =>
        require("next/dist/server/app-render/work-async-storage.external.js"),
    );
  },
  32319,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/server/app-render/work-unit-async-storage.external.js",
      () =>
        require("next/dist/server/app-render/work-unit-async-storage.external.js"),
    );
  },
  24725,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/server/app-render/after-task-async-storage.external.js",
      () =>
        require("next/dist/server/app-render/after-task-async-storage.external.js"),
    );
  },
  43285,
  (a, b, c) => {
    b.exports = a.x(
      "next/dist/server/app-render/dynamic-access-async-storage.external.js",
      () =>
        require("next/dist/server/app-render/dynamic-access-async-storage.external.js"),
    );
  },
  42602,
  (a, b, c) => {
    "use strict";
    b.exports = a.r(18622);
  },
  87924,
  (a, b, c) => {
    "use strict";
    b.exports = a.r(42602).vendored["react-ssr"].ReactJsxRuntime;
  },
  72131,
  (a, b, c) => {
    "use strict";
    b.exports = a.r(42602).vendored["react-ssr"].React;
  },
  35112,
  (a, b, c) => {
    "use strict";
    b.exports = a.r(42602).vendored["react-ssr"].ReactDOM;
  },
  38783,
  (a, b, c) => {
    "use strict";
    b.exports = a.r(42602).vendored["react-ssr"].ReactServerDOMTurbopackClient;
  },
  58430,
  (a) => {
    "use strict";
    a.s([
      "mergeClasses",
      0,
      (...a) =>
        a
          .filter((a, b, c) => !!a && "" !== a.trim() && c.indexOf(a) === b)
          .join(" ")
          .trim(),
    ]);
  },
  89214,
  55487,
  (a) => {
    "use strict";
    a.s(
      [
        "default",
        0,
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: 24,
          height: 24,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
      ],
      89214,
    ),
      a.s(
        [
          "hasA11yProp",
          0,
          (a) => {
            for (let b in a)
              if (b.startsWith("aria-") || "role" === b || "title" === b)
                return !0;
            return !1;
          },
        ],
        55487,
      );
  },
  90864,
  (a) => {
    "use strict";
    var b = a.i(72131),
      c = a.i(89214),
      d = a.i(55487),
      e = a.i(58430);
    let f = (0, b.createContext)({}),
      g = (0, b.forwardRef)(
        (
          {
            color: a,
            size: g,
            strokeWidth: h,
            absoluteStrokeWidth: i,
            className: j = "",
            children: k,
            iconNode: l,
            ...m
          },
          n,
        ) => {
          let {
              size: o = 24,
              strokeWidth: p = 2,
              absoluteStrokeWidth: q = !1,
              color: r = "currentColor",
              className: s = "",
            } = (0, b.useContext)(f) ?? {},
            t = (i ?? q) ? (24 * Number(h ?? p)) / Number(g ?? o) : (h ?? p);
          return (0, b.createElement)(
            "svg",
            {
              ref: n,
              ...c.default,
              width: g ?? o ?? c.default.width,
              height: g ?? o ?? c.default.height,
              stroke: a ?? r,
              strokeWidth: t,
              className: (0, e.mergeClasses)("lucide", s, j),
              ...(!k && !(0, d.hasA11yProp)(m) && { "aria-hidden": "true" }),
              ...m,
            },
            [
              ...l.map(([a, c]) => (0, b.createElement)(a, c)),
              ...(Array.isArray(k) ? k : [k]),
            ],
          );
        },
      );
    a.s(["default", 0, g], 90864);
  },
  29284,
  (a) => {
    "use strict";
    var b = a.i(87924),
      c = a.i(72131),
      d = (a, b, c, d, e, f, g, h) => {
        let i = document.documentElement,
          j = ["light", "dark"];
        function k(b) {
          var c;
          (Array.isArray(a) ? a : [a]).forEach((a) => {
            let c = "class" === a,
              d = c && f ? e.map((a) => f[a] || a) : e;
            c
              ? (i.classList.remove(...d),
                i.classList.add(f && f[b] ? f[b] : b))
              : i.setAttribute(a, b);
          }),
            (c = b),
            h && j.includes(c) && (i.style.colorScheme = c);
        }
        if (d) k(d);
        else
          try {
            let a = localStorage.getItem(b) || c,
              d =
                g && "system" === a
                  ? window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                  : a;
            k(d);
          } catch (a) {}
      },
      e = ["light", "dark"],
      f = "(prefers-color-scheme: dark)",
      g = c.createContext(void 0),
      h = (a) =>
        c.useContext(g)
          ? c.createElement(c.Fragment, null, a.children)
          : c.createElement(j, { ...a }),
      i = ["light", "dark"],
      j = ({
        forcedTheme: a,
        disableTransitionOnChange: b = !1,
        enableSystem: d = !0,
        enableColorScheme: h = !0,
        storageKey: j = "theme",
        themes: o = i,
        defaultTheme: p = d ? "system" : "light",
        attribute: q = "data-theme",
        value: r,
        children: s,
        nonce: t,
        scriptProps: u,
      }) => {
        let [v, w] = c.useState(() => l(j, p)),
          [x, y] = c.useState(() => ("system" === v ? n() : v)),
          z = r ? Object.values(r) : o,
          A = c.useCallback(
            (a) => {
              let c = a;
              if (!c) return;
              "system" === a && d && (c = n());
              let f = r ? r[c] : c,
                g = b ? m(t) : null,
                i = document.documentElement,
                j = (a) => {
                  "class" === a
                    ? (i.classList.remove(...z), f && i.classList.add(f))
                    : a.startsWith("data-") &&
                      (f ? i.setAttribute(a, f) : i.removeAttribute(a));
                };
              if ((Array.isArray(q) ? q.forEach(j) : j(q), h)) {
                let a = e.includes(p) ? p : null,
                  b = e.includes(c) ? c : a;
                i.style.colorScheme = b;
              }
              null == g || g();
            },
            [t],
          ),
          B = c.useCallback(
            (a) => {
              let b = "function" == typeof a ? a(v) : a;
              w(b);
              try {
                localStorage.setItem(j, b);
              } catch (a) {}
            },
            [v],
          ),
          C = c.useCallback(
            (b) => {
              y(n(b)), "system" === v && d && !a && A("system");
            },
            [v, a],
          );
        c.useEffect(() => {
          let a = window.matchMedia(f);
          return a.addListener(C), C(a), () => a.removeListener(C);
        }, [C]),
          c.useEffect(() => {
            let a = (a) => {
              a.key === j && (a.newValue ? w(a.newValue) : B(p));
            };
            return (
              window.addEventListener("storage", a),
              () => window.removeEventListener("storage", a)
            );
          }, [B]),
          c.useEffect(() => {
            A(null != a ? a : v);
          }, [a, v]);
        let D = c.useMemo(
          () => ({
            theme: v,
            setTheme: B,
            forcedTheme: a,
            resolvedTheme: "system" === v ? x : v,
            themes: d ? [...o, "system"] : o,
            systemTheme: d ? x : void 0,
          }),
          [v, B, a, x, d, o],
        );
        return c.createElement(
          g.Provider,
          { value: D },
          c.createElement(k, {
            forcedTheme: a,
            storageKey: j,
            attribute: q,
            enableSystem: d,
            enableColorScheme: h,
            defaultTheme: p,
            value: r,
            themes: o,
            nonce: t,
            scriptProps: u,
          }),
          s,
        );
      },
      k = c.memo(
        ({
          forcedTheme: a,
          storageKey: b,
          attribute: e,
          enableSystem: f,
          enableColorScheme: g,
          defaultTheme: h,
          value: i,
          themes: j,
          nonce: k,
          scriptProps: l,
        }) => {
          let m = JSON.stringify([e, b, h, a, j, i, f, g]).slice(1, -1);
          return c.createElement("script", {
            ...l,
            suppressHydrationWarning: !0,
            nonce: k,
            dangerouslySetInnerHTML: { __html: `(${d.toString()})(${m})` },
          });
        },
      ),
      l = (a, b) => {},
      m = (a) => {
        let b = document.createElement("style");
        return (
          a && b.setAttribute("nonce", a),
          b.appendChild(
            document.createTextNode(
              "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
            ),
          ),
          document.head.appendChild(b),
          () => {
            window.getComputedStyle(document.body),
              setTimeout(() => {
                document.head.removeChild(b);
              }, 1);
          }
        );
      },
      n = (a) => (
        a || (a = window.matchMedia(f)), a.matches ? "dark" : "light"
      );
    a.s(
      [
        "ThemeProvider",
        0,
        function ({ children: a, ...c }) {
          return (0, b.jsx)(h, { ...c, children: a });
        },
      ],
      29284,
    );
  },
  22291,
  (a) => {
    "use strict";
    var b = a.i(87924);
    let c = (0, a.i(64831).default)("menu", [
      ["path", { d: "M4 5h16", key: "1tepv9" }],
      ["path", { d: "M4 12h16", key: "1lakjw" }],
      ["path", { d: "M4 19h16", key: "1djgab" }],
    ]);
    var d = a.i(72131),
      e = a.i(99570),
      f = a.i(68114);
    function g(a) {
      return (0, b.jsxs)("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.9,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        ...a,
        children: [
          (0, b.jsx)("path", {
            d: "M8 4C5.5 4 5.5 9 5.5 9S5.5 12 3 12c2.5 0 2.5 3 2.5 3S5.5 20 8 20",
          }),
          (0, b.jsx)("path", {
            d: "M16 4c2.5 0 2.5 5 2.5 5S18.5 12 21 12c-2.5 0-2.5 3-2.5 3S18.5 20 16 20",
          }),
          (0, b.jsx)("circle", {
            cx: "10.4",
            cy: "12",
            r: "1.1",
            fill: "currentColor",
            stroke: "none",
          }),
          (0, b.jsx)("circle", {
            cx: "13.6",
            cy: "12",
            r: "1.1",
            fill: "currentColor",
            stroke: "none",
          }),
        ],
      });
    }
    function h({ className: a }) {
      return (0, b.jsxs)("a", {
        href: "#top",
        className: (0, f.cn)(
          "flex items-center gap-2.5 text-[22px] font-bold tracking-tight",
          a,
        ),
        children: [
          (0, b.jsx)("span", {
            className:
              "grid size-9 flex-none place-items-center rounded-[11px] border border-primary-bright/50 bg-[linear-gradient(150deg,oklch(0.32_0.06_292),oklch(0.20_0.03_274))] text-primary-bright shadow-[0_0_24px_oklch(0.63_0.23_292/0.4),inset_0_0_12px_oklch(0.63_0.23_292/0.25)]",
            children: (0, b.jsx)(g, { className: "size-5" }),
          }),
          (0, b.jsxs)("span", {
            children: [
              "Vector",
              (0, b.jsx)("span", {
                className: "text-primary-bright",
                children: "••",
              }),
              "Match",
            ],
          }),
        ],
      });
    }
    let i = [
      { label: "How it works", href: "#how" },
      { label: "For Developers", href: "#pitch" },
      { label: "Blog", href: "/blog" },
    ];
    a.s(
      [
        "Navbar",
        0,
        function () {
          let [a, g] = (0, d.useState)(!1),
            [j, k] = (0, d.useState)(!1);
          return (
            (0, d.useEffect)(() => {
              let a = () => g(window.scrollY > 12);
              return (
                a(),
                window.addEventListener("scroll", a, { passive: !0 }),
                () => window.removeEventListener("scroll", a)
              );
            }, []),
            (0, b.jsxs)("header", {
              className: (0, f.cn)(
                "z-60 border-b border-transparent transition-[background,border-color,backdrop-filter] duration-300",
                a &&
                  "border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150",
              ),
              children: [
                (0, b.jsxs)("div", {
                  className:
                    "mx-auto flex h-[78px] w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-10",
                  children: [
                    (0, b.jsx)(h, {}),
                    (0, b.jsx)("nav", {
                      className: "hidden items-center gap-9 lg:flex",
                      children: i.map((a) =>
                        (0, b.jsx)(
                          "a",
                          {
                            href: a.href,
                            className:
                              "text-[15.5px] text-muted-foreground transition-colors hover:text-foreground",
                            children: a.label,
                          },
                          a.label,
                        ),
                      ),
                    }),
                    (0, b.jsxs)("div", {
                      className: "flex items-center gap-3.5",
                      children: [
                        (0, b.jsx)("a", {
                          href: "/auth?tab=signin",
                          className:
                            "hidden rounded-[10px] border border-border px-[18px] py-2.5 text-[15.5px] font-medium transition-colors hover:bg-secondary/60 sm:inline-flex",
                          children: "Log in",
                        }),
                        (0, b.jsx)(e.Button, {
                          asChild: !0,
                          className: "btn-brand btn-pill hidden sm:inline-flex",
                          children: (0, b.jsx)("a", {
                            href: "/auth?tab=signup",
                            children: "Get Started",
                          }),
                        }),
                        (0, b.jsx)("button", {
                          type: "button",
                          "aria-label": "Toggle menu",
                          "aria-expanded": j,
                          onClick: () => k((a) => !a),
                          className:
                            "grid size-11 place-items-center rounded-[11px] border border-border text-foreground lg:hidden",
                          children: (0, b.jsx)(c, { className: "size-5" }),
                        }),
                      ],
                    }),
                  ],
                }),
                j &&
                  (0, b.jsx)("div", {
                    className:
                      "border-t border-border bg-background/95 backdrop-blur-xl lg:hidden",
                    children: (0, b.jsxs)("nav", {
                      className:
                        "mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-5 py-4 sm:px-8",
                      children: [
                        i.map((a) =>
                          (0, b.jsx)(
                            "a",
                            {
                              href: a.href,
                              onClick: () => k(!1),
                              className:
                                "rounded-lg px-3 py-2.5 text-[15.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
                              children: a.label,
                            },
                            a.label,
                          ),
                        ),
                        (0, b.jsxs)("div", {
                          className: "mt-2 flex flex-col gap-2.5",
                          children: [
                            (0, b.jsx)("a", {
                              href: "/auth?tab=signin",
                              className:
                                "rounded-[10px] border border-border px-4 py-2.5 text-center text-[15.5px] font-medium",
                              children: "Log in",
                            }),
                            (0, b.jsx)(e.Button, {
                              asChild: !0,
                              className: "btn-brand btn-pill",
                              children: (0, b.jsx)("a", {
                                href: "/auth?tab=signup",
                                children: "Get Started",
                              }),
                            }),
                          ],
                        }),
                      ],
                    }),
                  }),
              ],
            })
          );
        },
      ],
      22291,
    );
  },
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0rx-ae7._.js.map
