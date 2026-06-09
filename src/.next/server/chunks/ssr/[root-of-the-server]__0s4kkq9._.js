module.exports = [
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
  22240,
  (a) =>
    a.a(async (b, c) => {
      try {
        let b = await a.y("better-auth-7619253b5b4ed814");
        a.n(b), c();
      } catch (a) {
        c(a);
      }
    }, !0),
  28500,
  (a) =>
    a.a(async (b, c) => {
      try {
        let b = await a.y("better-auth-7619253b5b4ed814/adapters/drizzle");
        a.n(b), c();
      } catch (a) {
        c(a);
      }
    }, !0),
  39235,
  (a) =>
    a.a(async (b, c) => {
      try {
        let b = await a.y("better-auth-7619253b5b4ed814/next-js");
        a.n(b), c();
      } catch (a) {
        c(a);
      }
    }, !0),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0s4kkq9._.js.map
