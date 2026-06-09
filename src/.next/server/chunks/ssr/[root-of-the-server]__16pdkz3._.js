module.exports = [
  93695,
  (a, b, c) => {
    b.exports = a.x("next/dist/shared/lib/no-fallback-error.external.js", () =>
      require("next/dist/shared/lib/no-fallback-error.external.js"),
    );
  },
  10585,
  (a) => {
    a.v(
      "/_next/static/media/favicon.2vob68tjqpejf.ico" +
        (globalThis.NEXT_CLIENT_ASSET_SUFFIX || ""),
    );
  },
  68611,
  (a) => {
    "use strict";
    let b = { src: a.i(10585).default, width: 256, height: 256 };
    a.s(["default", 0, b]);
  },
  36962,
  (a) => {
    "use strict";
    a.s(["AuthTabs", () => b]);
    let b = (0, a.i(11857).registerClientReference)(
      function () {
        throw Error(
          "Attempted to call AuthTabs() from the server but AuthTabs is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
        );
      },
      "[project]/src/components/auth/AuthTabs.tsx <module evaluation>",
      "AuthTabs",
    );
  },
  23787,
  (a) => {
    "use strict";
    a.s(["AuthTabs", () => b]);
    let b = (0, a.i(11857).registerClientReference)(
      function () {
        throw Error(
          "Attempted to call AuthTabs() from the server but AuthTabs is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
        );
      },
      "[project]/src/components/auth/AuthTabs.tsx",
      "AuthTabs",
    );
  },
  32919,
  (a) => {
    "use strict";
    a.i(36962);
    var b = a.i(23787);
    a.n(b);
  },
  9034,
  (a) => {
    "use strict";
    var b = a.i(7997),
      c = a.i(32919),
      d = a.i(39138);
    function e({ className: a, size: c = "default", ...f }) {
      return (0, b.jsx)("div", {
        "data-slot": "card",
        "data-size": c,
        className: (0, d.cn)(
          "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
          a,
        ),
        ...f,
      });
    }
    function f({ className: a, ...c }) {
      return (0, b.jsx)("div", {
        "data-slot": "card-header",
        className: (0, d.cn)(
          "group/card-header @container/card-header grid auto-rows-min items-start gap-2 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
          a,
        ),
        ...c,
      });
    }
    function g({ className: a, ...c }) {
      return (0, b.jsx)("div", {
        "data-slot": "card-title",
        className: (0, d.cn)("text-base font-medium", a),
        ...c,
      });
    }
    function h({ className: a, ...c }) {
      return (0, b.jsx)("div", {
        "data-slot": "card-description",
        className: (0, d.cn)("text-sm text-muted-foreground", a),
        ...c,
      });
    }
    function i({ className: a, ...c }) {
      return (0, b.jsx)("div", {
        "data-slot": "card-content",
        className: (0, d.cn)("px-(--card-spacing)", a),
        ...c,
      });
    }
    async function j({ searchParams: a }) {
      let { tab: d } = await a;
      return (0, b.jsx)("div", {
        className:
          "min-h-screen flex items-center justify-center bg-background px-4",
        children: (0, b.jsxs)(e, {
          className: "w-full max-w-md",
          children: [
            (0, b.jsxs)(f, {
              className: "space-y-1",
              children: [
                (0, b.jsx)(g, {
                  className: "text-2xl font-bold text-center",
                  children: "Welcome to VectorMatch",
                }),
                (0, b.jsx)(h, {
                  className: "text-center",
                  children: "Sign in to your account or create a new one",
                }),
              ],
            }),
            (0, b.jsx)(i, {
              children: (0, b.jsx)(c.AuthTabs, {
                defaultTab: "signup" === d ? "signup" : "signin",
              }),
            }),
          ],
        }),
      });
    }
    a.s(["default", 0, j], 9034);
  },
  9968,
  (a) => {
    a.n(a.i(9034));
  },
];

//# sourceMappingURL=%5Broot-of-the-server%5D__16pdkz3._.js.map
