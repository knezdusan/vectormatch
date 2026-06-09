(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([
  "object" == typeof document ? document.currentScript : void 0,
  33525,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "warnOnce", {
        enumerable: !0,
        get: function () {
          return n;
        },
      });
    let n = (e) => {};
  },
  79474,
  (e, t, r) => {
    "use strict";
    var n =
      e.r(
        71645,
      ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    r.c = function (e) {
      return n.H.useMemoCache(e);
    };
  },
  932,
  (e, t, r) => {
    "use strict";
    t.exports = e.r(79474);
  },
  96661,
  (e) => {
    "use strict";
    e.s([
      "mergeClasses",
      0,
      (...e) =>
        e
          .filter((e, t, r) => !!e && "" !== e.trim() && r.indexOf(e) === t)
          .join(" ")
          .trim(),
    ]);
  },
  71987,
  88973,
  (e) => {
    "use strict";
    e.s(
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
      71987,
    ),
      e.s(
        [
          "hasA11yProp",
          0,
          (e) => {
            for (let t in e)
              if (t.startsWith("aria-") || "role" === t || "title" === t)
                return !0;
            return !1;
          },
        ],
        88973,
      );
  },
  5014,
  (e) => {
    "use strict";
    var t = e.i(71645),
      r = e.i(71987),
      n = e.i(88973),
      s = e.i(96661);
    let a = (0, t.createContext)({}),
      o = (0, t.forwardRef)(
        (
          {
            color: e,
            size: o,
            strokeWidth: l,
            absoluteStrokeWidth: i,
            className: c = "",
            children: d,
            iconNode: m,
            ...u
          },
          h,
        ) => {
          let {
              size: f = 24,
              strokeWidth: b = 2,
              absoluteStrokeWidth: p = !1,
              color: x = "currentColor",
              className: g = "",
            } = (0, t.useContext)(a) ?? {},
            y = (i ?? p) ? (24 * Number(l ?? b)) / Number(o ?? f) : (l ?? b);
          return (0, t.createElement)(
            "svg",
            {
              ref: h,
              ...r.default,
              width: o ?? f ?? r.default.width,
              height: o ?? f ?? r.default.height,
              stroke: e ?? x,
              strokeWidth: y,
              className: (0, s.mergeClasses)("lucide", g, c),
              ...(!d && !(0, n.hasA11yProp)(u) && { "aria-hidden": "true" }),
              ...u,
            },
            [
              ...m.map(([e, r]) => (0, t.createElement)(e, r)),
              ...(Array.isArray(d) ? d : [d]),
            ],
          );
        },
      );
    e.s(["default", 0, o], 5014);
  },
  49001,
  (e) => {
    "use strict";
    var t = e.i(43476),
      r = e.i(932),
      n = e.i(71645),
      s = (e, t, r, n, s, a, o, l) => {
        let i = document.documentElement,
          c = ["light", "dark"];
        function d(t) {
          var r;
          (Array.isArray(e) ? e : [e]).forEach((e) => {
            let r = "class" === e,
              n = r && a ? s.map((e) => a[e] || e) : s;
            r
              ? (i.classList.remove(...n),
                i.classList.add(a && a[t] ? a[t] : t))
              : i.setAttribute(e, t);
          }),
            (r = t),
            l && c.includes(r) && (i.style.colorScheme = r);
        }
        if (n) d(n);
        else
          try {
            let e = localStorage.getItem(t) || r,
              n =
                o && "system" === e
                  ? window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                  : e;
            d(n);
          } catch (e) {}
      },
      a = ["light", "dark"],
      o = "(prefers-color-scheme: dark)",
      l = "u" < typeof window,
      i = n.createContext(void 0),
      c = (e) =>
        n.useContext(i)
          ? n.createElement(n.Fragment, null, e.children)
          : n.createElement(m, { ...e }),
      d = ["light", "dark"],
      m = ({
        forcedTheme: e,
        disableTransitionOnChange: t = !1,
        enableSystem: r = !0,
        enableColorScheme: s = !0,
        storageKey: l = "theme",
        themes: c = d,
        defaultTheme: m = r ? "system" : "light",
        attribute: p = "data-theme",
        value: x,
        children: g,
        nonce: y,
        scriptProps: _,
      }) => {
        let [v, w] = n.useState(() => h(l, m)),
          [k, S] = n.useState(() => ("system" === v ? b() : v)),
          j = x ? Object.values(x) : c,
          N = n.useCallback(
            (e) => {
              let n = e;
              if (!n) return;
              "system" === e && r && (n = b());
              let o = x ? x[n] : n,
                l = t ? f(y) : null,
                i = document.documentElement,
                c = (e) => {
                  "class" === e
                    ? (i.classList.remove(...j), o && i.classList.add(o))
                    : e.startsWith("data-") &&
                      (o ? i.setAttribute(e, o) : i.removeAttribute(e));
                };
              if ((Array.isArray(p) ? p.forEach(c) : c(p), s)) {
                let e = a.includes(m) ? m : null,
                  t = a.includes(n) ? n : e;
                i.style.colorScheme = t;
              }
              null == l || l();
            },
            [y],
          ),
          C = n.useCallback(
            (e) => {
              let t = "function" == typeof e ? e(v) : e;
              w(t);
              try {
                localStorage.setItem(l, t);
              } catch (e) {}
            },
            [v],
          ),
          E = n.useCallback(
            (t) => {
              S(b(t)), "system" === v && r && !e && N("system");
            },
            [v, e],
          );
        n.useEffect(() => {
          let e = window.matchMedia(o);
          return e.addListener(E), E(e), () => e.removeListener(E);
        }, [E]),
          n.useEffect(() => {
            let e = (e) => {
              e.key === l && (e.newValue ? w(e.newValue) : C(m));
            };
            return (
              window.addEventListener("storage", e),
              () => window.removeEventListener("storage", e)
            );
          }, [C]),
          n.useEffect(() => {
            N(null != e ? e : v);
          }, [e, v]);
        let T = n.useMemo(
          () => ({
            theme: v,
            setTheme: C,
            forcedTheme: e,
            resolvedTheme: "system" === v ? k : v,
            themes: r ? [...c, "system"] : c,
            systemTheme: r ? k : void 0,
          }),
          [v, C, e, k, r, c],
        );
        return n.createElement(
          i.Provider,
          { value: T },
          n.createElement(u, {
            forcedTheme: e,
            storageKey: l,
            attribute: p,
            enableSystem: r,
            enableColorScheme: s,
            defaultTheme: m,
            value: x,
            themes: c,
            nonce: y,
            scriptProps: _,
          }),
          g,
        );
      },
      u = n.memo(
        ({
          forcedTheme: e,
          storageKey: t,
          attribute: r,
          enableSystem: a,
          enableColorScheme: o,
          defaultTheme: l,
          value: i,
          themes: c,
          nonce: d,
          scriptProps: m,
        }) => {
          let u = JSON.stringify([r, t, l, e, c, i, a, o]).slice(1, -1);
          return n.createElement("script", {
            ...m,
            suppressHydrationWarning: !0,
            nonce: "u" < typeof window ? d : "",
            dangerouslySetInnerHTML: { __html: `(${s.toString()})(${u})` },
          });
        },
      ),
      h = (e, t) => {
        let r;
        if (!l) {
          try {
            r = localStorage.getItem(e) || void 0;
          } catch (e) {}
          return r || t;
        }
      },
      f = (e) => {
        let t = document.createElement("style");
        return (
          e && t.setAttribute("nonce", e),
          t.appendChild(
            document.createTextNode(
              "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
            ),
          ),
          document.head.appendChild(t),
          () => {
            window.getComputedStyle(document.body),
              setTimeout(() => {
                document.head.removeChild(t);
              }, 1);
          }
        );
      },
      b = (e) => (
        e || (e = window.matchMedia(o)), e.matches ? "dark" : "light"
      );
    e.s(
      [
        "ThemeProvider",
        0,
        function (e) {
          let n,
            s,
            a,
            o = (0, r.c)(6);
          return (
            o[0] !== e
              ? (({ children: n, ...s } = e),
                (o[0] = e),
                (o[1] = n),
                (o[2] = s))
              : ((n = o[1]), (s = o[2])),
            o[3] !== n || o[4] !== s
              ? ((a = (0, t.jsx)(c, { ...s, children: n })),
                (o[3] = n),
                (o[4] = s),
                (o[5] = a))
              : (a = o[5]),
            a
          );
        },
      ],
      49001,
    );
  },
  55324,
  (e) => {
    "use strict";
    var t = e.i(43476),
      r = e.i(932);
    let n = (0, e.i(56420).default)("menu", [
      ["path", { d: "M4 5h16", key: "1tepv9" }],
      ["path", { d: "M4 12h16", key: "1lakjw" }],
      ["path", { d: "M4 19h16", key: "1djgab" }],
    ]);
    var s = e.i(71645),
      a = e.i(19455),
      o = e.i(75157);
    function l(e) {
      let n,
        s,
        a,
        o,
        l,
        i = (0, r.c)(6);
      return (
        i[0] === Symbol.for("react.memo_cache_sentinel")
          ? ((n = (0, t.jsx)("path", {
              d: "M8 4C5.5 4 5.5 9 5.5 9S5.5 12 3 12c2.5 0 2.5 3 2.5 3S5.5 20 8 20",
            })),
            (s = (0, t.jsx)("path", {
              d: "M16 4c2.5 0 2.5 5 2.5 5S18.5 12 21 12c-2.5 0-2.5 3-2.5 3S18.5 20 16 20",
            })),
            (a = (0, t.jsx)("circle", {
              cx: "10.4",
              cy: "12",
              r: "1.1",
              fill: "currentColor",
              stroke: "none",
            })),
            (o = (0, t.jsx)("circle", {
              cx: "13.6",
              cy: "12",
              r: "1.1",
              fill: "currentColor",
              stroke: "none",
            })),
            (i[0] = n),
            (i[1] = s),
            (i[2] = a),
            (i[3] = o))
          : ((n = i[0]), (s = i[1]), (a = i[2]), (o = i[3])),
        i[4] !== e
          ? ((l = (0, t.jsxs)("svg", {
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.9,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              "aria-hidden": "true",
              ...e,
              children: [n, s, a, o],
            })),
            (i[4] = e),
            (i[5] = l))
          : (l = i[5]),
        l
      );
    }
    function i(e) {
      let n,
        s,
        a,
        i,
        c = (0, r.c)(6),
        { className: d } = e;
      return (
        c[0] !== d
          ? ((n = (0, o.cn)(
              "flex items-center gap-2.5 text-[22px] font-bold tracking-tight",
              d,
            )),
            (c[0] = d),
            (c[1] = n))
          : (n = c[1]),
        c[2] === Symbol.for("react.memo_cache_sentinel")
          ? ((s = (0, t.jsx)("span", {
              className:
                "grid size-9 flex-none place-items-center rounded-[11px] border border-primary-bright/50 bg-[linear-gradient(150deg,oklch(0.32_0.06_292),oklch(0.20_0.03_274))] text-primary-bright shadow-[0_0_24px_oklch(0.63_0.23_292/0.4),inset_0_0_12px_oklch(0.63_0.23_292/0.25)]",
              children: (0, t.jsx)(l, { className: "size-5" }),
            })),
            (c[2] = s))
          : (s = c[2]),
        c[3] === Symbol.for("react.memo_cache_sentinel")
          ? ((a = (0, t.jsxs)("span", {
              children: [
                "Vector",
                (0, t.jsx)("span", {
                  className: "text-primary-bright",
                  children: "••",
                }),
                "Match",
              ],
            })),
            (c[3] = a))
          : (a = c[3]),
        c[4] !== n
          ? ((i = (0, t.jsxs)("a", {
              href: "#top",
              className: n,
              children: [s, a],
            })),
            (c[4] = n),
            (c[5] = i))
          : (i = c[5]),
        i
      );
    }
    let c = [
      { label: "How it works", href: "#how" },
      { label: "For Developers", href: "#pitch" },
      { label: "Blog", href: "/blog" },
    ];
    function d(e) {
      return !e;
    }
    function m(e) {
      return (0, t.jsx)(
        "a",
        {
          href: e.href,
          className:
            "text-[15.5px] text-muted-foreground transition-colors hover:text-foreground",
          children: e.label,
        },
        e.label,
      );
    }
    e.s(
      [
        "Navbar",
        0,
        function () {
          let e,
            l,
            u,
            h,
            f,
            b,
            p,
            x,
            g,
            y,
            _,
            v,
            w = (0, r.c)(17),
            [k, S] = (0, s.useState)(!1),
            [j, N] = (0, s.useState)(!1);
          w[0] === Symbol.for("react.memo_cache_sentinel")
            ? ((e = () => {
                let e = () => S(window.scrollY > 12);
                return (
                  e(),
                  window.addEventListener("scroll", e, { passive: !0 }),
                  () => window.removeEventListener("scroll", e)
                );
              }),
              (l = []),
              (w[0] = e),
              (w[1] = l))
            : ((e = w[0]), (l = w[1])),
            (0, s.useEffect)(e, l);
          let C =
            k &&
            "border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150";
          return (
            w[2] !== C
              ? ((u = (0, o.cn)(
                  "z-60 border-b border-transparent transition-[background,border-color,backdrop-filter] duration-300",
                  C,
                )),
                (w[2] = C),
                (w[3] = u))
              : (u = w[3]),
            w[4] === Symbol.for("react.memo_cache_sentinel")
              ? ((h = (0, t.jsx)(i, {})), (w[4] = h))
              : (h = w[4]),
            w[5] === Symbol.for("react.memo_cache_sentinel")
              ? ((f = (0, t.jsx)("nav", {
                  className: "hidden items-center gap-9 lg:flex",
                  children: c.map(m),
                })),
                (w[5] = f))
              : (f = w[5]),
            w[6] === Symbol.for("react.memo_cache_sentinel")
              ? ((b = (0, t.jsx)("a", {
                  href: "/auth?tab=signin",
                  className:
                    "hidden rounded-[10px] border border-border px-[18px] py-2.5 text-[15.5px] font-medium transition-colors hover:bg-secondary/60 sm:inline-flex",
                  children: "Log in",
                })),
                (w[6] = b))
              : (b = w[6]),
            w[7] === Symbol.for("react.memo_cache_sentinel")
              ? ((p = (0, t.jsx)(a.Button, {
                  asChild: !0,
                  className: "btn-brand btn-pill hidden sm:inline-flex",
                  children: (0, t.jsx)("a", {
                    href: "/auth?tab=signup",
                    children: "Get Started",
                  }),
                })),
                (w[7] = p))
              : (p = w[7]),
            w[8] === Symbol.for("react.memo_cache_sentinel")
              ? ((x = () => N(d)), (w[8] = x))
              : (x = w[8]),
            w[9] === Symbol.for("react.memo_cache_sentinel")
              ? ((g = (0, t.jsx)(n, { className: "size-5" })), (w[9] = g))
              : (g = w[9]),
            w[10] !== j
              ? ((y = (0, t.jsxs)("div", {
                  className:
                    "mx-auto flex h-[78px] w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-10",
                  children: [
                    h,
                    f,
                    (0, t.jsxs)("div", {
                      className: "flex items-center gap-3.5",
                      children: [
                        b,
                        p,
                        (0, t.jsx)("button", {
                          type: "button",
                          "aria-label": "Toggle menu",
                          "aria-expanded": j,
                          onClick: x,
                          className:
                            "grid size-11 place-items-center rounded-[11px] border border-border text-foreground lg:hidden",
                          children: g,
                        }),
                      ],
                    }),
                  ],
                })),
                (_ =
                  j &&
                  (0, t.jsx)("div", {
                    className:
                      "border-t border-border bg-background/95 backdrop-blur-xl lg:hidden",
                    children: (0, t.jsxs)("nav", {
                      className:
                        "mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-5 py-4 sm:px-8",
                      children: [
                        c.map((e) =>
                          (0, t.jsx)(
                            "a",
                            {
                              href: e.href,
                              onClick: () => N(!1),
                              className:
                                "rounded-lg px-3 py-2.5 text-[15.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
                              children: e.label,
                            },
                            e.label,
                          ),
                        ),
                        (0, t.jsxs)("div", {
                          className: "mt-2 flex flex-col gap-2.5",
                          children: [
                            (0, t.jsx)("a", {
                              href: "/auth?tab=signin",
                              className:
                                "rounded-[10px] border border-border px-4 py-2.5 text-center text-[15.5px] font-medium",
                              children: "Log in",
                            }),
                            (0, t.jsx)(a.Button, {
                              asChild: !0,
                              className: "btn-brand btn-pill",
                              children: (0, t.jsx)("a", {
                                href: "/auth?tab=signup",
                                children: "Get Started",
                              }),
                            }),
                          ],
                        }),
                      ],
                    }),
                  })),
                (w[10] = j),
                (w[11] = y),
                (w[12] = _))
              : ((y = w[11]), (_ = w[12])),
            w[13] !== y || w[14] !== _ || w[15] !== u
              ? ((v = (0, t.jsxs)("header", {
                  className: u,
                  children: [y, _],
                })),
                (w[13] = y),
                (w[14] = _),
                (w[15] = u),
                (w[16] = v))
              : (v = w[16]),
            v
          );
        },
      ],
      55324,
    );
  },
]);
