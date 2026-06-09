module.exports = [
  8174,
  (a) => {
    "use strict";
    a.s(["default", () => b]);
    let b = (0, a.i(11857).registerClientReference)(
      function () {
        throw Error(
          "Attempted to call the default export of [project]/node_modules/lucide-react/dist/esm/Icon.mjs <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
        );
      },
      "[project]/node_modules/lucide-react/dist/esm/Icon.mjs <module evaluation>",
      "default",
    );
  },
  90697,
  (a) => {
    "use strict";
    a.s(["default", () => b]);
    let b = (0, a.i(11857).registerClientReference)(
      function () {
        throw Error(
          "Attempted to call the default export of [project]/node_modules/lucide-react/dist/esm/Icon.mjs from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
        );
      },
      "[project]/node_modules/lucide-react/dist/esm/Icon.mjs",
      "default",
    );
  },
  53808,
  (a) => {
    "use strict";
    a.i(8174);
    var b = a.i(90697);
    a.n(b);
  },
  16426,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "warnOnce", {
        enumerable: !0,
        get: function () {
          return d;
        },
      });
    let d = (a) => {};
  },
  29945,
  (a, b, c) => {
    "use strict";
    let d;
    Object.defineProperty(c, "__esModule", { value: !0 });
    var e = {
      getAssetToken: function () {
        return i;
      },
      getAssetTokenQuery: function () {
        return j;
      },
      getDeploymentId: function () {
        return g;
      },
      getDeploymentIdQuery: function () {
        return h;
      },
    };
    for (var f in e) Object.defineProperty(c, f, { enumerable: !0, get: e[f] });
    function g() {
      return d;
    }
    function h(a = !1) {
      return d ? `${a ? "&" : "?"}dpl=${d}` : "";
    }
    function i() {
      return !1;
    }
    function j(a = !1) {
      return "";
    }
    d = void 0;
  },
  1359,
  (a, b, c) => {
    "use strict";
    function d({
      widthInt: a,
      heightInt: b,
      blurWidth: c,
      blurHeight: e,
      blurDataURL: f,
      objectFit: g,
    }) {
      let h = c ? 40 * c : a,
        i = e ? 40 * e : b,
        j = h && i ? `viewBox='0 0 ${h} ${i}'` : "";
      return `%3Csvg xmlns='http://www.w3.org/2000/svg' ${j}%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${j ? "none" : "contain" === g ? "xMidYMid" : "cover" === g ? "xMidYMid slice" : "none"}' style='filter: url(%23b);' href='${f}'/%3E%3C/svg%3E`;
    }
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "getImageBlurSvg", {
        enumerable: !0,
        get: function () {
          return d;
        },
      });
  },
  53549,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 });
    var d = {
      VALID_LOADERS: function () {
        return f;
      },
      imageConfigDefault: function () {
        return g;
      },
    };
    for (var e in d) Object.defineProperty(c, e, { enumerable: !0, get: d[e] });
    let f = ["default", "imgix", "cloudinary", "akamai", "custom"],
      g = {
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [32, 48, 64, 96, 128, 256, 384],
        path: "/_next/image",
        loader: "default",
        loaderFile: "",
        domains: [],
        disableStaticImages: !1,
        minimumCacheTTL: 14400,
        formats: ["image/webp"],
        maximumDiskCacheSize: void 0,
        maximumRedirects: 3,
        maximumResponseBody: 5e7,
        dangerouslyAllowLocalIP: !1,
        dangerouslyAllowSVG: !1,
        contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
        contentDispositionType: "attachment",
        localPatterns: void 0,
        remotePatterns: [],
        qualities: [75],
        unoptimized: !1,
        customCacheHandler: !1,
      };
  },
  87713,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "getImgProps", {
        enumerable: !0,
        get: function () {
          return j;
        },
      }),
      a.r(16426);
    let d = a.r(29945),
      e = a.r(1359),
      f = a.r(53549),
      g = ["-moz-initial", "fill", "none", "scale-down", void 0];
    function h(a) {
      return void 0 !== a.default;
    }
    function i(a) {
      return void 0 === a
        ? a
        : "number" == typeof a
          ? Number.isFinite(a)
            ? a
            : NaN
          : "string" == typeof a && /^[0-9]+$/.test(a)
            ? parseInt(a, 10)
            : NaN;
    }
    function j(
      {
        src: a,
        sizes: b,
        unoptimized: c = !1,
        priority: k = !1,
        preload: l = !1,
        loading: m,
        className: n,
        quality: o,
        width: p,
        height: q,
        fill: r = !1,
        style: s,
        overrideSrc: t,
        onLoad: u,
        onLoadingComplete: v,
        placeholder: w = "empty",
        blurDataURL: x,
        fetchPriority: y,
        decoding: z = "async",
        layout: A,
        objectFit: B,
        objectPosition: C,
        lazyBoundary: D,
        lazyRoot: E,
        ...F
      },
      G,
    ) {
      var H;
      let I,
        J,
        K,
        { imgConf: L, showAltText: M, blurComplete: N, defaultLoader: O } = G,
        P = L || f.imageConfigDefault;
      if ("allSizes" in P) I = P;
      else {
        let a = [...P.deviceSizes, ...P.imageSizes].sort((a, b) => a - b),
          b = P.deviceSizes.sort((a, b) => a - b),
          c = P.qualities?.sort((a, b) => a - b);
        I = { ...P, allSizes: a, deviceSizes: b, qualities: c };
      }
      if (void 0 === O)
        throw Object.defineProperty(
          Error(
            "images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config",
          ),
          "__NEXT_ERROR_CODE",
          { value: "E163", enumerable: !1, configurable: !0 },
        );
      let Q = F.loader || O;
      delete F.loader, delete F.srcSet;
      let R = "__next_img_default" in Q;
      if (R) {
        if ("custom" === I.loader)
          throw Object.defineProperty(
            Error(`Image with src "${a}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),
            "__NEXT_ERROR_CODE",
            { value: "E252", enumerable: !1, configurable: !0 },
          );
      } else {
        let a = Q;
        Q = (b) => {
          let { config: c, ...d } = b;
          return a(d);
        };
      }
      if (A) {
        "fill" === A && (r = !0);
        let a = {
          intrinsic: { maxWidth: "100%", height: "auto" },
          responsive: { width: "100%", height: "auto" },
        }[A];
        a && (s = { ...s, ...a });
        let c = { responsive: "100vw", fill: "100vw" }[A];
        c && !b && (b = c);
      }
      let S = "",
        T = i(p),
        U = i(q);
      if ((H = a) && "object" == typeof H && (h(H) || void 0 !== H.src)) {
        let b = h(a) ? a.default : a;
        if (!b.src)
          throw Object.defineProperty(
            Error(
              `An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(b)}`,
            ),
            "__NEXT_ERROR_CODE",
            { value: "E460", enumerable: !1, configurable: !0 },
          );
        if (!b.height || !b.width)
          throw Object.defineProperty(
            Error(
              `An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(b)}`,
            ),
            "__NEXT_ERROR_CODE",
            { value: "E48", enumerable: !1, configurable: !0 },
          );
        if (
          ((J = b.blurWidth),
          (K = b.blurHeight),
          (x = x || b.blurDataURL),
          (S = b.src),
          !r)
        )
          if (T || U) {
            if (T && !U) {
              let a = T / b.width;
              U = Math.round(b.height * a);
            } else if (!T && U) {
              let a = U / b.height;
              T = Math.round(b.width * a);
            }
          } else (T = b.width), (U = b.height);
      }
      let V = !k && !l && ("lazy" === m || void 0 === m);
      (!(a = "string" == typeof a ? a : S) ||
        a.startsWith("data:") ||
        a.startsWith("blob:")) &&
        ((c = !0), (V = !1)),
        I.unoptimized && (c = !0),
        R &&
          !I.dangerouslyAllowSVG &&
          a.split("?", 1)[0].endsWith(".svg") &&
          (c = !0);
      let W = i(o),
        X = Object.assign(
          r
            ? {
                position: "absolute",
                height: "100%",
                width: "100%",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                objectFit: B,
                objectPosition: C,
              }
            : {},
          M ? {} : { color: "transparent" },
          s,
        ),
        Y =
          N || "empty" === w
            ? null
            : "blur" === w
              ? `url("data:image/svg+xml;charset=utf-8,${(0, e.getImageBlurSvg)({ widthInt: T, heightInt: U, blurWidth: J, blurHeight: K, blurDataURL: x || "", objectFit: X.objectFit })}")`
              : `url("${w}")`,
        Z = g.includes(X.objectFit)
          ? "fill" === X.objectFit
            ? "100% 100%"
            : "cover"
          : X.objectFit,
        $ = Y
          ? {
              backgroundSize: Z,
              backgroundPosition: X.objectPosition || "50% 50%",
              backgroundRepeat: "no-repeat",
              backgroundImage: Y,
            }
          : {},
        _ = (function ({
          config: a,
          src: b,
          unoptimized: c,
          width: e,
          quality: f,
          sizes: g,
          loader: h,
        }) {
          if (c) {
            if (b.startsWith("/") && !b.startsWith("//")) {
              let a = (0, d.getDeploymentId)();
              if (a) {
                let c = b.indexOf("?");
                if (-1 !== c) {
                  let d = new URLSearchParams(b.slice(c + 1));
                  d.get("dpl") ||
                    (d.append("dpl", a),
                    (b = b.slice(0, c) + "?" + d.toString()));
                } else b += `?dpl=${a}`;
              }
            }
            return { src: b, srcSet: void 0, sizes: void 0 };
          }
          let { widths: i, kind: j } = (function (
              { deviceSizes: a, allSizes: b },
              c,
              d,
            ) {
              if (d) {
                let c = /(^|\s)(1?\d?\d)vw/g,
                  e = [];
                for (let a; (a = c.exec(d)); ) e.push(parseInt(a[2]));
                if (e.length) {
                  let c = 0.01 * Math.min(...e);
                  return { widths: b.filter((b) => b >= a[0] * c), kind: "w" };
                }
                return { widths: b, kind: "w" };
              }
              return "number" != typeof c
                ? { widths: a, kind: "w" }
                : {
                    widths: [
                      ...new Set(
                        [c, 2 * c].map(
                          (a) => b.find((b) => b >= a) || b[b.length - 1],
                        ),
                      ),
                    ],
                    kind: "x",
                  };
            })(a, e, g),
            k = i.length - 1;
          return {
            sizes: g || "w" !== j ? g : "100vw",
            srcSet: i
              .map(
                (c, d) =>
                  `${h({ config: a, src: b, quality: f, width: c })} ${"w" === j ? c : d + 1}${j}`,
              )
              .join(", "),
            src: h({ config: a, src: b, quality: f, width: i[k] }),
          };
        })({
          config: I,
          src: a,
          unoptimized: c,
          width: T,
          quality: W,
          sizes: b,
          loader: Q,
        }),
        aa = V ? "lazy" : m;
      return {
        props: {
          ...F,
          loading: aa,
          fetchPriority: y,
          width: T,
          height: U,
          decoding: z,
          className: n,
          style: { ...X, ...$ },
          sizes: _.sizes,
          srcSet: _.srcSet,
          src: t || _.src,
        },
        meta: { unoptimized: c, preload: l || k, placeholder: w, fill: r },
      };
    }
  },
  42377,
  (a, b, c) => {
    let { createClientModuleProxy: d } = a.r(11857);
    a.n(
      d(
        "[project]/node_modules/next/dist/client/image-component.js <module evaluation>",
      ),
    );
  },
  43489,
  (a, b, c) => {
    let { createClientModuleProxy: d } = a.r(11857);
    a.n(d("[project]/node_modules/next/dist/client/image-component.js"));
  },
  18409,
  (a) => {
    "use strict";
    a.i(42377);
    var b = a.i(43489);
    a.n(b);
  },
  53200,
  (a, b, c) => {
    "use strict";
    function d(a, b) {
      let c = a || 75;
      return b?.qualities?.length
        ? b.qualities.reduce(
            (a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a),
            b.qualities[0],
          )
        : c;
    }
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "findClosestQuality", {
        enumerable: !0,
        get: function () {
          return d;
        },
      });
  },
  37763,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "default", {
        enumerable: !0,
        get: function () {
          return g;
        },
      });
    let d = a.r(53200),
      e = a.r(29945);
    function f({ config: a, src: b, width: c, quality: g }) {
      let h = (0, e.getDeploymentId)();
      if (b.startsWith("/") && !b.startsWith("//")) {
        let a = b.indexOf("?");
        if (-1 !== a) {
          let c = new URLSearchParams(b.slice(a + 1)),
            d = c.get("dpl");
          if (d) {
            (h = d), c.delete("dpl");
            let e = c.toString();
            b = b.slice(0, a) + (e ? "?" + e : "");
          }
        }
      }
      if (
        b.startsWith("/") &&
        b.includes("?") &&
        a.localPatterns?.length === 1 &&
        "**" === a.localPatterns[0].pathname &&
        "" === a.localPatterns[0].search
      )
        throw Object.defineProperty(
          Error(`Image with src "${b}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),
          "__NEXT_ERROR_CODE",
          { value: "E871", enumerable: !1, configurable: !0 },
        );
      let i = (0, d.findClosestQuality)(g, a);
      return `${a.path}?url=${encodeURIComponent(b)}&w=${c}&q=${i}${b.startsWith("/") && h ? `&dpl=${h}` : ""}`;
    }
    f.__next_img_default = !0;
    let g = f;
  },
  50858,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 });
    var d = {
      default: function () {
        return k;
      },
      getImageProps: function () {
        return j;
      },
    };
    for (var e in d) Object.defineProperty(c, e, { enumerable: !0, get: d[e] });
    let f = a.r(71029),
      g = a.r(87713),
      h = a.r(18409),
      i = f._(a.r(37763));
    function j(a) {
      let { props: b } = (0, g.getImgProps)(a, {
        defaultLoader: i.default,
        imgConf: {
          deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
          imageSizes: [32, 48, 64, 96, 128, 256, 384],
          qualities: [75],
          path: "/_next/image",
          loader: "default",
          dangerouslyAllowSVG: !1,
          unoptimized: !1,
        },
      });
      for (let [a, c] of Object.entries(b)) void 0 === c && delete b[a];
      return { props: b };
    }
    let k = h.Image;
  },
  3236,
  (a, b, c) => {
    b.exports = a.r(50858);
  },
  83504,
  (a) => {
    "use strict";
    let b, c;
    var d = a.i(7997),
      e = a.i(717);
    let f = (a) => {
      let b = a.replace(/^([A-Z])|[\s-_]+(\w)/g, (a, b, c) =>
        c ? c.toUpperCase() : b.toLowerCase(),
      );
      return b.charAt(0).toUpperCase() + b.slice(1);
    };
    var g = a.i(53808);
    let h = (a, b) => {
        let c = (0, e.forwardRef)(({ className: c, ...d }, h) =>
          (0, e.createElement)(g.default, {
            ref: h,
            iconNode: b,
            className: ((...a) =>
              a
                .filter(
                  (a, b, c) => !!a && "" !== a.trim() && c.indexOf(a) === b,
                )
                .join(" ")
                .trim())(
              `lucide-${f(a)
                .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
                .toLowerCase()}`,
              `lucide-${a}`,
              c,
            ),
            ...d,
          }),
        );
        return (c.displayName = f(a)), c;
      },
      i = h("arrow-right", [
        ["path", { d: "M5 12h14", key: "1ays0h" }],
        ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }],
      ]),
      j = h("play", [
        [
          "path",
          {
            d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
            key: "10ikf1",
          },
        ],
      ]),
      k = h("sparkles", [
        [
          "path",
          {
            d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
            key: "1s2grr",
          },
        ],
        ["path", { d: "M20 2v4", key: "1rf3ol" }],
        ["path", { d: "M22 4h-4", key: "gwowj6" }],
        ["circle", { cx: "4", cy: "20", r: "2", key: "6kqj1y" }],
      ]);
    var l = a.i(3236),
      m = a.i(84347);
    let n = (a) => ("boolean" == typeof a ? `${a}` : 0 === a ? "0" : a),
      o = m.clsx;
    function p(a, b) {
      if ("function" == typeof a) return a(b);
      null != a && (a.current = b);
    }
    function q(a) {
      var b;
      let c,
        f =
          ((b = a),
          ((c = e.forwardRef((a, b) => {
            let { children: c, ...d } = a;
            if (e.isValidElement(c)) {
              var f;
              let a,
                g,
                h =
                  ((f = c),
                  (g =
                    (a = Object.getOwnPropertyDescriptor(
                      f.props,
                      "ref",
                    )?.get) &&
                    "isReactWarning" in a &&
                    a.isReactWarning)
                    ? f.ref
                    : (g =
                          (a = Object.getOwnPropertyDescriptor(
                            f,
                            "ref",
                          )?.get) &&
                          "isReactWarning" in a &&
                          a.isReactWarning)
                      ? f.props.ref
                      : f.props.ref || f.ref),
                i = (function (a, b) {
                  let c = { ...b };
                  for (let d in b) {
                    let e = a[d],
                      f = b[d];
                    /^on[A-Z]/.test(d)
                      ? e && f
                        ? (c[d] = (...a) => {
                            let b = f(...a);
                            return e(...a), b;
                          })
                        : e && (c[d] = e)
                      : "style" === d
                        ? (c[d] = { ...e, ...f })
                        : "className" === d &&
                          (c[d] = [e, f].filter(Boolean).join(" "));
                  }
                  return { ...a, ...c };
                })(d, c.props);
              return (
                c.type !== e.Fragment &&
                  (i.ref = b
                    ? (function (...a) {
                        return (b) => {
                          let c = !1,
                            d = a.map((a) => {
                              let d = p(a, b);
                              return c || "function" != typeof d || (c = !0), d;
                            });
                          if (c)
                            return () => {
                              for (let b = 0; b < d.length; b++) {
                                let c = d[b];
                                "function" == typeof c ? c() : p(a[b], null);
                              }
                            };
                        };
                      })(b, h)
                    : h),
                e.cloneElement(c, i)
              );
            }
            return e.Children.count(c) > 1 ? e.Children.only(null) : null;
          })).displayName = `${b}.SlotClone`),
          c),
        g = e.forwardRef((a, b) => {
          let { children: c, ...g } = a,
            h = e.Children.toArray(c),
            i = h.find(v);
          if (i) {
            let a = i.props.children,
              c = h.map((b) =>
                b !== i
                  ? b
                  : e.Children.count(a) > 1
                    ? e.Children.only(null)
                    : e.isValidElement(a)
                      ? a.props.children
                      : null,
              );
            return (0, d.jsx)(f, {
              ...g,
              ref: b,
              children: e.isValidElement(a)
                ? e.cloneElement(a, void 0, c)
                : null,
            });
          }
          return (0, d.jsx)(f, { ...g, ref: b, children: c });
        });
      return (g.displayName = `${a}.Slot`), g;
    }
    var r = q("Slot"),
      s = Symbol("radix.slottable");
    function t(a) {
      let b = ({ children: a }) => (0, d.jsx)(d.Fragment, { children: a });
      return (b.displayName = `${a}.Slottable`), (b.__radixId = s), b;
    }
    var u = t("Slottable");
    function v(a) {
      return (
        e.isValidElement(a) &&
        "function" == typeof a.type &&
        "__radixId" in a.type &&
        a.type.__radixId === s
      );
    }
    a.s(
      [
        "Root",
        0,
        r,
        "Slot",
        0,
        r,
        "Slottable",
        0,
        u,
        "createSlot",
        0,
        q,
        "createSlottable",
        0,
        t,
      ],
      89246,
    );
    var w = a.i(89246),
      w = w,
      x = a.i(39138);
    let y =
      ((b =
        "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"),
      (c = {
        variants: {
          variant: {
            default: "bg-primary text-primary-foreground hover:bg-primary/80",
            outline:
              "border-border bg-input/30 hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
            secondary:
              "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
            ghost:
              "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
            destructive:
              "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
            link: "text-primary underline-offset-4 hover:underline",
          },
          size: {
            default:
              "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
            xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
            sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
            lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
            icon: "size-9",
            "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
            "icon-sm": "size-8",
            "icon-lg": "size-10",
          },
        },
        defaultVariants: { variant: "default", size: "default" },
      }),
      (a) => {
        var d;
        if ((null == c ? void 0 : c.variants) == null)
          return o(
            b,
            null == a ? void 0 : a.class,
            null == a ? void 0 : a.className,
          );
        let { variants: e, defaultVariants: f } = c,
          g = Object.keys(e).map((b) => {
            let c = null == a ? void 0 : a[b],
              d = null == f ? void 0 : f[b];
            if (null === c) return null;
            let g = n(c) || n(d);
            return e[b][g];
          }),
          h =
            a &&
            Object.entries(a).reduce((a, b) => {
              let [c, d] = b;
              return void 0 === d || (a[c] = d), a;
            }, {});
        return o(
          b,
          g,
          null == c || null == (d = c.compoundVariants)
            ? void 0
            : d.reduce((a, b) => {
                let { class: c, className: d, ...e } = b;
                return Object.entries(e).every((a) => {
                  let [b, c] = a;
                  return Array.isArray(c)
                    ? c.includes({ ...f, ...h }[b])
                    : { ...f, ...h }[b] === c;
                })
                  ? [...a, c, d]
                  : a;
              }, []),
          null == a ? void 0 : a.class,
          null == a ? void 0 : a.className,
        );
      });
    function z({
      className: a,
      variant: b = "default",
      size: c = "default",
      asChild: e = !1,
      ...f
    }) {
      let g = e ? w.Root : "button";
      return (0, d.jsx)(g, {
        "data-slot": "button",
        "data-variant": b,
        "data-size": c,
        className: (0, x.cn)(y({ variant: b, size: c, className: a })),
        ...f,
      });
    }
    var A = a.i(13444);
    let B = [
        "/avatars/dev-1.jpg",
        "/avatars/dev-2.jpg",
        "/avatars/dev-3.jpg",
        "/avatars/dev-4.jpg",
        "/avatars/dev-5.jpg",
      ],
      C = [
        {
          title: "Hacker News",
          subtitle: "Who is Hiring",
          position: "top-[4%] left-1 lg:-left-[-10px]",
          icon: (0, d.jsx)("span", {
            className: "font-mono text-[13px] font-bold",
            children: "HN",
          }),
          iconBg: "#ff6600",
        },
        {
          title: "Greenhouse",
          subtitle: "ATS Jobs",
          position: "top-[27%] left-1 lg:-left-[18px]",
          icon: (0, d.jsx)(A.GreenhouseIcon, { className: "size-[19px]" }),
          iconBg: "#1f8a4c",
        },
        {
          title: "Lever",
          subtitle: "Opportunities",
          position: "top-[50%] left-1 lg:-left-[34px]",
          icon: (0, d.jsx)(A.LeverIcon, { className: "size-[19px]" }),
          iconBg: "#5840d8",
        },
        {
          title: "Hidden Boards",
          subtitle: "httparchive",
          position: "top-[73%] left-1 lg:-left-[-10px]",
          icon: (0, d.jsx)(A.GlobeScanIcon, { className: "size-[19px]" }),
          iconBg: "#0ea5e9",
        },
      ],
      D = [
        {
          title: "CTO",
          subtitle: "Fintech Startup",
          position: "top-[7%] right-1 lg:-right-[-20px]",
          avatarImg: "/avatars/cto-employer.jpg",
          onlineOutline: !0,
        },
        {
          title: "Eng Manager",
          subtitle: "AI Company",
          position: "top-[30%] right-1 lg:-right-[40px]",
          avatarImg: "/avatars/eng-manager.jpg",
          online: !0,
        },
        {
          title: "Tech Lead",
          subtitle: "SaaS Platform",
          position: "top-[53%] right-1 lg:-right-[22px]",
          avatarImg: "/avatars/persona-3.jpg",
          onlineOutline: !0,
        },
        {
          title: "Founder",
          subtitle: "Web3 Startup",
          position: "top-[76%] right-1 lg:-right-[-20px]",
          avatarImg: "/avatars/founder.jpg",
          online: !0,
        },
      ];
    function E({ card: a }) {
      return (0, d.jsxs)("div", {
        className: (0, x.cn)(
          "absolute z-5 flex items-center gap-2.5 rounded-2xl border border-border-soft bg-[oklch(0.20_0.026_274/0.72)] px-[15px] py-[11px] shadow-[0_14px_34px_#0008] backdrop-blur-[14px] transition duration-700 hover:scale-105",
          a.position,
        ),
        children: [
          a.avatarImg
            ? (0, d.jsx)("span", {
                className: "size-8 flex-none overflow-hidden rounded-full",
                children: (0, d.jsx)(l.default, {
                  src: a.avatarImg,
                  alt: a.title,
                  width: 32,
                  height: 32,
                  className: "size-full object-cover",
                }),
              })
            : a.avatar
              ? (0, d.jsx)("span", {
                  className: "size-8 flex-none rounded-full",
                  style: { background: a.avatar },
                })
              : (0, d.jsx)("span", {
                  className:
                    "grid size-[34px] flex-none place-items-center rounded-[9px] text-white",
                  style: { background: a.iconBg },
                  children: a.icon,
                }),
          (0, d.jsxs)("div", {
            className: "flex min-w-0 flex-col gap-px",
            children: [
              (0, d.jsx)("div", {
                className:
                  "text-[13.5px] leading-tight font-semibold whitespace-nowrap",
                children: a.title,
              }),
              (0, d.jsx)("div", {
                className:
                  "hidden text-[11.5px] leading-tight whitespace-nowrap text-muted-foreground sm:block",
                children: a.subtitle,
              }),
            ],
          }),
          a.online &&
            (0, d.jsx)("span", {
              className:
                "ml-1 size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]",
            }),
          a.onlineOutline &&
            (0, d.jsx)("span", {
              className:
                "ml-1 size-2 rounded-full border border-accent shadow-[0_0_8px_var(--accent)]",
            }),
        ],
      });
    }
    function F() {
      return (0, d.jsxs)("section", {
        id: "top",
        className:
          "hero-aura relative overflow-hidden pt-10 pb-16 sm:pt-14 lg:pt-10 lg:pb-20",
        children: [
          (0, d.jsx)("div", {
            className: "pointer-events-none absolute inset-0 z-0 hero-aura",
          }),
          (0, d.jsxs)("div", {
            className:
              "relative z-1 mx-auto grid w-full max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-10 lg:px-10",
            children: [
              (0, d.jsxs)("div", {
                className:
                  "mx-auto max-w-[640px] text-center lg:mx-0 lg:max-w-[600px] lg:text-left space-y-4",
                children: [
                  (0, d.jsxs)("span", {
                    className:
                      "inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium whitespace-nowrap text-accent backdrop-blur-md",
                    children: [
                      (0, d.jsx)(k, { className: "size-3.5" }),
                      "The AI Agent for Web Developers",
                    ],
                  }),
                  (0, d.jsxs)("h1", {
                    className:
                      "mt-6 mb-6 text-[clamp(2rem,4.6vw,3rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance",
                    children: [
                      "Skip the gatekeepers.",
                      (0, d.jsx)("br", {}),
                      (0, d.jsx)("span", {
                        className: "text-gradient-brand",
                        children: "Get hired on your terms.",
                      }),
                    ],
                  }),
                  (0, d.jsx)("p", {
                    className:
                      "mx-auto max-w-[500px] text-[18.5px] leading-relaxed text-muted-foreground lg:mx-0",
                    children:
                      "VectorMatch finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner, not just another applicant.",
                  }),
                  (0, d.jsxs)("div", {
                    className:
                      "mt-9 flex flex-wrap items-center justify-center gap-[18px] lg:justify-start",
                    children: [
                      (0, d.jsx)(z, {
                        asChild: !0,
                        className: "btn-brand btn-xl max-sm:flex-1",
                        children: (0, d.jsxs)("a", {
                          href: "/signup",
                          children: [
                            "Start Your AI Job Hunt",
                            (0, d.jsx)(i, { className: "size-[18px]" }),
                          ],
                        }),
                      }),
                      (0, d.jsx)(z, {
                        asChild: !0,
                        className: "btn-brand-ghost btn-xl px-1.5",
                        children: (0, d.jsxs)("a", {
                          href: "#how",
                          children: [
                            (0, d.jsx)("span", {
                              className:
                                "grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright",
                              children: (0, d.jsx)(j, {
                                className: "size-3 fill-current",
                              }),
                            }),
                            "See How It Works",
                          ],
                        }),
                      }),
                    ],
                  }),
                  (0, d.jsxs)("div", {
                    className: "animate-hero-devs mt-12 inline-block",
                    children: [
                      (0, d.jsx)("div", {
                        className:
                          "font-mono text-[11.5px] tracking-[0.2em] uppercase text-faint",
                        children: "Trusted by developers",
                      }),
                      (0, d.jsxs)("div", {
                        className:
                          "mt-3.5 flex items-center justify-center gap-4 lg:justify-start",
                        children: [
                          (0, d.jsxs)("div", {
                            className: "flex",
                            children: [
                              B.map((a, b) =>
                                (0, d.jsx)(
                                  "span",
                                  {
                                    className: (0, x.cn)(
                                      "size-10 overflow-hidden rounded-full border-2 border-background shadow-[0_2px_8px_#0008]",
                                      b > 0 && "-ml-3",
                                    ),
                                    children: (0, d.jsx)(l.default, {
                                      src: a,
                                      alt: `Developer ${b + 1}`,
                                      width: 40,
                                      height: 40,
                                      className: "size-full object-cover",
                                    }),
                                  },
                                  a,
                                ),
                              ),
                              (0, d.jsx)("span", {
                                className:
                                  "-ml-3 grid size-10 place-items-center rounded-full border-2 border-background bg-[oklch(0.30_0.04_292)] text-xs font-semibold text-white",
                                children: "+2k",
                              }),
                            ],
                          }),
                          (0, d.jsxs)("div", {
                            className: "text-left",
                            children: [
                              (0, d.jsx)("b", {
                                className: "block text-[15.5px] font-semibold",
                                children: "2,000+ developers",
                              }),
                              (0, d.jsx)("span", {
                                className: "text-sm text-muted-foreground",
                                children: "found better opportunities",
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              (0, d.jsxs)("div", {
                className:
                  "animate-hero-right relative mx-auto h-[380px] w-full max-w-[620px] sm:h-[460px] lg:h-[600px] lg:max-w-none",
                children: [
                  (0, d.jsxs)("div", {
                    className:
                      "absolute inset-0 overflow-hidden rounded-2xl shadow-[0_30px_80px_oklch(0.10_0.02_274/0.7),inset_0_0_0_1px_oklch(0.50_0.06_292/0.18)]",
                    children: [
                      (0, d.jsx)(l.default, {
                        src: "/hero-portal-main.jpg",
                        alt: "Developer facing a glowing code portal",
                        fill: !0,
                        priority: !0,
                        sizes: "(max-width: 800px) 620px, 50vw",
                        className:
                          "object-cover object-[50%_46%] transition duration-2000 hover:scale-105 hover:translate-y-[-8px]",
                      }),
                      (0, d.jsx)("div", {
                        className:
                          "pointer-events-none absolute inset-0 scene-vignette",
                      }),
                    ],
                  }),
                  C.map((a) => (0, d.jsx)(E, { card: a }, a.title)),
                  D.map((a) => (0, d.jsx)(E, { card: a }, a.title)),
                  (0, d.jsxs)("div", {
                    className:
                      "absolute bottom-3.5 left-1/2 z-6 w-max -translate-x-1/2 text-center",
                    children: [
                      (0, d.jsx)("span", {
                        className: "block text-sm text-muted-foreground",
                        children: "You focus on coding.",
                      }),
                      (0, d.jsx)("b", {
                        className: "mt-0.5 block text-[15px] font-semibold",
                        children: "VectorMatch handles the rest.",
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
    let G = h("heart", [
        [
          "path",
          {
            d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
            key: "mvr1a0",
          },
        ],
      ]),
      H = h("map-pin", [
        [
          "path",
          {
            d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
            key: "1r0f0z",
          },
        ],
        ["circle", { cx: "12", cy: "10", r: "3", key: "ilqhr7" }],
      ]),
      I = [
        {
          title: "Hacker News",
          subtitle: "Who is Hiring",
          icon: (0, d.jsx)("span", {
            className: "font-mono text-[13px] font-bold",
            children: "HN",
          }),
          iconBg: "#ff6600",
        },
        {
          title: "Greenhouse",
          subtitle: "ATS",
          icon: (0, d.jsx)(A.GreenhouseIcon, { className: "size-[21px]" }),
          iconBg: "#1f8a4c",
        },
        {
          title: "Lever",
          subtitle: "Opportunities",
          icon: (0, d.jsx)(A.LeverIcon, { className: "size-[21px]" }),
          iconBg: "#5840d8",
        },
        {
          title: "httparchive",
          subtitle: "Company Scans",
          icon: (0, d.jsx)(A.GlobeScanIcon, { className: "size-[21px]" }),
          iconBg: "#0ea5e9",
        },
        {
          title: "Hidden Channels",
          subtitle: "& Networks",
          icon: (0, d.jsx)(A.NetworkNodesIcon, { className: "size-[21px]" }),
          iconBg: "#7c3aed",
        },
      ],
      J = [
        {
          num: 1,
          icon: (0, d.jsx)(A.DatabaseGateIcon, { className: "size-[26px]" }),
          title: "Database Filter",
          tag: "(GIN Index)",
          body: "Lightning-fast tag screening using advanced database indexing technology.",
        },
        {
          num: 2,
          icon: (0, d.jsx)(A.VectorGateIcon, { className: "size-[26px]" }),
          title: "Vector Search",
          tag: "(HNSW)",
          body: "Semantic similarity matching surfaces conceptually relevant opportunities.",
        },
        {
          num: 3,
          icon: (0, d.jsx)(A.ReasoningGateIcon, { className: "size-[26px]" }),
          title: "AI Reasoning",
          tag: "(Agent Swarm)",
          body: "Deep analysis ensures a perfect fit for your unique profile and goals.",
        },
      ],
      K = [
        {
          role: "Senior Full Stack Dev",
          company: "Fintech Startup",
          pay: "$120k – $160k",
          liked: !0,
        },
        {
          role: "Staff Engineer",
          company: "AI Platform",
          pay: "$150k – $200k",
          liked: !1,
        },
        {
          role: "Tech Lead",
          company: "SaaS Company",
          pay: "$130k – $170k",
          liked: !0,
        },
      ],
      L =
        "relative lg:bottom-6 z-1 overflow-hidden rounded-2xl border border-border bg-[oklch(0.20_0.026_274/0.55)] shadow-[0_18px_44px_oklch(0.10_0.02_274/0.4)] backdrop-blur-[10px]",
      M =
        "border-b border-border p-[18px] text-center font-mono text-xs tracking-[0.16em] uppercase text-muted-foreground";
    function N() {
      return (0, d.jsx)("section", {
        id: "how",
        className:
          "how-surface relative border-t border-[oklch(0.30_0.03_274/0.5)] py-24 lg:py-20 lg:pb-30 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[linear-gradient(90deg,transparent,oklch(0.79_0.17_165/0.4),transparent)]",
        children: (0, d.jsxs)("div", {
          className: "mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-10",
          children: [
            (0, d.jsxs)("div", {
              className: "mx-auto mb-16 max-w-[760px] text-center",
              children: [
                (0, d.jsx)("span", {
                  className:
                    "font-mono text-[13px] font-medium tracking-[0.22em] uppercase text-accent",
                  children: "How it works",
                }),
                (0, d.jsx)("h2", {
                  className:
                    "my-[18px] text-[clamp(1.8rem,3.4vw,2rem)] font-bold tracking-[-0.022em]",
                  children: "AI-Powered. Developer-Focused. Results-Driven.",
                }),
                (0, d.jsx)("p", {
                  className:
                    "text-[17.5px] leading-relaxed text-muted-foreground",
                  children:
                    "Our 3-Gate AI Pipeline ensures you only see opportunities that truly match your skills, preferences, and career goals.",
                }),
              ],
            }),
            (0, d.jsxs)("div", {
              className:
                "relative grid items-start gap-8 lg:grid-cols-[256px_minmax(0,1fr)_280px] animate-how-it-works",
              children: [
                (0, d.jsxs)("aside", {
                  className: L,
                  children: [
                    (0, d.jsx)("div", {
                      className: M,
                      children: "Job Sources",
                    }),
                    I.map((a) =>
                      (0, d.jsxs)(
                        "div",
                        {
                          className:
                            "flex items-center gap-3.5 border-b border-[oklch(0.30_0.03_274/0.5)] px-[17px] py-[15px] last:border-b-0",
                          children: [
                            (0, d.jsx)("span", {
                              className:
                                "grid size-[38px] flex-none place-items-center rounded-[10px] text-white",
                              style: { background: a.iconBg },
                              children: a.icon,
                            }),
                            (0, d.jsxs)("span", {
                              className: "min-w-0",
                              children: [
                                (0, d.jsx)("span", {
                                  className:
                                    "block text-[14.5px] font-semibold whitespace-nowrap",
                                  children: a.title,
                                }),
                                (0, d.jsx)("span", {
                                  className:
                                    "block text-xs whitespace-nowrap text-muted-foreground",
                                  children: a.subtitle,
                                }),
                              ],
                            }),
                          ],
                        },
                        a.title,
                      ),
                    ),
                  ],
                }),
                (0, d.jsx)("div", {
                  className:
                    "relative z-1 grid gap-5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3",
                  children: J.map((a) =>
                    (0, d.jsxs)(
                      "article",
                      {
                        className:
                          "group relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.205_0.026_274/0.2)] p-6 shadow-[0_18px_44px_oklch(0.10_0.02_274/0.4)] backdrop-blur-[10px] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1.5 hover:border-accent/45 hover:shadow-[0_26px_56px_#0007]",
                        children: [
                          (0, d.jsx)("span", {
                            className:
                              "absolute top-5 right-5 grid size-[34px] place-items-center rounded-full border border-accent/40 bg-accent/10 font-mono text-[15px] font-semibold text-accent",
                            children: a.num,
                          }),
                          (0, d.jsx)("div", {
                            className:
                              "mb-[22px] grid size-[52px] place-items-center rounded-[14px] border border-accent/30 bg-accent/10 text-accent lg:hidden xl:grid",
                            children: a.icon,
                          }),
                          (0, d.jsxs)("h3", {
                            className:
                              "text-[17.5px] font-bold tracking-[-0.01em]",
                            children: [
                              a.title,
                              (0, d.jsx)("small", {
                                className:
                                  "mt-[5px] block font-mono text-[12.5px] font-medium tracking-[0.02em] text-accent",
                                children: a.tag,
                              }),
                            ],
                          }),
                          (0, d.jsx)("p", {
                            className:
                              "mt-4 text-sm leading-relaxed text-muted-foreground",
                            children: a.body,
                          }),
                        ],
                      },
                      a.num,
                    ),
                  ),
                }),
                (0, d.jsxs)("aside", {
                  className: L,
                  children: [
                    (0, d.jsx)("div", {
                      className: M,
                      children: "Perfect Matches",
                    }),
                    (0, d.jsxs)("div", {
                      className: "flex flex-col gap-3 p-3.5",
                      children: [
                        K.map((a) =>
                          (0, d.jsxs)(
                            "div",
                            {
                              className:
                                "group rounded-[13px] border border-border bg-[oklch(0.22_0.03_274/0.5)] px-[15px] py-3.5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/40",
                              children: [
                                (0, d.jsxs)("div", {
                                  className:
                                    "flex items-start justify-between gap-2",
                                  children: [
                                    (0, d.jsxs)("div", {
                                      children: [
                                        (0, d.jsx)("h4", {
                                          className:
                                            "text-sm font-semibold whitespace-nowrap",
                                          children: a.role,
                                        }),
                                        (0, d.jsx)("div", {
                                          className:
                                            "mt-0.5 text-xs whitespace-nowrap text-accent",
                                          children: a.company,
                                        }),
                                      ],
                                    }),
                                    (0, d.jsx)(G, {
                                      className: a.liked
                                        ? "size-[17px] flex-none fill-primary-bright text-primary-bright"
                                        : "size-[17px] flex-none text-faint",
                                    }),
                                  ],
                                }),
                                (0, d.jsxs)("div", {
                                  className:
                                    "mt-3 flex items-center justify-between",
                                  children: [
                                    (0, d.jsx)("span", {
                                      className:
                                        "font-mono text-[11.5px] whitespace-nowrap text-muted-foreground",
                                      children: a.pay,
                                    }),
                                    (0, d.jsxs)("span", {
                                      className:
                                        "inline-flex items-center gap-1 text-[11.5px] text-accent",
                                      children: [
                                        (0, d.jsx)(H, {
                                          className: "size-[13px]",
                                        }),
                                        "Remote",
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            },
                            a.role,
                          ),
                        ),
                        (0, d.jsx)("div", {
                          className:
                            "py-2 text-center text-[12.5px] text-faint",
                          children: "And more opportunities…",
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            (0, d.jsx)("div", {
              className:
                "animate-how-it-works-quality mt-13 lg:mt-10 xl:-mt-20 text-center",
              children: (0, d.jsx)("span", {
                className:
                  "inline-block rounded-full border border-accent/25 bg-accent/6 px-6 py-2.5 font-mono text-[14.5px] text-accent text-balance",
                children: "Quality over quantity. Relevance over noise.",
              }),
            }),
          ],
        }),
      });
    }
    let O = h("briefcase", [
        [
          "path",
          { d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", key: "jecpp" },
        ],
        [
          "rect",
          { width: "20", height: "14", x: "2", y: "6", rx: "2", key: "i6l2r4" },
        ],
      ]),
      P = h("check", [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]),
      Q = h("globe", [
        ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
        [
          "path",
          {
            d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
            key: "13o1zl",
          },
        ],
        ["path", { d: "M2 12h20", key: "9i4pu4" }],
      ]),
      R = h("pen-line", [
        ["path", { d: "M13 21h8", key: "1jsn5i" }],
        [
          "path",
          {
            d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            key: "1a8usu",
          },
        ],
      ]),
      S = h("trending-up", [
        ["path", { d: "M16 7h6v6", key: "box55l" }],
        ["path", { d: "m22 7-8.5 8.5-5-5L2 17", key: "1t1m79" }],
      ]),
      T = h("user", [
        [
          "path",
          { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", key: "975kel" },
        ],
        ["circle", { cx: "12", cy: "7", r: "4", key: "17ys0d" }],
      ]),
      U = [
        {
          icon: (0, d.jsx)(T, { className: "size-5" }),
          label: "Direct access to decision makers",
        },
        {
          icon: (0, d.jsx)(O, { className: "size-5" }),
          label: "B2B contracts, not complex employment",
        },
        {
          icon: (0, d.jsx)(Q, { className: "size-5" }),
          label: "Global opportunities, simplified",
        },
        {
          icon: (0, d.jsx)(S, { className: "size-5" }),
          label: "Higher rates, better relationships",
        },
      ],
      V = ["React", "TypeScript", "Node.js", "PostgreSQL"],
      W = [
        {
          initial: "F",
          bg: "linear-gradient(135deg,#7c3aed,#4f46e5)",
          name: "FintechFlow",
          meta: "Series B · 50–100 people",
          sub: "Building the future of financial infrastructure",
          match: "TechStack Match: 95%",
        },
        {
          initial: "A",
          bg: "linear-gradient(135deg,#0ea5e9,#22c55e)",
          name: "AI Labs",
          meta: "Series A · 20–50 people",
          sub: "AI-powered developer tools",
          match: "TechStack Match: 92%",
        },
      ],
      X = [
        "Higher compensation",
        "Flexible arrangements",
        "Global opportunities",
        "Long-term relationships",
      ],
      Y =
        "rounded-2xl border border-border bg-[oklch(0.205_0.026_274/0.82)] shadow-[0_26px_64px_oklch(0.08_0.02_274/0.7)] backdrop-blur-[1px]";
    function Z() {
      return (0, d.jsxs)("div", {
        className: `${Y} flex flex-col gap-3.5 p-[18px] xl:absolute xl:top-0 xl:left-0 xl:z-3 xl:w-[308px]`,
        children: [
          (0, d.jsxs)("div", {
            className: "flex items-center gap-3.5",
            children: [
              (0, d.jsx)("span", {
                className:
                  "size-[54px] flex-none overflow-hidden rounded-[13px]",
                children: (0, d.jsx)(l.default, {
                  src: "/avatars/alex-webb.jpg",
                  alt: "Alex Chen",
                  width: 54,
                  height: 54,
                  className: "size-full object-cover",
                }),
              }),
              (0, d.jsxs)("div", {
                children: [
                  (0, d.jsx)("div", {
                    className: "text-lg font-bold",
                    children: "Alex Webb",
                  }),
                  (0, d.jsx)("div", {
                    className: "text-[13.5px] text-muted-foreground",
                    children: "Senior Full Stack Developer",
                  }),
                ],
              }),
            ],
          }),
          (0, d.jsxs)("div", {
            className: "flex flex-wrap gap-2",
            children: [
              V.map((a) =>
                (0, d.jsx)(
                  "span",
                  {
                    className:
                      "rounded-lg border border-border bg-[oklch(0.26_0.03_274/0.8)] px-[11px] py-1.5 font-mono text-xs",
                    children: a,
                  },
                  a,
                ),
              ),
              (0, d.jsx)("span", {
                className:
                  "rounded-lg border border-primary-bright/30 bg-primary/10 px-[11px] py-1.5 font-mono text-xs text-primary-bright",
                children: "+8 more",
              }),
            ],
          }),
        ],
      });
    }
    function $() {
      return (0, d.jsxs)("div", {
        className: `${Y} p-4 xl:absolute xl:top-[200px] xl:left-0 xl:z-4 xl:w-[308px]`,
        children: [
          (0, d.jsx)("div", {
            className: "mx-1 mt-0.5 mb-3.5 text-sm font-semibold",
            children: "Recommended Companies",
          }),
          (0, d.jsx)("div", {
            className: "flex flex-col gap-3",
            children: W.map((a) =>
              (0, d.jsxs)(
                "div",
                {
                  className:
                    "relative flex items-start gap-3.5 rounded-[13px] border border-border bg-[oklch(0.235_0.03_274/0.7)] px-3.5 pt-3.5 pb-4",
                  children: [
                    (0, d.jsx)("span", {
                      className:
                        "grid size-[42px] flex-none place-items-center rounded-[11px] font-mono font-bold text-white",
                      style: { background: a.bg },
                      children: a.initial,
                    }),
                    (0, d.jsxs)("div", {
                      children: [
                        (0, d.jsx)("div", {
                          className: "text-[15px] font-semibold",
                          children: a.name,
                        }),
                        (0, d.jsx)("div", {
                          className: "mt-0.5 text-xs text-muted-foreground",
                          children: a.meta,
                        }),
                        (0, d.jsx)("div", {
                          className: "mt-1.5 text-xs leading-snug text-faint",
                          children: a.sub,
                        }),
                        (0, d.jsx)("div", {
                          className: "mt-2 font-mono text-xs text-accent",
                          children: a.match,
                        }),
                      ],
                    }),
                    (0, d.jsx)(G, {
                      className:
                        "absolute top-3.5 right-3.5 size-[17px] text-faint",
                    }),
                  ],
                },
                a.name,
              ),
            ),
          }),
        ],
      });
    }
    function _() {
      return (0, d.jsxs)("div", {
        className: `${Y} px-5 py-[18px] xl:absolute xl:top-[480px] xl:left-[100px] xl:z-5 xl:w-[244px] bg-primary/10`,
        children: [
          (0, d.jsx)("h3", {
            className: "mb-3.5 text-[13.5px] font-bold",
            children: "Partnership Benefits",
          }),
          (0, d.jsx)("ul", {
            className: "grid gap-[11px]",
            children: X.map((a) =>
              (0, d.jsxs)(
                "li",
                {
                  className:
                    "flex items-center gap-2.5 text-[13.5px] text-muted-foreground",
                  children: [
                    (0, d.jsx)(P, {
                      className: "size-[15px] flex-none text-accent",
                      strokeWidth: 2.4,
                    }),
                    a,
                  ],
                },
                a,
              ),
            ),
          }),
        ],
      });
    }
    function aa() {
      return (0, d.jsxs)("div", {
        className: `${Y} p-[18px] xl:absolute xl:top-[150px] xl:right-0 xl:z-6 xl:w-80`,
        children: [
          (0, d.jsxs)("div", {
            className:
              "mb-3.5 flex items-center gap-2.5 border-b border-border pb-3.5 text-[15px] font-bold",
            children: [
              (0, d.jsx)(R, { className: "size-[17px] text-primary-bright" }),
              "New Pitch",
            ],
          }),
          (0, d.jsxs)("div", {
            className:
              "border-b border-[oklch(0.30_0.03_274/0.5)] py-2 text-[13px] text-muted-foreground",
            children: [
              "To:",
              " ",
              (0, d.jsx)("span", {
                className: "font-mono text-[12.5px] text-primary-bright",
                children: "engineering@fintechflow.com",
              }),
            ],
          }),
          (0, d.jsxs)("div", {
            className:
              "border-b border-[oklch(0.30_0.03_274/0.5)] py-2 text-[13px] text-muted-foreground",
            children: [
              "Subject:",
              " ",
              (0, d.jsx)("b", {
                className: "font-semibold text-foreground",
                children: "Senior Developer Partnership Opportunity",
              }),
            ],
          }),
          (0, d.jsxs)("div", {
            className:
              "my-[15px] grid gap-[11px] text-[13px] leading-relaxed text-muted-foreground",
            children: [
              (0, d.jsx)("span", { children: "Hi Sarah," }),
              (0, d.jsx)("span", {
                children:
                  "I came across FintechFlow's work on modernizing financial infrastructure — impressive stuff.",
              }),
              (0, d.jsx)("span", {
                children:
                  "I'd love to help accelerate your roadmap as a technical partner. I've attached a brief overview of how I can contribute.",
              }),
              (0, d.jsx)("span", {
                children: "Looking forward to hearing your thoughts.",
              }),
              (0, d.jsxs)("span", {
                children: ["Best regards,", (0, d.jsx)("br", {}), "Alex"],
              }),
            ],
          }),
          (0, d.jsx)(z, {
            className: "btn-brand btn-xl w-full",
            children: "Send Pitch",
          }),
        ],
      });
    }
    function ab() {
      return (0, d.jsx)("section", {
        id: "pitch",
        className:
          "pitch-surface relative overflow-clip border-t border-[oklch(0.30_0.03_274/0.5)] pt-15",
        children: (0, d.jsxs)("div", {
          className:
            "relative z-1 mx-auto grid w-full max-w-[1400px] gap-10 justify-center px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:pt-10",
          children: [
            (0, d.jsxs)("div", {
              className: "animate-pitch-left max-w-[640px]",
              children: [
                (0, d.jsxs)("span", {
                  className:
                    "inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/10 py-2 pr-4 pl-3.5 text-[13.5px] font-medium whitespace-nowrap text-accent backdrop-blur-md",
                  children: [
                    (0, d.jsx)(i, { className: "size-3.5" }),
                    "Bypass the ATS Black Hole",
                  ],
                }),
                (0, d.jsxs)("h2", {
                  className:
                    "mt-6 mb-[22px] text-[clamp(2.5rem,4vw,3rem)] leading-[1.04] font-bold tracking-[-0.028em]",
                  children: [
                    "Pitch directly.",
                    (0, d.jsx)("br", {}),
                    "Partner effectively.",
                    (0, d.jsx)("br", {}),
                    (0, d.jsx)("span", {
                      className: "text-gradient-brand",
                      children: "Get contracted.",
                    }),
                  ],
                }),
                (0, d.jsx)("p", {
                  className:
                    "max-w-[470px] text-[17.5px] leading-relaxed text-muted-foreground",
                  children:
                    "VectorMatch helps you connect directly with CTOs and Engineering Managers, positioning you as a strategic partner through frictionless B2B contracts.",
                }),
                (0, d.jsx)("ul", {
                  className: "mt-8 grid gap-[18px]",
                  children: U.map((a) =>
                    (0, d.jsxs)(
                      "li",
                      {
                        className: "flex items-center gap-[15px] text-base",
                        children: [
                          (0, d.jsx)("span", {
                            className:
                              "grid size-[42px] flex-none place-items-center rounded-[11px] border border-primary-bright/30 bg-primary/10 text-primary-bright",
                            children: a.icon,
                          }),
                          a.label,
                        ],
                      },
                      a.label,
                    ),
                  ),
                }),
                (0, d.jsxs)("div", {
                  className: "mt-10 flex flex-wrap items-center gap-[18px]",
                  children: [
                    (0, d.jsx)(z, {
                      asChild: !0,
                      className: "btn-brand btn-xl max-sm:flex-1",
                      children: (0, d.jsxs)("a", {
                        href: "/signup",
                        children: [
                          "Start Pitching Smarter",
                          (0, d.jsx)(i, { className: "size-[18px]" }),
                        ],
                      }),
                    }),
                    (0, d.jsx)(z, {
                      asChild: !0,
                      className: "btn-brand-ghost btn-xl px-1.5",
                      children: (0, d.jsxs)("a", {
                        href: "/developers",
                        children: [
                          (0, d.jsx)("span", {
                            className:
                              "grid size-8 place-items-center rounded-full border border-primary-bright/40 bg-primary/15 text-primary-bright",
                            children: (0, d.jsx)(j, {
                              className: "size-3 fill-current",
                            }),
                          }),
                          "Learn More",
                        ],
                      }),
                    }),
                  ],
                }),
              ],
            }),
            (0, d.jsxs)("div", {
              className:
                "animate-pitch-right relative mx-auto flex w-full max-w-[560px] flex-col gap-[18px] lg:max-w-[620px] xl:block xl:h-[824px] xl:max-w-none",
              children: [
                (0, d.jsx)(Z, {}),
                (0, d.jsx)($, {}),
                (0, d.jsx)(_, {}),
                (0, d.jsx)(aa, {}),
              ],
            }),
          ],
        }),
      });
    }
    a.s(
      [
        "default",
        0,
        function () {
          return (0, d.jsxs)("main", {
            className: "min-h-screen overflow-x-clip",
            children: [
              (0, d.jsx)(F, {}),
              (0, d.jsx)(N, {}),
              (0, d.jsx)(ab, {}),
            ],
          });
        },
        "metadata",
        0,
        {
          title: "VectorMatch — The AI Agent for Web Developers",
          description:
            "VectorMatch finds hidden tech opportunities, matches them with your unique developer profile, and helps you pitch directly to decision makers as a valued partner.",
        },
      ],
      83504,
    );
  },
  4948,
  (a) => {
    a.n(a.i(83504));
  },
];

//# sourceMappingURL=_1j8qxdz._.js.map
