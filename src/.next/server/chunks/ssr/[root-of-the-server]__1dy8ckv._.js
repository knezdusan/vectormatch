module.exports = [
  93695,
  (a, b, c) => {
    b.exports = a.x("next/dist/shared/lib/no-fallback-error.external.js", () =>
      require("next/dist/shared/lib/no-fallback-error.external.js"),
    );
  },
  50640,
  (a, b, c) => {
    "use strict";
    Object.defineProperty(c, "__esModule", { value: !0 }),
      Object.defineProperty(c, "InvariantError", {
        enumerable: !0,
        get: function () {
          return d;
        },
      });
    class d extends Error {
      constructor(a, b) {
        super(
          `Invariant: ${a.endsWith(".") ? a : a + "."} This is a bug in Next.js.`,
          b,
        ),
          (this.name = "InvariantError");
      }
    }
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
  2543,
  (a) =>
    a.a(async (b, c) => {
      try {
        let b = await a.y("better-auth-7619253b5b4ed814/react");
        a.n(b), c();
      } catch (a) {
        c(a);
      }
    }, !0),
  68681,
  (a) =>
    a.a(async (b, c) => {
      try {
        var d = a.i(2543),
          e = b([d]);
        [d] = e.then ? (await e)() : e;
        let f = (0, d.createAuthClient)();
        a.s(["authClient", 0, f]), c();
      } catch (a) {
        c(a);
      }
    }, !1),
  99123,
  (a) =>
    a.a(async (b, c) => {
      try {
        var d = a.i(7997);
        a.i(70396);
        var e = a.i(73727),
          f = a.i(68681),
          g = b([f]);
        async function h() {
          let a = await f.authClient.getSession({
            fetchOptions: { onSuccess: () => {}, onError: () => {} },
          });
          return (
            a.data || (0, e.redirect)("/auth"),
            (0, d.jsx)("div", {
              className:
                "min-h-screen flex items-center justify-center bg-background",
              children: (0, d.jsxs)("div", {
                className: "text-center space-y-4",
                children: [
                  (0, d.jsx)("h1", {
                    className: "text-2xl font-bold",
                    children: "Welcome to Dashboard",
                  }),
                  (0, d.jsxs)("p", {
                    className: "text-muted-foreground",
                    children: ["Logged in as: ", a.data.user.email],
                  }),
                  (0, d.jsxs)("p", {
                    className: "text-sm text-muted-foreground",
                    children: ["Name: ", a.data.user.name],
                  }),
                  (0, d.jsx)("form", {
                    action: "/api/auth/sign-out",
                    method: "POST",
                    children: (0, d.jsx)("button", {
                      type: "submit",
                      className:
                        "rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90",
                      children: "Sign Out",
                    }),
                  }),
                ],
              }),
            })
          );
        }
        ([f] = g.then ? (await g)() : g), a.s(["default", 0, h]), c();
      } catch (a) {
        c(a);
      }
    }, !1),
  62514,
  (a) => {
    a.n(a.i(99123));
  },
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1dy8ckv._.js.map
