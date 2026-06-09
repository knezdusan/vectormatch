module.exports = [
  28285,
  (e) => {
    "use strict";
    let t, i, r, n;
    var s,
      a,
      o,
      u,
      l,
      c,
      d,
      f,
      h,
      p,
      m,
      g,
      v,
      y = Object.create,
      b = Object.defineProperty,
      _ = Object.getOwnPropertyDescriptor,
      $ = Object.getOwnPropertyNames,
      x = Object.getPrototypeOf,
      w = Object.prototype.hasOwnProperty,
      S = (e, t) => b(e, "name", { value: t, configurable: !0 }),
      k = (e, t) => () => (e && (t = e((e = 0))), t),
      I = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports),
      E = (e, t) => {
        for (var i in t) b(e, i, { get: t[i], enumerable: !0 });
      },
      P = (e, t, i, r) => {
        if ((t && "object" == typeof t) || "function" == typeof t)
          for (let n of $(t))
            w.call(e, n) ||
              n === i ||
              b(e, n, {
                get: () => t[n],
                enumerable: !(r = _(t, n)) || r.enumerable,
              });
        return e;
      },
      N = (e, t, i) => (
        (i = null != e ? y(x(e)) : {}),
        P(
          !t && e && e.__esModule
            ? i
            : b(i, "default", { value: e, enumerable: !0 }),
          e,
        )
      ),
      T = (e) => P(b({}, "__esModule", { value: !0 }), e),
      O = (e, t, i) => {
        let r;
        return (r = "symbol" != typeof t ? t + "" : t) in e
          ? b(e, r, {
              enumerable: !0,
              configurable: !0,
              writable: !0,
              value: i,
            })
          : (e[r] = i);
      },
      z = I((e) => {
        D(), (e.byteLength = u), (e.toByteArray = c), (e.fromByteArray = h);
        var t,
          i,
          r = [],
          n = [],
          s = "u" > typeof Uint8Array ? Uint8Array : Array,
          a =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (t = 0, i = a.length; t < i; ++t)
          (r[t] = a[t]), (n[a.charCodeAt(t)] = t);
        function o(e) {
          var t = e.length;
          if (t % 4 > 0)
            throw Error("Invalid string. Length must be a multiple of 4");
          var i = e.indexOf("=");
          -1 === i && (i = t);
          var r = i === t ? 0 : 4 - (i % 4);
          return [i, r];
        }
        function u(e) {
          var t = o(e),
            i = t[0],
            r = t[1];
          return ((i + r) * 3) / 4 - r;
        }
        function l(e, t, i) {
          return ((t + i) * 3) / 4 - i;
        }
        function c(e) {
          var t,
            i,
            r = o(e),
            a = r[0],
            u = r[1],
            c = new s(l(e, a, u)),
            d = 0,
            f = u > 0 ? a - 4 : a;
          for (i = 0; i < f; i += 4)
            (t =
              (n[e.charCodeAt(i)] << 18) |
              (n[e.charCodeAt(i + 1)] << 12) |
              (n[e.charCodeAt(i + 2)] << 6) |
              n[e.charCodeAt(i + 3)]),
              (c[d++] = (t >> 16) & 255),
              (c[d++] = (t >> 8) & 255),
              (c[d++] = 255 & t);
          return (
            2 === u &&
              ((t = (n[e.charCodeAt(i)] << 2) | (n[e.charCodeAt(i + 1)] >> 4)),
              (c[d++] = 255 & t)),
            1 === u &&
              ((t =
                (n[e.charCodeAt(i)] << 10) |
                (n[e.charCodeAt(i + 1)] << 4) |
                (n[e.charCodeAt(i + 2)] >> 2)),
              (c[d++] = (t >> 8) & 255),
              (c[d++] = 255 & t)),
            c
          );
        }
        function d(e) {
          return (
            r[(e >> 18) & 63] + r[(e >> 12) & 63] + r[(e >> 6) & 63] + r[63 & e]
          );
        }
        function f(e, t, i) {
          for (var r = [], n = t; n < i; n += 3)
            r.push(
              d(
                ((e[n] << 16) & 0xff0000) +
                  ((e[n + 1] << 8) & 65280) +
                  (255 & e[n + 2]),
              ),
            );
          return r.join("");
        }
        function h(e) {
          for (
            var t, i = e.length, n = i % 3, s = [], a = 0, o = i - n;
            a < o;
            a += 16383
          )
            s.push(f(e, a, a + 16383 > o ? o : a + 16383));
          return (
            1 === n
              ? s.push(r[(t = e[i - 1]) >> 2] + r[(t << 4) & 63] + "==")
              : 2 === n &&
                s.push(
                  r[(t = (e[i - 2] << 8) + e[i - 1]) >> 10] +
                    r[(t >> 4) & 63] +
                    r[(t << 2) & 63] +
                    "=",
                ),
            s.join("")
          );
        }
        (n[45] = 62),
          (n[95] = 63),
          S(o, "getLens"),
          S(u, "byteLength"),
          S(l, "_byteLength"),
          S(c, "toByteArray"),
          S(d, "tripletToBase64"),
          S(f, "encodeChunk"),
          S(h, "fromByteArray");
      }),
      A = I((e) => {
        D(),
          (e.read = function (e, t, i, r, n) {
            var s,
              a,
              o = 8 * n - r - 1,
              u = (1 << o) - 1,
              l = u >> 1,
              c = -7,
              d = i ? n - 1 : 0,
              f = i ? -1 : 1,
              h = e[t + d];
            for (
              d += f, s = h & ((1 << -c) - 1), h >>= -c, c += o;
              c > 0;
              s = 256 * s + e[t + d], d += f, c -= 8
            );
            for (
              a = s & ((1 << -c) - 1), s >>= -c, c += r;
              c > 0;
              a = 256 * a + e[t + d], d += f, c -= 8
            );
            if (0 === s) s = 1 - l;
            else {
              if (s === u) return a ? NaN : (1 / 0) * (h ? -1 : 1);
              (a += Math.pow(2, r)), (s -= l);
            }
            return (h ? -1 : 1) * a * Math.pow(2, s - r);
          }),
          (e.write = function (e, t, i, r, n, s) {
            var a,
              o,
              u,
              l = 8 * s - n - 1,
              c = (1 << l) - 1,
              d = c >> 1,
              f = 5960464477539062e-23 * (23 === n),
              h = r ? 0 : s - 1,
              p = r ? 1 : -1,
              m = +(t < 0 || (0 === t && 1 / t < 0));
            for (
              isNaN((t = Math.abs(t))) || t === 1 / 0
                ? ((o = +!!isNaN(t)), (a = c))
                : ((a = Math.floor(Math.log(t) / Math.LN2)),
                  t * (u = Math.pow(2, -a)) < 1 && (a--, (u *= 2)),
                  a + d >= 1 ? (t += f / u) : (t += f * Math.pow(2, 1 - d)),
                  t * u >= 2 && (a++, (u /= 2)),
                  a + d >= c
                    ? ((o = 0), (a = c))
                    : a + d >= 1
                      ? ((o = (t * u - 1) * Math.pow(2, n)), (a += d))
                      : ((o = t * Math.pow(2, d - 1) * Math.pow(2, n)),
                        (a = 0)));
              n >= 8;
              e[i + h] = 255 & o, h += p, o /= 256, n -= 8
            );
            for (
              a = (a << n) | o, l += n;
              l > 0;
              e[i + h] = 255 & a, h += p, a /= 256, l -= 8
            );
            e[i + h - p] |= 128 * m;
          });
      }),
      U = I((e) => {
        D();
        var t = z(),
          i = A(),
          r =
            "function" == typeof Symbol && "function" == typeof Symbol.for
              ? Symbol.for("nodejs.util.inspect.custom")
              : null;
        function n() {
          try {
            let e = new Uint8Array(1),
              t = {
                foo: S(function () {
                  return 42;
                }, "foo"),
              };
            return (
              Object.setPrototypeOf(t, Uint8Array.prototype),
              Object.setPrototypeOf(e, t),
              42 === e.foo()
            );
          } catch {
            return !1;
          }
        }
        function s(e) {
          if (e > 0x7fffffff)
            throw RangeError(
              'The value "' + e + '" is invalid for option "size"',
            );
          let t = new Uint8Array(e);
          return Object.setPrototypeOf(t, a.prototype), t;
        }
        function a(e, t, i) {
          if ("number" == typeof e) {
            if ("string" == typeof t)
              throw TypeError(
                'The "string" argument must be of type string. Received type number',
              );
            return c(e);
          }
          return o(e, t, i);
        }
        function o(e, t, i) {
          if ("string" == typeof e) return d(e, t);
          if (ArrayBuffer.isView(e)) return h(e);
          if (null == e)
            throw TypeError(
              "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " +
                typeof e,
            );
          if (
            ea(e, ArrayBuffer) ||
            (e && ea(e.buffer, ArrayBuffer)) ||
            ("u" > typeof SharedArrayBuffer &&
              (ea(e, SharedArrayBuffer) ||
                (e && ea(e.buffer, SharedArrayBuffer))))
          )
            return p(e, t, i);
          if ("number" == typeof e)
            throw TypeError(
              'The "value" argument must not be of type number. Received type number',
            );
          let r = e.valueOf && e.valueOf();
          if (null != r && r !== e) return a.from(r, t, i);
          let n = m(e);
          if (n) return n;
          if (
            "u" > typeof Symbol &&
            null != Symbol.toPrimitive &&
            "function" == typeof e[Symbol.toPrimitive]
          )
            return a.from(e[Symbol.toPrimitive]("string"), t, i);
          throw TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " +
              typeof e,
          );
        }
        function u(e) {
          if ("number" != typeof e)
            throw TypeError('"size" argument must be of type number');
          if (e < 0)
            throw RangeError(
              'The value "' + e + '" is invalid for option "size"',
            );
        }
        function l(e, t, i) {
          return (
            u(e),
            e <= 0
              ? s(e)
              : void 0 !== t
                ? "string" == typeof i
                  ? s(e).fill(t, i)
                  : s(e).fill(t)
                : s(e)
          );
        }
        function c(e) {
          return u(e), s(e < 0 ? 0 : 0 | g(e));
        }
        function d(e, t) {
          if (
            (("string" != typeof t || "" === t) && (t = "utf8"),
            !a.isEncoding(t))
          )
            throw TypeError("Unknown encoding: " + t);
          let i = 0 | y(e, t),
            r = s(i),
            n = r.write(e, t);
          return n !== i && (r = r.slice(0, n)), r;
        }
        function f(e) {
          let t = e.length < 0 ? 0 : 0 | g(e.length),
            i = s(t);
          for (let r = 0; r < t; r += 1) i[r] = 255 & e[r];
          return i;
        }
        function h(e) {
          if (ea(e, Uint8Array)) {
            let t = new Uint8Array(e);
            return p(t.buffer, t.byteOffset, t.byteLength);
          }
          return f(e);
        }
        function p(e, t, i) {
          let r;
          if (t < 0 || e.byteLength < t)
            throw RangeError('"offset" is outside of buffer bounds');
          if (e.byteLength < t + (i || 0))
            throw RangeError('"length" is outside of buffer bounds');
          return (
            Object.setPrototypeOf(
              (r =
                void 0 === t && void 0 === i
                  ? new Uint8Array(e)
                  : void 0 === i
                    ? new Uint8Array(e, t)
                    : new Uint8Array(e, t, i)),
              a.prototype,
            ),
            r
          );
        }
        function m(e) {
          if (a.isBuffer(e)) {
            let t = 0 | g(e.length),
              i = s(t);
            return 0 === i.length || e.copy(i, 0, 0, t), i;
          }
          return void 0 !== e.length
            ? "number" != typeof e.length || eo(e.length)
              ? s(0)
              : f(e)
            : "Buffer" === e.type && Array.isArray(e.data)
              ? f(e.data)
              : void 0;
        }
        function g(e) {
          if (e >= 0x7fffffff)
            throw RangeError(
              "Attempt to allocate Buffer larger than maximum size: 0x7fffffff bytes",
            );
          return 0 | e;
        }
        function v(e) {
          return +e != e && (e = 0), a.alloc(+e);
        }
        function y(e, t) {
          if (a.isBuffer(e)) return e.length;
          if (ArrayBuffer.isView(e) || ea(e, ArrayBuffer)) return e.byteLength;
          if ("string" != typeof e)
            throw TypeError(
              'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' +
                typeof e,
            );
          let i = e.length,
            r = arguments.length > 2 && !0 === arguments[2];
          if (!r && 0 === i) return 0;
          let n = !1;
          for (;;)
            switch (t) {
              case "ascii":
              case "latin1":
              case "binary":
                return i;
              case "utf8":
              case "utf-8":
                return et(e).length;
              case "ucs2":
              case "ucs-2":
              case "utf16le":
              case "utf-16le":
                return 2 * i;
              case "hex":
                return i >>> 1;
              case "base64":
                return en(e).length;
              default:
                if (n) return r ? -1 : et(e).length;
                (t = ("" + t).toLowerCase()), (n = !0);
            }
        }
        function b(e, t, i) {
          let r = !1;
          if (
            ((void 0 === t || t < 0) && (t = 0),
            t > this.length ||
              ((void 0 === i || i > this.length) && (i = this.length),
              i <= 0) ||
              (i >>>= 0) <= (t >>>= 0))
          )
            return "";
          for (e || (e = "utf8"); ; )
            switch (e) {
              case "hex":
                return j(this, t, i);
              case "utf8":
              case "utf-8":
                return T(this, t, i);
              case "ascii":
                return U(this, t, i);
              case "latin1":
              case "binary":
                return C(this, t, i);
              case "base64":
                return N(this, t, i);
              case "ucs2":
              case "ucs-2":
              case "utf16le":
              case "utf-16le":
                return Z(this, t, i);
              default:
                if (r) throw TypeError("Unknown encoding: " + e);
                (e = (e + "").toLowerCase()), (r = !0);
            }
        }
        function _(e, t, i) {
          let r = e[t];
          (e[t] = e[i]), (e[i] = r);
        }
        function $(e, t, i, r, n) {
          if (0 === e.length) return -1;
          if (
            ("string" == typeof i
              ? ((r = i), (i = 0))
              : i > 0x7fffffff
                ? (i = 0x7fffffff)
                : i < -0x80000000 && (i = -0x80000000),
            eo((i *= 1)) && (i = n ? 0 : e.length - 1),
            i < 0 && (i = e.length + i),
            i >= e.length)
          ) {
            if (n) return -1;
            i = e.length - 1;
          } else if (i < 0)
            if (!n) return -1;
            else i = 0;
          if (("string" == typeof t && (t = a.from(t, r)), a.isBuffer(t)))
            return 0 === t.length ? -1 : x(e, t, i, r, n);
          if ("number" == typeof t)
            return (
              (t &= 255),
              "function" == typeof Uint8Array.prototype.indexOf
                ? n
                  ? Uint8Array.prototype.indexOf.call(e, t, i)
                  : Uint8Array.prototype.lastIndexOf.call(e, t, i)
                : x(e, [t], i, r, n)
            );
          throw TypeError("val must be string, number or Buffer");
        }
        function x(e, t, i, r, n) {
          let s,
            a = 1,
            o = e.length,
            u = t.length;
          if (
            void 0 !== r &&
            ("ucs2" === (r = String(r).toLowerCase()) ||
              "ucs-2" === r ||
              "utf16le" === r ||
              "utf-16le" === r)
          ) {
            if (e.length < 2 || t.length < 2) return -1;
            (a = 2), (o /= 2), (u /= 2), (i /= 2);
          }
          function l(e, t) {
            return 1 === a ? e[t] : e.readUInt16BE(t * a);
          }
          if ((S(l, "read"), n)) {
            let r = -1;
            for (s = i; s < o; s++)
              if (l(e, s) === l(t, -1 === r ? 0 : s - r)) {
                if ((-1 === r && (r = s), s - r + 1 === u)) return r * a;
              } else -1 !== r && (s -= s - r), (r = -1);
          } else
            for (i + u > o && (i = o - u), s = i; s >= 0; s--) {
              let i = !0;
              for (let r = 0; r < u; r++)
                if (l(e, s + r) !== l(t, r)) {
                  i = !1;
                  break;
                }
              if (i) return s;
            }
          return -1;
        }
        function w(e, t, i, r) {
          let n;
          i = Number(i) || 0;
          let s = e.length - i;
          r ? (r = Number(r)) > s && (r = s) : (r = s);
          let a = t.length;
          for (r > a / 2 && (r = a / 2), n = 0; n < r; ++n) {
            let r = parseInt(t.substr(2 * n, 2), 16);
            if (eo(r)) break;
            e[i + n] = r;
          }
          return n;
        }
        function k(e, t, i, r) {
          return es(et(t, e.length - i), e, i, r);
        }
        function I(e, t, i, r) {
          return es(ei(t), e, i, r);
        }
        function E(e, t, i, r) {
          return es(en(t), e, i, r);
        }
        function P(e, t, i, r) {
          return es(er(t, e.length - i), e, i, r);
        }
        function N(e, i, r) {
          return 0 === i && r === e.length
            ? t.fromByteArray(e)
            : t.fromByteArray(e.slice(i, r));
        }
        function T(e, t, i) {
          i = Math.min(e.length, i);
          let r = [],
            n = t;
          for (; n < i; ) {
            let t = e[n],
              s = null,
              a = t > 239 ? 4 : t > 223 ? 3 : t > 191 ? 2 : 1;
            if (n + a <= i) {
              let i, r, o, u;
              switch (a) {
                case 1:
                  t < 128 && (s = t);
                  break;
                case 2:
                  (192 & (i = e[n + 1])) == 128 &&
                    (u = ((31 & t) << 6) | (63 & i)) > 127 &&
                    (s = u);
                  break;
                case 3:
                  (i = e[n + 1]),
                    (r = e[n + 2]),
                    (192 & i) == 128 &&
                      (192 & r) == 128 &&
                      (u = ((15 & t) << 12) | ((63 & i) << 6) | (63 & r)) >
                        2047 &&
                      (u < 55296 || u > 57343) &&
                      (s = u);
                  break;
                case 4:
                  (i = e[n + 1]),
                    (r = e[n + 2]),
                    (o = e[n + 3]),
                    (192 & i) == 128 &&
                      (192 & r) == 128 &&
                      (192 & o) == 128 &&
                      (u =
                        ((15 & t) << 18) |
                        ((63 & i) << 12) |
                        ((63 & r) << 6) |
                        (63 & o)) > 65535 &&
                      u < 1114112 &&
                      (s = u);
              }
            }
            null === s
              ? ((s = 65533), (a = 1))
              : s > 65535 &&
                ((s -= 65536),
                r.push(((s >>> 10) & 1023) | 55296),
                (s = 56320 | (1023 & s))),
              r.push(s),
              (n += a);
          }
          return O(r);
        }
        function O(e) {
          let t = e.length;
          if (t <= 4096) return String.fromCharCode.apply(String, e);
          let i = "",
            r = 0;
          for (; r < t; )
            i += String.fromCharCode.apply(String, e.slice(r, (r += 4096)));
          return i;
        }
        function U(e, t, i) {
          let r = "";
          i = Math.min(e.length, i);
          for (let n = t; n < i; ++n) r += String.fromCharCode(127 & e[n]);
          return r;
        }
        function C(e, t, i) {
          let r = "";
          i = Math.min(e.length, i);
          for (let n = t; n < i; ++n) r += String.fromCharCode(e[n]);
          return r;
        }
        function j(e, t, i) {
          let r = e.length;
          (!t || t < 0) && (t = 0), (!i || i < 0 || i > r) && (i = r);
          let n = "";
          for (let r = t; r < i; ++r) n += eu[e[r]];
          return n;
        }
        function Z(e, t, i) {
          let r = e.slice(t, i),
            n = "";
          for (let e = 0; e < r.length - 1; e += 2)
            n += String.fromCharCode(r[e] + 256 * r[e + 1]);
          return n;
        }
        function L(e, t, i) {
          if (e % 1 != 0 || e < 0) throw RangeError("offset is not uint");
          if (e + t > i)
            throw RangeError("Trying to access beyond buffer length");
        }
        function R(e, t, i, r, n, s) {
          if (!a.isBuffer(e))
            throw TypeError('"buffer" argument must be a Buffer instance');
          if (t > n || t < s)
            throw RangeError('"value" argument is out of bounds');
          if (i + r > e.length) throw RangeError("Index out of range");
        }
        function M(e, t, i, r, n) {
          K(t, r, n, e, i, 7);
          let s = Number(t & BigInt(0xffffffff));
          (e[i++] = s),
            (s >>= 8),
            (e[i++] = s),
            (s >>= 8),
            (e[i++] = s),
            (s >>= 8),
            (e[i++] = s);
          let a = Number((t >> BigInt(32)) & BigInt(0xffffffff));
          return (
            (e[i++] = a),
            (a >>= 8),
            (e[i++] = a),
            (a >>= 8),
            (e[i++] = a),
            (a >>= 8),
            (e[i++] = a),
            i
          );
        }
        function B(e, t, i, r, n) {
          K(t, r, n, e, i, 7);
          let s = Number(t & BigInt(0xffffffff));
          (e[i + 7] = s),
            (s >>= 8),
            (e[i + 6] = s),
            (s >>= 8),
            (e[i + 5] = s),
            (s >>= 8),
            (e[i + 4] = s);
          let a = Number((t >> BigInt(32)) & BigInt(0xffffffff));
          return (
            (e[i + 3] = a),
            (a >>= 8),
            (e[i + 2] = a),
            (a >>= 8),
            (e[i + 1] = a),
            (a >>= 8),
            (e[i] = a),
            i + 8
          );
        }
        function F(e, t, i, r, n, s) {
          if (i + r > e.length || i < 0) throw RangeError("Index out of range");
        }
        function q(e, t, r, n, s) {
          return (
            (t *= 1),
            (r >>>= 0),
            s || F(e, t, r, 4, 34028234663852886e22, -34028234663852886e22),
            i.write(e, t, r, n, 23, 4),
            r + 4
          );
        }
        function Q(e, t, r, n, s) {
          return (
            (t *= 1),
            (r >>>= 0),
            s || F(e, t, r, 8, 17976931348623157e292, -17976931348623157e292),
            i.write(e, t, r, n, 52, 8),
            r + 8
          );
        }
        (e.Buffer = a),
          (e.SlowBuffer = v),
          (e.INSPECT_MAX_BYTES = 50),
          (e.kMaxLength = 0x7fffffff),
          (a.TYPED_ARRAY_SUPPORT = n()),
          !a.TYPED_ARRAY_SUPPORT &&
            "u" > typeof console &&
            "function" == typeof console.error &&
            console.error(
              "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.",
            ),
          S(n, "typedArraySupport"),
          Object.defineProperty(a.prototype, "parent", {
            enumerable: !0,
            get: S(function () {
              if (a.isBuffer(this)) return this.buffer;
            }, "get"),
          }),
          Object.defineProperty(a.prototype, "offset", {
            enumerable: !0,
            get: S(function () {
              if (a.isBuffer(this)) return this.byteOffset;
            }, "get"),
          }),
          S(s, "createBuffer"),
          S(a, "Buffer"),
          (a.poolSize = 8192),
          S(o, "from"),
          (a.from = function (e, t, i) {
            return o(e, t, i);
          }),
          Object.setPrototypeOf(a.prototype, Uint8Array.prototype),
          Object.setPrototypeOf(a, Uint8Array),
          S(u, "assertSize"),
          S(l, "alloc"),
          (a.alloc = function (e, t, i) {
            return l(e, t, i);
          }),
          S(c, "allocUnsafe"),
          (a.allocUnsafe = function (e) {
            return c(e);
          }),
          (a.allocUnsafeSlow = function (e) {
            return c(e);
          }),
          S(d, "fromString"),
          S(f, "fromArrayLike"),
          S(h, "fromArrayView"),
          S(p, "fromArrayBuffer"),
          S(m, "fromObject"),
          S(g, "checked"),
          S(v, "SlowBuffer"),
          (a.isBuffer = S(function (e) {
            return null != e && !0 === e._isBuffer && e !== a.prototype;
          }, "isBuffer")),
          (a.compare = S(function (e, t) {
            if (
              (ea(e, Uint8Array) && (e = a.from(e, e.offset, e.byteLength)),
              ea(t, Uint8Array) && (t = a.from(t, t.offset, t.byteLength)),
              !a.isBuffer(e) || !a.isBuffer(t))
            )
              throw TypeError(
                'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array',
              );
            if (e === t) return 0;
            let i = e.length,
              r = t.length;
            for (let n = 0, s = Math.min(i, r); n < s; ++n)
              if (e[n] !== t[n]) {
                (i = e[n]), (r = t[n]);
                break;
              }
            return i < r ? -1 : +(r < i);
          }, "compare")),
          (a.isEncoding = S(function (e) {
            switch (String(e).toLowerCase()) {
              case "hex":
              case "utf8":
              case "utf-8":
              case "ascii":
              case "latin1":
              case "binary":
              case "base64":
              case "ucs2":
              case "ucs-2":
              case "utf16le":
              case "utf-16le":
                return !0;
              default:
                return !1;
            }
          }, "isEncoding")),
          (a.concat = S(function (e, t) {
            let i;
            if (!Array.isArray(e))
              throw TypeError('"list" argument must be an Array of Buffers');
            if (0 === e.length) return a.alloc(0);
            if (void 0 === t)
              for (t = 0, i = 0; i < e.length; ++i) t += e[i].length;
            let r = a.allocUnsafe(t),
              n = 0;
            for (i = 0; i < e.length; ++i) {
              let t = e[i];
              if (ea(t, Uint8Array))
                n + t.length > r.length
                  ? (a.isBuffer(t) || (t = a.from(t)), t.copy(r, n))
                  : Uint8Array.prototype.set.call(r, t, n);
              else if (a.isBuffer(t)) t.copy(r, n);
              else
                throw TypeError('"list" argument must be an Array of Buffers');
              n += t.length;
            }
            return r;
          }, "concat")),
          S(y, "byteLength"),
          (a.byteLength = y),
          S(b, "slowToString"),
          (a.prototype._isBuffer = !0),
          S(_, "swap"),
          (a.prototype.swap16 = S(function () {
            let e = this.length;
            if (e % 2 != 0)
              throw RangeError("Buffer size must be a multiple of 16-bits");
            for (let t = 0; t < e; t += 2) _(this, t, t + 1);
            return this;
          }, "swap16")),
          (a.prototype.swap32 = S(function () {
            let e = this.length;
            if (e % 4 != 0)
              throw RangeError("Buffer size must be a multiple of 32-bits");
            for (let t = 0; t < e; t += 4)
              _(this, t, t + 3), _(this, t + 1, t + 2);
            return this;
          }, "swap32")),
          (a.prototype.swap64 = S(function () {
            let e = this.length;
            if (e % 8 != 0)
              throw RangeError("Buffer size must be a multiple of 64-bits");
            for (let t = 0; t < e; t += 8)
              _(this, t, t + 7),
                _(this, t + 1, t + 6),
                _(this, t + 2, t + 5),
                _(this, t + 3, t + 4);
            return this;
          }, "swap64")),
          (a.prototype.toString = S(function () {
            let e = this.length;
            return 0 === e
              ? ""
              : 0 == arguments.length
                ? T(this, 0, e)
                : b.apply(this, arguments);
          }, "toString")),
          (a.prototype.toLocaleString = a.prototype.toString),
          (a.prototype.equals = S(function (e) {
            if (!a.isBuffer(e)) throw TypeError("Argument must be a Buffer");
            return this === e || 0 === a.compare(this, e);
          }, "equals")),
          (a.prototype.inspect = S(function () {
            let t = "",
              i = e.INSPECT_MAX_BYTES;
            return (
              (t = this.toString("hex", 0, i)
                .replace(/(.{2})/g, "$1 ")
                .trim()),
              this.length > i && (t += " ... "),
              "<Buffer " + t + ">"
            );
          }, "inspect")),
          r && (a.prototype[r] = a.prototype.inspect),
          (a.prototype.compare = S(function (e, t, i, r, n) {
            if (
              (ea(e, Uint8Array) && (e = a.from(e, e.offset, e.byteLength)),
              !a.isBuffer(e))
            )
              throw TypeError(
                'The "target" argument must be one of type Buffer or Uint8Array. Received type ' +
                  typeof e,
              );
            if (
              (void 0 === t && (t = 0),
              void 0 === i && (i = e ? e.length : 0),
              void 0 === r && (r = 0),
              void 0 === n && (n = this.length),
              t < 0 || i > e.length || r < 0 || n > this.length)
            )
              throw RangeError("out of range index");
            if (r >= n && t >= i) return 0;
            if (r >= n) return -1;
            if (t >= i) return 1;
            if (((t >>>= 0), (i >>>= 0), (r >>>= 0), (n >>>= 0), this === e))
              return 0;
            let s = n - r,
              o = i - t,
              u = Math.min(s, o),
              l = this.slice(r, n),
              c = e.slice(t, i);
            for (let e = 0; e < u; ++e)
              if (l[e] !== c[e]) {
                (s = l[e]), (o = c[e]);
                break;
              }
            return s < o ? -1 : +(o < s);
          }, "compare")),
          S($, "bidirectionalIndexOf"),
          S(x, "arrayIndexOf"),
          (a.prototype.includes = S(function (e, t, i) {
            return -1 !== this.indexOf(e, t, i);
          }, "includes")),
          (a.prototype.indexOf = S(function (e, t, i) {
            return $(this, e, t, i, !0);
          }, "indexOf")),
          (a.prototype.lastIndexOf = S(function (e, t, i) {
            return $(this, e, t, i, !1);
          }, "lastIndexOf")),
          S(w, "hexWrite"),
          S(k, "utf8Write"),
          S(I, "asciiWrite"),
          S(E, "base64Write"),
          S(P, "ucs2Write"),
          (a.prototype.write = S(function (e, t, i, r) {
            if (void 0 === t) (r = "utf8"), (i = this.length), (t = 0);
            else if (void 0 === i && "string" == typeof t)
              (r = t), (i = this.length), (t = 0);
            else if (isFinite(t))
              (t >>>= 0),
                isFinite(i)
                  ? ((i >>>= 0), void 0 === r && (r = "utf8"))
                  : ((r = i), (i = void 0));
            else
              throw Error(
                "Buffer.write(string, encoding, offset[, length]) is no longer supported",
              );
            let n = this.length - t;
            if (
              ((void 0 === i || i > n) && (i = n),
              (e.length > 0 && (i < 0 || t < 0)) || t > this.length)
            )
              throw RangeError("Attempt to write outside buffer bounds");
            r || (r = "utf8");
            let s = !1;
            for (;;)
              switch (r) {
                case "hex":
                  return w(this, e, t, i);
                case "utf8":
                case "utf-8":
                  return k(this, e, t, i);
                case "ascii":
                case "latin1":
                case "binary":
                  return I(this, e, t, i);
                case "base64":
                  return E(this, e, t, i);
                case "ucs2":
                case "ucs-2":
                case "utf16le":
                case "utf-16le":
                  return P(this, e, t, i);
                default:
                  if (s) throw TypeError("Unknown encoding: " + r);
                  (r = ("" + r).toLowerCase()), (s = !0);
              }
          }, "write")),
          (a.prototype.toJSON = S(function () {
            return {
              type: "Buffer",
              data: Array.prototype.slice.call(this._arr || this, 0),
            };
          }, "toJSON")),
          S(N, "base64Slice"),
          S(T, "utf8Slice"),
          S(O, "decodeCodePointsArray"),
          S(U, "asciiSlice"),
          S(C, "latin1Slice"),
          S(j, "hexSlice"),
          S(Z, "utf16leSlice"),
          (a.prototype.slice = S(function (e, t) {
            let i = this.length;
            (e = ~~e),
              (t = void 0 === t ? i : ~~t),
              e < 0 ? (e += i) < 0 && (e = 0) : e > i && (e = i),
              t < 0 ? (t += i) < 0 && (t = 0) : t > i && (t = i),
              t < e && (t = e);
            let r = this.subarray(e, t);
            return Object.setPrototypeOf(r, a.prototype), r;
          }, "slice")),
          S(L, "checkOffset"),
          (a.prototype.readUintLE = a.prototype.readUIntLE =
            S(function (e, t, i) {
              (e >>>= 0), (t >>>= 0), i || L(e, t, this.length);
              let r = this[e],
                n = 1,
                s = 0;
              for (; ++s < t && (n *= 256); ) r += this[e + s] * n;
              return r;
            }, "readUIntLE")),
          (a.prototype.readUintBE = a.prototype.readUIntBE =
            S(function (e, t, i) {
              (e >>>= 0), (t >>>= 0), i || L(e, t, this.length);
              let r = this[e + --t],
                n = 1;
              for (; t > 0 && (n *= 256); ) r += this[e + --t] * n;
              return r;
            }, "readUIntBE")),
          (a.prototype.readUint8 = a.prototype.readUInt8 =
            S(function (e, t) {
              return (e >>>= 0), t || L(e, 1, this.length), this[e];
            }, "readUInt8")),
          (a.prototype.readUint16LE = a.prototype.readUInt16LE =
            S(function (e, t) {
              return (
                (e >>>= 0),
                t || L(e, 2, this.length),
                this[e] | (this[e + 1] << 8)
              );
            }, "readUInt16LE")),
          (a.prototype.readUint16BE = a.prototype.readUInt16BE =
            S(function (e, t) {
              return (
                (e >>>= 0),
                t || L(e, 2, this.length),
                (this[e] << 8) | this[e + 1]
              );
            }, "readUInt16BE")),
          (a.prototype.readUint32LE = a.prototype.readUInt32LE =
            S(function (e, t) {
              return (
                (e >>>= 0),
                t || L(e, 4, this.length),
                (this[e] | (this[e + 1] << 8) | (this[e + 2] << 16)) +
                  0x1000000 * this[e + 3]
              );
            }, "readUInt32LE")),
          (a.prototype.readUint32BE = a.prototype.readUInt32BE =
            S(function (e, t) {
              return (
                (e >>>= 0),
                t || L(e, 4, this.length),
                0x1000000 * this[e] +
                  ((this[e + 1] << 16) | (this[e + 2] << 8) | this[e + 3])
              );
            }, "readUInt32BE")),
          (a.prototype.readBigUInt64LE = el(
            S(function (e) {
              X((e >>>= 0), "offset");
              let t = this[e],
                i = this[e + 7];
              (void 0 === t || void 0 === i) && H(e, this.length - 8);
              let r =
                  t +
                  256 * this[++e] +
                  65536 * this[++e] +
                  0x1000000 * this[++e],
                n =
                  this[++e] +
                  256 * this[++e] +
                  65536 * this[++e] +
                  0x1000000 * i;
              return BigInt(r) + (BigInt(n) << BigInt(32));
            }, "readBigUInt64LE"),
          )),
          (a.prototype.readBigUInt64BE = el(
            S(function (e) {
              X((e >>>= 0), "offset");
              let t = this[e],
                i = this[e + 7];
              (void 0 === t || void 0 === i) && H(e, this.length - 8);
              let r =
                  0x1000000 * t +
                  65536 * this[++e] +
                  256 * this[++e] +
                  this[++e],
                n =
                  0x1000000 * this[++e] +
                  65536 * this[++e] +
                  256 * this[++e] +
                  i;
              return (BigInt(r) << BigInt(32)) + BigInt(n);
            }, "readBigUInt64BE"),
          )),
          (a.prototype.readIntLE = S(function (e, t, i) {
            (e >>>= 0), (t >>>= 0), i || L(e, t, this.length);
            let r = this[e],
              n = 1,
              s = 0;
            for (; ++s < t && (n *= 256); ) r += this[e + s] * n;
            return r >= (n *= 128) && (r -= Math.pow(2, 8 * t)), r;
          }, "readIntLE")),
          (a.prototype.readIntBE = S(function (e, t, i) {
            (e >>>= 0), (t >>>= 0), i || L(e, t, this.length);
            let r = t,
              n = 1,
              s = this[e + --r];
            for (; r > 0 && (n *= 256); ) s += this[e + --r] * n;
            return s >= (n *= 128) && (s -= Math.pow(2, 8 * t)), s;
          }, "readIntBE")),
          (a.prototype.readInt8 = S(function (e, t) {
            return (
              (e >>>= 0),
              t || L(e, 1, this.length),
              128 & this[e] ? -((255 - this[e] + 1) * 1) : this[e]
            );
          }, "readInt8")),
          (a.prototype.readInt16LE = S(function (e, t) {
            (e >>>= 0), t || L(e, 2, this.length);
            let i = this[e] | (this[e + 1] << 8);
            return 32768 & i ? 0xffff0000 | i : i;
          }, "readInt16LE")),
          (a.prototype.readInt16BE = S(function (e, t) {
            (e >>>= 0), t || L(e, 2, this.length);
            let i = this[e + 1] | (this[e] << 8);
            return 32768 & i ? 0xffff0000 | i : i;
          }, "readInt16BE")),
          (a.prototype.readInt32LE = S(function (e, t) {
            return (
              (e >>>= 0),
              t || L(e, 4, this.length),
              this[e] |
                (this[e + 1] << 8) |
                (this[e + 2] << 16) |
                (this[e + 3] << 24)
            );
          }, "readInt32LE")),
          (a.prototype.readInt32BE = S(function (e, t) {
            return (
              (e >>>= 0),
              t || L(e, 4, this.length),
              (this[e] << 24) |
                (this[e + 1] << 16) |
                (this[e + 2] << 8) |
                this[e + 3]
            );
          }, "readInt32BE")),
          (a.prototype.readBigInt64LE = el(
            S(function (e) {
              X((e >>>= 0), "offset");
              let t = this[e],
                i = this[e + 7];
              return (
                (void 0 === t || void 0 === i) && H(e, this.length - 8),
                (BigInt(
                  this[e + 4] +
                    256 * this[e + 5] +
                    65536 * this[e + 6] +
                    (i << 24),
                ) <<
                  BigInt(32)) +
                  BigInt(
                    t +
                      256 * this[++e] +
                      65536 * this[++e] +
                      0x1000000 * this[++e],
                  )
              );
            }, "readBigInt64LE"),
          )),
          (a.prototype.readBigInt64BE = el(
            S(function (e) {
              X((e >>>= 0), "offset");
              let t = this[e],
                i = this[e + 7];
              return (
                (void 0 === t || void 0 === i) && H(e, this.length - 8),
                (BigInt(
                  (t << 24) + 65536 * this[++e] + 256 * this[++e] + this[++e],
                ) <<
                  BigInt(32)) +
                  BigInt(
                    0x1000000 * this[++e] +
                      65536 * this[++e] +
                      256 * this[++e] +
                      i,
                  )
              );
            }, "readBigInt64BE"),
          )),
          (a.prototype.readFloatLE = S(function (e, t) {
            return (
              (e >>>= 0), t || L(e, 4, this.length), i.read(this, e, !0, 23, 4)
            );
          }, "readFloatLE")),
          (a.prototype.readFloatBE = S(function (e, t) {
            return (
              (e >>>= 0), t || L(e, 4, this.length), i.read(this, e, !1, 23, 4)
            );
          }, "readFloatBE")),
          (a.prototype.readDoubleLE = S(function (e, t) {
            return (
              (e >>>= 0), t || L(e, 8, this.length), i.read(this, e, !0, 52, 8)
            );
          }, "readDoubleLE")),
          (a.prototype.readDoubleBE = S(function (e, t) {
            return (
              (e >>>= 0), t || L(e, 8, this.length), i.read(this, e, !1, 52, 8)
            );
          }, "readDoubleBE")),
          S(R, "checkInt"),
          (a.prototype.writeUintLE = a.prototype.writeUIntLE =
            S(function (e, t, i, r) {
              if (((e *= 1), (t >>>= 0), (i >>>= 0), !r)) {
                let r = Math.pow(2, 8 * i) - 1;
                R(this, e, t, i, r, 0);
              }
              let n = 1,
                s = 0;
              for (this[t] = 255 & e; ++s < i && (n *= 256); )
                this[t + s] = (e / n) & 255;
              return t + i;
            }, "writeUIntLE")),
          (a.prototype.writeUintBE = a.prototype.writeUIntBE =
            S(function (e, t, i, r) {
              if (((e *= 1), (t >>>= 0), (i >>>= 0), !r)) {
                let r = Math.pow(2, 8 * i) - 1;
                R(this, e, t, i, r, 0);
              }
              let n = i - 1,
                s = 1;
              for (this[t + n] = 255 & e; --n >= 0 && (s *= 256); )
                this[t + n] = (e / s) & 255;
              return t + i;
            }, "writeUIntBE")),
          (a.prototype.writeUint8 = a.prototype.writeUInt8 =
            S(function (e, t, i) {
              return (
                (e *= 1),
                (t >>>= 0),
                i || R(this, e, t, 1, 255, 0),
                (this[t] = 255 & e),
                t + 1
              );
            }, "writeUInt8")),
          (a.prototype.writeUint16LE = a.prototype.writeUInt16LE =
            S(function (e, t, i) {
              return (
                (e *= 1),
                (t >>>= 0),
                i || R(this, e, t, 2, 65535, 0),
                (this[t] = 255 & e),
                (this[t + 1] = e >>> 8),
                t + 2
              );
            }, "writeUInt16LE")),
          (a.prototype.writeUint16BE = a.prototype.writeUInt16BE =
            S(function (e, t, i) {
              return (
                (e *= 1),
                (t >>>= 0),
                i || R(this, e, t, 2, 65535, 0),
                (this[t] = e >>> 8),
                (this[t + 1] = 255 & e),
                t + 2
              );
            }, "writeUInt16BE")),
          (a.prototype.writeUint32LE = a.prototype.writeUInt32LE =
            S(function (e, t, i) {
              return (
                (e *= 1),
                (t >>>= 0),
                i || R(this, e, t, 4, 0xffffffff, 0),
                (this[t + 3] = e >>> 24),
                (this[t + 2] = e >>> 16),
                (this[t + 1] = e >>> 8),
                (this[t] = 255 & e),
                t + 4
              );
            }, "writeUInt32LE")),
          (a.prototype.writeUint32BE = a.prototype.writeUInt32BE =
            S(function (e, t, i) {
              return (
                (e *= 1),
                (t >>>= 0),
                i || R(this, e, t, 4, 0xffffffff, 0),
                (this[t] = e >>> 24),
                (this[t + 1] = e >>> 16),
                (this[t + 2] = e >>> 8),
                (this[t + 3] = 255 & e),
                t + 4
              );
            }, "writeUInt32BE")),
          S(M, "wrtBigUInt64LE"),
          S(B, "wrtBigUInt64BE"),
          (a.prototype.writeBigUInt64LE = el(
            S(function (e, t = 0) {
              return M(this, e, t, BigInt(0), BigInt("0xffffffffffffffff"));
            }, "writeBigUInt64LE"),
          )),
          (a.prototype.writeBigUInt64BE = el(
            S(function (e, t = 0) {
              return B(this, e, t, BigInt(0), BigInt("0xffffffffffffffff"));
            }, "writeBigUInt64BE"),
          )),
          (a.prototype.writeIntLE = S(function (e, t, i, r) {
            if (((e *= 1), (t >>>= 0), !r)) {
              let r = Math.pow(2, 8 * i - 1);
              R(this, e, t, i, r - 1, -r);
            }
            let n = 0,
              s = 1,
              a = 0;
            for (this[t] = 255 & e; ++n < i && (s *= 256); )
              e < 0 && 0 === a && 0 !== this[t + n - 1] && (a = 1),
                (this[t + n] = (((e / s) | 0) - a) & 255);
            return t + i;
          }, "writeIntLE")),
          (a.prototype.writeIntBE = S(function (e, t, i, r) {
            if (((e *= 1), (t >>>= 0), !r)) {
              let r = Math.pow(2, 8 * i - 1);
              R(this, e, t, i, r - 1, -r);
            }
            let n = i - 1,
              s = 1,
              a = 0;
            for (this[t + n] = 255 & e; --n >= 0 && (s *= 256); )
              e < 0 && 0 === a && 0 !== this[t + n + 1] && (a = 1),
                (this[t + n] = (((e / s) | 0) - a) & 255);
            return t + i;
          }, "writeIntBE")),
          (a.prototype.writeInt8 = S(function (e, t, i) {
            return (
              (e *= 1),
              (t >>>= 0),
              i || R(this, e, t, 1, 127, -128),
              e < 0 && (e = 255 + e + 1),
              (this[t] = 255 & e),
              t + 1
            );
          }, "writeInt8")),
          (a.prototype.writeInt16LE = S(function (e, t, i) {
            return (
              (e *= 1),
              (t >>>= 0),
              i || R(this, e, t, 2, 32767, -32768),
              (this[t] = 255 & e),
              (this[t + 1] = e >>> 8),
              t + 2
            );
          }, "writeInt16LE")),
          (a.prototype.writeInt16BE = S(function (e, t, i) {
            return (
              (e *= 1),
              (t >>>= 0),
              i || R(this, e, t, 2, 32767, -32768),
              (this[t] = e >>> 8),
              (this[t + 1] = 255 & e),
              t + 2
            );
          }, "writeInt16BE")),
          (a.prototype.writeInt32LE = S(function (e, t, i) {
            return (
              (e *= 1),
              (t >>>= 0),
              i || R(this, e, t, 4, 0x7fffffff, -0x80000000),
              (this[t] = 255 & e),
              (this[t + 1] = e >>> 8),
              (this[t + 2] = e >>> 16),
              (this[t + 3] = e >>> 24),
              t + 4
            );
          }, "writeInt32LE")),
          (a.prototype.writeInt32BE = S(function (e, t, i) {
            return (
              (e *= 1),
              (t >>>= 0),
              i || R(this, e, t, 4, 0x7fffffff, -0x80000000),
              e < 0 && (e = 0xffffffff + e + 1),
              (this[t] = e >>> 24),
              (this[t + 1] = e >>> 16),
              (this[t + 2] = e >>> 8),
              (this[t + 3] = 255 & e),
              t + 4
            );
          }, "writeInt32BE")),
          (a.prototype.writeBigInt64LE = el(
            S(function (e, t = 0) {
              return M(
                this,
                e,
                t,
                -BigInt("0x8000000000000000"),
                BigInt("0x7fffffffffffffff"),
              );
            }, "writeBigInt64LE"),
          )),
          (a.prototype.writeBigInt64BE = el(
            S(function (e, t = 0) {
              return B(
                this,
                e,
                t,
                -BigInt("0x8000000000000000"),
                BigInt("0x7fffffffffffffff"),
              );
            }, "writeBigInt64BE"),
          )),
          S(F, "checkIEEE754"),
          S(q, "writeFloat"),
          (a.prototype.writeFloatLE = S(function (e, t, i) {
            return q(this, e, t, !0, i);
          }, "writeFloatLE")),
          (a.prototype.writeFloatBE = S(function (e, t, i) {
            return q(this, e, t, !1, i);
          }, "writeFloatBE")),
          S(Q, "writeDouble"),
          (a.prototype.writeDoubleLE = S(function (e, t, i) {
            return Q(this, e, t, !0, i);
          }, "writeDoubleLE")),
          (a.prototype.writeDoubleBE = S(function (e, t, i) {
            return Q(this, e, t, !1, i);
          }, "writeDoubleBE")),
          (a.prototype.copy = S(function (e, t, i, r) {
            if (!a.isBuffer(e)) throw TypeError("argument should be a Buffer");
            if (
              (i || (i = 0),
              r || 0 === r || (r = this.length),
              t >= e.length && (t = e.length),
              t || (t = 0),
              r > 0 && r < i && (r = i),
              r === i || 0 === e.length || 0 === this.length)
            )
              return 0;
            if (t < 0) throw RangeError("targetStart out of bounds");
            if (i < 0 || i >= this.length)
              throw RangeError("Index out of range");
            if (r < 0) throw RangeError("sourceEnd out of bounds");
            r > this.length && (r = this.length),
              e.length - t < r - i && (r = e.length - t + i);
            let n = r - i;
            return (
              this === e && "function" == typeof Uint8Array.prototype.copyWithin
                ? this.copyWithin(t, i, r)
                : Uint8Array.prototype.set.call(e, this.subarray(i, r), t),
              n
            );
          }, "copy")),
          (a.prototype.fill = S(function (e, t, i, r) {
            let n;
            if ("string" == typeof e) {
              if (
                ("string" == typeof t
                  ? ((r = t), (t = 0), (i = this.length))
                  : "string" == typeof i && ((r = i), (i = this.length)),
                void 0 !== r && "string" != typeof r)
              )
                throw TypeError("encoding must be a string");
              if ("string" == typeof r && !a.isEncoding(r))
                throw TypeError("Unknown encoding: " + r);
              if (1 === e.length) {
                let t = e.charCodeAt(0);
                (("utf8" === r && t < 128) || "latin1" === r) && (e = t);
              }
            } else
              "number" == typeof e
                ? (e &= 255)
                : "boolean" == typeof e && (e = Number(e));
            if (t < 0 || this.length < t || this.length < i)
              throw RangeError("Out of range index");
            if (i <= t) return this;
            if (
              ((t >>>= 0),
              (i = void 0 === i ? this.length : i >>> 0),
              e || (e = 0),
              "number" == typeof e)
            )
              for (n = t; n < i; ++n) this[n] = e;
            else {
              let s = a.isBuffer(e) ? e : a.from(e, r),
                o = s.length;
              if (0 === o)
                throw TypeError(
                  'The value "' + e + '" is invalid for argument "value"',
                );
              for (n = 0; n < i - t; ++n) this[n + t] = s[n % o];
            }
            return this;
          }, "fill"));
        var J = {};
        function V(e, t, i) {
          var r;
          J[e] =
            (S(
              (r = class extends i {
                constructor() {
                  super(),
                    Object.defineProperty(this, "message", {
                      value: t.apply(this, arguments),
                      writable: !0,
                      configurable: !0,
                    }),
                    (this.name = `${this.name} [${e}]`),
                    this.stack,
                    delete this.name;
                }
                get code() {
                  return e;
                }
                set code(e) {
                  Object.defineProperty(this, "code", {
                    configurable: !0,
                    enumerable: !0,
                    value: e,
                    writable: !0,
                  });
                }
                toString() {
                  return `${this.name} [${e}\
]: ${this.message}`;
                }
              }),
              "NodeError",
            ),
            r);
        }
        function W(e) {
          let t = "",
            i = e.length,
            r = +("-" === e[0]);
          for (; i >= r + 4; i -= 3)
            t = `\
_${e.slice(i - 3, i)}${t}`;
          return `${e.slice(0, i)}${t}`;
        }
        function G(e, t, i) {
          X(t, "offset"),
            (void 0 === e[t] || void 0 === e[t + i]) &&
              H(t, e.length - (i + 1));
        }
        function K(e, t, i, r, n, s) {
          if (e > i || e < t) {
            let r = "bigint" == typeof t ? "n" : "",
              n;
            throw (
              ((n =
                s > 3
                  ? 0 === t || t === BigInt(0)
                    ? `>= 0${r} and < 2${r}\
 ** ${(s + 1) * 8}${r}`
                    : `>= -(2${r} ** ${(s + 1) * 8 - 1}${r}) and < 2 ** ${(s + 1) * 8 - 1}${r}`
                  : `>= ${t}${r} a\
nd <= ${i}${r}`),
              new J.ERR_OUT_OF_RANGE("value", n, e))
            );
          }
          G(r, n, s);
        }
        function X(e, t) {
          if ("number" != typeof e)
            throw new J.ERR_INVALID_ARG_TYPE(t, "number", e);
        }
        function H(e, t, i) {
          throw Math.floor(e) !== e
            ? (X(e, i), new J.ERR_OUT_OF_RANGE(i || "offset", "an integer", e))
            : t < 0
              ? new J.ERR_BUFFER_OUT_OF_BOUNDS()
              : new J.ERR_OUT_OF_RANGE(
                  i || "offset",
                  `>= ${+!!i} and <= ${t}`,
                  e,
                );
        }
        S(V, "E"),
          V(
            "ERR_BUFFER_OUT_OF_BOUNDS",
            function (e) {
              return e
                ? `${e} is outside of buffer bounds`
                : "Attempt to access memory outside buffer bounds";
            },
            RangeError,
          ),
          V(
            "ERR_INVALID_ARG_TYPE",
            function (e, t) {
              return `The "${e}" argument must be of type number. Received typ\
e ${typeof t}`;
            },
            TypeError,
          ),
          V(
            "ERR_OUT_OF_RANGE",
            function (e, t, i) {
              let r = `The value of "${e}" is out o\
f range.`,
                n = i;
              return (
                Number.isInteger(i) && Math.abs(i) > 0x100000000
                  ? (n = W(String(i)))
                  : "bigint" == typeof i &&
                    ((n = String(i)),
                    (i > BigInt(2) ** BigInt(32) ||
                      i < -(BigInt(2) ** BigInt(32))) &&
                      (n = W(n)),
                    (n += "n")),
                (r += ` It must be ${t}. Re\
ceived ${n}`)
              );
            },
            RangeError,
          ),
          S(W, "addNumericalSeparator"),
          S(G, "checkBounds"),
          S(K, "checkIntBI"),
          S(X, "validateNumber"),
          S(H, "boundsError");
        var Y = /[^+/0-9A-Za-z-_]/g;
        function ee(e) {
          if ((e = (e = e.split("=")[0]).trim().replace(Y, "")).length < 2)
            return "";
          for (; e.length % 4 != 0; ) e += "=";
          return e;
        }
        function et(e, t) {
          t = t || 1 / 0;
          let i,
            r = e.length,
            n = null,
            s = [];
          for (let a = 0; a < r; ++a) {
            if ((i = e.charCodeAt(a)) > 55295 && i < 57344) {
              if (!n) {
                if (i > 56319 || a + 1 === r) {
                  (t -= 3) > -1 && s.push(239, 191, 189);
                  continue;
                }
                n = i;
                continue;
              }
              if (i < 56320) {
                (t -= 3) > -1 && s.push(239, 191, 189), (n = i);
                continue;
              }
              i = (((n - 55296) << 10) | (i - 56320)) + 65536;
            } else n && (t -= 3) > -1 && s.push(239, 191, 189);
            if (((n = null), i < 128)) {
              if ((t -= 1) < 0) break;
              s.push(i);
            } else if (i < 2048) {
              if ((t -= 2) < 0) break;
              s.push((i >> 6) | 192, (63 & i) | 128);
            } else if (i < 65536) {
              if ((t -= 3) < 0) break;
              s.push((i >> 12) | 224, ((i >> 6) & 63) | 128, (63 & i) | 128);
            } else if (i < 1114112) {
              if ((t -= 4) < 0) break;
              s.push(
                (i >> 18) | 240,
                ((i >> 12) & 63) | 128,
                ((i >> 6) & 63) | 128,
                (63 & i) | 128,
              );
            } else throw Error("Invalid code point");
          }
          return s;
        }
        function ei(e) {
          let t = [];
          for (let i = 0; i < e.length; ++i) t.push(255 & e.charCodeAt(i));
          return t;
        }
        function er(e, t) {
          let i,
            r,
            n = [];
          for (let s = 0; s < e.length && !((t -= 2) < 0); ++s)
            (r = (i = e.charCodeAt(s)) >> 8), n.push(i % 256), n.push(r);
          return n;
        }
        function en(e) {
          return t.toByteArray(ee(e));
        }
        function es(e, t, i, r) {
          let n;
          for (n = 0; n < r && !(n + i >= t.length || n >= e.length); ++n)
            t[n + i] = e[n];
          return n;
        }
        function ea(e, t) {
          return (
            e instanceof t ||
            (null != e &&
              null != e.constructor &&
              null != e.constructor.name &&
              e.constructor.name === t.name)
          );
        }
        function eo(e) {
          return e != e;
        }
        S(ee, "base64clean"),
          S(et, "utf8ToBytes"),
          S(ei, "asciiToBytes"),
          S(er, "utf16leToBytes"),
          S(en, "base64ToBytes"),
          S(es, "blitBuffer"),
          S(ea, "isInstance"),
          S(eo, "numberIsNaN");
        var eu = (function () {
          let e = "0123456789abcdef",
            t = Array(256);
          for (let i = 0; i < 16; ++i) {
            let r = 16 * i;
            for (let n = 0; n < 16; ++n) t[r + n] = e[i] + e[n];
          }
          return t;
        })();
        function el(e) {
          return typeof BigInt > "u" ? ec : e;
        }
        function ec() {
          throw Error("BigInt not supported");
        }
        S(el, "defineBigIntMethod"), S(ec, "BufferBigIntNotDefined");
      }),
      D = k(() => {
        (p = globalThis),
          (m = globalThis.setImmediate ?? ((e) => setTimeout(e, 0))),
          (g =
            "function" == typeof globalThis.Buffer &&
            "function" == typeof globalThis.Buffer.allocUnsafe
              ? globalThis.Buffer
              : U().Buffer),
          (v = globalThis.process ?? {}).env ?? (v.env = {});
        try {
          v.nextTick(() => {});
        } catch {
          let e = Promise.resolve();
          v.nextTick = e.then.bind(e);
        }
      }),
      C = I((e, t) => {
        D();
        var i,
          r = "object" == typeof Reflect ? Reflect : null,
          n =
            r && "function" == typeof r.apply
              ? r.apply
              : S(function (e, t, i) {
                  return Function.prototype.apply.call(e, t, i);
                }, "ReflectApply");
        function s(e) {
          console && console.warn && console.warn(e);
        }
        (i =
          r && "function" == typeof r.ownKeys
            ? r.ownKeys
            : Object.getOwnPropertySymbols
              ? S(function (e) {
                  return Object.getOwnPropertyNames(e).concat(
                    Object.getOwnPropertySymbols(e),
                  );
                }, "ReflectOwnKeys")
              : S(function (e) {
                  return Object.getOwnPropertyNames(e);
                }, "ReflectOwnKeys")),
          S(s, "ProcessEmitWarning");
        var a =
          Number.isNaN ||
          S(function (e) {
            return e != e;
          }, "NumberIsNaN");
        function o() {
          o.init.call(this);
        }
        S(o, "EventEmitter"),
          (t.exports = o),
          (t.exports.once = b),
          (o.EventEmitter = o),
          (o.prototype._events = void 0),
          (o.prototype._eventsCount = 0),
          (o.prototype._maxListeners = void 0);
        var u = 10;
        function l(e) {
          if ("function" != typeof e)
            throw TypeError(
              'The "listener" argument must be of type Function. Received type ' +
                typeof e,
            );
        }
        function c(e) {
          return void 0 === e._maxListeners
            ? o.defaultMaxListeners
            : e._maxListeners;
        }
        function d(e, t, i, r) {
          var n, a, o;
          if (
            (l(i),
            void 0 === (a = e._events)
              ? ((a = e._events = Object.create(null)), (e._eventsCount = 0))
              : (void 0 !== a.newListener &&
                  (e.emit("newListener", t, i.listener ? i.listener : i),
                  (a = e._events)),
                (o = a[t])),
            void 0 === o)
          )
            (o = a[t] = i), ++e._eventsCount;
          else if (
            ("function" == typeof o
              ? (o = a[t] = r ? [i, o] : [o, i])
              : r
                ? o.unshift(i)
                : o.push(i),
            (n = c(e)) > 0 && o.length > n && !o.warned)
          ) {
            o.warned = !0;
            var u = Error(
              "Possible EventEmitter memory leak detected. " +
                o.length +
                " " +
                String(t) +
                " listeners added. Use emitter.setMaxListeners() to increase limit",
            );
            (u.name = "MaxListenersExceededWarning"),
              (u.emitter = e),
              (u.type = t),
              (u.count = o.length),
              s(u);
          }
          return e;
        }
        function f() {
          if (!this.fired)
            return (
              this.target.removeListener(this.type, this.wrapFn),
              (this.fired = !0),
              0 == arguments.length
                ? this.listener.call(this.target)
                : this.listener.apply(this.target, arguments)
            );
        }
        function h(e, t, i) {
          var r = {
              fired: !1,
              wrapFn: void 0,
              target: e,
              type: t,
              listener: i,
            },
            n = f.bind(r);
          return (n.listener = i), (r.wrapFn = n), n;
        }
        function p(e, t, i) {
          var r = e._events;
          if (void 0 === r) return [];
          var n = r[t];
          return void 0 === n
            ? []
            : "function" == typeof n
              ? i
                ? [n.listener || n]
                : [n]
              : i
                ? y(n)
                : g(n, n.length);
        }
        function m(e) {
          var t = this._events;
          if (void 0 !== t) {
            var i = t[e];
            if ("function" == typeof i) return 1;
            if (void 0 !== i) return i.length;
          }
          return 0;
        }
        function g(e, t) {
          for (var i = Array(t), r = 0; r < t; ++r) i[r] = e[r];
          return i;
        }
        function v(e, t) {
          for (; t + 1 < e.length; t++) e[t] = e[t + 1];
          e.pop();
        }
        function y(e) {
          for (var t = Array(e.length), i = 0; i < t.length; ++i)
            t[i] = e[i].listener || e[i];
          return t;
        }
        function b(e, t) {
          return new Promise(function (i, r) {
            function n(i) {
              e.removeListener(t, s), r(i);
            }
            function s() {
              "function" == typeof e.removeListener &&
                e.removeListener("error", n),
                i([].slice.call(arguments));
            }
            S(n, "errorListener"),
              S(s, "resolver"),
              $(e, t, s, { once: !0 }),
              "error" !== t && _(e, n, { once: !0 });
          });
        }
        function _(e, t, i) {
          "function" == typeof e.on && $(e, "error", t, i);
        }
        function $(e, t, i, r) {
          if ("function" == typeof e.on) r.once ? e.once(t, i) : e.on(t, i);
          else if ("function" == typeof e.addEventListener)
            e.addEventListener(
              t,
              S(function n(s) {
                r.once && e.removeEventListener(t, n), i(s);
              }, "wrapListener"),
            );
          else
            throw TypeError(
              'The "emitter" argument must be of type EventEmitter. Received type ' +
                typeof e,
            );
        }
        S(l, "checkListener"),
          Object.defineProperty(o, "defaultMaxListeners", {
            enumerable: !0,
            get: S(function () {
              return u;
            }, "get"),
            set: S(function (e) {
              if ("number" != typeof e || e < 0 || a(e))
                throw RangeError(
                  'The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' +
                    e +
                    ".",
                );
              u = e;
            }, "set"),
          }),
          (o.init = function () {
            (void 0 === this._events ||
              this._events === Object.getPrototypeOf(this)._events) &&
              ((this._events = Object.create(null)), (this._eventsCount = 0)),
              (this._maxListeners = this._maxListeners || void 0);
          }),
          (o.prototype.setMaxListeners = S(function (e) {
            if ("number" != typeof e || e < 0 || a(e))
              throw RangeError(
                'The value of "n" is out of range. It must be a non-negative number. Received ' +
                  e +
                  ".",
              );
            return (this._maxListeners = e), this;
          }, "setMaxListeners")),
          S(c, "_getMaxListeners"),
          (o.prototype.getMaxListeners = S(function () {
            return c(this);
          }, "getMaxListeners")),
          (o.prototype.emit = S(function (e) {
            for (var t = [], i = 1; i < arguments.length; i++)
              t.push(arguments[i]);
            var r = "error" === e,
              s = this._events;
            if (void 0 !== s) r = r && void 0 === s.error;
            else if (!r) return !1;
            if (r) {
              if ((t.length > 0 && (a = t[0]), a instanceof Error)) throw a;
              var a,
                o = Error(
                  "Unhandled error." + (a ? " (" + a.message + ")" : ""),
                );
              throw ((o.context = a), o);
            }
            var u = s[e];
            if (void 0 === u) return !1;
            if ("function" == typeof u) n(u, this, t);
            else
              for (var l = u.length, c = g(u, l), i = 0; i < l; ++i)
                n(c[i], this, t);
            return !0;
          }, "emit")),
          S(d, "_addListener"),
          (o.prototype.addListener = S(function (e, t) {
            return d(this, e, t, !1);
          }, "addListener")),
          (o.prototype.on = o.prototype.addListener),
          (o.prototype.prependListener = S(function (e, t) {
            return d(this, e, t, !0);
          }, "prependListener")),
          S(f, "onceWrapper"),
          S(h, "_onceWrap"),
          (o.prototype.once = S(function (e, t) {
            return l(t), this.on(e, h(this, e, t)), this;
          }, "once")),
          (o.prototype.prependOnceListener = S(function (e, t) {
            return l(t), this.prependListener(e, h(this, e, t)), this;
          }, "prependOnceListener")),
          (o.prototype.removeListener = S(function (e, t) {
            var i, r, n, s, a;
            if ((l(t), void 0 === (r = this._events) || void 0 === (i = r[e])))
              return this;
            if (i === t || i.listener === t)
              0 == --this._eventsCount
                ? (this._events = Object.create(null))
                : (delete r[e],
                  r.removeListener &&
                    this.emit("removeListener", e, i.listener || t));
            else if ("function" != typeof i) {
              for (n = -1, s = i.length - 1; s >= 0; s--)
                if (i[s] === t || i[s].listener === t) {
                  (a = i[s].listener), (n = s);
                  break;
                }
              if (n < 0) return this;
              0 === n ? i.shift() : v(i, n),
                1 === i.length && (r[e] = i[0]),
                void 0 !== r.removeListener &&
                  this.emit("removeListener", e, a || t);
            }
            return this;
          }, "removeListener")),
          (o.prototype.off = o.prototype.removeListener),
          (o.prototype.removeAllListeners = S(function (e) {
            var t, i, r;
            if (void 0 === (i = this._events)) return this;
            if (void 0 === i.removeListener)
              return (
                0 == arguments.length
                  ? ((this._events = Object.create(null)),
                    (this._eventsCount = 0))
                  : void 0 !== i[e] &&
                    (0 == --this._eventsCount
                      ? (this._events = Object.create(null))
                      : delete i[e]),
                this
              );
            if (0 == arguments.length) {
              var n,
                s = Object.keys(i);
              for (r = 0; r < s.length; ++r)
                "removeListener" !== (n = s[r]) && this.removeAllListeners(n);
              return (
                this.removeAllListeners("removeListener"),
                (this._events = Object.create(null)),
                (this._eventsCount = 0),
                this
              );
            }
            if ("function" == typeof (t = i[e])) this.removeListener(e, t);
            else if (void 0 !== t)
              for (r = t.length - 1; r >= 0; r--) this.removeListener(e, t[r]);
            return this;
          }, "removeAllListeners")),
          S(p, "_listeners"),
          (o.prototype.listeners = S(function (e) {
            return p(this, e, !0);
          }, "listeners")),
          (o.prototype.rawListeners = S(function (e) {
            return p(this, e, !1);
          }, "rawListeners")),
          (o.listenerCount = function (e, t) {
            return "function" == typeof e.listenerCount
              ? e.listenerCount(t)
              : m.call(e, t);
          }),
          (o.prototype.listenerCount = m),
          S(m, "listenerCount"),
          (o.prototype.eventNames = S(function () {
            return this._eventsCount > 0 ? i(this._events) : [];
          }, "eventNames")),
          S(g, "arrayClone"),
          S(v, "spliceOne"),
          S(y, "unwrapListeners"),
          S(b, "once"),
          S(_, "addErrorHandlerIfEventEmitter"),
          S($, "eventTargetAgnosticAddListener");
      }),
      j = {};
    function Z(e) {
      return 0;
    }
    E(j, { Socket: () => B, isIP: () => Z });
    var L,
      R,
      M,
      B,
      F = k(() => {
        D(),
          (L = N(C(), 1)),
          S(Z, "isIP"),
          (R = /^[^.]+\./),
          (M = class e extends L.EventEmitter {
            constructor() {
              super(...arguments),
                O(this, "opts", {}),
                O(this, "connecting", !1),
                O(this, "pending", !0),
                O(this, "writable", !0),
                O(this, "encrypted", !1),
                O(this, "authorized", !1),
                O(this, "destroyed", !1),
                O(this, "ws", null),
                O(this, "writeBuffer"),
                O(this, "tlsState", 0),
                O(this, "tlsRead"),
                O(this, "tlsWrite");
            }
            static get poolQueryViaFetch() {
              return e.opts.poolQueryViaFetch ?? e.defaults.poolQueryViaFetch;
            }
            static set poolQueryViaFetch(t) {
              e.opts.poolQueryViaFetch = t;
            }
            static get fetchEndpoint() {
              return e.opts.fetchEndpoint ?? e.defaults.fetchEndpoint;
            }
            static set fetchEndpoint(t) {
              e.opts.fetchEndpoint = t;
            }
            static get fetchConnectionCache() {
              return !0;
            }
            static set fetchConnectionCache(e) {
              console.warn(
                "The `fetchConnectionCache` option is deprecated (now always `true`)",
              );
            }
            static get fetchFunction() {
              return e.opts.fetchFunction ?? e.defaults.fetchFunction;
            }
            static set fetchFunction(t) {
              e.opts.fetchFunction = t;
            }
            static get webSocketConstructor() {
              return (
                e.opts.webSocketConstructor ?? e.defaults.webSocketConstructor
              );
            }
            static set webSocketConstructor(t) {
              e.opts.webSocketConstructor = t;
            }
            get webSocketConstructor() {
              return this.opts.webSocketConstructor ?? e.webSocketConstructor;
            }
            set webSocketConstructor(e) {
              this.opts.webSocketConstructor = e;
            }
            static get wsProxy() {
              return e.opts.wsProxy ?? e.defaults.wsProxy;
            }
            static set wsProxy(t) {
              e.opts.wsProxy = t;
            }
            get wsProxy() {
              return this.opts.wsProxy ?? e.wsProxy;
            }
            set wsProxy(e) {
              this.opts.wsProxy = e;
            }
            static get coalesceWrites() {
              return e.opts.coalesceWrites ?? e.defaults.coalesceWrites;
            }
            static set coalesceWrites(t) {
              e.opts.coalesceWrites = t;
            }
            get coalesceWrites() {
              return this.opts.coalesceWrites ?? e.coalesceWrites;
            }
            set coalesceWrites(e) {
              this.opts.coalesceWrites = e;
            }
            static get useSecureWebSocket() {
              return e.opts.useSecureWebSocket ?? e.defaults.useSecureWebSocket;
            }
            static set useSecureWebSocket(t) {
              e.opts.useSecureWebSocket = t;
            }
            get useSecureWebSocket() {
              return this.opts.useSecureWebSocket ?? e.useSecureWebSocket;
            }
            set useSecureWebSocket(e) {
              this.opts.useSecureWebSocket = e;
            }
            static get forceDisablePgSSL() {
              return e.opts.forceDisablePgSSL ?? e.defaults.forceDisablePgSSL;
            }
            static set forceDisablePgSSL(t) {
              e.opts.forceDisablePgSSL = t;
            }
            get forceDisablePgSSL() {
              return this.opts.forceDisablePgSSL ?? e.forceDisablePgSSL;
            }
            set forceDisablePgSSL(e) {
              this.opts.forceDisablePgSSL = e;
            }
            static get disableSNI() {
              return e.opts.disableSNI ?? e.defaults.disableSNI;
            }
            static set disableSNI(t) {
              e.opts.disableSNI = t;
            }
            get disableSNI() {
              return this.opts.disableSNI ?? e.disableSNI;
            }
            set disableSNI(e) {
              this.opts.disableSNI = e;
            }
            static get disableWarningInBrowsers() {
              return (
                e.opts.disableWarningInBrowsers ??
                e.defaults.disableWarningInBrowsers
              );
            }
            static set disableWarningInBrowsers(t) {
              e.opts.disableWarningInBrowsers = t;
            }
            get disableWarningInBrowsers() {
              return (
                this.opts.disableWarningInBrowsers ?? e.disableWarningInBrowsers
              );
            }
            set disableWarningInBrowsers(e) {
              this.opts.disableWarningInBrowsers = e;
            }
            static get pipelineConnect() {
              return e.opts.pipelineConnect ?? e.defaults.pipelineConnect;
            }
            static set pipelineConnect(t) {
              e.opts.pipelineConnect = t;
            }
            get pipelineConnect() {
              return this.opts.pipelineConnect ?? e.pipelineConnect;
            }
            set pipelineConnect(e) {
              this.opts.pipelineConnect = e;
            }
            static get subtls() {
              return e.opts.subtls ?? e.defaults.subtls;
            }
            static set subtls(t) {
              e.opts.subtls = t;
            }
            get subtls() {
              return this.opts.subtls ?? e.subtls;
            }
            set subtls(e) {
              this.opts.subtls = e;
            }
            static get pipelineTLS() {
              return e.opts.pipelineTLS ?? e.defaults.pipelineTLS;
            }
            static set pipelineTLS(t) {
              e.opts.pipelineTLS = t;
            }
            get pipelineTLS() {
              return this.opts.pipelineTLS ?? e.pipelineTLS;
            }
            set pipelineTLS(e) {
              this.opts.pipelineTLS = e;
            }
            static get rootCerts() {
              return e.opts.rootCerts ?? e.defaults.rootCerts;
            }
            static set rootCerts(t) {
              e.opts.rootCerts = t;
            }
            get rootCerts() {
              return this.opts.rootCerts ?? e.rootCerts;
            }
            set rootCerts(e) {
              this.opts.rootCerts = e;
            }
            wsProxyAddrForHost(e, t) {
              let i = this.wsProxy;
              if (void 0 === i)
                throw Error(
                  "No WebSocket proxy is configured. Please see https://github.com/neondatabase/serverless/blob/main/CONFIG.md#wsproxy-string--host-string-port-number--string--string",
                );
              return "function" == typeof i
                ? i(e, t)
                : `${i}?address=${e}:${t}`;
            }
            setNoDelay() {
              return this;
            }
            setKeepAlive() {
              return this;
            }
            ref() {
              return this;
            }
            unref() {
              return this;
            }
            connect(e, t, i) {
              (this.connecting = !0), i && this.once("connect", i);
              let r = S(() => {
                  (this.connecting = !1),
                    (this.pending = !1),
                    this.emit("connect"),
                    this.emit("ready");
                }, "handleWebSocketOpen"),
                n = S((e, t = !1) => {
                  (e.binaryType = "arraybuffer"),
                    e.addEventListener("error", (e) => {
                      this.emit("error", e), this.emit("close");
                    }),
                    e.addEventListener("message", (e) => {
                      if (0 === this.tlsState) {
                        let t = g.from(e.data);
                        this.emit("data", t);
                      }
                    }),
                    e.addEventListener("close", () => {
                      this.emit("close");
                    }),
                    t ? r() : e.addEventListener("open", r);
                }, "configureWebSocket"),
                s;
              try {
                s = this.wsProxyAddrForHost(
                  t,
                  "string" == typeof e ? parseInt(e, 10) : e,
                );
              } catch (e) {
                this.emit("error", e), this.emit("close");
                return;
              }
              try {
                let e = (this.useSecureWebSocket ? "wss:" : "ws:") + "//" + s;
                if (void 0 !== this.webSocketConstructor)
                  (this.ws = new this.webSocketConstructor(e)), n(this.ws);
                else
                  try {
                    (this.ws = new WebSocket(e)), n(this.ws);
                  } catch {
                    (this.ws = new __unstable_WebSocket(e)), n(this.ws);
                  }
              } catch (e) {
                fetch(
                  (this.useSecureWebSocket ? "https:" : "http:") + "//" + s,
                  { headers: { Upgrade: "websocket" } },
                )
                  .then((t) => {
                    if (((this.ws = t.webSocket), null == this.ws)) throw e;
                    this.ws.accept(), n(this.ws, !0);
                  })
                  .catch((e) => {
                    this.emit(
                      "error",
                      Error(`All attempts to open a WebSocket to connect to the database failed. Please refer \
to https://github.com/neondatabase/serverless/blob/main/CONFIG.md#websocketconstructor-typeof-websoc\
ket--undefined. Details: ${e}`),
                    ),
                      this.emit("close");
                  });
              }
            }
            async startTls(e) {
              if (void 0 === this.subtls)
                throw Error(
                  "For Postgres SSL connections, you must set `neonConfig.subtls` to the subtls library. See https://github.com/neondatabase/serverless/blob/main/CONFIG.md for more information.",
                );
              this.tlsState = 1;
              let t = await this.subtls.TrustedCert.databaseFromPEM(
                  this.rootCerts,
                ),
                i = new this.subtls.WebSocketReadQueue(this.ws),
                r = i.read.bind(i),
                n = this.rawWrite.bind(this),
                { read: s, write: a } = await this.subtls.startTls(e, t, r, n, {
                  useSNI: !this.disableSNI,
                  expectPreData: this.pipelineTLS
                    ? new Uint8Array([83])
                    : void 0,
                });
              (this.tlsRead = s),
                (this.tlsWrite = a),
                (this.tlsState = 2),
                (this.encrypted = !0),
                (this.authorized = !0),
                this.emit("secureConnection", this),
                this.tlsReadLoop();
            }
            async tlsReadLoop() {
              for (;;) {
                let e = await this.tlsRead();
                if (void 0 === e) break;
                {
                  let t = g.from(e);
                  this.emit("data", t);
                }
              }
            }
            rawWrite(e) {
              if (!this.coalesceWrites) {
                this.ws && this.ws.send(e);
                return;
              }
              if (void 0 === this.writeBuffer)
                (this.writeBuffer = e),
                  setTimeout(() => {
                    this.ws && this.ws.send(this.writeBuffer),
                      (this.writeBuffer = void 0);
                  }, 0);
              else {
                let t = new Uint8Array(this.writeBuffer.length + e.length);
                t.set(this.writeBuffer),
                  t.set(e, this.writeBuffer.length),
                  (this.writeBuffer = t);
              }
            }
            write(e, t = "utf8", i = (e) => {}) {
              return (
                0 === e.length
                  ? i()
                  : ("string" == typeof e && (e = g.from(e, t)),
                    0 === this.tlsState
                      ? (this.rawWrite(e), i())
                      : 1 === this.tlsState
                        ? this.once("secureConnection", () => {
                            this.write(e, t, i);
                          })
                        : (this.tlsWrite(e), i())),
                !0
              );
            }
            end(e = g.alloc(0), t = "utf8", i = () => {}) {
              return (
                this.write(e, t, () => {
                  this.ws.close(), i();
                }),
                this
              );
            }
            destroy() {
              return (this.destroyed = !0), this.end();
            }
          }),
          S(M, "Socket"),
          O(M, "defaults", {
            poolQueryViaFetch: !1,
            fetchEndpoint: S(
              (e, t, i) =>
                "https://" +
                (i?.jwtAuth ? e.replace(R, "apiauth.") : e.replace(R, "api.")) +
                "/sql",
              "fetchEndpoint",
            ),
            fetchConnectionCache: !0,
            fetchFunction: void 0,
            webSocketConstructor: void 0,
            wsProxy: S((e) => e + "/v2", "wsProxy"),
            useSecureWebSocket: !0,
            forceDisablePgSSL: !0,
            coalesceWrites: !0,
            pipelineConnect: "password",
            subtls: void 0,
            rootCerts: "",
            pipelineTLS: !1,
            disableSNI: !1,
            disableWarningInBrowsers: !1,
          }),
          O(M, "opts", {}),
          (B = M);
      }),
      q = {};
    function Q(e, t = !1) {
      let { protocol: i } = new URL(e),
        {
          username: r,
          password: n,
          host: s,
          hostname: a,
          port: o,
          pathname: u,
          search: l,
          searchParams: c,
          hash: d,
        } = new URL("http:" + e.substring(i.length));
      (n = decodeURIComponent(n)),
        (r = decodeURIComponent(r)),
        (u = decodeURIComponent(u));
      let f = r + ":" + n,
        h = t ? Object.fromEntries(c.entries()) : l;
      return {
        href: e,
        protocol: i,
        auth: f,
        username: r,
        password: n,
        host: s,
        hostname: a,
        port: o,
        pathname: u,
        search: l,
        query: h,
        hash: d,
      };
    }
    E(q, { parse: () => Q });
    var J = k(() => {
        D(), S(Q, "parse");
      }),
      V = I((e) => {
        D(),
          (e.parse = function (e, t) {
            return new i(e, t).parse();
          });
        var t = class e {
          constructor(e, t) {
            (this.source = e),
              (this.transform = t || r),
              (this.position = 0),
              (this.entries = []),
              (this.recorded = []),
              (this.dimension = 0);
          }
          isEof() {
            return this.position >= this.source.length;
          }
          nextCharacter() {
            var e = this.source[this.position++];
            return "\\" === e
              ? { value: this.source[this.position++], escaped: !0 }
              : { value: e, escaped: !1 };
          }
          record(e) {
            this.recorded.push(e);
          }
          newEntry(e) {
            var t;
            (this.recorded.length > 0 || e) &&
              ("NULL" !== (t = this.recorded.join("")) || e || (t = null),
              null !== t && (t = this.transform(t)),
              this.entries.push(t),
              (this.recorded = []));
          }
          consumeDimensions() {
            if ("[" === this.source[0])
              for (; !this.isEof() && "=" !== this.nextCharacter().value; );
          }
          parse(t) {
            var i, r, n;
            for (this.consumeDimensions(); !this.isEof(); )
              if ("{" !== (i = this.nextCharacter()).value || n) {
                if ("}" !== i.value || n)
                  '"' !== i.value || i.escaped
                    ? "," !== i.value || n
                      ? this.record(i.value)
                      : this.newEntry()
                    : (n && this.newEntry(!0), (n = !n));
                else if (
                  (this.dimension--, !this.dimension && (this.newEntry(), t))
                )
                  return this.entries;
              } else
                this.dimension++,
                  this.dimension > 1 &&
                    ((r = new e(
                      this.source.substr(this.position - 1),
                      this.transform,
                    )),
                    this.entries.push(r.parse(!0)),
                    (this.position += r.position - 2));
            if (0 !== this.dimension)
              throw Error("array dimension not balanced");
            return this.entries;
          }
        };
        S(t, "ArrayParser");
        var i = t;
        function r(e) {
          return e;
        }
        S(r, "identity");
      }),
      W = I((e, t) => {
        D();
        var i = V();
        t.exports = {
          create: S(function (e, t) {
            return {
              parse: S(function () {
                return i.parse(e, t);
              }, "parse"),
            };
          }, "create"),
        };
      }),
      G = I((e, t) => {
        D();
        var i =
            /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/,
          r = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/,
          n = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/,
          s = /^-?infinity$/;
        function a(e) {
          var t = r.exec(e);
          if (t) {
            var i = parseInt(t[1], 10);
            t[4] && (i = u(i));
            var n = new Date(i, parseInt(t[2], 10) - 1, t[3]);
            return l(i) && n.setFullYear(i), n;
          }
        }
        function o(e) {
          if (e.endsWith("+00")) return 0;
          var t = n.exec(e.split(" ")[1]);
          if (t) {
            var i = t[1];
            return "Z" === i
              ? 0
              : (3600 * parseInt(t[2], 10) +
                  60 * parseInt(t[3] || 0, 10) +
                  parseInt(t[4] || 0, 10)) *
                  ("-" === i ? -1 : 1) *
                  1e3;
          }
        }
        function u(e) {
          return -(e - 1);
        }
        function l(e) {
          return e >= 0 && e < 100;
        }
        (t.exports = S(function (e) {
          if (s.test(e)) return Number(e.replace("i", "I"));
          var t = i.exec(e);
          if (!t) return a(e) || null;
          var r = !!t[8],
            n = parseInt(t[1], 10);
          r && (n = u(n));
          var c = parseInt(t[2], 10) - 1,
            d = t[3],
            f = parseInt(t[4], 10),
            h = parseInt(t[5], 10),
            p = parseInt(t[6], 10),
            m = t[7];
          m = m ? 1e3 * parseFloat(m) : 0;
          var g,
            v = o(e);
          return (
            null != v
              ? ((g = new Date(Date.UTC(n, c, d, f, h, p, m))),
                l(n) && g.setUTCFullYear(n),
                0 !== v && g.setTime(g.getTime() - v))
              : ((g = new Date(n, c, d, f, h, p, m)), l(n) && g.setFullYear(n)),
            g
          );
        }, "parseDate")),
          S(a, "getDate"),
          S(o, "timeZoneOffset"),
          S(u, "bcYearToNegativeYear"),
          S(l, "is0To99");
      }),
      K = I((e, t) => {
        D(), (t.exports = r);
        var i = Object.prototype.hasOwnProperty;
        function r(e) {
          for (var t = 1; t < arguments.length; t++) {
            var r = arguments[t];
            for (var n in r) i.call(r, n) && (e[n] = r[n]);
          }
          return e;
        }
        S(r, "extend");
      }),
      X = I((e, t) => {
        D();
        var i = K();
        function r(e) {
          if (!(this instanceof r)) return new r(e);
          i(this, h(e));
        }
        (t.exports = r), S(r, "PostgresInterval");
        var n = ["seconds", "minutes", "hours", "days", "months", "years"];
        r.prototype.toPostgres = function () {
          var e = n.filter(this.hasOwnProperty, this);
          return (
            this.milliseconds && 0 > e.indexOf("seconds") && e.push("seconds"),
            0 === e.length
              ? "0"
              : e
                  .map(function (e) {
                    var t = this[e] || 0;
                    return (
                      "seconds" === e &&
                        this.milliseconds &&
                        (t = (t + this.milliseconds / 1e3)
                          .toFixed(6)
                          .replace(/\.?0+$/, "")),
                      t + " " + e
                    );
                  }, this)
                  .join(" ")
          );
        };
        var s = {
            years: "Y",
            months: "M",
            days: "D",
            hours: "H",
            minutes: "M",
            seconds: "S",
          },
          a = ["years", "months", "days"],
          o = ["hours", "minutes", "seconds"];
        r.prototype.toISOString = r.prototype.toISO = function () {
          return "P" + a.map(e, this).join("") + "T" + o.map(e, this).join("");
          function e(e) {
            var t = this[e] || 0;
            return (
              "seconds" === e &&
                this.milliseconds &&
                (t = (t + this.milliseconds / 1e3)
                  .toFixed(6)
                  .replace(/0+$/, "")),
              t + s[e]
            );
          }
        };
        var u = "([+-]?\\d+)",
          l = new RegExp(
            [
              u + "\\s+years?",
              u + "\\s+mons?",
              u + "\\s+days?",
              "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?",
            ]
              .map(function (e) {
                return "(" + e + ")?";
              })
              .join("\\s*"),
          ),
          c = {
            years: 2,
            months: 4,
            days: 6,
            hours: 9,
            minutes: 10,
            seconds: 11,
            milliseconds: 12,
          },
          d = ["hours", "minutes", "seconds", "milliseconds"];
        function f(e) {
          return parseInt(e + "000000".slice(e.length), 10) / 1e3;
        }
        function h(e) {
          if (!e) return {};
          var t = l.exec(e),
            i = "-" === t[8];
          return Object.keys(c).reduce(function (e, r) {
            var n = t[c[r]];
            return (
              n &&
                (n = "milliseconds" === r ? f(n) : parseInt(n, 10)) &&
                (i && ~d.indexOf(r) && (n *= -1), (e[r] = n)),
              e
            );
          }, {});
        }
        S(f, "parseMilliseconds"), S(h, "parse");
      }),
      H = I((e, t) => {
        D(),
          (t.exports = S(function (e) {
            if (/^\\x/.test(e)) return new g(e.substr(2), "hex");
            for (var t = "", i = 0; i < e.length; )
              if ("\\" !== e[i]) (t += e[i]), ++i;
              else if (/[0-7]{3}/.test(e.substr(i + 1, 3)))
                (t += String.fromCharCode(parseInt(e.substr(i + 1, 3), 8))),
                  (i += 4);
              else {
                for (var r = 1; i + r < e.length && "\\" === e[i + r]; ) r++;
                for (var n = 0; n < Math.floor(r / 2); ++n) t += "\\";
                i += 2 * Math.floor(r / 2);
              }
            return new g(t, "binary");
          }, "parseBytea"));
      }),
      Y = I((e, t) => {
        D();
        var i = V(),
          r = W(),
          n = G(),
          s = X(),
          a = H();
        function o(e) {
          return S(function (t) {
            return null === t ? t : e(t);
          }, "nullAllowed");
        }
        function u(e) {
          return null === e
            ? e
            : "TRUE" === e ||
                "t" === e ||
                "true" === e ||
                "y" === e ||
                "yes" === e ||
                "on" === e ||
                "1" === e;
        }
        function l(e) {
          return e ? i.parse(e, u) : null;
        }
        function c(e) {
          return parseInt(e, 10);
        }
        function d(e) {
          return e ? i.parse(e, o(c)) : null;
        }
        function f(e) {
          return e
            ? i.parse(
                e,
                o(function (e) {
                  return _(e).trim();
                }),
              )
            : null;
        }
        S(o, "allowNull"),
          S(u, "parseBool"),
          S(l, "parseBoolArray"),
          S(c, "parseBaseTenInt"),
          S(d, "parseIntegerArray"),
          S(f, "parseBigIntegerArray");
        var h = S(function (e) {
            return e
              ? r
                  .create(e, function (e) {
                    return null !== e && (e = x(e)), e;
                  })
                  .parse()
              : null;
          }, "parsePointArray"),
          p = S(function (e) {
            return e
              ? r
                  .create(e, function (e) {
                    return null !== e && (e = parseFloat(e)), e;
                  })
                  .parse()
              : null;
          }, "parseFloatArray"),
          m = S(function (e) {
            return e ? r.create(e).parse() : null;
          }, "parseStringArray"),
          g = S(function (e) {
            return e
              ? r
                  .create(e, function (e) {
                    return null !== e && (e = n(e)), e;
                  })
                  .parse()
              : null;
          }, "parseDateArray"),
          v = S(function (e) {
            return e
              ? r
                  .create(e, function (e) {
                    return null !== e && (e = s(e)), e;
                  })
                  .parse()
              : null;
          }, "parseIntervalArray"),
          y = S(function (e) {
            return e ? i.parse(e, o(a)) : null;
          }, "parseByteAArray"),
          b = S(function (e) {
            return parseInt(e, 10);
          }, "parseInteger"),
          _ = S(function (e) {
            var t = String(e);
            return /^\d+$/.test(t) ? t : e;
          }, "parseBigInteger"),
          $ = S(function (e) {
            return e ? i.parse(e, o(JSON.parse)) : null;
          }, "parseJsonArray"),
          x = S(function (e) {
            return "(" !== e[0]
              ? null
              : {
                  x: parseFloat(
                    (e = e.substring(1, e.length - 1).split(","))[0],
                  ),
                  y: parseFloat(e[1]),
                };
          }, "parsePoint"),
          w = S(function (e) {
            if ("<" !== e[0] && "(" !== e[1]) return null;
            for (var t = "(", i = "", r = !1, n = 2; n < e.length - 1; n++) {
              if ((r || (t += e[n]), ")" === e[n])) {
                r = !0;
                continue;
              }
              r && "," !== e[n] && (i += e[n]);
            }
            var s = x(t);
            return (s.radius = parseFloat(i)), s;
          }, "parseCircle");
        t.exports = {
          init: S(function (e) {
            e(20, _),
              e(21, b),
              e(23, b),
              e(26, b),
              e(700, parseFloat),
              e(701, parseFloat),
              e(16, u),
              e(1082, n),
              e(1114, n),
              e(1184, n),
              e(600, x),
              e(651, m),
              e(718, w),
              e(1e3, l),
              e(1001, y),
              e(1005, d),
              e(1007, d),
              e(1028, d),
              e(1016, f),
              e(1017, h),
              e(1021, p),
              e(1022, p),
              e(1231, p),
              e(1014, m),
              e(1015, m),
              e(1008, m),
              e(1009, m),
              e(1040, m),
              e(1041, m),
              e(1115, g),
              e(1182, g),
              e(1185, g),
              e(1186, s),
              e(1187, v),
              e(17, a),
              e(114, JSON.parse.bind(JSON)),
              e(3802, JSON.parse.bind(JSON)),
              e(199, $),
              e(3807, $),
              e(3907, m),
              e(2951, m),
              e(791, m),
              e(1183, m),
              e(1270, m);
          }, "init"),
        };
      }),
      ee = I((e, t) => {
        function i(e) {
          var t = e.readInt32BE(0),
            i = e.readUInt32BE(4),
            r = "";
          t < 0 && ((t = ~t + (0 === i)), (i = (~i + 1) >>> 0), (r = "-"));
          var n,
            s,
            a,
            o,
            u,
            l,
            c = "";
          if (
            ((n = t % 1e6),
            (t = (t / 1e6) >>> 0),
            (i = ((s = 0x100000000 * n + i) / 1e6) >>> 0),
            (a = "" + (s - 1e6 * i)),
            0 === i && 0 === t)
          )
            return r + a + c;
          for (o = "", u = 6 - a.length, l = 0; l < u; l++) o += "0";
          if (
            ((c = o + a + c),
            (n = t % 1e6),
            (t = (t / 1e6) >>> 0),
            (i = ((s = 0x100000000 * n + i) / 1e6) >>> 0),
            (a = "" + (s - 1e6 * i)),
            0 === i && 0 === t)
          )
            return r + a + c;
          for (o = "", u = 6 - a.length, l = 0; l < u; l++) o += "0";
          if (
            ((c = o + a + c),
            (n = t % 1e6),
            (t = (t / 1e6) >>> 0),
            (i = ((s = 0x100000000 * n + i) / 1e6) >>> 0),
            (a = "" + (s - 1e6 * i)),
            0 === i && 0 === t)
          )
            return r + a + c;
          for (o = "", u = 6 - a.length, l = 0; l < u; l++) o += "0";
          return (
            (c = o + a + c),
            r + (a = "" + ((s = 0x100000000 * (n = t % 1e6) + i) % 1e6)) + c
          );
        }
        D(), S(i, "readInt8"), (t.exports = i);
      }),
      et = I((e, t) => {
        D();
        var i = ee(),
          r = S(function (e, t, i, r, n) {
            (i = i || 0),
              (r = r || !1),
              (n =
                n ||
                function (e, t, i) {
                  return e * Math.pow(2, i) + t;
                });
            var s = i >> 3,
              a = S(function (e) {
                return r ? 255 & ~e : e;
              }, "inv"),
              o = 255,
              u = 8 - (i % 8);
            t < u && ((o = (255 << (8 - t)) & 255), (u = t)),
              i && (o >>= i % 8);
            var l = 0;
            (i % 8) + t >= 8 && (l = n(0, a(e[s]) & o, u));
            for (var c = (t + i) >> 3, d = s + 1; d < c; d++)
              l = n(l, a(e[d]), 8);
            var f = (t + i) % 8;
            return f > 0 && (l = n(l, a(e[c]) >> (8 - f), f)), l;
          }, "parseBits"),
          n = S(function (e, t, i) {
            var n = Math.pow(2, i - 1) - 1,
              s = r(e, 1),
              a = r(e, i, 1);
            if (0 === a) return 0;
            var o = 1,
              u = r(
                e,
                t,
                i + 1,
                !1,
                S(function (e, t, i) {
                  0 === e && (e = 1);
                  for (var r = 1; r <= i; r++)
                    (o /= 2), (t & (1 << (i - r))) > 0 && (e += o);
                  return e;
                }, "parsePrecisionBits"),
              );
            return a == Math.pow(2, i + 1) - 1
              ? 0 === u
                ? 0 === s
                  ? 1 / 0
                  : -1 / 0
                : NaN
              : (0 === s ? 1 : -1) * Math.pow(2, a - n) * u;
          }, "parseFloatFromBits"),
          s = S(function (e) {
            return 1 == r(e, 1) ? -1 * (r(e, 15, 1, !0) + 1) : r(e, 15, 1);
          }, "parseInt16"),
          a = S(function (e) {
            return 1 == r(e, 1) ? -1 * (r(e, 31, 1, !0) + 1) : r(e, 31, 1);
          }, "parseInt32"),
          o = S(function (e) {
            return n(e, 23, 8);
          }, "parseFloat32"),
          u = S(function (e) {
            return n(e, 52, 11);
          }, "parseFloat64"),
          l = S(function (e) {
            var t = r(e, 16, 32);
            if (49152 == t) return NaN;
            for (
              var i = Math.pow(1e4, r(e, 16, 16)), n = 0, s = r(e, 16), a = 0;
              a < s;
              a++
            )
              (n += r(e, 16, 64 + 16 * a) * i), (i /= 1e4);
            var o = Math.pow(10, r(e, 16, 48));
            return ((0 === t ? 1 : -1) * Math.round(n * o)) / o;
          }, "parseNumeric"),
          c = S(function (e, t) {
            var i = r(t, 1),
              n = r(t, 63, 1),
              s = new Date(((0 === i ? 1 : -1) * n) / 1e3 + 9466848e5);
            return (
              e || s.setTime(s.getTime() + 6e4 * s.getTimezoneOffset()),
              (s.usec = n % 1e3),
              (s.getMicroSeconds = function () {
                return this.usec;
              }),
              (s.setMicroSeconds = function (e) {
                this.usec = e;
              }),
              (s.getUTCMicroSeconds = function () {
                return this.usec;
              }),
              s
            );
          }, "parseDate"),
          d = S(function (e) {
            for (
              var t = r(e, 32),
                i = (r(e, 32, 32), r(e, 32, 64)),
                n = 96,
                s = [],
                a = 0;
              a < t;
              a++
            )
              (s[a] = r(e, 32, n)), (n += 64);
            var o = S(function (t) {
                var i,
                  s = r(e, 32, n);
                return ((n += 32), 0xffffffff == s)
                  ? null
                  : 23 == t || 20 == t
                    ? ((i = r(e, 8 * s, n)), (n += 8 * s), i)
                    : 25 == t
                      ? e.toString(this.encoding, n >> 3, (n += s << 3) >> 3)
                      : void console.log(
                          "ERROR: ElementType not implemented: " + t,
                        );
              }, "parseElement"),
              u = S(function (e, t) {
                var i,
                  r = [];
                if (e.length > 1) {
                  var n = e.shift();
                  for (i = 0; i < n; i++) r[i] = u(e, t);
                  e.unshift(n);
                } else for (i = 0; i < e[0]; i++) r[i] = o(t);
                return r;
              }, "parse");
            return u(s, i);
          }, "parseArray"),
          f = S(function (e) {
            return e.toString("utf8");
          }, "parseText"),
          h = S(function (e) {
            return null === e ? null : r(e, 8) > 0;
          }, "parseBool");
        t.exports = {
          init: S(function (e) {
            e(20, i),
              e(21, s),
              e(23, a),
              e(26, a),
              e(1700, l),
              e(700, o),
              e(701, u),
              e(16, h),
              e(1114, c.bind(null, !1)),
              e(1184, c.bind(null, !0)),
              e(1e3, d),
              e(1007, d),
              e(1016, d),
              e(1008, d),
              e(1009, d),
              e(25, f);
          }, "init"),
        };
      }),
      ei = I((e, t) => {
        D(),
          (t.exports = {
            BOOL: 16,
            BYTEA: 17,
            CHAR: 18,
            INT8: 20,
            INT2: 21,
            INT4: 23,
            REGPROC: 24,
            TEXT: 25,
            OID: 26,
            TID: 27,
            XID: 28,
            CID: 29,
            JSON: 114,
            XML: 142,
            PG_NODE_TREE: 194,
            SMGR: 210,
            PATH: 602,
            POLYGON: 604,
            CIDR: 650,
            FLOAT4: 700,
            FLOAT8: 701,
            ABSTIME: 702,
            RELTIME: 703,
            TINTERVAL: 704,
            CIRCLE: 718,
            MACADDR8: 774,
            MONEY: 790,
            MACADDR: 829,
            INET: 869,
            ACLITEM: 1033,
            BPCHAR: 1042,
            VARCHAR: 1043,
            DATE: 1082,
            TIME: 1083,
            TIMESTAMP: 1114,
            TIMESTAMPTZ: 1184,
            INTERVAL: 1186,
            TIMETZ: 1266,
            BIT: 1560,
            VARBIT: 1562,
            NUMERIC: 1700,
            REFCURSOR: 1790,
            REGPROCEDURE: 2202,
            REGOPER: 2203,
            REGOPERATOR: 2204,
            REGCLASS: 2205,
            REGTYPE: 2206,
            UUID: 2950,
            TXID_SNAPSHOT: 2970,
            PG_LSN: 3220,
            PG_NDISTINCT: 3361,
            PG_DEPENDENCIES: 3402,
            TSVECTOR: 3614,
            TSQUERY: 3615,
            GTSVECTOR: 3642,
            REGCONFIG: 3734,
            REGDICTIONARY: 3769,
            JSONB: 3802,
            REGNAMESPACE: 4089,
            REGROLE: 4096,
          });
      }),
      er = I((e) => {
        D();
        var t = Y(),
          i = et(),
          r = W(),
          n = ei();
        (e.getTypeParser = o),
          (e.setTypeParser = u),
          (e.arrayParser = r),
          (e.builtins = n);
        var s = { text: {}, binary: {} };
        function a(e) {
          return String(e);
        }
        function o(e, t) {
          return (s[(t = t || "text")] && s[t][e]) || a;
        }
        function u(e, t, i) {
          "function" == typeof t && ((i = t), (t = "text")), (s[t][e] = i);
        }
        S(a, "noParse"),
          S(o, "getTypeParser"),
          S(u, "setTypeParser"),
          t.init(function (e, t) {
            s.text[e] = t;
          }),
          i.init(function (e, t) {
            s.binary[e] = t;
          });
      }),
      en = I((e, t) => {
        D();
        var i = er();
        function r(e) {
          (this._types = e || i), (this.text = {}), (this.binary = {});
        }
        S(r, "TypeOverrides"),
          (r.prototype.getOverrides = function (e) {
            switch (e) {
              case "text":
                return this.text;
              case "binary":
                return this.binary;
              default:
                return {};
            }
          }),
          (r.prototype.setTypeParser = function (e, t, i) {
            "function" == typeof t && ((i = t), (t = "text")),
              (this.getOverrides(t)[e] = i);
          }),
          (r.prototype.getTypeParser = function (e, t) {
            return (
              (t = t || "text"),
              this.getOverrides(t)[e] || this._types.getTypeParser(e, t)
            );
          }),
          (t.exports = r);
      });
    function es(e) {
      let t = 0x6a09e667,
        i = 0xbb67ae85,
        r = 0x3c6ef372,
        n = 0xa54ff53a,
        s = 0x510e527f,
        a = 0x9b05688c,
        o = 0x1f83d9ab,
        u = 0x5be0cd19,
        l = 0,
        c = 0,
        d = [
          0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
          0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
          0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
          0xc19bf174, 0xe49b69c1, 0xefbe4786, 0xfc19dc6, 0x240ca1cc, 0x2de92c6f,
          0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
          0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x6ca6351, 0x14292967,
          0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354,
          0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
          0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585,
          0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
          0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee,
          0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb,
          0xbef9a3f7, 0xc67178f2,
        ],
        f = S((e, t) => (e >>> t) | (e << (32 - t)), "rrot"),
        h = new Uint32Array(64),
        p = new Uint8Array(64),
        m = S(() => {
          for (let e = 0, t = 0; e < 16; e++, t += 4)
            h[e] = (p[t] << 24) | (p[t + 1] << 16) | (p[t + 2] << 8) | p[t + 3];
          for (let e = 16; e < 64; e++) {
            let t = f(h[e - 15], 7) ^ f(h[e - 15], 18) ^ (h[e - 15] >>> 3),
              i = f(h[e - 2], 17) ^ f(h[e - 2], 19) ^ (h[e - 2] >>> 10);
            h[e] = (h[e - 16] + t + h[e - 7] + i) | 0;
          }
          let e = t,
            l = i,
            m = r,
            g = n,
            v = s,
            y = a,
            b = o,
            _ = u;
          for (let t = 0; t < 64; t++) {
            let i =
                (_ +
                  (f(v, 6) ^ f(v, 11) ^ f(v, 25)) +
                  ((v & y) ^ (~v & b)) +
                  d[t] +
                  h[t]) |
                0,
              r =
                ((f(e, 2) ^ f(e, 13) ^ f(e, 22)) +
                  ((e & l) ^ (e & m) ^ (l & m))) |
                0;
            (_ = b),
              (b = y),
              (y = v),
              (v = (g + i) | 0),
              (g = m),
              (m = l),
              (l = e),
              (e = (i + r) | 0);
          }
          (t = (t + e) | 0),
            (i = (i + l) | 0),
            (r = (r + m) | 0),
            (n = (n + g) | 0),
            (s = (s + v) | 0),
            (a = (a + y) | 0),
            (o = (o + b) | 0),
            (u = (u + _) | 0),
            (c = 0);
        }, "process"),
        g = S((e) => {
          "string" == typeof e && (e = new TextEncoder().encode(e));
          for (let t = 0; t < e.length; t++) (p[c++] = e[t]), 64 === c && m();
          l += e.length;
        }, "add"),
        v = S(() => {
          if (((p[c++] = 128), 64 == c && m(), c + 8 > 64)) {
            for (; c < 64; ) p[c++] = 0;
            m();
          }
          for (; c < 58; ) p[c++] = 0;
          let e = 8 * l;
          (p[c++] = (e / 0x10000000000) & 255),
            (p[c++] = (e / 0x100000000) & 255),
            (p[c++] = e >>> 24),
            (p[c++] = (e >>> 16) & 255),
            (p[c++] = (e >>> 8) & 255),
            (p[c++] = 255 & e),
            m();
          let d = new Uint8Array(32);
          return (
            (d[0] = t >>> 24),
            (d[1] = (t >>> 16) & 255),
            (d[2] = (t >>> 8) & 255),
            (d[3] = 255 & t),
            (d[4] = i >>> 24),
            (d[5] = (i >>> 16) & 255),
            (d[6] = (i >>> 8) & 255),
            (d[7] = 255 & i),
            (d[8] = r >>> 24),
            (d[9] = (r >>> 16) & 255),
            (d[10] = (r >>> 8) & 255),
            (d[11] = 255 & r),
            (d[12] = n >>> 24),
            (d[13] = (n >>> 16) & 255),
            (d[14] = (n >>> 8) & 255),
            (d[15] = 255 & n),
            (d[16] = s >>> 24),
            (d[17] = (s >>> 16) & 255),
            (d[18] = (s >>> 8) & 255),
            (d[19] = 255 & s),
            (d[20] = a >>> 24),
            (d[21] = (a >>> 16) & 255),
            (d[22] = (a >>> 8) & 255),
            (d[23] = 255 & a),
            (d[24] = o >>> 24),
            (d[25] = (o >>> 16) & 255),
            (d[26] = (o >>> 8) & 255),
            (d[27] = 255 & o),
            (d[28] = u >>> 24),
            (d[29] = (u >>> 16) & 255),
            (d[30] = (u >>> 8) & 255),
            (d[31] = 255 & u),
            d
          );
        }, "digest");
      return void 0 === e ? { add: g, digest: v } : (g(e), v());
    }
    var ea,
      eo,
      eu = k(() => {
        D(), S(es, "sha256");
      }),
      el = k(() => {
        D(),
          S(
            (ea = class e {
              constructor() {
                O(this, "_dataLength", 0),
                  O(this, "_bufferLength", 0),
                  O(this, "_state", new Int32Array(4)),
                  O(this, "_buffer", new ArrayBuffer(68)),
                  O(this, "_buffer8"),
                  O(this, "_buffer32"),
                  (this._buffer8 = new Uint8Array(this._buffer, 0, 68)),
                  (this._buffer32 = new Uint32Array(this._buffer, 0, 17)),
                  this.start();
              }
              static hashByteArray(e, t = !1) {
                return this.onePassHasher.start().appendByteArray(e).end(t);
              }
              static hashStr(e, t = !1) {
                return this.onePassHasher.start().appendStr(e).end(t);
              }
              static hashAsciiStr(e, t = !1) {
                return this.onePassHasher.start().appendAsciiStr(e).end(t);
              }
              static _hex(t) {
                let i = e.hexChars,
                  r = e.hexOut,
                  n,
                  s,
                  a,
                  o;
                for (o = 0; o < 4; o += 1)
                  for (s = 8 * o, n = t[o], a = 0; a < 8; a += 2)
                    (r[s + 1 + a] = i.charAt(15 & n)),
                      (n >>>= 4),
                      (r[s + 0 + a] = i.charAt(15 & n)),
                      (n >>>= 4);
                return r.join("");
              }
              static _md5cycle(e, t) {
                let i = e[0],
                  r = e[1],
                  n = e[2],
                  s = e[3];
                (i += (((r & n) | (~r & s)) + t[0] - 0x28955b88) | 0),
                  (s +=
                    ((((i = (((i << 7) | (i >>> 25)) + r) | 0) & r) |
                      (~i & n)) +
                      t[1] -
                      0x173848aa) |
                    0),
                  (n +=
                    ((((s = (((s << 12) | (s >>> 20)) + i) | 0) & i) |
                      (~s & r)) +
                      t[2] +
                      0x242070db) |
                    0),
                  (r +=
                    ((((n = (((n << 17) | (n >>> 15)) + s) | 0) & s) |
                      (~n & i)) +
                      t[3] -
                      0x3e423112) |
                    0),
                  (i +=
                    ((((r = (((r << 22) | (r >>> 10)) + n) | 0) & n) |
                      (~r & s)) +
                      t[4] -
                      0xa83f051) |
                    0),
                  (s +=
                    ((((i = (((i << 7) | (i >>> 25)) + r) | 0) & r) |
                      (~i & n)) +
                      t[5] +
                      0x4787c62a) |
                    0),
                  (n +=
                    ((((s = (((s << 12) | (s >>> 20)) + i) | 0) & i) |
                      (~s & r)) +
                      t[6] -
                      0x57cfb9ed) |
                    0),
                  (r +=
                    ((((n = (((n << 17) | (n >>> 15)) + s) | 0) & s) |
                      (~n & i)) +
                      t[7] -
                      0x2b96aff) |
                    0),
                  (i +=
                    ((((r = (((r << 22) | (r >>> 10)) + n) | 0) & n) |
                      (~r & s)) +
                      t[8] +
                      0x698098d8) |
                    0),
                  (s +=
                    ((((i = (((i << 7) | (i >>> 25)) + r) | 0) & r) |
                      (~i & n)) +
                      t[9] -
                      0x74bb0851) |
                    0),
                  (n +=
                    ((((s = (((s << 12) | (s >>> 20)) + i) | 0) & i) |
                      (~s & r)) +
                      t[10] -
                      42063) |
                    0),
                  (r +=
                    ((((n = (((n << 17) | (n >>> 15)) + s) | 0) & s) |
                      (~n & i)) +
                      t[11] -
                      0x76a32842) |
                    0),
                  (i +=
                    ((((r = (((r << 22) | (r >>> 10)) + n) | 0) & n) |
                      (~r & s)) +
                      t[12] +
                      0x6b901122) |
                    0),
                  (s +=
                    ((((i = (((i << 7) | (i >>> 25)) + r) | 0) & r) |
                      (~i & n)) +
                      t[13] -
                      0x2678e6d) |
                    0),
                  (n +=
                    ((((s = (((s << 12) | (s >>> 20)) + i) | 0) & i) |
                      (~s & r)) +
                      t[14] -
                      0x5986bc72) |
                    0),
                  (r +=
                    ((((n = (((n << 17) | (n >>> 15)) + s) | 0) & s) |
                      (~n & i)) +
                      t[15] +
                      0x49b40821) |
                    0),
                  (i +=
                    ((((r = (((r << 22) | (r >>> 10)) + n) | 0) & s) |
                      (n & ~s)) +
                      t[1] -
                      0x9e1da9e) |
                    0),
                  (s +=
                    ((((i = (((i << 5) | (i >>> 27)) + r) | 0) & n) |
                      (r & ~n)) +
                      t[6] -
                      0x3fbf4cc0) |
                    0),
                  (n +=
                    ((((s = (((s << 9) | (s >>> 23)) + i) | 0) & r) |
                      (i & ~r)) +
                      t[11] +
                      0x265e5a51) |
                    0),
                  (r +=
                    ((((n = (((n << 14) | (n >>> 18)) + s) | 0) & i) |
                      (s & ~i)) +
                      t[0] -
                      0x16493856) |
                    0),
                  (i +=
                    ((((r = (((r << 20) | (r >>> 12)) + n) | 0) & s) |
                      (n & ~s)) +
                      t[5] -
                      0x29d0efa3) |
                    0),
                  (s +=
                    ((((i = (((i << 5) | (i >>> 27)) + r) | 0) & n) |
                      (r & ~n)) +
                      t[10] +
                      0x2441453) |
                    0),
                  (n +=
                    ((((s = (((s << 9) | (s >>> 23)) + i) | 0) & r) |
                      (i & ~r)) +
                      t[15] -
                      0x275e197f) |
                    0),
                  (r +=
                    ((((n = (((n << 14) | (n >>> 18)) + s) | 0) & i) |
                      (s & ~i)) +
                      t[4] -
                      0x182c0438) |
                    0),
                  (i +=
                    ((((r = (((r << 20) | (r >>> 12)) + n) | 0) & s) |
                      (n & ~s)) +
                      t[9] +
                      0x21e1cde6) |
                    0),
                  (s +=
                    ((((i = (((i << 5) | (i >>> 27)) + r) | 0) & n) |
                      (r & ~n)) +
                      t[14] -
                      0x3cc8f82a) |
                    0),
                  (n +=
                    ((((s = (((s << 9) | (s >>> 23)) + i) | 0) & r) |
                      (i & ~r)) +
                      t[3] -
                      0xb2af279) |
                    0),
                  (r +=
                    ((((n = (((n << 14) | (n >>> 18)) + s) | 0) & i) |
                      (s & ~i)) +
                      t[8] +
                      0x455a14ed) |
                    0),
                  (i +=
                    ((((r = (((r << 20) | (r >>> 12)) + n) | 0) & s) |
                      (n & ~s)) +
                      t[13] -
                      0x561c16fb) |
                    0),
                  (s +=
                    ((((i = (((i << 5) | (i >>> 27)) + r) | 0) & n) |
                      (r & ~n)) +
                      t[2] -
                      0x3105c08) |
                    0),
                  (n +=
                    ((((s = (((s << 9) | (s >>> 23)) + i) | 0) & r) |
                      (i & ~r)) +
                      t[7] +
                      0x676f02d9) |
                    0),
                  (r +=
                    ((((n = (((n << 14) | (n >>> 18)) + s) | 0) & i) |
                      (s & ~i)) +
                      t[12] -
                      0x72d5b376) |
                    0),
                  (i +=
                    (((r = (((r << 20) | (r >>> 12)) + n) | 0) ^ n ^ s) +
                      t[5] -
                      378558) |
                    0),
                  (s +=
                    (((i = (((i << 4) | (i >>> 28)) + r) | 0) ^ r ^ n) +
                      t[8] -
                      0x788e097f) |
                    0),
                  (n +=
                    (((s = (((s << 11) | (s >>> 21)) + i) | 0) ^ i ^ r) +
                      t[11] +
                      0x6d9d6122) |
                    0),
                  (r +=
                    (((n = (((n << 16) | (n >>> 16)) + s) | 0) ^ s ^ i) +
                      t[14] -
                      0x21ac7f4) |
                    0),
                  (i +=
                    (((r = (((r << 23) | (r >>> 9)) + n) | 0) ^ n ^ s) +
                      t[1] -
                      0x5b4115bc) |
                    0),
                  (s +=
                    (((i = (((i << 4) | (i >>> 28)) + r) | 0) ^ r ^ n) +
                      t[4] +
                      0x4bdecfa9) |
                    0),
                  (n +=
                    (((s = (((s << 11) | (s >>> 21)) + i) | 0) ^ i ^ r) +
                      t[7] -
                      0x944b4a0) |
                    0),
                  (r +=
                    (((n = (((n << 16) | (n >>> 16)) + s) | 0) ^ s ^ i) +
                      t[10] -
                      0x41404390) |
                    0),
                  (i +=
                    (((r = (((r << 23) | (r >>> 9)) + n) | 0) ^ n ^ s) +
                      t[13] +
                      0x289b7ec6) |
                    0),
                  (s +=
                    (((i = (((i << 4) | (i >>> 28)) + r) | 0) ^ r ^ n) +
                      t[0] -
                      0x155ed806) |
                    0),
                  (n +=
                    (((s = (((s << 11) | (s >>> 21)) + i) | 0) ^ i ^ r) +
                      t[3] -
                      0x2b10cf7b) |
                    0),
                  (r +=
                    (((n = (((n << 16) | (n >>> 16)) + s) | 0) ^ s ^ i) +
                      t[6] +
                      0x4881d05) |
                    0),
                  (i +=
                    (((r = (((r << 23) | (r >>> 9)) + n) | 0) ^ n ^ s) +
                      t[9] -
                      0x262b2fc7) |
                    0),
                  (s +=
                    (((i = (((i << 4) | (i >>> 28)) + r) | 0) ^ r ^ n) +
                      t[12] -
                      0x1924661b) |
                    0),
                  (n +=
                    (((s = (((s << 11) | (s >>> 21)) + i) | 0) ^ i ^ r) +
                      t[15] +
                      0x1fa27cf8) |
                    0),
                  (r +=
                    (((n = (((n << 16) | (n >>> 16)) + s) | 0) ^ s ^ i) +
                      t[2] -
                      0x3b53a99b) |
                    0),
                  (r = (((r << 23) | (r >>> 9)) + n) | 0),
                  (i += ((n ^ (r | ~s)) + t[0] - 0xbd6ddbc) | 0),
                  (i = (((i << 6) | (i >>> 26)) + r) | 0),
                  (s += ((r ^ (i | ~n)) + t[7] + 0x432aff97) | 0),
                  (s = (((s << 10) | (s >>> 22)) + i) | 0),
                  (n += ((i ^ (s | ~r)) + t[14] - 0x546bdc59) | 0),
                  (n = (((n << 15) | (n >>> 17)) + s) | 0),
                  (r += ((s ^ (n | ~i)) + t[5] - 0x36c5fc7) | 0),
                  (r = (((r << 21) | (r >>> 11)) + n) | 0),
                  (i += ((n ^ (r | ~s)) + t[12] + 0x655b59c3) | 0),
                  (i = (((i << 6) | (i >>> 26)) + r) | 0),
                  (s += ((r ^ (i | ~n)) + t[3] - 0x70f3336e) | 0),
                  (s = (((s << 10) | (s >>> 22)) + i) | 0),
                  (n += ((i ^ (s | ~r)) + t[10] - 1051523) | 0),
                  (n = (((n << 15) | (n >>> 17)) + s) | 0),
                  (r += ((s ^ (n | ~i)) + t[1] - 0x7a7ba22f) | 0),
                  (r = (((r << 21) | (r >>> 11)) + n) | 0),
                  (i += ((n ^ (r | ~s)) + t[8] + 0x6fa87e4f) | 0),
                  (i = (((i << 6) | (i >>> 26)) + r) | 0),
                  (s += ((r ^ (i | ~n)) + t[15] - 0x1d31920) | 0),
                  (s = (((s << 10) | (s >>> 22)) + i) | 0),
                  (n += ((i ^ (s | ~r)) + t[6] - 0x5cfebcec) | 0),
                  (n = (((n << 15) | (n >>> 17)) + s) | 0),
                  (r += ((s ^ (n | ~i)) + t[13] + 0x4e0811a1) | 0),
                  (r = (((r << 21) | (r >>> 11)) + n) | 0),
                  (i += ((n ^ (r | ~s)) + t[4] - 0x8ac817e) | 0),
                  (i = (((i << 6) | (i >>> 26)) + r) | 0),
                  (s += ((r ^ (i | ~n)) + t[11] - 0x42c50dcb) | 0),
                  (s = (((s << 10) | (s >>> 22)) + i) | 0),
                  (n += ((i ^ (s | ~r)) + t[2] + 0x2ad7d2bb) | 0),
                  (n = (((n << 15) | (n >>> 17)) + s) | 0),
                  (r += ((s ^ (n | ~i)) + t[9] - 0x14792c6f) | 0),
                  (r = (((r << 21) | (r >>> 11)) + n) | 0),
                  (e[0] = (i + e[0]) | 0),
                  (e[1] = (r + e[1]) | 0),
                  (e[2] = (n + e[2]) | 0),
                  (e[3] = (s + e[3]) | 0);
              }
              start() {
                return (
                  (this._dataLength = 0),
                  (this._bufferLength = 0),
                  this._state.set(e.stateIdentity),
                  this
                );
              }
              appendStr(t) {
                let i = this._buffer8,
                  r = this._buffer32,
                  n = this._bufferLength,
                  s,
                  a;
                for (a = 0; a < t.length; a += 1) {
                  if ((s = t.charCodeAt(a)) < 128) i[n++] = s;
                  else if (s < 2048)
                    (i[n++] = (s >>> 6) + 192), (i[n++] = (63 & s) | 128);
                  else if (s < 55296 || s > 56319)
                    (i[n++] = (s >>> 12) + 224),
                      (i[n++] = ((s >>> 6) & 63) | 128),
                      (i[n++] = (63 & s) | 128);
                  else {
                    if (
                      (s =
                        (s - 55296) * 1024 +
                        (t.charCodeAt(++a) - 56320) +
                        65536) > 1114111
                    )
                      throw Error(
                        "Unicode standard supports code points up to U+10FFFF",
                      );
                    (i[n++] = (s >>> 18) + 240),
                      (i[n++] = ((s >>> 12) & 63) | 128),
                      (i[n++] = ((s >>> 6) & 63) | 128),
                      (i[n++] = (63 & s) | 128);
                  }
                  n >= 64 &&
                    ((this._dataLength += 64),
                    e._md5cycle(this._state, r),
                    (n -= 64),
                    (r[0] = r[16]));
                }
                return (this._bufferLength = n), this;
              }
              appendAsciiStr(t) {
                let i = this._buffer8,
                  r = this._buffer32,
                  n = this._bufferLength,
                  s,
                  a = 0;
                for (;;) {
                  for (s = Math.min(t.length - a, 64 - n); s--; )
                    i[n++] = t.charCodeAt(a++);
                  if (n < 64) break;
                  (this._dataLength += 64),
                    e._md5cycle(this._state, r),
                    (n = 0);
                }
                return (this._bufferLength = n), this;
              }
              appendByteArray(t) {
                let i = this._buffer8,
                  r = this._buffer32,
                  n = this._bufferLength,
                  s,
                  a = 0;
                for (;;) {
                  for (s = Math.min(t.length - a, 64 - n); s--; )
                    i[n++] = t[a++];
                  if (n < 64) break;
                  (this._dataLength += 64),
                    e._md5cycle(this._state, r),
                    (n = 0);
                }
                return (this._bufferLength = n), this;
              }
              getState() {
                let e = this._state;
                return {
                  buffer: String.fromCharCode.apply(
                    null,
                    Array.from(this._buffer8),
                  ),
                  buflen: this._bufferLength,
                  length: this._dataLength,
                  state: [e[0], e[1], e[2], e[3]],
                };
              }
              setState(e) {
                let t = e.buffer,
                  i = e.state,
                  r = this._state,
                  n;
                for (
                  this._dataLength = e.length,
                    this._bufferLength = e.buflen,
                    r[0] = i[0],
                    r[1] = i[1],
                    r[2] = i[2],
                    r[3] = i[3],
                    n = 0;
                  n < t.length;
                  n += 1
                )
                  this._buffer8[n] = t.charCodeAt(n);
              }
              end(t = !1) {
                let i = this._bufferLength,
                  r = this._buffer8,
                  n = this._buffer32,
                  s = (i >> 2) + 1;
                this._dataLength += i;
                let a = 8 * this._dataLength;
                if (
                  ((r[i] = 128),
                  (r[i + 1] = r[i + 2] = r[i + 3] = 0),
                  n.set(e.buffer32Identity.subarray(s), s),
                  i > 55 &&
                    (e._md5cycle(this._state, n), n.set(e.buffer32Identity)),
                  a <= 0xffffffff)
                )
                  n[14] = a;
                else {
                  let e = a.toString(16).match(/(.*?)(.{0,8})$/);
                  if (null === e) return;
                  let t = parseInt(e[2], 16),
                    i = parseInt(e[1], 16) || 0;
                  (n[14] = t), (n[15] = i);
                }
                return (
                  e._md5cycle(this._state, n),
                  t ? this._state : e._hex(this._state)
                );
              }
            }),
            "Md5",
          ),
          O(
            ea,
            "stateIdentity",
            new Int32Array([0x67452301, -0x10325477, -0x67452302, 0x10325476]),
          ),
          O(
            ea,
            "buffer32Identity",
            new Int32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          ),
          O(ea, "hexChars", "0123456789abcdef"),
          O(ea, "hexOut", []),
          O(ea, "onePassHasher", new ea()),
          (eo = ea);
      }),
      ec = {};
    function ed(e) {
      return crypto.getRandomValues(g.alloc(e));
    }
    function ef(e) {
      if ("sha256" === e)
        return {
          update: S(function (e) {
            return {
              digest: S(function () {
                return g.from(es(e));
              }, "digest"),
            };
          }, "update"),
        };
      if ("md5" === e)
        return {
          update: S(function (e) {
            return {
              digest: S(function () {
                return "string" == typeof e
                  ? eo.hashStr(e)
                  : eo.hashByteArray(e);
              }, "digest"),
            };
          }, "update"),
        };
      throw Error(`Hash type '${e}' not supported`);
    }
    function eh(e, t) {
      if ("sha256" !== e)
        throw Error(`\
Only sha256 is supported (requested: '${e}')`);
      return {
        update: S(function (e) {
          return {
            digest: S(function () {
              "string" == typeof t && (t = new TextEncoder().encode(t)),
                "string" == typeof e && (e = new TextEncoder().encode(e));
              let i = t.length;
              if (i > 64) t = es(t);
              else if (i < 64) {
                let e = new Uint8Array(64);
                e.set(t), (t = e);
              }
              let r = new Uint8Array(64),
                n = new Uint8Array(64);
              for (let e = 0; e < 64; e++)
                (r[e] = 54 ^ t[e]), (n[e] = 92 ^ t[e]);
              let s = new Uint8Array(e.length + 64);
              s.set(r, 0), s.set(e, 64);
              let a = new Uint8Array(96);
              return a.set(n, 0), a.set(es(s), 64), g.from(es(a));
            }, "digest"),
          };
        }, "update"),
      };
    }
    E(ec, {
      createHash: () => ef,
      createHmac: () => eh,
      randomBytes: () => ed,
    });
    var ep = k(() => {
        D(),
          eu(),
          el(),
          S(ed, "randomBytes"),
          S(ef, "createHash"),
          S(eh, "createHmac");
      }),
      em = I((e, t) => {
        D(),
          (t.exports = {
            host: "localhost",
            user: "win32" === v.platform ? v.env.USERNAME : v.env.USER,
            database: void 0,
            password: null,
            connectionString: void 0,
            port: 5432,
            rows: 0,
            binary: !1,
            max: 10,
            idleTimeoutMillis: 3e4,
            client_encoding: "",
            ssl: !1,
            application_name: void 0,
            fallback_application_name: void 0,
            options: void 0,
            parseInputDatesAsUTC: !1,
            statement_timeout: !1,
            lock_timeout: !1,
            idle_in_transaction_session_timeout: !1,
            query_timeout: !1,
            connect_timeout: 0,
            keepalives: 1,
            keepalives_idle: 0,
          });
        var i = er(),
          r = i.getTypeParser(20, "text"),
          n = i.getTypeParser(1016, "text");
        t.exports.__defineSetter__("parseInt8", function (e) {
          i.setTypeParser(20, "text", e ? i.getTypeParser(23, "text") : r),
            i.setTypeParser(
              1016,
              "text",
              e ? i.getTypeParser(1007, "text") : n,
            );
        });
      }),
      eg = I((e, t) => {
        D();
        var i = (ep(), T(ec)),
          r = em();
        function n(e) {
          return '"' + e.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
        }
        function s(e) {
          for (var t = "{", i = 0; i < e.length; i++)
            i > 0 && (t += ","),
              null === e[i] || typeof e[i] > "u"
                ? (t += "NULL")
                : Array.isArray(e[i])
                  ? (t += s(e[i]))
                  : e[i] instanceof g
                    ? (t += "\\\\x" + e[i].toString("hex"))
                    : (t += n(a(e[i])));
          return t + "}";
        }
        S(n, "escapeElement"), S(s, "arrayString");
        var a = S(function (e, t) {
          if (null == e) return null;
          if (e instanceof g) return e;
          if (ArrayBuffer.isView(e)) {
            var i = g.from(e.buffer, e.byteOffset, e.byteLength);
            return i.length === e.byteLength
              ? i
              : i.slice(e.byteOffset, e.byteOffset + e.byteLength);
          }
          return e instanceof Date
            ? r.parseInputDatesAsUTC
              ? c(e)
              : l(e)
            : Array.isArray(e)
              ? s(e)
              : "object" == typeof e
                ? o(e, t)
                : e.toString();
        }, "prepareValue");
        function o(e, t) {
          if (e && "function" == typeof e.toPostgres) {
            if (-1 !== (t = t || []).indexOf(e))
              throw Error(
                'circular reference detected while preparing "' +
                  e +
                  '" for query',
              );
            return t.push(e), a(e.toPostgres(a), t);
          }
          return JSON.stringify(e);
        }
        function u(e, t) {
          for (e = "" + e; e.length < t; ) e = "0" + e;
          return e;
        }
        function l(e) {
          var t = -e.getTimezoneOffset(),
            i = e.getFullYear(),
            r = i < 1;
          r && (i = Math.abs(i) + 1);
          var n =
            u(i, 4) +
            "-" +
            u(e.getMonth() + 1, 2) +
            "-" +
            u(e.getDate(), 2) +
            "T" +
            u(e.getHours(), 2) +
            ":" +
            u(e.getMinutes(), 2) +
            ":" +
            u(e.getSeconds(), 2) +
            "." +
            u(e.getMilliseconds(), 3);
          return (
            t < 0 ? ((n += "-"), (t *= -1)) : (n += "+"),
            (n += u(Math.floor(t / 60), 2) + ":" + u(t % 60, 2)),
            r && (n += " BC"),
            n
          );
        }
        function c(e) {
          var t = e.getUTCFullYear(),
            i = t < 1;
          i && (t = Math.abs(t) + 1);
          var r =
            u(t, 4) +
            "-" +
            u(e.getUTCMonth() + 1, 2) +
            "-" +
            u(e.getUTCDate(), 2) +
            "T" +
            u(e.getUTCHours(), 2) +
            ":" +
            u(e.getUTCMinutes(), 2) +
            ":" +
            u(e.getUTCSeconds(), 2) +
            "." +
            u(e.getUTCMilliseconds(), 3);
          return (r += "+00:00"), i && (r += " BC"), r;
        }
        function d(e, t, i) {
          return (
            (e = "string" == typeof e ? { text: e } : e),
            t && ("function" == typeof t ? (e.callback = t) : (e.values = t)),
            i && (e.callback = i),
            e
          );
        }
        S(o, "prepareObject"),
          S(u, "pad"),
          S(l, "dateToString"),
          S(c, "dateToStringUTC"),
          S(d, "normalizeQueryConfig");
        var f = S(function (e) {
            return i.createHash("md5").update(e, "utf-8").digest("hex");
          }, "md5"),
          h = S(function (e, t, i) {
            var r = f(t + e);
            return "md5" + f(g.concat([g.from(r), i]));
          }, "postgresMd5PasswordHash");
        t.exports = {
          prepareValue: S(function (e) {
            return a(e);
          }, "prepareValueWrapper"),
          normalizeQueryConfig: d,
          postgresMd5PasswordHash: h,
          md5: f,
        };
      }),
      ev = {};
    E(ev, { default: () => ey });
    var ey,
      eb = k(() => {
        D(), (ey = {});
      }),
      e_ = I((e, t) => {
        D();
        var i = (ep(), T(ec));
        function r(e) {
          if (-1 === e.indexOf("SCRAM-SHA-256"))
            throw Error(
              "SASL: Only mechanism SCRAM-SHA-256 is currently supported",
            );
          let t = i.randomBytes(18).toString("base64");
          return {
            mechanism: "SCRAM-SHA-256",
            clientNonce: t,
            response: "n,,n=*,r=" + t,
            message: "SASLInitialResponse",
          };
        }
        function n(e, t, i) {
          if ("SASLInitialResponse" !== e.message)
            throw Error("SASL: Last message was not SASLInitialResponse");
          if ("string" != typeof t)
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
            );
          if ("string" != typeof i)
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string",
            );
          let r = l(i);
          if (r.nonce.startsWith(e.clientNonce)) {
            if (r.nonce.length === e.clientNonce.length)
              throw Error(
                "SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short",
              );
          } else
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce",
            );
          var n = p(t, g.from(r.salt, "base64"), r.iteration),
            s = h(n, "Client Key"),
            a = f(s),
            o = "n=*,r=" + e.clientNonce,
            u = "r=" + r.nonce + ",s=" + r.salt + ",i=" + r.iteration,
            c = "c=biws,r=" + r.nonce,
            m = o + "," + u + "," + c,
            v = d(s, h(a, m)).toString("base64"),
            y = h(n, "Server Key"),
            b = h(y, m);
          (e.message = "SASLResponse"),
            (e.serverSignature = b.toString("base64")),
            (e.response = c + ",p=" + v);
        }
        function s(e, t) {
          if ("SASLResponse" !== e.message)
            throw Error("SASL: Last message was not SASLResponse");
          if ("string" != typeof t)
            throw Error(
              "SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string",
            );
          let { serverSignature: i } = c(t);
          if (i !== e.serverSignature)
            throw Error(
              "SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match",
            );
        }
        function a(e) {
          if ("string" != typeof e)
            throw TypeError("SASL: text must be a string");
          return e
            .split("")
            .map((t, i) => e.charCodeAt(i))
            .every((e) => (e >= 33 && e <= 43) || (e >= 45 && e <= 126));
        }
        function o(e) {
          return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(
            e,
          );
        }
        function u(e) {
          if ("string" != typeof e)
            throw TypeError("SASL: attribute pairs text must be a string");
          return new Map(
            e.split(",").map((e) => {
              if (!/^.=/.test(e))
                throw Error("SASL: Invalid attribute pair entry");
              return [e[0], e.substring(2)];
            }),
          );
        }
        function l(e) {
          let t = u(e),
            i = t.get("r");
          if (i) {
            if (!a(i))
              throw Error(
                "SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters",
              );
          } else throw Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
          let r = t.get("s");
          if (r) {
            if (!o(r))
              throw Error(
                "SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64",
              );
          } else throw Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
          let n = t.get("i");
          if (n) {
            if (!/^[1-9][0-9]*$/.test(n))
              throw Error(
                "SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count",
              );
          } else
            throw Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
          return { nonce: i, salt: r, iteration: parseInt(n, 10) };
        }
        function c(e) {
          let t = u(e).get("v");
          if (t) {
            if (!o(t))
              throw Error(
                "SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64",
              );
          } else
            throw Error(
              "SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing",
            );
          return { serverSignature: t };
        }
        function d(e, t) {
          if (!g.isBuffer(e))
            throw TypeError("first argument must be a Buffer");
          if (!g.isBuffer(t))
            throw TypeError("second argument must be a Buffer");
          if (e.length !== t.length) throw Error("Buffer lengths must match");
          if (0 === e.length) throw Error("Buffers cannot be empty");
          return g.from(e.map((i, r) => e[r] ^ t[r]));
        }
        function f(e) {
          return i.createHash("sha256").update(e).digest();
        }
        function h(e, t) {
          return i.createHmac("sha256", e).update(t).digest();
        }
        function p(e, t, i) {
          for (
            var r = h(e, g.concat([t, g.from([0, 0, 0, 1])])), n = r, s = 0;
            s < i - 1;
            s++
          )
            n = d(n, (r = h(e, r)));
          return n;
        }
        S(r, "startSession"),
          S(n, "continueSession"),
          S(s, "finalizeSession"),
          S(a, "isPrintableChars"),
          S(o, "isBase64"),
          S(u, "parseAttributePairs"),
          S(l, "parseServerFirstMessage"),
          S(c, "parseServerFinalMessage"),
          S(d, "xorBuffers"),
          S(f, "sha256"),
          S(h, "hmacSha256"),
          S(p, "Hi"),
          (t.exports = {
            startSession: r,
            continueSession: n,
            finalizeSession: s,
          });
      }),
      e$ = {};
    function ex(...e) {
      return e.join("/");
    }
    E(e$, { join: () => ex });
    var ew = k(() => {
        D(), S(ex, "join");
      }),
      eS = {};
    function ek(e, t) {
      t(Error("No filesystem"));
    }
    E(eS, { stat: () => ek });
    var eI = k(() => {
        D(), S(ek, "stat");
      }),
      eE = {};
    E(eE, { default: () => eP });
    var eP,
      eN = k(() => {
        D(), (eP = {});
      }),
      eT = {};
    E(eT, { StringDecoder: () => ez });
    var eO,
      ez,
      eA = k(() => {
        D(),
          S(
            (eO = class {
              constructor(e) {
                O(this, "td"), (this.td = new TextDecoder(e));
              }
              write(e) {
                return this.td.decode(e, { stream: !0 });
              }
              end(e) {
                return this.td.decode(e);
              }
            }),
            "StringDecoder",
          ),
          (ez = eO);
      }),
      eU = I((e, t) => {
        D();
        var { Transform: i } = (eN(), T(eE)),
          { StringDecoder: r } = (eA(), T(eT)),
          n = Symbol("last"),
          s = Symbol("decoder");
        function a(e, t, i) {
          let r;
          if (this.overflow) {
            if (1 === (r = this[s].write(e).split(this.matcher)).length)
              return i();
            r.shift(), (this.overflow = !1);
          } else
            (this[n] += this[s].write(e)), (r = this[n].split(this.matcher));
          this[n] = r.pop();
          for (let e = 0; e < r.length; e++)
            try {
              u(this, this.mapper(r[e]));
            } catch (e) {
              return i(e);
            }
          ((this.overflow = this[n].length > this.maxLength),
          this.overflow && !this.skipOverflow)
            ? i(Error("maximum buffer reached"))
            : i();
        }
        function o(e) {
          if (((this[n] += this[s].end()), this[n]))
            try {
              u(this, this.mapper(this[n]));
            } catch (t) {
              return e(t);
            }
          e();
        }
        function u(e, t) {
          void 0 !== t && e.push(t);
        }
        function l(e) {
          return e;
        }
        function c(e, t, u) {
          switch (
            ((e = e || /\r?\n/), (t = t || l), (u = u || {}), arguments.length)
          ) {
            case 1:
              "function" == typeof e
                ? ((t = e), (e = /\r?\n/))
                : "object" != typeof e ||
                  e instanceof RegExp ||
                  e[Symbol.split] ||
                  ((u = e), (e = /\r?\n/));
              break;
            case 2:
              "function" == typeof e
                ? ((u = t), (t = e), (e = /\r?\n/))
                : "object" == typeof t && ((u = t), (t = l));
          }
          ((u = Object.assign({}, u)).autoDestroy = !0),
            (u.transform = a),
            (u.flush = o),
            (u.readableObjectMode = !0);
          let c = new i(u);
          return (
            (c[n] = ""),
            (c[s] = new r("utf8")),
            (c.matcher = e),
            (c.mapper = t),
            (c.maxLength = u.maxLength),
            (c.skipOverflow = u.skipOverflow || !1),
            (c.overflow = !1),
            (c._destroy = function (e, t) {
              (this._writableState.errorEmitted = !1), t(e);
            }),
            c
          );
        }
        S(a, "transform"),
          S(o, "flush"),
          S(u, "push"),
          S(l, "noop"),
          S(c, "split"),
          (t.exports = c);
      }),
      eD = I((e, t) => {
        D();
        var i = (ew(), T(e$)),
          r = (eN(), T(eE)).Stream,
          n = eU(),
          s = (eb(), T(ev)),
          a = "win32" === v.platform,
          o = v.stderr;
        function u(e) {
          return (61440 & e) == 32768;
        }
        S(u, "isRegFile");
        var l = ["host", "port", "database", "user", "password"],
          c = l.length,
          d = l[c - 1];
        function f() {
          if (o instanceof r && !0 === o.writable) {
            var e = Array.prototype.slice.call(arguments).concat(`
`);
            o.write(s.format.apply(s, e));
          }
        }
        S(f, "warn"),
          Object.defineProperty(t.exports, "isWin", {
            get: S(function () {
              return a;
            }, "get"),
            set: S(function (e) {
              a = e;
            }, "set"),
          }),
          (t.exports.warnTo = function (e) {
            var t = o;
            return (o = e), t;
          }),
          (t.exports.getFileName = function (e) {
            var t = e || v.env;
            return (
              t.PGPASSFILE ||
              (a
                ? i.join(t.APPDATA || "./", "postgresql", "pgpass.conf")
                : i.join(t.HOME || "./", ".pgpass"))
            );
          }),
          (t.exports.usePgPass = function (e, t) {
            return (
              !Object.prototype.hasOwnProperty.call(v.env, "PGPASSWORD") &&
              (!!a ||
                ((t = t || "<unkn>"),
                u(e.mode)
                  ? !(63 & e.mode) ||
                    (f(
                      'WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less',
                      t,
                    ),
                    !1)
                  : (f('WARNING: password file "%s" is not a plain file', t),
                    !1)))
            );
          });
        var h = (t.exports.match = function (e, t) {
          return l.slice(0, -1).reduce(function (i, r, n) {
            return 1 == n && Number(e[r] || 5432) === Number(t[r])
              ? i && !0
              : i && ("*" === t[r] || t[r] === e[r]);
          }, !0);
        });
        t.exports.getPassword = function (e, t, i) {
          var r,
            s = t.pipe(n());
          function a(t) {
            var i = p(t);
            i && m(i) && h(e, i) && ((r = i[d]), s.end());
          }
          S(a, "onLine");
          var o = S(function () {
              t.destroy(), i(r);
            }, "onEnd"),
            u = S(function (e) {
              t.destroy(),
                f("WARNING: error on reading file: %s", e),
                i(void 0);
            }, "onErr");
          t.on("error", u), s.on("data", a).on("end", o).on("error", u);
        };
        var p = (t.exports.parseLine = function (e) {
            if (e.length < 11 || e.match(/^\s+#/)) return null;
            for (
              var t = "",
                i = "",
                r = 0,
                n = 0,
                s = {},
                a = S(function (t, i, r) {
                  var n = e.substring(i, r);
                  Object.hasOwnProperty.call(v.env, "PGPASS_NO_DEESCAPE") ||
                    (n = n.replace(/\\([:\\])/g, "$1")),
                    (s[l[t]] = n);
                }, "addToObj"),
                o = 0;
              o < e.length - 1;
              o += 1
            ) {
              if (((t = e.charAt(o + 1)), (i = e.charAt(o)), r == c - 1)) {
                a(r, n);
                break;
              }
              o >= 0 &&
                ":" == t &&
                "\\" !== i &&
                (a(r, n, o + 1), (n = o + 2), (r += 1));
            }
            return (s = Object.keys(s).length === c ? s : null);
          }),
          m = (t.exports.isValidEntry = function (e) {
            for (
              var t = {
                  0: function (e) {
                    return e.length > 0;
                  },
                  1: function (e) {
                    return (
                      "*" === e ||
                      (isFinite((e = Number(e))) &&
                        e > 0 &&
                        e < 0x20000000000000 &&
                        Math.floor(e) === e)
                    );
                  },
                  2: function (e) {
                    return e.length > 0;
                  },
                  3: function (e) {
                    return e.length > 0;
                  },
                  4: function (e) {
                    return e.length > 0;
                  },
                },
                i = 0;
              i < l.length;
              i += 1
            )
              if (!(0, t[i])(e[l[i]] || "")) return !1;
            return !0;
          });
      }),
      eC = I((e, t) => {
        D(), ew(), T(e$);
        var i = (eI(), T(eS)),
          r = eD();
        (t.exports = function (e, t) {
          var n = r.getFileName();
          i.stat(n, function (s, a) {
            if (s || !r.usePgPass(a, n)) return t(void 0);
            var o = i.createReadStream(n);
            r.getPassword(e, o, t);
          });
        }),
          (t.exports.warnTo = r.warnTo);
      }),
      ej = {};
    E(ej, { default: () => eZ });
    var eZ,
      eL = k(() => {
        D(), (eZ = {});
      }),
      eR = I((e, t) => {
        D();
        var i = (J(), T(q)),
          r = (eI(), T(eS));
        function n(e) {
          if ("/" === e.charAt(0)) {
            var t = e.split(" ");
            return { host: t[0], database: t[1] };
          }
          var n = i.parse(
              / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(e)
                ? encodeURI(e).replace(/\%25(\d\d)/g, "%$1")
                : e,
              !0,
            ),
            t = n.query;
          for (var s in t)
            Array.isArray(t[s]) && (t[s] = t[s][t[s].length - 1]);
          var a = (n.auth || ":").split(":");
          if (
            ((t.user = a[0]),
            (t.password = a.splice(1).join(":")),
            (t.port = n.port),
            "socket:" == n.protocol)
          )
            return (
              (t.host = decodeURI(n.pathname)),
              (t.database = n.query.db),
              (t.client_encoding = n.query.encoding),
              t
            );
          t.host || (t.host = n.hostname);
          var o = n.pathname;
          if (!t.host && o && /^%2f/i.test(o)) {
            var u = o.split("/");
            (t.host = decodeURIComponent(u[0])), (o = u.splice(1).join("/"));
          }
          switch (
            (o && "/" === o.charAt(0) && (o = o.slice(1) || null),
            (t.database = o && decodeURI(o)),
            ("true" === t.ssl || "1" === t.ssl) && (t.ssl = !0),
            "0" === t.ssl && (t.ssl = !1),
            (t.sslcert || t.sslkey || t.sslrootcert || t.sslmode) &&
              (t.ssl = {}),
            t.sslcert && (t.ssl.cert = r.readFileSync(t.sslcert).toString()),
            t.sslkey && (t.ssl.key = r.readFileSync(t.sslkey).toString()),
            t.sslrootcert &&
              (t.ssl.ca = r.readFileSync(t.sslrootcert).toString()),
            t.sslmode)
          ) {
            case "disable":
              t.ssl = !1;
              break;
            case "prefer":
            case "require":
            case "verify-ca":
            case "verify-full":
              break;
            case "no-verify":
              t.ssl.rejectUnauthorized = !1;
          }
          return t;
        }
        S(n, "parse"), (t.exports = n), (n.parse = n);
      }),
      eM = I((e, t) => {
        D();
        var i = (eL(), T(ej)),
          r = em(),
          n = eR().parse,
          s = S(function (e, t, i) {
            return (
              void 0 === i
                ? (i = v.env["PG" + e.toUpperCase()])
                : !1 === i || (i = v.env[i]),
              t[e] || i || r[e]
            );
          }, "val"),
          a = S(function () {
            switch (v.env.PGSSLMODE) {
              case "disable":
                return !1;
              case "prefer":
              case "require":
              case "verify-ca":
              case "verify-full":
                return !0;
              case "no-verify":
                return { rejectUnauthorized: !1 };
            }
            return r.ssl;
          }, "readSSLConfigFromEnvironment"),
          o = S(function (e) {
            return (
              "'" + ("" + e).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"
            );
          }, "quoteParamValue"),
          u = S(function (e, t, i) {
            var r = t[i];
            null != r && e.push(i + "=" + o(r));
          }, "add"),
          l = class {
            constructor(e) {
              (e = "string" == typeof e ? n(e) : e || {}).connectionString &&
                (e = Object.assign({}, e, n(e.connectionString))),
                (this.user = s("user", e)),
                (this.database = s("database", e)),
                void 0 === this.database && (this.database = this.user),
                (this.port = parseInt(s("port", e), 10)),
                (this.host = s("host", e)),
                Object.defineProperty(this, "password", {
                  configurable: !0,
                  enumerable: !1,
                  writable: !0,
                  value: s("password", e),
                }),
                (this.binary = s("binary", e)),
                (this.options = s("options", e)),
                (this.ssl = typeof e.ssl > "u" ? a() : e.ssl),
                "string" == typeof this.ssl &&
                  "true" === this.ssl &&
                  (this.ssl = !0),
                "no-verify" === this.ssl &&
                  (this.ssl = { rejectUnauthorized: !1 }),
                this.ssl &&
                  this.ssl.key &&
                  Object.defineProperty(this.ssl, "key", { enumerable: !1 }),
                (this.client_encoding = s("client_encoding", e)),
                (this.replication = s("replication", e)),
                (this.isDomainSocket = !(this.host || "").indexOf("/")),
                (this.application_name = s("application_name", e, "PGAPPNAME")),
                (this.fallback_application_name = s(
                  "fallback_application_name",
                  e,
                  !1,
                )),
                (this.statement_timeout = s("statement_timeout", e, !1)),
                (this.lock_timeout = s("lock_timeout", e, !1)),
                (this.idle_in_transaction_session_timeout = s(
                  "idle_in_transaction_session_timeout",
                  e,
                  !1,
                )),
                (this.query_timeout = s("query_timeout", e, !1)),
                void 0 === e.connectionTimeoutMillis
                  ? (this.connect_timeout = v.env.PGCONNECT_TIMEOUT || 0)
                  : (this.connect_timeout = Math.floor(
                      e.connectionTimeoutMillis / 1e3,
                    )),
                !1 === e.keepAlive
                  ? (this.keepalives = 0)
                  : !0 === e.keepAlive && (this.keepalives = 1),
                "number" == typeof e.keepAliveInitialDelayMillis &&
                  (this.keepalives_idle = Math.floor(
                    e.keepAliveInitialDelayMillis / 1e3,
                  ));
            }
            getLibpqConnectionString(e) {
              var t = [];
              u(t, this, "user"),
                u(t, this, "password"),
                u(t, this, "port"),
                u(t, this, "application_name"),
                u(t, this, "fallback_application_name"),
                u(t, this, "connect_timeout"),
                u(t, this, "options");
              var r =
                "object" == typeof this.ssl
                  ? this.ssl
                  : this.ssl
                    ? { sslmode: this.ssl }
                    : {};
              if (
                (u(t, r, "sslmode"),
                u(t, r, "sslca"),
                u(t, r, "sslkey"),
                u(t, r, "sslcert"),
                u(t, r, "sslrootcert"),
                this.database && t.push("dbname=" + o(this.database)),
                this.replication &&
                  t.push("replication=" + o(this.replication)),
                this.host && t.push("host=" + o(this.host)),
                this.isDomainSocket)
              )
                return e(null, t.join(" "));
              this.client_encoding &&
                t.push("client_encoding=" + o(this.client_encoding)),
                i.lookup(this.host, function (i, r) {
                  return i
                    ? e(i, null)
                    : (t.push("hostaddr=" + o(r)), e(null, t.join(" ")));
                });
            }
          };
        S(l, "ConnectionParameters"), (t.exports = l);
      }),
      eB = I((e, t) => {
        D();
        var i = er(),
          r = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/,
          n = class {
            constructor(e, t) {
              (this.command = null),
                (this.rowCount = null),
                (this.oid = null),
                (this.rows = []),
                (this.fields = []),
                (this._parsers = void 0),
                (this._types = t),
                (this.RowCtor = null),
                (this.rowAsArray = "array" === e),
                this.rowAsArray && (this.parseRow = this._parseRowAsArray);
            }
            addCommandComplete(e) {
              var t;
              (t = e.text ? r.exec(e.text) : r.exec(e.command)) &&
                ((this.command = t[1]),
                t[3]
                  ? ((this.oid = parseInt(t[2], 10)),
                    (this.rowCount = parseInt(t[3], 10)))
                  : t[2] && (this.rowCount = parseInt(t[2], 10)));
            }
            _parseRowAsArray(e) {
              for (var t = Array(e.length), i = 0, r = e.length; i < r; i++) {
                var n = e[i];
                null !== n ? (t[i] = this._parsers[i](n)) : (t[i] = null);
              }
              return t;
            }
            parseRow(e) {
              for (var t = {}, i = 0, r = e.length; i < r; i++) {
                var n = e[i],
                  s = this.fields[i].name;
                null !== n ? (t[s] = this._parsers[i](n)) : (t[s] = null);
              }
              return t;
            }
            addRow(e) {
              this.rows.push(e);
            }
            addFields(e) {
              (this.fields = e),
                this.fields.length && (this._parsers = Array(e.length));
              for (var t = 0; t < e.length; t++) {
                var r = e[t];
                this._types
                  ? (this._parsers[t] = this._types.getTypeParser(
                      r.dataTypeID,
                      r.format || "text",
                    ))
                  : (this._parsers[t] = i.getTypeParser(
                      r.dataTypeID,
                      r.format || "text",
                    ));
              }
            }
          };
        S(n, "Result"), (t.exports = n);
      }),
      eF = I((e, t) => {
        D();
        var { EventEmitter: i } = C(),
          r = eB(),
          n = eg(),
          s = class extends i {
            constructor(e, t, i) {
              super(),
                (e = n.normalizeQueryConfig(e, t, i)),
                (this.text = e.text),
                (this.values = e.values),
                (this.rows = e.rows),
                (this.types = e.types),
                (this.name = e.name),
                (this.binary = e.binary),
                (this.portal = e.portal || ""),
                (this.callback = e.callback),
                (this._rowMode = e.rowMode),
                v.domain &&
                  e.callback &&
                  (this.callback = v.domain.bind(e.callback)),
                (this._result = new r(this._rowMode, this.types)),
                (this._results = this._result),
                (this.isPreparedStatement = !1),
                (this._canceledDueToError = !1),
                (this._promise = null);
            }
            requiresPreparation() {
              return (
                !!this.name ||
                !!this.rows ||
                (!!this.text && !!this.values && this.values.length > 0)
              );
            }
            _checkForMultirow() {
              this._result.command &&
                (Array.isArray(this._results) ||
                  (this._results = [this._result]),
                (this._result = new r(this._rowMode, this.types)),
                this._results.push(this._result));
            }
            handleRowDescription(e) {
              this._checkForMultirow(),
                this._result.addFields(e.fields),
                (this._accumulateRows =
                  this.callback || !this.listeners("row").length);
            }
            handleDataRow(e) {
              let t;
              if (!this._canceledDueToError) {
                try {
                  t = this._result.parseRow(e.fields);
                } catch (e) {
                  this._canceledDueToError = e;
                  return;
                }
                this.emit("row", t, this._result),
                  this._accumulateRows && this._result.addRow(t);
              }
            }
            handleCommandComplete(e, t) {
              this._checkForMultirow(),
                this._result.addCommandComplete(e),
                this.rows && t.sync();
            }
            handleEmptyQuery(e) {
              this.rows && e.sync();
            }
            handleError(e, t) {
              if (
                (this._canceledDueToError &&
                  ((e = this._canceledDueToError),
                  (this._canceledDueToError = !1)),
                this.callback)
              )
                return this.callback(e);
              this.emit("error", e);
            }
            handleReadyForQuery(e) {
              if (this._canceledDueToError)
                return this.handleError(this._canceledDueToError, e);
              if (this.callback)
                try {
                  this.callback(null, this._results);
                } catch (e) {
                  v.nextTick(() => {
                    throw e;
                  });
                }
              this.emit("end", this._results);
            }
            submit(e) {
              if ("string" != typeof this.text && "string" != typeof this.name)
                return Error(
                  "A query must have either text or a name. Supplying neither is unsupported.",
                );
              let t = e.parsedStatements[this.name];
              return this.text && t && this.text !== t
                ? Error(`Prepared statements must be unique - '${this.name}\
' was used for a different statement`)
                : this.values && !Array.isArray(this.values)
                  ? Error("Query values must be an array")
                  : (this.requiresPreparation()
                      ? this.prepare(e)
                      : e.query(this.text),
                    null);
            }
            hasBeenParsed(e) {
              return this.name && e.parsedStatements[this.name];
            }
            handlePortalSuspended(e) {
              this._getRows(e, this.rows);
            }
            _getRows(e, t) {
              e.execute({ portal: this.portal, rows: t }),
                t ? e.flush() : e.sync();
            }
            prepare(e) {
              (this.isPreparedStatement = !0),
                this.hasBeenParsed(e) ||
                  e.parse({
                    text: this.text,
                    name: this.name,
                    types: this.types,
                  });
              try {
                e.bind({
                  portal: this.portal,
                  statement: this.name,
                  values: this.values,
                  binary: this.binary,
                  valueMapper: n.prepareValue,
                });
              } catch (t) {
                this.handleError(t, e);
                return;
              }
              e.describe({ type: "P", name: this.portal || "" }),
                this._getRows(e, this.rows);
            }
            handleCopyInResponse(e) {
              e.sendCopyFail("No source stream defined");
            }
            handleCopyData(e, t) {}
          };
        S(s, "Query"), (t.exports = s);
      }),
      eq = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.NoticeMessage =
            e.DataRowMessage =
            e.CommandCompleteMessage =
            e.ReadyForQueryMessage =
            e.NotificationResponseMessage =
            e.BackendKeyDataMessage =
            e.AuthenticationMD5Password =
            e.ParameterStatusMessage =
            e.ParameterDescriptionMessage =
            e.RowDescriptionMessage =
            e.Field =
            e.CopyResponse =
            e.CopyDataMessage =
            e.DatabaseError =
            e.copyDone =
            e.emptyQuery =
            e.replicationStart =
            e.portalSuspended =
            e.noData =
            e.closeComplete =
            e.bindComplete =
            e.parseComplete =
              void 0),
          (e.parseComplete = { name: "parseComplete", length: 5 }),
          (e.bindComplete = { name: "bindComplete", length: 5 }),
          (e.closeComplete = { name: "closeComplete", length: 5 }),
          (e.noData = { name: "noData", length: 5 }),
          (e.portalSuspended = { name: "portalSuspended", length: 5 }),
          (e.replicationStart = { name: "replicationStart", length: 4 }),
          (e.emptyQuery = { name: "emptyQuery", length: 4 }),
          (e.copyDone = { name: "copyDone", length: 4 });
        var t = class extends Error {
          constructor(e, t, i) {
            super(e), (this.length = t), (this.name = i);
          }
        };
        S(t, "DatabaseError"), (e.DatabaseError = t);
        var i = class {
          constructor(e, t) {
            (this.length = e), (this.chunk = t), (this.name = "copyData");
          }
        };
        S(i, "CopyDataMessage"), (e.CopyDataMessage = i);
        var r = class {
          constructor(e, t, i, r) {
            (this.length = e),
              (this.name = t),
              (this.binary = i),
              (this.columnTypes = Array(r));
          }
        };
        S(r, "CopyResponse"), (e.CopyResponse = r);
        var n = class {
          constructor(e, t, i, r, n, s, a) {
            (this.name = e),
              (this.tableID = t),
              (this.columnID = i),
              (this.dataTypeID = r),
              (this.dataTypeSize = n),
              (this.dataTypeModifier = s),
              (this.format = a);
          }
        };
        S(n, "Field"), (e.Field = n);
        var s = class {
          constructor(e, t) {
            (this.length = e),
              (this.fieldCount = t),
              (this.name = "rowDescription"),
              (this.fields = Array(this.fieldCount));
          }
        };
        S(s, "RowDescriptionMessage"), (e.RowDescriptionMessage = s);
        var a = class {
          constructor(e, t) {
            (this.length = e),
              (this.parameterCount = t),
              (this.name = "parameterDescription"),
              (this.dataTypeIDs = Array(this.parameterCount));
          }
        };
        S(a, "ParameterDescriptionMessage"),
          (e.ParameterDescriptionMessage = a);
        var o = class {
          constructor(e, t, i) {
            (this.length = e),
              (this.parameterName = t),
              (this.parameterValue = i),
              (this.name = "parameterStatus");
          }
        };
        S(o, "ParameterStatusMessage"), (e.ParameterStatusMessage = o);
        var u = class {
          constructor(e, t) {
            (this.length = e),
              (this.salt = t),
              (this.name = "authenticationMD5Password");
          }
        };
        S(u, "AuthenticationMD5Password"), (e.AuthenticationMD5Password = u);
        var l = class {
          constructor(e, t, i) {
            (this.length = e),
              (this.processID = t),
              (this.secretKey = i),
              (this.name = "backendKeyData");
          }
        };
        S(l, "BackendKeyDataMessage"), (e.BackendKeyDataMessage = l);
        var c = class {
          constructor(e, t, i, r) {
            (this.length = e),
              (this.processId = t),
              (this.channel = i),
              (this.payload = r),
              (this.name = "notification");
          }
        };
        S(c, "NotificationResponseMessage"),
          (e.NotificationResponseMessage = c);
        var d = class {
          constructor(e, t) {
            (this.length = e), (this.status = t), (this.name = "readyForQuery");
          }
        };
        S(d, "ReadyForQueryMessage"), (e.ReadyForQueryMessage = d);
        var f = class {
          constructor(e, t) {
            (this.length = e), (this.text = t), (this.name = "commandComplete");
          }
        };
        S(f, "CommandCompleteMessage"), (e.CommandCompleteMessage = f);
        var h = class {
          constructor(e, t) {
            (this.length = e),
              (this.fields = t),
              (this.name = "dataRow"),
              (this.fieldCount = t.length);
          }
        };
        S(h, "DataRowMessage"), (e.DataRowMessage = h);
        var p = class {
          constructor(e, t) {
            (this.length = e), (this.message = t), (this.name = "notice");
          }
        };
        S(p, "NoticeMessage"), (e.NoticeMessage = p);
      }),
      eQ = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.Writer = void 0);
        var t = class {
          constructor(e = 256) {
            (this.size = e),
              (this.offset = 5),
              (this.headerPosition = 0),
              (this.buffer = g.allocUnsafe(e));
          }
          ensure(e) {
            if (this.buffer.length - this.offset < e) {
              let t = this.buffer,
                i = t.length + (t.length >> 1) + e;
              (this.buffer = g.allocUnsafe(i)), t.copy(this.buffer);
            }
          }
          addInt32(e) {
            return (
              this.ensure(4),
              (this.buffer[this.offset++] = (e >>> 24) & 255),
              (this.buffer[this.offset++] = (e >>> 16) & 255),
              (this.buffer[this.offset++] = (e >>> 8) & 255),
              (this.buffer[this.offset++] = (e >>> 0) & 255),
              this
            );
          }
          addInt16(e) {
            return (
              this.ensure(2),
              (this.buffer[this.offset++] = (e >>> 8) & 255),
              (this.buffer[this.offset++] = (e >>> 0) & 255),
              this
            );
          }
          addCString(e) {
            if (e) {
              let t = g.byteLength(e);
              this.ensure(t + 1),
                this.buffer.write(e, this.offset, "utf-8"),
                (this.offset += t);
            } else this.ensure(1);
            return (this.buffer[this.offset++] = 0), this;
          }
          addString(e = "") {
            let t = g.byteLength(e);
            return (
              this.ensure(t),
              this.buffer.write(e, this.offset),
              (this.offset += t),
              this
            );
          }
          add(e) {
            return (
              this.ensure(e.length),
              e.copy(this.buffer, this.offset),
              (this.offset += e.length),
              this
            );
          }
          join(e) {
            if (e) {
              this.buffer[this.headerPosition] = e;
              let t = this.offset - (this.headerPosition + 1);
              this.buffer.writeInt32BE(t, this.headerPosition + 1);
            }
            return this.buffer.slice(5 * !e, this.offset);
          }
          flush(e) {
            let t = this.join(e);
            return (
              (this.offset = 5),
              (this.headerPosition = 0),
              (this.buffer = g.allocUnsafe(this.size)),
              t
            );
          }
        };
        S(t, "Writer"), (e.Writer = t);
      }),
      eJ = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.serialize = void 0);
        var t = eQ(),
          i = new t.Writer(),
          r = S((e) => {
            for (let t of (i.addInt16(3).addInt16(0), Object.keys(e)))
              i.addCString(t).addCString(e[t]);
            i.addCString("client_encoding").addCString("UTF8");
            let r = i.addCString("").flush(),
              n = r.length + 4;
            return new t.Writer().addInt32(n).add(r).flush();
          }, "startup"),
          n = S(() => {
            let e = g.allocUnsafe(8);
            return e.writeInt32BE(8, 0), e.writeInt32BE(0x4d2162f, 4), e;
          }, "requestSsl"),
          s = S((e) => i.addCString(e).flush(112), "password"),
          a = S(function (e, t) {
            return (
              i.addCString(e).addInt32(g.byteLength(t)).addString(t),
              i.flush(112)
            );
          }, "sendSASLInitialResponseMessage"),
          o = S(function (e) {
            return i.addString(e).flush(112);
          }, "sendSCRAMClientFinalMessage"),
          u = S((e) => i.addCString(e).flush(81), "query"),
          l = [],
          c = S((e) => {
            let t = e.name || "";
            t.length > 63 &&
              (console.error(
                "Warning! Postgres only supports 63 characters for query names.",
              ),
              console.error("You supplied %s (%s)", t, t.length),
              console.error(
                "This can cause conflicts and silent errors executing queries",
              ));
            let r = e.types || l,
              n = r.length,
              s = i.addCString(t).addCString(e.text).addInt16(n);
            for (let e = 0; e < n; e++) s.addInt32(r[e]);
            return i.flush(80);
          }, "parse"),
          d = new t.Writer(),
          f = S(function (e, t) {
            for (let r = 0; r < e.length; r++) {
              let n = t ? t(e[r], r) : e[r];
              null == n
                ? (i.addInt16(0), d.addInt32(-1))
                : n instanceof g
                  ? (i.addInt16(1), d.addInt32(n.length), d.add(n))
                  : (i.addInt16(0),
                    d.addInt32(g.byteLength(n)),
                    d.addString(n));
            }
          }, "writeValues"),
          h = S((e = {}) => {
            let t = e.portal || "",
              r = e.statement || "",
              n = e.binary || !1,
              s = e.values || l,
              a = s.length;
            return (
              i.addCString(t).addCString(r),
              i.addInt16(a),
              f(s, e.valueMapper),
              i.addInt16(a),
              i.add(d.flush()),
              i.addInt16(+!!n),
              i.flush(66)
            );
          }, "bind"),
          p = g.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]),
          m = S((e) => {
            if (!e || (!e.portal && !e.rows)) return p;
            let t = e.portal || "",
              i = e.rows || 0,
              r = g.byteLength(t),
              n = 4 + r + 1 + 4,
              s = g.allocUnsafe(1 + n);
            return (
              (s[0] = 69),
              s.writeInt32BE(n, 1),
              s.write(t, 5, "utf-8"),
              (s[r + 5] = 0),
              s.writeUInt32BE(i, s.length - 4),
              s
            );
          }, "execute"),
          v = S((e, t) => {
            let i = g.allocUnsafe(16);
            return (
              i.writeInt32BE(16, 0),
              i.writeInt16BE(1234, 4),
              i.writeInt16BE(5678, 6),
              i.writeInt32BE(e, 8),
              i.writeInt32BE(t, 12),
              i
            );
          }, "cancel"),
          y = S((e, t) => {
            let i = 4 + g.byteLength(t) + 1,
              r = g.allocUnsafe(1 + i);
            return (
              (r[0] = e),
              r.writeInt32BE(i, 1),
              r.write(t, 5, "utf-8"),
              (r[i] = 0),
              r
            );
          }, "cstringMessage"),
          b = i.addCString("P").flush(68),
          _ = i.addCString("S").flush(68),
          $ = S(
            (e) =>
              e.name
                ? y(68, `${e.type}${e.name || ""}`)
                : "P" === e.type
                  ? b
                  : _,
            "describe",
          ),
          x = S((e) => y(67, `${e.type}${e.name || ""}`), "close"),
          w = S((e) => i.add(e).flush(100), "copyData"),
          k = S((e) => y(102, e), "copyFail"),
          I = S((e) => g.from([e, 0, 0, 0, 4]), "codeOnlyBuffer"),
          E = I(72),
          P = I(83),
          N = I(88),
          T = I(99);
        e.serialize = {
          startup: r,
          password: s,
          requestSsl: n,
          sendSASLInitialResponseMessage: a,
          sendSCRAMClientFinalMessage: o,
          query: u,
          parse: c,
          bind: h,
          execute: m,
          describe: $,
          close: x,
          flush: S(() => E, "flush"),
          sync: S(() => P, "sync"),
          end: S(() => N, "end"),
          copyData: w,
          copyDone: S(() => T, "copyDone"),
          copyFail: k,
          cancel: v,
        };
      }),
      eV = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.BufferReader = void 0);
        var t = g.allocUnsafe(0),
          i = class {
            constructor(e = 0) {
              (this.offset = e), (this.buffer = t), (this.encoding = "utf-8");
            }
            setBuffer(e, t) {
              (this.offset = e), (this.buffer = t);
            }
            int16() {
              let e = this.buffer.readInt16BE(this.offset);
              return (this.offset += 2), e;
            }
            byte() {
              let e = this.buffer[this.offset];
              return this.offset++, e;
            }
            int32() {
              let e = this.buffer.readInt32BE(this.offset);
              return (this.offset += 4), e;
            }
            uint32() {
              let e = this.buffer.readUInt32BE(this.offset);
              return (this.offset += 4), e;
            }
            string(e) {
              let t = this.buffer.toString(
                this.encoding,
                this.offset,
                this.offset + e,
              );
              return (this.offset += e), t;
            }
            cstring() {
              let e = this.offset,
                t = e;
              for (; 0 !== this.buffer[t++]; );
              return (
                (this.offset = t), this.buffer.toString(this.encoding, e, t - 1)
              );
            }
            bytes(e) {
              let t = this.buffer.slice(this.offset, this.offset + e);
              return (this.offset += e), t;
            }
          };
        S(i, "BufferReader"), (e.BufferReader = i);
      }),
      eW = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.Parser = void 0);
        var t = eq(),
          i = eV(),
          r = g.allocUnsafe(0),
          n = class {
            constructor(e) {
              if (
                ((this.buffer = r),
                (this.bufferLength = 0),
                (this.bufferOffset = 0),
                (this.reader = new i.BufferReader()),
                e?.mode === "binary")
              )
                throw Error("Binary mode not supported yet");
              this.mode = e?.mode || "text";
            }
            parse(e, t) {
              this.mergeBuffer(e);
              let i = this.bufferOffset + this.bufferLength,
                n = this.bufferOffset;
              for (; n + 5 <= i; ) {
                let e = this.buffer[n],
                  r = this.buffer.readUInt32BE(n + 1),
                  s = 1 + r;
                if (s + n <= i)
                  t(this.handlePacket(n + 5, e, r, this.buffer)), (n += s);
                else break;
              }
              n === i
                ? ((this.buffer = r),
                  (this.bufferLength = 0),
                  (this.bufferOffset = 0))
                : ((this.bufferLength = i - n), (this.bufferOffset = n));
            }
            mergeBuffer(e) {
              if (this.bufferLength > 0) {
                let t = this.bufferLength + e.byteLength;
                if (t + this.bufferOffset > this.buffer.byteLength) {
                  let e;
                  if (
                    t <= this.buffer.byteLength &&
                    this.bufferOffset >= this.bufferLength
                  )
                    e = this.buffer;
                  else {
                    let i = 2 * this.buffer.byteLength;
                    for (; t >= i; ) i *= 2;
                    e = g.allocUnsafe(i);
                  }
                  this.buffer.copy(
                    e,
                    0,
                    this.bufferOffset,
                    this.bufferOffset + this.bufferLength,
                  ),
                    (this.buffer = e),
                    (this.bufferOffset = 0);
                }
                e.copy(this.buffer, this.bufferOffset + this.bufferLength),
                  (this.bufferLength = t);
              } else
                (this.buffer = e),
                  (this.bufferOffset = 0),
                  (this.bufferLength = e.byteLength);
            }
            handlePacket(e, i, r, n) {
              switch (i) {
                case 50:
                  return t.bindComplete;
                case 49:
                  return t.parseComplete;
                case 51:
                  return t.closeComplete;
                case 110:
                  return t.noData;
                case 115:
                  return t.portalSuspended;
                case 99:
                  return t.copyDone;
                case 87:
                  return t.replicationStart;
                case 73:
                  return t.emptyQuery;
                case 68:
                  return this.parseDataRowMessage(e, r, n);
                case 67:
                  return this.parseCommandCompleteMessage(e, r, n);
                case 90:
                  return this.parseReadyForQueryMessage(e, r, n);
                case 65:
                  return this.parseNotificationMessage(e, r, n);
                case 82:
                  return this.parseAuthenticationResponse(e, r, n);
                case 83:
                  return this.parseParameterStatusMessage(e, r, n);
                case 75:
                  return this.parseBackendKeyData(e, r, n);
                case 69:
                  return this.parseErrorMessage(e, r, n, "error");
                case 78:
                  return this.parseErrorMessage(e, r, n, "notice");
                case 84:
                  return this.parseRowDescriptionMessage(e, r, n);
                case 116:
                  return this.parseParameterDescriptionMessage(e, r, n);
                case 71:
                  return this.parseCopyInMessage(e, r, n);
                case 72:
                  return this.parseCopyOutMessage(e, r, n);
                case 100:
                  return this.parseCopyData(e, r, n);
                default:
                  return new t.DatabaseError(
                    "received invalid response: " + i.toString(16),
                    r,
                    "error",
                  );
              }
            }
            parseReadyForQueryMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.string(1);
              return new t.ReadyForQueryMessage(i, n);
            }
            parseCommandCompleteMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.cstring();
              return new t.CommandCompleteMessage(i, n);
            }
            parseCopyData(e, i, r) {
              let n = r.slice(e, e + (i - 4));
              return new t.CopyDataMessage(i, n);
            }
            parseCopyInMessage(e, t, i) {
              return this.parseCopyMessage(e, t, i, "copyInResponse");
            }
            parseCopyOutMessage(e, t, i) {
              return this.parseCopyMessage(e, t, i, "copyOutResponse");
            }
            parseCopyMessage(e, i, r, n) {
              this.reader.setBuffer(e, r);
              let s = 0 !== this.reader.byte(),
                a = this.reader.int16(),
                o = new t.CopyResponse(i, n, s, a);
              for (let e = 0; e < a; e++)
                o.columnTypes[e] = this.reader.int16();
              return o;
            }
            parseNotificationMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int32(),
                s = this.reader.cstring(),
                a = this.reader.cstring();
              return new t.NotificationResponseMessage(i, n, s, a);
            }
            parseRowDescriptionMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int16(),
                s = new t.RowDescriptionMessage(i, n);
              for (let e = 0; e < n; e++) s.fields[e] = this.parseField();
              return s;
            }
            parseField() {
              let e = this.reader.cstring(),
                i = this.reader.uint32(),
                r = this.reader.int16(),
                n = this.reader.uint32(),
                s = this.reader.int16(),
                a = this.reader.int32(),
                o = 0 === this.reader.int16() ? "text" : "binary";
              return new t.Field(e, i, r, n, s, a, o);
            }
            parseParameterDescriptionMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int16(),
                s = new t.ParameterDescriptionMessage(i, n);
              for (let e = 0; e < n; e++)
                s.dataTypeIDs[e] = this.reader.int32();
              return s;
            }
            parseDataRowMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int16(),
                s = Array(n);
              for (let e = 0; e < n; e++) {
                let t = this.reader.int32();
                s[e] = -1 === t ? null : this.reader.string(t);
              }
              return new t.DataRowMessage(i, s);
            }
            parseParameterStatusMessage(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.cstring(),
                s = this.reader.cstring();
              return new t.ParameterStatusMessage(i, n, s);
            }
            parseBackendKeyData(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int32(),
                s = this.reader.int32();
              return new t.BackendKeyDataMessage(i, n, s);
            }
            parseAuthenticationResponse(e, i, r) {
              this.reader.setBuffer(e, r);
              let n = this.reader.int32(),
                s = { name: "authenticationOk", length: i };
              switch (n) {
                case 0:
                  break;
                case 3:
                  8 === s.length &&
                    (s.name = "authenticationCleartextPassword");
                  break;
                case 5:
                  if (12 === s.length) {
                    s.name = "authenticationMD5Password";
                    let e = this.reader.bytes(4);
                    return new t.AuthenticationMD5Password(i, e);
                  }
                  break;
                case 10:
                  {
                    let e;
                    (s.name = "authenticationSASL"), (s.mechanisms = []);
                    do (e = this.reader.cstring()) && s.mechanisms.push(e);
                    while (e);
                  }
                  break;
                case 11:
                  (s.name = "authenticationSASLContinue"),
                    (s.data = this.reader.string(i - 8));
                  break;
                case 12:
                  (s.name = "authenticationSASLFinal"),
                    (s.data = this.reader.string(i - 8));
                  break;
                default:
                  throw Error("Unknown authenticationOk message type " + n);
              }
              return s;
            }
            parseErrorMessage(e, i, r, n) {
              this.reader.setBuffer(e, r);
              let s = {},
                a = this.reader.string(1);
              for (; "\0" !== a; )
                (s[a] = this.reader.cstring()), (a = this.reader.string(1));
              let o = s.M,
                u =
                  "notice" === n
                    ? new t.NoticeMessage(i, o)
                    : new t.DatabaseError(o, i, n);
              return (
                (u.severity = s.S),
                (u.code = s.C),
                (u.detail = s.D),
                (u.hint = s.H),
                (u.position = s.P),
                (u.internalPosition = s.p),
                (u.internalQuery = s.q),
                (u.where = s.W),
                (u.schema = s.s),
                (u.table = s.t),
                (u.column = s.c),
                (u.dataType = s.d),
                (u.constraint = s.n),
                (u.file = s.F),
                (u.line = s.L),
                (u.routine = s.R),
                u
              );
            }
          };
        S(n, "Parser"), (e.Parser = n);
      }),
      eG = I((e) => {
        D(),
          Object.defineProperty(e, "__esModule", { value: !0 }),
          (e.DatabaseError = e.serialize = e.parse = void 0);
        var t = eq();
        Object.defineProperty(e, "DatabaseError", {
          enumerable: !0,
          get: S(function () {
            return t.DatabaseError;
          }, "get"),
        });
        var i = eJ();
        Object.defineProperty(e, "serialize", {
          enumerable: !0,
          get: S(function () {
            return i.serialize;
          }, "get"),
        });
        var r = eW();
        function n(e, t) {
          let i = new r.Parser();
          return (
            e.on("data", (e) => i.parse(e, t)),
            new Promise((t) => e.on("end", () => t()))
          );
        }
        S(n, "parse"), (e.parse = n);
      }),
      eK = {};
    function eX({ socket: e, servername: t }) {
      return e.startTls(t), e;
    }
    E(eK, { connect: () => eX });
    var eH = k(() => {
        D(), S(eX, "connect");
      }),
      eY = I((e, t) => {
        D();
        var i = (F(), T(j)),
          r = C().EventEmitter,
          { parse: n, serialize: s } = eG(),
          a = s.flush(),
          o = s.sync(),
          u = s.end(),
          l = class extends r {
            constructor(e) {
              super(),
                (e = e || {}),
                (this.stream = e.stream || new i.Socket()),
                (this._keepAlive = e.keepAlive),
                (this._keepAliveInitialDelayMillis =
                  e.keepAliveInitialDelayMillis),
                (this.lastBuffer = !1),
                (this.parsedStatements = {}),
                (this.ssl = e.ssl || !1),
                (this._ending = !1),
                (this._emitMessage = !1);
              var t = this;
              this.on("newListener", function (e) {
                "message" === e && (t._emitMessage = !0);
              });
            }
            connect(e, t) {
              var r = this;
              (this._connecting = !0),
                this.stream.setNoDelay(!0),
                this.stream.connect(e, t),
                this.stream.once("connect", function () {
                  r._keepAlive &&
                    r.stream.setKeepAlive(!0, r._keepAliveInitialDelayMillis),
                    r.emit("connect");
                });
              let n = S(function (e) {
                (r._ending &&
                  ("ECONNRESET" === e.code || "EPIPE" === e.code)) ||
                  r.emit("error", e);
              }, "reportStreamError");
              if (
                (this.stream.on("error", n),
                this.stream.on("close", function () {
                  r.emit("end");
                }),
                !this.ssl)
              )
                return this.attachListeners(this.stream);
              this.stream.once("data", function (e) {
                switch (e.toString("utf8")) {
                  case "S":
                    break;
                  case "N":
                    return (
                      r.stream.end(),
                      r.emit(
                        "error",
                        Error("The server does not support SSL connections"),
                      )
                    );
                  default:
                    return (
                      r.stream.end(),
                      r.emit(
                        "error",
                        Error(
                          "There was an error establishing an SSL connection",
                        ),
                      )
                    );
                }
                var s = (eH(), T(eK));
                let a = { socket: r.stream };
                !0 !== r.ssl &&
                  (Object.assign(a, r.ssl),
                  "key" in r.ssl && (a.key = r.ssl.key)),
                  0 === i.isIP(t) && (a.servername = t);
                try {
                  r.stream = s.connect(a);
                } catch (e) {
                  return r.emit("error", e);
                }
                r.attachListeners(r.stream),
                  r.stream.on("error", n),
                  r.emit("sslconnect");
              });
            }
            attachListeners(e) {
              e.on("end", () => {
                this.emit("end");
              }),
                n(e, (e) => {
                  var t = "error" === e.name ? "errorMessage" : e.name;
                  this._emitMessage && this.emit("message", e), this.emit(t, e);
                });
            }
            requestSsl() {
              this.stream.write(s.requestSsl());
            }
            startup(e) {
              this.stream.write(s.startup(e));
            }
            cancel(e, t) {
              this._send(s.cancel(e, t));
            }
            password(e) {
              this._send(s.password(e));
            }
            sendSASLInitialResponseMessage(e, t) {
              this._send(s.sendSASLInitialResponseMessage(e, t));
            }
            sendSCRAMClientFinalMessage(e) {
              this._send(s.sendSCRAMClientFinalMessage(e));
            }
            _send(e) {
              return !!this.stream.writable && this.stream.write(e);
            }
            query(e) {
              this._send(s.query(e));
            }
            parse(e) {
              this._send(s.parse(e));
            }
            bind(e) {
              this._send(s.bind(e));
            }
            execute(e) {
              this._send(s.execute(e));
            }
            flush() {
              this.stream.writable && this.stream.write(a);
            }
            sync() {
              (this._ending = !0), this._send(a), this._send(o);
            }
            ref() {
              this.stream.ref();
            }
            unref() {
              this.stream.unref();
            }
            end() {
              return ((this._ending = !0),
              this._connecting && this.stream.writable)
                ? this.stream.write(u, () => {
                    this.stream.end();
                  })
                : void this.stream.end();
            }
            close(e) {
              this._send(s.close(e));
            }
            describe(e) {
              this._send(s.describe(e));
            }
            sendCopyFromChunk(e) {
              this._send(s.copyData(e));
            }
            endCopyFrom() {
              this._send(s.copyDone());
            }
            sendCopyFail(e) {
              this._send(s.copyFail(e));
            }
          };
        S(l, "Connection"), (t.exports = l);
      }),
      e0 = I((e, t) => {
        D();
        var i = C().EventEmitter,
          r = (eb(), T(ev), eg()),
          n = e_(),
          s = eC(),
          a = en(),
          o = eM(),
          u = eF(),
          l = em(),
          c = eY(),
          d = class extends i {
            constructor(e) {
              super(),
                (this.connectionParameters = new o(e)),
                (this.user = this.connectionParameters.user),
                (this.database = this.connectionParameters.database),
                (this.port = this.connectionParameters.port),
                (this.host = this.connectionParameters.host),
                Object.defineProperty(this, "password", {
                  configurable: !0,
                  enumerable: !1,
                  writable: !0,
                  value: this.connectionParameters.password,
                }),
                (this.replication = this.connectionParameters.replication);
              var t = e || {};
              (this._Promise = t.Promise || p.Promise),
                (this._types = new a(t.types)),
                (this._ending = !1),
                (this._connecting = !1),
                (this._connected = !1),
                (this._connectionError = !1),
                (this._queryable = !0),
                (this.connection =
                  t.connection ||
                  new c({
                    stream: t.stream,
                    ssl: this.connectionParameters.ssl,
                    keepAlive: t.keepAlive || !1,
                    keepAliveInitialDelayMillis:
                      t.keepAliveInitialDelayMillis || 0,
                    encoding:
                      this.connectionParameters.client_encoding || "utf8",
                  })),
                (this.queryQueue = []),
                (this.binary = t.binary || l.binary),
                (this.processID = null),
                (this.secretKey = null),
                (this.ssl = this.connectionParameters.ssl || !1),
                this.ssl &&
                  this.ssl.key &&
                  Object.defineProperty(this.ssl, "key", { enumerable: !1 }),
                (this._connectionTimeoutMillis =
                  t.connectionTimeoutMillis || 0);
            }
            _errorAllQueries(e) {
              let t = S((t) => {
                v.nextTick(() => {
                  t.handleError(e, this.connection);
                });
              }, "enqueueError");
              this.activeQuery &&
                (t(this.activeQuery), (this.activeQuery = null)),
                this.queryQueue.forEach(t),
                (this.queryQueue.length = 0);
            }
            _connect(e) {
              var t = this,
                i = this.connection;
              if (
                ((this._connectionCallback = e),
                this._connecting || this._connected)
              ) {
                let t = Error(
                  "Client has already been connected. You cannot reuse a client.",
                );
                v.nextTick(() => {
                  e(t);
                });
                return;
              }
              (this._connecting = !0),
                this.connectionTimeoutHandle,
                this._connectionTimeoutMillis > 0 &&
                  (this.connectionTimeoutHandle = setTimeout(() => {
                    (i._ending = !0),
                      i.stream.destroy(Error("timeout expired"));
                  }, this._connectionTimeoutMillis)),
                this.host && 0 === this.host.indexOf("/")
                  ? i.connect(this.host + "/.s.PGSQL." + this.port)
                  : i.connect(this.port, this.host),
                i.on("connect", function () {
                  t.ssl ? i.requestSsl() : i.startup(t.getStartupConf());
                }),
                i.on("sslconnect", function () {
                  i.startup(t.getStartupConf());
                }),
                this._attachListeners(i),
                i.once("end", () => {
                  let e = this._ending
                    ? Error("Connection terminated")
                    : Error("Connection terminated unexpectedly");
                  clearTimeout(this.connectionTimeoutHandle),
                    this._errorAllQueries(e),
                    this._ending ||
                      (this._connecting && !this._connectionError
                        ? this._connectionCallback
                          ? this._connectionCallback(e)
                          : this._handleErrorEvent(e)
                        : this._connectionError || this._handleErrorEvent(e)),
                    v.nextTick(() => {
                      this.emit("end");
                    });
                });
            }
            connect(e) {
              return e
                ? void this._connect(e)
                : new this._Promise((e, t) => {
                    this._connect((i) => {
                      i ? t(i) : e();
                    });
                  });
            }
            _attachListeners(e) {
              e.on(
                "authenticationCleartextPassword",
                this._handleAuthCleartextPassword.bind(this),
              ),
                e.on(
                  "authenticationMD5Password",
                  this._handleAuthMD5Password.bind(this),
                ),
                e.on("authenticationSASL", this._handleAuthSASL.bind(this)),
                e.on(
                  "authenticationSASLContinue",
                  this._handleAuthSASLContinue.bind(this),
                ),
                e.on(
                  "authenticationSASLFinal",
                  this._handleAuthSASLFinal.bind(this),
                ),
                e.on("backendKeyData", this._handleBackendKeyData.bind(this)),
                e.on("error", this._handleErrorEvent.bind(this)),
                e.on("errorMessage", this._handleErrorMessage.bind(this)),
                e.on("readyForQuery", this._handleReadyForQuery.bind(this)),
                e.on("notice", this._handleNotice.bind(this)),
                e.on("rowDescription", this._handleRowDescription.bind(this)),
                e.on("dataRow", this._handleDataRow.bind(this)),
                e.on("portalSuspended", this._handlePortalSuspended.bind(this)),
                e.on("emptyQuery", this._handleEmptyQuery.bind(this)),
                e.on("commandComplete", this._handleCommandComplete.bind(this)),
                e.on("parseComplete", this._handleParseComplete.bind(this)),
                e.on("copyInResponse", this._handleCopyInResponse.bind(this)),
                e.on("copyData", this._handleCopyData.bind(this)),
                e.on("notification", this._handleNotification.bind(this));
            }
            _checkPgPass(e) {
              let t = this.connection;
              "function" == typeof this.password
                ? this._Promise
                    .resolve()
                    .then(() => this.password())
                    .then((i) => {
                      if (void 0 !== i) {
                        if ("string" != typeof i)
                          return void t.emit(
                            "error",
                            TypeError("Password must be a string"),
                          );
                        this.connectionParameters.password = this.password = i;
                      } else
                        this.connectionParameters.password = this.password =
                          null;
                      e();
                    })
                    .catch((e) => {
                      t.emit("error", e);
                    })
                : null !== this.password
                  ? e()
                  : s(this.connectionParameters, (t) => {
                      void 0 !== t &&
                        (this.connectionParameters.password = this.password =
                          t),
                        e();
                    });
            }
            _handleAuthCleartextPassword(e) {
              this._checkPgPass(() => {
                this.connection.password(this.password);
              });
            }
            _handleAuthMD5Password(e) {
              this._checkPgPass(() => {
                let t = r.postgresMd5PasswordHash(
                  this.user,
                  this.password,
                  e.salt,
                );
                this.connection.password(t);
              });
            }
            _handleAuthSASL(e) {
              this._checkPgPass(() => {
                (this.saslSession = n.startSession(e.mechanisms)),
                  this.connection.sendSASLInitialResponseMessage(
                    this.saslSession.mechanism,
                    this.saslSession.response,
                  );
              });
            }
            _handleAuthSASLContinue(e) {
              n.continueSession(this.saslSession, this.password, e.data),
                this.connection.sendSCRAMClientFinalMessage(
                  this.saslSession.response,
                );
            }
            _handleAuthSASLFinal(e) {
              n.finalizeSession(this.saslSession, e.data),
                (this.saslSession = null);
            }
            _handleBackendKeyData(e) {
              (this.processID = e.processID), (this.secretKey = e.secretKey);
            }
            _handleReadyForQuery(e) {
              this._connecting &&
                ((this._connecting = !1),
                (this._connected = !0),
                clearTimeout(this.connectionTimeoutHandle),
                this._connectionCallback &&
                  (this._connectionCallback(null, this),
                  (this._connectionCallback = null)),
                this.emit("connect"));
              let { activeQuery: t } = this;
              (this.activeQuery = null),
                (this.readyForQuery = !0),
                t && t.handleReadyForQuery(this.connection),
                this._pulseQueryQueue();
            }
            _handleErrorWhileConnecting(e) {
              if (!this._connectionError) {
                if (
                  ((this._connectionError = !0),
                  clearTimeout(this.connectionTimeoutHandle),
                  this._connectionCallback)
                )
                  return this._connectionCallback(e);
                this.emit("error", e);
              }
            }
            _handleErrorEvent(e) {
              if (this._connecting) return this._handleErrorWhileConnecting(e);
              (this._queryable = !1),
                this._errorAllQueries(e),
                this.emit("error", e);
            }
            _handleErrorMessage(e) {
              if (this._connecting) return this._handleErrorWhileConnecting(e);
              let t = this.activeQuery;
              t
                ? ((this.activeQuery = null), t.handleError(e, this.connection))
                : this._handleErrorEvent(e);
            }
            _handleRowDescription(e) {
              this.activeQuery.handleRowDescription(e);
            }
            _handleDataRow(e) {
              this.activeQuery.handleDataRow(e);
            }
            _handlePortalSuspended(e) {
              this.activeQuery.handlePortalSuspended(this.connection);
            }
            _handleEmptyQuery(e) {
              this.activeQuery.handleEmptyQuery(this.connection);
            }
            _handleCommandComplete(e) {
              this.activeQuery.handleCommandComplete(e, this.connection);
            }
            _handleParseComplete(e) {
              this.activeQuery.name &&
                (this.connection.parsedStatements[this.activeQuery.name] =
                  this.activeQuery.text);
            }
            _handleCopyInResponse(e) {
              this.activeQuery.handleCopyInResponse(this.connection);
            }
            _handleCopyData(e) {
              this.activeQuery.handleCopyData(e, this.connection);
            }
            _handleNotification(e) {
              this.emit("notification", e);
            }
            _handleNotice(e) {
              this.emit("notice", e);
            }
            getStartupConf() {
              var e = this.connectionParameters,
                t = { user: e.user, database: e.database },
                i = e.application_name || e.fallback_application_name;
              return (
                i && (t.application_name = i),
                e.replication && (t.replication = "" + e.replication),
                e.statement_timeout &&
                  (t.statement_timeout = String(
                    parseInt(e.statement_timeout, 10),
                  )),
                e.lock_timeout &&
                  (t.lock_timeout = String(parseInt(e.lock_timeout, 10))),
                e.idle_in_transaction_session_timeout &&
                  (t.idle_in_transaction_session_timeout = String(
                    parseInt(e.idle_in_transaction_session_timeout, 10),
                  )),
                e.options && (t.options = e.options),
                t
              );
            }
            cancel(e, t) {
              if (e.activeQuery === t) {
                var i = this.connection;
                this.host && 0 === this.host.indexOf("/")
                  ? i.connect(this.host + "/.s.PGSQL." + this.port)
                  : i.connect(this.port, this.host),
                  i.on("connect", function () {
                    i.cancel(e.processID, e.secretKey);
                  });
              } else
                -1 !== e.queryQueue.indexOf(t) &&
                  e.queryQueue.splice(e.queryQueue.indexOf(t), 1);
            }
            setTypeParser(e, t, i) {
              return this._types.setTypeParser(e, t, i);
            }
            getTypeParser(e, t) {
              return this._types.getTypeParser(e, t);
            }
            escapeIdentifier(e) {
              return '"' + e.replace(/"/g, '""') + '"';
            }
            escapeLiteral(e) {
              for (var t = !1, i = "'", r = 0; r < e.length; r++) {
                var n = e[r];
                "'" === n
                  ? (i += n + n)
                  : "\\" === n
                    ? ((i += n + n), (t = !0))
                    : (i += n);
              }
              return (i += "'"), !0 === t && (i = " E" + i), i;
            }
            _pulseQueryQueue() {
              if (!0 === this.readyForQuery)
                if (
                  ((this.activeQuery = this.queryQueue.shift()),
                  this.activeQuery)
                ) {
                  (this.readyForQuery = !1), (this.hasExecuted = !0);
                  let e = this.activeQuery.submit(this.connection);
                  e &&
                    v.nextTick(() => {
                      this.activeQuery.handleError(e, this.connection),
                        (this.readyForQuery = !0),
                        this._pulseQueryQueue();
                    });
                } else
                  this.hasExecuted &&
                    ((this.activeQuery = null), this.emit("drain"));
            }
            query(e, t, i) {
              var r, n, s, a, o;
              if (null == e)
                throw TypeError("Client was passed a null or undefined query");
              return (
                "function" == typeof e.submit
                  ? ((s =
                      e.query_timeout ||
                      this.connectionParameters.query_timeout),
                    (n = r = e),
                    "function" == typeof t && (r.callback = r.callback || t))
                  : ((s = this.connectionParameters.query_timeout),
                    (r = new u(e, t, i)).callback ||
                      (n = new this._Promise((e, t) => {
                        r.callback = (i, r) => (i ? t(i) : e(r));
                      }))),
                s &&
                  ((o = r.callback),
                  (a = setTimeout(() => {
                    var e = Error("Query read timeout");
                    v.nextTick(() => {
                      r.handleError(e, this.connection);
                    }),
                      o(e),
                      (r.callback = () => {});
                    var t = this.queryQueue.indexOf(r);
                    t > -1 && this.queryQueue.splice(t, 1),
                      this._pulseQueryQueue();
                  }, s)),
                  (r.callback = (e, t) => {
                    clearTimeout(a), o(e, t);
                  })),
                this.binary && !r.binary && (r.binary = !0),
                r._result &&
                  !r._result._types &&
                  (r._result._types = this._types),
                this._queryable
                  ? this._ending
                    ? v.nextTick(() => {
                        r.handleError(
                          Error("Client was closed and is not queryable"),
                          this.connection,
                        );
                      })
                    : (this.queryQueue.push(r), this._pulseQueryQueue())
                  : v.nextTick(() => {
                      r.handleError(
                        Error(
                          "Client has encountered a connection error and is not queryable",
                        ),
                        this.connection,
                      );
                    }),
                n
              );
            }
            ref() {
              this.connection.ref();
            }
            unref() {
              this.connection.unref();
            }
            end(e) {
              if (((this._ending = !0), !this.connection._connecting))
                if (!e) return this._Promise.resolve();
                else e();
              if (
                (this.activeQuery || !this._queryable
                  ? this.connection.stream.destroy()
                  : this.connection.end(),
                !e)
              )
                return new this._Promise((e) => {
                  this.connection.once("end", e);
                });
              this.connection.once("end", e);
            }
          };
        S(d, "Client"), (d.Query = u), (t.exports = d);
      }),
      e1 = I((e, t) => {
        D();
        var i = C().EventEmitter,
          r = S(function () {}, "NOOP"),
          n = S((e, t) => {
            let i = e.findIndex(t);
            return -1 === i ? void 0 : e.splice(i, 1)[0];
          }, "removeWhere"),
          s = class {
            constructor(e, t, i) {
              (this.client = e), (this.idleListener = t), (this.timeoutId = i);
            }
          };
        S(s, "IdleItem");
        var a = class {
          constructor(e) {
            this.callback = e;
          }
        };
        function o() {
          throw Error(
            "Release called on client which has already been released to the pool.",
          );
        }
        function u(e, t) {
          let i, r;
          return t
            ? { callback: t, result: void 0 }
            : {
                callback: S(function (e, t) {
                  e ? i(e) : r(t);
                }, "cb"),
                result: new e(function (e, t) {
                  (r = e), (i = t);
                }).catch((e) => {
                  throw (Error.captureStackTrace(e), e);
                }),
              };
        }
        function l(e, t) {
          return S(function i(r) {
            (r.client = t),
              t.removeListener("error", i),
              t.on("error", () => {
                e.log(
                  "additional client error after disconnection due to error",
                  r,
                );
              }),
              e._remove(t),
              e.emit("error", r, t);
          }, "idleListener");
        }
        S(a, "PendingItem"),
          S(o, "throwOnDoubleRelease"),
          S(u, "promisify"),
          S(l, "makeIdleListener");
        var c = class extends i {
          constructor(e, t) {
            super(),
              (this.options = Object.assign({}, e)),
              null != e &&
                "password" in e &&
                Object.defineProperty(this.options, "password", {
                  configurable: !0,
                  enumerable: !1,
                  writable: !0,
                  value: e.password,
                }),
              null != e &&
                e.ssl &&
                e.ssl.key &&
                Object.defineProperty(this.options.ssl, "key", {
                  enumerable: !1,
                }),
              (this.options.max =
                this.options.max || this.options.poolSize || 10),
              (this.options.min = this.options.min || 0),
              (this.options.maxUses = this.options.maxUses || 1 / 0),
              (this.options.allowExitOnIdle =
                this.options.allowExitOnIdle || !1),
              (this.options.maxLifetimeSeconds =
                this.options.maxLifetimeSeconds || 0),
              (this.log = this.options.log || function () {}),
              (this.Client = this.options.Client || t || e7().Client),
              (this.Promise = this.options.Promise || p.Promise),
              typeof this.options.idleTimeoutMillis > "u" &&
                (this.options.idleTimeoutMillis = 1e4),
              (this._clients = []),
              (this._idle = []),
              (this._expired = new WeakSet()),
              (this._pendingQueue = []),
              (this._endCallback = void 0),
              (this.ending = !1),
              (this.ended = !1);
          }
          _isFull() {
            return this._clients.length >= this.options.max;
          }
          _isAboveMin() {
            return this._clients.length > this.options.min;
          }
          _pulseQueue() {
            if ((this.log("pulse queue"), this.ended))
              return void this.log("pulse queue ended");
            if (this.ending) {
              this.log("pulse queue on ending"),
                this._idle.length &&
                  this._idle.slice().map((e) => {
                    this._remove(e.client);
                  }),
                this._clients.length ||
                  ((this.ended = !0), this._endCallback());
              return;
            }
            if (!this._pendingQueue.length)
              return void this.log("no queued requests");
            if (!this._idle.length && this._isFull()) return;
            let e = this._pendingQueue.shift();
            if (this._idle.length) {
              let t = this._idle.pop();
              clearTimeout(t.timeoutId);
              let i = t.client;
              i.ref && i.ref();
              let r = t.idleListener;
              return this._acquireClient(i, e, r, !1);
            }
            if (!this._isFull()) return this.newClient(e);
            throw Error("unexpected condition");
          }
          _remove(e) {
            let t = n(this._idle, (t) => t.client === e);
            void 0 !== t && clearTimeout(t.timeoutId),
              (this._clients = this._clients.filter((t) => t !== e)),
              e.end(),
              this.emit("remove", e);
          }
          connect(e) {
            if (this.ending) {
              let t = Error("Cannot use a pool after calling end on the pool");
              return e ? e(t) : this.Promise.reject(t);
            }
            let t = u(this.Promise, e),
              i = t.result;
            if (this._isFull() || this._idle.length) {
              if (
                (this._idle.length && v.nextTick(() => this._pulseQueue()),
                !this.options.connectionTimeoutMillis)
              )
                return this._pendingQueue.push(new a(t.callback)), i;
              let e = S((e, i, r) => {
                  clearTimeout(s), t.callback(e, i, r);
                }, "queueCallback"),
                r = new a(e),
                s = setTimeout(() => {
                  n(this._pendingQueue, (t) => t.callback === e),
                    (r.timedOut = !0),
                    t.callback(
                      Error("timeout exceeded when trying to connect"),
                    );
                }, this.options.connectionTimeoutMillis);
              return s.unref && s.unref(), this._pendingQueue.push(r), i;
            }
            return this.newClient(new a(t.callback)), i;
          }
          newClient(e) {
            let t = new this.Client(this.options);
            this._clients.push(t);
            let i = l(this, t);
            this.log("checking client timeout");
            let n,
              s = !1;
            this.options.connectionTimeoutMillis &&
              (n = setTimeout(() => {
                this.log("ending client due to timeout"),
                  (s = !0),
                  t.connection ? t.connection.stream.destroy() : t.end();
              }, this.options.connectionTimeoutMillis)),
              this.log("connecting new client"),
              t.connect((o) => {
                if ((n && clearTimeout(n), t.on("error", i), o))
                  this.log("client failed to connect", o),
                    (this._clients = this._clients.filter((e) => e !== t)),
                    s &&
                      (o = Error(
                        "Connection terminated due to connection timeout",
                        { cause: o },
                      )),
                    this._pulseQueue(),
                    e.timedOut || e.callback(o, void 0, r);
                else {
                  if (
                    (this.log("new client connected"),
                    0 !== this.options.maxLifetimeSeconds)
                  ) {
                    let e = setTimeout(() => {
                      this.log("ending client due to expired lifetime"),
                        this._expired.add(t),
                        -1 !== this._idle.findIndex((e) => e.client === t) &&
                          this._acquireClient(
                            t,
                            new a((e, t, i) => i()),
                            i,
                            !1,
                          );
                    }, 1e3 * this.options.maxLifetimeSeconds);
                    e.unref(), t.once("end", () => clearTimeout(e));
                  }
                  return this._acquireClient(t, e, i, !0);
                }
              });
          }
          _acquireClient(e, t, i, n) {
            n && this.emit("connect", e),
              this.emit("acquire", e),
              (e.release = this._releaseOnce(e, i)),
              e.removeListener("error", i),
              t.timedOut
                ? n && this.options.verify
                  ? this.options.verify(e, e.release)
                  : e.release()
                : n && this.options.verify
                  ? this.options.verify(e, (i) => {
                      if (i) return e.release(i), t.callback(i, void 0, r);
                      t.callback(void 0, e, e.release);
                    })
                  : t.callback(void 0, e, e.release);
          }
          _releaseOnce(e, t) {
            let i = !1;
            return (r) => {
              i && o(), (i = !0), this._release(e, t, r);
            };
          }
          _release(e, t, i) {
            let r;
            if (
              (e.on("error", t),
              (e._poolUseCount = (e._poolUseCount || 0) + 1),
              this.emit("release", i, e),
              i ||
                this.ending ||
                !e._queryable ||
                e._ending ||
                e._poolUseCount >= this.options.maxUses)
            ) {
              e._poolUseCount >= this.options.maxUses &&
                this.log("remove expended client"),
                this._remove(e),
                this._pulseQueue();
              return;
            }
            if (this._expired.has(e)) {
              this.log("remove expired client"),
                this._expired.delete(e),
                this._remove(e),
                this._pulseQueue();
              return;
            }
            this.options.idleTimeoutMillis &&
              this._isAboveMin() &&
              ((r = setTimeout(() => {
                this.log("remove idle client"), this._remove(e);
              }, this.options.idleTimeoutMillis)),
              this.options.allowExitOnIdle && r.unref()),
              this.options.allowExitOnIdle && e.unref(),
              this._idle.push(new s(e, t, r)),
              this._pulseQueue();
          }
          query(e, t, i) {
            if ("function" == typeof e) {
              let t = u(this.Promise, e);
              return (
                m(function () {
                  return t.callback(
                    Error(
                      "Passing a function as the first parameter to pool.query is not supported",
                    ),
                  );
                }),
                t.result
              );
            }
            "function" == typeof t && ((i = t), (t = void 0));
            let r = u(this.Promise, i);
            return (
              (i = r.callback),
              this.connect((r, n) => {
                if (r) return i(r);
                let s = !1,
                  a = S((e) => {
                    s || ((s = !0), n.release(e), i(e));
                  }, "onError");
                n.once("error", a), this.log("dispatching query");
                try {
                  n.query(e, t, (e, t) => {
                    if (
                      (this.log("query dispatched"),
                      n.removeListener("error", a),
                      !s)
                    )
                      return (s = !0), n.release(e), e ? i(e) : i(void 0, t);
                  });
                } catch (e) {
                  return n.release(e), i(e);
                }
              }),
              r.result
            );
          }
          end(e) {
            if ((this.log("ending"), this.ending)) {
              let t = Error("Called end on pool more than once");
              return e ? e(t) : this.Promise.reject(t);
            }
            this.ending = !0;
            let t = u(this.Promise, e);
            return (
              (this._endCallback = t.callback), this._pulseQueue(), t.result
            );
          }
          get waitingCount() {
            return this._pendingQueue.length;
          }
          get idleCount() {
            return this._idle.length;
          }
          get expiredCount() {
            return this._clients.reduce(
              (e, t) => e + +!!this._expired.has(t),
              0,
            );
          }
          get totalCount() {
            return this._clients.length;
          }
        };
        S(c, "Pool"), (t.exports = c);
      }),
      e6 = {};
    E(e6, { default: () => e4 });
    var e4,
      e2 = k(() => {
        D(), (e4 = {});
      }),
      e5 = I((e, t) => {
        t.exports = {
          name: "pg",
          version: "8.8.0",
          description:
            "PostgreSQL client - pure javascript & libpq with the same API",
          keywords: [
            "database",
            "libpq",
            "pg",
            "postgre",
            "postgres",
            "postgresql",
            "rdbms",
          ],
          homepage: "https://github.com/brianc/node-postgres",
          repository: {
            type: "git",
            url: "git://github.com/brianc/node-postgres.git",
            directory: "packages/pg",
          },
          author: "Brian Carlson <brian.m.carlson@gmail.com>",
          main: "./lib",
          dependencies: {
            "buffer-writer": "2.0.0",
            "packet-reader": "1.0.0",
            "pg-connection-string": "^2.5.0",
            "pg-pool": "^3.5.2",
            "pg-protocol": "^1.5.0",
            "pg-types": "^2.1.0",
            pgpass: "1.x",
          },
          devDependencies: {
            async: "2.6.4",
            bluebird: "3.5.2",
            co: "4.6.0",
            "pg-copy-streams": "0.3.0",
          },
          peerDependencies: { "pg-native": ">=3.0.1" },
          peerDependenciesMeta: { "pg-native": { optional: !0 } },
          scripts: { test: "make test-all" },
          files: ["lib", "SPONSORS.md"],
          license: "MIT",
          engines: { node: ">= 8.0.0" },
          gitHead: "c99fb2c127ddf8d712500db2c7b9a5491a178655",
        };
      }),
      e3 = I((e, t) => {
        D();
        var i = C().EventEmitter,
          r = (eb(), T(ev)),
          n = eg(),
          s = (t.exports = function (e, t, r) {
            i.call(this),
              (e = n.normalizeQueryConfig(e, t, r)),
              (this.text = e.text),
              (this.values = e.values),
              (this.name = e.name),
              (this.callback = e.callback),
              (this.state = "new"),
              (this._arrayMode = "array" === e.rowMode),
              (this._emitRowEvents = !1),
              this.on(
                "newListener",
                function (e) {
                  "row" === e && (this._emitRowEvents = !0);
                }.bind(this),
              );
          });
        r.inherits(s, i);
        var a = {
          sqlState: "code",
          statementPosition: "position",
          messagePrimary: "message",
          context: "where",
          schemaName: "schema",
          tableName: "table",
          columnName: "column",
          dataTypeName: "dataType",
          constraintName: "constraint",
          sourceFile: "file",
          sourceLine: "line",
          sourceFunction: "routine",
        };
        (s.prototype.handleError = function (e) {
          var t = this.native.pq.resultErrorFields();
          if (t) for (var i in t) e[a[i] || i] = t[i];
          this.callback ? this.callback(e) : this.emit("error", e),
            (this.state = "error");
        }),
          (s.prototype.then = function (e, t) {
            return this._getPromise().then(e, t);
          }),
          (s.prototype.catch = function (e) {
            return this._getPromise().catch(e);
          }),
          (s.prototype._getPromise = function () {
            return (
              this._promise ||
                (this._promise = new Promise(
                  function (e, t) {
                    this._once("end", e), this._once("error", t);
                  }.bind(this),
                )),
              this._promise
            );
          }),
          (s.prototype.submit = function (e) {
            this.state = "running";
            var t = this;
            (this.native = e.native), (e.native.arrayMode = this._arrayMode);
            var i = S(function (i, r, n) {
              if (
                ((e.native.arrayMode = !1),
                m(function () {
                  t.emit("_done");
                }),
                i)
              )
                return t.handleError(i);
              t._emitRowEvents &&
                (n.length > 1
                  ? r.forEach((e, i) => {
                      e.forEach((e) => {
                        t.emit("row", e, n[i]);
                      });
                    })
                  : r.forEach(function (e) {
                      t.emit("row", e, n);
                    })),
                (t.state = "end"),
                t.emit("end", n),
                t.callback && t.callback(null, n);
            }, "after");
            if ((v.domain && (i = v.domain.bind(i)), this.name)) {
              this.name.length > 63 &&
                (console.error(
                  "Warning! Postgres only supports 63 characters for query names.",
                ),
                console.error(
                  "You supplied %s (%s)",
                  this.name,
                  this.name.length,
                ),
                console.error(
                  "This can cause conflicts and silent errors executing queries",
                ));
              var r = (this.values || []).map(n.prepareValue);
              if (e.namedQueries[this.name]) {
                if (this.text && e.namedQueries[this.name] !== this.text) {
                  let e = Error(`Prepa\
red statements must be unique - '${this.name}' was used for a different statement`);
                  return i(e);
                }
                return e.native.execute(this.name, r, i);
              }
              return e.native.prepare(
                this.name,
                this.text,
                r.length,
                function (n) {
                  return n
                    ? i(n)
                    : ((e.namedQueries[t.name] = t.text),
                      t.native.execute(t.name, r, i));
                },
              );
            }
            if (this.values) {
              if (!Array.isArray(this.values)) {
                let e = Error("Query values must be an array");
                return i(e);
              }
              var s = this.values.map(n.prepareValue);
              e.native.query(this.text, s, i);
            } else e.native.query(this.text, i);
          });
      }),
      e8 = I((e, t) => {
        D();
        var i = (e2(), T(e6)),
          r = en(),
          n = (e5(), C().EventEmitter),
          s = (eb(), T(ev)),
          a = eM(),
          o = e3(),
          u = (t.exports = function (e) {
            n.call(this),
              (e = e || {}),
              (this._Promise = e.Promise || p.Promise),
              (this._types = new r(e.types)),
              (this.native = new i({ types: this._types })),
              (this._queryQueue = []),
              (this._ending = !1),
              (this._connecting = !1),
              (this._connected = !1),
              (this._queryable = !0);
            var t = (this.connectionParameters = new a(e));
            (this.user = t.user),
              Object.defineProperty(this, "password", {
                configurable: !0,
                enumerable: !1,
                writable: !0,
                value: t.password,
              }),
              (this.database = t.database),
              (this.host = t.host),
              (this.port = t.port),
              (this.namedQueries = {});
          });
        (u.Query = o),
          s.inherits(u, n),
          (u.prototype._errorAllQueries = function (e) {
            let t = S((t) => {
              v.nextTick(() => {
                (t.native = this.native), t.handleError(e);
              });
            }, "enqueueError");
            this._hasActiveQuery() &&
              (t(this._activeQuery), (this._activeQuery = null)),
              this._queryQueue.forEach(t),
              (this._queryQueue.length = 0);
          }),
          (u.prototype._connect = function (e) {
            var t = this;
            this._connecting
              ? v.nextTick(() =>
                  e(
                    Error(
                      "Client has already been connected. You cannot reuse a client.",
                    ),
                  ),
                )
              : ((this._connecting = !0),
                this.connectionParameters.getLibpqConnectionString(
                  function (i, r) {
                    if (i) return e(i);
                    t.native.connect(r, function (i) {
                      if (i) return t.native.end(), e(i);
                      (t._connected = !0),
                        t.native.on("error", function (e) {
                          (t._queryable = !1),
                            t._errorAllQueries(e),
                            t.emit("error", e);
                        }),
                        t.native.on("notification", function (e) {
                          t.emit("notification", {
                            channel: e.relname,
                            payload: e.extra,
                          });
                        }),
                        t.emit("connect"),
                        t._pulseQueryQueue(!0),
                        e();
                    });
                  },
                ));
          }),
          (u.prototype.connect = function (e) {
            return e
              ? void this._connect(e)
              : new this._Promise((e, t) => {
                  this._connect((i) => {
                    i ? t(i) : e();
                  });
                });
          }),
          (u.prototype.query = function (e, t, i) {
            var r, n, s, a, u;
            if (null == e)
              throw TypeError("Client was passed a null or undefined query");
            if ("function" == typeof e.submit)
              (s = e.query_timeout || this.connectionParameters.query_timeout),
                (n = r = e),
                "function" == typeof t && (e.callback = t);
            else if (
              ((s = this.connectionParameters.query_timeout),
              !(r = new o(e, t, i)).callback)
            ) {
              let e, t;
              (n = new this._Promise((i, r) => {
                (e = i), (t = r);
              })),
                (r.callback = (i, r) => (i ? t(i) : e(r)));
            }
            return (
              s &&
                ((u = r.callback),
                (a = setTimeout(() => {
                  var e = Error("Query read timeout");
                  v.nextTick(() => {
                    r.handleError(e, this.connection);
                  }),
                    u(e),
                    (r.callback = () => {});
                  var t = this._queryQueue.indexOf(r);
                  t > -1 && this._queryQueue.splice(t, 1),
                    this._pulseQueryQueue();
                }, s)),
                (r.callback = (e, t) => {
                  clearTimeout(a), u(e, t);
                })),
              this._queryable
                ? this._ending
                  ? ((r.native = this.native),
                    v.nextTick(() => {
                      r.handleError(
                        Error("Client was closed and is not queryable"),
                      );
                    }))
                  : (this._queryQueue.push(r), this._pulseQueryQueue())
                : ((r.native = this.native),
                  v.nextTick(() => {
                    r.handleError(
                      Error(
                        "Client has encountered a connection error and is not queryable",
                      ),
                    );
                  })),
              n
            );
          }),
          (u.prototype.end = function (e) {
            var t,
              i = this;
            return (
              (this._ending = !0),
              this._connected || this.once("connect", this.end.bind(this, e)),
              e ||
                (t = new this._Promise(function (t, i) {
                  e = S((e) => (e ? i(e) : t()), "cb");
                })),
              this.native.end(function () {
                i._errorAllQueries(Error("Connection terminated")),
                  v.nextTick(() => {
                    i.emit("end"), e && e();
                  });
              }),
              t
            );
          }),
          (u.prototype._hasActiveQuery = function () {
            return (
              this._activeQuery &&
              "error" !== this._activeQuery.state &&
              "end" !== this._activeQuery.state
            );
          }),
          (u.prototype._pulseQueryQueue = function (e) {
            if (this._connected && !this._hasActiveQuery()) {
              var t = this._queryQueue.shift();
              if (!t) {
                e || this.emit("drain");
                return;
              }
              (this._activeQuery = t), t.submit(this);
              var i = this;
              t.once("_done", function () {
                i._pulseQueryQueue();
              });
            }
          }),
          (u.prototype.cancel = function (e) {
            this._activeQuery === e
              ? this.native.cancel(function () {})
              : -1 !== this._queryQueue.indexOf(e) &&
                this._queryQueue.splice(this._queryQueue.indexOf(e), 1);
          }),
          (u.prototype.ref = function () {}),
          (u.prototype.unref = function () {}),
          (u.prototype.setTypeParser = function (e, t, i) {
            return this._types.setTypeParser(e, t, i);
          }),
          (u.prototype.getTypeParser = function (e, t) {
            return this._types.getTypeParser(e, t);
          });
      }),
      e9 = I((e, t) => {
        D(), (t.exports = e8());
      }),
      e7 = I((e, t) => {
        D();
        var i = e0(),
          r = em(),
          n = eY(),
          s = e1(),
          { DatabaseError: a } = eG(),
          o = S((e) => {
            var t;
            return (
              S(
                (t = class extends s {
                  constructor(t) {
                    super(t, e);
                  }
                }),
                "BoundPool",
              ),
              t
            );
          }, "poolFactory"),
          u = S(function (e) {
            (this.defaults = r),
              (this.Client = e),
              (this.Query = this.Client.Query),
              (this.Pool = o(this.Client)),
              (this._pools = []),
              (this.Connection = n),
              (this.types = er()),
              (this.DatabaseError = a);
          }, "PG");
        "u" > typeof v.env.NODE_PG_FORCE_NATIVE
          ? (t.exports = new u(e9()))
          : ((t.exports = new u(i)),
            Object.defineProperty(t.exports, "native", {
              configurable: !0,
              enumerable: !1,
              get() {
                var e = null;
                try {
                  e = new u(e9());
                } catch (e) {
                  if ("MODULE_NOT_FOUND" !== e.code) throw e;
                }
                return (
                  Object.defineProperty(t.exports, "native", { value: e }), e
                );
              },
            }));
      });
    D(), D(), F(), J(), D();
    var te = Object.defineProperty,
      tt = Object.defineProperties,
      ti = Object.getOwnPropertyDescriptors,
      tr = Object.getOwnPropertySymbols,
      tn = Object.prototype.hasOwnProperty,
      ts = Object.prototype.propertyIsEnumerable,
      ta = S(
        (e, t, i) =>
          t in e
            ? te(e, t, {
                enumerable: !0,
                configurable: !0,
                writable: !0,
                value: i,
              })
            : (e[t] = i),
        "__defNormalProp",
      ),
      to = S((e, t) => {
        for (var i in t || (t = {})) tn.call(t, i) && ta(e, i, t[i]);
        if (tr) for (var i of tr(t)) ts.call(t, i) && ta(e, i, t[i]);
        return e;
      }, "__spreadValues"),
      tu = S((e, t) => tt(e, ti(t)), "__spreadProps"),
      tl = 2 === new Uint8Array(new Uint16Array([258]).buffer)[0],
      tc = new TextDecoder(),
      td = new TextEncoder(),
      tf = td.encode("0123456789abcdef"),
      th = td.encode("0123456789ABCDEF"),
      tp = td
        .encode(
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        )
        .slice();
    function tm(e, { alphabet: t, scratchArr: i } = {}) {
      if (!l)
        if (((l = new Uint16Array(256)), (c = new Uint16Array(256)), tl))
          for (let e = 0; e < 256; e++)
            (l[e] = (tf[15 & e] << 8) | tf[e >>> 4]),
              (c[e] = (th[15 & e] << 8) | th[e >>> 4]);
        else
          for (let e = 0; e < 256; e++)
            (l[e] = tf[15 & e] | (tf[e >>> 4] << 8)),
              (c[e] = th[15 & e] | (th[e >>> 4] << 8));
      e.byteOffset % 4 != 0 && (e = new Uint8Array(e));
      let r = e.length,
        n = r >>> 2,
        s = i || new Uint16Array(r),
        a = new Uint32Array(e.buffer, e.byteOffset, n),
        o = new Uint32Array(s.buffer, s.byteOffset, r >>> 1),
        u = "upper" === t ? c : l,
        d = 0,
        f = 0,
        h;
      if (tl)
        for (; d < n; )
          (h = a[d++]),
            (o[f++] = (u[(h >>> 8) & 255] << 16) | u[255 & h]),
            (o[f++] = (u[h >>> 24] << 16) | u[(h >>> 16) & 255]);
      else
        for (; d < n; )
          (h = a[d++]),
            (o[f++] = (u[h >>> 24] << 16) | u[(h >>> 16) & 255]),
            (o[f++] = (u[(h >>> 8) & 255] << 16) | u[255 & h]);
      for (d <<= 2; d < r; ) s[d] = u[e[d++]];
      return tc.decode(s.subarray(0, r));
    }
    function tg(e, t = {}) {
      let i = "",
        r = e.length,
        n = Math.ceil(r / 504e3),
        s = new Uint16Array(n > 1 ? 504e3 : r);
      for (let r = 0; r < n; r++) {
        let n = 504e3 * r,
          a = n + 504e3;
        i += tm(e.subarray(n, a), tu(to({}, t), { scratchArr: s }));
      }
      return i;
    }
    function tv(e, t = {}) {
      return "upper" !== t.alphabet && "function" == typeof e.toHex
        ? e.toHex()
        : tg(e, t);
    }
    (tp[62] = 45),
      (tp[63] = 95),
      S(tm, "_toHex"),
      S(tg, "_toHexChunked"),
      S(tv, "toHex"),
      D();
    var ty = class e {
      constructor(e, t) {
        (this.strings = e), (this.values = t);
      }
      toParameterizedQuery(t = { query: "", params: [] }) {
        let { strings: i, values: r } = this;
        for (let n = 0, s = i.length; n < s; n++)
          if (((t.query += i[n]), n < r.length)) {
            let i = r[n];
            if (i instanceof t_) t.query += i.sql;
            else if (i instanceof tO)
              if (i.queryData instanceof e) i.queryData.toParameterizedQuery(t);
              else {
                if (i.queryData.params?.length)
                  throw Error("This query is not composable");
                t.query += i.queryData.query;
              }
            else {
              let { params: e } = t;
              e.push(i),
                (t.query += "$" + e.length),
                (i instanceof g || ArrayBuffer.isView(i)) &&
                  (t.query += "::bytea");
            }
          }
        return t;
      }
    };
    S(ty, "SqlTemplate");
    var tb = class {
      constructor(e) {
        this.sql = e;
      }
    };
    S(tb, "UnsafeRawSql");
    var t_ = tb;
    function t$() {}
    D(), S(t$, "warnIfBrowser"), F();
    var tx = N(en()),
      tw = N(eg()),
      tS = class e extends Error {
        constructor(t) {
          super(t),
            O(this, "name", "NeonDbError"),
            O(this, "severity"),
            O(this, "code"),
            O(this, "detail"),
            O(this, "hint"),
            O(this, "position"),
            O(this, "internalPosition"),
            O(this, "internalQuery"),
            O(this, "where"),
            O(this, "schema"),
            O(this, "table"),
            O(this, "column"),
            O(this, "dataType"),
            O(this, "constraint"),
            O(this, "file"),
            O(this, "line"),
            O(this, "routine"),
            O(this, "sourceError"),
            "captureStackTrace" in Error &&
              "function" == typeof Error.captureStackTrace &&
              Error.captureStackTrace(this, e);
        }
      };
    S(tS, "NeonDbError");
    var tk =
        "transaction() expects an array of queries, or a function returning an array of queries",
      tI = [
        "severity",
        "code",
        "detail",
        "hint",
        "position",
        "internalPosition",
        "internalQuery",
        "where",
        "schema",
        "table",
        "column",
        "dataType",
        "constraint",
        "file",
        "line",
        "routine",
      ];
    function tE(e) {
      return e instanceof g ? "\\x" + tv(e) : e;
    }
    function tP(e) {
      let { query: t, params: i } =
        e instanceof ty ? e.toParameterizedQuery() : e;
      return { query: t, params: i.map((e) => tE((0, tw.prepareValue)(e))) };
    }
    function tN(
      e,
      {
        arrayMode: t,
        fullResults: i,
        fetchOptions: r,
        isolationLevel: n,
        readOnly: s,
        deferrable: a,
        authToken: o,
        disableWarningInBrowsers: u,
      } = {},
    ) {
      let l;
      if (!e)
        throw Error(
          "No database connection string was provided to `neon()`. Perhaps an environment variable has not been set?",
        );
      try {
        l = Q(e);
      } catch {
        throw Error(
          "Database connection string provided to `neon()` is not a valid URL. Connection string: " +
            String(e),
        );
      }
      let { protocol: c, username: d, hostname: f, port: h, pathname: p } = l;
      if (("postgres:" !== c && "postgresql:" !== c) || !d || !f || !p)
        throw Error(
          "Database connection string format for `neon()` should be: postgresql://user:password@host.tld/dbname?option=value",
        );
      function m(e, ...t) {
        if (!(Array.isArray(e) && Array.isArray(e.raw) && Array.isArray(t)))
          throw Error(
            'This function can now be called only as a tagged-template function: sql`SELECT ${value}`, not sql("SELECT $1", [value], options). For a conventional function call with value placeholders ($1, $2, etc.), use sql.query("SELECT $1", [value], options).',
          );
        return new tO(g, new ty(e, t));
      }
      async function g(l, c, d) {
        let p,
          { fetchEndpoint: m, fetchFunction: g } = B,
          v = Array.isArray(l) ? { queries: l.map((e) => tP(e)) } : tP(l),
          y = r ?? {},
          b = t ?? !1,
          _ = i ?? !1,
          $ = n,
          x = s,
          w = a;
        void 0 !== d &&
          (void 0 !== d.fetchOptions && (y = { ...y, ...d.fetchOptions }),
          void 0 !== d.arrayMode && (b = d.arrayMode),
          void 0 !== d.fullResults && (_ = d.fullResults),
          void 0 !== d.isolationLevel && ($ = d.isolationLevel),
          void 0 !== d.readOnly && (x = d.readOnly),
          void 0 !== d.deferrable && (w = d.deferrable)),
          void 0 === c ||
            Array.isArray(c) ||
            void 0 === c.fetchOptions ||
            (y = { ...y, ...c.fetchOptions });
        let S = o;
        Array.isArray(c) || c?.authToken === void 0 || (S = c.authToken);
        let k = "function" == typeof m ? m(f, h, { jwtAuth: void 0 !== S }) : m,
          I = {
            "Neon-Connection-String": e,
            "Neon-Raw-Text-Output": "true",
            "Neon-Array-Mode": "true",
          },
          E = await tA(S);
        E && (I.Authorization = `Bearer ${E}`),
          Array.isArray(l) &&
            (void 0 !== $ && (I["Neon-Batch-Isolation-Level"] = $),
            void 0 !== x && (I["Neon-Batch-Read-Only"] = String(x)),
            void 0 !== w && (I["Neon-Batch-Deferrable"] = String(w))),
          u || B.disableWarningInBrowsers || t$();
        try {
          p = await (g ?? fetch)(k, {
            method: "POST",
            body: JSON.stringify(v),
            headers: I,
            ...y,
          });
        } catch (t) {
          let e = new tS(`Error connecting to database: ${t}`);
          throw ((e.sourceError = t), e);
        }
        if (p.ok) {
          let e = await p.json();
          if (Array.isArray(l)) {
            let t = e.results;
            if (!Array.isArray(t))
              throw new tS("Neon internal error: unexpected result format");
            return t.map((e, t) => {
              let i = c[t] ?? {};
              return tz(e, {
                arrayMode: i.arrayMode ?? b,
                fullResults: i.fullResults ?? _,
                types: i.types,
              });
            });
          }
          {
            let t = c ?? {};
            return tz(e, {
              arrayMode: t.arrayMode ?? b,
              fullResults: t.fullResults ?? _,
              types: t.types,
            });
          }
        }
        {
          let { status: e } = p;
          if (400 === e) {
            let e = await p.json(),
              t = new tS(e.message);
            for (let i of tI) t[i] = e[i] ?? void 0;
            throw t;
          }
          {
            let t = await p.text();
            throw new tS(`Server error (HTTP status ${e}): ${t}`);
          }
        }
      }
      return (
        S(m, "templateFn"),
        (m.query = (e, t, i) => new tO(g, { query: e, params: t ?? [] }, i)),
        (m.unsafe = (e) => new t_(e)),
        (m.transaction = async (e, t) => {
          if (("function" == typeof e && (e = e(m)), !Array.isArray(e)))
            throw Error(tk);
          return (
            e.forEach((e) => {
              if (!(e instanceof tO)) throw Error(tk);
            }),
            g(
              e.map((e) => e.queryData),
              e.map((e) => e.opts ?? {}),
              t,
            )
          );
        }),
        S(g, "execute"),
        m
      );
    }
    S(tE, "encodeBuffersAsBytea"), S(tP, "prepareQuery"), S(tN, "neon");
    var tT = class {
      constructor(e, t, i) {
        (this.execute = e), (this.queryData = t), (this.opts = i);
      }
      then(e, t) {
        return this.execute(this.queryData, this.opts).then(e, t);
      }
      catch(e) {
        return this.execute(this.queryData, this.opts).catch(e);
      }
      finally(e) {
        return this.execute(this.queryData, this.opts).finally(e);
      }
    };
    S(tT, "NeonQueryPromise");
    var tO = tT;
    function tz(e, { arrayMode: t, fullResults: i, types: r }) {
      let n = new tx.default(r),
        s = e.fields.map((e) => e.name),
        a = e.fields.map((e) => n.getTypeParser(e.dataTypeID)),
        o =
          !0 === t
            ? e.rows.map((e) => e.map((e, t) => (null === e ? null : a[t](e))))
            : e.rows.map((e) =>
                Object.fromEntries(
                  e.map((e, t) => [s[t], null === e ? null : a[t](e)]),
                ),
              );
      return i
        ? ((e.viaNeonFetch = !0),
          (e.rowAsArray = t),
          (e.rows = o),
          (e._parsers = a),
          (e._types = n),
          e)
        : o;
    }
    async function tA(e) {
      if ("string" == typeof e) return e;
      if ("function" == typeof e)
        try {
          return await Promise.resolve(e());
        } catch (t) {
          let e = new tS("Error getting auth token.");
          throw (
            (t instanceof Error &&
              (e = new tS(`Error getting auth token: ${t.message}`)),
            e)
          );
        }
    }
    S(tz, "processQueryResult"), S(tA, "getAuthToken"), D();
    var tU = N(e7());
    D();
    var tD = N(e7()),
      tC = class extends tD.Client {
        constructor(e) {
          super(e), (this.config = e);
        }
        get neonConfig() {
          return this.connection.stream;
        }
        connect(e) {
          let { neonConfig: t } = this;
          t.forceDisablePgSSL && (this.ssl = this.connection.ssl = !1),
            this.ssl &&
              t.useSecureWebSocket &&
              console.warn(
                "SSL is enabled for both Postgres (e.g. ?sslmode=require in the connection string + forceDisablePgSSL = false) and the WebSocket tunnel (useSecureWebSocket = true). Double encryption will increase latency and CPU usage. It may be appropriate to disable SSL in the Postgres connection parameters or set forceDisablePgSSL = true.",
              );
          let i =
              ("string" != typeof this.config &&
                this.config?.host !== void 0) ||
              ("string" != typeof this.config &&
                this.config?.connectionString !== void 0) ||
              void 0 !== v.env.PGHOST,
            r = v.env.USER ?? v.env.USERNAME;
          if (
            !i &&
            "localhost" === this.host &&
            this.user === r &&
            this.database === r &&
            null === this.password
          )
            throw Error(`No database host or connection string wa\
s set, and key parameters have default values (host: localhost, user: ${r}, db: ${r}, password: null\
). Is an environment variable missing? Alternatively, if you intended to connect with these paramete\
rs, please set the host to 'localhost' explicitly.`);
          let n = super.connect(e),
            s = t.pipelineTLS && this.ssl,
            a = "password" === t.pipelineConnect;
          if (!s && !t.pipelineConnect) return n;
          let o = this.connection;
          if ((s && o.on("connect", () => o.stream.emit("data", "S")), a)) {
            o.removeAllListeners("authenticationCleartextPassword"),
              o.removeAllListeners("readyForQuery"),
              o.once("readyForQuery", () =>
                o.on("readyForQuery", this._handleReadyForQuery.bind(this)),
              );
            let e = this.ssl ? "sslconnect" : "connect";
            o.on(e, () => {
              this.neonConfig.disableWarningInBrowsers || t$(),
                this._handleAuthCleartextPassword(),
                this._handleReadyForQuery();
            });
          }
          return n;
        }
        async _handleAuthSASLContinue(e) {
          if (
            typeof crypto > "u" ||
            void 0 === crypto.subtle ||
            void 0 === crypto.subtle.importKey
          )
            throw Error(
              "Cannot use SASL auth when `crypto.subtle` is not defined",
            );
          let t = crypto.subtle,
            i = this.saslSession,
            r = this.password,
            n = e.data;
          if (
            "SASLInitialResponse" !== i.message ||
            "string" != typeof r ||
            "string" != typeof n
          )
            throw Error("SASL: protocol error");
          let s = Object.fromEntries(
              n.split(",").map((e) => {
                if (!/^.=/.test(e))
                  throw Error("SASL: Invalid attribute pair entry");
                return [e[0], e.substring(2)];
              }),
            ),
            a = s.r,
            o = s.s,
            u = s.i;
          if (!a || !/^[!-+--~]+$/.test(a))
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing/unprintable",
            );
          if (
            !o ||
            !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(
              o,
            )
          )
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing/not base64",
            );
          if (!u || !/^[1-9][0-9]*$/.test(u))
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: missing/invalid iteration count",
            );
          if (!a.startsWith(i.clientNonce))
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce",
            );
          if (a.length === i.clientNonce.length)
            throw Error(
              "SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short",
            );
          let l = parseInt(u, 10),
            c = g.from(o, "base64"),
            d = new TextEncoder(),
            f = d.encode(r),
            h = await t.importKey(
              "raw",
              f,
              { name: "HMAC", hash: { name: "SHA-256" } },
              !1,
              ["sign"],
            ),
            p = new Uint8Array(
              await t.sign("HMAC", h, g.concat([c, g.from([0, 0, 0, 1])])),
            ),
            m = p;
          for (var v = 0; v < l - 1; v++)
            (p = new Uint8Array(await t.sign("HMAC", h, p))),
              (m = g.from(m.map((e, t) => m[t] ^ p[t])));
          let y = m,
            b = await t.importKey(
              "raw",
              y,
              { name: "HMAC", hash: { name: "SHA-256" } },
              !1,
              ["sign"],
            ),
            _ = new Uint8Array(await t.sign("HMAC", b, d.encode("Client Key"))),
            $ = await t.digest("SHA-256", _),
            x = "n=*,r=" + i.clientNonce,
            w = "r=" + a + ",s=" + o + ",i=" + l,
            S = "c=biws,r=" + a,
            k = x + "," + w + "," + S,
            I = await t.importKey(
              "raw",
              $,
              { name: "HMAC", hash: { name: "SHA-256" } },
              !1,
              ["sign"],
            );
          var E = new Uint8Array(await t.sign("HMAC", I, d.encode(k))),
            P = g.from(_.map((e, t) => _[t] ^ E[t])).toString("base64");
          let N = await t.importKey(
              "raw",
              y,
              { name: "HMAC", hash: { name: "SHA-256" } },
              !1,
              ["sign"],
            ),
            T = await t.sign("HMAC", N, d.encode("Server Key")),
            O = await t.importKey(
              "raw",
              T,
              { name: "HMAC", hash: { name: "SHA-256" } },
              !1,
              ["sign"],
            );
          var z = g.from(await t.sign("HMAC", O, d.encode(k)));
          (i.message = "SASLResponse"),
            (i.serverSignature = z.toString("base64")),
            (i.response = S + ",p=" + P),
            this.connection.sendSCRAMClientFinalMessage(
              this.saslSession.response,
            );
        }
      };
    S(tC, "NeonClient"), F();
    var tj = N(eM());
    function tZ(e, t) {
      let i, r;
      return t
        ? { callback: t, result: void 0 }
        : {
            callback: S(function (e, t) {
              e ? i(e) : r(t);
            }, "cb"),
            result: new e(function (e, t) {
              (r = e), (i = t);
            }),
          };
    }
    S(tZ, "promisify"),
      S(
        class extends tU.Pool {
          constructor() {
            super(...arguments),
              O(this, "Client", tC),
              O(this, "hasFetchUnsupportedListeners", !1),
              O(this, "addListener", this.on);
          }
          on(e, t) {
            return (
              "error" !== e && (this.hasFetchUnsupportedListeners = !0),
              super.on(e, t)
            );
          }
          query(e, t, i) {
            if (
              !B.poolQueryViaFetch ||
              this.hasFetchUnsupportedListeners ||
              "function" == typeof e
            )
              return super.query(e, t, i);
            "function" == typeof t && ((i = t), (t = void 0));
            let r = tZ(this.Promise, i);
            i = r.callback;
            try {
              let r = new tj.default(this.options),
                n = encodeURIComponent,
                s = encodeURI,
                a = `postgresql://${n(r.user)}:${n(r.password)}@${n(r.host)}\
/${s(r.database)}`,
                o = "string" == typeof e ? e : e.text,
                u = t ?? e.values ?? [];
              tN(a, { fullResults: !0, arrayMode: "array" === e.rowMode })
                .query(o, u, { types: e.types ?? this.options?.types })
                .then((e) => i(void 0, e))
                .catch((e) => i(e));
            } catch (e) {
              i(e);
            }
            return r.result;
          }
        },
        "NeonPool",
      ),
      F();
    var tL = N(e7());
    tL.DatabaseError, tL.defaults, tL.escapeIdentifier, tL.escapeLiteral;
    var tR = tL.types;
    let tM = Symbol.for("drizzle:entityKind");
    function tB(e, t) {
      if (!e || "object" != typeof e) return !1;
      if (e instanceof t) return !0;
      if (!Object.prototype.hasOwnProperty.call(t, tM))
        throw Error(
          `Class "${t.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`,
        );
      let i = Object.getPrototypeOf(e).constructor;
      if (i)
        for (; i; ) {
          if (tM in i && i[tM] === t[tM]) return !0;
          i = Object.getPrototypeOf(i);
        }
      return !1;
    }
    Symbol.for("drizzle:hasOwnEntityKind");
    class tF {
      static [tM] = "ConsoleLogWriter";
      write(e) {
        console.log(e);
      }
    }
    class tq {
      static [tM] = "DefaultLogger";
      writer;
      constructor(e) {
        this.writer = e?.writer ?? new tF();
      }
      logQuery(e, t) {
        let i = t.map((e) => {
            try {
              return JSON.stringify(e);
            } catch {
              return String(e);
            }
          }),
          r = i.length ? ` -- params: [${i.join(", ")}]` : "";
        this.writer.write(`Query: ${e}${r}`);
      }
    }
    class tQ {
      static [tM] = "NoopLogger";
      logQuery() {}
    }
    class tJ {
      static [tM] = "QueryPromise";
      [Symbol.toStringTag] = "QueryPromise";
      catch(e) {
        return this.then(void 0, e);
      }
      finally(e) {
        return this.then(
          (t) => (e?.(), t),
          (t) => {
            throw (e?.(), t);
          },
        );
      }
      then(e, t) {
        return this.execute().then(e, t);
      }
    }
    class tV {
      constructor(e, t) {
        (this.table = e),
          (this.config = t),
          (this.name = t.name),
          (this.keyAsName = t.keyAsName),
          (this.notNull = t.notNull),
          (this.default = t.default),
          (this.defaultFn = t.defaultFn),
          (this.onUpdateFn = t.onUpdateFn),
          (this.hasDefault = t.hasDefault),
          (this.primary = t.primaryKey),
          (this.isUnique = t.isUnique),
          (this.uniqueName = t.uniqueName),
          (this.uniqueType = t.uniqueType),
          (this.dataType = t.dataType),
          (this.columnType = t.columnType),
          (this.generated = t.generated),
          (this.generatedIdentity = t.generatedIdentity);
      }
      static [tM] = "Column";
      name;
      keyAsName;
      primary;
      notNull;
      default;
      defaultFn;
      onUpdateFn;
      hasDefault;
      isUnique;
      uniqueName;
      uniqueType;
      dataType;
      columnType;
      enumValues = void 0;
      generated = void 0;
      generatedIdentity = void 0;
      config;
      mapFromDriverValue(e) {
        return e;
      }
      mapToDriverValue(e) {
        return e;
      }
      shouldDisableInsert() {
        return (
          void 0 !== this.config.generated &&
          "byDefault" !== this.config.generated.type
        );
      }
    }
    class tW {
      static [tM] = "ColumnBuilder";
      config;
      constructor(e, t, i) {
        this.config = {
          name: e,
          keyAsName: "" === e,
          notNull: !1,
          default: void 0,
          hasDefault: !1,
          primaryKey: !1,
          isUnique: !1,
          uniqueName: void 0,
          uniqueType: void 0,
          dataType: t,
          columnType: i,
          generated: void 0,
        };
      }
      $type() {
        return this;
      }
      notNull() {
        return (this.config.notNull = !0), this;
      }
      default(e) {
        return (this.config.default = e), (this.config.hasDefault = !0), this;
      }
      $defaultFn(e) {
        return (this.config.defaultFn = e), (this.config.hasDefault = !0), this;
      }
      $default = this.$defaultFn;
      $onUpdateFn(e) {
        return (
          (this.config.onUpdateFn = e), (this.config.hasDefault = !0), this
        );
      }
      $onUpdate = this.$onUpdateFn;
      primaryKey() {
        return (this.config.primaryKey = !0), (this.config.notNull = !0), this;
      }
      setName(e) {
        "" === this.config.name && (this.config.name = e);
      }
    }
    let tG = Symbol.for("drizzle:Name");
    class tK {
      static [tM] = "PgForeignKeyBuilder";
      reference;
      _onUpdate = "no action";
      _onDelete = "no action";
      constructor(e, t) {
        (this.reference = () => {
          let { name: t, columns: i, foreignColumns: r } = e();
          return {
            name: t,
            columns: i,
            foreignTable: r[0].table,
            foreignColumns: r,
          };
        }),
          t && ((this._onUpdate = t.onUpdate), (this._onDelete = t.onDelete));
      }
      onUpdate(e) {
        return (this._onUpdate = void 0 === e ? "no action" : e), this;
      }
      onDelete(e) {
        return (this._onDelete = void 0 === e ? "no action" : e), this;
      }
      build(e) {
        return new tX(e, this);
      }
    }
    class tX {
      constructor(e, t) {
        (this.table = e),
          (this.reference = t.reference),
          (this.onUpdate = t._onUpdate),
          (this.onDelete = t._onDelete);
      }
      static [tM] = "PgForeignKey";
      reference;
      onUpdate;
      onDelete;
      getName() {
        let { name: e, columns: t, foreignColumns: i } = this.reference(),
          r = t.map((e) => e.name),
          n = i.map((e) => e.name),
          s = [this.table[tG], ...r, i[0].table[tG], ...n];
        return e ?? `${s.join("_")}_fk`;
      }
    }
    function tH(e, ...t) {
      return e(...t);
    }
    function tY(e, t) {
      return `${e[tG]}_${t.join("_")}_unique`;
    }
    class t0 {
      constructor(e, t) {
        (this.name = t), (this.columns = e);
      }
      static [tM] = "PgUniqueConstraintBuilder";
      columns;
      nullsNotDistinctConfig = !1;
      nullsNotDistinct() {
        return (this.nullsNotDistinctConfig = !0), this;
      }
      build(e) {
        return new t6(e, this.columns, this.nullsNotDistinctConfig, this.name);
      }
    }
    class t1 {
      static [tM] = "PgUniqueOnConstraintBuilder";
      name;
      constructor(e) {
        this.name = e;
      }
      on(...e) {
        return new t0(e, this.name);
      }
    }
    class t6 {
      constructor(e, t, i, r) {
        (this.table = e),
          (this.columns = t),
          (this.name =
            r ??
            tY(
              this.table,
              this.columns.map((e) => e.name),
            )),
          (this.nullsNotDistinct = i);
      }
      static [tM] = "PgUniqueConstraint";
      columns;
      name;
      nullsNotDistinct = !1;
      getName() {
        return this.name;
      }
    }
    function t4(e, t, i) {
      for (let r = t; r < e.length; r++) {
        let n = e[r];
        if ("\\" === n) {
          r++;
          continue;
        }
        if ('"' === n) return [e.slice(t, r).replace(/\\/g, ""), r + 1];
        if (!i && ("," === n || "}" === n))
          return [e.slice(t, r).replace(/\\/g, ""), r];
      }
      return [e.slice(t).replace(/\\/g, ""), e.length];
    }
    class t2 extends tW {
      foreignKeyConfigs = [];
      static [tM] = "PgColumnBuilder";
      array(e) {
        return new t9(this.config.name, this, e);
      }
      references(e, t = {}) {
        return this.foreignKeyConfigs.push({ ref: e, actions: t }), this;
      }
      unique(e, t) {
        return (
          (this.config.isUnique = !0),
          (this.config.uniqueName = e),
          (this.config.uniqueType = t?.nulls),
          this
        );
      }
      generatedAlwaysAs(e) {
        return (
          (this.config.generated = { as: e, type: "always", mode: "stored" }),
          this
        );
      }
      buildForeignKeys(e, t) {
        return this.foreignKeyConfigs.map(({ ref: i, actions: r }) =>
          tH(
            (i, r) => {
              let n = new tK(() => ({ columns: [e], foreignColumns: [i()] }));
              return (
                r.onUpdate && n.onUpdate(r.onUpdate),
                r.onDelete && n.onDelete(r.onDelete),
                n.build(t)
              );
            },
            i,
            r,
          ),
        );
      }
      buildExtraConfigColumn(e) {
        return new t3(e, this.config);
      }
    }
    class t5 extends tV {
      constructor(e, t) {
        t.uniqueName || (t.uniqueName = tY(e, [t.name])),
          super(e, t),
          (this.table = e);
      }
      static [tM] = "PgColumn";
    }
    class t3 extends t5 {
      static [tM] = "ExtraConfigColumn";
      getSQLType() {
        return this.getSQLType();
      }
      indexConfig = {
        order: this.config.order ?? "asc",
        nulls: this.config.nulls ?? "last",
        opClass: this.config.opClass,
      };
      defaultConfig = { order: "asc", nulls: "last", opClass: void 0 };
      asc() {
        return (this.indexConfig.order = "asc"), this;
      }
      desc() {
        return (this.indexConfig.order = "desc"), this;
      }
      nullsFirst() {
        return (this.indexConfig.nulls = "first"), this;
      }
      nullsLast() {
        return (this.indexConfig.nulls = "last"), this;
      }
      op(e) {
        return (this.indexConfig.opClass = e), this;
      }
    }
    class t8 {
      static [tM] = "IndexedColumn";
      constructor(e, t, i, r) {
        (this.name = e),
          (this.keyAsName = t),
          (this.type = i),
          (this.indexConfig = r);
      }
      name;
      keyAsName;
      type;
      indexConfig;
    }
    class t9 extends t2 {
      static [tM] = "PgArrayBuilder";
      constructor(e, t, i) {
        super(e, "array", "PgArray"),
          (this.config.baseBuilder = t),
          (this.config.size = i);
      }
      build(e) {
        let t = this.config.baseBuilder.build(e);
        return new t7(e, this.config, t);
      }
    }
    class t7 extends t5 {
      constructor(e, t, i, r) {
        super(e, t),
          (this.baseColumn = i),
          (this.range = r),
          (this.size = t.size);
      }
      size;
      static [tM] = "PgArray";
      getSQLType() {
        return `${this.baseColumn.getSQLType()}[${"number" == typeof this.size ? this.size : ""}]`;
      }
      mapFromDriverValue(e) {
        return (
          "string" == typeof e &&
            (e = (function (e) {
              let [t] = (function e(t, i = 0) {
                let r = [],
                  n = i,
                  s = !1;
                for (; n < t.length; ) {
                  let a = t[n];
                  if ("," === a) {
                    (s || n === i) && r.push(""), (s = !0), n++;
                    continue;
                  }
                  if (((s = !1), "\\" === a)) {
                    n += 2;
                    continue;
                  }
                  if ('"' === a) {
                    let [e, i] = t4(t, n + 1, !0);
                    r.push(e), (n = i);
                    continue;
                  }
                  if ("}" === a) return [r, n + 1];
                  if ("{" === a) {
                    let [i, s] = e(t, n + 1);
                    r.push(i), (n = s);
                    continue;
                  }
                  let [o, u] = t4(t, n, !1);
                  r.push(o), (n = u);
                }
                return [r, n];
              })(e, 1);
              return t;
            })(e)),
          e.map((e) => this.baseColumn.mapFromDriverValue(e))
        );
      }
      mapToDriverValue(e, t = !1) {
        let i = e.map((e) =>
          null === e
            ? null
            : tB(this.baseColumn, t7)
              ? this.baseColumn.mapToDriverValue(e, !0)
              : this.baseColumn.mapToDriverValue(e),
        );
        return t
          ? i
          : (function e(t) {
              return `{${t.map((t) => (Array.isArray(t) ? e(t) : "string" == typeof t ? `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `${t}`)).join(",")}}`;
            })(i);
      }
    }
    class ie extends t2 {
      static [tM] = "PgEnumObjectColumnBuilder";
      constructor(e, t) {
        super(e, "string", "PgEnumObjectColumn"), (this.config.enum = t);
      }
      build(e) {
        return new it(e, this.config);
      }
    }
    class it extends t5 {
      static [tM] = "PgEnumObjectColumn";
      enum;
      enumValues = this.config.enum.enumValues;
      constructor(e, t) {
        super(e, t), (this.enum = t.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    let ii = Symbol.for("drizzle:isPgEnum");
    class ir extends t2 {
      static [tM] = "PgEnumColumnBuilder";
      constructor(e, t) {
        super(e, "string", "PgEnumColumn"), (this.config.enum = t);
      }
      build(e) {
        return new is(e, this.config);
      }
    }
    class is extends t5 {
      static [tM] = "PgEnumColumn";
      enum = this.config.enum;
      enumValues = this.config.enum.enumValues;
      constructor(e, t) {
        super(e, t), (this.enum = t.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    class ia {
      static [tM] = "Subquery";
      constructor(e, t, i, r = !1, n = []) {
        this._ = {
          brand: "Subquery",
          sql: e,
          selectedFields: t,
          alias: i,
          isWith: r,
          usedTables: n,
        };
      }
    }
    class io extends ia {
      static [tM] = "WithSubquery";
    }
    let iu = (e, r) =>
        t
          ? (i || (i = t.trace.getTracer("drizzle-orm", "0.45.2")),
            tH(
              (t, i) =>
                i.startActiveSpan(e, (e) => {
                  try {
                    return r(e);
                  } catch (i) {
                    throw (
                      (e.setStatus({
                        code: t.SpanStatusCode.ERROR,
                        message:
                          i instanceof Error ? i.message : "Unknown error",
                      }),
                      i)
                    );
                  } finally {
                    e.end();
                  }
                }),
              t,
              i,
            ))
          : r(),
      il = Symbol.for("drizzle:ViewBaseConfig"),
      ic = Symbol.for("drizzle:Schema"),
      id = Symbol.for("drizzle:Columns"),
      ih = Symbol.for("drizzle:ExtraConfigColumns"),
      ip = Symbol.for("drizzle:OriginalName"),
      im = Symbol.for("drizzle:BaseName"),
      ig = Symbol.for("drizzle:IsAlias"),
      iv = Symbol.for("drizzle:ExtraConfigBuilder"),
      iy = Symbol.for("drizzle:IsDrizzleTable");
    class ib {
      static [tM] = "Table";
      static Symbol = {
        Name: tG,
        Schema: ic,
        OriginalName: ip,
        Columns: id,
        ExtraConfigColumns: ih,
        BaseName: im,
        IsAlias: ig,
        ExtraConfigBuilder: iv,
      };
      [tG];
      [ip];
      [ic];
      [id];
      [ih];
      [im];
      [ig] = !1;
      [iy] = !0;
      [iv] = void 0;
      constructor(e, t, i) {
        (this[tG] = this[ip] = e), (this[ic] = t), (this[im] = i);
      }
    }
    function i_(e) {
      return "object" == typeof e && null !== e && iy in e;
    }
    function i$(e) {
      return `${e[ic] ?? "public"}.${e[tG]}`;
    }
    class ix {
      static [tM] = "FakePrimitiveParam";
    }
    function iw(e) {
      return null != e && "function" == typeof e.getSQL;
    }
    class iS {
      static [tM] = "StringChunk";
      value;
      constructor(e) {
        this.value = Array.isArray(e) ? e : [e];
      }
      getSQL() {
        return new ik([this]);
      }
    }
    class ik {
      constructor(e) {
        for (const t of ((this.queryChunks = e), e))
          if (tB(t, ib)) {
            const e = t[ib.Symbol.Schema];
            this.usedTables.push(
              void 0 === e ? t[ib.Symbol.Name] : e + "." + t[ib.Symbol.Name],
            );
          }
      }
      static [tM] = "SQL";
      decoder = iE;
      shouldInlineParams = !1;
      usedTables = [];
      append(e) {
        return this.queryChunks.push(...e.queryChunks), this;
      }
      toQuery(e) {
        return iu("drizzle.buildSQL", (t) => {
          let i = this.buildQueryFromSourceParams(this.queryChunks, e);
          return (
            t?.setAttributes({
              "drizzle.query.text": i.sql,
              "drizzle.query.params": JSON.stringify(i.params),
            }),
            i
          );
        });
      }
      buildQueryFromSourceParams(e, t) {
        let i = Object.assign({}, t, {
            inlineParams: t.inlineParams || this.shouldInlineParams,
            paramStartIndex: t.paramStartIndex || { value: 0 },
          }),
          {
            casing: r,
            escapeName: n,
            escapeParam: s,
            prepareTyping: a,
            inlineParams: o,
            paramStartIndex: u,
          } = i;
        var l = e.map((e) => {
          if (tB(e, iS)) return { sql: e.value.join(""), params: [] };
          if (tB(e, iI)) return { sql: n(e.value), params: [] };
          if (void 0 === e) return { sql: "", params: [] };
          if (Array.isArray(e)) {
            let t = [new iS("(")];
            for (let [i, r] of e.entries())
              t.push(r), i < e.length - 1 && t.push(new iS(", "));
            return t.push(new iS(")")), this.buildQueryFromSourceParams(t, i);
          }
          if (tB(e, ik))
            return this.buildQueryFromSourceParams(e.queryChunks, {
              ...i,
              inlineParams: o || e.shouldInlineParams,
            });
          if (tB(e, ib)) {
            let t = e[ib.Symbol.Schema],
              i = e[ib.Symbol.Name];
            return {
              sql: void 0 === t || e[ig] ? n(i) : n(t) + "." + n(i),
              params: [],
            };
          }
          if (tB(e, tV)) {
            let i = r.getColumnCasing(e);
            if ("indexes" === t.invokeSource) return { sql: n(i), params: [] };
            let s = e.table[ib.Symbol.Schema];
            return {
              sql:
                e.table[ig] || void 0 === s
                  ? n(e.table[ib.Symbol.Name]) + "." + n(i)
                  : n(s) + "." + n(e.table[ib.Symbol.Name]) + "." + n(i),
              params: [],
            };
          }
          if (tB(e, iC)) {
            let t = e[il].schema,
              i = e[il].name;
            return {
              sql: void 0 === t || e[il].isAlias ? n(i) : n(t) + "." + n(i),
              params: [],
            };
          }
          if (tB(e, iN)) {
            if (tB(e.value, iA))
              return { sql: s(u.value++, e), params: [e], typings: ["none"] };
            let t =
              null === e.value ? null : e.encoder.mapToDriverValue(e.value);
            if (tB(t, ik)) return this.buildQueryFromSourceParams([t], i);
            if (o) return { sql: this.mapInlineParam(t, i), params: [] };
            let r = ["none"];
            return (
              a && (r = [a(e.encoder)]),
              { sql: s(u.value++, t), params: [t], typings: r }
            );
          }
          return tB(e, iA)
            ? { sql: s(u.value++, e), params: [e], typings: ["none"] }
            : tB(e, ik.Aliased) && void 0 !== e.fieldAlias
              ? { sql: n(e.fieldAlias), params: [] }
              : tB(e, ia)
                ? e._.isWith
                  ? { sql: n(e._.alias), params: [] }
                  : this.buildQueryFromSourceParams(
                      [new iS("("), e._.sql, new iS(") "), new iI(e._.alias)],
                      i,
                    )
                : e && "function" == typeof e && ii in e && !0 === e[ii]
                  ? e.schema
                    ? { sql: n(e.schema) + "." + n(e.enumName), params: [] }
                    : { sql: n(e.enumName), params: [] }
                  : iw(e)
                    ? e.shouldOmitSQLParens?.()
                      ? this.buildQueryFromSourceParams([e.getSQL()], i)
                      : this.buildQueryFromSourceParams(
                          [new iS("("), e.getSQL(), new iS(")")],
                          i,
                        )
                    : o
                      ? { sql: this.mapInlineParam(e, i), params: [] }
                      : {
                          sql: s(u.value++, e),
                          params: [e],
                          typings: ["none"],
                        };
        });
        let c = { sql: "", params: [] };
        for (let e of l)
          (c.sql += e.sql),
            c.params.push(...e.params),
            e.typings?.length &&
              (c.typings || (c.typings = []), c.typings.push(...e.typings));
        return c;
      }
      mapInlineParam(e, { escapeString: t }) {
        if (null === e) return "null";
        if ("number" == typeof e || "boolean" == typeof e) return e.toString();
        if ("string" == typeof e) return t(e);
        if ("object" == typeof e) {
          let i = e.toString();
          return "[object Object]" === i ? t(JSON.stringify(e)) : t(i);
        }
        throw Error("Unexpected param value: " + e);
      }
      getSQL() {
        return this;
      }
      as(e) {
        return void 0 === e ? this : new ik.Aliased(this, e);
      }
      mapWith(e) {
        return (
          (this.decoder =
            "function" == typeof e ? { mapFromDriverValue: e } : e),
          this
        );
      }
      inlineParams() {
        return (this.shouldInlineParams = !0), this;
      }
      if(e) {
        return e ? this : void 0;
      }
    }
    class iI {
      constructor(e) {
        this.value = e;
      }
      static [tM] = "Name";
      brand;
      getSQL() {
        return new ik([this]);
      }
    }
    let iE = { mapFromDriverValue: (e) => e },
      iP = { mapToDriverValue: (e) => e };
    ({ ...iE, ...iP });
    class iN {
      constructor(e, t = iP) {
        (this.value = e), (this.encoder = t);
      }
      static [tM] = "Param";
      brand;
      getSQL() {
        return new ik([this]);
      }
    }
    function iT(e, ...t) {
      let i = [];
      for (let [r, n] of ((t.length > 0 || (e.length > 0 && "" !== e[0])) &&
        i.push(new iS(e[0])),
      t.entries()))
        i.push(n, new iS(e[r + 1]));
      return new ik(i);
    }
    ((a = iT || (iT = {})).empty = function () {
      return new ik([]);
    }),
      (a.fromList = function (e) {
        return new ik(e);
      }),
      (a.raw = function (e) {
        return new ik([new iS(e)]);
      }),
      (a.join = function (e, t) {
        let i = [];
        for (let [r, n] of e.entries())
          r > 0 && void 0 !== t && i.push(t), i.push(n);
        return new ik(i);
      }),
      (a.identifier = function (e) {
        return new iI(e);
      }),
      (a.placeholder = function (e) {
        return new iA(e);
      }),
      (a.param = function (e, t) {
        return new iN(e, t);
      });
    var iO = ik || (ik = {});
    class iz {
      constructor(e, t) {
        (this.sql = e), (this.fieldAlias = t);
      }
      static [tM] = "SQL.Aliased";
      isSelectionField = !1;
      getSQL() {
        return this.sql;
      }
      clone() {
        return new iz(this.sql, this.fieldAlias);
      }
    }
    iO.Aliased = iz;
    class iA {
      constructor(e) {
        this.name = e;
      }
      static [tM] = "Placeholder";
      getSQL() {
        return new ik([this]);
      }
    }
    function iU(e, t) {
      return e.map((e) => {
        if (tB(e, iA)) {
          if (!(e.name in t))
            throw Error(`No value for placeholder "${e.name}" was provided`);
          return t[e.name];
        }
        if (tB(e, iN) && tB(e.value, iA)) {
          if (!(e.value.name in t))
            throw Error(
              `No value for placeholder "${e.value.name}" was provided`,
            );
          return e.encoder.mapToDriverValue(t[e.value.name]);
        }
        return e;
      });
    }
    let iD = Symbol.for("drizzle:IsDrizzleView");
    class iC {
      static [tM] = "View";
      [il];
      [iD] = !0;
      constructor({ name: e, schema: t, selectedFields: i, query: r }) {
        this[il] = {
          name: e,
          originalName: e,
          schema: t,
          selectedFields: i,
          query: r,
          isExisting: !r,
          isAlias: !1,
        };
      }
      getSQL() {
        return new ik([this]);
      }
    }
    (tV.prototype.getSQL = function () {
      return new ik([this]);
    }),
      (ib.prototype.getSQL = function () {
        return new ik([this]);
      }),
      (ia.prototype.getSQL = function () {
        return new ik([this]);
      });
    class ij {
      constructor(e) {
        this.table = e;
      }
      static [tM] = "ColumnAliasProxyHandler";
      get(e, t) {
        return "table" === t ? this.table : e[t];
      }
    }
    class iZ {
      constructor(e, t) {
        (this.alias = e), (this.replaceOriginalName = t);
      }
      static [tM] = "TableAliasProxyHandler";
      get(e, t) {
        if (t === ib.Symbol.IsAlias) return !0;
        if (
          t === ib.Symbol.Name ||
          (this.replaceOriginalName && t === ib.Symbol.OriginalName)
        )
          return this.alias;
        if (t === il) return { ...e[il], name: this.alias, isAlias: !0 };
        if (t === ib.Symbol.Columns) {
          let t = e[ib.Symbol.Columns];
          if (!t) return t;
          let i = {};
          return (
            Object.keys(t).map((r) => {
              i[r] = new Proxy(t[r], new ij(new Proxy(e, this)));
            }),
            i
          );
        }
        let i = e[t];
        return tB(i, tV) ? new Proxy(i, new ij(new Proxy(e, this))) : i;
      }
    }
    class iL {
      constructor(e) {
        this.alias = e;
      }
      static [tM] = "RelationTableAliasProxyHandler";
      get(e, t) {
        return "sourceTable" === t ? iR(e.sourceTable, this.alias) : e[t];
      }
    }
    function iR(e, t) {
      return new Proxy(e, new iZ(t, !1));
    }
    function iM(e, t) {
      return new Proxy(e, new ij(new Proxy(e.table, new iZ(t, !1))));
    }
    function iB(e, t) {
      return new ik.Aliased(iF(e.sql, t), e.fieldAlias);
    }
    function iF(e, t) {
      return iT.join(
        e.queryChunks.map((e) =>
          tB(e, tV)
            ? iM(e, t)
            : tB(e, ik)
              ? iF(e, t)
              : tB(e, ik.Aliased)
                ? iB(e, t)
                : e,
        ),
      );
    }
    class iq {
      static [tM] = "SelectionProxyHandler";
      config;
      constructor(e) {
        this.config = { ...e };
      }
      get(e, t) {
        if ("_" === t)
          return {
            ...e._,
            selectedFields: new Proxy(e._.selectedFields, this),
          };
        if (t === il)
          return {
            ...e[il],
            selectedFields: new Proxy(e[il].selectedFields, this),
          };
        if ("symbol" == typeof t) return e[t];
        let i = (
          tB(e, ia) ? e._.selectedFields : tB(e, iC) ? e[il].selectedFields : e
        )[t];
        if (tB(i, ik.Aliased)) {
          if ("sql" === this.config.sqlAliasedBehavior && !i.isSelectionField)
            return i.sql;
          let e = i.clone();
          return (e.isSelectionField = !0), e;
        }
        if (tB(i, ik)) {
          if ("sql" === this.config.sqlBehavior) return i;
          throw Error(
            `You tried to reference "${t}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`,
          );
        }
        return tB(i, tV)
          ? this.config.alias
            ? new Proxy(
                i,
                new ij(
                  new Proxy(
                    i.table,
                    new iZ(
                      this.config.alias,
                      this.config.replaceOriginalName ?? !1,
                    ),
                  ),
                ),
              )
            : i
          : "object" != typeof i || null === i
            ? i
            : new Proxy(i, new iq(this.config));
      }
    }
    function iQ(e, t) {
      return Object.entries(e).reduce((e, [i, r]) => {
        if ("string" != typeof i) return e;
        let n = t ? [...t, i] : [i];
        return (
          tB(r, tV) || tB(r, ik) || tB(r, ik.Aliased) || tB(r, ia)
            ? e.push({ path: n, field: r })
            : tB(r, ib)
              ? e.push(...iQ(r[ib.Symbol.Columns], n))
              : e.push(...iQ(r, n)),
          e
        );
      }, []);
    }
    function iJ(e, t) {
      let i = Object.keys(e),
        r = Object.keys(t);
      if (i.length !== r.length) return !1;
      for (let [e, t] of i.entries()) if (t !== r[e]) return !1;
      return !0;
    }
    function iV(e, t) {
      let i = Object.entries(t)
        .filter(([, e]) => void 0 !== e)
        .map(([t, i]) =>
          tB(i, ik) || tB(i, tV)
            ? [t, i]
            : [t, new iN(i, e[ib.Symbol.Columns][t])],
        );
      if (0 === i.length) throw Error("No values to set");
      return Object.fromEntries(i);
    }
    function iW(e) {
      return e[ib.Symbol.Columns];
    }
    function iG(e) {
      return tB(e, ia)
        ? e._.alias
        : tB(e, iC)
          ? e[il].name
          : tB(e, ik)
            ? void 0
            : e[ib.Symbol.IsAlias]
              ? e[ib.Symbol.Name]
              : e[ib.Symbol.BaseName];
    }
    function iK(e, t) {
      return {
        name: "string" == typeof e && e.length > 0 ? e : "",
        config: "object" == typeof e ? e : t,
      };
    }
    "u" < typeof TextDecoder || new TextDecoder();
    class iX extends t2 {
      static [tM] = "PgIntColumnBaseBuilder";
      generatedAlwaysAsIdentity(e) {
        if (e) {
          let { name: t, ...i } = e;
          this.config.generatedIdentity = {
            type: "always",
            sequenceName: t,
            sequenceOptions: i,
          };
        } else this.config.generatedIdentity = { type: "always" };
        return (this.config.hasDefault = !0), (this.config.notNull = !0), this;
      }
      generatedByDefaultAsIdentity(e) {
        if (e) {
          let { name: t, ...i } = e;
          this.config.generatedIdentity = {
            type: "byDefault",
            sequenceName: t,
            sequenceOptions: i,
          };
        } else this.config.generatedIdentity = { type: "byDefault" };
        return (this.config.hasDefault = !0), (this.config.notNull = !0), this;
      }
    }
    class iH extends iX {
      static [tM] = "PgBigInt53Builder";
      constructor(e) {
        super(e, "number", "PgBigInt53");
      }
      build(e) {
        return new iY(e, this.config);
      }
    }
    class iY extends t5 {
      static [tM] = "PgBigInt53";
      getSQLType() {
        return "bigint";
      }
      mapFromDriverValue(e) {
        return "number" == typeof e ? e : Number(e);
      }
    }
    class i0 extends iX {
      static [tM] = "PgBigInt64Builder";
      constructor(e) {
        super(e, "bigint", "PgBigInt64");
      }
      build(e) {
        return new i1(e, this.config);
      }
    }
    class i1 extends t5 {
      static [tM] = "PgBigInt64";
      getSQLType() {
        return "bigint";
      }
      mapFromDriverValue(e) {
        return BigInt(e);
      }
    }
    function i6(e, t) {
      let { name: i, config: r } = iK(e, t);
      return "number" === r.mode ? new iH(i) : new i0(i);
    }
    class i4 extends t2 {
      static [tM] = "PgBigSerial53Builder";
      constructor(e) {
        super(e, "number", "PgBigSerial53"),
          (this.config.hasDefault = !0),
          (this.config.notNull = !0);
      }
      build(e) {
        return new i2(e, this.config);
      }
    }
    class i2 extends t5 {
      static [tM] = "PgBigSerial53";
      getSQLType() {
        return "bigserial";
      }
      mapFromDriverValue(e) {
        return "number" == typeof e ? e : Number(e);
      }
    }
    class i5 extends t2 {
      static [tM] = "PgBigSerial64Builder";
      constructor(e) {
        super(e, "bigint", "PgBigSerial64"), (this.config.hasDefault = !0);
      }
      build(e) {
        return new i3(e, this.config);
      }
    }
    class i3 extends t5 {
      static [tM] = "PgBigSerial64";
      getSQLType() {
        return "bigserial";
      }
      mapFromDriverValue(e) {
        return BigInt(e);
      }
    }
    function i8(e, t) {
      let { name: i, config: r } = iK(e, t);
      return "number" === r.mode ? new i4(i) : new i5(i);
    }
    class i9 extends t2 {
      static [tM] = "PgBooleanBuilder";
      constructor(e) {
        super(e, "boolean", "PgBoolean");
      }
      build(e) {
        return new i7(e, this.config);
      }
    }
    class i7 extends t5 {
      static [tM] = "PgBoolean";
      getSQLType() {
        return "boolean";
      }
    }
    function re(e) {
      return new i9(e ?? "");
    }
    class rt extends t2 {
      static [tM] = "PgCharBuilder";
      constructor(e, t) {
        super(e, "string", "PgChar"),
          (this.config.length = t.length),
          (this.config.enumValues = t.enum);
      }
      build(e) {
        return new ri(e, this.config);
      }
    }
    class ri extends t5 {
      static [tM] = "PgChar";
      length = this.config.length;
      enumValues = this.config.enumValues;
      getSQLType() {
        return void 0 === this.length ? "char" : `char(${this.length})`;
      }
    }
    function rr(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return new rt(i, r);
    }
    class rn extends t2 {
      static [tM] = "PgCidrBuilder";
      constructor(e) {
        super(e, "string", "PgCidr");
      }
      build(e) {
        return new rs(e, this.config);
      }
    }
    class rs extends t5 {
      static [tM] = "PgCidr";
      getSQLType() {
        return "cidr";
      }
    }
    function ra(e) {
      return new rn(e ?? "");
    }
    class ro extends t2 {
      static [tM] = "PgCustomColumnBuilder";
      constructor(e, t, i) {
        super(e, "custom", "PgCustomColumn"),
          (this.config.fieldConfig = t),
          (this.config.customTypeParams = i);
      }
      build(e) {
        return new ru(e, this.config);
      }
    }
    class ru extends t5 {
      static [tM] = "PgCustomColumn";
      sqlName;
      mapTo;
      mapFrom;
      constructor(e, t) {
        super(e, t),
          (this.sqlName = t.customTypeParams.dataType(t.fieldConfig)),
          (this.mapTo = t.customTypeParams.toDriver),
          (this.mapFrom = t.customTypeParams.fromDriver);
      }
      getSQLType() {
        return this.sqlName;
      }
      mapFromDriverValue(e) {
        return "function" == typeof this.mapFrom ? this.mapFrom(e) : e;
      }
      mapToDriverValue(e) {
        return "function" == typeof this.mapTo ? this.mapTo(e) : e;
      }
    }
    function rl(e) {
      return (t, i) => {
        let { name: r, config: n } = iK(t, i);
        return new ro(r, n, e);
      };
    }
    class rc extends t2 {
      static [tM] = "PgDateColumnBaseBuilder";
      defaultNow() {
        return this.default(iT`now()`);
      }
    }
    class rd extends rc {
      static [tM] = "PgDateBuilder";
      constructor(e) {
        super(e, "date", "PgDate");
      }
      build(e) {
        return new rf(e, this.config);
      }
    }
    class rf extends t5 {
      static [tM] = "PgDate";
      getSQLType() {
        return "date";
      }
      mapFromDriverValue(e) {
        return "string" == typeof e ? new Date(e) : e;
      }
      mapToDriverValue(e) {
        return e.toISOString();
      }
    }
    class rh extends rc {
      static [tM] = "PgDateStringBuilder";
      constructor(e) {
        super(e, "string", "PgDateString");
      }
      build(e) {
        return new rp(e, this.config);
      }
    }
    class rp extends t5 {
      static [tM] = "PgDateString";
      getSQLType() {
        return "date";
      }
      mapFromDriverValue(e) {
        return "string" == typeof e ? e : e.toISOString().slice(0, -14);
      }
    }
    function rm(e, t) {
      let { name: i, config: r } = iK(e, t);
      return r?.mode === "date" ? new rd(i) : new rh(i);
    }
    class rg extends t2 {
      static [tM] = "PgDoublePrecisionBuilder";
      constructor(e) {
        super(e, "number", "PgDoublePrecision");
      }
      build(e) {
        return new rv(e, this.config);
      }
    }
    class rv extends t5 {
      static [tM] = "PgDoublePrecision";
      getSQLType() {
        return "double precision";
      }
      mapFromDriverValue(e) {
        return "string" == typeof e ? Number.parseFloat(e) : e;
      }
    }
    function ry(e) {
      return new rg(e ?? "");
    }
    class rb extends t2 {
      static [tM] = "PgInetBuilder";
      constructor(e) {
        super(e, "string", "PgInet");
      }
      build(e) {
        return new r_(e, this.config);
      }
    }
    class r_ extends t5 {
      static [tM] = "PgInet";
      getSQLType() {
        return "inet";
      }
    }
    function r$(e) {
      return new rb(e ?? "");
    }
    class rx extends iX {
      static [tM] = "PgIntegerBuilder";
      constructor(e) {
        super(e, "number", "PgInteger");
      }
      build(e) {
        return new rw(e, this.config);
      }
    }
    class rw extends t5 {
      static [tM] = "PgInteger";
      getSQLType() {
        return "integer";
      }
      mapFromDriverValue(e) {
        return "string" == typeof e ? Number.parseInt(e) : e;
      }
    }
    function rS(e) {
      return new rx(e ?? "");
    }
    class rk extends t2 {
      static [tM] = "PgIntervalBuilder";
      constructor(e, t) {
        super(e, "string", "PgInterval"), (this.config.intervalConfig = t);
      }
      build(e) {
        return new rI(e, this.config);
      }
    }
    class rI extends t5 {
      static [tM] = "PgInterval";
      fields = this.config.intervalConfig.fields;
      precision = this.config.intervalConfig.precision;
      getSQLType() {
        let e = this.fields ? ` ${this.fields}` : "",
          t = this.precision ? `(${this.precision})` : "";
        return `interval${e}${t}`;
      }
    }
    function rE(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return new rk(i, r);
    }
    class rP extends t2 {
      static [tM] = "PgJsonBuilder";
      constructor(e) {
        super(e, "json", "PgJson");
      }
      build(e) {
        return new rN(e, this.config);
      }
    }
    class rN extends t5 {
      static [tM] = "PgJson";
      constructor(e, t) {
        super(e, t);
      }
      getSQLType() {
        return "json";
      }
      mapToDriverValue(e) {
        return JSON.stringify(e);
      }
      mapFromDriverValue(e) {
        if ("string" == typeof e)
          try {
            return JSON.parse(e);
          } catch {}
        return e;
      }
    }
    function rT(e) {
      return new rP(e ?? "");
    }
    class rO extends t2 {
      static [tM] = "PgJsonbBuilder";
      constructor(e) {
        super(e, "json", "PgJsonb");
      }
      build(e) {
        return new rz(e, this.config);
      }
    }
    class rz extends t5 {
      static [tM] = "PgJsonb";
      constructor(e, t) {
        super(e, t);
      }
      getSQLType() {
        return "jsonb";
      }
      mapToDriverValue(e) {
        return JSON.stringify(e);
      }
      mapFromDriverValue(e) {
        if ("string" == typeof e)
          try {
            return JSON.parse(e);
          } catch {}
        return e;
      }
    }
    function rA(e) {
      return new rO(e ?? "");
    }
    class rU extends t2 {
      static [tM] = "PgLineBuilder";
      constructor(e) {
        super(e, "array", "PgLine");
      }
      build(e) {
        return new rD(e, this.config);
      }
    }
    class rD extends t5 {
      static [tM] = "PgLine";
      getSQLType() {
        return "line";
      }
      mapFromDriverValue(e) {
        let [t, i, r] = e.slice(1, -1).split(",");
        return [
          Number.parseFloat(t),
          Number.parseFloat(i),
          Number.parseFloat(r),
        ];
      }
      mapToDriverValue(e) {
        return `{${e[0]},${e[1]},${e[2]}}`;
      }
    }
    class rC extends t2 {
      static [tM] = "PgLineABCBuilder";
      constructor(e) {
        super(e, "json", "PgLineABC");
      }
      build(e) {
        return new rj(e, this.config);
      }
    }
    class rj extends t5 {
      static [tM] = "PgLineABC";
      getSQLType() {
        return "line";
      }
      mapFromDriverValue(e) {
        let [t, i, r] = e.slice(1, -1).split(",");
        return {
          a: Number.parseFloat(t),
          b: Number.parseFloat(i),
          c: Number.parseFloat(r),
        };
      }
      mapToDriverValue(e) {
        return `{${e.a},${e.b},${e.c}}`;
      }
    }
    function rZ(e, t) {
      let { name: i, config: r } = iK(e, t);
      return r?.mode && "tuple" !== r.mode ? new rC(i) : new rU(i);
    }
    class rL extends t2 {
      static [tM] = "PgMacaddrBuilder";
      constructor(e) {
        super(e, "string", "PgMacaddr");
      }
      build(e) {
        return new rR(e, this.config);
      }
    }
    class rR extends t5 {
      static [tM] = "PgMacaddr";
      getSQLType() {
        return "macaddr";
      }
    }
    function rM(e) {
      return new rL(e ?? "");
    }
    class rB extends t2 {
      static [tM] = "PgMacaddr8Builder";
      constructor(e) {
        super(e, "string", "PgMacaddr8");
      }
      build(e) {
        return new rF(e, this.config);
      }
    }
    class rF extends t5 {
      static [tM] = "PgMacaddr8";
      getSQLType() {
        return "macaddr8";
      }
    }
    function rq(e) {
      return new rB(e ?? "");
    }
    class rQ extends t2 {
      static [tM] = "PgNumericBuilder";
      constructor(e, t, i) {
        super(e, "string", "PgNumeric"),
          (this.config.precision = t),
          (this.config.scale = i);
      }
      build(e) {
        return new rJ(e, this.config);
      }
    }
    class rJ extends t5 {
      static [tM] = "PgNumeric";
      precision;
      scale;
      constructor(e, t) {
        super(e, t), (this.precision = t.precision), (this.scale = t.scale);
      }
      mapFromDriverValue(e) {
        return "string" == typeof e ? e : String(e);
      }
      getSQLType() {
        return void 0 !== this.precision && void 0 !== this.scale
          ? `numeric(${this.precision}, ${this.scale})`
          : void 0 === this.precision
            ? "numeric"
            : `numeric(${this.precision})`;
      }
    }
    class rV extends t2 {
      static [tM] = "PgNumericNumberBuilder";
      constructor(e, t, i) {
        super(e, "number", "PgNumericNumber"),
          (this.config.precision = t),
          (this.config.scale = i);
      }
      build(e) {
        return new rW(e, this.config);
      }
    }
    class rW extends t5 {
      static [tM] = "PgNumericNumber";
      precision;
      scale;
      constructor(e, t) {
        super(e, t), (this.precision = t.precision), (this.scale = t.scale);
      }
      mapFromDriverValue(e) {
        return "number" == typeof e ? e : Number(e);
      }
      mapToDriverValue = String;
      getSQLType() {
        return void 0 !== this.precision && void 0 !== this.scale
          ? `numeric(${this.precision}, ${this.scale})`
          : void 0 === this.precision
            ? "numeric"
            : `numeric(${this.precision})`;
      }
    }
    class rG extends t2 {
      static [tM] = "PgNumericBigIntBuilder";
      constructor(e, t, i) {
        super(e, "bigint", "PgNumericBigInt"),
          (this.config.precision = t),
          (this.config.scale = i);
      }
      build(e) {
        return new rK(e, this.config);
      }
    }
    class rK extends t5 {
      static [tM] = "PgNumericBigInt";
      precision;
      scale;
      constructor(e, t) {
        super(e, t), (this.precision = t.precision), (this.scale = t.scale);
      }
      mapFromDriverValue = BigInt;
      mapToDriverValue = String;
      getSQLType() {
        return void 0 !== this.precision && void 0 !== this.scale
          ? `numeric(${this.precision}, ${this.scale})`
          : void 0 === this.precision
            ? "numeric"
            : `numeric(${this.precision})`;
      }
    }
    function rX(e, t) {
      let { name: i, config: r } = iK(e, t),
        n = r?.mode;
      return "number" === n
        ? new rV(i, r?.precision, r?.scale)
        : "bigint" === n
          ? new rG(i, r?.precision, r?.scale)
          : new rQ(i, r?.precision, r?.scale);
    }
    class rH extends t2 {
      static [tM] = "PgPointTupleBuilder";
      constructor(e) {
        super(e, "array", "PgPointTuple");
      }
      build(e) {
        return new rY(e, this.config);
      }
    }
    class rY extends t5 {
      static [tM] = "PgPointTuple";
      getSQLType() {
        return "point";
      }
      mapFromDriverValue(e) {
        if ("string" == typeof e) {
          let [t, i] = e.slice(1, -1).split(",");
          return [Number.parseFloat(t), Number.parseFloat(i)];
        }
        return [e.x, e.y];
      }
      mapToDriverValue(e) {
        return `(${e[0]},${e[1]})`;
      }
    }
    class r0 extends t2 {
      static [tM] = "PgPointObjectBuilder";
      constructor(e) {
        super(e, "json", "PgPointObject");
      }
      build(e) {
        return new r1(e, this.config);
      }
    }
    class r1 extends t5 {
      static [tM] = "PgPointObject";
      getSQLType() {
        return "point";
      }
      mapFromDriverValue(e) {
        if ("string" == typeof e) {
          let [t, i] = e.slice(1, -1).split(",");
          return { x: Number.parseFloat(t), y: Number.parseFloat(i) };
        }
        return e;
      }
      mapToDriverValue(e) {
        return `(${e.x},${e.y})`;
      }
    }
    function r6(e, t) {
      let { name: i, config: r } = iK(e, t);
      return r?.mode && "tuple" !== r.mode ? new r0(i) : new rH(i);
    }
    function r4(e, t) {
      let i = new DataView(new ArrayBuffer(8));
      for (let r = 0; r < 8; r++) i.setUint8(r, e[t + r]);
      return i.getFloat64(0, !0);
    }
    function r2(e) {
      let t = (function (e) {
          let t = [];
          for (let i = 0; i < e.length; i += 2)
            t.push(Number.parseInt(e.slice(i, i + 2), 16));
          return new Uint8Array(t);
        })(e),
        i = 0,
        r = t[0];
      i += 1;
      let n = new DataView(t.buffer),
        s = n.getUint32(i, 1 === r);
      if (
        ((i += 4),
        0x20000000 & s && (n.getUint32(i, 1 === r), (i += 4)),
        (65535 & s) == 1)
      ) {
        let e = r4(t, i),
          r = r4(t, (i += 8));
        return (i += 8), [e, r];
      }
      throw Error("Unsupported geometry type");
    }
    class r5 extends t2 {
      static [tM] = "PgGeometryBuilder";
      constructor(e) {
        super(e, "array", "PgGeometry");
      }
      build(e) {
        return new r3(e, this.config);
      }
    }
    class r3 extends t5 {
      static [tM] = "PgGeometry";
      getSQLType() {
        return "geometry(point)";
      }
      mapFromDriverValue(e) {
        return r2(e);
      }
      mapToDriverValue(e) {
        return `point(${e[0]} ${e[1]})`;
      }
    }
    class r8 extends t2 {
      static [tM] = "PgGeometryObjectBuilder";
      constructor(e) {
        super(e, "json", "PgGeometryObject");
      }
      build(e) {
        return new r9(e, this.config);
      }
    }
    class r9 extends t5 {
      static [tM] = "PgGeometryObject";
      getSQLType() {
        return "geometry(point)";
      }
      mapFromDriverValue(e) {
        let t = r2(e);
        return { x: t[0], y: t[1] };
      }
      mapToDriverValue(e) {
        return `point(${e.x} ${e.y})`;
      }
    }
    function r7(e, t) {
      let { name: i, config: r } = iK(e, t);
      return r?.mode && "tuple" !== r.mode ? new r8(i) : new r5(i);
    }
    class ne extends t2 {
      static [tM] = "PgRealBuilder";
      constructor(e, t) {
        super(e, "number", "PgReal"), (this.config.length = t);
      }
      build(e) {
        return new nt(e, this.config);
      }
    }
    class nt extends t5 {
      static [tM] = "PgReal";
      constructor(e, t) {
        super(e, t);
      }
      getSQLType() {
        return "real";
      }
      mapFromDriverValue = (e) =>
        "string" == typeof e ? Number.parseFloat(e) : e;
    }
    function ni(e) {
      return new ne(e ?? "");
    }
    class nr extends t2 {
      static [tM] = "PgSerialBuilder";
      constructor(e) {
        super(e, "number", "PgSerial"),
          (this.config.hasDefault = !0),
          (this.config.notNull = !0);
      }
      build(e) {
        return new nn(e, this.config);
      }
    }
    class nn extends t5 {
      static [tM] = "PgSerial";
      getSQLType() {
        return "serial";
      }
    }
    function ns(e) {
      return new nr(e ?? "");
    }
    class na extends iX {
      static [tM] = "PgSmallIntBuilder";
      constructor(e) {
        super(e, "number", "PgSmallInt");
      }
      build(e) {
        return new no(e, this.config);
      }
    }
    class no extends t5 {
      static [tM] = "PgSmallInt";
      getSQLType() {
        return "smallint";
      }
      mapFromDriverValue = (e) => ("string" == typeof e ? Number(e) : e);
    }
    function nu(e) {
      return new na(e ?? "");
    }
    class nl extends t2 {
      static [tM] = "PgSmallSerialBuilder";
      constructor(e) {
        super(e, "number", "PgSmallSerial"),
          (this.config.hasDefault = !0),
          (this.config.notNull = !0);
      }
      build(e) {
        return new nc(e, this.config);
      }
    }
    class nc extends t5 {
      static [tM] = "PgSmallSerial";
      getSQLType() {
        return "smallserial";
      }
    }
    function nd(e) {
      return new nl(e ?? "");
    }
    class nf extends t2 {
      static [tM] = "PgTextBuilder";
      constructor(e, t) {
        super(e, "string", "PgText"), (this.config.enumValues = t.enum);
      }
      build(e) {
        return new nh(e, this.config);
      }
    }
    class nh extends t5 {
      static [tM] = "PgText";
      enumValues = this.config.enumValues;
      getSQLType() {
        return "text";
      }
    }
    function np(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return new nf(i, r);
    }
    class nm extends rc {
      constructor(e, t, i) {
        super(e, "string", "PgTime"),
          (this.withTimezone = t),
          (this.precision = i),
          (this.config.withTimezone = t),
          (this.config.precision = i);
      }
      static [tM] = "PgTimeBuilder";
      build(e) {
        return new ng(e, this.config);
      }
    }
    class ng extends t5 {
      static [tM] = "PgTime";
      withTimezone;
      precision;
      constructor(e, t) {
        super(e, t),
          (this.withTimezone = t.withTimezone),
          (this.precision = t.precision);
      }
      getSQLType() {
        let e = void 0 === this.precision ? "" : `(${this.precision})`;
        return `time${e}${this.withTimezone ? " with time zone" : ""}`;
      }
    }
    function nv(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return new nm(i, r.withTimezone ?? !1, r.precision);
    }
    class ny extends rc {
      static [tM] = "PgTimestampBuilder";
      constructor(e, t, i) {
        super(e, "date", "PgTimestamp"),
          (this.config.withTimezone = t),
          (this.config.precision = i);
      }
      build(e) {
        return new nb(e, this.config);
      }
    }
    class nb extends t5 {
      static [tM] = "PgTimestamp";
      withTimezone;
      precision;
      constructor(e, t) {
        super(e, t),
          (this.withTimezone = t.withTimezone),
          (this.precision = t.precision);
      }
      getSQLType() {
        let e = void 0 === this.precision ? "" : ` (${this.precision})`;
        return `timestamp${e}${this.withTimezone ? " with time zone" : ""}`;
      }
      mapFromDriverValue(e) {
        return "string" == typeof e
          ? new Date(this.withTimezone ? e : e + "+0000")
          : e;
      }
      mapToDriverValue = (e) => e.toISOString();
    }
    class n_ extends rc {
      static [tM] = "PgTimestampStringBuilder";
      constructor(e, t, i) {
        super(e, "string", "PgTimestampString"),
          (this.config.withTimezone = t),
          (this.config.precision = i);
      }
      build(e) {
        return new n$(e, this.config);
      }
    }
    class n$ extends t5 {
      static [tM] = "PgTimestampString";
      withTimezone;
      precision;
      constructor(e, t) {
        super(e, t),
          (this.withTimezone = t.withTimezone),
          (this.precision = t.precision);
      }
      getSQLType() {
        let e = void 0 === this.precision ? "" : `(${this.precision})`;
        return `timestamp${e}${this.withTimezone ? " with time zone" : ""}`;
      }
      mapFromDriverValue(e) {
        if ("string" == typeof e) return e;
        let t = e.toISOString().slice(0, -1).replace("T", " ");
        if (this.withTimezone) {
          let i = e.getTimezoneOffset();
          return `${t}${i <= 0 ? "+" : "-"}${Math.floor(Math.abs(i) / 60)
            .toString()
            .padStart(2, "0")}`;
        }
        return t;
      }
    }
    function nx(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return r?.mode === "string"
        ? new n_(i, r.withTimezone ?? !1, r.precision)
        : new ny(i, r?.withTimezone ?? !1, r?.precision);
    }
    class nw extends t2 {
      static [tM] = "PgUUIDBuilder";
      constructor(e) {
        super(e, "string", "PgUUID");
      }
      defaultRandom() {
        return this.default(iT`gen_random_uuid()`);
      }
      build(e) {
        return new nS(e, this.config);
      }
    }
    class nS extends t5 {
      static [tM] = "PgUUID";
      getSQLType() {
        return "uuid";
      }
    }
    function nk(e) {
      return new nw(e ?? "");
    }
    class nI extends t2 {
      static [tM] = "PgVarcharBuilder";
      constructor(e, t) {
        super(e, "string", "PgVarchar"),
          (this.config.length = t.length),
          (this.config.enumValues = t.enum);
      }
      build(e) {
        return new nE(e, this.config);
      }
    }
    class nE extends t5 {
      static [tM] = "PgVarchar";
      length = this.config.length;
      enumValues = this.config.enumValues;
      getSQLType() {
        return void 0 === this.length ? "varchar" : `varchar(${this.length})`;
      }
    }
    function nP(e, t = {}) {
      let { name: i, config: r } = iK(e, t);
      return new nI(i, r);
    }
    class nN extends t2 {
      static [tM] = "PgBinaryVectorBuilder";
      constructor(e, t) {
        super(e, "string", "PgBinaryVector"),
          (this.config.dimensions = t.dimensions);
      }
      build(e) {
        return new nT(e, this.config);
      }
    }
    class nT extends t5 {
      static [tM] = "PgBinaryVector";
      dimensions = this.config.dimensions;
      getSQLType() {
        return `bit(${this.dimensions})`;
      }
    }
    function nO(e, t) {
      let { name: i, config: r } = iK(e, t);
      return new nN(i, r);
    }
    class nz extends t2 {
      static [tM] = "PgHalfVectorBuilder";
      constructor(e, t) {
        super(e, "array", "PgHalfVector"),
          (this.config.dimensions = t.dimensions);
      }
      build(e) {
        return new nA(e, this.config);
      }
    }
    class nA extends t5 {
      static [tM] = "PgHalfVector";
      dimensions = this.config.dimensions;
      getSQLType() {
        return `halfvec(${this.dimensions})`;
      }
      mapToDriverValue(e) {
        return JSON.stringify(e);
      }
      mapFromDriverValue(e) {
        return e
          .slice(1, -1)
          .split(",")
          .map((e) => Number.parseFloat(e));
      }
    }
    function nU(e, t) {
      let { name: i, config: r } = iK(e, t);
      return new nz(i, r);
    }
    class nD extends t2 {
      static [tM] = "PgSparseVectorBuilder";
      constructor(e, t) {
        super(e, "string", "PgSparseVector"),
          (this.config.dimensions = t.dimensions);
      }
      build(e) {
        return new nC(e, this.config);
      }
    }
    class nC extends t5 {
      static [tM] = "PgSparseVector";
      dimensions = this.config.dimensions;
      getSQLType() {
        return `sparsevec(${this.dimensions})`;
      }
    }
    function nj(e, t) {
      let { name: i, config: r } = iK(e, t);
      return new nD(i, r);
    }
    class nZ extends t2 {
      static [tM] = "PgVectorBuilder";
      constructor(e, t) {
        super(e, "array", "PgVector"), (this.config.dimensions = t.dimensions);
      }
      build(e) {
        return new nL(e, this.config);
      }
    }
    class nL extends t5 {
      static [tM] = "PgVector";
      dimensions = this.config.dimensions;
      getSQLType() {
        return `vector(${this.dimensions})`;
      }
      mapToDriverValue(e) {
        return JSON.stringify(e);
      }
      mapFromDriverValue(e) {
        return e
          .slice(1, -1)
          .split(",")
          .map((e) => Number.parseFloat(e));
      }
    }
    function nR(e, t) {
      let { name: i, config: r } = iK(e, t);
      return new nZ(i, r);
    }
    let nM = Symbol.for("drizzle:PgInlineForeignKeys"),
      nB = Symbol.for("drizzle:EnableRLS");
    class nF extends ib {
      static [tM] = "PgTable";
      static Symbol = Object.assign({}, ib.Symbol, {
        InlineForeignKeys: nM,
        EnableRLS: nB,
      });
      [nM] = [];
      [nB] = !1;
      [ib.Symbol.ExtraConfigBuilder] = void 0;
      [ib.Symbol.ExtraConfigColumns] = {};
    }
    let nq = (e, t, i) =>
      (function (e, t, i, r, n = e) {
        let s = new nF(e, r, n),
          a =
            "function" == typeof t
              ? t({
                  bigint: i6,
                  bigserial: i8,
                  boolean: re,
                  char: rr,
                  cidr: ra,
                  customType: rl,
                  date: rm,
                  doublePrecision: ry,
                  inet: r$,
                  integer: rS,
                  interval: rE,
                  json: rT,
                  jsonb: rA,
                  line: rZ,
                  macaddr: rM,
                  macaddr8: rq,
                  numeric: rX,
                  point: r6,
                  geometry: r7,
                  real: ni,
                  serial: ns,
                  smallint: nu,
                  smallserial: nd,
                  text: np,
                  time: nv,
                  timestamp: nx,
                  uuid: nk,
                  varchar: nP,
                  bit: nO,
                  halfvec: nU,
                  sparsevec: nj,
                  vector: nR,
                })
              : t,
          o = Object.fromEntries(
            Object.entries(a).map(([e, t]) => {
              t.setName(e);
              let i = t.build(s);
              return s[nM].push(...t.buildForeignKeys(i, s)), [e, i];
            }),
          ),
          u = Object.fromEntries(
            Object.entries(a).map(
              ([e, t]) => (t.setName(e), [e, t.buildExtraConfigColumn(s)]),
            ),
          ),
          l = Object.assign(s, o);
        return (
          (l[ib.Symbol.Columns] = o),
          (l[ib.Symbol.ExtraConfigColumns] = u),
          i && (l[nF.Symbol.ExtraConfigBuilder] = i),
          Object.assign(l, {
            enableRLS: () => ((l[nF.Symbol.EnableRLS] = !0), l),
          })
        );
      })(e, t, i, void 0);
    class nQ {
      constructor(e, t) {
        (this.name = e), (this.value = t);
      }
      static [tM] = "PgCheckBuilder";
      brand;
      build(e) {
        return new nJ(e, this);
      }
    }
    class nJ {
      constructor(e, t) {
        (this.table = e), (this.name = t.name), (this.value = t.value);
      }
      static [tM] = "PgCheck";
      name;
      value;
    }
    class nV {
      constructor(e, t) {
        (this.unique = e), (this.name = t);
      }
      static [tM] = "PgIndexBuilderOn";
      on(...e) {
        return new nW(
          e.map((e) => {
            if (tB(e, ik)) return e;
            let t = new t8(e.name, !!e.keyAsName, e.columnType, e.indexConfig);
            return (
              (e.indexConfig = JSON.parse(JSON.stringify(e.defaultConfig))), t
            );
          }),
          this.unique,
          !1,
          this.name,
        );
      }
      onOnly(...e) {
        return new nW(
          e.map((e) => {
            if (tB(e, ik)) return e;
            let t = new t8(e.name, !!e.keyAsName, e.columnType, e.indexConfig);
            return (e.indexConfig = e.defaultConfig), t;
          }),
          this.unique,
          !0,
          this.name,
        );
      }
      using(e, ...t) {
        return new nW(
          t.map((e) => {
            if (tB(e, ik)) return e;
            let t = new t8(e.name, !!e.keyAsName, e.columnType, e.indexConfig);
            return (
              (e.indexConfig = JSON.parse(JSON.stringify(e.defaultConfig))), t
            );
          }),
          this.unique,
          !0,
          this.name,
          e,
        );
      }
    }
    class nW {
      static [tM] = "PgIndexBuilder";
      config;
      constructor(e, t, i, r, n = "btree") {
        this.config = { name: r, columns: e, unique: t, only: i, method: n };
      }
      concurrently() {
        return (this.config.concurrently = !0), this;
      }
      with(e) {
        return (this.config.with = e), this;
      }
      where(e) {
        return (this.config.where = e), this;
      }
      build(e) {
        return new nG(this.config, e);
      }
    }
    class nG {
      static [tM] = "PgIndex";
      config;
      constructor(e, t) {
        this.config = { ...e, table: t };
      }
    }
    function nK(e) {
      return new nV(!1, e);
    }
    class nX {
      constructor(e, t) {
        (this.name = e),
          t &&
            ((this.as = t.as),
            (this.for = t.for),
            (this.to = t.to),
            (this.using = t.using),
            (this.withCheck = t.withCheck));
      }
      static [tM] = "PgPolicy";
      as;
      for;
      to;
      using;
      withCheck;
      _linkedTable;
      link(e) {
        return (this._linkedTable = e), this;
      }
    }
    class nH {
      static [tM] = "PgPrimaryKeyBuilder";
      columns;
      name;
      constructor(e, t) {
        (this.columns = e), (this.name = t);
      }
      build(e) {
        return new nY(e, this.columns, this.name);
      }
    }
    class nY {
      constructor(e, t, i) {
        (this.table = e), (this.columns = t), (this.name = i);
      }
      static [tM] = "PgPrimaryKey";
      columns;
      name;
      getName() {
        return (
          this.name ??
          `${this.table[nF.Symbol.Name]}_${this.columns.map((e) => e.name).join("_")}_pk`
        );
      }
    }
    let n0 = Symbol.for("drizzle:PgViewConfig");
    function n1(e) {
      return (
        e
          .replace(/['\u2019]/g, "")
          .match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []
      )
        .map((e) => e.toLowerCase())
        .join("_");
    }
    function n6(e) {
      return (
        e
          .replace(/['\u2019]/g, "")
          .match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []
      ).reduce(
        (e, t, i) =>
          e +
          (0 === i ? t.toLowerCase() : `${t[0].toUpperCase()}${t.slice(1)}`),
        "",
      );
    }
    function n4(e) {
      return e;
    }
    class n2 {
      static [tM] = "CasingCache";
      cache = {};
      cachedTables = {};
      convert;
      constructor(e) {
        this.convert = "snake_case" === e ? n1 : "camelCase" === e ? n6 : n4;
      }
      getColumnCasing(e) {
        if (!e.keyAsName) return e.name;
        let t = e.table[ib.Symbol.Schema] ?? "public",
          i = e.table[ib.Symbol.OriginalName],
          r = `${t}.${i}.${e.name}`;
        return this.cache[r] || this.cacheTable(e.table), this.cache[r];
      }
      cacheTable(e) {
        let t = e[ib.Symbol.Schema] ?? "public",
          i = e[ib.Symbol.OriginalName],
          r = `${t}.${i}`;
        if (!this.cachedTables[r]) {
          for (let t of Object.values(e[ib.Symbol.Columns])) {
            let e = `${r}.${t.name}`;
            this.cache[e] = this.convert(t.name);
          }
          this.cachedTables[r] = !0;
        }
      }
      clearCache() {
        (this.cache = {}), (this.cachedTables = {});
      }
    }
    class n5 extends Error {
      static [tM] = "DrizzleError";
      constructor({ message: e, cause: t }) {
        super(e), (this.name = "DrizzleError"), (this.cause = t);
      }
    }
    class n3 extends Error {
      constructor(e, t, i) {
        super(`Failed query: ${e}
params: ${t}`),
          (this.query = e),
          (this.params = t),
          (this.cause = i),
          Error.captureStackTrace(this, n3),
          i && (this.cause = i);
      }
    }
    class n8 extends n5 {
      static [tM] = "TransactionRollbackError";
      constructor() {
        super({ message: "Rollback" });
      }
    }
    function n9(e, t) {
      return "object" != typeof t ||
        null === t ||
        !("mapToDriverValue" in t) ||
        "function" != typeof t.mapToDriverValue ||
        iw(e) ||
        tB(e, iN) ||
        tB(e, iA) ||
        tB(e, tV) ||
        tB(e, ib) ||
        tB(e, iC)
        ? e
        : new iN(e, t);
    }
    let n7 = (e, t) => iT`${e} = ${n9(t, e)}`,
      se = (e, t) => iT`${e} <> ${n9(t, e)}`;
    function st(...e) {
      let t = e.filter((e) => void 0 !== e);
      if (0 !== t.length)
        return new ik(
          1 === t.length
            ? t
            : [new iS("("), iT.join(t, new iS(" and ")), new iS(")")],
        );
    }
    function si(...e) {
      let t = e.filter((e) => void 0 !== e);
      if (0 !== t.length)
        return new ik(
          1 === t.length
            ? t
            : [new iS("("), iT.join(t, new iS(" or ")), new iS(")")],
        );
    }
    function sr(e) {
      return iT`not ${e}`;
    }
    let sn = (e, t) => iT`${e} > ${n9(t, e)}`,
      ss = (e, t) => iT`${e} >= ${n9(t, e)}`,
      sa = (e, t) => iT`${e} < ${n9(t, e)}`,
      so = (e, t) => iT`${e} <= ${n9(t, e)}`;
    function su(e, t) {
      return Array.isArray(t)
        ? 0 === t.length
          ? iT`false`
          : iT`${e} in ${t.map((t) => n9(t, e))}`
        : iT`${e} in ${n9(t, e)}`;
    }
    function sl(e, t) {
      return Array.isArray(t)
        ? 0 === t.length
          ? iT`true`
          : iT`${e} not in ${t.map((t) => n9(t, e))}`
        : iT`${e} not in ${n9(t, e)}`;
    }
    function sc(e) {
      return iT`${e} is null`;
    }
    function sd(e) {
      return iT`${e} is not null`;
    }
    function sf(e) {
      return iT`exists ${e}`;
    }
    function sh(e) {
      return iT`not exists ${e}`;
    }
    function sp(e, t, i) {
      return iT`${e} between ${n9(t, e)} and ${n9(i, e)}`;
    }
    function sm(e, t, i) {
      return iT`${e} not between ${n9(t, e)} and ${n9(i, e)}`;
    }
    function sg(e, t) {
      return iT`${e} like ${t}`;
    }
    function sv(e, t) {
      return iT`${e} not like ${t}`;
    }
    function sy(e, t) {
      return iT`${e} ilike ${t}`;
    }
    function sb(e, t) {
      return iT`${e} not ilike ${t}`;
    }
    function s_(e) {
      return iT`${e} asc`;
    }
    function s$(e) {
      return iT`${e} desc`;
    }
    class sx {
      constructor(e, t, i) {
        (this.sourceTable = e),
          (this.referencedTable = t),
          (this.relationName = i),
          (this.referencedTableName = t[ib.Symbol.Name]);
      }
      static [tM] = "Relation";
      referencedTableName;
      fieldName;
    }
    class sw {
      constructor(e, t) {
        (this.table = e), (this.config = t);
      }
      static [tM] = "Relations";
    }
    class sS extends sx {
      constructor(e, t, i, r) {
        super(e, t, i?.relationName), (this.config = i), (this.isNullable = r);
      }
      static [tM] = "One";
      withFieldName(e) {
        let t = new sS(
          this.sourceTable,
          this.referencedTable,
          this.config,
          this.isNullable,
        );
        return (t.fieldName = e), t;
      }
    }
    class sk extends sx {
      constructor(e, t, i) {
        super(e, t, i?.relationName), (this.config = i);
      }
      static [tM] = "Many";
      withFieldName(e) {
        let t = new sk(this.sourceTable, this.referencedTable, this.config);
        return (t.fieldName = e), t;
      }
    }
    function sI(e, t) {
      return new sw(e, (e) =>
        Object.fromEntries(
          Object.entries(t(e)).map(([e, t]) => [e, t.withFieldName(e)]),
        ),
      );
    }
    function sE(e) {
      return {
        one: function (t, i) {
          return new sS(
            e,
            t,
            i,
            i?.fields.reduce((e, t) => e && t.notNull, !0) ?? !1,
          );
        },
        many: function (t, i) {
          return new sk(e, t, i);
        },
      };
    }
    class sP extends iC {
      static [tM] = "PgViewBase";
    }
    class sN {
      static [tM] = "PgDialect";
      casing;
      constructor(e) {
        this.casing = new n2(e?.casing);
      }
      async migrate(e, t, i) {
        let r =
            "string" == typeof i
              ? "__drizzle_migrations"
              : (i.migrationsTable ?? "__drizzle_migrations"),
          n =
            "string" == typeof i
              ? "drizzle"
              : (i.migrationsSchema ?? "drizzle"),
          s = iT`
			CREATE TABLE IF NOT EXISTS ${iT.identifier(n)}.${iT.identifier(r)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)
		`;
        await t.execute(iT`CREATE SCHEMA IF NOT EXISTS ${iT.identifier(n)}`),
          await t.execute(s);
        let a = (
          await t.all(
            iT`select id, hash, created_at from ${iT.identifier(n)}.${iT.identifier(r)} order by created_at desc limit 1`,
          )
        )[0];
        await t.transaction(async (t) => {
          for await (let i of e)
            if (!a || Number(a.created_at) < i.folderMillis) {
              for (let e of i.sql) await t.execute(iT.raw(e));
              await t.execute(
                iT`insert into ${iT.identifier(n)}.${iT.identifier(r)} ("hash", "created_at") values(${i.hash}, ${i.folderMillis})`,
              );
            }
        });
      }
      escapeName(e) {
        return `"${e.replace(/"/g, '""')}"`;
      }
      escapeParam(e) {
        return `$${e + 1}`;
      }
      escapeString(e) {
        return `'${e.replace(/'/g, "''")}'`;
      }
      buildWithCTE(e) {
        if (!e?.length) return;
        let t = [iT`with `];
        for (let [i, r] of e.entries())
          t.push(iT`${iT.identifier(r._.alias)} as (${r._.sql})`),
            i < e.length - 1 && t.push(iT`, `);
        return t.push(iT` `), iT.join(t);
      }
      buildDeleteQuery({ table: e, where: t, returning: i, withList: r }) {
        let n = this.buildWithCTE(r),
          s = i
            ? iT` returning ${this.buildSelection(i, { isSingleTable: !0 })}`
            : void 0,
          a = t ? iT` where ${t}` : void 0;
        return iT`${n}delete from ${e}${a}${s}`;
      }
      buildUpdateSet(e, t) {
        let i = e[ib.Symbol.Columns],
          r = Object.keys(i).filter(
            (e) => void 0 !== t[e] || i[e]?.onUpdateFn !== void 0,
          ),
          n = r.length;
        return iT.join(
          r.flatMap((e, r) => {
            let s = i[e],
              a = s.onUpdateFn?.(),
              o = t[e] ?? (tB(a, ik) ? a : iT.param(a, s)),
              u = iT`${iT.identifier(this.casing.getColumnCasing(s))} = ${o}`;
            return r < n - 1 ? [u, iT.raw(", ")] : [u];
          }),
        );
      }
      buildUpdateQuery({
        table: e,
        set: t,
        where: i,
        returning: r,
        withList: n,
        from: s,
        joins: a,
      }) {
        let o = this.buildWithCTE(n),
          u = e[nF.Symbol.Name],
          l = e[nF.Symbol.Schema],
          c = e[nF.Symbol.OriginalName],
          d = u === c ? void 0 : u,
          f = iT`${l ? iT`${iT.identifier(l)}.` : void 0}${iT.identifier(c)}${d && iT` ${iT.identifier(d)}`}`,
          h = this.buildUpdateSet(e, t),
          p = s && iT.join([iT.raw(" from "), this.buildFromTable(s)]),
          m = this.buildJoins(a),
          g = r
            ? iT` returning ${this.buildSelection(r, { isSingleTable: !s })}`
            : void 0,
          v = i ? iT` where ${i}` : void 0;
        return iT`${o}update ${f} set ${h}${p}${m}${v}${g}`;
      }
      buildSelection(e, { isSingleTable: t = !1 } = {}) {
        let i = e.length,
          r = e.flatMap(({ field: e }, r) => {
            let n = [];
            if (tB(e, ik.Aliased) && e.isSelectionField)
              n.push(iT.identifier(e.fieldAlias));
            else if (tB(e, ik.Aliased) || tB(e, ik)) {
              let i = tB(e, ik.Aliased) ? e.sql : e;
              t
                ? n.push(
                    new ik(
                      i.queryChunks.map((e) =>
                        tB(e, t5)
                          ? iT.identifier(this.casing.getColumnCasing(e))
                          : e,
                      ),
                    ),
                  )
                : n.push(i),
                tB(e, ik.Aliased) &&
                  n.push(iT` as ${iT.identifier(e.fieldAlias)}`);
            } else if (tB(e, tV))
              t
                ? n.push(iT.identifier(this.casing.getColumnCasing(e)))
                : n.push(e);
            else if (tB(e, ia)) {
              let t = Object.entries(e._.selectedFields);
              if (1 === t.length) {
                let i = t[0][1],
                  r = tB(i, ik)
                    ? i.decoder
                    : tB(i, tV)
                      ? { mapFromDriverValue: (e) => i.mapFromDriverValue(e) }
                      : i.sql.decoder;
                r && (e._.sql.decoder = r);
              }
              n.push(e);
            }
            return r < i - 1 && n.push(iT`, `), n;
          });
        return iT.join(r);
      }
      buildJoins(e) {
        if (!e || 0 === e.length) return;
        let t = [];
        for (let [i, r] of e.entries()) {
          0 === i && t.push(iT` `);
          let n = r.table,
            s = r.lateral ? iT` lateral` : void 0,
            a = r.on ? iT` on ${r.on}` : void 0;
          if (tB(n, nF)) {
            let e = n[nF.Symbol.Name],
              i = n[nF.Symbol.Schema],
              o = n[nF.Symbol.OriginalName],
              u = e === o ? void 0 : r.alias;
            t.push(
              iT`${iT.raw(r.joinType)} join${s} ${i ? iT`${iT.identifier(i)}.` : void 0}${iT.identifier(o)}${u && iT` ${iT.identifier(u)}`}${a}`,
            );
          } else if (tB(n, iC)) {
            let e = n[il].name,
              i = n[il].schema,
              o = n[il].originalName,
              u = e === o ? void 0 : r.alias;
            t.push(
              iT`${iT.raw(r.joinType)} join${s} ${i ? iT`${iT.identifier(i)}.` : void 0}${iT.identifier(o)}${u && iT` ${iT.identifier(u)}`}${a}`,
            );
          } else t.push(iT`${iT.raw(r.joinType)} join${s} ${n}${a}`);
          i < e.length - 1 && t.push(iT` `);
        }
        return iT.join(t);
      }
      buildFromTable(e) {
        if (tB(e, ib) && e[ib.Symbol.IsAlias]) {
          let t = iT`${iT.identifier(e[ib.Symbol.OriginalName])}`;
          return (
            e[ib.Symbol.Schema] &&
              (t = iT`${iT.identifier(e[ib.Symbol.Schema])}.${t}`),
            iT`${t} ${iT.identifier(e[ib.Symbol.Name])}`
          );
        }
        return e;
      }
      buildSelectQuery({
        withList: e,
        fields: t,
        fieldsFlat: i,
        where: r,
        having: n,
        table: s,
        joins: a,
        orderBy: o,
        groupBy: u,
        limit: l,
        offset: c,
        lockingClause: d,
        distinct: f,
        setOperators: h,
      }) {
        let p,
          m,
          g,
          v = i ?? iQ(t);
        for (let e of v) {
          let t;
          if (
            tB(e.field, tV) &&
            e.field.table[tG] !==
              (tB(s, ia)
                ? s._.alias
                : tB(s, sP)
                  ? s[il].name
                  : tB(s, ik)
                    ? void 0
                    : s[tG]) &&
            ((t = e.field.table),
            !a?.some(
              ({ alias: e }) =>
                e === (t[ib.Symbol.IsAlias] ? t[tG] : t[ib.Symbol.BaseName]),
            ))
          ) {
            let t = e.field.table[tG];
            throw Error(
              `Your "${e.path.join("->")}" field references a column "${t}"."${e.field.name}", but the table "${t}" is not part of the query! Did you forget to join it?`,
            );
          }
        }
        let y = !a || 0 === a.length,
          b = this.buildWithCTE(e);
        f &&
          (p =
            !0 === f
              ? iT` distinct`
              : iT` distinct on (${iT.join(f.on, iT`, `)})`);
        let _ = this.buildSelection(v, { isSingleTable: y }),
          $ = this.buildFromTable(s),
          x = this.buildJoins(a),
          w = r ? iT` where ${r}` : void 0,
          S = n ? iT` having ${n}` : void 0;
        o && o.length > 0 && (m = iT` order by ${iT.join(o, iT`, `)}`),
          u && u.length > 0 && (g = iT` group by ${iT.join(u, iT`, `)}`);
        let k =
            "object" == typeof l || ("number" == typeof l && l >= 0)
              ? iT` limit ${l}`
              : void 0,
          I = c ? iT` offset ${c}` : void 0,
          E = iT.empty();
        if (d) {
          let e = iT` for ${iT.raw(d.strength)}`;
          d.config.of &&
            e.append(
              iT` of ${iT.join(Array.isArray(d.config.of) ? d.config.of : [d.config.of], iT`, `)}`,
            ),
            d.config.noWait
              ? e.append(iT` nowait`)
              : d.config.skipLocked && e.append(iT` skip locked`),
            E.append(e);
        }
        let P = iT`${b}select${p} ${_} from ${$}${x}${w}${g}${S}${m}${k}${I}${E}`;
        return h.length > 0 ? this.buildSetOperations(P, h) : P;
      }
      buildSetOperations(e, t) {
        let [i, ...r] = t;
        if (!i) throw Error("Cannot pass undefined values to any set operator");
        return 0 === r.length
          ? this.buildSetOperationQuery({ leftSelect: e, setOperator: i })
          : this.buildSetOperations(
              this.buildSetOperationQuery({ leftSelect: e, setOperator: i }),
              r,
            );
      }
      buildSetOperationQuery({
        leftSelect: e,
        setOperator: {
          type: t,
          isAll: i,
          rightSelect: r,
          limit: n,
          orderBy: s,
          offset: a,
        },
      }) {
        let o,
          u = iT`(${e.getSQL()}) `,
          l = iT`(${r.getSQL()})`;
        if (s && s.length > 0) {
          let e = [];
          for (let t of s)
            if (tB(t, t5)) e.push(iT.identifier(t.name));
            else if (tB(t, ik)) {
              for (let e = 0; e < t.queryChunks.length; e++) {
                let i = t.queryChunks[e];
                tB(i, t5) && (t.queryChunks[e] = iT.identifier(i.name));
              }
              e.push(iT`${t}`);
            } else e.push(iT`${t}`);
          o = iT` order by ${iT.join(e, iT`, `)} `;
        }
        let c =
            "object" == typeof n || ("number" == typeof n && n >= 0)
              ? iT` limit ${n}`
              : void 0,
          d = iT.raw(`${t} ${i ? "all " : ""}`),
          f = a ? iT` offset ${a}` : void 0;
        return iT`${u}${d}${l}${o}${c}${f}`;
      }
      buildInsertQuery({
        table: e,
        values: t,
        onConflict: i,
        returning: r,
        withList: n,
        select: s,
        overridingSystemValue_: a,
      }) {
        let o = [],
          u = Object.entries(e[ib.Symbol.Columns]).filter(
            ([e, t]) => !t.shouldDisableInsert(),
          ),
          l = u.map(([, e]) => iT.identifier(this.casing.getColumnCasing(e)));
        if (s) tB(t, ik) ? o.push(t) : o.push(t.getSQL());
        else
          for (let [e, i] of (o.push(iT.raw("values ")), t.entries())) {
            let r = [];
            for (let [e, t] of u) {
              let n = i[e];
              if (void 0 === n || (tB(n, iN) && void 0 === n.value))
                if (void 0 !== t.defaultFn) {
                  let e = t.defaultFn(),
                    i = tB(e, ik) ? e : iT.param(e, t);
                  r.push(i);
                } else if (t.default || void 0 === t.onUpdateFn)
                  r.push(iT`default`);
                else {
                  let e = t.onUpdateFn(),
                    i = tB(e, ik) ? e : iT.param(e, t);
                  r.push(i);
                }
              else r.push(n);
            }
            o.push(r), e < t.length - 1 && o.push(iT`, `);
          }
        let c = this.buildWithCTE(n),
          d = iT.join(o),
          f = r
            ? iT` returning ${this.buildSelection(r, { isSingleTable: !0 })}`
            : void 0,
          h = i ? iT` on conflict ${i}` : void 0,
          p = !0 === a ? iT`overriding system value ` : void 0;
        return iT`${c}insert into ${e} ${l} ${p}${d}${h}${f}`;
      }
      buildRefreshMaterializedViewQuery({
        view: e,
        concurrently: t,
        withNoData: i,
      }) {
        let r = t ? iT` concurrently` : void 0,
          n = i ? iT` with no data` : void 0;
        return iT`refresh materialized view${r} ${e}${n}`;
      }
      prepareTyping(e) {
        if (tB(e, rz) || tB(e, rN)) return "json";
        if (tB(e, rJ)) return "decimal";
        if (tB(e, ng)) return "time";
        if (tB(e, nb) || tB(e, n$)) return "timestamp";
        if (tB(e, rf) || tB(e, rp)) return "date";
        else if (tB(e, nS)) return "uuid";
        else return "none";
      }
      sqlToQuery(e, t) {
        return e.toQuery({
          casing: this.casing,
          escapeName: this.escapeName,
          escapeParam: this.escapeParam,
          escapeString: this.escapeString,
          prepareTyping: this.prepareTyping,
          invokeSource: t,
        });
      }
      buildRelationalQueryWithoutPK({
        fullSchema: e,
        schema: t,
        tableNamesMap: i,
        table: r,
        tableConfig: n,
        queryConfig: s,
        tableAlias: a,
        nestedQueryRelation: o,
        joinOn: u,
      }) {
        let l,
          c = [],
          d,
          f,
          h = [],
          p,
          m = [];
        if (!0 === s)
          c = Object.entries(n.columns).map(([e, t]) => ({
            dbKey: t.name,
            tsKey: e,
            field: iM(t, a),
            relationTableTsKey: void 0,
            isJson: !1,
            selection: [],
          }));
        else {
          let r = Object.fromEntries(
            Object.entries(n.columns).map(([e, t]) => [e, iM(t, a)]),
          );
          if (s.where) {
            let e =
              "function" == typeof s.where
                ? s.where(r, {
                    and: st,
                    between: sp,
                    eq: n7,
                    exists: sf,
                    gt: sn,
                    gte: ss,
                    ilike: sy,
                    inArray: su,
                    isNull: sc,
                    isNotNull: sd,
                    like: sg,
                    lt: sa,
                    lte: so,
                    ne: se,
                    not: sr,
                    notBetween: sm,
                    notExists: sh,
                    notLike: sv,
                    notIlike: sb,
                    notInArray: sl,
                    or: si,
                    sql: iT,
                  })
                : s.where;
            p = e && iF(e, a);
          }
          let o = [],
            u = [];
          if (s.columns) {
            let e = !1;
            for (let [t, i] of Object.entries(s.columns))
              void 0 !== i &&
                t in n.columns &&
                (e || !0 !== i || (e = !0), u.push(t));
            u.length > 0 &&
              (u = e
                ? u.filter((e) => s.columns?.[e] === !0)
                : Object.keys(n.columns).filter((e) => !u.includes(e)));
          } else u = Object.keys(n.columns);
          for (let e of u) {
            let t = n.columns[e];
            o.push({ tsKey: e, value: t });
          }
          let l = [];
          if (
            (s.with &&
              (l = Object.entries(s.with)
                .filter((e) => !!e[1])
                .map(([e, t]) => ({
                  tsKey: e,
                  queryConfig: t,
                  relation: n.relations[e],
                }))),
            s.extras)
          )
            for (let [e, t] of Object.entries(
              "function" == typeof s.extras
                ? s.extras(r, { sql: iT })
                : s.extras,
            ))
              o.push({ tsKey: e, value: iB(t, a) });
          for (let { tsKey: e, value: t } of o)
            c.push({
              dbKey: tB(t, ik.Aliased) ? t.fieldAlias : n.columns[e].name,
              tsKey: e,
              field: tB(t, tV) ? iM(t, a) : t,
              relationTableTsKey: void 0,
              isJson: !1,
              selection: [],
            });
          let g =
            "function" == typeof s.orderBy
              ? s.orderBy(r, { sql: iT, asc: s_, desc: s$ })
              : (s.orderBy ?? []);
          for (let { tsKey: r, queryConfig: n, relation: o } of (Array.isArray(
            g,
          ) || (g = [g]),
          (h = g.map((e) => (tB(e, tV) ? iM(e, a) : iF(e, a)))),
          (d = s.limit),
          (f = s.offset),
          l)) {
            let s = (function (e, t, i) {
                if (tB(i, sS) && i.config)
                  return {
                    fields: i.config.fields,
                    references: i.config.references,
                  };
                let r = t[i$(i.referencedTable)];
                if (!r)
                  throw Error(
                    `Table "${i.referencedTable[ib.Symbol.Name]}" not found in schema`,
                  );
                let n = e[r];
                if (!n) throw Error(`Table "${r}" not found in schema`);
                let s = i.sourceTable,
                  a = t[i$(s)];
                if (!a)
                  throw Error(
                    `Table "${s[ib.Symbol.Name]}" not found in schema`,
                  );
                let o = [];
                for (let e of Object.values(n.relations))
                  ((i.relationName &&
                    i !== e &&
                    e.relationName === i.relationName) ||
                    (!i.relationName && e.referencedTable === i.sourceTable)) &&
                    o.push(e);
                if (o.length > 1)
                  throw i.relationName
                    ? Error(
                        `There are multiple relations with name "${i.relationName}" in table "${r}"`,
                      )
                    : Error(
                        `There are multiple relations between "${r}" and "${i.sourceTable[ib.Symbol.Name]}". Please specify relation name`,
                      );
                if (o[0] && tB(o[0], sS) && o[0].config)
                  return {
                    fields: o[0].config.references,
                    references: o[0].config.fields,
                  };
                throw Error(
                  `There is not enough information to infer relation "${a}.${i.fieldName}"`,
                );
              })(t, i, o),
              u = i[i$(o.referencedTable)],
              l = `${a}_${r}`,
              d = st(
                ...s.fields.map((e, t) => n7(iM(s.references[t], l), iM(e, a))),
              ),
              f = this.buildRelationalQueryWithoutPK({
                fullSchema: e,
                schema: t,
                tableNamesMap: i,
                table: e[u],
                tableConfig: t[u],
                queryConfig: tB(o, sS)
                  ? !0 === n
                    ? { limit: 1 }
                    : { ...n, limit: 1 }
                  : n,
                tableAlias: l,
                joinOn: d,
                nestedQueryRelation: o,
              }),
              h = iT`${iT.identifier(l)}.${iT.identifier("data")}`.as(r);
            m.push({
              on: iT`true`,
              table: new ia(f.sql, {}, l),
              alias: l,
              joinType: "left",
              lateral: !0,
            }),
              c.push({
                dbKey: r,
                tsKey: r,
                field: h,
                relationTableTsKey: u,
                isJson: !0,
                selection: f.selection,
              });
          }
        }
        if (0 === c.length)
          throw new n5({
            message: `No fields selected for table "${n.tsName}" ("${a}")`,
          });
        if (((p = st(u, p)), o)) {
          let e = iT`json_build_array(${iT.join(
            c.map(({ field: e, tsKey: t, isJson: i }) =>
              i
                ? iT`${iT.identifier(`${a}_${t}`)}.${iT.identifier("data")}`
                : tB(e, ik.Aliased)
                  ? e.sql
                  : e,
            ),
            iT`, `,
          )})`;
          tB(o, sk) &&
            (e = iT`coalesce(json_agg(${e}${h.length > 0 ? iT` order by ${iT.join(h, iT`, `)}` : void 0}), '[]'::json)`);
          let t = [
            {
              dbKey: "data",
              tsKey: "data",
              field: e.as("data"),
              isJson: !0,
              relationTableTsKey: n.tsName,
              selection: c,
            },
          ];
          void 0 !== d || void 0 !== f || h.length > 0
            ? ((l = this.buildSelectQuery({
                table: iR(r, a),
                fields: {},
                fieldsFlat: [{ path: [], field: iT.raw("*") }],
                where: p,
                limit: d,
                offset: f,
                orderBy: h,
                setOperators: [],
              })),
              (p = void 0),
              (d = void 0),
              (f = void 0),
              (h = []))
            : (l = iR(r, a)),
            (l = this.buildSelectQuery({
              table: tB(l, nF) ? l : new ia(l, {}, a),
              fields: {},
              fieldsFlat: t.map(({ field: e }) => ({
                path: [],
                field: tB(e, tV) ? iM(e, a) : e,
              })),
              joins: m,
              where: p,
              limit: d,
              offset: f,
              orderBy: h,
              setOperators: [],
            }));
        } else
          l = this.buildSelectQuery({
            table: iR(r, a),
            fields: {},
            fieldsFlat: c.map(({ field: e }) => ({
              path: [],
              field: tB(e, tV) ? iM(e, a) : e,
            })),
            joins: m,
            where: p,
            limit: d,
            offset: f,
            orderBy: h,
            setOperators: [],
          });
        return { tableTsKey: n.tsName, sql: l, selection: c };
      }
    }
    class sT {
      static [tM] = "TypedQueryBuilder";
      getSelectedFields() {
        return this._.selectedFields;
      }
    }
    class sO {
      static [tM] = "PgSelectBuilder";
      fields;
      session;
      dialect;
      withList = [];
      distinct;
      constructor(e) {
        (this.fields = e.fields),
          (this.session = e.session),
          (this.dialect = e.dialect),
          e.withList && (this.withList = e.withList),
          (this.distinct = e.distinct);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      from(e) {
        let t,
          i = !!this.fields;
        return (
          (t = this.fields
            ? this.fields
            : tB(e, ia)
              ? Object.fromEntries(
                  Object.keys(e._.selectedFields).map((t) => [t, e[t]]),
                )
              : tB(e, sP)
                ? e[il].selectedFields
                : tB(e, ik)
                  ? {}
                  : iW(e)),
          new sA({
            table: e,
            fields: t,
            isPartialSelect: i,
            session: this.session,
            dialect: this.dialect,
            withList: this.withList,
            distinct: this.distinct,
          }).setToken(this.authToken)
        );
      }
    }
    class sz extends sT {
      static [tM] = "PgSelectQueryBuilder";
      _;
      config;
      joinsNotNullableMap;
      tableName;
      isPartialSelect;
      session;
      dialect;
      cacheConfig = void 0;
      usedTables = new Set();
      constructor({
        table: e,
        fields: t,
        isPartialSelect: i,
        session: r,
        dialect: n,
        withList: s,
        distinct: a,
      }) {
        for (const o of (super(),
        (this.config = {
          withList: s,
          table: e,
          fields: { ...t },
          distinct: a,
          setOperators: [],
        }),
        (this.isPartialSelect = i),
        (this.session = r),
        (this.dialect = n),
        (this._ = { selectedFields: t, config: this.config }),
        (this.tableName = iG(e)),
        (this.joinsNotNullableMap =
          "string" == typeof this.tableName ? { [this.tableName]: !0 } : {}),
        sH(e)))
          this.usedTables.add(o);
      }
      getUsedTables() {
        return [...this.usedTables];
      }
      createJoin(e, t) {
        return (i, r) => {
          let n = this.tableName,
            s = iG(i);
          for (let e of sH(i)) this.usedTables.add(e);
          if (
            "string" == typeof s &&
            this.config.joins?.some((e) => e.alias === s)
          )
            throw Error(`Alias "${s}" is already used in this query`);
          if (
            !this.isPartialSelect &&
            (1 === Object.keys(this.joinsNotNullableMap).length &&
              "string" == typeof n &&
              (this.config.fields = { [n]: this.config.fields }),
            "string" == typeof s && !tB(i, ik))
          ) {
            let e = tB(i, ia)
              ? i._.selectedFields
              : tB(i, iC)
                ? i[il].selectedFields
                : i[ib.Symbol.Columns];
            this.config.fields[s] = e;
          }
          if (
            ("function" == typeof r &&
              (r = r(
                new Proxy(
                  this.config.fields,
                  new iq({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" }),
                ),
              )),
            this.config.joins || (this.config.joins = []),
            this.config.joins.push({
              on: r,
              table: i,
              joinType: e,
              alias: s,
              lateral: t,
            }),
            "string" == typeof s)
          )
            switch (e) {
              case "left":
                this.joinsNotNullableMap[s] = !1;
                break;
              case "right":
                (this.joinsNotNullableMap = Object.fromEntries(
                  Object.entries(this.joinsNotNullableMap).map(([e]) => [
                    e,
                    !1,
                  ]),
                )),
                  (this.joinsNotNullableMap[s] = !0);
                break;
              case "cross":
              case "inner":
                this.joinsNotNullableMap[s] = !0;
                break;
              case "full":
                (this.joinsNotNullableMap = Object.fromEntries(
                  Object.entries(this.joinsNotNullableMap).map(([e]) => [
                    e,
                    !1,
                  ]),
                )),
                  (this.joinsNotNullableMap[s] = !1);
            }
          return this;
        };
      }
      leftJoin = this.createJoin("left", !1);
      leftJoinLateral = this.createJoin("left", !0);
      rightJoin = this.createJoin("right", !1);
      innerJoin = this.createJoin("inner", !1);
      innerJoinLateral = this.createJoin("inner", !0);
      fullJoin = this.createJoin("full", !1);
      crossJoin = this.createJoin("cross", !1);
      crossJoinLateral = this.createJoin("cross", !0);
      createSetOperator(e, t) {
        return (i) => {
          let r = "function" == typeof i ? i(sD()) : i;
          if (!iJ(this.getSelectedFields(), r.getSelectedFields()))
            throw Error(
              "Set operator error (union / intersect / except): selected fields are not the same or are in a different order",
            );
          return (
            this.config.setOperators.push({
              type: e,
              isAll: t,
              rightSelect: r,
            }),
            this
          );
        };
      }
      union = this.createSetOperator("union", !1);
      unionAll = this.createSetOperator("union", !0);
      intersect = this.createSetOperator("intersect", !1);
      intersectAll = this.createSetOperator("intersect", !0);
      except = this.createSetOperator("except", !1);
      exceptAll = this.createSetOperator("except", !0);
      addSetOperators(e) {
        return this.config.setOperators.push(...e), this;
      }
      where(e) {
        return (
          "function" == typeof e &&
            (e = e(
              new Proxy(
                this.config.fields,
                new iq({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" }),
              ),
            )),
          (this.config.where = e),
          this
        );
      }
      having(e) {
        return (
          "function" == typeof e &&
            (e = e(
              new Proxy(
                this.config.fields,
                new iq({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" }),
              ),
            )),
          (this.config.having = e),
          this
        );
      }
      groupBy(...e) {
        if ("function" == typeof e[0]) {
          let t = e[0](
            new Proxy(
              this.config.fields,
              new iq({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" }),
            ),
          );
          this.config.groupBy = Array.isArray(t) ? t : [t];
        } else this.config.groupBy = e;
        return this;
      }
      orderBy(...e) {
        if ("function" == typeof e[0]) {
          let t = e[0](
              new Proxy(
                this.config.fields,
                new iq({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" }),
              ),
            ),
            i = Array.isArray(t) ? t : [t];
          this.config.setOperators.length > 0
            ? (this.config.setOperators.at(-1).orderBy = i)
            : (this.config.orderBy = i);
        } else
          this.config.setOperators.length > 0
            ? (this.config.setOperators.at(-1).orderBy = e)
            : (this.config.orderBy = e);
        return this;
      }
      limit(e) {
        return (
          this.config.setOperators.length > 0
            ? (this.config.setOperators.at(-1).limit = e)
            : (this.config.limit = e),
          this
        );
      }
      offset(e) {
        return (
          this.config.setOperators.length > 0
            ? (this.config.setOperators.at(-1).offset = e)
            : (this.config.offset = e),
          this
        );
      }
      for(e, t = {}) {
        return (this.config.lockingClause = { strength: e, config: t }), this;
      }
      getSQL() {
        return this.dialect.buildSelectQuery(this.config);
      }
      toSQL() {
        let { typings: e, ...t } = this.dialect.sqlToQuery(this.getSQL());
        return t;
      }
      as(e) {
        let t = [];
        if ((t.push(...sH(this.config.table)), this.config.joins))
          for (let e of this.config.joins) t.push(...sH(e.table));
        return new Proxy(
          new ia(this.getSQL(), this.config.fields, e, !1, [...new Set(t)]),
          new iq({
            alias: e,
            sqlAliasedBehavior: "alias",
            sqlBehavior: "error",
          }),
        );
      }
      getSelectedFields() {
        return new Proxy(
          this.config.fields,
          new iq({
            alias: this.tableName,
            sqlAliasedBehavior: "alias",
            sqlBehavior: "error",
          }),
        );
      }
      $dynamic() {
        return this;
      }
      $withCache(e) {
        return (
          (this.cacheConfig =
            void 0 === e
              ? { config: {}, enable: !0, autoInvalidate: !0 }
              : !1 === e
                ? { enable: !1 }
                : { enable: !0, autoInvalidate: !0, ...e }),
          this
        );
      }
    }
    class sA extends sz {
      static [tM] = "PgSelect";
      _prepare(e) {
        let {
          session: t,
          config: i,
          dialect: r,
          joinsNotNullableMap: n,
          authToken: s,
          cacheConfig: a,
          usedTables: o,
        } = this;
        if (!t)
          throw Error(
            "Cannot execute a query on a query builder. Please use a database instance instead.",
          );
        let { fields: u } = i;
        return iu("drizzle.prepareQuery", () => {
          let i = iQ(u),
            l = t.prepareQuery(
              r.sqlToQuery(this.getSQL()),
              i,
              e,
              !0,
              void 0,
              { type: "select", tables: [...o] },
              a,
            );
          return (l.joinsNotNullableMap = n), l.setToken(s);
        });
      }
      prepare(e) {
        return this._prepare(e);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute = (e) =>
        iu("drizzle.operation", () =>
          this._prepare().execute(e, this.authToken),
        );
    }
    for (let e of [tJ])
      for (let t of Object.getOwnPropertyNames(e.prototype))
        "constructor" !== t &&
          Object.defineProperty(
            sA.prototype,
            t,
            Object.getOwnPropertyDescriptor(e.prototype, t) ||
              Object.create(null),
          );
    function sU(e, t) {
      return (i, r, ...n) => {
        let s = [r, ...n].map((i) => ({ type: e, isAll: t, rightSelect: i }));
        for (let e of s)
          if (!iJ(i.getSelectedFields(), e.rightSelect.getSelectedFields()))
            throw Error(
              "Set operator error (union / intersect / except): selected fields are not the same or are in a different order",
            );
        return i.addSetOperators(s);
      };
    }
    let sD = () => ({
        union: sC,
        unionAll: sj,
        intersect: sZ,
        intersectAll: sL,
        except: sR,
        exceptAll: sM,
      }),
      sC = sU("union", !1),
      sj = sU("union", !0),
      sZ = sU("intersect", !1),
      sL = sU("intersect", !0),
      sR = sU("except", !1),
      sM = sU("except", !0);
    class sB {
      static [tM] = "PgQueryBuilder";
      dialect;
      dialectConfig;
      constructor(e) {
        (this.dialect = tB(e, sN) ? e : void 0),
          (this.dialectConfig = tB(e, sN) ? void 0 : e);
      }
      $with = (e, t) => {
        let i = this;
        return {
          as: (r) => (
            "function" == typeof r && (r = r(i)),
            new Proxy(
              new io(
                r.getSQL(),
                t ??
                  ("getSelectedFields" in r
                    ? (r.getSelectedFields() ?? {})
                    : {}),
                e,
                !0,
              ),
              new iq({
                alias: e,
                sqlAliasedBehavior: "alias",
                sqlBehavior: "error",
              }),
            )
          ),
        };
      };
      with(...e) {
        let t = this;
        return {
          select: function (i) {
            return new sO({
              fields: i ?? void 0,
              session: void 0,
              dialect: t.getDialect(),
              withList: e,
            });
          },
          selectDistinct: function (e) {
            return new sO({
              fields: e ?? void 0,
              session: void 0,
              dialect: t.getDialect(),
              distinct: !0,
            });
          },
          selectDistinctOn: function (e, i) {
            return new sO({
              fields: i ?? void 0,
              session: void 0,
              dialect: t.getDialect(),
              distinct: { on: e },
            });
          },
        };
      }
      select(e) {
        return new sO({
          fields: e ?? void 0,
          session: void 0,
          dialect: this.getDialect(),
        });
      }
      selectDistinct(e) {
        return new sO({
          fields: e ?? void 0,
          session: void 0,
          dialect: this.getDialect(),
          distinct: !0,
        });
      }
      selectDistinctOn(e, t) {
        return new sO({
          fields: t ?? void 0,
          session: void 0,
          dialect: this.getDialect(),
          distinct: { on: e },
        });
      }
      getDialect() {
        return (
          this.dialect || (this.dialect = new sN(this.dialectConfig)),
          this.dialect
        );
      }
    }
    class sF {
      constructor(e, t) {
        (this.name = e), (this.schema = t);
      }
      static [tM] = "PgDefaultViewBuilderCore";
      config = {};
      with(e) {
        return (this.config.with = e), this;
      }
    }
    class sq extends sF {
      static [tM] = "PgViewBuilder";
      as(e) {
        "function" == typeof e && (e = e(new sB()));
        let t = new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
          i = new Proxy(e.getSelectedFields(), t);
        return new Proxy(
          new sG({
            pgConfig: this.config,
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: i,
              query: e.getSQL().inlineParams(),
            },
          }),
          t,
        );
      }
    }
    class sQ extends sF {
      static [tM] = "PgManualViewBuilder";
      columns;
      constructor(e, t, i) {
        super(e, i), (this.columns = iW(nq(e, t)));
      }
      existing() {
        return new Proxy(
          new sG({
            pgConfig: void 0,
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: this.columns,
              query: void 0,
            },
          }),
          new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
        );
      }
      as(e) {
        return new Proxy(
          new sG({
            pgConfig: this.config,
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: this.columns,
              query: e.inlineParams(),
            },
          }),
          new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
        );
      }
    }
    class sJ {
      constructor(e, t) {
        (this.name = e), (this.schema = t);
      }
      static [tM] = "PgMaterializedViewBuilderCore";
      config = {};
      using(e) {
        return (this.config.using = e), this;
      }
      with(e) {
        return (this.config.with = e), this;
      }
      tablespace(e) {
        return (this.config.tablespace = e), this;
      }
      withNoData() {
        return (this.config.withNoData = !0), this;
      }
    }
    class sV extends sJ {
      static [tM] = "PgMaterializedViewBuilder";
      as(e) {
        "function" == typeof e && (e = e(new sB()));
        let t = new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
          i = new Proxy(e.getSelectedFields(), t);
        return new Proxy(
          new sX({
            pgConfig: {
              with: this.config.with,
              using: this.config.using,
              tablespace: this.config.tablespace,
              withNoData: this.config.withNoData,
            },
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: i,
              query: e.getSQL().inlineParams(),
            },
          }),
          t,
        );
      }
    }
    class sW extends sJ {
      static [tM] = "PgManualMaterializedViewBuilder";
      columns;
      constructor(e, t, i) {
        super(e, i), (this.columns = iW(nq(e, t)));
      }
      existing() {
        return new Proxy(
          new sX({
            pgConfig: {
              tablespace: this.config.tablespace,
              using: this.config.using,
              with: this.config.with,
              withNoData: this.config.withNoData,
            },
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: this.columns,
              query: void 0,
            },
          }),
          new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
        );
      }
      as(e) {
        return new Proxy(
          new sX({
            pgConfig: {
              tablespace: this.config.tablespace,
              using: this.config.using,
              with: this.config.with,
              withNoData: this.config.withNoData,
            },
            config: {
              name: this.name,
              schema: this.schema,
              selectedFields: this.columns,
              query: e.inlineParams(),
            },
          }),
          new iq({
            alias: this.name,
            sqlBehavior: "error",
            sqlAliasedBehavior: "alias",
            replaceOriginalName: !0,
          }),
        );
      }
    }
    class sG extends sP {
      static [tM] = "PgView";
      [n0];
      constructor({ pgConfig: e, config: t }) {
        super(t), e && (this[n0] = { with: e.with });
      }
    }
    let sK = Symbol.for("drizzle:PgMaterializedViewConfig");
    class sX extends sP {
      static [tM] = "PgMaterializedView";
      [sK];
      constructor({ pgConfig: e, config: t }) {
        super(t),
          (this[sK] = {
            with: e?.with,
            using: e?.using,
            tablespace: e?.tablespace,
            withNoData: e?.withNoData,
          });
      }
    }
    function sH(e) {
      return tB(e, nF)
        ? [e[ic] ? `${e[ic]}.${e[ib.Symbol.BaseName]}` : e[ib.Symbol.BaseName]]
        : tB(e, ia)
          ? (e._.usedTables ?? [])
          : tB(e, ik)
            ? (e.usedTables ?? [])
            : [];
    }
    class sY extends tJ {
      constructor(e, t, i, r) {
        super(),
          (this.session = t),
          (this.dialect = i),
          (this.config = { table: e, withList: r });
      }
      static [tM] = "PgDelete";
      config;
      cacheConfig;
      where(e) {
        return (this.config.where = e), this;
      }
      returning(e = this.config.table[ib.Symbol.Columns]) {
        return (
          (this.config.returningFields = e),
          (this.config.returning = iQ(e)),
          this
        );
      }
      getSQL() {
        return this.dialect.buildDeleteQuery(this.config);
      }
      toSQL() {
        let { typings: e, ...t } = this.dialect.sqlToQuery(this.getSQL());
        return t;
      }
      _prepare(e) {
        return iu("drizzle.prepareQuery", () =>
          this.session.prepareQuery(
            this.dialect.sqlToQuery(this.getSQL()),
            this.config.returning,
            e,
            !0,
            void 0,
            { type: "delete", tables: sH(this.config.table) },
            this.cacheConfig,
          ),
        );
      }
      prepare(e) {
        return this._prepare(e);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute = (e) =>
        iu("drizzle.operation", () =>
          this._prepare().execute(e, this.authToken),
        );
      getSelectedFields() {
        return this.config.returningFields
          ? new Proxy(
              this.config.returningFields,
              new iq({
                alias: this.config.table[tG],
                sqlAliasedBehavior: "alias",
                sqlBehavior: "error",
              }),
            )
          : void 0;
      }
      $dynamic() {
        return this;
      }
    }
    class s0 {
      constructor(e, t, i, r, n) {
        (this.table = e),
          (this.session = t),
          (this.dialect = i),
          (this.withList = r),
          (this.overridingSystemValue_ = n);
      }
      static [tM] = "PgInsertBuilder";
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      overridingSystemValue() {
        return (this.overridingSystemValue_ = !0), this;
      }
      values(e) {
        if (0 === (e = Array.isArray(e) ? e : [e]).length)
          throw Error("values() must be called with at least one value");
        let t = e.map((e) => {
          let t = {},
            i = this.table[ib.Symbol.Columns];
          for (let r of Object.keys(e)) {
            let n = e[r];
            t[r] = tB(n, ik) ? n : new iN(n, i[r]);
          }
          return t;
        });
        return new s1(
          this.table,
          t,
          this.session,
          this.dialect,
          this.withList,
          !1,
          this.overridingSystemValue_,
        ).setToken(this.authToken);
      }
      select(e) {
        let t = "function" == typeof e ? e(new sB()) : e;
        if (!tB(t, ik) && !iJ(this.table[id], t._.selectedFields))
          throw Error(
            "Insert select error: selected fields are not the same or are in a different order compared to the table definition",
          );
        return new s1(
          this.table,
          t,
          this.session,
          this.dialect,
          this.withList,
          !0,
        );
      }
    }
    class s1 extends tJ {
      constructor(e, t, i, r, n, s, a) {
        super(),
          (this.session = i),
          (this.dialect = r),
          (this.config = {
            table: e,
            values: t,
            withList: n,
            select: s,
            overridingSystemValue_: a,
          });
      }
      static [tM] = "PgInsert";
      config;
      cacheConfig;
      returning(e = this.config.table[ib.Symbol.Columns]) {
        return (
          (this.config.returningFields = e),
          (this.config.returning = iQ(e)),
          this
        );
      }
      onConflictDoNothing(e = {}) {
        if (void 0 === e.target) this.config.onConflict = iT`do nothing`;
        else {
          let t = "";
          t = Array.isArray(e.target)
            ? e.target
                .map((e) =>
                  this.dialect.escapeName(
                    this.dialect.casing.getColumnCasing(e),
                  ),
                )
                .join(",")
            : this.dialect.escapeName(
                this.dialect.casing.getColumnCasing(e.target),
              );
          let i = e.where ? iT` where ${e.where}` : void 0;
          this.config.onConflict = iT`(${iT.raw(t)})${i} do nothing`;
        }
        return this;
      }
      onConflictDoUpdate(e) {
        if (e.where && (e.targetWhere || e.setWhere))
          throw Error(
            'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
          );
        let t = e.where ? iT` where ${e.where}` : void 0,
          i = e.targetWhere ? iT` where ${e.targetWhere}` : void 0,
          r = e.setWhere ? iT` where ${e.setWhere}` : void 0,
          n = this.dialect.buildUpdateSet(
            this.config.table,
            iV(this.config.table, e.set),
          ),
          s = "";
        return (
          (s = Array.isArray(e.target)
            ? e.target
                .map((e) =>
                  this.dialect.escapeName(
                    this.dialect.casing.getColumnCasing(e),
                  ),
                )
                .join(",")
            : this.dialect.escapeName(
                this.dialect.casing.getColumnCasing(e.target),
              )),
          (this.config.onConflict = iT`(${iT.raw(s)})${i} do update set ${n}${t}${r}`),
          this
        );
      }
      getSQL() {
        return this.dialect.buildInsertQuery(this.config);
      }
      toSQL() {
        let { typings: e, ...t } = this.dialect.sqlToQuery(this.getSQL());
        return t;
      }
      _prepare(e) {
        return iu("drizzle.prepareQuery", () =>
          this.session.prepareQuery(
            this.dialect.sqlToQuery(this.getSQL()),
            this.config.returning,
            e,
            !0,
            void 0,
            { type: "insert", tables: sH(this.config.table) },
            this.cacheConfig,
          ),
        );
      }
      prepare(e) {
        return this._prepare(e);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute = (e) =>
        iu("drizzle.operation", () =>
          this._prepare().execute(e, this.authToken),
        );
      getSelectedFields() {
        return this.config.returningFields
          ? new Proxy(
              this.config.returningFields,
              new iq({
                alias: this.config.table[tG],
                sqlAliasedBehavior: "alias",
                sqlBehavior: "error",
              }),
            )
          : void 0;
      }
      $dynamic() {
        return this;
      }
    }
    class s6 {
      constructor(e, t, i, r) {
        (this.table = e),
          (this.session = t),
          (this.dialect = i),
          (this.withList = r);
      }
      static [tM] = "PgUpdateBuilder";
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      set(e) {
        return new s4(
          this.table,
          iV(this.table, e),
          this.session,
          this.dialect,
          this.withList,
        ).setToken(this.authToken);
      }
    }
    class s4 extends tJ {
      constructor(e, t, i, r, n) {
        super(),
          (this.session = i),
          (this.dialect = r),
          (this.config = { set: t, table: e, withList: n, joins: [] }),
          (this.tableName = iG(e)),
          (this.joinsNotNullableMap =
            "string" == typeof this.tableName ? { [this.tableName]: !0 } : {});
      }
      static [tM] = "PgUpdate";
      config;
      tableName;
      joinsNotNullableMap;
      cacheConfig;
      from(e) {
        let t = iG(e);
        return (
          "string" == typeof t && (this.joinsNotNullableMap[t] = !0),
          (this.config.from = e),
          this
        );
      }
      getTableLikeFields(e) {
        return tB(e, nF)
          ? e[ib.Symbol.Columns]
          : tB(e, ia)
            ? e._.selectedFields
            : e[il].selectedFields;
      }
      createJoin(e) {
        return (t, i) => {
          let r = iG(t);
          if (
            "string" == typeof r &&
            this.config.joins.some((e) => e.alias === r)
          )
            throw Error(`Alias "${r}" is already used in this query`);
          if ("function" == typeof i) {
            let e =
              this.config.from && !tB(this.config.from, ik)
                ? this.getTableLikeFields(this.config.from)
                : void 0;
            i = i(
              new Proxy(
                this.config.table[ib.Symbol.Columns],
                new iq({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" }),
              ),
              e &&
                new Proxy(
                  e,
                  new iq({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" }),
                ),
            );
          }
          if (
            (this.config.joins.push({ on: i, table: t, joinType: e, alias: r }),
            "string" == typeof r)
          )
            switch (e) {
              case "left":
                this.joinsNotNullableMap[r] = !1;
                break;
              case "right":
                (this.joinsNotNullableMap = Object.fromEntries(
                  Object.entries(this.joinsNotNullableMap).map(([e]) => [
                    e,
                    !1,
                  ]),
                )),
                  (this.joinsNotNullableMap[r] = !0);
                break;
              case "inner":
                this.joinsNotNullableMap[r] = !0;
                break;
              case "full":
                (this.joinsNotNullableMap = Object.fromEntries(
                  Object.entries(this.joinsNotNullableMap).map(([e]) => [
                    e,
                    !1,
                  ]),
                )),
                  (this.joinsNotNullableMap[r] = !1);
            }
          return this;
        };
      }
      leftJoin = this.createJoin("left");
      rightJoin = this.createJoin("right");
      innerJoin = this.createJoin("inner");
      fullJoin = this.createJoin("full");
      where(e) {
        return (this.config.where = e), this;
      }
      returning(e) {
        if (
          !e &&
          ((e = Object.assign({}, this.config.table[ib.Symbol.Columns])),
          this.config.from)
        ) {
          let t = iG(this.config.from);
          if (
            "string" == typeof t &&
            this.config.from &&
            !tB(this.config.from, ik)
          ) {
            let i = this.getTableLikeFields(this.config.from);
            e[t] = i;
          }
          for (let t of this.config.joins) {
            let i = iG(t.table);
            if ("string" == typeof i && !tB(t.table, ik)) {
              let r = this.getTableLikeFields(t.table);
              e[i] = r;
            }
          }
        }
        return (
          (this.config.returningFields = e),
          (this.config.returning = iQ(e)),
          this
        );
      }
      getSQL() {
        return this.dialect.buildUpdateQuery(this.config);
      }
      toSQL() {
        let { typings: e, ...t } = this.dialect.sqlToQuery(this.getSQL());
        return t;
      }
      _prepare(e) {
        let t = this.session.prepareQuery(
          this.dialect.sqlToQuery(this.getSQL()),
          this.config.returning,
          e,
          !0,
          void 0,
          { type: "insert", tables: sH(this.config.table) },
          this.cacheConfig,
        );
        return (t.joinsNotNullableMap = this.joinsNotNullableMap), t;
      }
      prepare(e) {
        return this._prepare(e);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute = (e) => this._prepare().execute(e, this.authToken);
      getSelectedFields() {
        return this.config.returningFields
          ? new Proxy(
              this.config.returningFields,
              new iq({
                alias: this.config.table[tG],
                sqlAliasedBehavior: "alias",
                sqlBehavior: "error",
              }),
            )
          : void 0;
      }
      $dynamic() {
        return this;
      }
    }
    class s2 extends ik {
      constructor(e) {
        super(s2.buildEmbeddedCount(e.source, e.filters).queryChunks),
          (this.params = e),
          this.mapWith(Number),
          (this.session = e.session),
          (this.sql = s2.buildCount(e.source, e.filters));
      }
      sql;
      token;
      static [tM] = "PgCountBuilder";
      [Symbol.toStringTag] = "PgCountBuilder";
      session;
      static buildEmbeddedCount(e, t) {
        return iT`(select count(*) from ${e}${iT.raw(" where ").if(t)}${t})`;
      }
      static buildCount(e, t) {
        return iT`select count(*) as count from ${e}${iT.raw(" where ").if(t)}${t};`;
      }
      setToken(e) {
        return (this.token = e), this;
      }
      then(e, t) {
        return Promise.resolve(this.session.count(this.sql, this.token)).then(
          e,
          t,
        );
      }
      catch(e) {
        return this.then(void 0, e);
      }
      finally(e) {
        return this.then(
          (t) => (e?.(), t),
          (t) => {
            throw (e?.(), t);
          },
        );
      }
    }
    class s5 {
      constructor(e, t, i, r, n, s, a) {
        (this.fullSchema = e),
          (this.schema = t),
          (this.tableNamesMap = i),
          (this.table = r),
          (this.tableConfig = n),
          (this.dialect = s),
          (this.session = a);
      }
      static [tM] = "PgRelationalQueryBuilder";
      findMany(e) {
        return new s3(
          this.fullSchema,
          this.schema,
          this.tableNamesMap,
          this.table,
          this.tableConfig,
          this.dialect,
          this.session,
          e || {},
          "many",
        );
      }
      findFirst(e) {
        return new s3(
          this.fullSchema,
          this.schema,
          this.tableNamesMap,
          this.table,
          this.tableConfig,
          this.dialect,
          this.session,
          e ? { ...e, limit: 1 } : { limit: 1 },
          "first",
        );
      }
    }
    class s3 extends tJ {
      constructor(e, t, i, r, n, s, a, o, u) {
        super(),
          (this.fullSchema = e),
          (this.schema = t),
          (this.tableNamesMap = i),
          (this.table = r),
          (this.tableConfig = n),
          (this.dialect = s),
          (this.session = a),
          (this.config = o),
          (this.mode = u);
      }
      static [tM] = "PgRelationalQuery";
      _prepare(e) {
        return iu("drizzle.prepareQuery", () => {
          let { query: t, builtQuery: i } = this._toSQL();
          return this.session.prepareQuery(i, void 0, e, !0, (e, i) => {
            let r = e.map((e) =>
              (function e(t, i, r, n, s = (e) => e) {
                let a = {};
                for (let [o, u] of n.entries())
                  if (u.isJson) {
                    let n = i.relations[u.tsKey],
                      l = r[o],
                      c = "string" == typeof l ? JSON.parse(l) : l;
                    a[u.tsKey] = tB(n, sS)
                      ? c && e(t, t[u.relationTableTsKey], c, u.selection, s)
                      : c.map((i) =>
                          e(t, t[u.relationTableTsKey], i, u.selection, s),
                        );
                  } else {
                    let e,
                      t = s(r[o]),
                      i = u.field;
                    (e = tB(i, tV) ? i : tB(i, ik) ? i.decoder : i.sql.decoder),
                      (a[u.tsKey] =
                        null === t ? null : e.mapFromDriverValue(t));
                  }
                return a;
              })(this.schema, this.tableConfig, e, t.selection, i),
            );
            return "first" === this.mode ? r[0] : r;
          });
        });
      }
      prepare(e) {
        return this._prepare(e);
      }
      _getQuery() {
        return this.dialect.buildRelationalQueryWithoutPK({
          fullSchema: this.fullSchema,
          schema: this.schema,
          tableNamesMap: this.tableNamesMap,
          table: this.table,
          tableConfig: this.tableConfig,
          queryConfig: this.config,
          tableAlias: this.tableConfig.tsName,
        });
      }
      getSQL() {
        return this._getQuery().sql;
      }
      _toSQL() {
        let e = this._getQuery(),
          t = this.dialect.sqlToQuery(e.sql);
        return { query: e, builtQuery: t };
      }
      toSQL() {
        return this._toSQL().builtQuery;
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute() {
        return iu("drizzle.operation", () =>
          this._prepare().execute(void 0, this.authToken),
        );
      }
    }
    class s8 extends tJ {
      constructor(e, t, i, r) {
        super(),
          (this.execute = e),
          (this.sql = t),
          (this.query = i),
          (this.mapBatchResult = r);
      }
      static [tM] = "PgRaw";
      getSQL() {
        return this.sql;
      }
      getQuery() {
        return this.query;
      }
      mapResult(e, t) {
        return t ? this.mapBatchResult(e) : e;
      }
      _prepare() {
        return this;
      }
      isResponseInArrayMode() {
        return !1;
      }
    }
    class s9 extends tJ {
      constructor(e, t, i) {
        super(),
          (this.session = t),
          (this.dialect = i),
          (this.config = { view: e });
      }
      static [tM] = "PgRefreshMaterializedView";
      config;
      concurrently() {
        if (void 0 !== this.config.withNoData)
          throw Error("Cannot use concurrently and withNoData together");
        return (this.config.concurrently = !0), this;
      }
      withNoData() {
        if (void 0 !== this.config.concurrently)
          throw Error("Cannot use concurrently and withNoData together");
        return (this.config.withNoData = !0), this;
      }
      getSQL() {
        return this.dialect.buildRefreshMaterializedViewQuery(this.config);
      }
      toSQL() {
        let { typings: e, ...t } = this.dialect.sqlToQuery(this.getSQL());
        return t;
      }
      _prepare(e) {
        return iu("drizzle.prepareQuery", () =>
          this.session.prepareQuery(
            this.dialect.sqlToQuery(this.getSQL()),
            void 0,
            e,
            !0,
          ),
        );
      }
      prepare(e) {
        return this._prepare(e);
      }
      authToken;
      setToken(e) {
        return (this.authToken = e), this;
      }
      execute = (e) =>
        iu("drizzle.operation", () =>
          this._prepare().execute(e, this.authToken),
        );
    }
    class s7 {
      constructor(e, t, i) {
        if (
          ((this.dialect = e),
          (this.session = t),
          (this._ = i
            ? {
                schema: i.schema,
                fullSchema: i.fullSchema,
                tableNamesMap: i.tableNamesMap,
                session: t,
              }
            : {
                schema: void 0,
                fullSchema: {},
                tableNamesMap: {},
                session: t,
              }),
          (this.query = {}),
          this._.schema)
        )
          for (const [r, n] of Object.entries(this._.schema))
            this.query[r] = new s5(
              i.fullSchema,
              this._.schema,
              this._.tableNamesMap,
              i.fullSchema[r],
              n,
              e,
              t,
            );
        this.$cache = { invalidate: async (e) => {} };
      }
      static [tM] = "PgDatabase";
      query;
      $with = (e, t) => {
        let i = this;
        return {
          as: (r) => (
            "function" == typeof r && (r = r(new sB(i.dialect))),
            new Proxy(
              new io(
                r.getSQL(),
                t ??
                  ("getSelectedFields" in r
                    ? (r.getSelectedFields() ?? {})
                    : {}),
                e,
                !0,
              ),
              new iq({
                alias: e,
                sqlAliasedBehavior: "alias",
                sqlBehavior: "error",
              }),
            )
          ),
        };
      };
      $count(e, t) {
        return new s2({ source: e, filters: t, session: this.session });
      }
      $cache;
      with(...e) {
        let t = this;
        return {
          select: function (i) {
            return new sO({
              fields: i ?? void 0,
              session: t.session,
              dialect: t.dialect,
              withList: e,
            });
          },
          selectDistinct: function (i) {
            return new sO({
              fields: i ?? void 0,
              session: t.session,
              dialect: t.dialect,
              withList: e,
              distinct: !0,
            });
          },
          selectDistinctOn: function (i, r) {
            return new sO({
              fields: r ?? void 0,
              session: t.session,
              dialect: t.dialect,
              withList: e,
              distinct: { on: i },
            });
          },
          update: function (i) {
            return new s6(i, t.session, t.dialect, e);
          },
          insert: function (i) {
            return new s0(i, t.session, t.dialect, e);
          },
          delete: function (i) {
            return new sY(i, t.session, t.dialect, e);
          },
        };
      }
      select(e) {
        return new sO({
          fields: e ?? void 0,
          session: this.session,
          dialect: this.dialect,
        });
      }
      selectDistinct(e) {
        return new sO({
          fields: e ?? void 0,
          session: this.session,
          dialect: this.dialect,
          distinct: !0,
        });
      }
      selectDistinctOn(e, t) {
        return new sO({
          fields: t ?? void 0,
          session: this.session,
          dialect: this.dialect,
          distinct: { on: e },
        });
      }
      update(e) {
        return new s6(e, this.session, this.dialect);
      }
      insert(e) {
        return new s0(e, this.session, this.dialect);
      }
      delete(e) {
        return new sY(e, this.session, this.dialect);
      }
      refreshMaterializedView(e) {
        return new s9(e, this.session, this.dialect);
      }
      authToken;
      execute(e) {
        let t = "string" == typeof e ? iT.raw(e) : e.getSQL(),
          i = this.dialect.sqlToQuery(t),
          r = this.session.prepareQuery(i, void 0, void 0, !1);
        return new s8(
          () => r.execute(void 0, this.authToken),
          t,
          i,
          (e) => r.mapResult(e, !0),
        );
      }
      transaction(e, t) {
        return this.session.transaction(e, t);
      }
    }
    class ae {
      static [tM] = "Cache";
    }
    class at extends ae {
      strategy() {
        return "all";
      }
      static [tM] = "NoopCache";
      async get(e) {}
      async put(e, t, i, r) {}
      async onMutate(e) {}
    }
    async function ai(e, t) {
      let i = `${e}-${JSON.stringify(t)}`,
        r = new TextEncoder().encode(i);
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", r))]
        .map((e) => e.toString(16).padStart(2, "0"))
        .join("");
    }
    class ar {
      constructor(e, t, i, r) {
        (this.query = e),
          (this.cache = t),
          (this.queryMetadata = i),
          (this.cacheConfig = r),
          t &&
            "all" === t.strategy() &&
            void 0 === r &&
            (this.cacheConfig = { enable: !0, autoInvalidate: !0 }),
          this.cacheConfig?.enable || (this.cacheConfig = void 0);
      }
      authToken;
      getQuery() {
        return this.query;
      }
      mapResult(e, t) {
        return e;
      }
      setToken(e) {
        return (this.authToken = e), this;
      }
      static [tM] = "PgPreparedQuery";
      joinsNotNullableMap;
      async queryWithCache(e, t, i) {
        if (
          void 0 === this.cache ||
          tB(this.cache, at) ||
          void 0 === this.queryMetadata ||
          (this.cacheConfig && !this.cacheConfig.enable)
        )
          try {
            return await i();
          } catch (i) {
            throw new n3(e, t, i);
          }
        if (
          ("insert" === this.queryMetadata.type ||
            "update" === this.queryMetadata.type ||
            "delete" === this.queryMetadata.type) &&
          this.queryMetadata.tables.length > 0
        )
          try {
            let [e] = await Promise.all([
              i(),
              this.cache.onMutate({ tables: this.queryMetadata.tables }),
            ]);
            return e;
          } catch (i) {
            throw new n3(e, t, i);
          }
        if (!this.cacheConfig)
          try {
            return await i();
          } catch (i) {
            throw new n3(e, t, i);
          }
        if ("select" === this.queryMetadata.type) {
          let r = await this.cache.get(
            this.cacheConfig.tag ?? (await ai(e, t)),
            this.queryMetadata.tables,
            void 0 !== this.cacheConfig.tag,
            this.cacheConfig.autoInvalidate,
          );
          if (void 0 === r) {
            let r;
            try {
              r = await i();
            } catch (i) {
              throw new n3(e, t, i);
            }
            return (
              await this.cache.put(
                this.cacheConfig.tag ?? (await ai(e, t)),
                r,
                this.cacheConfig.autoInvalidate
                  ? this.queryMetadata.tables
                  : [],
                void 0 !== this.cacheConfig.tag,
                this.cacheConfig.config,
              ),
              r
            );
          }
          return r;
        }
        try {
          return await i();
        } catch (i) {
          throw new n3(e, t, i);
        }
      }
    }
    class an {
      constructor(e) {
        this.dialect = e;
      }
      static [tM] = "PgSession";
      execute(e, t) {
        return iu("drizzle.operation", () =>
          iu("drizzle.prepareQuery", () =>
            this.prepareQuery(this.dialect.sqlToQuery(e), void 0, void 0, !1),
          )
            .setToken(t)
            .execute(void 0, t),
        );
      }
      all(e) {
        return this.prepareQuery(
          this.dialect.sqlToQuery(e),
          void 0,
          void 0,
          !1,
        ).all();
      }
      async count(e, t) {
        return Number((await this.execute(e, t))[0].count);
      }
    }
    class as extends s7 {
      constructor(e, t, i, r = 0) {
        super(e, t, i), (this.schema = i), (this.nestedIndex = r);
      }
      static [tM] = "PgTransaction";
      rollback() {
        throw new n8();
      }
      getTransactionConfigSQL(e) {
        let t = [];
        return (
          e.isolationLevel && t.push(`isolation level ${e.isolationLevel}`),
          e.accessMode && t.push(e.accessMode),
          "boolean" == typeof e.deferrable &&
            t.push(e.deferrable ? "deferrable" : "not deferrable"),
          iT.raw(t.join(" "))
        );
      }
      setTransaction(e) {
        return this.session.execute(
          iT`set transaction ${this.getTransactionConfigSQL(e)}`,
        );
      }
    }
    let aa = { arrayMode: !1, fullResults: !0 },
      ao = { arrayMode: !0, fullResults: !0 };
    class au extends ar {
      constructor(e, t, i, r, n, s, a, o, u) {
        super(t, r, n, s),
          (this.client = e),
          (this.logger = i),
          (this.fields = a),
          (this._isResponseInArrayMode = o),
          (this.customResultMapper = u),
          (this.clientQuery = e.query ?? e);
      }
      static [tM] = "NeonHttpPreparedQuery";
      clientQuery;
      async execute(e = {}, t = this.authToken) {
        let i = iU(this.query.params, e);
        this.logger.logQuery(this.query.sql, i);
        let {
          fields: r,
          clientQuery: n,
          query: s,
          customResultMapper: a,
        } = this;
        if (!r && !a)
          return this.queryWithCache(s.sql, i, async () =>
            n(s.sql, i, void 0 === t ? aa : { ...aa, authToken: t }),
          );
        let o = await this.queryWithCache(
          s.sql,
          i,
          async () =>
            await n(s.sql, i, void 0 === t ? ao : { ...ao, authToken: t }),
        );
        return this.mapResult(o);
      }
      mapResult(e) {
        if (!this.fields && !this.customResultMapper) return e;
        let t = e.rows;
        return this.customResultMapper
          ? this.customResultMapper(t)
          : t.map((e) =>
              (function (e, t, i) {
                let r = {},
                  n = e.reduce((e, { path: n, field: s }, a) => {
                    let o;
                    o = tB(s, tV)
                      ? s
                      : tB(s, ik)
                        ? s.decoder
                        : tB(s, ia)
                          ? s._.sql.decoder
                          : s.sql.decoder;
                    let u = e;
                    for (let [e, l] of n.entries())
                      if (e < n.length - 1) l in u || (u[l] = {}), (u = u[l]);
                      else {
                        let e = t[a],
                          c = (u[l] =
                            null === e ? null : o.mapFromDriverValue(e));
                        if (i && tB(s, tV) && 2 === n.length) {
                          let e = n[0];
                          e in r
                            ? "string" == typeof r[e] &&
                              r[e] !== s.table[tG] &&
                              (r[e] = !1)
                            : (r[e] = null === c && s.table[tG]);
                        }
                      }
                    return e;
                  }, {});
                if (i && Object.keys(r).length > 0)
                  for (let [e, t] of Object.entries(r))
                    "string" != typeof t || i[t] || (n[e] = null);
                return n;
              })(this.fields, e, this.joinsNotNullableMap),
            );
      }
      all(e = {}) {
        let t = iU(this.query.params, e);
        return (
          this.logger.logQuery(this.query.sql, t),
          this.clientQuery(
            this.query.sql,
            t,
            void 0 === this.authToken
              ? aa
              : { ...aa, authToken: this.authToken },
          ).then((e) => e.rows)
        );
      }
      values(e = {}, t) {
        let i = iU(this.query.params, e);
        return (
          this.logger.logQuery(this.query.sql, i),
          this.clientQuery(this.query.sql, i, {
            arrayMode: !0,
            fullResults: !0,
            authToken: t,
          }).then((e) => e.rows)
        );
      }
      isResponseInArrayMode() {
        return this._isResponseInArrayMode;
      }
    }
    class al extends an {
      constructor(e, t, i, r = {}) {
        super(t),
          (this.client = e),
          (this.schema = i),
          (this.options = r),
          (this.clientQuery = e.query ?? e),
          (this.logger = r.logger ?? new tQ()),
          (this.cache = r.cache ?? new at());
      }
      static [tM] = "NeonHttpSession";
      clientQuery;
      logger;
      cache;
      prepareQuery(e, t, i, r, n, s, a) {
        return new au(this.client, e, this.logger, this.cache, s, a, t, r, n);
      }
      async batch(e) {
        let t = [],
          i = [];
        for (let r of e) {
          let e = r._prepare(),
            n = e.getQuery();
          t.push(e),
            i.push(
              this.clientQuery(n.sql, n.params, {
                fullResults: !0,
                arrayMode: e.isResponseInArrayMode(),
              }),
            );
        }
        return (await this.client.transaction(i, ao)).map((e, i) =>
          t[i].mapResult(e, !0),
        );
      }
      async query(e, t) {
        return (
          this.logger.logQuery(e, t),
          await this.clientQuery(e, t, { arrayMode: !0, fullResults: !0 })
        );
      }
      async queryObjects(e, t) {
        return this.clientQuery(e, t, { arrayMode: !1, fullResults: !0 });
      }
      async count(e, t) {
        return Number((await this.execute(e, t)).rows[0].count);
      }
      async transaction(e, t = {}) {
        throw Error("No transactions support in neon-http driver");
      }
    }
    class ac extends as {
      static [tM] = "NeonHttpTransaction";
      async transaction(e) {
        throw Error("No transactions support in neon-http driver");
      }
    }
    class ad {
      constructor(e, t, i = {}) {
        (this.client = e),
          (this.dialect = t),
          (this.options = i),
          this.initMappers();
      }
      static [tM] = "NeonHttpDriver";
      createSession(e) {
        return new al(this.client, this.dialect, e, {
          logger: this.options.logger,
          cache: this.options.cache,
        });
      }
      initMappers() {
        tR.setTypeParser(tR.builtins.TIMESTAMPTZ, (e) => e),
          tR.setTypeParser(tR.builtins.TIMESTAMP, (e) => e),
          tR.setTypeParser(tR.builtins.DATE, (e) => e),
          tR.setTypeParser(tR.builtins.INTERVAL, (e) => e),
          tR.setTypeParser(1231, (e) => e),
          tR.setTypeParser(1115, (e) => e),
          tR.setTypeParser(1185, (e) => e),
          tR.setTypeParser(1187, (e) => e),
          tR.setTypeParser(1182, (e) => e);
      }
    }
    function af(e, t, i, r) {
      return new Proxy(e, {
        get(e, n) {
          let s = e[n];
          return "function" != typeof s && ("object" != typeof s || null === s)
            ? s
            : r
              ? af(s, t, i)
              : "query" === n
                ? af(s, t, i, !0)
                : new Proxy(s, {
                    apply(e, r, s) {
                      let a = e.call(r, ...s);
                      return (
                        "object" == typeof a &&
                          null !== a &&
                          "setToken" in a &&
                          "function" == typeof a.setToken &&
                          a.setToken(t),
                        i(e, n, a)
                      );
                    },
                  });
        },
      });
    }
    class ah extends s7 {
      static [tM] = "NeonHttpDatabase";
      $withAuth(e) {
        return (
          (this.authToken = e),
          af(this, e, (t, i, r) =>
            "with" === i ? af(r, e, (e, t, i) => i) : r,
          )
        );
      }
      async batch(e) {
        return this.session.batch(e);
      }
    }
    function ap(e, t = {}) {
      let i,
        r,
        n = new sN({ casing: t.casing });
      if (
        (!0 === t.logger ? (i = new tq()) : !1 !== t.logger && (i = t.logger),
        t.schema)
      ) {
        let e = (function (e, t) {
          1 === Object.keys(e).length &&
            "default" in e &&
            !tB(e.default, ib) &&
            (e = e.default);
          let i = {},
            r = {},
            n = {};
          for (let [s, a] of Object.entries(e))
            if (tB(a, ib)) {
              let e = i$(a),
                t = r[e];
              for (let r of ((i[e] = s),
              (n[s] = {
                tsName: s,
                dbName: a[ib.Symbol.Name],
                schema: a[ib.Symbol.Schema],
                columns: a[ib.Symbol.Columns],
                relations: t?.relations ?? {},
                primaryKey: t?.primaryKey ?? [],
              }),
              Object.values(a[ib.Symbol.Columns])))
                r.primary && n[s].primaryKey.push(r);
              let o = a[ib.Symbol.ExtraConfigBuilder]?.(
                a[ib.Symbol.ExtraConfigColumns],
              );
              if (o)
                for (let e of Object.values(o))
                  tB(e, nH) && n[s].primaryKey.push(...e.columns);
            } else if (tB(a, sw)) {
              let e,
                s = i$(a.table),
                o = i[s];
              for (let [i, u] of Object.entries(a.config(t(a.table))))
                if (o) {
                  let t = n[o];
                  (t.relations[i] = u), e && t.primaryKey.push(...e);
                } else
                  s in r || (r[s] = { relations: {}, primaryKey: e }),
                    (r[s].relations[i] = u);
            }
          return { tables: n, tableNamesMap: i };
        })(t.schema, sE);
        r = {
          fullSchema: t.schema,
          schema: e.tables,
          tableNamesMap: e.tableNamesMap,
        };
      }
      let s = new ad(e, n, { logger: i, cache: t.cache }).createSession(r),
        a = new ah(n, s, r);
      return (
        (a.$client = e),
        (a.$cache = t.cache),
        a.$cache && (a.$cache.invalidate = t.cache?.onMutate),
        a
      );
    }
    function am(...e) {
      if ("string" == typeof e[0]) return ap(tN(e[0]), e[1]);
      if (
        (function (e) {
          if (
            "object" != typeof e ||
            null === e ||
            "Object" !== e.constructor.name
          )
            return !1;
          if ("logger" in e) {
            let t = typeof e.logger;
            return (
              "boolean" === t ||
              ("object" === t && "function" == typeof e.logger.logQuery) ||
              "undefined" === t
            );
          }
          if ("schema" in e) {
            let t = typeof e.schema;
            return "object" === t || "undefined" === t;
          }
          if ("casing" in e) {
            let t = typeof e.casing;
            return "string" === t || "undefined" === t;
          }
          if ("mode" in e)
            return (
              "default" === e.mode &&
              "planetscale" === e.mode &&
              void 0 === e.mode
            );
          if ("connection" in e) {
            let t = typeof e.connection;
            return "string" === t || "object" === t || "undefined" === t;
          }
          if ("client" in e) {
            let t = typeof e.client;
            return "object" === t || "function" === t || "undefined" === t;
          }
          return 0 === Object.keys(e).length;
        })(e[0])
      ) {
        let { connection: t, client: i, ...r } = e[0];
        if (i) return ap(i, r);
        if ("object" == typeof t) {
          let { connectionString: e, ...i } = t;
          return ap(tN(e, i), r);
        }
        return ap(tN(t), r);
      }
      return ap(e[0], e[1]);
    }
    ((am || (am = {})).mock = function (e) {
      return ap({}, e);
    }),
      e.s(
        [
          "categoryRelations",
          () => gM,
          "commentRelations",
          () => gQ,
          "postRelations",
          () => gF,
          "postTagRelations",
          () => gq,
          "tagRelations",
          () => gB,
          "userRelations",
          () => gR,
        ],
        10494,
      );
    let ag = {
        createdAt: nx("created_at", { withTimezone: !0 })
          .notNull()
          .defaultNow(),
        updatedAt: nx("updated_at", { withTimezone: !0 })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      av = nq("user", {
        id: np("id").primaryKey(),
        name: np("name").notNull(),
        email: np("email").notNull().unique(),
        emailVerified: re("email_verified").default(!1).notNull(),
        image: np("image"),
        createdAt: nx("created_at").defaultNow().notNull(),
        updatedAt: nx("updated_at")
          .defaultNow()
          .$onUpdate(() => new Date())
          .notNull(),
      }),
      ay = nq(
        "session",
        {
          id: np("id").primaryKey(),
          expiresAt: nx("expires_at").notNull(),
          token: np("token").notNull().unique(),
          createdAt: nx("created_at").defaultNow().notNull(),
          updatedAt: nx("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
          ipAddress: np("ip_address"),
          userAgent: np("user_agent"),
          userId: np("user_id")
            .notNull()
            .references(() => av.id, { onDelete: "cascade" }),
        },
        (e) => [nK("session_userId_idx").on(e.userId)],
      ),
      ab = nq(
        "account",
        {
          id: np("id").primaryKey(),
          accountId: np("account_id").notNull(),
          providerId: np("provider_id").notNull(),
          userId: np("user_id")
            .notNull()
            .references(() => av.id, { onDelete: "cascade" }),
          accessToken: np("access_token"),
          refreshToken: np("refresh_token"),
          idToken: np("id_token"),
          accessTokenExpiresAt: nx("access_token_expires_at"),
          refreshTokenExpiresAt: nx("refresh_token_expires_at"),
          scope: np("scope"),
          password: np("password"),
          createdAt: nx("created_at").defaultNow().notNull(),
          updatedAt: nx("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        },
        (e) => [nK("account_userId_idx").on(e.userId)],
      ),
      a_ = nq(
        "verification",
        {
          id: np("id").primaryKey(),
          identifier: np("identifier").notNull(),
          value: np("value").notNull(),
          expiresAt: nx("expires_at").notNull(),
          createdAt: nx("created_at").defaultNow().notNull(),
          updatedAt: nx("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
        },
        (e) => [nK("verification_identifier_idx").on(e.identifier)],
      ),
      a$ = nq(
        "rate_limit",
        {
          key: np("key").primaryKey(),
          count: rS("count").notNull(),
          expiresAt: nx("expires_at").notNull(),
          createdAt: nx("created_at").defaultNow().notNull(),
        },
        (e) => [nK("rate_limit_expires_at_idx").on(e.expiresAt)],
      ),
      ax = sI(av, ({ many: e }) => ({ sessions: e(ay), accounts: e(ab) })),
      aw = sI(ay, ({ one: e }) => ({
        user: e(av, { fields: [ay.userId], references: [av.id] }),
      })),
      aS = sI(ab, ({ one: e }) => ({
        user: e(av, { fields: [ab.userId], references: [av.id] }),
      }));
    e.s(
      [
        "account",
        0,
        ab,
        "accountRelations",
        0,
        aS,
        "rateLimit",
        0,
        a$,
        "session",
        0,
        ay,
        "sessionRelations",
        0,
        aw,
        "user",
        0,
        av,
        "userRelations",
        0,
        ax,
        "verification",
        0,
        a_,
      ],
      46568,
    );
    let ak = Object.freeze({ status: "aborted" });
    function aI(e, t, i) {
      function r(i, r) {
        if (
          (i._zod ||
            Object.defineProperty(i, "_zod", {
              value: { def: r, constr: a, traits: new Set() },
              enumerable: !1,
            }),
          i._zod.traits.has(e))
        )
          return;
        i._zod.traits.add(e), t(i, r);
        let n = a.prototype,
          s = Object.keys(n);
        for (let e = 0; e < s.length; e++) {
          let t = s[e];
          t in i || (i[t] = n[t].bind(i));
        }
      }
      let n = i?.Parent ?? Object;
      class s extends n {}
      function a(e) {
        var t;
        let n = i?.Parent ? new s() : this;
        for (let i of (r(n, e),
        (t = n._zod).deferred ?? (t.deferred = []),
        n._zod.deferred))
          i();
        return n;
      }
      return (
        Object.defineProperty(s, "name", { value: e }),
        Object.defineProperty(a, "init", { value: r }),
        Object.defineProperty(a, Symbol.hasInstance, {
          value: (t) =>
            (!!i?.Parent && t instanceof i.Parent) || t?._zod?.traits?.has(e),
        }),
        Object.defineProperty(a, "name", { value: e }),
        a
      );
    }
    let aE = Symbol("zod_brand");
    class aP extends Error {
      constructor() {
        super(
          "Encountered Promise during synchronous parse. Use .parseAsync() instead.",
        );
      }
    }
    class aN extends Error {
      constructor(e) {
        super(`Encountered unidirectional transform during encode: ${e}`),
          (this.name = "ZodEncodeError");
      }
    }
    (d = globalThis).__zod_globalConfig ?? (d.__zod_globalConfig = {});
    let aT = globalThis.__zod_globalConfig;
    function aO(e) {
      return e && Object.assign(aT, e), aT;
    }
    function az(e) {
      let t = Object.values(e).filter((e) => "number" == typeof e);
      return Object.entries(e)
        .filter(([e, i]) => -1 === t.indexOf(+e))
        .map(([e, t]) => t);
    }
    function aA(e, t = "|") {
      return e.map((e) => a1(e)).join(t);
    }
    function aU(e, t) {
      return "bigint" == typeof t ? t.toString() : t;
    }
    function aD(e) {
      return {
        get value() {
          {
            let t = e();
            return Object.defineProperty(this, "value", { value: t }), t;
          }
        },
      };
    }
    function aC(e) {
      return null == e;
    }
    function aj(e) {
      let t = +!!e.startsWith("^"),
        i = e.endsWith("$") ? e.length - 1 : e.length;
      return e.slice(t, i);
    }
    function aZ(e, t) {
      let i = e / t,
        r = Math.round(i),
        n = Number.EPSILON * Math.max(Math.abs(i), 1);
      return Math.abs(i - r) < n ? 0 : i - r;
    }
    e.s(
      [
        "$ZodAsyncError",
        0,
        aP,
        "$ZodEncodeError",
        0,
        aN,
        "$brand",
        0,
        aE,
        "$constructor",
        0,
        aI,
        "NEVER",
        0,
        ak,
        "config",
        0,
        aO,
        "globalConfig",
        0,
        aT,
      ],
      27438,
    );
    let aL = Symbol("evaluating");
    function aR(e, t, i) {
      let r;
      Object.defineProperty(e, t, {
        get() {
          if (r !== aL) return void 0 === r && ((r = aL), (r = i())), r;
        },
        set(i) {
          Object.defineProperty(e, t, { value: i });
        },
        configurable: !0,
      });
    }
    function aM(e, t, i) {
      Object.defineProperty(e, t, {
        value: i,
        writable: !0,
        enumerable: !0,
        configurable: !0,
      });
    }
    function aB(...e) {
      let t = {};
      for (let i of e) Object.assign(t, Object.getOwnPropertyDescriptors(i));
      return Object.defineProperties({}, t);
    }
    function aF(e) {
      return JSON.stringify(e);
    }
    function aq(e) {
      return e
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    let aQ =
      "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
    function aJ(e) {
      return "object" == typeof e && null !== e && !Array.isArray(e);
    }
    let aV = aD(() => {
      if (
        aT.jitless ||
        ("u" > typeof navigator && navigator?.userAgent?.includes("Cloudflare"))
      )
        return !1;
      try {
        return Function(""), !0;
      } catch (e) {
        return !1;
      }
    });
    function aW(e) {
      if (!1 === aJ(e)) return !1;
      let t = e.constructor;
      if (void 0 === t || "function" != typeof t) return !0;
      let i = t.prototype;
      return (
        !1 !== aJ(i) &&
        !1 !== Object.prototype.hasOwnProperty.call(i, "isPrototypeOf")
      );
    }
    function aG(e) {
      return aW(e)
        ? { ...e }
        : Array.isArray(e)
          ? [...e]
          : e instanceof Map
            ? new Map(e)
            : e instanceof Set
              ? new Set(e)
              : e;
    }
    let aK = new Set(["string", "number", "symbol"]),
      aX = new Set([
        "string",
        "number",
        "bigint",
        "boolean",
        "symbol",
        "undefined",
      ]);
    function aH(e) {
      return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function aY(e, t, i) {
      let r = new e._zod.constr(t ?? e._zod.def);
      return (!t || i?.parent) && (r._zod.parent = e), r;
    }
    function a0(e) {
      if (!e) return {};
      if ("string" == typeof e) return { error: () => e };
      if (e?.message !== void 0) {
        if (e?.error !== void 0)
          throw Error("Cannot specify both `message` and `error` params");
        e.error = e.message;
      }
      return (delete e.message, "string" == typeof e.error)
        ? { ...e, error: () => e.error }
        : e;
    }
    function a1(e) {
      return "bigint" == typeof e
        ? e.toString() + "n"
        : "string" == typeof e
          ? `"${e}"`
          : `${e}`;
    }
    function a6(e) {
      return Object.keys(e).filter(
        (t) =>
          "optional" === e[t]._zod.optin && "optional" === e[t]._zod.optout,
      );
    }
    let a4 = {
        safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
        int32: [-0x80000000, 0x7fffffff],
        uint32: [0, 0xffffffff],
        float32: [-34028234663852886e22, 34028234663852886e22],
        float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
      },
      a2 = {
        int64: [BigInt("-9223372036854775808"), BigInt("9223372036854775807")],
        uint64: [BigInt(0), BigInt("18446744073709551615")],
      };
    function a5(e, t = 0) {
      if (!0 === e.aborted) return !0;
      for (let i = t; i < e.issues.length; i++)
        if (e.issues[i]?.continue !== !0) return !0;
      return !1;
    }
    function a3(e, t = 0) {
      if (!0 === e.aborted) return !0;
      for (let i = t; i < e.issues.length; i++)
        if (e.issues[i]?.continue === !1) return !0;
      return !1;
    }
    function a8(e, t) {
      return t.map((t) => (t.path ?? (t.path = []), t.path.unshift(e), t));
    }
    function a9(e) {
      return "string" == typeof e ? e : e?.message;
    }
    function a7(e, t, i) {
      let r = e.message
          ? e.message
          : (a9(e.inst?._zod.def?.error?.(e)) ??
            a9(t?.error?.(e)) ??
            a9(i.customError?.(e)) ??
            a9(i.localeError?.(e)) ??
            "Invalid input"),
        { inst: n, continue: s, input: a, ...o } = e;
      return (
        o.path ?? (o.path = []),
        (o.message = r),
        t?.reportInput && (o.input = a),
        o
      );
    }
    function oe(e) {
      return e instanceof Set
        ? "set"
        : e instanceof Map
          ? "map"
          : e instanceof File
            ? "file"
            : "unknown";
    }
    function ot(e) {
      return Array.isArray(e)
        ? "array"
        : "string" == typeof e
          ? "string"
          : "unknown";
    }
    function oi(e) {
      let t = typeof e;
      switch (t) {
        case "number":
          return Number.isNaN(e) ? "nan" : "number";
        case "object":
          if (null === e) return "null";
          if (Array.isArray(e)) return "array";
          if (
            e &&
            Object.getPrototypeOf(e) !== Object.prototype &&
            "constructor" in e &&
            e.constructor
          )
            return e.constructor.name;
      }
      return t;
    }
    function or(...e) {
      let [t, i, r] = e;
      return "string" == typeof t
        ? { message: t, code: "custom", input: i, inst: r }
        : { ...t };
    }
    function on(e) {
      let t = atob(e),
        i = new Uint8Array(t.length);
      for (let e = 0; e < t.length; e++) i[e] = t.charCodeAt(e);
      return i;
    }
    function os(e) {
      let t = "";
      for (let i = 0; i < e.length; i++) t += String.fromCharCode(e[i]);
      return btoa(t);
    }
    function oa() {
      let e, t, i;
      return {
        localeError:
          ((e = {
            string: { unit: "characters", verb: "to have" },
            file: { unit: "bytes", verb: "to have" },
            array: { unit: "items", verb: "to have" },
            set: { unit: "items", verb: "to have" },
            map: { unit: "entries", verb: "to have" },
          }),
          (t = {
            regex: "input",
            email: "email address",
            url: "URL",
            emoji: "emoji",
            uuid: "UUID",
            uuidv4: "UUIDv4",
            uuidv6: "UUIDv6",
            nanoid: "nanoid",
            guid: "GUID",
            cuid: "cuid",
            cuid2: "cuid2",
            ulid: "ULID",
            xid: "XID",
            ksuid: "KSUID",
            datetime: "ISO datetime",
            date: "ISO date",
            time: "ISO time",
            duration: "ISO duration",
            ipv4: "IPv4 address",
            ipv6: "IPv6 address",
            mac: "MAC address",
            cidrv4: "IPv4 range",
            cidrv6: "IPv6 range",
            base64: "base64-encoded string",
            base64url: "base64url-encoded string",
            json_string: "JSON string",
            e164: "E.164 number",
            jwt: "JWT",
            template_literal: "input",
          }),
          (i = { nan: "NaN" }),
          (r) => {
            switch (r.code) {
              case "invalid_type": {
                let e = i[r.expected] ?? r.expected,
                  t = oi(r.input),
                  n = i[t] ?? t;
                return `Invalid input: expected ${e}, received ${n}`;
              }
              case "invalid_value":
                if (1 === r.values.length)
                  return `Invalid input: expected ${a1(r.values[0])}`;
                return `Invalid option: expected one of ${aA(r.values, "|")}`;
              case "too_big": {
                let t = r.inclusive ? "<=" : "<",
                  i = e[r.origin] ?? null;
                if (i)
                  return `Too big: expected ${r.origin ?? "value"} to have ${t}${r.maximum.toString()} ${i.unit ?? "elements"}`;
                return `Too big: expected ${r.origin ?? "value"} to be ${t}${r.maximum.toString()}`;
              }
              case "too_small": {
                let t = r.inclusive ? ">=" : ">",
                  i = e[r.origin] ?? null;
                if (i)
                  return `Too small: expected ${r.origin} to have ${t}${r.minimum.toString()} ${i.unit}`;
                return `Too small: expected ${r.origin} to be ${t}${r.minimum.toString()}`;
              }
              case "invalid_format":
                if ("starts_with" === r.format)
                  return `Invalid string: must start with "${r.prefix}"`;
                if ("ends_with" === r.format)
                  return `Invalid string: must end with "${r.suffix}"`;
                if ("includes" === r.format)
                  return `Invalid string: must include "${r.includes}"`;
                if ("regex" === r.format)
                  return `Invalid string: must match pattern ${r.pattern}`;
                return `Invalid ${t[r.format] ?? r.format}`;
              case "not_multiple_of":
                return `Invalid number: must be a multiple of ${r.divisor}`;
              case "unrecognized_keys":
                return `Unrecognized key${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
              case "invalid_key":
                return `Invalid key in ${r.origin}`;
              case "invalid_union":
                if (
                  r.options &&
                  Array.isArray(r.options) &&
                  r.options.length > 0
                ) {
                  let e = r.options.map((e) => `'${e}'`).join(" | ");
                  return `Invalid discriminator value. Expected ${e}`;
                }
                return "Invalid input";
              case "invalid_element":
                return `Invalid value in ${r.origin}`;
              default:
                return "Invalid input";
            }
          }),
      };
    }
    e.s(
      [
        "BIGINT_FORMAT_RANGES",
        0,
        a2,
        "Class",
        0,
        class {
          constructor(...e) {}
        },
        "NUMBER_FORMAT_RANGES",
        0,
        a4,
        "aborted",
        0,
        a5,
        "allowsEval",
        0,
        aV,
        "assert",
        0,
        function (e) {},
        "assertEqual",
        0,
        function (e) {
          return e;
        },
        "assertIs",
        0,
        function (e) {},
        "assertNever",
        0,
        function (e) {
          throw Error("Unexpected value in exhaustive check");
        },
        "assertNotEqual",
        0,
        function (e) {
          return e;
        },
        "assignProp",
        0,
        aM,
        "base64ToUint8Array",
        0,
        on,
        "base64urlToUint8Array",
        0,
        function (e) {
          let t = e.replace(/-/g, "+").replace(/_/g, "/"),
            i = "=".repeat((4 - (t.length % 4)) % 4);
          return on(t + i);
        },
        "cached",
        0,
        aD,
        "captureStackTrace",
        0,
        aQ,
        "cleanEnum",
        0,
        function (e) {
          return Object.entries(e)
            .filter(([e, t]) => Number.isNaN(Number.parseInt(e, 10)))
            .map((e) => e[1]);
        },
        "cleanRegex",
        0,
        aj,
        "clone",
        0,
        aY,
        "cloneDef",
        0,
        function (e) {
          return aB(e._zod.def);
        },
        "createTransparentProxy",
        0,
        function (e) {
          let t;
          return new Proxy(
            {},
            {
              get: (i, r, n) => (t ?? (t = e()), Reflect.get(t, r, n)),
              set: (i, r, n, s) => (t ?? (t = e()), Reflect.set(t, r, n, s)),
              has: (i, r) => (t ?? (t = e()), Reflect.has(t, r)),
              deleteProperty: (i, r) => (
                t ?? (t = e()), Reflect.deleteProperty(t, r)
              ),
              ownKeys: (i) => (t ?? (t = e()), Reflect.ownKeys(t)),
              getOwnPropertyDescriptor: (i, r) => (
                t ?? (t = e()), Reflect.getOwnPropertyDescriptor(t, r)
              ),
              defineProperty: (i, r, n) => (
                t ?? (t = e()), Reflect.defineProperty(t, r, n)
              ),
            },
          );
        },
        "defineLazy",
        0,
        aR,
        "esc",
        0,
        aF,
        "escapeRegex",
        0,
        aH,
        "explicitlyAborted",
        0,
        a3,
        "extend",
        0,
        function (e, t) {
          if (!aW(t))
            throw Error("Invalid input to extend: expected a plain object");
          let i = e._zod.def.checks;
          if (i && i.length > 0) {
            let i = e._zod.def.shape;
            for (let e in t)
              if (void 0 !== Object.getOwnPropertyDescriptor(i, e))
                throw Error(
                  "Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.",
                );
          }
          let r = aB(e._zod.def, {
            get shape() {
              let i = { ...e._zod.def.shape, ...t };
              return aM(this, "shape", i), i;
            },
          });
          return aY(e, r);
        },
        "finalizeIssue",
        0,
        a7,
        "floatSafeRemainder",
        0,
        aZ,
        "getElementAtPath",
        0,
        function (e, t) {
          return t ? t.reduce((e, t) => e?.[t], e) : e;
        },
        "getEnumValues",
        0,
        az,
        "getLengthableOrigin",
        0,
        ot,
        "getParsedType",
        0,
        (e) => {
          let t = typeof e;
          switch (t) {
            case "undefined":
              return "undefined";
            case "string":
              return "string";
            case "number":
              return Number.isNaN(e) ? "nan" : "number";
            case "boolean":
              return "boolean";
            case "function":
              return "function";
            case "bigint":
              return "bigint";
            case "symbol":
              return "symbol";
            case "object":
              if (Array.isArray(e)) return "array";
              if (null === e) return "null";
              if (
                e.then &&
                "function" == typeof e.then &&
                e.catch &&
                "function" == typeof e.catch
              )
                return "promise";
              if ("u" > typeof Map && e instanceof Map) return "map";
              if ("u" > typeof Set && e instanceof Set) return "set";
              if ("u" > typeof Date && e instanceof Date) return "date";
              if ("u" > typeof File && e instanceof File) return "file";
              return "object";
            default:
              throw Error(`Unknown data type: ${t}`);
          }
        },
        "getSizableOrigin",
        0,
        oe,
        "hexToUint8Array",
        0,
        function (e) {
          let t = e.replace(/^0x/, "");
          if (t.length % 2 != 0) throw Error("Invalid hex string length");
          let i = new Uint8Array(t.length / 2);
          for (let e = 0; e < t.length; e += 2)
            i[e / 2] = Number.parseInt(t.slice(e, e + 2), 16);
          return i;
        },
        "isObject",
        0,
        aJ,
        "isPlainObject",
        0,
        aW,
        "issue",
        0,
        or,
        "joinValues",
        0,
        aA,
        "jsonStringifyReplacer",
        0,
        aU,
        "merge",
        0,
        function (e, t) {
          if (e._zod.def.checks?.length)
            throw Error(
              ".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.",
            );
          let i = aB(e._zod.def, {
            get shape() {
              let i = { ...e._zod.def.shape, ...t._zod.def.shape };
              return aM(this, "shape", i), i;
            },
            get catchall() {
              return t._zod.def.catchall;
            },
            checks: t._zod.def.checks ?? [],
          });
          return aY(e, i);
        },
        "mergeDefs",
        0,
        aB,
        "normalizeParams",
        0,
        a0,
        "nullish",
        0,
        aC,
        "numKeys",
        0,
        function (e) {
          let t = 0;
          for (let i in e) Object.prototype.hasOwnProperty.call(e, i) && t++;
          return t;
        },
        "objectClone",
        0,
        function (e) {
          return Object.create(
            Object.getPrototypeOf(e),
            Object.getOwnPropertyDescriptors(e),
          );
        },
        "omit",
        0,
        function (e, t) {
          let i = e._zod.def,
            r = i.checks;
          if (r && r.length > 0)
            throw Error(
              ".omit() cannot be used on object schemas containing refinements",
            );
          let n = aB(e._zod.def, {
            get shape() {
              let r = { ...e._zod.def.shape };
              for (let e in t) {
                if (!(e in i.shape)) throw Error(`Unrecognized key: "${e}"`);
                t[e] && delete r[e];
              }
              return aM(this, "shape", r), r;
            },
            checks: [],
          });
          return aY(e, n);
        },
        "optionalKeys",
        0,
        a6,
        "parsedType",
        0,
        oi,
        "partial",
        0,
        function (e, t, i) {
          let r = t._zod.def.checks;
          if (r && r.length > 0)
            throw Error(
              ".partial() cannot be used on object schemas containing refinements",
            );
          let n = aB(t._zod.def, {
            get shape() {
              let r = t._zod.def.shape,
                n = { ...r };
              if (i)
                for (let t in i) {
                  if (!(t in r)) throw Error(`Unrecognized key: "${t}"`);
                  i[t] &&
                    (n[t] = e
                      ? new e({ type: "optional", innerType: r[t] })
                      : r[t]);
                }
              else
                for (let t in r)
                  n[t] = e
                    ? new e({ type: "optional", innerType: r[t] })
                    : r[t];
              return aM(this, "shape", n), n;
            },
            checks: [],
          });
          return aY(t, n);
        },
        "pick",
        0,
        function (e, t) {
          let i = e._zod.def,
            r = i.checks;
          if (r && r.length > 0)
            throw Error(
              ".pick() cannot be used on object schemas containing refinements",
            );
          let n = aB(e._zod.def, {
            get shape() {
              let e = {};
              for (let r in t) {
                if (!(r in i.shape)) throw Error(`Unrecognized key: "${r}"`);
                t[r] && (e[r] = i.shape[r]);
              }
              return aM(this, "shape", e), e;
            },
            checks: [],
          });
          return aY(e, n);
        },
        "prefixIssues",
        0,
        a8,
        "primitiveTypes",
        0,
        aX,
        "promiseAllObject",
        0,
        function (e) {
          let t = Object.keys(e);
          return Promise.all(t.map((t) => e[t])).then((e) => {
            let i = {};
            for (let r = 0; r < t.length; r++) i[t[r]] = e[r];
            return i;
          });
        },
        "propertyKeyTypes",
        0,
        aK,
        "randomString",
        0,
        function (e = 10) {
          let t = "abcdefghijklmnopqrstuvwxyz",
            i = "";
          for (let r = 0; r < e; r++)
            i += t[Math.floor(Math.random() * t.length)];
          return i;
        },
        "required",
        0,
        function (e, t, i) {
          let r = aB(t._zod.def, {
            get shape() {
              let r = t._zod.def.shape,
                n = { ...r };
              if (i)
                for (let t in i) {
                  if (!(t in n)) throw Error(`Unrecognized key: "${t}"`);
                  i[t] &&
                    (n[t] = new e({ type: "nonoptional", innerType: r[t] }));
                }
              else
                for (let t in r)
                  n[t] = new e({ type: "nonoptional", innerType: r[t] });
              return aM(this, "shape", n), n;
            },
          });
          return aY(t, r);
        },
        "safeExtend",
        0,
        function (e, t) {
          if (!aW(t))
            throw Error("Invalid input to safeExtend: expected a plain object");
          let i = aB(e._zod.def, {
            get shape() {
              let i = { ...e._zod.def.shape, ...t };
              return aM(this, "shape", i), i;
            },
          });
          return aY(e, i);
        },
        "shallowClone",
        0,
        aG,
        "slugify",
        0,
        aq,
        "stringifyPrimitive",
        0,
        a1,
        "uint8ArrayToBase64",
        0,
        os,
        "uint8ArrayToBase64url",
        0,
        function (e) {
          return os(e)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        },
        "uint8ArrayToHex",
        0,
        function (e) {
          return Array.from(e)
            .map((e) => e.toString(16).padStart(2, "0"))
            .join("");
        },
        "unwrapMessage",
        0,
        a9,
      ],
      86618,
    ),
      aO(oa()),
      e.s([], 54048),
      e.i(54048),
      e.s([], 82811),
      e.i(82811),
      e.i(27438);
    let oo = (e, t) => {
        (e.name = "$ZodError"),
          Object.defineProperty(e, "_zod", { value: e._zod, enumerable: !1 }),
          Object.defineProperty(e, "issues", { value: t, enumerable: !1 }),
          (e.message = JSON.stringify(t, aU, 2)),
          Object.defineProperty(e, "toString", {
            value: () => e.message,
            enumerable: !1,
          });
      },
      ou = aI("$ZodError", oo),
      ol = aI("$ZodError", oo, { Parent: Error });
    function oc(e, t = (e) => e.message) {
      let i = {},
        r = [];
      for (let n of e.issues)
        n.path.length > 0
          ? ((i[n.path[0]] = i[n.path[0]] || []), i[n.path[0]].push(t(n)))
          : r.push(t(n));
      return { formErrors: r, fieldErrors: i };
    }
    function od(e, t = (e) => e.message) {
      let i = { _errors: [] },
        r = (e, n = []) => {
          for (let s of e.issues)
            if ("invalid_union" === s.code && s.errors.length)
              s.errors.map((e) => r({ issues: e }, [...n, ...s.path]));
            else if ("invalid_key" === s.code)
              r({ issues: s.issues }, [...n, ...s.path]);
            else if ("invalid_element" === s.code)
              r({ issues: s.issues }, [...n, ...s.path]);
            else {
              let e = [...n, ...s.path];
              if (0 === e.length) i._errors.push(t(s));
              else {
                let r = i,
                  n = 0;
                for (; n < e.length; ) {
                  let i = e[n];
                  n === e.length - 1
                    ? ((r[i] = r[i] || { _errors: [] }),
                      r[i]._errors.push(t(s)))
                    : (r[i] = r[i] || { _errors: [] }),
                    (r = r[i]),
                    n++;
                }
              }
            }
        };
      return r(e), i;
    }
    function of(e, t = (e) => e.message) {
      let i = { errors: [] },
        r = (e, n = []) => {
          var s, a;
          for (let o of e.issues)
            if ("invalid_union" === o.code && o.errors.length)
              o.errors.map((e) => r({ issues: e }, [...n, ...o.path]));
            else if ("invalid_key" === o.code)
              r({ issues: o.issues }, [...n, ...o.path]);
            else if ("invalid_element" === o.code)
              r({ issues: o.issues }, [...n, ...o.path]);
            else {
              let e = [...n, ...o.path];
              if (0 === e.length) {
                i.errors.push(t(o));
                continue;
              }
              let r = i,
                u = 0;
              for (; u < e.length; ) {
                let i = e[u],
                  n = u === e.length - 1;
                "string" == typeof i
                  ? (r.properties ?? (r.properties = {}),
                    (s = r.properties)[i] ?? (s[i] = { errors: [] }),
                    (r = r.properties[i]))
                  : (r.items ?? (r.items = []),
                    (a = r.items)[i] ?? (a[i] = { errors: [] }),
                    (r = r.items[i])),
                  n && r.errors.push(t(o)),
                  u++;
              }
            }
        };
      return r(e), i;
    }
    function oh(e) {
      let t = [];
      for (let i of e.map((e) => ("object" == typeof e ? e.key : e)))
        "number" == typeof i
          ? t.push(`[${i}]`)
          : "symbol" == typeof i
            ? t.push(`[${JSON.stringify(String(i))}]`)
            : /[^\w$]/.test(i)
              ? t.push(`[${JSON.stringify(i)}]`)
              : (t.length && t.push("."), t.push(i));
      return t.join("");
    }
    function op(e) {
      let t = [];
      for (let i of [...e.issues].sort(
        (e, t) => (e.path ?? []).length - (t.path ?? []).length,
      ))
        t.push(`✖ ${i.message}`),
          i.path?.length && t.push(`  → at ${oh(i.path)}`);
      return t.join("\n");
    }
    e.s(
      [
        "$ZodError",
        0,
        ou,
        "$ZodRealError",
        0,
        ol,
        "flattenError",
        0,
        oc,
        "formatError",
        0,
        od,
        "prettifyError",
        0,
        op,
        "toDotPath",
        0,
        oh,
        "treeifyError",
        0,
        of,
      ],
      67021,
    );
    let om = (e) => (t, i, r, n) => {
        let s = r ? { ...r, async: !1 } : { async: !1 },
          a = t._zod.run({ value: i, issues: [] }, s);
        if (a instanceof Promise) throw new aP();
        if (a.issues.length) {
          let t = new (n?.Err ?? e)(a.issues.map((e) => a7(e, s, aO())));
          throw (aQ(t, n?.callee), t);
        }
        return a.value;
      },
      og = om(ol),
      ov = (e) => async (t, i, r, n) => {
        let s = r ? { ...r, async: !0 } : { async: !0 },
          a = t._zod.run({ value: i, issues: [] }, s);
        if ((a instanceof Promise && (a = await a), a.issues.length)) {
          let t = new (n?.Err ?? e)(a.issues.map((e) => a7(e, s, aO())));
          throw (aQ(t, n?.callee), t);
        }
        return a.value;
      },
      oy = ov(ol),
      ob = (e) => (t, i, r) => {
        let n = r ? { ...r, async: !1 } : { async: !1 },
          s = t._zod.run({ value: i, issues: [] }, n);
        if (s instanceof Promise) throw new aP();
        return s.issues.length
          ? {
              success: !1,
              error: new (e ?? ou)(s.issues.map((e) => a7(e, n, aO()))),
            }
          : { success: !0, data: s.value };
      },
      o_ = ob(ol),
      o$ = (e) => async (t, i, r) => {
        let n = r ? { ...r, async: !0 } : { async: !0 },
          s = t._zod.run({ value: i, issues: [] }, n);
        return (
          s instanceof Promise && (s = await s),
          s.issues.length
            ? { success: !1, error: new e(s.issues.map((e) => a7(e, n, aO()))) }
            : { success: !0, data: s.value }
        );
      },
      ox = o$(ol),
      ow = (e) => (t, i, r) => {
        let n = r ? { ...r, direction: "backward" } : { direction: "backward" };
        return om(e)(t, i, n);
      },
      oS = ow(ol),
      ok = (e) => (t, i, r) => om(e)(t, i, r),
      oI = ok(ol),
      oE = (e) => async (t, i, r) => {
        let n = r ? { ...r, direction: "backward" } : { direction: "backward" };
        return ov(e)(t, i, n);
      },
      oP = oE(ol),
      oN = (e) => async (t, i, r) => ov(e)(t, i, r),
      oT = oN(ol),
      oO = (e) => (t, i, r) => {
        let n = r ? { ...r, direction: "backward" } : { direction: "backward" };
        return ob(e)(t, i, n);
      },
      oz = oO(ol),
      oA = (e) => (t, i, r) => ob(e)(t, i, r),
      oU = oA(ol),
      oD = (e) => async (t, i, r) => {
        let n = r ? { ...r, direction: "backward" } : { direction: "backward" };
        return o$(e)(t, i, n);
      },
      oC = oD(ol),
      oj = (e) => async (t, i, r) => o$(e)(t, i, r),
      oZ = oj(ol);
    e.s(
      [
        "_decode",
        0,
        ok,
        "_decodeAsync",
        0,
        oN,
        "_encode",
        0,
        ow,
        "_encodeAsync",
        0,
        oE,
        "_parse",
        0,
        om,
        "_parseAsync",
        0,
        ov,
        "_safeDecode",
        0,
        oA,
        "_safeDecodeAsync",
        0,
        oj,
        "_safeEncode",
        0,
        oO,
        "_safeEncodeAsync",
        0,
        oD,
        "_safeParse",
        0,
        ob,
        "_safeParseAsync",
        0,
        o$,
        "decode",
        0,
        oI,
        "decodeAsync",
        0,
        oT,
        "encode",
        0,
        oS,
        "encodeAsync",
        0,
        oP,
        "parse",
        0,
        og,
        "parseAsync",
        0,
        oy,
        "safeDecode",
        0,
        oU,
        "safeDecodeAsync",
        0,
        oZ,
        "safeEncode",
        0,
        oz,
        "safeEncodeAsync",
        0,
        oC,
        "safeParse",
        0,
        o_,
        "safeParseAsync",
        0,
        ox,
      ],
      15143,
    ),
      e.i(15143),
      e.i(67021);
    let oL = /^[cC][0-9a-z]{6,}$/,
      oR = /^[0-9a-z]+$/,
      oM = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/,
      oB = /^[0-9a-vA-V]{20}$/,
      oF = /^[A-Za-z0-9]{27}$/,
      oq = /^[a-zA-Z0-9_-]{21}$/,
      oQ =
        /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/,
      oJ =
        /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
      oV = (e) =>
        e
          ? RegExp(
              `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`,
            )
          : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/,
      oW = oV(4),
      oG = oV(6),
      oK = oV(7),
      oX =
        /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/,
      oH = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
    function oY() {
      return RegExp(
        "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",
        "u",
      );
    }
    let o0 =
        /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
      o1 =
        /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/,
      o6 = (e) => {
        let t = aH(e ?? ":");
        return RegExp(
          `^(?:[0-9A-F]{2}${t}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${t}){5}[0-9a-f]{2}$`,
        );
      },
      o4 =
        /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,
      o2 =
        /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
      o5 =
        /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,
      o3 = /^[A-Za-z0-9_-]*$/,
      o8 = /^https?$/,
      o9 = /^\+[1-9]\d{6,14}$/,
      o7 =
        "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))",
      ue = RegExp(`^${o7}$`);
    function ut(e) {
      let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
      return "number" == typeof e.precision
        ? -1 === e.precision
          ? `${t}`
          : 0 === e.precision
            ? `${t}:[0-5]\\d`
            : `${t}:[0-5]\\d\\.\\d{${e.precision}}`
        : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    }
    function ui(e) {
      return RegExp(`^${ut(e)}$`);
    }
    function ur(e) {
      let t = ut({ precision: e.precision }),
        i = ["Z"];
      e.local && i.push(""),
        e.offset && i.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
      let r = `${t}(?:${i.join("|")})`;
      return RegExp(`^${o7}T(?:${r})$`);
    }
    let un = (e) => {
        let t = e
          ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}`
          : "[\\s\\S]*";
        return RegExp(`^${t}$`);
      },
      us = /^-?\d+n?$/,
      ua = /^-?\d+$/,
      uo = /^-?\d+(?:\.\d+)?$/,
      uu = /^(?:true|false)$/i,
      ul = /^null$/i,
      uc = /^undefined$/i,
      ud = /^[^A-Z]*$/,
      uf = /^[^a-z]*$/;
    function uh(e, t) {
      return RegExp(`^[A-Za-z0-9+/]{${e}}${t}$`);
    }
    function up(e) {
      return RegExp(`^[A-Za-z0-9_-]{${e}}$`);
    }
    let um = uh(22, "=="),
      ug = up(22),
      uv = uh(27, "="),
      uy = up(27),
      ub = uh(43, "="),
      u_ = up(43),
      u$ = uh(64, ""),
      ux = up(64),
      uw = uh(86, "=="),
      uS = up(86);
    e.s(
      [
        "base64",
        0,
        o5,
        "base64url",
        0,
        o3,
        "bigint",
        0,
        us,
        "boolean",
        0,
        uu,
        "browserEmail",
        0,
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        "cidrv4",
        0,
        o4,
        "cidrv6",
        0,
        o2,
        "cuid",
        0,
        oL,
        "cuid2",
        0,
        oR,
        "date",
        0,
        ue,
        "datetime",
        0,
        ur,
        "domain",
        0,
        /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
        "duration",
        0,
        oQ,
        "e164",
        0,
        o9,
        "email",
        0,
        oX,
        "emoji",
        0,
        oY,
        "extendedDuration",
        0,
        /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,
        "guid",
        0,
        oJ,
        "hex",
        0,
        /^[0-9a-fA-F]*$/,
        "hostname",
        0,
        /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/,
        "html5Email",
        0,
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        "httpProtocol",
        0,
        o8,
        "idnEmail",
        0,
        oH,
        "integer",
        0,
        ua,
        "ipv4",
        0,
        o0,
        "ipv6",
        0,
        o1,
        "ksuid",
        0,
        oF,
        "lowercase",
        0,
        ud,
        "mac",
        0,
        o6,
        "md5_base64",
        0,
        um,
        "md5_base64url",
        0,
        ug,
        "md5_hex",
        0,
        /^[0-9a-fA-F]{32}$/,
        "nanoid",
        0,
        oq,
        "null",
        0,
        ul,
        "number",
        0,
        uo,
        "rfc5322Email",
        0,
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "sha1_base64",
        0,
        uv,
        "sha1_base64url",
        0,
        uy,
        "sha1_hex",
        0,
        /^[0-9a-fA-F]{40}$/,
        "sha256_base64",
        0,
        ub,
        "sha256_base64url",
        0,
        u_,
        "sha256_hex",
        0,
        /^[0-9a-fA-F]{64}$/,
        "sha384_base64",
        0,
        u$,
        "sha384_base64url",
        0,
        ux,
        "sha384_hex",
        0,
        /^[0-9a-fA-F]{96}$/,
        "sha512_base64",
        0,
        uw,
        "sha512_base64url",
        0,
        uS,
        "sha512_hex",
        0,
        /^[0-9a-fA-F]{128}$/,
        "string",
        0,
        un,
        "time",
        0,
        ui,
        "ulid",
        0,
        oM,
        "undefined",
        0,
        uc,
        "unicodeEmail",
        0,
        oH,
        "uppercase",
        0,
        uf,
        "uuid",
        0,
        oV,
        "uuid4",
        0,
        oW,
        "uuid6",
        0,
        oG,
        "uuid7",
        0,
        oK,
        "xid",
        0,
        oB,
      ],
      21131,
    );
    let uk = aI("$ZodCheck", (e, t) => {
        var i;
        e._zod ?? (e._zod = {}),
          (e._zod.def = t),
          (i = e._zod).onattach ?? (i.onattach = []);
      }),
      uI = { number: "number", bigint: "bigint", object: "date" },
      uE = aI("$ZodCheckLessThan", (e, t) => {
        uk.init(e, t);
        let i = uI[typeof t.value];
        e._zod.onattach.push((e) => {
          let i = e._zod.bag,
            r = (t.inclusive ? i.maximum : i.exclusiveMaximum) ?? 1 / 0;
          t.value < r &&
            (t.inclusive
              ? (i.maximum = t.value)
              : (i.exclusiveMaximum = t.value));
        }),
          (e._zod.check = (r) => {
            (t.inclusive ? r.value <= t.value : r.value < t.value) ||
              r.issues.push({
                origin: i,
                code: "too_big",
                maximum:
                  "object" == typeof t.value ? t.value.getTime() : t.value,
                input: r.value,
                inclusive: t.inclusive,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uP = aI("$ZodCheckGreaterThan", (e, t) => {
        uk.init(e, t);
        let i = uI[typeof t.value];
        e._zod.onattach.push((e) => {
          let i = e._zod.bag,
            r = (t.inclusive ? i.minimum : i.exclusiveMinimum) ?? -1 / 0;
          t.value > r &&
            (t.inclusive
              ? (i.minimum = t.value)
              : (i.exclusiveMinimum = t.value));
        }),
          (e._zod.check = (r) => {
            (t.inclusive ? r.value >= t.value : r.value > t.value) ||
              r.issues.push({
                origin: i,
                code: "too_small",
                minimum:
                  "object" == typeof t.value ? t.value.getTime() : t.value,
                input: r.value,
                inclusive: t.inclusive,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uN = aI("$ZodCheckMultipleOf", (e, t) => {
        uk.init(e, t),
          e._zod.onattach.push((e) => {
            var i;
            (i = e._zod.bag).multipleOf ?? (i.multipleOf = t.value);
          }),
          (e._zod.check = (i) => {
            if (typeof i.value != typeof t.value)
              throw Error("Cannot mix number and bigint in multiple_of check.");
            ("bigint" == typeof i.value
              ? i.value % t.value === BigInt(0)
              : 0 === aZ(i.value, t.value)) ||
              i.issues.push({
                origin: typeof i.value,
                code: "not_multiple_of",
                divisor: t.value,
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uT = aI("$ZodCheckNumberFormat", (e, t) => {
        uk.init(e, t), (t.format = t.format || "float64");
        let i = t.format?.includes("int"),
          r = i ? "int" : "number",
          [n, s] = a4[t.format];
        e._zod.onattach.push((e) => {
          let r = e._zod.bag;
          (r.format = t.format),
            (r.minimum = n),
            (r.maximum = s),
            i && (r.pattern = ua);
        }),
          (e._zod.check = (a) => {
            let o = a.value;
            if (i) {
              if (!Number.isInteger(o))
                return void a.issues.push({
                  expected: r,
                  format: t.format,
                  code: "invalid_type",
                  continue: !1,
                  input: o,
                  inst: e,
                });
              if (!Number.isSafeInteger(o))
                return void (o > 0
                  ? a.issues.push({
                      input: o,
                      code: "too_big",
                      maximum: Number.MAX_SAFE_INTEGER,
                      note: "Integers must be within the safe integer range.",
                      inst: e,
                      origin: r,
                      inclusive: !0,
                      continue: !t.abort,
                    })
                  : a.issues.push({
                      input: o,
                      code: "too_small",
                      minimum: Number.MIN_SAFE_INTEGER,
                      note: "Integers must be within the safe integer range.",
                      inst: e,
                      origin: r,
                      inclusive: !0,
                      continue: !t.abort,
                    }));
            }
            o < n &&
              a.issues.push({
                origin: "number",
                input: o,
                code: "too_small",
                minimum: n,
                inclusive: !0,
                inst: e,
                continue: !t.abort,
              }),
              o > s &&
                a.issues.push({
                  origin: "number",
                  input: o,
                  code: "too_big",
                  maximum: s,
                  inclusive: !0,
                  inst: e,
                  continue: !t.abort,
                });
          });
      }),
      uO = aI("$ZodCheckBigIntFormat", (e, t) => {
        uk.init(e, t);
        let [i, r] = a2[t.format];
        e._zod.onattach.push((e) => {
          let n = e._zod.bag;
          (n.format = t.format), (n.minimum = i), (n.maximum = r);
        }),
          (e._zod.check = (n) => {
            let s = n.value;
            s < i &&
              n.issues.push({
                origin: "bigint",
                input: s,
                code: "too_small",
                minimum: i,
                inclusive: !0,
                inst: e,
                continue: !t.abort,
              }),
              s > r &&
                n.issues.push({
                  origin: "bigint",
                  input: s,
                  code: "too_big",
                  maximum: r,
                  inclusive: !0,
                  inst: e,
                  continue: !t.abort,
                });
          });
      }),
      uz = aI("$ZodCheckMaxSize", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.size;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag.maximum ?? 1 / 0;
            t.maximum < i && (e._zod.bag.maximum = t.maximum);
          }),
          (e._zod.check = (i) => {
            let r = i.value;
            r.size <= t.maximum ||
              i.issues.push({
                origin: oe(r),
                code: "too_big",
                maximum: t.maximum,
                inclusive: !0,
                input: r,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uA = aI("$ZodCheckMinSize", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.size;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag.minimum ?? -1 / 0;
            t.minimum > i && (e._zod.bag.minimum = t.minimum);
          }),
          (e._zod.check = (i) => {
            let r = i.value;
            r.size >= t.minimum ||
              i.issues.push({
                origin: oe(r),
                code: "too_small",
                minimum: t.minimum,
                inclusive: !0,
                input: r,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uU = aI("$ZodCheckSizeEquals", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.size;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag;
            (i.minimum = t.size), (i.maximum = t.size), (i.size = t.size);
          }),
          (e._zod.check = (i) => {
            let r = i.value,
              n = r.size;
            if (n === t.size) return;
            let s = n > t.size;
            i.issues.push({
              origin: oe(r),
              ...(s
                ? { code: "too_big", maximum: t.size }
                : { code: "too_small", minimum: t.size }),
              inclusive: !0,
              exact: !0,
              input: i.value,
              inst: e,
              continue: !t.abort,
            });
          });
      }),
      uD = aI("$ZodCheckMaxLength", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.length;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag.maximum ?? 1 / 0;
            t.maximum < i && (e._zod.bag.maximum = t.maximum);
          }),
          (e._zod.check = (i) => {
            let r = i.value;
            if (r.length <= t.maximum) return;
            let n = ot(r);
            i.issues.push({
              origin: n,
              code: "too_big",
              maximum: t.maximum,
              inclusive: !0,
              input: r,
              inst: e,
              continue: !t.abort,
            });
          });
      }),
      uC = aI("$ZodCheckMinLength", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.length;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag.minimum ?? -1 / 0;
            t.minimum > i && (e._zod.bag.minimum = t.minimum);
          }),
          (e._zod.check = (i) => {
            let r = i.value;
            if (r.length >= t.minimum) return;
            let n = ot(r);
            i.issues.push({
              origin: n,
              code: "too_small",
              minimum: t.minimum,
              inclusive: !0,
              input: r,
              inst: e,
              continue: !t.abort,
            });
          });
      }),
      uj = aI("$ZodCheckLengthEquals", (e, t) => {
        var i;
        uk.init(e, t),
          (i = e._zod.def).when ??
            (i.when = (e) => {
              let t = e.value;
              return !aC(t) && void 0 !== t.length;
            }),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag;
            (i.minimum = t.length),
              (i.maximum = t.length),
              (i.length = t.length);
          }),
          (e._zod.check = (i) => {
            let r = i.value,
              n = r.length;
            if (n === t.length) return;
            let s = ot(r),
              a = n > t.length;
            i.issues.push({
              origin: s,
              ...(a
                ? { code: "too_big", maximum: t.length }
                : { code: "too_small", minimum: t.length }),
              inclusive: !0,
              exact: !0,
              input: i.value,
              inst: e,
              continue: !t.abort,
            });
          });
      }),
      uZ = aI("$ZodCheckStringFormat", (e, t) => {
        var i, r;
        uk.init(e, t),
          e._zod.onattach.push((e) => {
            let i = e._zod.bag;
            (i.format = t.format),
              t.pattern &&
                (i.patterns ?? (i.patterns = new Set()),
                i.patterns.add(t.pattern));
          }),
          t.pattern
            ? ((i = e._zod).check ??
              (i.check = (i) => {
                (t.pattern.lastIndex = 0),
                  t.pattern.test(i.value) ||
                    i.issues.push({
                      origin: "string",
                      code: "invalid_format",
                      format: t.format,
                      input: i.value,
                      ...(t.pattern ? { pattern: t.pattern.toString() } : {}),
                      inst: e,
                      continue: !t.abort,
                    });
              }))
            : ((r = e._zod).check ?? (r.check = () => {}));
      }),
      uL = aI("$ZodCheckRegex", (e, t) => {
        uZ.init(e, t),
          (e._zod.check = (i) => {
            (t.pattern.lastIndex = 0),
              t.pattern.test(i.value) ||
                i.issues.push({
                  origin: "string",
                  code: "invalid_format",
                  format: "regex",
                  input: i.value,
                  pattern: t.pattern.toString(),
                  inst: e,
                  continue: !t.abort,
                });
          });
      }),
      uR = aI("$ZodCheckLowerCase", (e, t) => {
        t.pattern ?? (t.pattern = ud), uZ.init(e, t);
      }),
      uM = aI("$ZodCheckUpperCase", (e, t) => {
        t.pattern ?? (t.pattern = uf), uZ.init(e, t);
      }),
      uB = aI("$ZodCheckIncludes", (e, t) => {
        uk.init(e, t);
        let i = aH(t.includes),
          r = new RegExp(
            "number" == typeof t.position ? `^.{${t.position}}${i}` : i,
          );
        (t.pattern = r),
          e._zod.onattach.push((e) => {
            let t = e._zod.bag;
            t.patterns ?? (t.patterns = new Set()), t.patterns.add(r);
          }),
          (e._zod.check = (i) => {
            i.value.includes(t.includes, t.position) ||
              i.issues.push({
                origin: "string",
                code: "invalid_format",
                format: "includes",
                includes: t.includes,
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uF = aI("$ZodCheckStartsWith", (e, t) => {
        uk.init(e, t);
        let i = RegExp(`^${aH(t.prefix)}.*`);
        t.pattern ?? (t.pattern = i),
          e._zod.onattach.push((e) => {
            let t = e._zod.bag;
            t.patterns ?? (t.patterns = new Set()), t.patterns.add(i);
          }),
          (e._zod.check = (i) => {
            i.value.startsWith(t.prefix) ||
              i.issues.push({
                origin: "string",
                code: "invalid_format",
                format: "starts_with",
                prefix: t.prefix,
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uq = aI("$ZodCheckEndsWith", (e, t) => {
        uk.init(e, t);
        let i = RegExp(`.*${aH(t.suffix)}$`);
        t.pattern ?? (t.pattern = i),
          e._zod.onattach.push((e) => {
            let t = e._zod.bag;
            t.patterns ?? (t.patterns = new Set()), t.patterns.add(i);
          }),
          (e._zod.check = (i) => {
            i.value.endsWith(t.suffix) ||
              i.issues.push({
                origin: "string",
                code: "invalid_format",
                format: "ends_with",
                suffix: t.suffix,
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      });
    function uQ(e, t, i) {
      e.issues.length && t.issues.push(...a8(i, e.issues));
    }
    let uJ = aI("$ZodCheckProperty", (e, t) => {
        uk.init(e, t),
          (e._zod.check = (e) => {
            let i = t.schema._zod.run(
              { value: e.value[t.property], issues: [] },
              {},
            );
            if (i instanceof Promise)
              return i.then((i) => uQ(i, e, t.property));
            uQ(i, e, t.property);
          });
      }),
      uV = aI("$ZodCheckMimeType", (e, t) => {
        uk.init(e, t);
        let i = new Set(t.mime);
        e._zod.onattach.push((e) => {
          e._zod.bag.mime = t.mime;
        }),
          (e._zod.check = (r) => {
            i.has(r.value.type) ||
              r.issues.push({
                code: "invalid_value",
                values: t.mime,
                input: r.value.type,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      uW = aI("$ZodCheckOverwrite", (e, t) => {
        uk.init(e, t),
          (e._zod.check = (e) => {
            e.value = t.tx(e.value);
          });
      });
    e.s(
      [
        "$ZodCheck",
        0,
        uk,
        "$ZodCheckBigIntFormat",
        0,
        uO,
        "$ZodCheckEndsWith",
        0,
        uq,
        "$ZodCheckGreaterThan",
        0,
        uP,
        "$ZodCheckIncludes",
        0,
        uB,
        "$ZodCheckLengthEquals",
        0,
        uj,
        "$ZodCheckLessThan",
        0,
        uE,
        "$ZodCheckLowerCase",
        0,
        uR,
        "$ZodCheckMaxLength",
        0,
        uD,
        "$ZodCheckMaxSize",
        0,
        uz,
        "$ZodCheckMimeType",
        0,
        uV,
        "$ZodCheckMinLength",
        0,
        uC,
        "$ZodCheckMinSize",
        0,
        uA,
        "$ZodCheckMultipleOf",
        0,
        uN,
        "$ZodCheckNumberFormat",
        0,
        uT,
        "$ZodCheckOverwrite",
        0,
        uW,
        "$ZodCheckProperty",
        0,
        uJ,
        "$ZodCheckRegex",
        0,
        uL,
        "$ZodCheckSizeEquals",
        0,
        uU,
        "$ZodCheckStartsWith",
        0,
        uF,
        "$ZodCheckStringFormat",
        0,
        uZ,
        "$ZodCheckUpperCase",
        0,
        uM,
      ],
      36608,
    );
    class uG {
      constructor(e = []) {
        (this.content = []), (this.indent = 0), this && (this.args = e);
      }
      indented(e) {
        (this.indent += 1), e(this), (this.indent -= 1);
      }
      write(e) {
        if ("function" == typeof e) {
          e(this, { execution: "sync" }), e(this, { execution: "async" });
          return;
        }
        let t = e.split("\n").filter((e) => e),
          i = Math.min(...t.map((e) => e.length - e.trimStart().length));
        for (let e of t
          .map((e) => e.slice(i))
          .map((e) => " ".repeat(2 * this.indent) + e))
          this.content.push(e);
      }
      compile() {
        return Function(
          ...this?.args,
          [...(this?.content ?? [""]).map((e) => `  ${e}`)].join("\n"),
        );
      }
    }
    e.s(["Doc", 0, uG], 73911);
    let uK = { major: 4, minor: 4, patch: 3 };
    e.s(["version", 0, uK], 22824);
    let uX = aI("$ZodType", (e, t) => {
        var i;
        e ?? (e = {}),
          (e._zod.def = t),
          (e._zod.bag = e._zod.bag || {}),
          (e._zod.version = uK);
        let r = [...(e._zod.def.checks ?? [])];
        for (let t of (e._zod.traits.has("$ZodCheck") && r.unshift(e), r))
          for (let i of t._zod.onattach) i(e);
        if (0 === r.length)
          (i = e._zod).deferred ?? (i.deferred = []),
            e._zod.deferred?.push(() => {
              e._zod.run = e._zod.parse;
            });
        else {
          let t = (e, t, i) => {
              let r,
                n = a5(e);
              for (let s of t) {
                if (s._zod.def.when) {
                  if (a3(e) || !s._zod.def.when(e)) continue;
                } else if (n) continue;
                let t = e.issues.length,
                  a = s._zod.check(e);
                if (a instanceof Promise && i?.async === !1) throw new aP();
                if (r || a instanceof Promise)
                  r = (r ?? Promise.resolve()).then(async () => {
                    await a, e.issues.length !== t && (n || (n = a5(e, t)));
                  });
                else {
                  if (e.issues.length === t) continue;
                  n || (n = a5(e, t));
                }
              }
              return r ? r.then(() => e) : e;
            },
            i = (i, n, s) => {
              if (a5(i)) return (i.aborted = !0), i;
              let a = t(n, r, s);
              if (a instanceof Promise) {
                if (!1 === s.async) throw new aP();
                return a.then((t) => e._zod.parse(t, s));
              }
              return e._zod.parse(a, s);
            };
          e._zod.run = (n, s) => {
            if (s.skipChecks) return e._zod.parse(n, s);
            if ("backward" === s.direction) {
              let t = e._zod.parse(
                { value: n.value, issues: [] },
                { ...s, skipChecks: !0 },
              );
              return t instanceof Promise
                ? t.then((e) => i(e, n, s))
                : i(t, n, s);
            }
            let a = e._zod.parse(n, s);
            if (a instanceof Promise) {
              if (!1 === s.async) throw new aP();
              return a.then((e) => t(e, r, s));
            }
            return t(a, r, s);
          };
        }
        aR(e, "~standard", () => ({
          validate: (t) => {
            try {
              let i = o_(e, t);
              return i.success
                ? { value: i.data }
                : { issues: i.error?.issues };
            } catch (i) {
              return ox(e, t).then((e) =>
                e.success ? { value: e.data } : { issues: e.error?.issues },
              );
            }
          },
          vendor: "zod",
          version: 1,
        }));
      }),
      uH = aI("$ZodString", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern =
            [...(e?._zod.bag?.patterns ?? [])].pop() ?? un(e._zod.bag)),
          (e._zod.parse = (i, r) => {
            if (t.coerce)
              try {
                i.value = String(i.value);
              } catch (e) {}
            return (
              "string" == typeof i.value ||
                i.issues.push({
                  expected: "string",
                  code: "invalid_type",
                  input: i.value,
                  inst: e,
                }),
              i
            );
          });
      }),
      uY = aI("$ZodStringFormat", (e, t) => {
        uZ.init(e, t), uH.init(e, t);
      }),
      u0 = aI("$ZodGUID", (e, t) => {
        t.pattern ?? (t.pattern = oJ), uY.init(e, t);
      }),
      u1 = aI("$ZodUUID", (e, t) => {
        if (t.version) {
          let e = { v1: 1, v2: 2, v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, v8: 8 }[
            t.version
          ];
          if (void 0 === e) throw Error(`Invalid UUID version: "${t.version}"`);
          t.pattern ?? (t.pattern = oV(e));
        } else t.pattern ?? (t.pattern = oV());
        uY.init(e, t);
      }),
      u6 = aI("$ZodEmail", (e, t) => {
        t.pattern ?? (t.pattern = oX), uY.init(e, t);
      }),
      u4 = aI("$ZodURL", (e, t) => {
        uY.init(e, t),
          (e._zod.check = (i) => {
            try {
              let r = i.value.trim();
              if (
                !t.normalize &&
                t.protocol?.source === o8.source &&
                !/^https?:\/\//i.test(r)
              )
                return void i.issues.push({
                  code: "invalid_format",
                  format: "url",
                  note: "Invalid URL format",
                  input: i.value,
                  inst: e,
                  continue: !t.abort,
                });
              let n = new URL(r);
              t.hostname &&
                ((t.hostname.lastIndex = 0),
                t.hostname.test(n.hostname) ||
                  i.issues.push({
                    code: "invalid_format",
                    format: "url",
                    note: "Invalid hostname",
                    pattern: t.hostname.source,
                    input: i.value,
                    inst: e,
                    continue: !t.abort,
                  })),
                t.protocol &&
                  ((t.protocol.lastIndex = 0),
                  t.protocol.test(
                    n.protocol.endsWith(":")
                      ? n.protocol.slice(0, -1)
                      : n.protocol,
                  ) ||
                    i.issues.push({
                      code: "invalid_format",
                      format: "url",
                      note: "Invalid protocol",
                      pattern: t.protocol.source,
                      input: i.value,
                      inst: e,
                      continue: !t.abort,
                    })),
                t.normalize ? (i.value = n.href) : (i.value = r);
              return;
            } catch (r) {
              i.issues.push({
                code: "invalid_format",
                format: "url",
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
            }
          });
      }),
      u2 = aI("$ZodEmoji", (e, t) => {
        t.pattern ?? (t.pattern = oY()), uY.init(e, t);
      }),
      u5 = aI("$ZodNanoID", (e, t) => {
        t.pattern ?? (t.pattern = oq), uY.init(e, t);
      }),
      u3 = aI("$ZodCUID", (e, t) => {
        t.pattern ?? (t.pattern = oL), uY.init(e, t);
      }),
      u8 = aI("$ZodCUID2", (e, t) => {
        t.pattern ?? (t.pattern = oR), uY.init(e, t);
      }),
      u9 = aI("$ZodULID", (e, t) => {
        t.pattern ?? (t.pattern = oM), uY.init(e, t);
      }),
      u7 = aI("$ZodXID", (e, t) => {
        t.pattern ?? (t.pattern = oB), uY.init(e, t);
      }),
      le = aI("$ZodKSUID", (e, t) => {
        t.pattern ?? (t.pattern = oF), uY.init(e, t);
      }),
      lt = aI("$ZodISODateTime", (e, t) => {
        t.pattern ?? (t.pattern = ur(t)), uY.init(e, t);
      }),
      li = aI("$ZodISODate", (e, t) => {
        t.pattern ?? (t.pattern = ue), uY.init(e, t);
      }),
      lr = aI("$ZodISOTime", (e, t) => {
        t.pattern ?? (t.pattern = ui(t)), uY.init(e, t);
      }),
      ln = aI("$ZodISODuration", (e, t) => {
        t.pattern ?? (t.pattern = oQ), uY.init(e, t);
      }),
      ls = aI("$ZodIPv4", (e, t) => {
        t.pattern ?? (t.pattern = o0),
          uY.init(e, t),
          (e._zod.bag.format = "ipv4");
      }),
      la = aI("$ZodIPv6", (e, t) => {
        t.pattern ?? (t.pattern = o1),
          uY.init(e, t),
          (e._zod.bag.format = "ipv6"),
          (e._zod.check = (i) => {
            try {
              new URL(`http://[${i.value}]`);
            } catch {
              i.issues.push({
                code: "invalid_format",
                format: "ipv6",
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
            }
          });
      }),
      lo = aI("$ZodMAC", (e, t) => {
        t.pattern ?? (t.pattern = o6(t.delimiter)),
          uY.init(e, t),
          (e._zod.bag.format = "mac");
      }),
      lu = aI("$ZodCIDRv4", (e, t) => {
        t.pattern ?? (t.pattern = o4), uY.init(e, t);
      }),
      ll = aI("$ZodCIDRv6", (e, t) => {
        t.pattern ?? (t.pattern = o2),
          uY.init(e, t),
          (e._zod.check = (i) => {
            let r = i.value.split("/");
            try {
              if (2 !== r.length) throw Error();
              let [e, t] = r;
              if (!t) throw Error();
              let i = Number(t);
              if (`${i}` !== t || i < 0 || i > 128) throw Error();
              new URL(`http://[${e}]`);
            } catch {
              i.issues.push({
                code: "invalid_format",
                format: "cidrv6",
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
            }
          });
      });
    function lc(e) {
      if ("" === e) return !0;
      if (/\s/.test(e) || e.length % 4 != 0) return !1;
      try {
        return atob(e), !0;
      } catch {
        return !1;
      }
    }
    let ld = aI("$ZodBase64", (e, t) => {
      t.pattern ?? (t.pattern = o5),
        uY.init(e, t),
        (e._zod.bag.contentEncoding = "base64"),
        (e._zod.check = (i) => {
          lc(i.value) ||
            i.issues.push({
              code: "invalid_format",
              format: "base64",
              input: i.value,
              inst: e,
              continue: !t.abort,
            });
        });
    });
    function lf(e) {
      if (!o3.test(e)) return !1;
      let t = e.replace(/[-_]/g, (e) => ("-" === e ? "+" : "/"));
      return lc(t.padEnd(4 * Math.ceil(t.length / 4), "="));
    }
    let lh = aI("$ZodBase64URL", (e, t) => {
        t.pattern ?? (t.pattern = o3),
          uY.init(e, t),
          (e._zod.bag.contentEncoding = "base64url"),
          (e._zod.check = (i) => {
            lf(i.value) ||
              i.issues.push({
                code: "invalid_format",
                format: "base64url",
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      lp = aI("$ZodE164", (e, t) => {
        t.pattern ?? (t.pattern = o9), uY.init(e, t);
      });
    function lm(e, t = null) {
      try {
        let i = e.split(".");
        if (3 !== i.length) return !1;
        let [r] = i;
        if (!r) return !1;
        let n = JSON.parse(atob(r));
        if (
          ("typ" in n && n?.typ !== "JWT") ||
          !n.alg ||
          (t && (!("alg" in n) || n.alg !== t))
        )
          return !1;
        return !0;
      } catch {
        return !1;
      }
    }
    let lg = aI("$ZodJWT", (e, t) => {
        uY.init(e, t),
          (e._zod.check = (i) => {
            lm(i.value, t.alg) ||
              i.issues.push({
                code: "invalid_format",
                format: "jwt",
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      lv = aI("$ZodCustomStringFormat", (e, t) => {
        uY.init(e, t),
          (e._zod.check = (i) => {
            t.fn(i.value) ||
              i.issues.push({
                code: "invalid_format",
                format: t.format,
                input: i.value,
                inst: e,
                continue: !t.abort,
              });
          });
      }),
      ly = aI("$ZodNumber", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern = e._zod.bag.pattern ?? uo),
          (e._zod.parse = (i, r) => {
            if (t.coerce)
              try {
                i.value = Number(i.value);
              } catch (e) {}
            let n = i.value;
            if ("number" == typeof n && !Number.isNaN(n) && Number.isFinite(n))
              return i;
            let s =
              "number" == typeof n
                ? Number.isNaN(n)
                  ? "NaN"
                  : Number.isFinite(n)
                    ? void 0
                    : "Infinity"
                : void 0;
            return (
              i.issues.push({
                expected: "number",
                code: "invalid_type",
                input: n,
                inst: e,
                ...(s ? { received: s } : {}),
              }),
              i
            );
          });
      }),
      lb = aI("$ZodNumberFormat", (e, t) => {
        uT.init(e, t), ly.init(e, t);
      }),
      l_ = aI("$ZodBoolean", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern = uu),
          (e._zod.parse = (i, r) => {
            if (t.coerce)
              try {
                i.value = !!i.value;
              } catch (e) {}
            let n = i.value;
            return (
              "boolean" == typeof n ||
                i.issues.push({
                  expected: "boolean",
                  code: "invalid_type",
                  input: n,
                  inst: e,
                }),
              i
            );
          });
      }),
      l$ = aI("$ZodBigInt", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern = us),
          (e._zod.parse = (i, r) => {
            if (t.coerce)
              try {
                i.value = BigInt(i.value);
              } catch (e) {}
            return (
              "bigint" == typeof i.value ||
                i.issues.push({
                  expected: "bigint",
                  code: "invalid_type",
                  input: i.value,
                  inst: e,
                }),
              i
            );
          });
      }),
      lx = aI("$ZodBigIntFormat", (e, t) => {
        uO.init(e, t), l$.init(e, t);
      }),
      lw = aI("$ZodSymbol", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (t, i) => {
            let r = t.value;
            return (
              "symbol" == typeof r ||
                t.issues.push({
                  expected: "symbol",
                  code: "invalid_type",
                  input: r,
                  inst: e,
                }),
              t
            );
          });
      }),
      lS = aI("$ZodUndefined", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern = uc),
          (e._zod.values = new Set([void 0])),
          (e._zod.parse = (t, i) => {
            let r = t.value;
            return (
              void 0 === r ||
                t.issues.push({
                  expected: "undefined",
                  code: "invalid_type",
                  input: r,
                  inst: e,
                }),
              t
            );
          });
      }),
      lk = aI("$ZodNull", (e, t) => {
        uX.init(e, t),
          (e._zod.pattern = ul),
          (e._zod.values = new Set([null])),
          (e._zod.parse = (t, i) => {
            let r = t.value;
            return (
              null === r ||
                t.issues.push({
                  expected: "null",
                  code: "invalid_type",
                  input: r,
                  inst: e,
                }),
              t
            );
          });
      }),
      lI = aI("$ZodAny", (e, t) => {
        uX.init(e, t), (e._zod.parse = (e) => e);
      }),
      lE = aI("$ZodUnknown", (e, t) => {
        uX.init(e, t), (e._zod.parse = (e) => e);
      }),
      lP = aI("$ZodNever", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (t, i) => (
            t.issues.push({
              expected: "never",
              code: "invalid_type",
              input: t.value,
              inst: e,
            }),
            t
          ));
      }),
      lN = aI("$ZodVoid", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (t, i) => {
            let r = t.value;
            return (
              void 0 === r ||
                t.issues.push({
                  expected: "void",
                  code: "invalid_type",
                  input: r,
                  inst: e,
                }),
              t
            );
          });
      }),
      lT = aI("$ZodDate", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (i, r) => {
            if (t.coerce)
              try {
                i.value = new Date(i.value);
              } catch (e) {}
            let n = i.value,
              s = n instanceof Date;
            return (
              (s && !Number.isNaN(n.getTime())) ||
                i.issues.push({
                  expected: "date",
                  code: "invalid_type",
                  input: n,
                  ...(s ? { received: "Invalid Date" } : {}),
                  inst: e,
                }),
              i
            );
          });
      });
    function lO(e, t, i) {
      e.issues.length && t.issues.push(...a8(i, e.issues)),
        (t.value[i] = e.value);
    }
    let lz = aI("$ZodArray", (e, t) => {
      uX.init(e, t),
        (e._zod.parse = (i, r) => {
          let n = i.value;
          if (!Array.isArray(n))
            return (
              i.issues.push({
                expected: "array",
                code: "invalid_type",
                input: n,
                inst: e,
              }),
              i
            );
          i.value = Array(n.length);
          let s = [];
          for (let e = 0; e < n.length; e++) {
            let a = n[e],
              o = t.element._zod.run({ value: a, issues: [] }, r);
            o instanceof Promise
              ? s.push(o.then((t) => lO(t, i, e)))
              : lO(o, i, e);
          }
          return s.length ? Promise.all(s).then(() => i) : i;
        });
    });
    function lA(e, t, i, r, n, s) {
      let a = i in r;
      if (e.issues.length) {
        if (n && s && !a) return;
        t.issues.push(...a8(i, e.issues));
      }
      if (!a && !n) {
        e.issues.length ||
          t.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: void 0,
            path: [i],
          });
        return;
      }
      void 0 === e.value ? a && (t.value[i] = void 0) : (t.value[i] = e.value);
    }
    function lU(e) {
      let t = Object.keys(e.shape);
      for (let i of t)
        if (!e.shape?.[i]?._zod?.traits?.has("$ZodType"))
          throw Error(`Invalid element at key "${i}": expected a Zod schema`);
      let i = a6(e.shape);
      return {
        ...e,
        keys: t,
        keySet: new Set(t),
        numKeys: t.length,
        optionalKeys: new Set(i),
      };
    }
    function lD(e, t, i, r, n, s) {
      let a = [],
        o = n.keySet,
        u = n.catchall._zod,
        l = u.def.type,
        c = "optional" === u.optin,
        d = "optional" === u.optout;
      for (let n in t) {
        if ("__proto__" === n || o.has(n)) continue;
        if ("never" === l) {
          a.push(n);
          continue;
        }
        let s = u.run({ value: t[n], issues: [] }, r);
        s instanceof Promise
          ? e.push(s.then((e) => lA(e, i, n, t, c, d)))
          : lA(s, i, n, t, c, d);
      }
      return (a.length &&
        i.issues.push({
          code: "unrecognized_keys",
          keys: a,
          input: t,
          inst: s,
        }),
      e.length)
        ? Promise.all(e).then(() => i)
        : i;
    }
    let lC = aI("$ZodObject", (e, t) => {
        let i;
        uX.init(e, t);
        let r = Object.getOwnPropertyDescriptor(t, "shape");
        if (!r?.get) {
          let e = t.shape;
          Object.defineProperty(t, "shape", {
            get: () => {
              let i = { ...e };
              return Object.defineProperty(t, "shape", { value: i }), i;
            },
          });
        }
        let n = aD(() => lU(t));
        aR(e._zod, "propValues", () => {
          let e = t.shape,
            i = {};
          for (let t in e) {
            let r = e[t]._zod;
            if (r.values)
              for (let e of (i[t] ?? (i[t] = new Set()), r.values)) i[t].add(e);
          }
          return i;
        });
        let s = t.catchall;
        e._zod.parse = (t, r) => {
          i ?? (i = n.value);
          let a = t.value;
          if (!aJ(a))
            return (
              t.issues.push({
                expected: "object",
                code: "invalid_type",
                input: a,
                inst: e,
              }),
              t
            );
          t.value = {};
          let o = [],
            u = i.shape;
          for (let e of i.keys) {
            let i = u[e],
              n = "optional" === i._zod.optin,
              s = "optional" === i._zod.optout,
              l = i._zod.run({ value: a[e], issues: [] }, r);
            l instanceof Promise
              ? o.push(l.then((i) => lA(i, t, e, a, n, s)))
              : lA(l, t, e, a, n, s);
          }
          return s
            ? lD(o, a, t, r, n.value, e)
            : o.length
              ? Promise.all(o).then(() => t)
              : t;
        };
      }),
      lj = aI("$ZodObjectJIT", (e, t) => {
        let i, r;
        lC.init(e, t);
        let n = e._zod.parse,
          s = aD(() => lU(t)),
          a = !aT.jitless,
          o = a && aV.value,
          u = t.catchall;
        e._zod.parse = (l, c) => {
          r ?? (r = s.value);
          let d = l.value;
          return aJ(d)
            ? a && o && c?.async === !1 && !0 !== c.jitless
              ? (i ||
                  (i = ((e) => {
                    let t = new uG(["shape", "payload", "ctx"]),
                      i = s.value,
                      r = (e) => {
                        let t = aF(e);
                        return `shape[${t}]._zod.run({ value: input[${t}], issues: [] }, ctx)`;
                      };
                    t.write("const input = payload.value;");
                    let n = Object.create(null),
                      a = 0;
                    for (let e of i.keys) n[e] = `key_${a++}`;
                    for (let s of (t.write("const newResult = {};"), i.keys)) {
                      let i = n[s],
                        a = aF(s),
                        o = e[s],
                        u = o?._zod?.optin === "optional",
                        l = o?._zod?.optout === "optional";
                      t.write(`const ${i} = ${r(s)};`),
                        u && l
                          ? t.write(`
        if (${i}.issues.length) {
          if (${a} in input) {
            payload.issues = payload.issues.concat(${i}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${a}, ...iss.path] : [${a}]
            })));
          }
        }
        
        if (${i}.value === undefined) {
          if (${a} in input) {
            newResult[${a}] = undefined;
          }
        } else {
          newResult[${a}] = ${i}.value;
        }
        
      `)
                          : u
                            ? t.write(`
        if (${i}.issues.length) {
          payload.issues = payload.issues.concat(${i}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${a}, ...iss.path] : [${a}]
          })));
        }
        
        if (${i}.value === undefined) {
          if (${a} in input) {
            newResult[${a}] = undefined;
          }
        } else {
          newResult[${a}] = ${i}.value;
        }
        
      `)
                            : t.write(`
        const ${i}_present = ${a} in input;
        if (${i}.issues.length) {
          payload.issues = payload.issues.concat(${i}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${a}, ...iss.path] : [${a}]
          })));
        }
        if (!${i}_present && !${i}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${a}]
          });
        }

        if (${i}_present) {
          if (${i}.value === undefined) {
            newResult[${a}] = undefined;
          } else {
            newResult[${a}] = ${i}.value;
          }
        }

      `);
                    }
                    t.write("payload.value = newResult;"),
                      t.write("return payload;");
                    let o = t.compile();
                    return (t, i) => o(e, t, i);
                  })(t.shape)),
                (l = i(l, c)),
                u)
                ? lD([], d, l, c, r, e)
                : l
              : n(l, c)
            : (l.issues.push({
                expected: "object",
                code: "invalid_type",
                input: d,
                inst: e,
              }),
              l);
        };
      });
    function lZ(e, t, i, r) {
      for (let i of e) if (0 === i.issues.length) return (t.value = i.value), t;
      let n = e.filter((e) => !a5(e));
      return 1 === n.length
        ? ((t.value = n[0].value), n[0])
        : (t.issues.push({
            code: "invalid_union",
            input: t.value,
            inst: i,
            errors: e.map((e) => e.issues.map((e) => a7(e, r, aO()))),
          }),
          t);
    }
    let lL = aI("$ZodUnion", (e, t) => {
      uX.init(e, t),
        aR(e._zod, "optin", () =>
          t.options.some((e) => "optional" === e._zod.optin)
            ? "optional"
            : void 0,
        ),
        aR(e._zod, "optout", () =>
          t.options.some((e) => "optional" === e._zod.optout)
            ? "optional"
            : void 0,
        ),
        aR(e._zod, "values", () => {
          if (t.options.every((e) => e._zod.values))
            return new Set(t.options.flatMap((e) => Array.from(e._zod.values)));
        }),
        aR(e._zod, "pattern", () => {
          if (t.options.every((e) => e._zod.pattern)) {
            let e = t.options.map((e) => e._zod.pattern);
            return RegExp(`^(${e.map((e) => aj(e.source)).join("|")})$`);
          }
        });
      let i = 1 === t.options.length ? t.options[0]._zod.run : null;
      e._zod.parse = (r, n) => {
        if (i) return i(r, n);
        let s = !1,
          a = [];
        for (let e of t.options) {
          let t = e._zod.run({ value: r.value, issues: [] }, n);
          if (t instanceof Promise) a.push(t), (s = !0);
          else {
            if (0 === t.issues.length) return t;
            a.push(t);
          }
        }
        return s ? Promise.all(a).then((t) => lZ(t, r, e, n)) : lZ(a, r, e, n);
      };
    });
    function lR(e, t, i, r) {
      let n = e.filter((e) => 0 === e.issues.length);
      return (
        1 === n.length
          ? (t.value = n[0].value)
          : 0 === n.length
            ? t.issues.push({
                code: "invalid_union",
                input: t.value,
                inst: i,
                errors: e.map((e) => e.issues.map((e) => a7(e, r, aO()))),
              })
            : t.issues.push({
                code: "invalid_union",
                input: t.value,
                inst: i,
                errors: [],
                inclusive: !1,
              }),
        t
      );
    }
    let lM = aI("$ZodXor", (e, t) => {
        lL.init(e, t), (t.inclusive = !1);
        let i = 1 === t.options.length ? t.options[0]._zod.run : null;
        e._zod.parse = (r, n) => {
          if (i) return i(r, n);
          let s = !1,
            a = [];
          for (let e of t.options) {
            let t = e._zod.run({ value: r.value, issues: [] }, n);
            t instanceof Promise ? (a.push(t), (s = !0)) : a.push(t);
          }
          return s
            ? Promise.all(a).then((t) => lR(t, r, e, n))
            : lR(a, r, e, n);
        };
      }),
      lB = aI("$ZodDiscriminatedUnion", (e, t) => {
        (t.inclusive = !1), lL.init(e, t);
        let i = e._zod.parse;
        aR(e._zod, "propValues", () => {
          let e = {};
          for (let i of t.options) {
            let r = i._zod.propValues;
            if (!r || 0 === Object.keys(r).length)
              throw Error(
                `Invalid discriminated union option at index "${t.options.indexOf(i)}"`,
              );
            for (let [t, i] of Object.entries(r))
              for (let r of (e[t] || (e[t] = new Set()), i)) e[t].add(r);
          }
          return e;
        });
        let r = aD(() => {
          let e = t.options,
            i = new Map();
          for (let r of e) {
            let e = r._zod.propValues?.[t.discriminator];
            if (!e || 0 === e.size)
              throw Error(
                `Invalid discriminated union option at index "${t.options.indexOf(r)}"`,
              );
            for (let t of e) {
              if (i.has(t))
                throw Error(`Duplicate discriminator value "${String(t)}"`);
              i.set(t, r);
            }
          }
          return i;
        });
        e._zod.parse = (n, s) => {
          let a = n.value;
          if (!aJ(a))
            return (
              n.issues.push({
                code: "invalid_type",
                expected: "object",
                input: a,
                inst: e,
              }),
              n
            );
          let o = r.value.get(a?.[t.discriminator]);
          return o
            ? o._zod.run(n, s)
            : t.unionFallback || "backward" === s.direction
              ? i(n, s)
              : (n.issues.push({
                  code: "invalid_union",
                  errors: [],
                  note: "No matching discriminator",
                  discriminator: t.discriminator,
                  options: Array.from(r.value.keys()),
                  input: a,
                  path: [t.discriminator],
                  inst: e,
                }),
                n);
        };
      }),
      lF = aI("$ZodIntersection", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (e, i) => {
            let r = e.value,
              n = t.left._zod.run({ value: r, issues: [] }, i),
              s = t.right._zod.run({ value: r, issues: [] }, i);
            return n instanceof Promise || s instanceof Promise
              ? Promise.all([n, s]).then(([t, i]) => lq(e, t, i))
              : lq(e, n, s);
          });
      });
    function lq(e, t, i) {
      let r,
        n = new Map();
      for (let i of t.issues)
        if ("unrecognized_keys" === i.code)
          for (let e of (r ?? (r = i), i.keys))
            n.has(e) || n.set(e, {}), (n.get(e).l = !0);
        else e.issues.push(i);
      for (let t of i.issues)
        if ("unrecognized_keys" === t.code)
          for (let e of t.keys) n.has(e) || n.set(e, {}), (n.get(e).r = !0);
        else e.issues.push(t);
      let s = [...n].filter(([, e]) => e.l && e.r).map(([e]) => e);
      if ((s.length && r && e.issues.push({ ...r, keys: s }), a5(e))) return e;
      let a = (function e(t, i) {
        if (t === i || (t instanceof Date && i instanceof Date && +t == +i))
          return { valid: !0, data: t };
        if (aW(t) && aW(i)) {
          let r = Object.keys(i),
            n = Object.keys(t).filter((e) => -1 !== r.indexOf(e)),
            s = { ...t, ...i };
          for (let r of n) {
            let n = e(t[r], i[r]);
            if (!n.valid)
              return { valid: !1, mergeErrorPath: [r, ...n.mergeErrorPath] };
            s[r] = n.data;
          }
          return { valid: !0, data: s };
        }
        if (Array.isArray(t) && Array.isArray(i)) {
          if (t.length !== i.length) return { valid: !1, mergeErrorPath: [] };
          let r = [];
          for (let n = 0; n < t.length; n++) {
            let s = e(t[n], i[n]);
            if (!s.valid)
              return { valid: !1, mergeErrorPath: [n, ...s.mergeErrorPath] };
            r.push(s.data);
          }
          return { valid: !0, data: r };
        }
        return { valid: !1, mergeErrorPath: [] };
      })(t.value, i.value);
      if (!a.valid)
        throw Error(
          `Unmergable intersection. Error path: ${JSON.stringify(a.mergeErrorPath)}`,
        );
      return (e.value = a.data), e;
    }
    let lQ = aI("$ZodTuple", (e, t) => {
      uX.init(e, t);
      let i = t.items;
      e._zod.parse = (r, n) => {
        let s = r.value;
        if (!Array.isArray(s))
          return (
            r.issues.push({
              input: s,
              inst: e,
              expected: "tuple",
              code: "invalid_type",
            }),
            r
          );
        r.value = [];
        let a = [],
          o = lJ(i, "optin"),
          u = lJ(i, "optout");
        if (!t.rest) {
          if (s.length < o)
            return (
              r.issues.push({
                code: "too_small",
                minimum: o,
                inclusive: !0,
                input: s,
                inst: e,
                origin: "array",
              }),
              r
            );
          s.length > i.length &&
            r.issues.push({
              code: "too_big",
              maximum: i.length,
              inclusive: !0,
              input: s,
              inst: e,
              origin: "array",
            });
        }
        let l = Array(i.length);
        for (let e = 0; e < i.length; e++) {
          let t = i[e]._zod.run({ value: s[e], issues: [] }, n);
          t instanceof Promise
            ? a.push(
                t.then((t) => {
                  l[e] = t;
                }),
              )
            : (l[e] = t);
        }
        if (t.rest) {
          let e = i.length - 1;
          for (let o of s.slice(i.length)) {
            e++;
            let i = t.rest._zod.run({ value: o, issues: [] }, n);
            i instanceof Promise
              ? a.push(i.then((t) => lV(t, r, e)))
              : lV(i, r, e);
          }
        }
        return a.length
          ? Promise.all(a).then(() => lW(l, r, i, s, u))
          : lW(l, r, i, s, u);
      };
    });
    function lJ(e, t) {
      for (let i = e.length - 1; i >= 0; i--)
        if ("optional" !== e[i]._zod[t]) return i + 1;
      return 0;
    }
    function lV(e, t, i) {
      e.issues.length && t.issues.push(...a8(i, e.issues)),
        (t.value[i] = e.value);
    }
    function lW(e, t, i, r, n) {
      for (let s = 0; s < i.length; s++) {
        let i = e[s],
          a = s < r.length;
        if (i.issues.length) {
          if (!a && s >= n) {
            t.value.length = s;
            break;
          }
          t.issues.push(...a8(s, i.issues));
        }
        t.value[s] = i.value;
      }
      for (let e = t.value.length - 1; e >= r.length; e--)
        if ("optional" === i[e]._zod.optout && void 0 === t.value[e])
          t.value.length = e;
        else break;
      return t;
    }
    let lG = aI("$ZodRecord", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (i, r) => {
            let n = i.value;
            if (!aW(n))
              return (
                i.issues.push({
                  expected: "record",
                  code: "invalid_type",
                  input: n,
                  inst: e,
                }),
                i
              );
            let s = [],
              a = t.keyType._zod.values;
            if (a) {
              let o;
              i.value = {};
              let u = new Set();
              for (let o of a)
                if (
                  "string" == typeof o ||
                  "number" == typeof o ||
                  "symbol" == typeof o
                ) {
                  u.add("number" == typeof o ? o.toString() : o);
                  let a = t.keyType._zod.run({ value: o, issues: [] }, r);
                  if (a instanceof Promise)
                    throw Error(
                      "Async schemas not supported in object keys currently",
                    );
                  if (a.issues.length) {
                    i.issues.push({
                      code: "invalid_key",
                      origin: "record",
                      issues: a.issues.map((e) => a7(e, r, aO())),
                      input: o,
                      path: [o],
                      inst: e,
                    });
                    continue;
                  }
                  let l = a.value,
                    c = t.valueType._zod.run({ value: n[o], issues: [] }, r);
                  c instanceof Promise
                    ? s.push(
                        c.then((e) => {
                          e.issues.length && i.issues.push(...a8(o, e.issues)),
                            (i.value[l] = e.value);
                        }),
                      )
                    : (c.issues.length && i.issues.push(...a8(o, c.issues)),
                      (i.value[l] = c.value));
                }
              for (let e in n) u.has(e) || (o = o ?? []).push(e);
              o &&
                o.length > 0 &&
                i.issues.push({
                  code: "unrecognized_keys",
                  input: n,
                  inst: e,
                  keys: o,
                });
            } else
              for (let a of ((i.value = {}), Reflect.ownKeys(n))) {
                if (
                  "__proto__" === a ||
                  !Object.prototype.propertyIsEnumerable.call(n, a)
                )
                  continue;
                let o = t.keyType._zod.run({ value: a, issues: [] }, r);
                if (o instanceof Promise)
                  throw Error(
                    "Async schemas not supported in object keys currently",
                  );
                if ("string" == typeof a && uo.test(a) && o.issues.length) {
                  let e = t.keyType._zod.run(
                    { value: Number(a), issues: [] },
                    r,
                  );
                  if (e instanceof Promise)
                    throw Error(
                      "Async schemas not supported in object keys currently",
                    );
                  0 === e.issues.length && (o = e);
                }
                if (o.issues.length) {
                  "loose" === t.mode
                    ? (i.value[a] = n[a])
                    : i.issues.push({
                        code: "invalid_key",
                        origin: "record",
                        issues: o.issues.map((e) => a7(e, r, aO())),
                        input: a,
                        path: [a],
                        inst: e,
                      });
                  continue;
                }
                let u = t.valueType._zod.run({ value: n[a], issues: [] }, r);
                u instanceof Promise
                  ? s.push(
                      u.then((e) => {
                        e.issues.length && i.issues.push(...a8(a, e.issues)),
                          (i.value[o.value] = e.value);
                      }),
                    )
                  : (u.issues.length && i.issues.push(...a8(a, u.issues)),
                    (i.value[o.value] = u.value));
              }
            return s.length ? Promise.all(s).then(() => i) : i;
          });
      }),
      lK = aI("$ZodMap", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (i, r) => {
            let n = i.value;
            if (!(n instanceof Map))
              return (
                i.issues.push({
                  expected: "map",
                  code: "invalid_type",
                  input: n,
                  inst: e,
                }),
                i
              );
            let s = [];
            for (let [a, o] of ((i.value = new Map()), n)) {
              let u = t.keyType._zod.run({ value: a, issues: [] }, r),
                l = t.valueType._zod.run({ value: o, issues: [] }, r);
              u instanceof Promise || l instanceof Promise
                ? s.push(
                    Promise.all([u, l]).then(([t, s]) => {
                      lX(t, s, i, a, n, e, r);
                    }),
                  )
                : lX(u, l, i, a, n, e, r);
            }
            return s.length ? Promise.all(s).then(() => i) : i;
          });
      });
    function lX(e, t, i, r, n, s, a) {
      e.issues.length &&
        (aK.has(typeof r)
          ? i.issues.push(...a8(r, e.issues))
          : i.issues.push({
              code: "invalid_key",
              origin: "map",
              input: n,
              inst: s,
              issues: e.issues.map((e) => a7(e, a, aO())),
            })),
        t.issues.length &&
          (aK.has(typeof r)
            ? i.issues.push(...a8(r, t.issues))
            : i.issues.push({
                origin: "map",
                code: "invalid_element",
                input: n,
                inst: s,
                key: r,
                issues: t.issues.map((e) => a7(e, a, aO())),
              })),
        i.value.set(e.value, t.value);
    }
    let lH = aI("$ZodSet", (e, t) => {
      uX.init(e, t),
        (e._zod.parse = (i, r) => {
          let n = i.value;
          if (!(n instanceof Set))
            return (
              i.issues.push({
                input: n,
                inst: e,
                expected: "set",
                code: "invalid_type",
              }),
              i
            );
          let s = [];
          for (let e of ((i.value = new Set()), n)) {
            let n = t.valueType._zod.run({ value: e, issues: [] }, r);
            n instanceof Promise ? s.push(n.then((e) => lY(e, i))) : lY(n, i);
          }
          return s.length ? Promise.all(s).then(() => i) : i;
        });
    });
    function lY(e, t) {
      e.issues.length && t.issues.push(...e.issues), t.value.add(e.value);
    }
    let l0 = aI("$ZodEnum", (e, t) => {
        uX.init(e, t);
        let i = az(t.entries),
          r = new Set(i);
        (e._zod.values = r),
          (e._zod.pattern = RegExp(
            `^(${i
              .filter((e) => aK.has(typeof e))
              .map((e) => ("string" == typeof e ? aH(e) : e.toString()))
              .join("|")})$`,
          )),
          (e._zod.parse = (t, n) => {
            let s = t.value;
            return (
              r.has(s) ||
                t.issues.push({
                  code: "invalid_value",
                  values: i,
                  input: s,
                  inst: e,
                }),
              t
            );
          });
      }),
      l1 = aI("$ZodLiteral", (e, t) => {
        if ((uX.init(e, t), 0 === t.values.length))
          throw Error("Cannot create literal schema with no valid values");
        let i = new Set(t.values);
        (e._zod.values = i),
          (e._zod.pattern = RegExp(
            `^(${t.values.map((e) => ("string" == typeof e ? aH(e) : e ? aH(e.toString()) : String(e))).join("|")})$`,
          )),
          (e._zod.parse = (r, n) => {
            let s = r.value;
            return (
              i.has(s) ||
                r.issues.push({
                  code: "invalid_value",
                  values: t.values,
                  input: s,
                  inst: e,
                }),
              r
            );
          });
      }),
      l6 = aI("$ZodFile", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (t, i) => {
            let r = t.value;
            return (
              r instanceof File ||
                t.issues.push({
                  expected: "file",
                  code: "invalid_type",
                  input: r,
                  inst: e,
                }),
              t
            );
          });
      }),
      l4 = aI("$ZodTransform", (e, t) => {
        uX.init(e, t),
          (e._zod.optin = "optional"),
          (e._zod.parse = (i, r) => {
            if ("backward" === r.direction) throw new aN(e.constructor.name);
            let n = t.transform(i.value, i);
            if (r.async)
              return (n instanceof Promise ? n : Promise.resolve(n)).then(
                (e) => ((i.value = e), (i.fallback = !0), i),
              );
            if (n instanceof Promise) throw new aP();
            return (i.value = n), (i.fallback = !0), i;
          });
      });
    function l2(e, t) {
      return void 0 === t && (e.issues.length || e.fallback)
        ? { issues: [], value: void 0 }
        : e;
    }
    let l5 = aI("$ZodOptional", (e, t) => {
        uX.init(e, t),
          (e._zod.optin = "optional"),
          (e._zod.optout = "optional"),
          aR(e._zod, "values", () =>
            t.innerType._zod.values
              ? new Set([...t.innerType._zod.values, void 0])
              : void 0,
          ),
          aR(e._zod, "pattern", () => {
            let e = t.innerType._zod.pattern;
            return e ? RegExp(`^(${aj(e.source)})?$`) : void 0;
          }),
          (e._zod.parse = (e, i) => {
            if ("optional" === t.innerType._zod.optin) {
              let r = e.value,
                n = t.innerType._zod.run(e, i);
              return n instanceof Promise ? n.then((e) => l2(e, r)) : l2(n, r);
            }
            return void 0 === e.value ? e : t.innerType._zod.run(e, i);
          });
      }),
      l3 = aI("$ZodExactOptional", (e, t) => {
        l5.init(e, t),
          aR(e._zod, "values", () => t.innerType._zod.values),
          aR(e._zod, "pattern", () => t.innerType._zod.pattern),
          (e._zod.parse = (e, i) => t.innerType._zod.run(e, i));
      }),
      l8 = aI("$ZodNullable", (e, t) => {
        uX.init(e, t),
          aR(e._zod, "optin", () => t.innerType._zod.optin),
          aR(e._zod, "optout", () => t.innerType._zod.optout),
          aR(e._zod, "pattern", () => {
            let e = t.innerType._zod.pattern;
            return e ? RegExp(`^(${aj(e.source)}|null)$`) : void 0;
          }),
          aR(e._zod, "values", () =>
            t.innerType._zod.values
              ? new Set([...t.innerType._zod.values, null])
              : void 0,
          ),
          (e._zod.parse = (e, i) =>
            null === e.value ? e : t.innerType._zod.run(e, i));
      }),
      l9 = aI("$ZodDefault", (e, t) => {
        uX.init(e, t),
          (e._zod.optin = "optional"),
          aR(e._zod, "values", () => t.innerType._zod.values),
          (e._zod.parse = (e, i) => {
            if ("backward" === i.direction) return t.innerType._zod.run(e, i);
            if (void 0 === e.value) return (e.value = t.defaultValue), e;
            let r = t.innerType._zod.run(e, i);
            return r instanceof Promise ? r.then((e) => l7(e, t)) : l7(r, t);
          });
      });
    function l7(e, t) {
      return void 0 === e.value && (e.value = t.defaultValue), e;
    }
    let ce = aI("$ZodPrefault", (e, t) => {
        uX.init(e, t),
          (e._zod.optin = "optional"),
          aR(e._zod, "values", () => t.innerType._zod.values),
          (e._zod.parse = (e, i) => (
            "backward" === i.direction ||
              (void 0 === e.value && (e.value = t.defaultValue)),
            t.innerType._zod.run(e, i)
          ));
      }),
      ct = aI("$ZodNonOptional", (e, t) => {
        uX.init(e, t),
          aR(e._zod, "values", () => {
            let e = t.innerType._zod.values;
            return e ? new Set([...e].filter((e) => void 0 !== e)) : void 0;
          }),
          (e._zod.parse = (i, r) => {
            let n = t.innerType._zod.run(i, r);
            return n instanceof Promise ? n.then((t) => ci(t, e)) : ci(n, e);
          });
      });
    function ci(e, t) {
      return (
        e.issues.length ||
          void 0 !== e.value ||
          e.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: e.value,
            inst: t,
          }),
        e
      );
    }
    let cr = aI("$ZodSuccess", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (e, i) => {
            if ("backward" === i.direction) throw new aN("ZodSuccess");
            let r = t.innerType._zod.run(e, i);
            return r instanceof Promise
              ? r.then((t) => ((e.value = 0 === t.issues.length), e))
              : ((e.value = 0 === r.issues.length), e);
          });
      }),
      cn = aI("$ZodCatch", (e, t) => {
        uX.init(e, t),
          (e._zod.optin = "optional"),
          aR(e._zod, "optout", () => t.innerType._zod.optout),
          aR(e._zod, "values", () => t.innerType._zod.values),
          (e._zod.parse = (e, i) => {
            if ("backward" === i.direction) return t.innerType._zod.run(e, i);
            let r = t.innerType._zod.run(e, i);
            return r instanceof Promise
              ? r.then(
                  (r) => (
                    (e.value = r.value),
                    r.issues.length &&
                      ((e.value = t.catchValue({
                        ...e,
                        error: { issues: r.issues.map((e) => a7(e, i, aO())) },
                        input: e.value,
                      })),
                      (e.issues = []),
                      (e.fallback = !0)),
                    e
                  ),
                )
              : ((e.value = r.value),
                r.issues.length &&
                  ((e.value = t.catchValue({
                    ...e,
                    error: { issues: r.issues.map((e) => a7(e, i, aO())) },
                    input: e.value,
                  })),
                  (e.issues = []),
                  (e.fallback = !0)),
                e);
          });
      }),
      cs = aI("$ZodNaN", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (t, i) => (
            ("number" == typeof t.value && Number.isNaN(t.value)) ||
              t.issues.push({
                input: t.value,
                inst: e,
                expected: "nan",
                code: "invalid_type",
              }),
            t
          ));
      }),
      ca = aI("$ZodPipe", (e, t) => {
        uX.init(e, t),
          aR(e._zod, "values", () => t.in._zod.values),
          aR(e._zod, "optin", () => t.in._zod.optin),
          aR(e._zod, "optout", () => t.out._zod.optout),
          aR(e._zod, "propValues", () => t.in._zod.propValues),
          (e._zod.parse = (e, i) => {
            if ("backward" === i.direction) {
              let r = t.out._zod.run(e, i);
              return r instanceof Promise
                ? r.then((e) => co(e, t.in, i))
                : co(r, t.in, i);
            }
            let r = t.in._zod.run(e, i);
            return r instanceof Promise
              ? r.then((e) => co(e, t.out, i))
              : co(r, t.out, i);
          });
      });
    function co(e, t, i) {
      return e.issues.length
        ? ((e.aborted = !0), e)
        : t._zod.run(
            { value: e.value, issues: e.issues, fallback: e.fallback },
            i,
          );
    }
    let cu = aI("$ZodCodec", (e, t) => {
      uX.init(e, t),
        aR(e._zod, "values", () => t.in._zod.values),
        aR(e._zod, "optin", () => t.in._zod.optin),
        aR(e._zod, "optout", () => t.out._zod.optout),
        aR(e._zod, "propValues", () => t.in._zod.propValues),
        (e._zod.parse = (e, i) => {
          if ("forward" === (i.direction || "forward")) {
            let r = t.in._zod.run(e, i);
            return r instanceof Promise
              ? r.then((e) => cl(e, t, i))
              : cl(r, t, i);
          }
          {
            let r = t.out._zod.run(e, i);
            return r instanceof Promise
              ? r.then((e) => cl(e, t, i))
              : cl(r, t, i);
          }
        });
    });
    function cl(e, t, i) {
      if (e.issues.length) return (e.aborted = !0), e;
      if ("forward" === (i.direction || "forward")) {
        let r = t.transform(e.value, e);
        return r instanceof Promise
          ? r.then((r) => cc(e, r, t.out, i))
          : cc(e, r, t.out, i);
      }
      {
        let r = t.reverseTransform(e.value, e);
        return r instanceof Promise
          ? r.then((r) => cc(e, r, t.in, i))
          : cc(e, r, t.in, i);
      }
    }
    function cc(e, t, i, r) {
      return e.issues.length
        ? ((e.aborted = !0), e)
        : i._zod.run({ value: t, issues: e.issues }, r);
    }
    let cd = aI("$ZodPreprocess", (e, t) => {
        ca.init(e, t);
      }),
      cf = aI("$ZodReadonly", (e, t) => {
        uX.init(e, t),
          aR(e._zod, "propValues", () => t.innerType._zod.propValues),
          aR(e._zod, "values", () => t.innerType._zod.values),
          aR(e._zod, "optin", () => t.innerType?._zod?.optin),
          aR(e._zod, "optout", () => t.innerType?._zod?.optout),
          (e._zod.parse = (e, i) => {
            if ("backward" === i.direction) return t.innerType._zod.run(e, i);
            let r = t.innerType._zod.run(e, i);
            return r instanceof Promise ? r.then(ch) : ch(r);
          });
      });
    function ch(e) {
      return (e.value = Object.freeze(e.value)), e;
    }
    let cp = aI("$ZodTemplateLiteral", (e, t) => {
        uX.init(e, t);
        let i = [];
        for (let e of t.parts)
          if ("object" == typeof e && null !== e) {
            if (!e._zod.pattern)
              throw Error(
                `Invalid template literal part, no pattern found: ${[...e._zod.traits].shift()}`,
              );
            let t =
              e._zod.pattern instanceof RegExp
                ? e._zod.pattern.source
                : e._zod.pattern;
            if (!t)
              throw Error(`Invalid template literal part: ${e._zod.traits}`);
            let r = +!!t.startsWith("^"),
              n = t.endsWith("$") ? t.length - 1 : t.length;
            i.push(t.slice(r, n));
          } else if (null === e || aX.has(typeof e)) i.push(aH(`${e}`));
          else throw Error(`Invalid template literal part: ${e}`);
        (e._zod.pattern = RegExp(`^${i.join("")}$`)),
          (e._zod.parse = (i, r) => (
            "string" != typeof i.value
              ? i.issues.push({
                  input: i.value,
                  inst: e,
                  expected: "string",
                  code: "invalid_type",
                })
              : ((e._zod.pattern.lastIndex = 0),
                e._zod.pattern.test(i.value) ||
                  i.issues.push({
                    input: i.value,
                    inst: e,
                    code: "invalid_format",
                    format: t.format ?? "template_literal",
                    pattern: e._zod.pattern.source,
                  })),
            i
          ));
      }),
      cm = aI(
        "$ZodFunction",
        (e, t) => (
          uX.init(e, t),
          (e._def = t),
          (e._zod.def = t),
          (e.implement = (t) => {
            if ("function" != typeof t)
              throw Error("implement() must be called with a function");
            return function (...i) {
              let r = Reflect.apply(
                t,
                this,
                e._def.input ? og(e._def.input, i) : i,
              );
              return e._def.output ? og(e._def.output, r) : r;
            };
          }),
          (e.implementAsync = (t) => {
            if ("function" != typeof t)
              throw Error("implementAsync() must be called with a function");
            return async function (...i) {
              let r = e._def.input ? await oy(e._def.input, i) : i,
                n = await Reflect.apply(t, this, r);
              return e._def.output ? await oy(e._def.output, n) : n;
            };
          }),
          (e._zod.parse = (t, i) => (
            "function" != typeof t.value
              ? t.issues.push({
                  code: "invalid_type",
                  expected: "function",
                  input: t.value,
                  inst: e,
                })
              : e._def.output && "promise" === e._def.output._zod.def.type
                ? (t.value = e.implementAsync(t.value))
                : (t.value = e.implement(t.value)),
            t
          )),
          (e.input = (...t) => {
            let i = e.constructor;
            return new i(
              Array.isArray(t[0])
                ? {
                    type: "function",
                    input: new lQ({ type: "tuple", items: t[0], rest: t[1] }),
                    output: e._def.output,
                  }
                : { type: "function", input: t[0], output: e._def.output },
            );
          }),
          (e.output = (t) =>
            new e.constructor({
              type: "function",
              input: e._def.input,
              output: t,
            })),
          e
        ),
      ),
      cg = aI("$ZodPromise", (e, t) => {
        uX.init(e, t),
          (e._zod.parse = (e, i) =>
            Promise.resolve(e.value).then((e) =>
              t.innerType._zod.run({ value: e, issues: [] }, i),
            ));
      }),
      cv = aI("$ZodLazy", (e, t) => {
        uX.init(e, t),
          aR(
            e._zod,
            "innerType",
            () => (
              t._cachedInner || (t._cachedInner = t.getter()), t._cachedInner
            ),
          ),
          aR(e._zod, "pattern", () => e._zod.innerType?._zod?.pattern),
          aR(e._zod, "propValues", () => e._zod.innerType?._zod?.propValues),
          aR(e._zod, "optin", () => e._zod.innerType?._zod?.optin ?? void 0),
          aR(e._zod, "optout", () => e._zod.innerType?._zod?.optout ?? void 0),
          (e._zod.parse = (t, i) => e._zod.innerType._zod.run(t, i));
      }),
      cy = aI("$ZodCustom", (e, t) => {
        uk.init(e, t),
          uX.init(e, t),
          (e._zod.parse = (e, t) => e),
          (e._zod.check = (i) => {
            let r = i.value,
              n = t.fn(r);
            if (n instanceof Promise) return n.then((t) => cb(t, i, r, e));
            cb(n, i, r, e);
          });
      });
    function cb(e, t, i, r) {
      if (!e) {
        let e = {
          code: "custom",
          input: i,
          inst: r,
          path: [...(r._zod.def.path ?? [])],
          continue: !r._zod.def.abort,
        };
        r._zod.def.params && (e.params = r._zod.def.params),
          t.issues.push(or(e));
      }
    }
    e.s(
      [
        "$ZodAny",
        0,
        lI,
        "$ZodArray",
        0,
        lz,
        "$ZodBase64",
        0,
        ld,
        "$ZodBase64URL",
        0,
        lh,
        "$ZodBigInt",
        0,
        l$,
        "$ZodBigIntFormat",
        0,
        lx,
        "$ZodBoolean",
        0,
        l_,
        "$ZodCIDRv4",
        0,
        lu,
        "$ZodCIDRv6",
        0,
        ll,
        "$ZodCUID",
        0,
        u3,
        "$ZodCUID2",
        0,
        u8,
        "$ZodCatch",
        0,
        cn,
        "$ZodCodec",
        0,
        cu,
        "$ZodCustom",
        0,
        cy,
        "$ZodCustomStringFormat",
        0,
        lv,
        "$ZodDate",
        0,
        lT,
        "$ZodDefault",
        0,
        l9,
        "$ZodDiscriminatedUnion",
        0,
        lB,
        "$ZodE164",
        0,
        lp,
        "$ZodEmail",
        0,
        u6,
        "$ZodEmoji",
        0,
        u2,
        "$ZodEnum",
        0,
        l0,
        "$ZodExactOptional",
        0,
        l3,
        "$ZodFile",
        0,
        l6,
        "$ZodFunction",
        0,
        cm,
        "$ZodGUID",
        0,
        u0,
        "$ZodIPv4",
        0,
        ls,
        "$ZodIPv6",
        0,
        la,
        "$ZodISODate",
        0,
        li,
        "$ZodISODateTime",
        0,
        lt,
        "$ZodISODuration",
        0,
        ln,
        "$ZodISOTime",
        0,
        lr,
        "$ZodIntersection",
        0,
        lF,
        "$ZodJWT",
        0,
        lg,
        "$ZodKSUID",
        0,
        le,
        "$ZodLazy",
        0,
        cv,
        "$ZodLiteral",
        0,
        l1,
        "$ZodMAC",
        0,
        lo,
        "$ZodMap",
        0,
        lK,
        "$ZodNaN",
        0,
        cs,
        "$ZodNanoID",
        0,
        u5,
        "$ZodNever",
        0,
        lP,
        "$ZodNonOptional",
        0,
        ct,
        "$ZodNull",
        0,
        lk,
        "$ZodNullable",
        0,
        l8,
        "$ZodNumber",
        0,
        ly,
        "$ZodNumberFormat",
        0,
        lb,
        "$ZodObject",
        0,
        lC,
        "$ZodObjectJIT",
        0,
        lj,
        "$ZodOptional",
        0,
        l5,
        "$ZodPipe",
        0,
        ca,
        "$ZodPrefault",
        0,
        ce,
        "$ZodPreprocess",
        0,
        cd,
        "$ZodPromise",
        0,
        cg,
        "$ZodReadonly",
        0,
        cf,
        "$ZodRecord",
        0,
        lG,
        "$ZodSet",
        0,
        lH,
        "$ZodString",
        0,
        uH,
        "$ZodStringFormat",
        0,
        uY,
        "$ZodSuccess",
        0,
        cr,
        "$ZodSymbol",
        0,
        lw,
        "$ZodTemplateLiteral",
        0,
        cp,
        "$ZodTransform",
        0,
        l4,
        "$ZodTuple",
        0,
        lQ,
        "$ZodType",
        0,
        uX,
        "$ZodULID",
        0,
        u9,
        "$ZodURL",
        0,
        u4,
        "$ZodUUID",
        0,
        u1,
        "$ZodUndefined",
        0,
        lS,
        "$ZodUnion",
        0,
        lL,
        "$ZodUnknown",
        0,
        lE,
        "$ZodVoid",
        0,
        lN,
        "$ZodXID",
        0,
        u7,
        "$ZodXor",
        0,
        lM,
        "isValidBase64",
        0,
        lc,
        "isValidBase64URL",
        0,
        lf,
        "isValidJWT",
        0,
        lm,
      ],
      39510,
    ),
      e.i(39510),
      e.s(
        [
          "$ZodAny",
          0,
          lI,
          "$ZodArray",
          0,
          lz,
          "$ZodBase64",
          0,
          ld,
          "$ZodBase64URL",
          0,
          lh,
          "$ZodBigInt",
          0,
          l$,
          "$ZodBigIntFormat",
          0,
          lx,
          "$ZodBoolean",
          0,
          l_,
          "$ZodCIDRv4",
          0,
          lu,
          "$ZodCIDRv6",
          0,
          ll,
          "$ZodCUID",
          0,
          u3,
          "$ZodCUID2",
          0,
          u8,
          "$ZodCatch",
          0,
          cn,
          "$ZodCodec",
          0,
          cu,
          "$ZodCustom",
          0,
          cy,
          "$ZodCustomStringFormat",
          0,
          lv,
          "$ZodDate",
          0,
          lT,
          "$ZodDefault",
          0,
          l9,
          "$ZodDiscriminatedUnion",
          0,
          lB,
          "$ZodE164",
          0,
          lp,
          "$ZodEmail",
          0,
          u6,
          "$ZodEmoji",
          0,
          u2,
          "$ZodEnum",
          0,
          l0,
          "$ZodExactOptional",
          0,
          l3,
          "$ZodFile",
          0,
          l6,
          "$ZodFunction",
          0,
          cm,
          "$ZodGUID",
          0,
          u0,
          "$ZodIPv4",
          0,
          ls,
          "$ZodIPv6",
          0,
          la,
          "$ZodISODate",
          0,
          li,
          "$ZodISODateTime",
          0,
          lt,
          "$ZodISODuration",
          0,
          ln,
          "$ZodISOTime",
          0,
          lr,
          "$ZodIntersection",
          0,
          lF,
          "$ZodJWT",
          0,
          lg,
          "$ZodKSUID",
          0,
          le,
          "$ZodLazy",
          0,
          cv,
          "$ZodLiteral",
          0,
          l1,
          "$ZodMAC",
          0,
          lo,
          "$ZodMap",
          0,
          lK,
          "$ZodNaN",
          0,
          cs,
          "$ZodNanoID",
          0,
          u5,
          "$ZodNever",
          0,
          lP,
          "$ZodNonOptional",
          0,
          ct,
          "$ZodNull",
          0,
          lk,
          "$ZodNullable",
          0,
          l8,
          "$ZodNumber",
          0,
          ly,
          "$ZodNumberFormat",
          0,
          lb,
          "$ZodObject",
          0,
          lC,
          "$ZodObjectJIT",
          0,
          lj,
          "$ZodOptional",
          0,
          l5,
          "$ZodPipe",
          0,
          ca,
          "$ZodPrefault",
          0,
          ce,
          "$ZodPreprocess",
          0,
          cd,
          "$ZodPromise",
          0,
          cg,
          "$ZodReadonly",
          0,
          cf,
          "$ZodRecord",
          0,
          lG,
          "$ZodSet",
          0,
          lH,
          "$ZodString",
          0,
          uH,
          "$ZodStringFormat",
          0,
          uY,
          "$ZodSuccess",
          0,
          cr,
          "$ZodSymbol",
          0,
          lw,
          "$ZodTemplateLiteral",
          0,
          cp,
          "$ZodTransform",
          0,
          l4,
          "$ZodTuple",
          0,
          lQ,
          "$ZodType",
          0,
          uX,
          "$ZodULID",
          0,
          u9,
          "$ZodURL",
          0,
          u4,
          "$ZodUUID",
          0,
          u1,
          "$ZodUndefined",
          0,
          lS,
          "$ZodUnion",
          0,
          lL,
          "$ZodUnknown",
          0,
          lE,
          "$ZodVoid",
          0,
          lN,
          "$ZodXID",
          0,
          u7,
          "$ZodXor",
          0,
          lM,
          "clone",
          0,
          aY,
          "isValidBase64",
          0,
          lc,
          "isValidBase64URL",
          0,
          lf,
          "isValidJWT",
          0,
          lm,
        ],
        62429,
      ),
      e.i(62429),
      e.i(36608),
      e.i(22824);
    var c_ = e.i(86618),
      c$ = e.i(21131);
    function cx(e, t, i, r) {
      let n = Math.abs(e),
        s = n % 10,
        a = n % 100;
      return a >= 11 && a <= 19 ? r : 1 === s ? t : s >= 2 && s <= 4 ? i : r;
    }
    function cw(e, t, i) {
      return 1 === Math.abs(e) ? t : i;
    }
    function cS(e) {
      if (!e) return "";
      let t = e[e.length - 1];
      return e + (["ա", "ե", "ը", "ի", "ո", "ու", "օ"].includes(t) ? "ն" : "ը");
    }
    function ck() {
      let e, t, i;
      return {
        localeError:
          ((e = {
            string: { unit: "តួអក្សរ", verb: "គួរមាន" },
            file: { unit: "បៃ", verb: "គួរមាន" },
            array: { unit: "ធាតុ", verb: "គួរមាន" },
            set: { unit: "ធាតុ", verb: "គួរមាន" },
          }),
          (t = {
            regex: "ទិន្នន័យបញ្ចូល",
            email: "អាសយដ្ឋានអ៊ីមែល",
            url: "URL",
            emoji: "សញ្ញាអារម្មណ៍",
            uuid: "UUID",
            uuidv4: "UUIDv4",
            uuidv6: "UUIDv6",
            nanoid: "nanoid",
            guid: "GUID",
            cuid: "cuid",
            cuid2: "cuid2",
            ulid: "ULID",
            xid: "XID",
            ksuid: "KSUID",
            datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
            date: "កាលបរិច្ឆេទ ISO",
            time: "ម៉ោង ISO",
            duration: "រយៈពេល ISO",
            ipv4: "អាសយដ្ឋាន IPv4",
            ipv6: "អាសយដ្ឋាន IPv6",
            cidrv4: "ដែនអាសយដ្ឋាន IPv4",
            cidrv6: "ដែនអាសយដ្ឋាន IPv6",
            base64: "ខ្សែអក្សរអ៊ិកូដ base64",
            base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
            json_string: "ខ្សែអក្សរ JSON",
            e164: "លេខ E.164",
            jwt: "JWT",
            template_literal: "ទិន្នន័យបញ្ចូល",
          }),
          (i = {
            nan: "NaN",
            number: "លេខ",
            array: "អារេ (Array)",
            null: "គ្មានតម្លៃ (null)",
          }),
          (r) => {
            switch (r.code) {
              case "invalid_type": {
                let e = i[r.expected] ?? r.expected,
                  t = oi(r.input),
                  n = i[t] ?? t;
                if (/^[A-Z]/.test(r.expected))
                  return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ instanceof ${r.expected} ប៉ុន្តែទទួលបាន ${n}`;
                return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${e} ប៉ុន្តែទទួលបាន ${n}`;
              }
              case "invalid_value":
                if (1 === r.values.length)
                  return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${a1(r.values[0])}`;
                return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${aA(r.values, "|")}`;
              case "too_big": {
                let t = r.inclusive ? "<=" : "<",
                  i = e[r.origin] ?? null;
                if (i)
                  return `ធំពេក៖ ត្រូវការ ${r.origin ?? "តម្លៃ"} ${t} ${r.maximum.toString()} ${i.unit ?? "ធាតុ"}`;
                return `ធំពេក៖ ត្រូវការ ${r.origin ?? "តម្លៃ"} ${t} ${r.maximum.toString()}`;
              }
              case "too_small": {
                let t = r.inclusive ? ">=" : ">",
                  i = e[r.origin] ?? null;
                if (i)
                  return `តូចពេក៖ ត្រូវការ ${r.origin} ${t} ${r.minimum.toString()} ${i.unit}`;
                return `តូចពេក៖ ត្រូវការ ${r.origin} ${t} ${r.minimum.toString()}`;
              }
              case "invalid_format":
                if ("starts_with" === r.format)
                  return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${r.prefix}"`;
                if ("ends_with" === r.format)
                  return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${r.suffix}"`;
                if ("includes" === r.format)
                  return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${r.includes}"`;
                if ("regex" === r.format)
                  return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${r.pattern}`;
                return `មិនត្រឹមត្រូវ៖ ${t[r.format] ?? r.format}`;
              case "not_multiple_of":
                return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${r.divisor}`;
              case "unrecognized_keys":
                return `រកឃើញសោមិនស្គាល់៖ ${aA(r.keys, ", ")}`;
              case "invalid_key":
                return `សោមិនត្រឹមត្រូវនៅក្នុង ${r.origin}`;
              case "invalid_union":
              default:
                return "ទិន្នន័យមិនត្រឹមត្រូវ";
              case "invalid_element":
                return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${r.origin}`;
            }
          }),
      };
    }
    e.s([], 79113), e.i(79113);
    let cI = (e) => e.charAt(0).toUpperCase() + e.slice(1);
    function cE(e) {
      let t = Math.abs(e),
        i = t % 10,
        r = t % 100;
      return (r >= 11 && r <= 19) || 0 === i ? "many" : 1 === i ? "one" : "few";
    }
    function cP(e, t, i, r) {
      let n = Math.abs(e),
        s = n % 10,
        a = n % 100;
      return a >= 11 && a <= 19 ? r : 1 === s ? t : s >= 2 && s <= 4 ? i : r;
    }
    function cN() {
      let e, t, i;
      return {
        localeError:
          ((e = {
            string: { unit: "символів", verb: "матиме" },
            file: { unit: "байтів", verb: "матиме" },
            array: { unit: "елементів", verb: "матиме" },
            set: { unit: "елементів", verb: "матиме" },
          }),
          (t = {
            regex: "вхідні дані",
            email: "адреса електронної пошти",
            url: "URL",
            emoji: "емодзі",
            uuid: "UUID",
            uuidv4: "UUIDv4",
            uuidv6: "UUIDv6",
            nanoid: "nanoid",
            guid: "GUID",
            cuid: "cuid",
            cuid2: "cuid2",
            ulid: "ULID",
            xid: "XID",
            ksuid: "KSUID",
            datetime: "дата та час ISO",
            date: "дата ISO",
            time: "час ISO",
            duration: "тривалість ISO",
            ipv4: "адреса IPv4",
            ipv6: "адреса IPv6",
            cidrv4: "діапазон IPv4",
            cidrv6: "діапазон IPv6",
            base64: "рядок у кодуванні base64",
            base64url: "рядок у кодуванні base64url",
            json_string: "рядок JSON",
            e164: "номер E.164",
            jwt: "JWT",
            template_literal: "вхідні дані",
          }),
          (i = { nan: "NaN", number: "число", array: "масив" }),
          (r) => {
            switch (r.code) {
              case "invalid_type": {
                let e = i[r.expected] ?? r.expected,
                  t = oi(r.input),
                  n = i[t] ?? t;
                if (/^[A-Z]/.test(r.expected))
                  return `Неправильні вхідні дані: очікується instanceof ${r.expected}, отримано ${n}`;
                return `Неправильні вхідні дані: очікується ${e}, отримано ${n}`;
              }
              case "invalid_value":
                if (1 === r.values.length)
                  return `Неправильні вхідні дані: очікується ${a1(r.values[0])}`;
                return `Неправильна опція: очікується одне з ${aA(r.values, "|")}`;
              case "too_big": {
                let t = r.inclusive ? "<=" : "<",
                  i = e[r.origin] ?? null;
                if (i)
                  return `Занадто велике: очікується, що ${r.origin ?? "значення"} ${i.verb} ${t}${r.maximum.toString()} ${i.unit ?? "елементів"}`;
                return `Занадто велике: очікується, що ${r.origin ?? "значення"} буде ${t}${r.maximum.toString()}`;
              }
              case "too_small": {
                let t = r.inclusive ? ">=" : ">",
                  i = e[r.origin] ?? null;
                if (i)
                  return `Занадто мале: очікується, що ${r.origin} ${i.verb} ${t}${r.minimum.toString()} ${i.unit}`;
                return `Занадто мале: очікується, що ${r.origin} буде ${t}${r.minimum.toString()}`;
              }
              case "invalid_format":
                if ("starts_with" === r.format)
                  return `Неправильний рядок: повинен починатися з "${r.prefix}"`;
                if ("ends_with" === r.format)
                  return `Неправильний рядок: повинен закінчуватися на "${r.suffix}"`;
                if ("includes" === r.format)
                  return `Неправильний рядок: повинен містити "${r.includes}"`;
                if ("regex" === r.format)
                  return `Неправильний рядок: повинен відповідати шаблону ${r.pattern}`;
                return `Неправильний ${t[r.format] ?? r.format}`;
              case "not_multiple_of":
                return `Неправильне число: повинно бути кратним ${r.divisor}`;
              case "unrecognized_keys":
                return `Нерозпізнаний ключ${r.keys.length > 1 ? "і" : ""}: ${aA(r.keys, ", ")}`;
              case "invalid_key":
                return `Неправильний ключ у ${r.origin}`;
              case "invalid_union":
              default:
                return "Неправильні вхідні дані";
              case "invalid_element":
                return `Неправильне значення у ${r.origin}`;
            }
          }),
      };
    }
    e.s(
      [
        "ar",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "حرف", verb: "أن يحوي" },
                file: { unit: "بايت", verb: "أن يحوي" },
                array: { unit: "عنصر", verb: "أن يحوي" },
                set: { unit: "عنصر", verb: "أن يحوي" },
              }),
              (t = {
                regex: "مدخل",
                email: "بريد إلكتروني",
                url: "رابط",
                emoji: "إيموجي",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "تاريخ ووقت بمعيار ISO",
                date: "تاريخ بمعيار ISO",
                time: "وقت بمعيار ISO",
                duration: "مدة بمعيار ISO",
                ipv4: "عنوان IPv4",
                ipv6: "عنوان IPv6",
                cidrv4: "مدى عناوين بصيغة IPv4",
                cidrv6: "مدى عناوين بصيغة IPv6",
                base64: "نَص بترميز base64-encoded",
                base64url: "نَص بترميز base64url-encoded",
                json_string: "نَص على هيئة JSON",
                e164: "رقم هاتف بمعيار E.164",
                jwt: "JWT",
                template_literal: "مدخل",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `مدخلات غير مقبولة: يفترض إدخال instanceof ${r.expected}، ولكن تم إدخال ${n}`;
                    return `مدخلات غير مقبولة: يفترض إدخال ${e}، ولكن تم إدخال ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `مدخلات غير مقبولة: يفترض إدخال ${a1(r.values[0])}`;
                    return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return ` أكبر من اللازم: يفترض أن تكون ${r.origin ?? "القيمة"} ${t} ${r.maximum.toString()} ${i.unit ?? "عنصر"}`;
                    return `أكبر من اللازم: يفترض أن تكون ${r.origin ?? "القيمة"} ${t} ${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `أصغر من اللازم: يفترض لـ ${r.origin} أن يكون ${t} ${r.minimum.toString()} ${i.unit}`;
                    return `أصغر من اللازم: يفترض لـ ${r.origin} أن يكون ${t} ${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `نَص غير مقبول: يجب أن يبدأ بـ "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `نَص غير مقبول: يجب أن ينتهي بـ "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `نَص غير مقبول: يجب أن يتضمَّن "${r.includes}"`;
                    if ("regex" === r.format)
                      return `نَص غير مقبول: يجب أن يطابق النمط ${r.pattern}`;
                    return `${t[r.format] ?? r.format} غير مقبول`;
                  case "not_multiple_of":
                    return `رقم غير مقبول: يجب أن يكون من مضاعفات ${r.divisor}`;
                  case "unrecognized_keys":
                    return `معرف${r.keys.length > 1 ? "ات" : ""} غريب${r.keys.length > 1 ? "ة" : ""}: ${aA(r.keys, "، ")}`;
                  case "invalid_key":
                    return `معرف غير مقبول في ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "مدخل غير مقبول";
                  case "invalid_element":
                    return `مدخل غير مقبول في ${r.origin}`;
                }
              }),
          };
        },
        "az",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "simvol", verb: "olmalıdır" },
                file: { unit: "bayt", verb: "olmalıdır" },
                array: { unit: "element", verb: "olmalıdır" },
                set: { unit: "element", verb: "olmalıdır" },
              }),
              (t = {
                regex: "input",
                email: "email address",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO datetime",
                date: "ISO date",
                time: "ISO time",
                duration: "ISO duration",
                ipv4: "IPv4 address",
                ipv6: "IPv6 address",
                cidrv4: "IPv4 range",
                cidrv6: "IPv6 range",
                base64: "base64-encoded string",
                base64url: "base64url-encoded string",
                json_string: "JSON string",
                e164: "E.164 number",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Yanlış dəyər: g\xf6zlənilən instanceof ${r.expected}, daxil olan ${n}`;
                    return `Yanlış dəyər: g\xf6zlənilən ${e}, daxil olan ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Yanlış dəyər: g\xf6zlənilən ${a1(r.values[0])}`;
                    return `Yanlış se\xe7im: aşağıdakılardan biri olmalıdır: ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `\xc7ox b\xf6y\xfck: g\xf6zlənilən ${r.origin ?? "dəyər"} ${t}${r.maximum.toString()} ${i.unit ?? "element"}`;
                    return `\xc7ox b\xf6y\xfck: g\xf6zlənilən ${r.origin ?? "dəyər"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `\xc7ox ki\xe7ik: g\xf6zlənilən ${r.origin} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `\xc7ox ki\xe7ik: g\xf6zlənilən ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Yanlış mətn: "${r.prefix}" ilə başlamalıdır`;
                    if ("ends_with" === r.format)
                      return `Yanlış mətn: "${r.suffix}" ilə bitməlidir`;
                    if ("includes" === r.format)
                      return `Yanlış mətn: "${r.includes}" daxil olmalıdır`;
                    if ("regex" === r.format)
                      return `Yanlış mətn: ${r.pattern} şablonuna uyğun olmalıdır`;
                    return `Yanlış ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Yanlış ədəd: ${r.divisor} ilə b\xf6l\xfcnə bilən olmalıdır`;
                  case "unrecognized_keys":
                    return `Tanınmayan a\xe7ar${r.keys.length > 1 ? "lar" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} daxilində yanlış a\xe7ar`;
                  case "invalid_union":
                  default:
                    return "Yanlış dəyər";
                  case "invalid_element":
                    return `${r.origin} daxilində yanlış dəyər`;
                }
              }),
          };
        },
        "be",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: {
                  unit: { one: "сімвал", few: "сімвалы", many: "сімвалаў" },
                  verb: "мець",
                },
                array: {
                  unit: { one: "элемент", few: "элементы", many: "элементаў" },
                  verb: "мець",
                },
                set: {
                  unit: { one: "элемент", few: "элементы", many: "элементаў" },
                  verb: "мець",
                },
                file: {
                  unit: { one: "байт", few: "байты", many: "байтаў" },
                  verb: "мець",
                },
              }),
              (t = {
                regex: "увод",
                email: "email адрас",
                url: "URL",
                emoji: "эмодзі",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO дата і час",
                date: "ISO дата",
                time: "ISO час",
                duration: "ISO працягласць",
                ipv4: "IPv4 адрас",
                ipv6: "IPv6 адрас",
                cidrv4: "IPv4 дыяпазон",
                cidrv6: "IPv6 дыяпазон",
                base64: "радок у фармаце base64",
                base64url: "радок у фармаце base64url",
                json_string: "JSON радок",
                e164: "нумар E.164",
                jwt: "JWT",
                template_literal: "увод",
              }),
              (i = { nan: "NaN", number: "лік", array: "масіў" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Няправільны ўвод: чакаўся instanceof ${r.expected}, атрымана ${n}`;
                    return `Няправільны ўвод: чакаўся ${e}, атрымана ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Няправільны ўвод: чакалася ${a1(r.values[0])}`;
                    return `Няправільны варыянт: чакаўся адзін з ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cx(
                        Number(r.maximum),
                        i.unit.one,
                        i.unit.few,
                        i.unit.many,
                      );
                      return `Занадта вялікі: чакалася, што ${r.origin ?? "значэнне"} павінна ${i.verb} ${t}${r.maximum.toString()} ${e}`;
                    }
                    return `Занадта вялікі: чакалася, што ${r.origin ?? "значэнне"} павінна быць ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cx(
                        Number(r.minimum),
                        i.unit.one,
                        i.unit.few,
                        i.unit.many,
                      );
                      return `Занадта малы: чакалася, што ${r.origin} павінна ${i.verb} ${t}${r.minimum.toString()} ${e}`;
                    }
                    return `Занадта малы: чакалася, што ${r.origin} павінна быць ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Няправільны радок: павінен пачынацца з "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Няправільны радок: павінен заканчвацца на "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Няправільны радок: павінен змяшчаць "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Няправільны радок: павінен адпавядаць шаблону ${r.pattern}`;
                    return `Няправільны ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Няправільны лік: павінен быць кратным ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Нераспазнаны ${r.keys.length > 1 ? "ключы" : "ключ"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Няправільны ключ у ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Няправільны ўвод";
                  case "invalid_element":
                    return `Няправільнае значэнне ў ${r.origin}`;
                }
              }),
          };
        },
        "bg",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "символа", verb: "да съдържа" },
                file: { unit: "байта", verb: "да съдържа" },
                array: { unit: "елемента", verb: "да съдържа" },
                set: { unit: "елемента", verb: "да съдържа" },
              }),
              (t = {
                regex: "вход",
                email: "имейл адрес",
                url: "URL",
                emoji: "емоджи",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO време",
                date: "ISO дата",
                time: "ISO време",
                duration: "ISO продължителност",
                ipv4: "IPv4 адрес",
                ipv6: "IPv6 адрес",
                cidrv4: "IPv4 диапазон",
                cidrv6: "IPv6 диапазон",
                base64: "base64-кодиран низ",
                base64url: "base64url-кодиран низ",
                json_string: "JSON низ",
                e164: "E.164 номер",
                jwt: "JWT",
                template_literal: "вход",
              }),
              (i = { nan: "NaN", number: "число", array: "масив" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Невалиден вход: очакван instanceof ${r.expected}, получен ${n}`;
                    return `Невалиден вход: очакван ${e}, получен ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Невалиден вход: очакван ${a1(r.values[0])}`;
                    return `Невалидна опция: очаквано едно от ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Твърде голямо: очаква се ${r.origin ?? "стойност"} да съдържа ${t}${r.maximum.toString()} ${i.unit ?? "елемента"}`;
                    return `Твърде голямо: очаква се ${r.origin ?? "стойност"} да бъде ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Твърде малко: очаква се ${r.origin} да съдържа ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Твърде малко: очаква се ${r.origin} да бъде ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format": {
                    if ("starts_with" === r.format)
                      return `Невалиден низ: трябва да започва с "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Невалиден низ: трябва да завършва с "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Невалиден низ: трябва да включва "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Невалиден низ: трябва да съвпада с ${r.pattern}`;
                    let e = "Невалиден";
                    return (
                      "emoji" === r.format && (e = "Невалидно"),
                      "datetime" === r.format && (e = "Невалидно"),
                      "date" === r.format && (e = "Невалидна"),
                      "time" === r.format && (e = "Невалидно"),
                      "duration" === r.format && (e = "Невалидна"),
                      `${e} ${t[r.format] ?? r.format}`
                    );
                  }
                  case "not_multiple_of":
                    return `Невалидно число: трябва да бъде кратно на ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Неразпознат${r.keys.length > 1 ? "и" : ""} ключ${r.keys.length > 1 ? "ове" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Невалиден ключ в ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Невалиден вход";
                  case "invalid_element":
                    return `Невалидна стойност в ${r.origin}`;
                }
              }),
          };
        },
        "ca",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caràcters", verb: "contenir" },
                file: { unit: "bytes", verb: "contenir" },
                array: { unit: "elements", verb: "contenir" },
                set: { unit: "elements", verb: "contenir" },
              }),
              (t = {
                regex: "entrada",
                email: "adreça electrònica",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "data i hora ISO",
                date: "data ISO",
                time: "hora ISO",
                duration: "durada ISO",
                ipv4: "adreça IPv4",
                ipv6: "adreça IPv6",
                cidrv4: "rang IPv4",
                cidrv6: "rang IPv6",
                base64: "cadena codificada en base64",
                base64url: "cadena codificada en base64url",
                json_string: "cadena JSON",
                e164: "número E.164",
                jwt: "JWT",
                template_literal: "entrada",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Tipus inv\xe0lid: s'esperava instanceof ${r.expected}, s'ha rebut ${n}`;
                    return `Tipus inv\xe0lid: s'esperava ${e}, s'ha rebut ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Valor inv\xe0lid: s'esperava ${a1(r.values[0])}`;
                    return `Opci\xf3 inv\xe0lida: s'esperava una de ${aA(r.values, " o ")}`;
                  case "too_big": {
                    let t = r.inclusive ? "com a màxim" : "menys de",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Massa gran: s'esperava que ${r.origin ?? "el valor"} contingu\xe9s ${t} ${r.maximum.toString()} ${i.unit ?? "elements"}`;
                    return `Massa gran: s'esperava que ${r.origin ?? "el valor"} fos ${t} ${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? "com a mínim" : "més de",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Massa petit: s'esperava que ${r.origin} contingu\xe9s ${t} ${r.minimum.toString()} ${i.unit}`;
                    return `Massa petit: s'esperava que ${r.origin} fos ${t} ${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Format inv\xe0lid: ha de comen\xe7ar amb "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Format inv\xe0lid: ha d'acabar amb "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Format inv\xe0lid: ha d'incloure "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Format inv\xe0lid: ha de coincidir amb el patr\xf3 ${r.pattern}`;
                    return `Format inv\xe0lid per a ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `N\xfamero inv\xe0lid: ha de ser m\xfaltiple de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Clau${r.keys.length > 1 ? "s" : ""} no reconeguda${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Clau inv\xe0lida a ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Entrada invàlida";
                  case "invalid_element":
                    return `Element inv\xe0lid a ${r.origin}`;
                }
              }),
          };
        },
        "cs",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "znaků", verb: "mít" },
                file: { unit: "bajtů", verb: "mít" },
                array: { unit: "prvků", verb: "mít" },
                set: { unit: "prvků", verb: "mít" },
              }),
              (t = {
                regex: "regulární výraz",
                email: "e-mailová adresa",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "datum a čas ve formátu ISO",
                date: "datum ve formátu ISO",
                time: "čas ve formátu ISO",
                duration: "doba trvání ISO",
                ipv4: "IPv4 adresa",
                ipv6: "IPv6 adresa",
                cidrv4: "rozsah IPv4",
                cidrv6: "rozsah IPv6",
                base64: "řetězec zakódovaný ve formátu base64",
                base64url: "řetězec zakódovaný ve formátu base64url",
                json_string: "řetězec ve formátu JSON",
                e164: "číslo E.164",
                jwt: "JWT",
                template_literal: "vstup",
              }),
              (i = {
                nan: "NaN",
                number: "číslo",
                string: "řetězec",
                function: "funkce",
                array: "pole",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Neplatn\xfd vstup: oček\xe1v\xe1no instanceof ${r.expected}, obdrženo ${n}`;
                    return `Neplatn\xfd vstup: oček\xe1v\xe1no ${e}, obdrženo ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Neplatn\xfd vstup: oček\xe1v\xe1no ${a1(r.values[0])}`;
                    return `Neplatn\xe1 možnost: oček\xe1v\xe1na jedna z hodnot ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Hodnota je př\xedliš velk\xe1: ${r.origin ?? "hodnota"} mus\xed m\xedt ${t}${r.maximum.toString()} ${i.unit ?? "prvků"}`;
                    return `Hodnota je př\xedliš velk\xe1: ${r.origin ?? "hodnota"} mus\xed b\xfdt ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Hodnota je př\xedliš mal\xe1: ${r.origin ?? "hodnota"} mus\xed m\xedt ${t}${r.minimum.toString()} ${i.unit ?? "prvků"}`;
                    return `Hodnota je př\xedliš mal\xe1: ${r.origin ?? "hodnota"} mus\xed b\xfdt ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Neplatn\xfd řetězec: mus\xed zač\xednat na "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Neplatn\xfd řetězec: mus\xed končit na "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Neplatn\xfd řetězec: mus\xed obsahovat "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Neplatn\xfd řetězec: mus\xed odpov\xeddat vzoru ${r.pattern}`;
                    return `Neplatn\xfd form\xe1t ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Neplatn\xe9 č\xedslo: mus\xed b\xfdt n\xe1sobkem ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Nezn\xe1m\xe9 kl\xedče: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Neplatn\xfd kl\xedč v ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Neplatný vstup";
                  case "invalid_element":
                    return `Neplatn\xe1 hodnota v ${r.origin}`;
                }
              }),
          };
        },
        "da",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "tegn", verb: "havde" },
                file: { unit: "bytes", verb: "havde" },
                array: { unit: "elementer", verb: "indeholdt" },
                set: { unit: "elementer", verb: "indeholdt" },
              }),
              (t = {
                regex: "input",
                email: "e-mailadresse",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO dato- og klokkeslæt",
                date: "ISO-dato",
                time: "ISO-klokkeslæt",
                duration: "ISO-varighed",
                ipv4: "IPv4-område",
                ipv6: "IPv6-område",
                cidrv4: "IPv4-spektrum",
                cidrv6: "IPv6-spektrum",
                base64: "base64-kodet streng",
                base64url: "base64url-kodet streng",
                json_string: "JSON-streng",
                e164: "E.164-nummer",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = {
                nan: "NaN",
                string: "streng",
                number: "tal",
                boolean: "boolean",
                array: "liste",
                object: "objekt",
                set: "sæt",
                file: "fil",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ugyldigt input: forventede instanceof ${r.expected}, fik ${n}`;
                    return `Ugyldigt input: forventede ${e}, fik ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ugyldig v\xe6rdi: forventede ${a1(r.values[0])}`;
                    return `Ugyldigt valg: forventede en af f\xf8lgende ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `For stor: forventede ${s ?? "value"} ${n.verb} ${t} ${r.maximum.toString()} ${n.unit ?? "elementer"}`;
                    return `For stor: forventede ${s ?? "value"} havde ${t} ${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `For lille: forventede ${s} ${n.verb} ${t} ${r.minimum.toString()} ${n.unit}`;
                    return `For lille: forventede ${s} havde ${t} ${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ugyldig streng: skal starte med "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Ugyldig streng: skal ende med "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Ugyldig streng: skal indeholde "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Ugyldig streng: skal matche m\xf8nsteret ${r.pattern}`;
                    return `Ugyldig ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ugyldigt tal: skal v\xe6re deleligt med ${r.divisor}`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Ukendte nøgler" : "Ukendt nøgle"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Ugyldig n\xf8gle i ${r.origin}`;
                  case "invalid_union":
                    return "Ugyldigt input: matcher ingen af de tilladte typer";
                  case "invalid_element":
                    return `Ugyldig v\xe6rdi i ${r.origin}`;
                  default:
                    return "Ugyldigt input";
                }
              }),
          };
        },
        "de",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "Zeichen", verb: "zu haben" },
                file: { unit: "Bytes", verb: "zu haben" },
                array: { unit: "Elemente", verb: "zu haben" },
                set: { unit: "Elemente", verb: "zu haben" },
              }),
              (t = {
                regex: "Eingabe",
                email: "E-Mail-Adresse",
                url: "URL",
                emoji: "Emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO-Datum und -Uhrzeit",
                date: "ISO-Datum",
                time: "ISO-Uhrzeit",
                duration: "ISO-Dauer",
                ipv4: "IPv4-Adresse",
                ipv6: "IPv6-Adresse",
                cidrv4: "IPv4-Bereich",
                cidrv6: "IPv6-Bereich",
                base64: "Base64-codierter String",
                base64url: "Base64-URL-codierter String",
                json_string: "JSON-String",
                e164: "E.164-Nummer",
                jwt: "JWT",
                template_literal: "Eingabe",
              }),
              (i = { nan: "NaN", number: "Zahl", array: "Array" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ung\xfcltige Eingabe: erwartet instanceof ${r.expected}, erhalten ${n}`;
                    return `Ung\xfcltige Eingabe: erwartet ${e}, erhalten ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ung\xfcltige Eingabe: erwartet ${a1(r.values[0])}`;
                    return `Ung\xfcltige Option: erwartet eine von ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Zu gro\xdf: erwartet, dass ${r.origin ?? "Wert"} ${t}${r.maximum.toString()} ${i.unit ?? "Elemente"} hat`;
                    return `Zu gro\xdf: erwartet, dass ${r.origin ?? "Wert"} ${t}${r.maximum.toString()} ist`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Zu klein: erwartet, dass ${r.origin} ${t}${r.minimum.toString()} ${i.unit} hat`;
                    return `Zu klein: erwartet, dass ${r.origin} ${t}${r.minimum.toString()} ist`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ung\xfcltiger String: muss mit "${r.prefix}" beginnen`;
                    if ("ends_with" === r.format)
                      return `Ung\xfcltiger String: muss mit "${r.suffix}" enden`;
                    if ("includes" === r.format)
                      return `Ung\xfcltiger String: muss "${r.includes}" enthalten`;
                    if ("regex" === r.format)
                      return `Ung\xfcltiger String: muss dem Muster ${r.pattern} entsprechen`;
                    return `Ung\xfcltig: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ung\xfcltige Zahl: muss ein Vielfaches von ${r.divisor} sein`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Ung\xfcltiger Schl\xfcssel in ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Ungültige Eingabe";
                  case "invalid_element":
                    return `Ung\xfcltiger Wert in ${r.origin}`;
                }
              }),
          };
        },
        "el",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "χαρακτήρες", verb: "να έχει" },
                file: { unit: "bytes", verb: "να έχει" },
                array: { unit: "στοιχεία", verb: "να έχει" },
                set: { unit: "στοιχεία", verb: "να έχει" },
                map: { unit: "καταχωρήσεις", verb: "να έχει" },
              }),
              (t = {
                regex: "είσοδος",
                email: "διεύθυνση email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO ημερομηνία και ώρα",
                date: "ISO ημερομηνία",
                time: "ISO ώρα",
                duration: "ISO διάρκεια",
                ipv4: "διεύθυνση IPv4",
                ipv6: "διεύθυνση IPv6",
                mac: "διεύθυνση MAC",
                cidrv4: "εύρος IPv4",
                cidrv6: "εύρος IPv6",
                base64: "συμβολοσειρά κωδικοποιημένη σε base64",
                base64url: "συμβολοσειρά κωδικοποιημένη σε base64url",
                json_string: "συμβολοσειρά JSON",
                e164: "αριθμός E.164",
                jwt: "JWT",
                template_literal: "είσοδος",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (
                      "string" == typeof r.expected &&
                      /^[A-Z]/.test(r.expected)
                    )
                      return `Μη έγκυρη είσοδος: αναμενόταν instanceof ${r.expected}, λήφθηκε ${n}`;
                    return `Μη έγκυρη είσοδος: αναμενόταν ${e}, λήφθηκε ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Μη έγκυρη είσοδος: αναμενόταν ${a1(r.values[0])}`;
                    return `Μη έγκυρη επιλογή: αναμενόταν ένα από ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Πολύ μεγάλο: αναμενόταν ${r.origin ?? "τιμή"} να έχει ${t}${r.maximum.toString()} ${i.unit ?? "στοιχεία"}`;
                    return `Πολύ μεγάλο: αναμενόταν ${r.origin ?? "τιμή"} να είναι ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Πολύ μικρό: αναμενόταν ${r.origin} να έχει ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Πολύ μικρό: αναμενόταν ${r.origin} να είναι ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Μη έγκυρη συμβολοσειρά: πρέπει να ξεκινά με "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Μη έγκυρη συμβολοσειρά: πρέπει να τελειώνει με "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Μη έγκυρη συμβολοσειρά: πρέπει να περιέχει "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Μη έγκυρη συμβολοσειρά: πρέπει να ταιριάζει με το μοτίβο ${r.pattern}`;
                    return `Μη έγκυρο: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Μη έγκυρος αριθμός: πρέπει να είναι πολλαπλάσιο του ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Άγνωστ${r.keys.length > 1 ? "α" : "ο"} κλειδ${r.keys.length > 1 ? "ιά" : "ί"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Μη έγκυρο κλειδί στο ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Μη έγκυρη είσοδος";
                  case "invalid_element":
                    return `Μη έγκυρη τιμή στο ${r.origin}`;
                }
              }),
          };
        },
        "en",
        0,
        oa,
        "eo",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "karaktrojn", verb: "havi" },
                file: { unit: "bajtojn", verb: "havi" },
                array: { unit: "elementojn", verb: "havi" },
                set: { unit: "elementojn", verb: "havi" },
              }),
              (t = {
                regex: "enigo",
                email: "retadreso",
                url: "URL",
                emoji: "emoĝio",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO-datotempo",
                date: "ISO-dato",
                time: "ISO-tempo",
                duration: "ISO-daŭro",
                ipv4: "IPv4-adreso",
                ipv6: "IPv6-adreso",
                cidrv4: "IPv4-rango",
                cidrv6: "IPv6-rango",
                base64: "64-ume kodita karaktraro",
                base64url: "URL-64-ume kodita karaktraro",
                json_string: "JSON-karaktraro",
                e164: "E.164-nombro",
                jwt: "JWT",
                template_literal: "enigo",
              }),
              (i = {
                nan: "NaN",
                number: "nombro",
                array: "tabelo",
                null: "senvalora",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Nevalida enigo: atendiĝis instanceof ${r.expected}, riceviĝis ${n}`;
                    return `Nevalida enigo: atendiĝis ${e}, riceviĝis ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Nevalida enigo: atendiĝis ${a1(r.values[0])}`;
                    return `Nevalida opcio: atendiĝis unu el ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Tro granda: atendiĝis ke ${r.origin ?? "valoro"} havu ${t}${r.maximum.toString()} ${i.unit ?? "elementojn"}`;
                    return `Tro granda: atendiĝis ke ${r.origin ?? "valoro"} havu ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Tro malgranda: atendiĝis ke ${r.origin} havu ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Tro malgranda: atendiĝis ke ${r.origin} estu ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Nevalida karaktraro: devas komenciĝi per "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Nevalida karaktraro: devas finiĝi per "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Nevalida karaktraro: devas inkluzivi "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Nevalida karaktraro: devas kongrui kun la modelo ${r.pattern}`;
                    return `Nevalida ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Nevalida nombro: devas esti oblo de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Nekonata${r.keys.length > 1 ? "j" : ""} ŝlosilo${r.keys.length > 1 ? "j" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Nevalida ŝlosilo en ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Nevalida enigo";
                  case "invalid_element":
                    return `Nevalida valoro en ${r.origin}`;
                }
              }),
          };
        },
        "es",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caracteres", verb: "tener" },
                file: { unit: "bytes", verb: "tener" },
                array: { unit: "elementos", verb: "tener" },
                set: { unit: "elementos", verb: "tener" },
              }),
              (t = {
                regex: "entrada",
                email: "dirección de correo electrónico",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "fecha y hora ISO",
                date: "fecha ISO",
                time: "hora ISO",
                duration: "duración ISO",
                ipv4: "dirección IPv4",
                ipv6: "dirección IPv6",
                cidrv4: "rango IPv4",
                cidrv6: "rango IPv6",
                base64: "cadena codificada en base64",
                base64url: "URL codificada en base64",
                json_string: "cadena JSON",
                e164: "número E.164",
                jwt: "JWT",
                template_literal: "entrada",
              }),
              (i = {
                nan: "NaN",
                string: "texto",
                number: "número",
                boolean: "booleano",
                array: "arreglo",
                object: "objeto",
                set: "conjunto",
                file: "archivo",
                date: "fecha",
                bigint: "número grande",
                symbol: "símbolo",
                undefined: "indefinido",
                null: "nulo",
                function: "función",
                map: "mapa",
                record: "registro",
                tuple: "tupla",
                enum: "enumeración",
                union: "unión",
                literal: "literal",
                promise: "promesa",
                void: "vacío",
                never: "nunca",
                unknown: "desconocido",
                any: "cualquiera",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Entrada inv\xe1lida: se esperaba instanceof ${r.expected}, recibido ${n}`;
                    return `Entrada inv\xe1lida: se esperaba ${e}, recibido ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Entrada inv\xe1lida: se esperaba ${a1(r.values[0])}`;
                    return `Opci\xf3n inv\xe1lida: se esperaba una de ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `Demasiado grande: se esperaba que ${s ?? "valor"} tuviera ${t}${r.maximum.toString()} ${n.unit ?? "elementos"}`;
                    return `Demasiado grande: se esperaba que ${s ?? "valor"} fuera ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `Demasiado peque\xf1o: se esperaba que ${s} tuviera ${t}${r.minimum.toString()} ${n.unit}`;
                    return `Demasiado peque\xf1o: se esperaba que ${s} fuera ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Cadena inv\xe1lida: debe comenzar con "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Cadena inv\xe1lida: debe terminar en "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Cadena inv\xe1lida: debe incluir "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Cadena inv\xe1lida: debe coincidir con el patr\xf3n ${r.pattern}`;
                    return `Inv\xe1lido ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `N\xfamero inv\xe1lido: debe ser m\xfaltiplo de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Llave${r.keys.length > 1 ? "s" : ""} desconocida${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Llave inv\xe1lida en ${i[r.origin] ?? r.origin}`;
                  case "invalid_union":
                  default:
                    return "Entrada inválida";
                  case "invalid_element":
                    return `Valor inv\xe1lido en ${i[r.origin] ?? r.origin}`;
                }
              }),
          };
        },
        "fa",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "کاراکتر", verb: "داشته باشد" },
                file: { unit: "بایت", verb: "داشته باشد" },
                array: { unit: "آیتم", verb: "داشته باشد" },
                set: { unit: "آیتم", verb: "داشته باشد" },
              }),
              (t = {
                regex: "ورودی",
                email: "آدرس ایمیل",
                url: "URL",
                emoji: "ایموجی",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "تاریخ و زمان ایزو",
                date: "تاریخ ایزو",
                time: "زمان ایزو",
                duration: "مدت زمان ایزو",
                ipv4: "IPv4 آدرس",
                ipv6: "IPv6 آدرس",
                cidrv4: "IPv4 دامنه",
                cidrv6: "IPv6 دامنه",
                base64: "base64-encoded رشته",
                base64url: "base64url-encoded رشته",
                json_string: "JSON رشته",
                e164: "E.164 عدد",
                jwt: "JWT",
                template_literal: "ورودی",
              }),
              (i = { nan: "NaN", number: "عدد", array: "آرایه" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `ورودی نامعتبر: می‌بایست instanceof ${r.expected} می‌بود، ${n} دریافت شد`;
                    return `ورودی نامعتبر: می‌بایست ${e} می‌بود، ${n} دریافت شد`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `ورودی نامعتبر: می‌بایست ${a1(r.values[0])} می‌بود`;
                    return `گزینه نامعتبر: می‌بایست یکی از ${aA(r.values, "|")} می‌بود`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `خیلی بزرگ: ${r.origin ?? "مقدار"} باید ${t}${r.maximum.toString()} ${i.unit ?? "عنصر"} باشد`;
                    return `خیلی بزرگ: ${r.origin ?? "مقدار"} باید ${t}${r.maximum.toString()} باشد`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `خیلی کوچک: ${r.origin} باید ${t}${r.minimum.toString()} ${i.unit} باشد`;
                    return `خیلی کوچک: ${r.origin} باید ${t}${r.minimum.toString()} باشد`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `رشته نامعتبر: باید با "${r.prefix}" شروع شود`;
                    if ("ends_with" === r.format)
                      return `رشته نامعتبر: باید با "${r.suffix}" تمام شود`;
                    if ("includes" === r.format)
                      return `رشته نامعتبر: باید شامل "${r.includes}" باشد`;
                    if ("regex" === r.format)
                      return `رشته نامعتبر: باید با الگوی ${r.pattern} مطابقت داشته باشد`;
                    return `${t[r.format] ?? r.format} نامعتبر`;
                  case "not_multiple_of":
                    return `عدد نامعتبر: باید مضرب ${r.divisor} باشد`;
                  case "unrecognized_keys":
                    return `کلید${r.keys.length > 1 ? "های" : ""} ناشناس: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `کلید ناشناس در ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "ورودی نامعتبر";
                  case "invalid_element":
                    return `مقدار نامعتبر در ${r.origin}`;
                }
              }),
          };
        },
        "fi",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "merkkiä", subject: "merkkijonon" },
                file: { unit: "tavua", subject: "tiedoston" },
                array: { unit: "alkiota", subject: "listan" },
                set: { unit: "alkiota", subject: "joukon" },
                number: { unit: "", subject: "luvun" },
                bigint: { unit: "", subject: "suuren kokonaisluvun" },
                int: { unit: "", subject: "kokonaisluvun" },
                date: { unit: "", subject: "päivämäärän" },
              }),
              (t = {
                regex: "säännöllinen lauseke",
                email: "sähköpostiosoite",
                url: "URL-osoite",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO-aikaleima",
                date: "ISO-päivämäärä",
                time: "ISO-aika",
                duration: "ISO-kesto",
                ipv4: "IPv4-osoite",
                ipv6: "IPv6-osoite",
                cidrv4: "IPv4-alue",
                cidrv6: "IPv6-alue",
                base64: "base64-koodattu merkkijono",
                base64url: "base64url-koodattu merkkijono",
                json_string: "JSON-merkkijono",
                e164: "E.164-luku",
                jwt: "JWT",
                template_literal: "templaattimerkkijono",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Virheellinen tyyppi: odotettiin instanceof ${r.expected}, oli ${n}`;
                    return `Virheellinen tyyppi: odotettiin ${e}, oli ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Virheellinen sy\xf6te: t\xe4ytyy olla ${a1(r.values[0])}`;
                    return `Virheellinen valinta: t\xe4ytyy olla yksi seuraavista: ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Liian suuri: ${i.subject} t\xe4ytyy olla ${t}${r.maximum.toString()} ${i.unit}`.trim();
                    return `Liian suuri: arvon t\xe4ytyy olla ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Liian pieni: ${i.subject} t\xe4ytyy olla ${t}${r.minimum.toString()} ${i.unit}`.trim();
                    return `Liian pieni: arvon t\xe4ytyy olla ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Virheellinen sy\xf6te: t\xe4ytyy alkaa "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Virheellinen sy\xf6te: t\xe4ytyy loppua "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Virheellinen sy\xf6te: t\xe4ytyy sis\xe4lt\xe4\xe4 "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Virheellinen sy\xf6te: t\xe4ytyy vastata s\xe4\xe4nn\xf6llist\xe4 lauseketta ${r.pattern}`;
                    return `Virheellinen ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Virheellinen luku: t\xe4ytyy olla luvun ${r.divisor} monikerta`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return "Virheellinen avain tietueessa";
                  case "invalid_union":
                    return "Virheellinen unioni";
                  case "invalid_element":
                    return "Virheellinen arvo joukossa";
                  default:
                    return "Virheellinen syöte";
                }
              }),
          };
        },
        "fr",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caractères", verb: "avoir" },
                file: { unit: "octets", verb: "avoir" },
                array: { unit: "éléments", verb: "avoir" },
                set: { unit: "éléments", verb: "avoir" },
              }),
              (t = {
                regex: "entrée",
                email: "adresse e-mail",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "date et heure ISO",
                date: "date ISO",
                time: "heure ISO",
                duration: "durée ISO",
                ipv4: "adresse IPv4",
                ipv6: "adresse IPv6",
                cidrv4: "plage IPv4",
                cidrv6: "plage IPv6",
                base64: "chaîne encodée en base64",
                base64url: "chaîne encodée en base64url",
                json_string: "chaîne JSON",
                e164: "numéro E.164",
                jwt: "JWT",
                template_literal: "entrée",
              }),
              (i = {
                string: "chaîne",
                number: "nombre",
                int: "entier",
                boolean: "booléen",
                bigint: "grand entier",
                symbol: "symbole",
                undefined: "indéfini",
                null: "null",
                never: "jamais",
                void: "vide",
                date: "date",
                array: "tableau",
                object: "objet",
                tuple: "tuple",
                record: "enregistrement",
                map: "carte",
                set: "ensemble",
                file: "fichier",
                nonoptional: "non-optionnel",
                nan: "NaN",
                function: "fonction",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Entr\xe9e invalide : instanceof ${r.expected} attendu, ${n} re\xe7u`;
                    return `Entr\xe9e invalide : ${e} attendu, ${n} re\xe7u`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Entr\xe9e invalide : ${a1(r.values[0])} attendu`;
                    return `Option invalide : une valeur parmi ${aA(r.values, "|")} attendue`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      n = e[r.origin] ?? null;
                    if (n)
                      return `Trop grand : ${i[r.origin] ?? "valeur"} doit ${n.verb} ${t}${r.maximum.toString()} ${n.unit ?? "élément(s)"}`;
                    return `Trop grand : ${i[r.origin] ?? "valeur"} doit \xeatre ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      n = e[r.origin] ?? null;
                    if (n)
                      return `Trop petit : ${i[r.origin] ?? "valeur"} doit ${n.verb} ${t}${r.minimum.toString()} ${n.unit}`;
                    return `Trop petit : ${i[r.origin] ?? "valeur"} doit \xeatre ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Cha\xeene invalide : doit commencer par "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Cha\xeene invalide : doit se terminer par "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Cha\xeene invalide : doit inclure "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Cha\xeene invalide : doit correspondre au mod\xe8le ${r.pattern}`;
                    return `${t[r.format] ?? r.format} invalide`;
                  case "not_multiple_of":
                    return `Nombre invalide : doit \xeatre un multiple de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Cl\xe9${r.keys.length > 1 ? "s" : ""} non reconnue${r.keys.length > 1 ? "s" : ""} : ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Cl\xe9 invalide dans ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Entrée invalide";
                  case "invalid_element":
                    return `Valeur invalide dans ${r.origin}`;
                }
              }),
          };
        },
        "frCA",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caractères", verb: "avoir" },
                file: { unit: "octets", verb: "avoir" },
                array: { unit: "éléments", verb: "avoir" },
                set: { unit: "éléments", verb: "avoir" },
              }),
              (t = {
                regex: "entrée",
                email: "adresse courriel",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "date-heure ISO",
                date: "date ISO",
                time: "heure ISO",
                duration: "durée ISO",
                ipv4: "adresse IPv4",
                ipv6: "adresse IPv6",
                cidrv4: "plage IPv4",
                cidrv6: "plage IPv6",
                base64: "chaîne encodée en base64",
                base64url: "chaîne encodée en base64url",
                json_string: "chaîne JSON",
                e164: "numéro E.164",
                jwt: "JWT",
                template_literal: "entrée",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Entr\xe9e invalide : attendu instanceof ${r.expected}, re\xe7u ${n}`;
                    return `Entr\xe9e invalide : attendu ${e}, re\xe7u ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Entr\xe9e invalide : attendu ${a1(r.values[0])}`;
                    return `Option invalide : attendu l'une des valeurs suivantes ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "≤" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Trop grand : attendu que ${r.origin ?? "la valeur"} ait ${t}${r.maximum.toString()} ${i.unit}`;
                    return `Trop grand : attendu que ${r.origin ?? "la valeur"} soit ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? "≥" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Trop petit : attendu que ${r.origin} ait ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Trop petit : attendu que ${r.origin} soit ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Cha\xeene invalide : doit commencer par "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Cha\xeene invalide : doit se terminer par "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Cha\xeene invalide : doit inclure "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Cha\xeene invalide : doit correspondre au motif ${r.pattern}`;
                    return `${t[r.format] ?? r.format} invalide`;
                  case "not_multiple_of":
                    return `Nombre invalide : doit \xeatre un multiple de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Cl\xe9${r.keys.length > 1 ? "s" : ""} non reconnue${r.keys.length > 1 ? "s" : ""} : ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Cl\xe9 invalide dans ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Entrée invalide";
                  case "invalid_element":
                    return `Valeur invalide dans ${r.origin}`;
                }
              }),
          };
        },
        "he",
        0,
        function () {
          let e, t, i, r, n, s, a, o, u;
          return {
            localeError:
              ((e = {
                string: { label: "מחרוזת", gender: "f" },
                number: { label: "מספר", gender: "m" },
                boolean: { label: "ערך בוליאני", gender: "m" },
                bigint: { label: "BigInt", gender: "m" },
                date: { label: "תאריך", gender: "m" },
                array: { label: "מערך", gender: "m" },
                object: { label: "אובייקט", gender: "m" },
                null: { label: "ערך ריק (null)", gender: "m" },
                undefined: { label: "ערך לא מוגדר (undefined)", gender: "m" },
                symbol: { label: "סימבול (Symbol)", gender: "m" },
                function: { label: "פונקציה", gender: "f" },
                map: { label: "מפה (Map)", gender: "f" },
                set: { label: "קבוצה (Set)", gender: "f" },
                file: { label: "קובץ", gender: "m" },
                promise: { label: "Promise", gender: "m" },
                NaN: { label: "NaN", gender: "m" },
                unknown: { label: "ערך לא ידוע", gender: "m" },
                value: { label: "ערך", gender: "m" },
              }),
              (t = {
                string: { unit: "תווים", shortLabel: "קצר", longLabel: "ארוך" },
                file: { unit: "בייטים", shortLabel: "קטן", longLabel: "גדול" },
                array: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
                set: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
                number: { unit: "", shortLabel: "קטן", longLabel: "גדול" },
              }),
              (i = (t) => (t ? e[t] : void 0)),
              (r = (t) => {
                let r = i(t);
                return r ? r.label : (t ?? e.unknown.label);
              }),
              (n = (e) => `ה${r(e)}`),
              (s = (e) => {
                let t = i(e);
                return "f" === (t?.gender ?? "m")
                  ? "צריכה להיות"
                  : "צריך להיות";
              }),
              (a = (e) => (e ? (t[e] ?? null) : null)),
              (o = {
                regex: { label: "קלט", gender: "m" },
                email: { label: "כתובת אימייל", gender: "f" },
                url: { label: "כתובת רשת", gender: "f" },
                emoji: { label: "אימוג'י", gender: "m" },
                uuid: { label: "UUID", gender: "m" },
                nanoid: { label: "nanoid", gender: "m" },
                guid: { label: "GUID", gender: "m" },
                cuid: { label: "cuid", gender: "m" },
                cuid2: { label: "cuid2", gender: "m" },
                ulid: { label: "ULID", gender: "m" },
                xid: { label: "XID", gender: "m" },
                ksuid: { label: "KSUID", gender: "m" },
                datetime: { label: "תאריך וזמן ISO", gender: "m" },
                date: { label: "תאריך ISO", gender: "m" },
                time: { label: "זמן ISO", gender: "m" },
                duration: { label: "משך זמן ISO", gender: "m" },
                ipv4: { label: "כתובת IPv4", gender: "f" },
                ipv6: { label: "כתובת IPv6", gender: "f" },
                cidrv4: { label: "טווח IPv4", gender: "m" },
                cidrv6: { label: "טווח IPv6", gender: "m" },
                base64: { label: "מחרוזת בבסיס 64", gender: "f" },
                base64url: {
                  label: "מחרוזת בבסיס 64 לכתובות רשת",
                  gender: "f",
                },
                json_string: { label: "מחרוזת JSON", gender: "f" },
                e164: { label: "מספר E.164", gender: "m" },
                jwt: { label: "JWT", gender: "m" },
                ends_with: { label: "קלט", gender: "m" },
                includes: { label: "קלט", gender: "m" },
                lowercase: { label: "קלט", gender: "m" },
                starts_with: { label: "קלט", gender: "m" },
                uppercase: { label: "קלט", gender: "m" },
              }),
              (u = { nan: "NaN" }),
              (t) => {
                switch (t.code) {
                  case "invalid_type": {
                    let i = t.expected,
                      n = u[i ?? ""] ?? r(i),
                      s = oi(t.input),
                      a = u[s] ?? e[s]?.label ?? s;
                    if (/^[A-Z]/.test(t.expected))
                      return `קלט לא תקין: צריך להיות instanceof ${t.expected}, התקבל ${a}`;
                    return `קלט לא תקין: צריך להיות ${n}, התקבל ${a}`;
                  }
                  case "invalid_value": {
                    if (1 === t.values.length)
                      return `ערך לא תקין: הערך חייב להיות ${a1(t.values[0])}`;
                    let e = t.values.map((e) => a1(e));
                    if (2 === t.values.length)
                      return `ערך לא תקין: האפשרויות המתאימות הן ${e[0]} או ${e[1]}`;
                    let i = e[e.length - 1],
                      r = e.slice(0, -1).join(", ");
                    return `ערך לא תקין: האפשרויות המתאימות הן ${r} או ${i}`;
                  }
                  case "too_big": {
                    let e = a(t.origin),
                      i = n(t.origin ?? "value");
                    if ("string" === t.origin)
                      return `${e?.longLabel ?? "ארוך"} מדי: ${i} צריכה להכיל ${t.maximum.toString()} ${e?.unit ?? ""} ${t.inclusive ? "או פחות" : "לכל היותר"}`.trim();
                    if ("number" === t.origin) {
                      let e = t.inclusive
                        ? `קטן או שווה ל-${t.maximum}`
                        : `קטן מ-${t.maximum}`;
                      return `גדול מדי: ${i} צריך להיות ${e}`;
                    }
                    if ("array" === t.origin || "set" === t.origin) {
                      let r = "set" === t.origin ? "צריכה" : "צריך",
                        n = t.inclusive
                          ? `${t.maximum} ${e?.unit ?? ""} או פחות`
                          : `פחות מ-${t.maximum} ${e?.unit ?? ""}`;
                      return `גדול מדי: ${i} ${r} להכיל ${n}`.trim();
                    }
                    let r = t.inclusive ? "<=" : "<",
                      o = s(t.origin ?? "value");
                    if (e?.unit)
                      return `${e.longLabel} מדי: ${i} ${o} ${r}${t.maximum.toString()} ${e.unit}`;
                    return `${e?.longLabel ?? "גדול"} מדי: ${i} ${o} ${r}${t.maximum.toString()}`;
                  }
                  case "too_small": {
                    let e = a(t.origin),
                      i = n(t.origin ?? "value");
                    if ("string" === t.origin)
                      return `${e?.shortLabel ?? "קצר"} מדי: ${i} צריכה להכיל ${t.minimum.toString()} ${e?.unit ?? ""} ${t.inclusive ? "או יותר" : "לפחות"}`.trim();
                    if ("number" === t.origin) {
                      let e = t.inclusive
                        ? `גדול או שווה ל-${t.minimum}`
                        : `גדול מ-${t.minimum}`;
                      return `קטן מדי: ${i} צריך להיות ${e}`;
                    }
                    if ("array" === t.origin || "set" === t.origin) {
                      let r = "set" === t.origin ? "צריכה" : "צריך";
                      if (1 === t.minimum && t.inclusive) {
                        let e = (t.origin, "לפחות פריט אחד");
                        return `קטן מדי: ${i} ${r} להכיל ${e}`;
                      }
                      let n = t.inclusive
                        ? `${t.minimum} ${e?.unit ?? ""} או יותר`
                        : `יותר מ-${t.minimum} ${e?.unit ?? ""}`;
                      return `קטן מדי: ${i} ${r} להכיל ${n}`.trim();
                    }
                    let r = t.inclusive ? ">=" : ">",
                      o = s(t.origin ?? "value");
                    if (e?.unit)
                      return `${e.shortLabel} מדי: ${i} ${o} ${r}${t.minimum.toString()} ${e.unit}`;
                    return `${e?.shortLabel ?? "קטן"} מדי: ${i} ${o} ${r}${t.minimum.toString()}`;
                  }
                  case "invalid_format": {
                    if ("starts_with" === t.format)
                      return `המחרוזת חייבת להתחיל ב "${t.prefix}"`;
                    if ("ends_with" === t.format)
                      return `המחרוזת חייבת להסתיים ב "${t.suffix}"`;
                    if ("includes" === t.format)
                      return `המחרוזת חייבת לכלול "${t.includes}"`;
                    if ("regex" === t.format)
                      return `המחרוזת חייבת להתאים לתבנית ${t.pattern}`;
                    let e = o[t.format],
                      i = e?.label ?? t.format,
                      r = e?.gender ?? "m";
                    return `${i} לא ${"f" === r ? "תקינה" : "תקין"}`;
                  }
                  case "not_multiple_of":
                    return `מספר לא תקין: חייב להיות מכפלה של ${t.divisor}`;
                  case "unrecognized_keys":
                    return `מפתח${t.keys.length > 1 ? "ות" : ""} לא מזוה${t.keys.length > 1 ? "ים" : "ה"}: ${aA(t.keys, ", ")}`;
                  case "invalid_key":
                    return "שדה לא תקין באובייקט";
                  case "invalid_union":
                  default:
                    return "קלט לא תקין";
                  case "invalid_element": {
                    let e = n(t.origin ?? "array");
                    return `ערך לא תקין ב${e}`;
                  }
                }
              }),
          };
        },
        "hr",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "znakova", verb: "imati" },
                file: { unit: "bajtova", verb: "imati" },
                array: { unit: "stavki", verb: "imati" },
                set: { unit: "stavki", verb: "imati" },
              }),
              (t = {
                regex: "unos",
                email: "email adresa",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO datum i vrijeme",
                date: "ISO datum",
                time: "ISO vrijeme",
                duration: "ISO trajanje",
                ipv4: "IPv4 adresa",
                ipv6: "IPv6 adresa",
                cidrv4: "IPv4 raspon",
                cidrv6: "IPv6 raspon",
                base64: "base64 kodirani tekst",
                base64url: "base64url kodirani tekst",
                json_string: "JSON tekst",
                e164: "E.164 broj",
                jwt: "JWT",
                template_literal: "unos",
              }),
              (i = {
                nan: "NaN",
                string: "tekst",
                number: "broj",
                boolean: "boolean",
                array: "niz",
                object: "objekt",
                set: "skup",
                file: "datoteka",
                date: "datum",
                bigint: "bigint",
                symbol: "simbol",
                undefined: "undefined",
                null: "null",
                function: "funkcija",
                map: "mapa",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Neispravan unos: očekuje se instanceof ${r.expected}, a primljeno je ${n}`;
                    return `Neispravan unos: očekuje se ${e}, a primljeno je ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Neispravna vrijednost: očekivano ${a1(r.values[0])}`;
                    return `Neispravna opcija: očekivano jedno od ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `Preveliko: očekivano da ${s ?? "vrijednost"} ima ${t}${r.maximum.toString()} ${n.unit ?? "elemenata"}`;
                    return `Preveliko: očekivano da ${s ?? "vrijednost"} bude ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      n = e[r.origin] ?? null,
                      s = i[r.origin] ?? r.origin;
                    if (n)
                      return `Premalo: očekivano da ${s} ima ${t}${r.minimum.toString()} ${n.unit}`;
                    return `Premalo: očekivano da ${s} bude ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Neispravan tekst: mora započinjati s "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Neispravan tekst: mora završavati s "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Neispravan tekst: mora sadržavati "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Neispravan tekst: mora odgovarati uzorku ${r.pattern}`;
                    return `Neispravna ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Neispravan broj: mora biti višekratnik od ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Neprepoznat${r.keys.length > 1 ? "i ključevi" : " ključ"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Neispravan ključ u ${i[r.origin] ?? r.origin}`;
                  case "invalid_union":
                  default:
                    return "Neispravan unos";
                  case "invalid_element":
                    return `Neispravna vrijednost u ${i[r.origin] ?? r.origin}`;
                }
              }),
          };
        },
        "hu",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "karakter", verb: "legyen" },
                file: { unit: "byte", verb: "legyen" },
                array: { unit: "elem", verb: "legyen" },
                set: { unit: "elem", verb: "legyen" },
              }),
              (t = {
                regex: "bemenet",
                email: "email cím",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO időbélyeg",
                date: "ISO dátum",
                time: "ISO idő",
                duration: "ISO időintervallum",
                ipv4: "IPv4 cím",
                ipv6: "IPv6 cím",
                cidrv4: "IPv4 tartomány",
                cidrv6: "IPv6 tartomány",
                base64: "base64-kódolt string",
                base64url: "base64url-kódolt string",
                json_string: "JSON string",
                e164: "E.164 szám",
                jwt: "JWT",
                template_literal: "bemenet",
              }),
              (i = { nan: "NaN", number: "szám", array: "tömb" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `\xc9rv\xe9nytelen bemenet: a v\xe1rt \xe9rt\xe9k instanceof ${r.expected}, a kapott \xe9rt\xe9k ${n}`;
                    return `\xc9rv\xe9nytelen bemenet: a v\xe1rt \xe9rt\xe9k ${e}, a kapott \xe9rt\xe9k ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `\xc9rv\xe9nytelen bemenet: a v\xe1rt \xe9rt\xe9k ${a1(r.values[0])}`;
                    return `\xc9rv\xe9nytelen opci\xf3: valamelyik \xe9rt\xe9k v\xe1rt ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `T\xfal nagy: ${r.origin ?? "érték"} m\xe9rete t\xfal nagy ${t}${r.maximum.toString()} ${i.unit ?? "elem"}`;
                    return `T\xfal nagy: a bemeneti \xe9rt\xe9k ${r.origin ?? "érték"} t\xfal nagy: ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `T\xfal kicsi: a bemeneti \xe9rt\xe9k ${r.origin} m\xe9rete t\xfal kicsi ${t}${r.minimum.toString()} ${i.unit}`;
                    return `T\xfal kicsi: a bemeneti \xe9rt\xe9k ${r.origin} t\xfal kicsi ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `\xc9rv\xe9nytelen string: "${r.prefix}" \xe9rt\xe9kkel kell kezdődnie`;
                    if ("ends_with" === r.format)
                      return `\xc9rv\xe9nytelen string: "${r.suffix}" \xe9rt\xe9kkel kell v\xe9gződnie`;
                    if ("includes" === r.format)
                      return `\xc9rv\xe9nytelen string: "${r.includes}" \xe9rt\xe9ket kell tartalmaznia`;
                    if ("regex" === r.format)
                      return `\xc9rv\xe9nytelen string: ${r.pattern} mint\xe1nak kell megfelelnie`;
                    return `\xc9rv\xe9nytelen ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `\xc9rv\xe9nytelen sz\xe1m: ${r.divisor} t\xf6bbsz\xf6r\xf6s\xe9nek kell lennie`;
                  case "unrecognized_keys":
                    return `Ismeretlen kulcs${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `\xc9rv\xe9nytelen kulcs ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Érvénytelen bemenet";
                  case "invalid_element":
                    return `\xc9rv\xe9nytelen \xe9rt\xe9k: ${r.origin}`;
                }
              }),
          };
        },
        "hy",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: {
                  unit: { one: "նշան", many: "նշաններ" },
                  verb: "ունենալ",
                },
                file: {
                  unit: { one: "բայթ", many: "բայթեր" },
                  verb: "ունենալ",
                },
                array: {
                  unit: { one: "տարր", many: "տարրեր" },
                  verb: "ունենալ",
                },
                set: { unit: { one: "տարր", many: "տարրեր" }, verb: "ունենալ" },
              }),
              (t = {
                regex: "մուտք",
                email: "էլ. հասցե",
                url: "URL",
                emoji: "էմոջի",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO ամսաթիվ և ժամ",
                date: "ISO ամսաթիվ",
                time: "ISO ժամ",
                duration: "ISO տևողություն",
                ipv4: "IPv4 հասցե",
                ipv6: "IPv6 հասցե",
                cidrv4: "IPv4 միջակայք",
                cidrv6: "IPv6 միջակայք",
                base64: "base64 ձևաչափով տող",
                base64url: "base64url ձևաչափով տող",
                json_string: "JSON տող",
                e164: "E.164 համար",
                jwt: "JWT",
                template_literal: "մուտք",
              }),
              (i = { nan: "NaN", number: "թիվ", array: "զանգված" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Սխալ մուտքագրում․ սպասվում էր instanceof ${r.expected}, ստացվել է ${n}`;
                    return `Սխալ մուտքագրում․ սպասվում էր ${e}, ստացվել է ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Սխալ մուտքագրում․ սպասվում էր ${a1(r.values[1])}`;
                    return `Սխալ տարբերակ․ սպասվում էր հետևյալներից մեկը՝ ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cw(Number(r.maximum), i.unit.one, i.unit.many);
                      return `Չափազանց մեծ արժեք․ սպասվում է, որ ${cS(r.origin ?? "արժեք")} կունենա ${t}${r.maximum.toString()} ${e}`;
                    }
                    return `Չափազանց մեծ արժեք․ սպասվում է, որ ${cS(r.origin ?? "արժեք")} լինի ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cw(Number(r.minimum), i.unit.one, i.unit.many);
                      return `Չափազանց փոքր արժեք․ սպասվում է, որ ${cS(r.origin)} կունենա ${t}${r.minimum.toString()} ${e}`;
                    }
                    return `Չափազանց փոքր արժեք․ սպասվում է, որ ${cS(r.origin)} լինի ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Սխալ տող․ պետք է սկսվի "${r.prefix}"-ով`;
                    if ("ends_with" === r.format)
                      return `Սխալ տող․ պետք է ավարտվի "${r.suffix}"-ով`;
                    if ("includes" === r.format)
                      return `Սխալ տող․ պետք է պարունակի "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Սխալ տող․ պետք է համապատասխանի ${r.pattern} ձևաչափին`;
                    return `Սխալ ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Սխալ թիվ․ պետք է բազմապատիկ լինի ${r.divisor}-ի`;
                  case "unrecognized_keys":
                    return `Չճանաչված բանալի${r.keys.length > 1 ? "ներ" : ""}. ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Սխալ բանալի ${cS(r.origin)}-ում`;
                  case "invalid_union":
                  default:
                    return "Սխալ մուտքագրում";
                  case "invalid_element":
                    return `Սխալ արժեք ${cS(r.origin)}-ում`;
                }
              }),
          };
        },
        "id",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "karakter", verb: "memiliki" },
                file: { unit: "byte", verb: "memiliki" },
                array: { unit: "item", verb: "memiliki" },
                set: { unit: "item", verb: "memiliki" },
              }),
              (t = {
                regex: "input",
                email: "alamat email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "tanggal dan waktu format ISO",
                date: "tanggal format ISO",
                time: "jam format ISO",
                duration: "durasi format ISO",
                ipv4: "alamat IPv4",
                ipv6: "alamat IPv6",
                cidrv4: "rentang alamat IPv4",
                cidrv6: "rentang alamat IPv6",
                base64: "string dengan enkode base64",
                base64url: "string dengan enkode base64url",
                json_string: "string JSON",
                e164: "angka E.164",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Input tidak valid: diharapkan instanceof ${r.expected}, diterima ${n}`;
                    return `Input tidak valid: diharapkan ${e}, diterima ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Input tidak valid: diharapkan ${a1(r.values[0])}`;
                    return `Pilihan tidak valid: diharapkan salah satu dari ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Terlalu besar: diharapkan ${r.origin ?? "value"} memiliki ${t}${r.maximum.toString()} ${i.unit ?? "elemen"}`;
                    return `Terlalu besar: diharapkan ${r.origin ?? "value"} menjadi ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Terlalu kecil: diharapkan ${r.origin} memiliki ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Terlalu kecil: diharapkan ${r.origin} menjadi ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `String tidak valid: harus dimulai dengan "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `String tidak valid: harus berakhir dengan "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `String tidak valid: harus menyertakan "${r.includes}"`;
                    if ("regex" === r.format)
                      return `String tidak valid: harus sesuai pola ${r.pattern}`;
                    return `${t[r.format] ?? r.format} tidak valid`;
                  case "not_multiple_of":
                    return `Angka tidak valid: harus kelipatan dari ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Kunci tidak dikenali ${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Kunci tidak valid di ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Input tidak valid";
                  case "invalid_element":
                    return `Nilai tidak valid di ${r.origin}`;
                }
              }),
          };
        },
        "is",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "stafi", verb: "að hafa" },
                file: { unit: "bæti", verb: "að hafa" },
                array: { unit: "hluti", verb: "að hafa" },
                set: { unit: "hluti", verb: "að hafa" },
              }),
              (t = {
                regex: "gildi",
                email: "netfang",
                url: "vefslóð",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO dagsetning og tími",
                date: "ISO dagsetning",
                time: "ISO tími",
                duration: "ISO tímalengd",
                ipv4: "IPv4 address",
                ipv6: "IPv6 address",
                cidrv4: "IPv4 range",
                cidrv6: "IPv6 range",
                base64: "base64-encoded strengur",
                base64url: "base64url-encoded strengur",
                json_string: "JSON strengur",
                e164: "E.164 tölugildi",
                jwt: "JWT",
                template_literal: "gildi",
              }),
              (i = { nan: "NaN", number: "númer", array: "fylki" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Rangt gildi: \xde\xfa sl\xf3st inn ${n} \xfear sem \xe1 a\xf0 vera instanceof ${r.expected}`;
                    return `Rangt gildi: \xde\xfa sl\xf3st inn ${n} \xfear sem \xe1 a\xf0 vera ${e}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Rangt gildi: gert r\xe1\xf0 fyrir ${a1(r.values[0])}`;
                    return `\xd3gilt val: m\xe1 vera eitt af eftirfarandi ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Of st\xf3rt: gert er r\xe1\xf0 fyrir a\xf0 ${r.origin ?? "gildi"} hafi ${t}${r.maximum.toString()} ${i.unit ?? "hluti"}`;
                    return `Of st\xf3rt: gert er r\xe1\xf0 fyrir a\xf0 ${r.origin ?? "gildi"} s\xe9 ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Of l\xedti\xf0: gert er r\xe1\xf0 fyrir a\xf0 ${r.origin} hafi ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Of l\xedti\xf0: gert er r\xe1\xf0 fyrir a\xf0 ${r.origin} s\xe9 ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `\xd3gildur strengur: ver\xf0ur a\xf0 byrja \xe1 "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `\xd3gildur strengur: ver\xf0ur a\xf0 enda \xe1 "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `\xd3gildur strengur: ver\xf0ur a\xf0 innihalda "${r.includes}"`;
                    if ("regex" === r.format)
                      return `\xd3gildur strengur: ver\xf0ur a\xf0 fylgja mynstri ${r.pattern}`;
                    return `Rangt ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `R\xf6ng tala: ver\xf0ur a\xf0 vera margfeldi af ${r.divisor}`;
                  case "unrecognized_keys":
                    return `\xd3\xfeekkt ${r.keys.length > 1 ? "ir lyklar" : "ur lykill"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Rangur lykill \xed ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Rangt gildi";
                  case "invalid_element":
                    return `Rangt gildi \xed ${r.origin}`;
                }
              }),
          };
        },
        "it",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caratteri", verb: "avere" },
                file: { unit: "byte", verb: "avere" },
                array: { unit: "elementi", verb: "avere" },
                set: { unit: "elementi", verb: "avere" },
              }),
              (t = {
                regex: "input",
                email: "indirizzo email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "data e ora ISO",
                date: "data ISO",
                time: "ora ISO",
                duration: "durata ISO",
                ipv4: "indirizzo IPv4",
                ipv6: "indirizzo IPv6",
                cidrv4: "intervallo IPv4",
                cidrv6: "intervallo IPv6",
                base64: "stringa codificata in base64",
                base64url: "URL codificata in base64",
                json_string: "stringa JSON",
                e164: "numero E.164",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN", number: "numero", array: "vettore" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Input non valido: atteso instanceof ${r.expected}, ricevuto ${n}`;
                    return `Input non valido: atteso ${e}, ricevuto ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Input non valido: atteso ${a1(r.values[0])}`;
                    return `Opzione non valida: atteso uno tra ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Troppo grande: ${r.origin ?? "valore"} deve avere ${t}${r.maximum.toString()} ${i.unit ?? "elementi"}`;
                    return `Troppo grande: ${r.origin ?? "valore"} deve essere ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Troppo piccolo: ${r.origin} deve avere ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Troppo piccolo: ${r.origin} deve essere ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Stringa non valida: deve iniziare con "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Stringa non valida: deve terminare con "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Stringa non valida: deve includere "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Stringa non valida: deve corrispondere al pattern ${r.pattern}`;
                    return `Input non valido: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Numero non valido: deve essere un multiplo di ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Chiav${r.keys.length > 1 ? "i" : "e"} non riconosciut${r.keys.length > 1 ? "e" : "a"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Chiave non valida in ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Input non valido";
                  case "invalid_element":
                    return `Valore non valido in ${r.origin}`;
                }
              }),
          };
        },
        "ja",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "文字", verb: "である" },
                file: { unit: "バイト", verb: "である" },
                array: { unit: "要素", verb: "である" },
                set: { unit: "要素", verb: "である" },
              }),
              (t = {
                regex: "入力値",
                email: "メールアドレス",
                url: "URL",
                emoji: "絵文字",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO日時",
                date: "ISO日付",
                time: "ISO時刻",
                duration: "ISO期間",
                ipv4: "IPv4アドレス",
                ipv6: "IPv6アドレス",
                cidrv4: "IPv4範囲",
                cidrv6: "IPv6範囲",
                base64: "base64エンコード文字列",
                base64url: "base64urlエンコード文字列",
                json_string: "JSON文字列",
                e164: "E.164番号",
                jwt: "JWT",
                template_literal: "入力値",
              }),
              (i = { nan: "NaN", number: "数値", array: "配列" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `無効な入力: instanceof ${r.expected}が期待されましたが、${n}が入力されました`;
                    return `無効な入力: ${e}が期待されましたが、${n}が入力されました`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `無効な入力: ${a1(r.values[0])}が期待されました`;
                    return `無効な選択: ${aA(r.values, "、")}のいずれかである必要があります`;
                  case "too_big": {
                    let t = r.inclusive ? "以下である" : "より小さい",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `大きすぎる値: ${r.origin ?? "値"}は${r.maximum.toString()}${i.unit ?? "要素"}${t}必要があります`;
                    return `大きすぎる値: ${r.origin ?? "値"}は${r.maximum.toString()}${t}必要があります`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? "以上である" : "より大きい",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `小さすぎる値: ${r.origin}は${r.minimum.toString()}${i.unit}${t}必要があります`;
                    return `小さすぎる値: ${r.origin}は${r.minimum.toString()}${t}必要があります`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `無効な文字列: "${r.prefix}"で始まる必要があります`;
                    if ("ends_with" === r.format)
                      return `無効な文字列: "${r.suffix}"で終わる必要があります`;
                    if ("includes" === r.format)
                      return `無効な文字列: "${r.includes}"を含む必要があります`;
                    if ("regex" === r.format)
                      return `無効な文字列: パターン${r.pattern}に一致する必要があります`;
                    return `無効な${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `無効な数値: ${r.divisor}の倍数である必要があります`;
                  case "unrecognized_keys":
                    return `認識されていないキー${r.keys.length > 1 ? "群" : ""}: ${aA(r.keys, "、")}`;
                  case "invalid_key":
                    return `${r.origin}内の無効なキー`;
                  case "invalid_union":
                  default:
                    return "無効な入力";
                  case "invalid_element":
                    return `${r.origin}内の無効な値`;
                }
              }),
          };
        },
        "ka",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "სიმბოლო", verb: "უნდა შეიცავდეს" },
                file: { unit: "ბაიტი", verb: "უნდა შეიცავდეს" },
                array: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" },
                set: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" },
              }),
              (t = {
                regex: "შეყვანა",
                email: "ელ-ფოსტის მისამართი",
                url: "URL",
                emoji: "ემოჯი",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "თარიღი-დრო",
                date: "თარიღი",
                time: "დრო",
                duration: "ხანგრძლივობა",
                ipv4: "IPv4 მისამართი",
                ipv6: "IPv6 მისამართი",
                cidrv4: "IPv4 დიაპაზონი",
                cidrv6: "IPv6 დიაპაზონი",
                base64: "base64-კოდირებული ველი",
                base64url: "base64url-კოდირებული ველი",
                json_string: "JSON ველი",
                e164: "E.164 ნომერი",
                jwt: "JWT",
                template_literal: "შეყვანა",
              }),
              (i = {
                nan: "NaN",
                number: "რიცხვი",
                string: "ველი",
                boolean: "ბულეანი",
                function: "ფუნქცია",
                array: "მასივი",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `არასწორი შეყვანა: მოსალოდნელი instanceof ${r.expected}, მიღებული ${n}`;
                    return `არასწორი შეყვანა: მოსალოდნელი ${e}, მიღებული ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `არასწორი შეყვანა: მოსალოდნელი ${a1(r.values[0])}`;
                    return `არასწორი ვარიანტი: მოსალოდნელია ერთ-ერთი ${aA(r.values, "|")}-დან`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `ზედმეტად დიდი: მოსალოდნელი ${r.origin ?? "მნიშვნელობა"} ${i.verb} ${t}${r.maximum.toString()} ${i.unit}`;
                    return `ზედმეტად დიდი: მოსალოდნელი ${r.origin ?? "მნიშვნელობა"} იყოს ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `ზედმეტად პატარა: მოსალოდნელი ${r.origin} ${i.verb} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `ზედმეტად პატარა: მოსალოდნელი ${r.origin} იყოს ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `არასწორი ველი: უნდა იწყებოდეს "${r.prefix}"-ით`;
                    if ("ends_with" === r.format)
                      return `არასწორი ველი: უნდა მთავრდებოდეს "${r.suffix}"-ით`;
                    if ("includes" === r.format)
                      return `არასწორი ველი: უნდა შეიცავდეს "${r.includes}"-ს`;
                    if ("regex" === r.format)
                      return `არასწორი ველი: უნდა შეესაბამებოდეს შაბლონს ${r.pattern}`;
                    return `არასწორი ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `არასწორი რიცხვი: უნდა იყოს ${r.divisor}-ის ჯერადი`;
                  case "unrecognized_keys":
                    return `უცნობი გასაღებ${r.keys.length > 1 ? "ები" : "ი"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `არასწორი გასაღები ${r.origin}-ში`;
                  case "invalid_union":
                  default:
                    return "არასწორი შეყვანა";
                  case "invalid_element":
                    return `არასწორი მნიშვნელობა ${r.origin}-ში`;
                }
              }),
          };
        },
        "kh",
        0,
        function () {
          return ck();
        },
        "km",
        0,
        ck,
        "ko",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "문자", verb: "to have" },
                file: { unit: "바이트", verb: "to have" },
                array: { unit: "개", verb: "to have" },
                set: { unit: "개", verb: "to have" },
              }),
              (t = {
                regex: "입력",
                email: "이메일 주소",
                url: "URL",
                emoji: "이모지",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO 날짜시간",
                date: "ISO 날짜",
                time: "ISO 시간",
                duration: "ISO 기간",
                ipv4: "IPv4 주소",
                ipv6: "IPv6 주소",
                cidrv4: "IPv4 범위",
                cidrv6: "IPv6 범위",
                base64: "base64 인코딩 문자열",
                base64url: "base64url 인코딩 문자열",
                json_string: "JSON 문자열",
                e164: "E.164 번호",
                jwt: "JWT",
                template_literal: "입력",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `잘못된 입력: 예상 타입은 instanceof ${r.expected}, 받은 타입은 ${n}입니다`;
                    return `잘못된 입력: 예상 타입은 ${e}, 받은 타입은 ${n}입니다`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `잘못된 입력: 값은 ${a1(r.values[0])} 이어야 합니다`;
                    return `잘못된 옵션: ${aA(r.values, "또는 ")} 중 하나여야 합니다`;
                  case "too_big": {
                    let t = r.inclusive ? "이하" : "미만",
                      i = "미만" === t ? "이어야 합니다" : "여야 합니다",
                      n = e[r.origin] ?? null,
                      s = n?.unit ?? "요소";
                    if (n)
                      return `${r.origin ?? "값"}이 너무 큽니다: ${r.maximum.toString()}${s} ${t}${i}`;
                    return `${r.origin ?? "값"}이 너무 큽니다: ${r.maximum.toString()} ${t}${i}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? "이상" : "초과",
                      i = "이상" === t ? "이어야 합니다" : "여야 합니다",
                      n = e[r.origin] ?? null,
                      s = n?.unit ?? "요소";
                    if (n)
                      return `${r.origin ?? "값"}이 너무 작습니다: ${r.minimum.toString()}${s} ${t}${i}`;
                    return `${r.origin ?? "값"}이 너무 작습니다: ${r.minimum.toString()} ${t}${i}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `잘못된 문자열: "${r.prefix}"(으)로 시작해야 합니다`;
                    if ("ends_with" === r.format)
                      return `잘못된 문자열: "${r.suffix}"(으)로 끝나야 합니다`;
                    if ("includes" === r.format)
                      return `잘못된 문자열: "${r.includes}"을(를) 포함해야 합니다`;
                    if ("regex" === r.format)
                      return `잘못된 문자열: 정규식 ${r.pattern} 패턴과 일치해야 합니다`;
                    return `잘못된 ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `잘못된 숫자: ${r.divisor}의 배수여야 합니다`;
                  case "unrecognized_keys":
                    return `인식할 수 없는 키: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `잘못된 키: ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "잘못된 입력";
                  case "invalid_element":
                    return `잘못된 값: ${r.origin}`;
                }
              }),
          };
        },
        "lt",
        0,
        function () {
          return {
            localeError: (() => {
              let e = {
                string: {
                  unit: { one: "simbolis", few: "simboliai", many: "simbolių" },
                  verb: {
                    smaller: {
                      inclusive: "turi būti ne ilgesnė kaip",
                      notInclusive: "turi būti trumpesnė kaip",
                    },
                    bigger: {
                      inclusive: "turi būti ne trumpesnė kaip",
                      notInclusive: "turi būti ilgesnė kaip",
                    },
                  },
                },
                file: {
                  unit: { one: "baitas", few: "baitai", many: "baitų" },
                  verb: {
                    smaller: {
                      inclusive: "turi būti ne didesnis kaip",
                      notInclusive: "turi būti mažesnis kaip",
                    },
                    bigger: {
                      inclusive: "turi būti ne mažesnis kaip",
                      notInclusive: "turi būti didesnis kaip",
                    },
                  },
                },
                array: {
                  unit: { one: "elementą", few: "elementus", many: "elementų" },
                  verb: {
                    smaller: {
                      inclusive: "turi turėti ne daugiau kaip",
                      notInclusive: "turi turėti mažiau kaip",
                    },
                    bigger: {
                      inclusive: "turi turėti ne mažiau kaip",
                      notInclusive: "turi turėti daugiau kaip",
                    },
                  },
                },
                set: {
                  unit: { one: "elementą", few: "elementus", many: "elementų" },
                  verb: {
                    smaller: {
                      inclusive: "turi turėti ne daugiau kaip",
                      notInclusive: "turi turėti mažiau kaip",
                    },
                    bigger: {
                      inclusive: "turi turėti ne mažiau kaip",
                      notInclusive: "turi turėti daugiau kaip",
                    },
                  },
                },
              };
              function t(t, i, r, n) {
                let s = e[t] ?? null;
                return null === s
                  ? s
                  : {
                      unit: s.unit[i],
                      verb: s.verb[n][r ? "inclusive" : "notInclusive"],
                    };
              }
              let i = {
                  regex: "įvestis",
                  email: "el. pašto adresas",
                  url: "URL",
                  emoji: "jaustukas",
                  uuid: "UUID",
                  uuidv4: "UUIDv4",
                  uuidv6: "UUIDv6",
                  nanoid: "nanoid",
                  guid: "GUID",
                  cuid: "cuid",
                  cuid2: "cuid2",
                  ulid: "ULID",
                  xid: "XID",
                  ksuid: "KSUID",
                  datetime: "ISO data ir laikas",
                  date: "ISO data",
                  time: "ISO laikas",
                  duration: "ISO trukmė",
                  ipv4: "IPv4 adresas",
                  ipv6: "IPv6 adresas",
                  cidrv4: "IPv4 tinklo prefiksas (CIDR)",
                  cidrv6: "IPv6 tinklo prefiksas (CIDR)",
                  base64: "base64 užkoduota eilutė",
                  base64url: "base64url užkoduota eilutė",
                  json_string: "JSON eilutė",
                  e164: "E.164 numeris",
                  jwt: "JWT",
                  template_literal: "įvestis",
                },
                r = {
                  nan: "NaN",
                  number: "skaičius",
                  bigint: "sveikasis skaičius",
                  string: "eilutė",
                  boolean: "loginė reikšmė",
                  undefined: "neapibrėžta reikšmė",
                  function: "funkcija",
                  symbol: "simbolis",
                  array: "masyvas",
                  object: "objektas",
                  null: "nulinė reikšmė",
                };
              return (e) => {
                switch (e.code) {
                  case "invalid_type": {
                    let t = r[e.expected] ?? e.expected,
                      i = oi(e.input),
                      n = r[i] ?? i;
                    if (/^[A-Z]/.test(e.expected))
                      return `Gautas tipas ${n}, o tikėtasi - instanceof ${e.expected}`;
                    return `Gautas tipas ${n}, o tikėtasi - ${t}`;
                  }
                  case "invalid_value":
                    if (1 === e.values.length)
                      return `Privalo būti ${a1(e.values[0])}`;
                    return `Privalo būti vienas iš ${aA(e.values, "|")} pasirinkimų`;
                  case "too_big": {
                    let i = r[e.origin] ?? e.origin,
                      n = t(
                        e.origin,
                        cE(Number(e.maximum)),
                        e.inclusive ?? !1,
                        "smaller",
                      );
                    if (n?.verb)
                      return `${cI(i ?? e.origin ?? "reikšmė")} ${n.verb} ${e.maximum.toString()} ${n.unit ?? "elementų"}`;
                    let s = e.inclusive ? "ne didesnis kaip" : "mažesnis kaip";
                    return `${cI(i ?? e.origin ?? "reikšmė")} turi būti ${s} ${e.maximum.toString()} ${n?.unit}`;
                  }
                  case "too_small": {
                    let i = r[e.origin] ?? e.origin,
                      n = t(
                        e.origin,
                        cE(Number(e.minimum)),
                        e.inclusive ?? !1,
                        "bigger",
                      );
                    if (n?.verb)
                      return `${cI(i ?? e.origin ?? "reikšmė")} ${n.verb} ${e.minimum.toString()} ${n.unit ?? "elementų"}`;
                    let s = e.inclusive ? "ne mažesnis kaip" : "didesnis kaip";
                    return `${cI(i ?? e.origin ?? "reikšmė")} turi būti ${s} ${e.minimum.toString()} ${n?.unit}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === e.format)
                      return `Eilutė privalo prasidėti "${e.prefix}"`;
                    if ("ends_with" === e.format)
                      return `Eilutė privalo pasibaigti "${e.suffix}"`;
                    if ("includes" === e.format)
                      return `Eilutė privalo įtraukti "${e.includes}"`;
                    if ("regex" === e.format)
                      return `Eilutė privalo atitikti ${e.pattern}`;
                    return `Neteisingas ${i[e.format] ?? e.format}`;
                  case "not_multiple_of":
                    return `Skaičius privalo būti ${e.divisor} kartotinis.`;
                  case "unrecognized_keys":
                    return `Neatpažint${e.keys.length > 1 ? "i" : "as"} rakt${e.keys.length > 1 ? "ai" : "as"}: ${aA(e.keys, ", ")}`;
                  case "invalid_key":
                    return "Rastas klaidingas raktas";
                  case "invalid_union":
                  default:
                    return "Klaidinga įvestis";
                  case "invalid_element": {
                    let t = r[e.origin] ?? e.origin;
                    return `${cI(t ?? e.origin ?? "reikšmė")} turi klaidingą įvestį`;
                  }
                }
              };
            })(),
          };
        },
        "mk",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "знаци", verb: "да имаат" },
                file: { unit: "бајти", verb: "да имаат" },
                array: { unit: "ставки", verb: "да имаат" },
                set: { unit: "ставки", verb: "да имаат" },
              }),
              (t = {
                regex: "внес",
                email: "адреса на е-пошта",
                url: "URL",
                emoji: "емоџи",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO датум и време",
                date: "ISO датум",
                time: "ISO време",
                duration: "ISO времетраење",
                ipv4: "IPv4 адреса",
                ipv6: "IPv6 адреса",
                cidrv4: "IPv4 опсег",
                cidrv6: "IPv6 опсег",
                base64: "base64-енкодирана низа",
                base64url: "base64url-енкодирана низа",
                json_string: "JSON низа",
                e164: "E.164 број",
                jwt: "JWT",
                template_literal: "внес",
              }),
              (i = { nan: "NaN", number: "број", array: "низа" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Грешен внес: се очекува instanceof ${r.expected}, примено ${n}`;
                    return `Грешен внес: се очекува ${e}, примено ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Invalid input: expected ${a1(r.values[0])}`;
                    return `Грешана опција: се очекува една ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Премногу голем: се очекува ${r.origin ?? "вредноста"} да има ${t}${r.maximum.toString()} ${i.unit ?? "елементи"}`;
                    return `Премногу голем: се очекува ${r.origin ?? "вредноста"} да биде ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Премногу мал: се очекува ${r.origin} да има ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Премногу мал: се очекува ${r.origin} да биде ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Неважечка низа: мора да започнува со "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Неважечка низа: мора да завршува со "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Неважечка низа: мора да вклучува "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Неважечка низа: мора да одгоара на патернот ${r.pattern}`;
                    return `Invalid ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Грешен број: мора да биде делив со ${r.divisor}`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Грешен клуч во ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Грешен внес";
                  case "invalid_element":
                    return `Грешна вредност во ${r.origin}`;
                }
              }),
          };
        },
        "ms",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "aksara", verb: "mempunyai" },
                file: { unit: "bait", verb: "mempunyai" },
                array: { unit: "elemen", verb: "mempunyai" },
                set: { unit: "elemen", verb: "mempunyai" },
              }),
              (t = {
                regex: "input",
                email: "alamat e-mel",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "tarikh masa ISO",
                date: "tarikh ISO",
                time: "masa ISO",
                duration: "tempoh ISO",
                ipv4: "alamat IPv4",
                ipv6: "alamat IPv6",
                cidrv4: "julat IPv4",
                cidrv6: "julat IPv6",
                base64: "string dikodkan base64",
                base64url: "string dikodkan base64url",
                json_string: "string JSON",
                e164: "nombor E.164",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN", number: "nombor" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Input tidak sah: dijangka instanceof ${r.expected}, diterima ${n}`;
                    return `Input tidak sah: dijangka ${e}, diterima ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Input tidak sah: dijangka ${a1(r.values[0])}`;
                    return `Pilihan tidak sah: dijangka salah satu daripada ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Terlalu besar: dijangka ${r.origin ?? "nilai"} ${i.verb} ${t}${r.maximum.toString()} ${i.unit ?? "elemen"}`;
                    return `Terlalu besar: dijangka ${r.origin ?? "nilai"} adalah ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Terlalu kecil: dijangka ${r.origin} ${i.verb} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Terlalu kecil: dijangka ${r.origin} adalah ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `String tidak sah: mesti bermula dengan "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `String tidak sah: mesti berakhir dengan "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `String tidak sah: mesti mengandungi "${r.includes}"`;
                    if ("regex" === r.format)
                      return `String tidak sah: mesti sepadan dengan corak ${r.pattern}`;
                    return `${t[r.format] ?? r.format} tidak sah`;
                  case "not_multiple_of":
                    return `Nombor tidak sah: perlu gandaan ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Kunci tidak dikenali: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Kunci tidak sah dalam ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Input tidak sah";
                  case "invalid_element":
                    return `Nilai tidak sah dalam ${r.origin}`;
                }
              }),
          };
        },
        "nl",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "tekens", verb: "heeft" },
                file: { unit: "bytes", verb: "heeft" },
                array: { unit: "elementen", verb: "heeft" },
                set: { unit: "elementen", verb: "heeft" },
              }),
              (t = {
                regex: "invoer",
                email: "emailadres",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO datum en tijd",
                date: "ISO datum",
                time: "ISO tijd",
                duration: "ISO duur",
                ipv4: "IPv4-adres",
                ipv6: "IPv6-adres",
                cidrv4: "IPv4-bereik",
                cidrv6: "IPv6-bereik",
                base64: "base64-gecodeerde tekst",
                base64url: "base64 URL-gecodeerde tekst",
                json_string: "JSON string",
                e164: "E.164-nummer",
                jwt: "JWT",
                template_literal: "invoer",
              }),
              (i = { nan: "NaN", number: "getal" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ongeldige invoer: verwacht instanceof ${r.expected}, ontving ${n}`;
                    return `Ongeldige invoer: verwacht ${e}, ontving ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ongeldige invoer: verwacht ${a1(r.values[0])}`;
                    return `Ongeldige optie: verwacht \xe9\xe9n van ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null,
                      n =
                        "date" === r.origin
                          ? "laat"
                          : "string" === r.origin
                            ? "lang"
                            : "groot";
                    if (i)
                      return `Te ${n}: verwacht dat ${r.origin ?? "waarde"} ${t}${r.maximum.toString()} ${i.unit ?? "elementen"} ${i.verb}`;
                    return `Te ${n}: verwacht dat ${r.origin ?? "waarde"} ${t}${r.maximum.toString()} is`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null,
                      n =
                        "date" === r.origin
                          ? "vroeg"
                          : "string" === r.origin
                            ? "kort"
                            : "klein";
                    if (i)
                      return `Te ${n}: verwacht dat ${r.origin} ${t}${r.minimum.toString()} ${i.unit} ${i.verb}`;
                    return `Te ${n}: verwacht dat ${r.origin} ${t}${r.minimum.toString()} is`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ongeldige tekst: moet met "${r.prefix}" beginnen`;
                    if ("ends_with" === r.format)
                      return `Ongeldige tekst: moet op "${r.suffix}" eindigen`;
                    if ("includes" === r.format)
                      return `Ongeldige tekst: moet "${r.includes}" bevatten`;
                    if ("regex" === r.format)
                      return `Ongeldige tekst: moet overeenkomen met patroon ${r.pattern}`;
                    return `Ongeldig: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ongeldig getal: moet een veelvoud van ${r.divisor} zijn`;
                  case "unrecognized_keys":
                    return `Onbekende key${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Ongeldige key in ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Ongeldige invoer";
                  case "invalid_element":
                    return `Ongeldige waarde in ${r.origin}`;
                }
              }),
          };
        },
        "no",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "tegn", verb: "å ha" },
                file: { unit: "bytes", verb: "å ha" },
                array: { unit: "elementer", verb: "å inneholde" },
                set: { unit: "elementer", verb: "å inneholde" },
              }),
              (t = {
                regex: "input",
                email: "e-postadresse",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO dato- og klokkeslett",
                date: "ISO-dato",
                time: "ISO-klokkeslett",
                duration: "ISO-varighet",
                ipv4: "IPv4-område",
                ipv6: "IPv6-område",
                cidrv4: "IPv4-spekter",
                cidrv6: "IPv6-spekter",
                base64: "base64-enkodet streng",
                base64url: "base64url-enkodet streng",
                json_string: "JSON-streng",
                e164: "E.164-nummer",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN", number: "tall", array: "liste" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ugyldig input: forventet instanceof ${r.expected}, fikk ${n}`;
                    return `Ugyldig input: forventet ${e}, fikk ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ugyldig verdi: forventet ${a1(r.values[0])}`;
                    return `Ugyldig valg: forventet en av ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `For stor(t): forventet ${r.origin ?? "value"} til \xe5 ha ${t}${r.maximum.toString()} ${i.unit ?? "elementer"}`;
                    return `For stor(t): forventet ${r.origin ?? "value"} til \xe5 ha ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `For lite(n): forventet ${r.origin} til \xe5 ha ${t}${r.minimum.toString()} ${i.unit}`;
                    return `For lite(n): forventet ${r.origin} til \xe5 ha ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ugyldig streng: m\xe5 starte med "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Ugyldig streng: m\xe5 ende med "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Ugyldig streng: m\xe5 inneholde "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Ugyldig streng: m\xe5 matche m\xf8nsteret ${r.pattern}`;
                    return `Ugyldig ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ugyldig tall: m\xe5 v\xe6re et multiplum av ${r.divisor}`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Ugyldig n\xf8kkel i ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Ugyldig input";
                  case "invalid_element":
                    return `Ugyldig verdi i ${r.origin}`;
                }
              }),
          };
        },
        "ota",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "harf", verb: "olmalıdır" },
                file: { unit: "bayt", verb: "olmalıdır" },
                array: { unit: "unsur", verb: "olmalıdır" },
                set: { unit: "unsur", verb: "olmalıdır" },
              }),
              (t = {
                regex: "giren",
                email: "epostagâh",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO hengâmı",
                date: "ISO tarihi",
                time: "ISO zamanı",
                duration: "ISO müddeti",
                ipv4: "IPv4 nişânı",
                ipv6: "IPv6 nişânı",
                cidrv4: "IPv4 menzili",
                cidrv6: "IPv6 menzili",
                base64: "base64-şifreli metin",
                base64url: "base64url-şifreli metin",
                json_string: "JSON metin",
                e164: "E.164 sayısı",
                jwt: "JWT",
                template_literal: "giren",
              }),
              (i = {
                nan: "NaN",
                number: "numara",
                array: "saf",
                null: "gayb",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `F\xe2sit giren: umulan instanceof ${r.expected}, alınan ${n}`;
                    return `F\xe2sit giren: umulan ${e}, alınan ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `F\xe2sit giren: umulan ${a1(r.values[0])}`;
                    return `F\xe2sit tercih: m\xfbteberler ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Fazla b\xfcy\xfck: ${r.origin ?? "value"}, ${t}${r.maximum.toString()} ${i.unit ?? "elements"} sahip olmalıydı.`;
                    return `Fazla b\xfcy\xfck: ${r.origin ?? "value"}, ${t}${r.maximum.toString()} olmalıydı.`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Fazla k\xfc\xe7\xfck: ${r.origin}, ${t}${r.minimum.toString()} ${i.unit} sahip olmalıydı.`;
                    return `Fazla k\xfc\xe7\xfck: ${r.origin}, ${t}${r.minimum.toString()} olmalıydı.`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `F\xe2sit metin: "${r.prefix}" ile başlamalı.`;
                    if ("ends_with" === r.format)
                      return `F\xe2sit metin: "${r.suffix}" ile bitmeli.`;
                    if ("includes" === r.format)
                      return `F\xe2sit metin: "${r.includes}" ihtiv\xe2 etmeli.`;
                    if ("regex" === r.format)
                      return `F\xe2sit metin: ${r.pattern} nakşına uymalı.`;
                    return `F\xe2sit ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `F\xe2sit sayı: ${r.divisor} katı olmalıydı.`;
                  case "unrecognized_keys":
                    return `Tanınmayan anahtar ${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} i\xe7in tanınmayan anahtar var.`;
                  case "invalid_union":
                    return "Giren tanınamadı.";
                  case "invalid_element":
                    return `${r.origin} i\xe7in tanınmayan kıymet var.`;
                  default:
                    return "Kıymet tanınamadı.";
                }
              }),
          };
        },
        "pl",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "znaków", verb: "mieć" },
                file: { unit: "bajtów", verb: "mieć" },
                array: { unit: "elementów", verb: "mieć" },
                set: { unit: "elementów", verb: "mieć" },
              }),
              (t = {
                regex: "wyrażenie",
                email: "adres email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "data i godzina w formacie ISO",
                date: "data w formacie ISO",
                time: "godzina w formacie ISO",
                duration: "czas trwania ISO",
                ipv4: "adres IPv4",
                ipv6: "adres IPv6",
                cidrv4: "zakres IPv4",
                cidrv6: "zakres IPv6",
                base64: "ciąg znaków zakodowany w formacie base64",
                base64url: "ciąg znaków zakodowany w formacie base64url",
                json_string: "ciąg znaków w formacie JSON",
                e164: "liczba E.164",
                jwt: "JWT",
                template_literal: "wejście",
              }),
              (i = { nan: "NaN", number: "liczba", array: "tablica" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Nieprawidłowe dane wejściowe: oczekiwano instanceof ${r.expected}, otrzymano ${n}`;
                    return `Nieprawidłowe dane wejściowe: oczekiwano ${e}, otrzymano ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Nieprawidłowe dane wejściowe: oczekiwano ${a1(r.values[0])}`;
                    return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Za duża wartość: oczekiwano, że ${r.origin ?? "wartość"} będzie mieć ${t}${r.maximum.toString()} ${i.unit ?? "elementów"}`;
                    return `Zbyt duż(y/a/e): oczekiwano, że ${r.origin ?? "wartość"} będzie wynosić ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Za mała wartość: oczekiwano, że ${r.origin ?? "wartość"} będzie mieć ${t}${r.minimum.toString()} ${i.unit ?? "elementów"}`;
                    return `Zbyt mał(y/a/e): oczekiwano, że ${r.origin ?? "wartość"} będzie wynosić ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Nieprawidłowy ciąg znak\xf3w: musi zaczynać się od "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Nieprawidłowy ciąg znak\xf3w: musi kończyć się na "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Nieprawidłowy ciąg znak\xf3w: musi zawierać "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Nieprawidłowy ciąg znak\xf3w: musi odpowiadać wzorcowi ${r.pattern}`;
                    return `Nieprawidłow(y/a/e) ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Nieprawidłowa liczba: musi być wielokrotnością ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Nierozpoznane klucze${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Nieprawidłowy klucz w ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Nieprawidłowe dane wejściowe";
                  case "invalid_element":
                    return `Nieprawidłowa wartość w ${r.origin}`;
                }
              }),
          };
        },
        "ps",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "توکي", verb: "ولري" },
                file: { unit: "بایټس", verb: "ولري" },
                array: { unit: "توکي", verb: "ولري" },
                set: { unit: "توکي", verb: "ولري" },
              }),
              (t = {
                regex: "ورودي",
                email: "بریښنالیک",
                url: "یو آر ال",
                emoji: "ایموجي",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "نیټه او وخت",
                date: "نېټه",
                time: "وخت",
                duration: "موده",
                ipv4: "د IPv4 پته",
                ipv6: "د IPv6 پته",
                cidrv4: "د IPv4 ساحه",
                cidrv6: "د IPv6 ساحه",
                base64: "base64-encoded متن",
                base64url: "base64url-encoded متن",
                json_string: "JSON متن",
                e164: "د E.164 شمېره",
                jwt: "JWT",
                template_literal: "ورودي",
              }),
              (i = { nan: "NaN", number: "عدد", array: "ارې" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `ناسم ورودي: باید instanceof ${r.expected} وای, مګر ${n} ترلاسه شو`;
                    return `ناسم ورودي: باید ${e} وای, مګر ${n} ترلاسه شو`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `ناسم ورودي: باید ${a1(r.values[0])} وای`;
                    return `ناسم انتخاب: باید یو له ${aA(r.values, "|")} څخه وای`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `ډیر لوی: ${r.origin ?? "ارزښت"} باید ${t}${r.maximum.toString()} ${i.unit ?? "عنصرونه"} ولري`;
                    return `ډیر لوی: ${r.origin ?? "ارزښت"} باید ${t}${r.maximum.toString()} وي`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `ډیر کوچنی: ${r.origin} باید ${t}${r.minimum.toString()} ${i.unit} ولري`;
                    return `ډیر کوچنی: ${r.origin} باید ${t}${r.minimum.toString()} وي`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `ناسم متن: باید د "${r.prefix}" سره پیل شي`;
                    if ("ends_with" === r.format)
                      return `ناسم متن: باید د "${r.suffix}" سره پای ته ورسيږي`;
                    if ("includes" === r.format)
                      return `ناسم متن: باید "${r.includes}" ولري`;
                    if ("regex" === r.format)
                      return `ناسم متن: باید د ${r.pattern} سره مطابقت ولري`;
                    return `${t[r.format] ?? r.format} ناسم دی`;
                  case "not_multiple_of":
                    return `ناسم عدد: باید د ${r.divisor} مضرب وي`;
                  case "unrecognized_keys":
                    return `ناسم ${r.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `ناسم کلیډ په ${r.origin} کې`;
                  case "invalid_union":
                  default:
                    return "ناسمه ورودي";
                  case "invalid_element":
                    return `ناسم عنصر په ${r.origin} کې`;
                }
              }),
          };
        },
        "pt",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caracteres", verb: "ter" },
                file: { unit: "bytes", verb: "ter" },
                array: { unit: "itens", verb: "ter" },
                set: { unit: "itens", verb: "ter" },
              }),
              (t = {
                regex: "padrão",
                email: "endereço de e-mail",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "data e hora ISO",
                date: "data ISO",
                time: "hora ISO",
                duration: "duração ISO",
                ipv4: "endereço IPv4",
                ipv6: "endereço IPv6",
                cidrv4: "faixa de IPv4",
                cidrv6: "faixa de IPv6",
                base64: "texto codificado em base64",
                base64url: "URL codificada em base64",
                json_string: "texto JSON",
                e164: "número E.164",
                jwt: "JWT",
                template_literal: "entrada",
              }),
              (i = { nan: "NaN", number: "número", null: "nulo" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Tipo inv\xe1lido: esperado instanceof ${r.expected}, recebido ${n}`;
                    return `Tipo inv\xe1lido: esperado ${e}, recebido ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Entrada inv\xe1lida: esperado ${a1(r.values[0])}`;
                    return `Op\xe7\xe3o inv\xe1lida: esperada uma das ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Muito grande: esperado que ${r.origin ?? "valor"} tivesse ${t}${r.maximum.toString()} ${i.unit ?? "elementos"}`;
                    return `Muito grande: esperado que ${r.origin ?? "valor"} fosse ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Muito pequeno: esperado que ${r.origin} tivesse ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Muito pequeno: esperado que ${r.origin} fosse ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Texto inv\xe1lido: deve come\xe7ar com "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Texto inv\xe1lido: deve terminar com "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Texto inv\xe1lido: deve incluir "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Texto inv\xe1lido: deve corresponder ao padr\xe3o ${r.pattern}`;
                    return `${t[r.format] ?? r.format} inv\xe1lido`;
                  case "not_multiple_of":
                    return `N\xfamero inv\xe1lido: deve ser m\xfaltiplo de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Chave${r.keys.length > 1 ? "s" : ""} desconhecida${r.keys.length > 1 ? "s" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Chave inv\xe1lida em ${r.origin}`;
                  case "invalid_union":
                    return "Entrada inválida";
                  case "invalid_element":
                    return `Valor inv\xe1lido em ${r.origin}`;
                  default:
                    return "Campo inválido";
                }
              }),
          };
        },
        "ro",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "caractere", verb: "să aibă" },
                file: { unit: "octeți", verb: "să aibă" },
                array: { unit: "elemente", verb: "să aibă" },
                set: { unit: "elemente", verb: "să aibă" },
                map: { unit: "intrări", verb: "să aibă" },
              }),
              (t = {
                regex: "intrare",
                email: "adresă de email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "dată și oră ISO",
                date: "dată ISO",
                time: "oră ISO",
                duration: "durată ISO",
                ipv4: "adresă IPv4",
                ipv6: "adresă IPv6",
                mac: "adresă MAC",
                cidrv4: "interval IPv4",
                cidrv6: "interval IPv6",
                base64: "șir codat base64",
                base64url: "șir codat base64url",
                json_string: "șir JSON",
                e164: "număr E.164",
                jwt: "JWT",
                template_literal: "intrare",
              }),
              (i = {
                nan: "NaN",
                string: "șir",
                number: "număr",
                boolean: "boolean",
                function: "funcție",
                array: "matrice",
                object: "obiect",
                undefined: "nedefinit",
                symbol: "simbol",
                bigint: "număr mare",
                void: "void",
                never: "never",
                map: "hartă",
                set: "set",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    return `Intrare invalidă: așteptat ${e}, primit ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Intrare invalidă: așteptat ${a1(r.values[0])}`;
                    return `Opțiune invalidă: așteptat una dintre ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Prea mare: așteptat ca ${r.origin ?? "valoarea"} ${i.verb} ${t}${r.maximum.toString()} ${i.unit ?? "elemente"}`;
                    return `Prea mare: așteptat ca ${r.origin ?? "valoarea"} să fie ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Prea mic: așteptat ca ${r.origin} ${i.verb} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Prea mic: așteptat ca ${r.origin} să fie ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Șir invalid: trebuie să \xeenceapă cu "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Șir invalid: trebuie să se termine cu "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Șir invalid: trebuie să includă "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Șir invalid: trebuie să se potrivească cu modelul ${r.pattern}`;
                    return `Format invalid: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Număr invalid: trebuie să fie multiplu de ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Chei nerecunoscute: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Cheie invalidă \xeen ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Intrare invalidă";
                  case "invalid_element":
                    return `Valoare invalidă \xeen ${r.origin}`;
                }
              }),
          };
        },
        "ru",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: {
                  unit: { one: "символ", few: "символа", many: "символов" },
                  verb: "иметь",
                },
                file: {
                  unit: { one: "байт", few: "байта", many: "байт" },
                  verb: "иметь",
                },
                array: {
                  unit: { one: "элемент", few: "элемента", many: "элементов" },
                  verb: "иметь",
                },
                set: {
                  unit: { one: "элемент", few: "элемента", many: "элементов" },
                  verb: "иметь",
                },
              }),
              (t = {
                regex: "ввод",
                email: "email адрес",
                url: "URL",
                emoji: "эмодзи",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO дата и время",
                date: "ISO дата",
                time: "ISO время",
                duration: "ISO длительность",
                ipv4: "IPv4 адрес",
                ipv6: "IPv6 адрес",
                cidrv4: "IPv4 диапазон",
                cidrv6: "IPv6 диапазон",
                base64: "строка в формате base64",
                base64url: "строка в формате base64url",
                json_string: "JSON строка",
                e164: "номер E.164",
                jwt: "JWT",
                template_literal: "ввод",
              }),
              (i = { nan: "NaN", number: "число", array: "массив" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Неверный ввод: ожидалось instanceof ${r.expected}, получено ${n}`;
                    return `Неверный ввод: ожидалось ${e}, получено ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Неверный ввод: ожидалось ${a1(r.values[0])}`;
                    return `Неверный вариант: ожидалось одно из ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cP(
                        Number(r.maximum),
                        i.unit.one,
                        i.unit.few,
                        i.unit.many,
                      );
                      return `Слишком большое значение: ожидалось, что ${r.origin ?? "значение"} будет иметь ${t}${r.maximum.toString()} ${e}`;
                    }
                    return `Слишком большое значение: ожидалось, что ${r.origin ?? "значение"} будет ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i) {
                      let e = cP(
                        Number(r.minimum),
                        i.unit.one,
                        i.unit.few,
                        i.unit.many,
                      );
                      return `Слишком маленькое значение: ожидалось, что ${r.origin} будет иметь ${t}${r.minimum.toString()} ${e}`;
                    }
                    return `Слишком маленькое значение: ожидалось, что ${r.origin} будет ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Неверная строка: должна начинаться с "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Неверная строка: должна заканчиваться на "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Неверная строка: должна содержать "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Неверная строка: должна соответствовать шаблону ${r.pattern}`;
                    return `Неверный ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Неверное число: должно быть кратным ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Нераспознанн${r.keys.length > 1 ? "ые" : "ый"} ключ${r.keys.length > 1 ? "и" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Неверный ключ в ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Неверные входные данные";
                  case "invalid_element":
                    return `Неверное значение в ${r.origin}`;
                }
              }),
          };
        },
        "sl",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "znakov", verb: "imeti" },
                file: { unit: "bajtov", verb: "imeti" },
                array: { unit: "elementov", verb: "imeti" },
                set: { unit: "elementov", verb: "imeti" },
              }),
              (t = {
                regex: "vnos",
                email: "e-poštni naslov",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO datum in čas",
                date: "ISO datum",
                time: "ISO čas",
                duration: "ISO trajanje",
                ipv4: "IPv4 naslov",
                ipv6: "IPv6 naslov",
                cidrv4: "obseg IPv4",
                cidrv6: "obseg IPv6",
                base64: "base64 kodiran niz",
                base64url: "base64url kodiran niz",
                json_string: "JSON niz",
                e164: "E.164 številka",
                jwt: "JWT",
                template_literal: "vnos",
              }),
              (i = { nan: "NaN", number: "število", array: "tabela" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Neveljaven vnos: pričakovano instanceof ${r.expected}, prejeto ${n}`;
                    return `Neveljaven vnos: pričakovano ${e}, prejeto ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Neveljaven vnos: pričakovano ${a1(r.values[0])}`;
                    return `Neveljavna možnost: pričakovano eno izmed ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Preveliko: pričakovano, da bo ${r.origin ?? "vrednost"} imelo ${t}${r.maximum.toString()} ${i.unit ?? "elementov"}`;
                    return `Preveliko: pričakovano, da bo ${r.origin ?? "vrednost"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Premajhno: pričakovano, da bo ${r.origin} imelo ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Premajhno: pričakovano, da bo ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Neveljaven niz: mora se začeti z "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Neveljaven niz: mora se končati z "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Neveljaven niz: mora vsebovati "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Neveljaven niz: mora ustrezati vzorcu ${r.pattern}`;
                    return `Neveljaven ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Neveljavno število: mora biti večkratnik ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Neprepoznan${r.keys.length > 1 ? "i ključi" : " ključ"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Neveljaven ključ v ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Neveljaven vnos";
                  case "invalid_element":
                    return `Neveljavna vrednost v ${r.origin}`;
                }
              }),
          };
        },
        "sv",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "tecken", verb: "att ha" },
                file: { unit: "bytes", verb: "att ha" },
                array: { unit: "objekt", verb: "att innehålla" },
                set: { unit: "objekt", verb: "att innehålla" },
              }),
              (t = {
                regex: "reguljärt uttryck",
                email: "e-postadress",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO-datum och tid",
                date: "ISO-datum",
                time: "ISO-tid",
                duration: "ISO-varaktighet",
                ipv4: "IPv4-intervall",
                ipv6: "IPv6-intervall",
                cidrv4: "IPv4-spektrum",
                cidrv6: "IPv6-spektrum",
                base64: "base64-kodad sträng",
                base64url: "base64url-kodad sträng",
                json_string: "JSON-sträng",
                e164: "E.164-nummer",
                jwt: "JWT",
                template_literal: "mall-literal",
              }),
              (i = { nan: "NaN", number: "antal", array: "lista" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ogiltig inmatning: f\xf6rv\xe4ntat instanceof ${r.expected}, fick ${n}`;
                    return `Ogiltig inmatning: f\xf6rv\xe4ntat ${e}, fick ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ogiltig inmatning: f\xf6rv\xe4ntat ${a1(r.values[0])}`;
                    return `Ogiltigt val: f\xf6rv\xe4ntade en av ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `F\xf6r stor(t): f\xf6rv\xe4ntade ${r.origin ?? "värdet"} att ha ${t}${r.maximum.toString()} ${i.unit ?? "element"}`;
                    return `F\xf6r stor(t): f\xf6rv\xe4ntat ${r.origin ?? "värdet"} att ha ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `F\xf6r lite(t): f\xf6rv\xe4ntade ${r.origin ?? "värdet"} att ha ${t}${r.minimum.toString()} ${i.unit}`;
                    return `F\xf6r lite(t): f\xf6rv\xe4ntade ${r.origin ?? "värdet"} att ha ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ogiltig str\xe4ng: m\xe5ste b\xf6rja med "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Ogiltig str\xe4ng: m\xe5ste sluta med "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Ogiltig str\xe4ng: m\xe5ste inneh\xe5lla "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Ogiltig str\xe4ng: m\xe5ste matcha m\xf6nstret "${r.pattern}"`;
                    return `Ogiltig(t) ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ogiltigt tal: m\xe5ste vara en multipel av ${r.divisor}`;
                  case "unrecognized_keys":
                    return `${r.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Ogiltig nyckel i ${r.origin ?? "värdet"}`;
                  case "invalid_union":
                  default:
                    return "Ogiltig input";
                  case "invalid_element":
                    return `Ogiltigt v\xe4rde i ${r.origin ?? "värdet"}`;
                }
              }),
          };
        },
        "ta",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
                file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
                array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
                set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
              }),
              (t = {
                regex: "உள்ளீடு",
                email: "மின்னஞ்சல் முகவரி",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO தேதி நேரம்",
                date: "ISO தேதி",
                time: "ISO நேரம்",
                duration: "ISO கால அளவு",
                ipv4: "IPv4 முகவரி",
                ipv6: "IPv6 முகவரி",
                cidrv4: "IPv4 வரம்பு",
                cidrv6: "IPv6 வரம்பு",
                base64: "base64-encoded சரம்",
                base64url: "base64url-encoded சரம்",
                json_string: "JSON சரம்",
                e164: "E.164 எண்",
                jwt: "JWT",
                template_literal: "input",
              }),
              (i = { nan: "NaN", number: "எண்", array: "அணி", null: "வெறுமை" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது instanceof ${r.expected}, பெறப்பட்டது ${n}`;
                    return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${e}, பெறப்பட்டது ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${a1(r.values[0])}`;
                    return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${aA(r.values, "|")} இல் ஒன்று`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${r.origin ?? "மதிப்பு"} ${t}${r.maximum.toString()} ${i.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
                    return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${r.origin ?? "மதிப்பு"} ${t}${r.maximum.toString()} ஆக இருக்க வேண்டும்`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${r.origin} ${t}${r.minimum.toString()} ${i.unit} ஆக இருக்க வேண்டும்`;
                    return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${r.origin} ${t}${r.minimum.toString()} ஆக இருக்க வேண்டும்`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `தவறான சரம்: "${r.prefix}" இல் தொடங்க வேண்டும்`;
                    if ("ends_with" === r.format)
                      return `தவறான சரம்: "${r.suffix}" இல் முடிவடைய வேண்டும்`;
                    if ("includes" === r.format)
                      return `தவறான சரம்: "${r.includes}" ஐ உள்ளடக்க வேண்டும்`;
                    if ("regex" === r.format)
                      return `தவறான சரம்: ${r.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
                    return `தவறான ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `தவறான எண்: ${r.divisor} இன் பலமாக இருக்க வேண்டும்`;
                  case "unrecognized_keys":
                    return `அடையாளம் தெரியாத விசை${r.keys.length > 1 ? "கள்" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} இல் தவறான விசை`;
                  case "invalid_union":
                  default:
                    return "தவறான உள்ளீடு";
                  case "invalid_element":
                    return `${r.origin} இல் தவறான மதிப்பு`;
                }
              }),
          };
        },
        "th",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "ตัวอักษร", verb: "ควรมี" },
                file: { unit: "ไบต์", verb: "ควรมี" },
                array: { unit: "รายการ", verb: "ควรมี" },
                set: { unit: "รายการ", verb: "ควรมี" },
              }),
              (t = {
                regex: "ข้อมูลที่ป้อน",
                email: "ที่อยู่อีเมล",
                url: "URL",
                emoji: "อิโมจิ",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "วันที่เวลาแบบ ISO",
                date: "วันที่แบบ ISO",
                time: "เวลาแบบ ISO",
                duration: "ช่วงเวลาแบบ ISO",
                ipv4: "ที่อยู่ IPv4",
                ipv6: "ที่อยู่ IPv6",
                cidrv4: "ช่วง IP แบบ IPv4",
                cidrv6: "ช่วง IP แบบ IPv6",
                base64: "ข้อความแบบ Base64",
                base64url: "ข้อความแบบ Base64 สำหรับ URL",
                json_string: "ข้อความแบบ JSON",
                e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
                jwt: "โทเคน JWT",
                template_literal: "ข้อมูลที่ป้อน",
              }),
              (i = {
                nan: "NaN",
                number: "ตัวเลข",
                array: "อาร์เรย์ (Array)",
                null: "ไม่มีค่า (null)",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น instanceof ${r.expected} แต่ได้รับ ${n}`;
                    return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${e} แต่ได้รับ ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `ค่าไม่ถูกต้อง: ควรเป็น ${a1(r.values[0])}`;
                    return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "ไม่เกิน" : "น้อยกว่า",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `เกินกำหนด: ${r.origin ?? "ค่า"} ควรมี${t} ${r.maximum.toString()} ${i.unit ?? "รายการ"}`;
                    return `เกินกำหนด: ${r.origin ?? "ค่า"} ควรมี${t} ${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? "อย่างน้อย" : "มากกว่า",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `น้อยกว่ากำหนด: ${r.origin} ควรมี${t} ${r.minimum.toString()} ${i.unit}`;
                    return `น้อยกว่ากำหนด: ${r.origin} ควรมี${t} ${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${r.includes}" อยู่ในข้อความ`;
                    if ("regex" === r.format)
                      return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${r.pattern}`;
                    return `รูปแบบไม่ถูกต้อง: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${r.divisor} ได้ลงตัว`;
                  case "unrecognized_keys":
                    return `พบคีย์ที่ไม่รู้จัก: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `คีย์ไม่ถูกต้องใน ${r.origin}`;
                  case "invalid_union":
                    return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
                  case "invalid_element":
                    return `ข้อมูลไม่ถูกต้องใน ${r.origin}`;
                  default:
                    return "ข้อมูลไม่ถูกต้อง";
                }
              }),
          };
        },
        "tr",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "karakter", verb: "olmalı" },
                file: { unit: "bayt", verb: "olmalı" },
                array: { unit: "öğe", verb: "olmalı" },
                set: { unit: "öğe", verb: "olmalı" },
              }),
              (t = {
                regex: "girdi",
                email: "e-posta adresi",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO tarih ve saat",
                date: "ISO tarih",
                time: "ISO saat",
                duration: "ISO süre",
                ipv4: "IPv4 adresi",
                ipv6: "IPv6 adresi",
                cidrv4: "IPv4 aralığı",
                cidrv6: "IPv6 aralığı",
                base64: "base64 ile şifrelenmiş metin",
                base64url: "base64url ile şifrelenmiş metin",
                json_string: "JSON dizesi",
                e164: "E.164 sayısı",
                jwt: "JWT",
                template_literal: "Şablon dizesi",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Ge\xe7ersiz değer: beklenen instanceof ${r.expected}, alınan ${n}`;
                    return `Ge\xe7ersiz değer: beklenen ${e}, alınan ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Ge\xe7ersiz değer: beklenen ${a1(r.values[0])}`;
                    return `Ge\xe7ersiz se\xe7enek: aşağıdakilerden biri olmalı: ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `\xc7ok b\xfcy\xfck: beklenen ${r.origin ?? "değer"} ${t}${r.maximum.toString()} ${i.unit ?? "öğe"}`;
                    return `\xc7ok b\xfcy\xfck: beklenen ${r.origin ?? "değer"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `\xc7ok k\xfc\xe7\xfck: beklenen ${r.origin} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `\xc7ok k\xfc\xe7\xfck: beklenen ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ge\xe7ersiz metin: "${r.prefix}" ile başlamalı`;
                    if ("ends_with" === r.format)
                      return `Ge\xe7ersiz metin: "${r.suffix}" ile bitmeli`;
                    if ("includes" === r.format)
                      return `Ge\xe7ersiz metin: "${r.includes}" i\xe7ermeli`;
                    if ("regex" === r.format)
                      return `Ge\xe7ersiz metin: ${r.pattern} desenine uymalı`;
                    return `Ge\xe7ersiz ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Ge\xe7ersiz sayı: ${r.divisor} ile tam b\xf6l\xfcnebilmeli`;
                  case "unrecognized_keys":
                    return `Tanınmayan anahtar${r.keys.length > 1 ? "lar" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} i\xe7inde ge\xe7ersiz anahtar`;
                  case "invalid_union":
                  default:
                    return "Geçersiz değer";
                  case "invalid_element":
                    return `${r.origin} i\xe7inde ge\xe7ersiz değer`;
                }
              }),
          };
        },
        "ua",
        0,
        function () {
          return cN();
        },
        "uk",
        0,
        cN,
        "ur",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "حروف", verb: "ہونا" },
                file: { unit: "بائٹس", verb: "ہونا" },
                array: { unit: "آئٹمز", verb: "ہونا" },
                set: { unit: "آئٹمز", verb: "ہونا" },
              }),
              (t = {
                regex: "ان پٹ",
                email: "ای میل ایڈریس",
                url: "یو آر ایل",
                emoji: "ایموجی",
                uuid: "یو یو آئی ڈی",
                uuidv4: "یو یو آئی ڈی وی 4",
                uuidv6: "یو یو آئی ڈی وی 6",
                nanoid: "نینو آئی ڈی",
                guid: "جی یو آئی ڈی",
                cuid: "سی یو آئی ڈی",
                cuid2: "سی یو آئی ڈی 2",
                ulid: "یو ایل آئی ڈی",
                xid: "ایکس آئی ڈی",
                ksuid: "کے ایس یو آئی ڈی",
                datetime: "آئی ایس او ڈیٹ ٹائم",
                date: "آئی ایس او تاریخ",
                time: "آئی ایس او وقت",
                duration: "آئی ایس او مدت",
                ipv4: "آئی پی وی 4 ایڈریس",
                ipv6: "آئی پی وی 6 ایڈریس",
                cidrv4: "آئی پی وی 4 رینج",
                cidrv6: "آئی پی وی 6 رینج",
                base64: "بیس 64 ان کوڈڈ سٹرنگ",
                base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
                json_string: "جے ایس او این سٹرنگ",
                e164: "ای 164 نمبر",
                jwt: "جے ڈبلیو ٹی",
                template_literal: "ان پٹ",
              }),
              (i = { nan: "NaN", number: "نمبر", array: "آرے", null: "نل" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `غلط ان پٹ: instanceof ${r.expected} متوقع تھا، ${n} موصول ہوا`;
                    return `غلط ان پٹ: ${e} متوقع تھا، ${n} موصول ہوا`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `غلط ان پٹ: ${a1(r.values[0])} متوقع تھا`;
                    return `غلط آپشن: ${aA(r.values, "|")} میں سے ایک متوقع تھا`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `بہت بڑا: ${r.origin ?? "ویلیو"} کے ${t}${r.maximum.toString()} ${i.unit ?? "عناصر"} ہونے متوقع تھے`;
                    return `بہت بڑا: ${r.origin ?? "ویلیو"} کا ${t}${r.maximum.toString()} ہونا متوقع تھا`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `بہت چھوٹا: ${r.origin} کے ${t}${r.minimum.toString()} ${i.unit} ہونے متوقع تھے`;
                    return `بہت چھوٹا: ${r.origin} کا ${t}${r.minimum.toString()} ہونا متوقع تھا`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `غلط سٹرنگ: "${r.prefix}" سے شروع ہونا چاہیے`;
                    if ("ends_with" === r.format)
                      return `غلط سٹرنگ: "${r.suffix}" پر ختم ہونا چاہیے`;
                    if ("includes" === r.format)
                      return `غلط سٹرنگ: "${r.includes}" شامل ہونا چاہیے`;
                    if ("regex" === r.format)
                      return `غلط سٹرنگ: پیٹرن ${r.pattern} سے میچ ہونا چاہیے`;
                    return `غلط ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `غلط نمبر: ${r.divisor} کا مضاعف ہونا چاہیے`;
                  case "unrecognized_keys":
                    return `غیر تسلیم شدہ کی${r.keys.length > 1 ? "ز" : ""}: ${aA(r.keys, "، ")}`;
                  case "invalid_key":
                    return `${r.origin} میں غلط کی`;
                  case "invalid_union":
                  default:
                    return "غلط ان پٹ";
                  case "invalid_element":
                    return `${r.origin} میں غلط ویلیو`;
                }
              }),
          };
        },
        "uz",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "belgi", verb: "bo‘lishi kerak" },
                file: { unit: "bayt", verb: "bo‘lishi kerak" },
                array: { unit: "element", verb: "bo‘lishi kerak" },
                set: { unit: "element", verb: "bo‘lishi kerak" },
                map: { unit: "yozuv", verb: "bo‘lishi kerak" },
              }),
              (t = {
                regex: "kirish",
                email: "elektron pochta manzili",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO sana va vaqti",
                date: "ISO sana",
                time: "ISO vaqt",
                duration: "ISO davomiylik",
                ipv4: "IPv4 manzil",
                ipv6: "IPv6 manzil",
                mac: "MAC manzil",
                cidrv4: "IPv4 diapazon",
                cidrv6: "IPv6 diapazon",
                base64: "base64 kodlangan satr",
                base64url: "base64url kodlangan satr",
                json_string: "JSON satr",
                e164: "E.164 raqam",
                jwt: "JWT",
                template_literal: "kirish",
              }),
              (i = { nan: "NaN", number: "raqam", array: "massiv" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Noto‘g‘ri kirish: kutilgan instanceof ${r.expected}, qabul qilingan ${n}`;
                    return `Noto‘g‘ri kirish: kutilgan ${e}, qabul qilingan ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Noto‘g‘ri kirish: kutilgan ${a1(r.values[0])}`;
                    return `Noto‘g‘ri variant: quyidagilardan biri kutilgan ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Juda katta: kutilgan ${r.origin ?? "qiymat"} ${t}${r.maximum.toString()} ${i.unit} ${i.verb}`;
                    return `Juda katta: kutilgan ${r.origin ?? "qiymat"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Juda kichik: kutilgan ${r.origin} ${t}${r.minimum.toString()} ${i.unit} ${i.verb}`;
                    return `Juda kichik: kutilgan ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Noto‘g‘ri satr: "${r.prefix}" bilan boshlanishi kerak`;
                    if ("ends_with" === r.format)
                      return `Noto‘g‘ri satr: "${r.suffix}" bilan tugashi kerak`;
                    if ("includes" === r.format)
                      return `Noto‘g‘ri satr: "${r.includes}" ni o‘z ichiga olishi kerak`;
                    if ("regex" === r.format)
                      return `Noto‘g‘ri satr: ${r.pattern} shabloniga mos kelishi kerak`;
                    return `Noto‘g‘ri ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Noto‘g‘ri raqam: ${r.divisor} ning karralisi bo‘lishi kerak`;
                  case "unrecognized_keys":
                    return `Noma’lum kalit${r.keys.length > 1 ? "lar" : ""}: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} dagi kalit noto‘g‘ri`;
                  case "invalid_union":
                  default:
                    return "Noto‘g‘ri kirish";
                  case "invalid_element":
                    return `${r.origin} da noto‘g‘ri qiymat`;
                }
              }),
          };
        },
        "vi",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "ký tự", verb: "có" },
                file: { unit: "byte", verb: "có" },
                array: { unit: "phần tử", verb: "có" },
                set: { unit: "phần tử", verb: "có" },
              }),
              (t = {
                regex: "đầu vào",
                email: "địa chỉ email",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ngày giờ ISO",
                date: "ngày ISO",
                time: "giờ ISO",
                duration: "khoảng thời gian ISO",
                ipv4: "địa chỉ IPv4",
                ipv6: "địa chỉ IPv6",
                cidrv4: "dải IPv4",
                cidrv6: "dải IPv6",
                base64: "chuỗi mã hóa base64",
                base64url: "chuỗi mã hóa base64url",
                json_string: "chuỗi JSON",
                e164: "số E.164",
                jwt: "JWT",
                template_literal: "đầu vào",
              }),
              (i = { nan: "NaN", number: "số", array: "mảng" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `Đầu v\xe0o kh\xf4ng hợp lệ: mong đợi instanceof ${r.expected}, nhận được ${n}`;
                    return `Đầu v\xe0o kh\xf4ng hợp lệ: mong đợi ${e}, nhận được ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `Đầu v\xe0o kh\xf4ng hợp lệ: mong đợi ${a1(r.values[0])}`;
                    return `T\xf9y chọn kh\xf4ng hợp lệ: mong đợi một trong c\xe1c gi\xe1 trị ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Qu\xe1 lớn: mong đợi ${r.origin ?? "giá trị"} ${i.verb} ${t}${r.maximum.toString()} ${i.unit ?? "phần tử"}`;
                    return `Qu\xe1 lớn: mong đợi ${r.origin ?? "giá trị"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `Qu\xe1 nhỏ: mong đợi ${r.origin} ${i.verb} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `Qu\xe1 nhỏ: mong đợi ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Chuỗi kh\xf4ng hợp lệ: phải bắt đầu bằng "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Chuỗi kh\xf4ng hợp lệ: phải kết th\xfac bằng "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Chuỗi kh\xf4ng hợp lệ: phải bao gồm "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Chuỗi kh\xf4ng hợp lệ: phải khớp với mẫu ${r.pattern}`;
                    return `${t[r.format] ?? r.format} kh\xf4ng hợp lệ`;
                  case "not_multiple_of":
                    return `Số kh\xf4ng hợp lệ: phải l\xe0 bội số của ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Kh\xf3a kh\xf4ng được nhận dạng: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Kh\xf3a kh\xf4ng hợp lệ trong ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Đầu vào không hợp lệ";
                  case "invalid_element":
                    return `Gi\xe1 trị kh\xf4ng hợp lệ trong ${r.origin}`;
                }
              }),
          };
        },
        "yo",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "àmi", verb: "ní" },
                file: { unit: "bytes", verb: "ní" },
                array: { unit: "nkan", verb: "ní" },
                set: { unit: "nkan", verb: "ní" },
              }),
              (t = {
                regex: "ẹ̀rọ ìbáwọlé",
                email: "àdírẹ́sì ìmẹ́lì",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "àkókò ISO",
                date: "ọjọ́ ISO",
                time: "àkókò ISO",
                duration: "àkókò tó pé ISO",
                ipv4: "àdírẹ́sì IPv4",
                ipv6: "àdírẹ́sì IPv6",
                cidrv4: "àgbègbè IPv4",
                cidrv6: "àgbègbè IPv6",
                base64: "ọ̀rọ̀ tí a kọ́ ní base64",
                base64url: "ọ̀rọ̀ base64url",
                json_string: "ọ̀rọ̀ JSON",
                e164: "nọ́mbà E.164",
                jwt: "JWT",
                template_literal: "ẹ̀rọ ìbáwọlé",
              }),
              (i = { nan: "NaN", number: "nọ́mbà", array: "akopọ" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `\xccb\xe1wọl\xe9 aṣ\xecṣe: a n\xed l\xe1ti fi instanceof ${r.expected}, \xe0mọ̀ a r\xed ${n}`;
                    return `\xccb\xe1wọl\xe9 aṣ\xecṣe: a n\xed l\xe1ti fi ${e}, \xe0mọ̀ a r\xed ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `\xccb\xe1wọl\xe9 aṣ\xecṣe: a n\xed l\xe1ti fi ${a1(r.values[0])}`;
                    return `\xc0ṣ\xe0y\xe0n aṣ\xecṣe: yan ọ̀kan l\xe1ra ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `T\xf3 pọ̀ j\xf9: a n\xed l\xe1ti jẹ́ p\xe9 ${r.origin ?? "iye"} ${i.verb} ${t}${r.maximum} ${i.unit}`;
                    return `T\xf3 pọ̀ j\xf9: a n\xed l\xe1ti jẹ́ ${t}${r.maximum}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `K\xe9r\xe9 ju: a n\xed l\xe1ti jẹ́ p\xe9 ${r.origin} ${i.verb} ${t}${r.minimum} ${i.unit}`;
                    return `K\xe9r\xe9 ju: a n\xed l\xe1ti jẹ́ ${t}${r.minimum}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `Ọ̀rọ̀ aṣ\xecṣe: gbọ́dọ̀ bẹ̀rẹ̀ pẹ̀l\xfa "${r.prefix}"`;
                    if ("ends_with" === r.format)
                      return `Ọ̀rọ̀ aṣ\xecṣe: gbọ́dọ̀ par\xed pẹ̀l\xfa "${r.suffix}"`;
                    if ("includes" === r.format)
                      return `Ọ̀rọ̀ aṣ\xecṣe: gbọ́dọ̀ n\xed "${r.includes}"`;
                    if ("regex" === r.format)
                      return `Ọ̀rọ̀ aṣ\xecṣe: gbọ́dọ̀ b\xe1 \xe0pẹẹrẹ mu ${r.pattern}`;
                    return `Aṣ\xecṣe: ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `Nọ́mb\xe0 aṣ\xecṣe: gbọ́dọ̀ jẹ́ \xe8y\xe0 p\xedp\xedn ti ${r.divisor}`;
                  case "unrecognized_keys":
                    return `Bọt\xecn\xec \xe0\xecmọ̀: ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `Bọt\xecn\xec aṣ\xecṣe n\xedn\xfa ${r.origin}`;
                  case "invalid_union":
                  default:
                    return "Ìbáwọlé aṣìṣe";
                  case "invalid_element":
                    return `Iye aṣ\xecṣe n\xedn\xfa ${r.origin}`;
                }
              }),
          };
        },
        "zhCN",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "字符", verb: "包含" },
                file: { unit: "字节", verb: "包含" },
                array: { unit: "项", verb: "包含" },
                set: { unit: "项", verb: "包含" },
              }),
              (t = {
                regex: "输入",
                email: "电子邮件",
                url: "URL",
                emoji: "表情符号",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO日期时间",
                date: "ISO日期",
                time: "ISO时间",
                duration: "ISO时长",
                ipv4: "IPv4地址",
                ipv6: "IPv6地址",
                cidrv4: "IPv4网段",
                cidrv6: "IPv6网段",
                base64: "base64编码字符串",
                base64url: "base64url编码字符串",
                json_string: "JSON字符串",
                e164: "E.164号码",
                jwt: "JWT",
                template_literal: "输入",
              }),
              (i = {
                nan: "NaN",
                number: "数字",
                array: "数组",
                null: "空值(null)",
              }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `无效输入：期望 instanceof ${r.expected}，实际接收 ${n}`;
                    return `无效输入：期望 ${e}，实际接收 ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `无效输入：期望 ${a1(r.values[0])}`;
                    return `无效选项：期望以下之一 ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `数值过大：期望 ${r.origin ?? "值"} ${t}${r.maximum.toString()} ${i.unit ?? "个元素"}`;
                    return `数值过大：期望 ${r.origin ?? "值"} ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `数值过小：期望 ${r.origin} ${t}${r.minimum.toString()} ${i.unit}`;
                    return `数值过小：期望 ${r.origin} ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `无效字符串：必须以 "${r.prefix}" 开头`;
                    if ("ends_with" === r.format)
                      return `无效字符串：必须以 "${r.suffix}" 结尾`;
                    if ("includes" === r.format)
                      return `无效字符串：必须包含 "${r.includes}"`;
                    if ("regex" === r.format)
                      return `无效字符串：必须满足正则表达式 ${r.pattern}`;
                    return `无效${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `无效数字：必须是 ${r.divisor} 的倍数`;
                  case "unrecognized_keys":
                    return `出现未知的键(key): ${aA(r.keys, ", ")}`;
                  case "invalid_key":
                    return `${r.origin} 中的键(key)无效`;
                  case "invalid_union":
                  default:
                    return "无效输入";
                  case "invalid_element":
                    return `${r.origin} 中包含无效值(value)`;
                }
              }),
          };
        },
        "zhTW",
        0,
        function () {
          let e, t, i;
          return {
            localeError:
              ((e = {
                string: { unit: "字元", verb: "擁有" },
                file: { unit: "位元組", verb: "擁有" },
                array: { unit: "項目", verb: "擁有" },
                set: { unit: "項目", verb: "擁有" },
              }),
              (t = {
                regex: "輸入",
                email: "郵件地址",
                url: "URL",
                emoji: "emoji",
                uuid: "UUID",
                uuidv4: "UUIDv4",
                uuidv6: "UUIDv6",
                nanoid: "nanoid",
                guid: "GUID",
                cuid: "cuid",
                cuid2: "cuid2",
                ulid: "ULID",
                xid: "XID",
                ksuid: "KSUID",
                datetime: "ISO 日期時間",
                date: "ISO 日期",
                time: "ISO 時間",
                duration: "ISO 期間",
                ipv4: "IPv4 位址",
                ipv6: "IPv6 位址",
                cidrv4: "IPv4 範圍",
                cidrv6: "IPv6 範圍",
                base64: "base64 編碼字串",
                base64url: "base64url 編碼字串",
                json_string: "JSON 字串",
                e164: "E.164 數值",
                jwt: "JWT",
                template_literal: "輸入",
              }),
              (i = { nan: "NaN" }),
              (r) => {
                switch (r.code) {
                  case "invalid_type": {
                    let e = i[r.expected] ?? r.expected,
                      t = oi(r.input),
                      n = i[t] ?? t;
                    if (/^[A-Z]/.test(r.expected))
                      return `無效的輸入值：預期為 instanceof ${r.expected}，但收到 ${n}`;
                    return `無效的輸入值：預期為 ${e}，但收到 ${n}`;
                  }
                  case "invalid_value":
                    if (1 === r.values.length)
                      return `無效的輸入值：預期為 ${a1(r.values[0])}`;
                    return `無效的選項：預期為以下其中之一 ${aA(r.values, "|")}`;
                  case "too_big": {
                    let t = r.inclusive ? "<=" : "<",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `數值過大：預期 ${r.origin ?? "值"} 應為 ${t}${r.maximum.toString()} ${i.unit ?? "個元素"}`;
                    return `數值過大：預期 ${r.origin ?? "值"} 應為 ${t}${r.maximum.toString()}`;
                  }
                  case "too_small": {
                    let t = r.inclusive ? ">=" : ">",
                      i = e[r.origin] ?? null;
                    if (i)
                      return `數值過小：預期 ${r.origin} 應為 ${t}${r.minimum.toString()} ${i.unit}`;
                    return `數值過小：預期 ${r.origin} 應為 ${t}${r.minimum.toString()}`;
                  }
                  case "invalid_format":
                    if ("starts_with" === r.format)
                      return `無效的字串：必須以 "${r.prefix}" 開頭`;
                    if ("ends_with" === r.format)
                      return `無效的字串：必須以 "${r.suffix}" 結尾`;
                    if ("includes" === r.format)
                      return `無效的字串：必須包含 "${r.includes}"`;
                    if ("regex" === r.format)
                      return `無效的字串：必須符合格式 ${r.pattern}`;
                    return `無效的 ${t[r.format] ?? r.format}`;
                  case "not_multiple_of":
                    return `無效的數字：必須為 ${r.divisor} 的倍數`;
                  case "unrecognized_keys":
                    return `無法識別的鍵值${r.keys.length > 1 ? "們" : ""}：${aA(r.keys, "、")}`;
                  case "invalid_key":
                    return `${r.origin} 中有無效的鍵值`;
                  case "invalid_union":
                  default:
                    return "無效的輸入值";
                  case "invalid_element":
                    return `${r.origin} 中有無效的值`;
                }
              }),
          };
        },
      ],
      60544,
    );
    var cT = e.i(60544);
    let cO = Symbol("ZodOutput"),
      cz = Symbol("ZodInput");
    class cA {
      constructor() {
        (this._map = new WeakMap()), (this._idmap = new Map());
      }
      add(e, ...t) {
        let i = t[0];
        return (
          this._map.set(e, i),
          i && "object" == typeof i && "id" in i && this._idmap.set(i.id, e),
          this
        );
      }
      clear() {
        return (this._map = new WeakMap()), (this._idmap = new Map()), this;
      }
      remove(e) {
        let t = this._map.get(e);
        return (
          t && "object" == typeof t && "id" in t && this._idmap.delete(t.id),
          this._map.delete(e),
          this
        );
      }
      get(e) {
        let t = e._zod.parent;
        if (t) {
          let i = { ...(this.get(t) ?? {}) };
          delete i.id;
          let r = { ...i, ...this._map.get(e) };
          return Object.keys(r).length ? r : void 0;
        }
        return this._map.get(e);
      }
      has(e) {
        return this._map.has(e);
      }
    }
    function cU() {
      return new cA();
    }
    (f = globalThis).__zod_globalRegistry ?? (f.__zod_globalRegistry = cU());
    let cD = globalThis.__zod_globalRegistry;
    function cC(e, t) {
      return new e({ type: "string", ...a0(t) });
    }
    function cj(e, t) {
      return new e({ type: "string", coerce: !0, ...a0(t) });
    }
    function cZ(e, t) {
      return new e({
        type: "string",
        format: "email",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cL(e, t) {
      return new e({
        type: "string",
        format: "guid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cR(e, t) {
      return new e({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cM(e, t) {
      return new e({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: !1,
        version: "v4",
        ...a0(t),
      });
    }
    function cB(e, t) {
      return new e({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: !1,
        version: "v6",
        ...a0(t),
      });
    }
    function cF(e, t) {
      return new e({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: !1,
        version: "v7",
        ...a0(t),
      });
    }
    function cq(e, t) {
      return new e({
        type: "string",
        format: "url",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cQ(e, t) {
      return new e({
        type: "string",
        format: "emoji",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cJ(e, t) {
      return new e({
        type: "string",
        format: "nanoid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cV(e, t) {
      return new e({
        type: "string",
        format: "cuid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cW(e, t) {
      return new e({
        type: "string",
        format: "cuid2",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cG(e, t) {
      return new e({
        type: "string",
        format: "ulid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cK(e, t) {
      return new e({
        type: "string",
        format: "xid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cX(e, t) {
      return new e({
        type: "string",
        format: "ksuid",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cH(e, t) {
      return new e({
        type: "string",
        format: "ipv4",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function cY(e, t) {
      return new e({
        type: "string",
        format: "ipv6",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c0(e, t) {
      return new e({
        type: "string",
        format: "mac",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c1(e, t) {
      return new e({
        type: "string",
        format: "cidrv4",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c6(e, t) {
      return new e({
        type: "string",
        format: "cidrv6",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c4(e, t) {
      return new e({
        type: "string",
        format: "base64",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c2(e, t) {
      return new e({
        type: "string",
        format: "base64url",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c5(e, t) {
      return new e({
        type: "string",
        format: "e164",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    function c3(e, t) {
      return new e({
        type: "string",
        format: "jwt",
        check: "string_format",
        abort: !1,
        ...a0(t),
      });
    }
    e.s(
      [
        "$ZodRegistry",
        0,
        cA,
        "$input",
        0,
        cz,
        "$output",
        0,
        cO,
        "globalRegistry",
        0,
        cD,
        "registry",
        0,
        cU,
      ],
      52637,
    ),
      e.i(52637),
      e.i(73911);
    let c8 = {
      Any: null,
      Minute: -1,
      Second: 0,
      Millisecond: 3,
      Microsecond: 6,
    };
    function c9(e, t) {
      return new e({
        type: "string",
        format: "datetime",
        check: "string_format",
        offset: !1,
        local: !1,
        precision: null,
        ...a0(t),
      });
    }
    function c7(e, t) {
      return new e({
        type: "string",
        format: "date",
        check: "string_format",
        ...a0(t),
      });
    }
    function de(e, t) {
      return new e({
        type: "string",
        format: "time",
        check: "string_format",
        precision: null,
        ...a0(t),
      });
    }
    function dt(e, t) {
      return new e({
        type: "string",
        format: "duration",
        check: "string_format",
        ...a0(t),
      });
    }
    function di(e, t) {
      return new e({ type: "number", checks: [], ...a0(t) });
    }
    function dr(e, t) {
      return new e({ type: "number", coerce: !0, checks: [], ...a0(t) });
    }
    function dn(e, t) {
      return new e({
        type: "number",
        check: "number_format",
        abort: !1,
        format: "safeint",
        ...a0(t),
      });
    }
    function ds(e, t) {
      return new e({
        type: "number",
        check: "number_format",
        abort: !1,
        format: "float32",
        ...a0(t),
      });
    }
    function da(e, t) {
      return new e({
        type: "number",
        check: "number_format",
        abort: !1,
        format: "float64",
        ...a0(t),
      });
    }
    function du(e, t) {
      return new e({
        type: "number",
        check: "number_format",
        abort: !1,
        format: "int32",
        ...a0(t),
      });
    }
    function dl(e, t) {
      return new e({
        type: "number",
        check: "number_format",
        abort: !1,
        format: "uint32",
        ...a0(t),
      });
    }
    function dc(e, t) {
      return new e({ type: "boolean", ...a0(t) });
    }
    function dd(e, t) {
      return new e({ type: "boolean", coerce: !0, ...a0(t) });
    }
    function df(e, t) {
      return new e({ type: "bigint", ...a0(t) });
    }
    function dh(e, t) {
      return new e({ type: "bigint", coerce: !0, ...a0(t) });
    }
    function dp(e, t) {
      return new e({
        type: "bigint",
        check: "bigint_format",
        abort: !1,
        format: "int64",
        ...a0(t),
      });
    }
    function dm(e, t) {
      return new e({
        type: "bigint",
        check: "bigint_format",
        abort: !1,
        format: "uint64",
        ...a0(t),
      });
    }
    function dg(e, t) {
      return new e({ type: "symbol", ...a0(t) });
    }
    function dv(e, t) {
      return new e({ type: "undefined", ...a0(t) });
    }
    function dy(e, t) {
      return new e({ type: "null", ...a0(t) });
    }
    function db(e) {
      return new e({ type: "any" });
    }
    function d_(e) {
      return new e({ type: "unknown" });
    }
    function d$(e, t) {
      return new e({ type: "never", ...a0(t) });
    }
    function dx(e, t) {
      return new e({ type: "void", ...a0(t) });
    }
    function dw(e, t) {
      return new e({ type: "date", ...a0(t) });
    }
    function dS(e, t) {
      return new e({ type: "date", coerce: !0, ...a0(t) });
    }
    function dk(e, t) {
      return new e({ type: "nan", ...a0(t) });
    }
    function dI(e, t) {
      return new uE({ check: "less_than", ...a0(t), value: e, inclusive: !1 });
    }
    function dE(e, t) {
      return new uE({ check: "less_than", ...a0(t), value: e, inclusive: !0 });
    }
    function dP(e, t) {
      return new uP({
        check: "greater_than",
        ...a0(t),
        value: e,
        inclusive: !1,
      });
    }
    function dN(e, t) {
      return new uP({
        check: "greater_than",
        ...a0(t),
        value: e,
        inclusive: !0,
      });
    }
    function dT(e) {
      return dP(0, e);
    }
    function dO(e) {
      return dI(0, e);
    }
    function dz(e) {
      return dE(0, e);
    }
    function dA(e) {
      return dN(0, e);
    }
    function dU(e, t) {
      return new uN({ check: "multiple_of", ...a0(t), value: e });
    }
    function dD(e, t) {
      return new uz({ check: "max_size", ...a0(t), maximum: e });
    }
    function dC(e, t) {
      return new uA({ check: "min_size", ...a0(t), minimum: e });
    }
    function dj(e, t) {
      return new uU({ check: "size_equals", ...a0(t), size: e });
    }
    function dZ(e, t) {
      return new uD({ check: "max_length", ...a0(t), maximum: e });
    }
    function dL(e, t) {
      return new uC({ check: "min_length", ...a0(t), minimum: e });
    }
    function dR(e, t) {
      return new uj({ check: "length_equals", ...a0(t), length: e });
    }
    function dM(e, t) {
      return new uL({
        check: "string_format",
        format: "regex",
        ...a0(t),
        pattern: e,
      });
    }
    function dB(e) {
      return new uR({ check: "string_format", format: "lowercase", ...a0(e) });
    }
    function dF(e) {
      return new uM({ check: "string_format", format: "uppercase", ...a0(e) });
    }
    function dq(e, t) {
      return new uB({
        check: "string_format",
        format: "includes",
        ...a0(t),
        includes: e,
      });
    }
    function dQ(e, t) {
      return new uF({
        check: "string_format",
        format: "starts_with",
        ...a0(t),
        prefix: e,
      });
    }
    function dJ(e, t) {
      return new uq({
        check: "string_format",
        format: "ends_with",
        ...a0(t),
        suffix: e,
      });
    }
    function dV(e, t, i) {
      return new uJ({ check: "property", property: e, schema: t, ...a0(i) });
    }
    function dW(e, t) {
      return new uV({ check: "mime_type", mime: e, ...a0(t) });
    }
    function dG(e) {
      return new uW({ check: "overwrite", tx: e });
    }
    function dK(e) {
      return dG((t) => t.normalize(e));
    }
    function dX() {
      return dG((e) => e.trim());
    }
    function dH() {
      return dG((e) => e.toLowerCase());
    }
    function dY() {
      return dG((e) => e.toUpperCase());
    }
    function d0() {
      return dG((e) => aq(e));
    }
    function d1(e, t, i) {
      return new e({ type: "array", element: t, ...a0(i) });
    }
    function d6(e, t, i) {
      return new e({ type: "union", options: t, ...a0(i) });
    }
    function d4(e, t, i) {
      return new e({ type: "union", options: t, inclusive: !1, ...a0(i) });
    }
    function d2(e, t, i, r) {
      return new e({ type: "union", options: i, discriminator: t, ...a0(r) });
    }
    function d5(e, t, i) {
      return new e({ type: "intersection", left: t, right: i });
    }
    function d3(e, t, i, r) {
      let n = i instanceof uX,
        s = n ? r : i;
      return new e({ type: "tuple", items: t, rest: n ? i : null, ...a0(s) });
    }
    function d8(e, t, i, r) {
      return new e({ type: "record", keyType: t, valueType: i, ...a0(r) });
    }
    function d9(e, t, i, r) {
      return new e({ type: "map", keyType: t, valueType: i, ...a0(r) });
    }
    function d7(e, t, i) {
      return new e({ type: "set", valueType: t, ...a0(i) });
    }
    function fe(e, t, i) {
      return new e({
        type: "enum",
        entries: Array.isArray(t)
          ? Object.fromEntries(t.map((e) => [e, e]))
          : t,
        ...a0(i),
      });
    }
    function ft(e, t, i) {
      return new e({ type: "enum", entries: t, ...a0(i) });
    }
    function fi(e, t, i) {
      return new e({
        type: "literal",
        values: Array.isArray(t) ? t : [t],
        ...a0(i),
      });
    }
    function fr(e, t) {
      return new e({ type: "file", ...a0(t) });
    }
    function fn(e, t) {
      return new e({ type: "transform", transform: t });
    }
    function fs(e, t) {
      return new e({ type: "optional", innerType: t });
    }
    function fa(e, t) {
      return new e({ type: "nullable", innerType: t });
    }
    function fo(e, t, i) {
      return new e({
        type: "default",
        innerType: t,
        get defaultValue() {
          return "function" == typeof i ? i() : aG(i);
        },
      });
    }
    function fu(e, t, i) {
      return new e({ type: "nonoptional", innerType: t, ...a0(i) });
    }
    function fl(e, t) {
      return new e({ type: "success", innerType: t });
    }
    function fc(e, t, i) {
      return new e({
        type: "catch",
        innerType: t,
        catchValue: "function" == typeof i ? i : () => i,
      });
    }
    function fd(e, t, i) {
      return new e({ type: "pipe", in: t, out: i });
    }
    function ff(e, t) {
      return new e({ type: "readonly", innerType: t });
    }
    function fh(e, t, i) {
      return new e({ type: "template_literal", parts: t, ...a0(i) });
    }
    function fp(e, t) {
      return new e({ type: "lazy", getter: t });
    }
    function fm(e, t) {
      return new e({ type: "promise", innerType: t });
    }
    function fg(e, t, i) {
      let r = a0(i);
      return (
        r.abort ?? (r.abort = !0),
        new e({ type: "custom", check: "custom", fn: t, ...r })
      );
    }
    function fv(e, t, i) {
      return new e({ type: "custom", check: "custom", fn: t, ...a0(i) });
    }
    function fy(e, t) {
      let i = fb(
        (t) => (
          (t.addIssue = (e) => {
            "string" == typeof e
              ? t.issues.push(or(e, t.value, i._zod.def))
              : (e.fatal && (e.continue = !1),
                e.code ?? (e.code = "custom"),
                e.input ?? (e.input = t.value),
                e.inst ?? (e.inst = i),
                e.continue ?? (e.continue = !i._zod.def.abort),
                t.issues.push(or(e)));
          }),
          e(t.value, t)
        ),
        t,
      );
      return i;
    }
    function fb(e, t) {
      let i = new uk({ check: "custom", ...a0(t) });
      return (i._zod.check = e), i;
    }
    function f_(e) {
      let t = new uk({ check: "describe" });
      return (
        (t._zod.onattach = [
          (t) => {
            let i = cD.get(t) ?? {};
            cD.add(t, { ...i, description: e });
          },
        ]),
        (t._zod.check = () => {}),
        t
      );
    }
    function f$(e) {
      let t = new uk({ check: "meta" });
      return (
        (t._zod.onattach = [
          (t) => {
            let i = cD.get(t) ?? {};
            cD.add(t, { ...i, ...e });
          },
        ]),
        (t._zod.check = () => {}),
        t
      );
    }
    function fx(e, t) {
      let i = a0(t),
        r = i.truthy ?? ["true", "1", "yes", "on", "y", "enabled"],
        n = i.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
      "sensitive" !== i.case &&
        ((r = r.map((e) => ("string" == typeof e ? e.toLowerCase() : e))),
        (n = n.map((e) => ("string" == typeof e ? e.toLowerCase() : e))));
      let s = new Set(r),
        a = new Set(n),
        o = e.Codec ?? cu,
        u = e.Boolean ?? l_,
        l = new o({
          type: "pipe",
          in: new (e.String ?? uH)({ type: "string", error: i.error }),
          out: new u({ type: "boolean", error: i.error }),
          transform: (e, t) => {
            let r = e;
            return (
              "sensitive" !== i.case && (r = r.toLowerCase()),
              !!s.has(r) ||
                (!a.has(r) &&
                  (t.issues.push({
                    code: "invalid_value",
                    expected: "stringbool",
                    values: [...s, ...a],
                    input: t.value,
                    inst: l,
                    continue: !1,
                  }),
                  {}))
            );
          },
          reverseTransform: (e, t) =>
            !0 === e ? r[0] || "true" : n[0] || "false",
          error: i.error,
        });
      return l;
    }
    function fw(e, t, i, r = {}) {
      let n = a0(r),
        s = {
          ...a0(r),
          check: "string_format",
          type: "string",
          format: t,
          fn: "function" == typeof i ? i : (e) => i.test(e),
          ...n,
        };
      return i instanceof RegExp && (s.pattern = i), new e(s);
    }
    function fS(e) {
      let t = e?.target ?? "draft-2020-12";
      return (
        "draft-4" === t && (t = "draft-04"),
        "draft-7" === t && (t = "draft-07"),
        {
          processors: e.processors ?? {},
          metadataRegistry: e?.metadata ?? cD,
          target: t,
          unrepresentable: e?.unrepresentable ?? "throw",
          override: e?.override ?? (() => {}),
          io: e?.io ?? "output",
          counter: 0,
          seen: new Map(),
          cycles: e?.cycles ?? "ref",
          reused: e?.reused ?? "inline",
          external: e?.external ?? void 0,
        }
      );
    }
    function fk(e, t, i = { path: [], schemaPath: [] }) {
      var r;
      let n = e._zod.def,
        s = t.seen.get(e);
      if (s)
        return (
          s.count++, i.schemaPath.includes(e) && (s.cycle = i.path), s.schema
        );
      let a = { schema: {}, count: 1, cycle: void 0, path: i.path };
      t.seen.set(e, a);
      let o = e._zod.toJSONSchema?.();
      if (o) a.schema = o;
      else {
        let r = { ...i, schemaPath: [...i.schemaPath, e], path: i.path };
        if (e._zod.processJSONSchema) e._zod.processJSONSchema(t, a.schema, r);
        else {
          let i = a.schema,
            s = t.processors[n.type];
          if (!s)
            throw Error(
              `[toJSONSchema]: Non-representable type encountered: ${n.type}`,
            );
          s(e, t, i, r);
        }
        let s = e._zod.parent;
        s && (a.ref || (a.ref = s), fk(s, t, r), (t.seen.get(s).isParent = !0));
      }
      let u = t.metadataRegistry.get(e);
      return (
        u && Object.assign(a.schema, u),
        "input" === t.io &&
          (function e(t, i) {
            let r = i ?? { seen: new Set() };
            if (r.seen.has(t)) return !1;
            r.seen.add(t);
            let n = t._zod.def;
            if ("transform" === n.type) return !0;
            if ("array" === n.type) return e(n.element, r);
            if ("set" === n.type) return e(n.valueType, r);
            if ("lazy" === n.type) return e(n.getter(), r);
            if (
              "promise" === n.type ||
              "optional" === n.type ||
              "nonoptional" === n.type ||
              "nullable" === n.type ||
              "readonly" === n.type ||
              "default" === n.type ||
              "prefault" === n.type
            )
              return e(n.innerType, r);
            if ("intersection" === n.type) return e(n.left, r) || e(n.right, r);
            if ("record" === n.type || "map" === n.type)
              return e(n.keyType, r) || e(n.valueType, r);
            if ("pipe" === n.type)
              return (
                !!t._zod.traits.has("$ZodCodec") || e(n.in, r) || e(n.out, r)
              );
            if ("object" === n.type) {
              for (let t in n.shape) if (e(n.shape[t], r)) return !0;
              return !1;
            }
            if ("union" === n.type) {
              for (let t of n.options) if (e(t, r)) return !0;
              return !1;
            }
            if ("tuple" === n.type) {
              for (let t of n.items) if (e(t, r)) return !0;
              if (n.rest && e(n.rest, r)) return !0;
            }
            return !1;
          })(e) &&
          (delete a.schema.examples, delete a.schema.default),
        "input" === t.io &&
          "_prefault" in a.schema &&
          ((r = a.schema).default ?? (r.default = a.schema._prefault)),
        delete a.schema._prefault,
        t.seen.get(e).schema
      );
    }
    function fI(e, t) {
      let i = e.seen.get(t);
      if (!i) throw Error("Unprocessed schema. This is a bug in Zod.");
      let r = new Map();
      for (let t of e.seen.entries()) {
        let i = e.metadataRegistry.get(t[0])?.id;
        if (i) {
          let e = r.get(i);
          if (e && e !== t[0])
            throw Error(
              `Duplicate schema id "${i}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`,
            );
          r.set(i, t[0]);
        }
      }
      let n = (t) => {
        if (t[1].schema.$ref) return;
        let r = t[1],
          { ref: n, defId: s } = ((t) => {
            let r = "draft-2020-12" === e.target ? "$defs" : "definitions";
            if (e.external) {
              let i = e.external.registry.get(t[0])?.id,
                n = e.external.uri ?? ((e) => e);
              if (i) return { ref: n(i) };
              let s = t[1].defId ?? t[1].schema.id ?? `schema${e.counter++}`;
              return (
                (t[1].defId = s),
                { defId: s, ref: `${n("__shared")}#/${r}/${s}` }
              );
            }
            if (t[1] === i) return { ref: "#" };
            let n = `#/${r}/`,
              s = t[1].schema.id ?? `__schema${e.counter++}`;
            return { defId: s, ref: n + s };
          })(t);
        (r.def = { ...r.schema }), s && (r.defId = s);
        let a = r.schema;
        for (let e in a) delete a[e];
        a.$ref = n;
      };
      if ("throw" === e.cycles)
        for (let t of e.seen.entries()) {
          let e = t[1];
          if (e.cycle)
            throw Error(`Cycle detected: #/${e.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
        }
      for (let i of e.seen.entries()) {
        let r = i[1];
        if (t === i[0]) {
          n(i);
          continue;
        }
        if (e.external) {
          let r = e.external.registry.get(i[0])?.id;
          if (t !== i[0] && r) {
            n(i);
            continue;
          }
        }
        if (
          e.metadataRegistry.get(i[0])?.id ||
          r.cycle ||
          (r.count > 1 && "ref" === e.reused)
        ) {
          n(i);
          continue;
        }
      }
    }
    function fE(e, t) {
      let i = e.seen.get(t);
      if (!i) throw Error("Unprocessed schema. This is a bug in Zod.");
      let r = (t) => {
        let i = e.seen.get(t);
        if (null === i.ref) return;
        let n = i.def ?? i.schema,
          s = { ...n },
          a = i.ref;
        if (((i.ref = null), a)) {
          r(a);
          let i = e.seen.get(a),
            o = i.schema;
          if (
            (o.$ref &&
            ("draft-07" === e.target ||
              "draft-04" === e.target ||
              "openapi-3.0" === e.target)
              ? ((n.allOf = n.allOf ?? []), n.allOf.push(o))
              : Object.assign(n, o),
            Object.assign(n, s),
            t._zod.parent === a)
          )
            for (let e in n)
              "$ref" !== e && "allOf" !== e && (e in s || delete n[e]);
          if (o.$ref && i.def)
            for (let e in n)
              "$ref" !== e &&
                "allOf" !== e &&
                e in i.def &&
                JSON.stringify(n[e]) === JSON.stringify(i.def[e]) &&
                delete n[e];
        }
        let o = t._zod.parent;
        if (o && o !== a) {
          r(o);
          let t = e.seen.get(o);
          if (t?.schema.$ref && ((n.$ref = t.schema.$ref), t.def))
            for (let e in n)
              "$ref" !== e &&
                "allOf" !== e &&
                e in t.def &&
                JSON.stringify(n[e]) === JSON.stringify(t.def[e]) &&
                delete n[e];
        }
        e.override({ zodSchema: t, jsonSchema: n, path: i.path ?? [] });
      };
      for (let t of [...e.seen.entries()].reverse()) r(t[0]);
      let n = {};
      if (
        ("draft-2020-12" === e.target
          ? (n.$schema = "https://json-schema.org/draft/2020-12/schema")
          : "draft-07" === e.target
            ? (n.$schema = "http://json-schema.org/draft-07/schema#")
            : "draft-04" === e.target
              ? (n.$schema = "http://json-schema.org/draft-04/schema#")
              : e.target,
        e.external?.uri)
      ) {
        let i = e.external.registry.get(t)?.id;
        if (!i) throw Error("Schema is missing an `id` property");
        n.$id = e.external.uri(i);
      }
      Object.assign(n, i.def ?? i.schema);
      let s = e.metadataRegistry.get(t)?.id;
      void 0 !== s && n.id === s && delete n.id;
      let a = e.external?.defs ?? {};
      for (let t of e.seen.entries()) {
        let e = t[1];
        e.def &&
          e.defId &&
          (e.def.id === e.defId && delete e.def.id, (a[e.defId] = e.def));
      }
      e.external ||
        (Object.keys(a).length > 0 &&
          ("draft-2020-12" === e.target ? (n.$defs = a) : (n.definitions = a)));
      try {
        let i = JSON.parse(JSON.stringify(n));
        return (
          Object.defineProperty(i, "~standard", {
            value: {
              ...t["~standard"],
              jsonSchema: {
                input: fN(t, "input", e.processors),
                output: fN(t, "output", e.processors),
              },
            },
            enumerable: !1,
            writable: !1,
          }),
          i
        );
      } catch (e) {
        throw Error("Error converting schema to JSON.");
      }
    }
    e.s(
      [
        "TimePrecision",
        0,
        c8,
        "_any",
        0,
        db,
        "_array",
        0,
        d1,
        "_base64",
        0,
        c4,
        "_base64url",
        0,
        c2,
        "_bigint",
        0,
        df,
        "_boolean",
        0,
        dc,
        "_catch",
        0,
        fc,
        "_check",
        0,
        fb,
        "_cidrv4",
        0,
        c1,
        "_cidrv6",
        0,
        c6,
        "_coercedBigint",
        0,
        dh,
        "_coercedBoolean",
        0,
        dd,
        "_coercedDate",
        0,
        dS,
        "_coercedNumber",
        0,
        dr,
        "_coercedString",
        0,
        cj,
        "_cuid",
        0,
        cV,
        "_cuid2",
        0,
        cW,
        "_custom",
        0,
        fg,
        "_date",
        0,
        dw,
        "_default",
        0,
        fo,
        "_discriminatedUnion",
        0,
        d2,
        "_e164",
        0,
        c5,
        "_email",
        0,
        cZ,
        "_emoji",
        0,
        cQ,
        "_endsWith",
        0,
        dJ,
        "_enum",
        0,
        fe,
        "_file",
        0,
        fr,
        "_float32",
        0,
        ds,
        "_float64",
        0,
        da,
        "_gt",
        0,
        dP,
        "_gte",
        0,
        dN,
        "_guid",
        0,
        cL,
        "_includes",
        0,
        dq,
        "_int",
        0,
        dn,
        "_int32",
        0,
        du,
        "_int64",
        0,
        dp,
        "_intersection",
        0,
        d5,
        "_ipv4",
        0,
        cH,
        "_ipv6",
        0,
        cY,
        "_isoDate",
        0,
        c7,
        "_isoDateTime",
        0,
        c9,
        "_isoDuration",
        0,
        dt,
        "_isoTime",
        0,
        de,
        "_jwt",
        0,
        c3,
        "_ksuid",
        0,
        cX,
        "_lazy",
        0,
        fp,
        "_length",
        0,
        dR,
        "_literal",
        0,
        fi,
        "_lowercase",
        0,
        dB,
        "_lt",
        0,
        dI,
        "_lte",
        0,
        dE,
        "_mac",
        0,
        c0,
        "_map",
        0,
        d9,
        "_max",
        0,
        dE,
        "_maxLength",
        0,
        dZ,
        "_maxSize",
        0,
        dD,
        "_mime",
        0,
        dW,
        "_min",
        0,
        dN,
        "_minLength",
        0,
        dL,
        "_minSize",
        0,
        dC,
        "_multipleOf",
        0,
        dU,
        "_nan",
        0,
        dk,
        "_nanoid",
        0,
        cJ,
        "_nativeEnum",
        0,
        ft,
        "_negative",
        0,
        dO,
        "_never",
        0,
        d$,
        "_nonnegative",
        0,
        dA,
        "_nonoptional",
        0,
        fu,
        "_nonpositive",
        0,
        dz,
        "_normalize",
        0,
        dK,
        "_null",
        0,
        dy,
        "_nullable",
        0,
        fa,
        "_number",
        0,
        di,
        "_optional",
        0,
        fs,
        "_overwrite",
        0,
        dG,
        "_pipe",
        0,
        fd,
        "_positive",
        0,
        dT,
        "_promise",
        0,
        fm,
        "_property",
        0,
        dV,
        "_readonly",
        0,
        ff,
        "_record",
        0,
        d8,
        "_refine",
        0,
        fv,
        "_regex",
        0,
        dM,
        "_set",
        0,
        d7,
        "_size",
        0,
        dj,
        "_slugify",
        0,
        d0,
        "_startsWith",
        0,
        dQ,
        "_string",
        0,
        cC,
        "_stringFormat",
        0,
        fw,
        "_stringbool",
        0,
        fx,
        "_success",
        0,
        fl,
        "_superRefine",
        0,
        fy,
        "_symbol",
        0,
        dg,
        "_templateLiteral",
        0,
        fh,
        "_toLowerCase",
        0,
        dH,
        "_toUpperCase",
        0,
        dY,
        "_transform",
        0,
        fn,
        "_trim",
        0,
        dX,
        "_tuple",
        0,
        d3,
        "_uint32",
        0,
        dl,
        "_uint64",
        0,
        dm,
        "_ulid",
        0,
        cG,
        "_undefined",
        0,
        dv,
        "_union",
        0,
        d6,
        "_unknown",
        0,
        d_,
        "_uppercase",
        0,
        dF,
        "_url",
        0,
        cq,
        "_uuid",
        0,
        cR,
        "_uuidv4",
        0,
        cM,
        "_uuidv6",
        0,
        cB,
        "_uuidv7",
        0,
        cF,
        "_void",
        0,
        dx,
        "_xid",
        0,
        cK,
        "_xor",
        0,
        d4,
        "describe",
        0,
        f_,
        "meta",
        0,
        f$,
      ],
      62061,
    ),
      e.i(62061);
    let fP =
        (e, t = {}) =>
        (i) => {
          let r = fS({ ...i, processors: t });
          return fk(e, r), fI(r, e), fE(r, e);
        },
      fN =
        (e, t, i = {}) =>
        (r) => {
          let { libraryOptions: n, target: s } = r ?? {},
            a = fS({ ...(n ?? {}), target: s, io: t, processors: i });
          return fk(e, a), fI(a, e), fE(a, e);
        };
    e.s(
      [
        "createStandardJSONSchemaMethod",
        0,
        fN,
        "createToJSONSchemaMethod",
        0,
        fP,
        "extractDefs",
        0,
        fI,
        "finalize",
        0,
        fE,
        "initializeContext",
        0,
        fS,
        "process",
        0,
        fk,
      ],
      7159,
    ),
      e.i(7159);
    let fT = {
        guid: "uuid",
        url: "uri",
        datetime: "date-time",
        json_string: "json-string",
        regex: "",
      },
      fO = (e, t, i, r) => {
        i.type = "string";
        let {
          minimum: n,
          maximum: s,
          format: a,
          patterns: o,
          contentEncoding: u,
        } = e._zod.bag;
        if (
          ("number" == typeof n && (i.minLength = n),
          "number" == typeof s && (i.maxLength = s),
          a &&
            ((i.format = fT[a] ?? a),
            "" === i.format && delete i.format,
            "time" === a && delete i.format),
          u && (i.contentEncoding = u),
          o && o.size > 0)
        ) {
          let e = [...o];
          1 === e.length
            ? (i.pattern = e[0].source)
            : e.length > 1 &&
              (i.allOf = [
                ...e.map((e) => ({
                  ...("draft-07" === t.target ||
                  "draft-04" === t.target ||
                  "openapi-3.0" === t.target
                    ? { type: "string" }
                    : {}),
                  pattern: e.source,
                })),
              ]);
        }
      },
      fz = (e, t, i, r) => {
        let {
          minimum: n,
          maximum: s,
          format: a,
          multipleOf: o,
          exclusiveMaximum: u,
          exclusiveMinimum: l,
        } = e._zod.bag;
        "string" == typeof a && a.includes("int")
          ? (i.type = "integer")
          : (i.type = "number");
        let c = "number" == typeof l && l >= (n ?? -1 / 0),
          d = "number" == typeof u && u <= (s ?? 1 / 0),
          f = "draft-04" === t.target || "openapi-3.0" === t.target;
        c
          ? f
            ? ((i.minimum = l), (i.exclusiveMinimum = !0))
            : (i.exclusiveMinimum = l)
          : "number" == typeof n && (i.minimum = n),
          d
            ? f
              ? ((i.maximum = u), (i.exclusiveMaximum = !0))
              : (i.exclusiveMaximum = u)
            : "number" == typeof s && (i.maximum = s),
          "number" == typeof o && (i.multipleOf = o);
      },
      fA = (e, t, i, r) => {
        i.type = "boolean";
      },
      fU = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("BigInt cannot be represented in JSON Schema");
      },
      fD = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Symbols cannot be represented in JSON Schema");
      },
      fC = (e, t, i, r) => {
        "openapi-3.0" === t.target
          ? ((i.type = "string"), (i.nullable = !0), (i.enum = [null]))
          : (i.type = "null");
      },
      fj = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Undefined cannot be represented in JSON Schema");
      },
      fZ = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Void cannot be represented in JSON Schema");
      },
      fL = (e, t, i, r) => {
        i.not = {};
      },
      fR = (e, t, i, r) => {},
      fM = (e, t, i, r) => {},
      fB = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Date cannot be represented in JSON Schema");
      },
      fF = (e, t, i, r) => {
        let n = az(e._zod.def.entries);
        n.every((e) => "number" == typeof e) && (i.type = "number"),
          n.every((e) => "string" == typeof e) && (i.type = "string"),
          (i.enum = n);
      },
      fq = (e, t, i, r) => {
        let n = e._zod.def,
          s = [];
        for (let e of n.values)
          if (void 0 === e) {
            if ("throw" === t.unrepresentable)
              throw Error(
                "Literal `undefined` cannot be represented in JSON Schema",
              );
          } else if ("bigint" == typeof e)
            if ("throw" === t.unrepresentable)
              throw Error(
                "BigInt literals cannot be represented in JSON Schema",
              );
            else s.push(Number(e));
          else s.push(e);
        if (0 === s.length);
        else if (1 === s.length) {
          let e = s[0];
          (i.type = null === e ? "null" : typeof e),
            "draft-04" === t.target || "openapi-3.0" === t.target
              ? (i.enum = [e])
              : (i.const = e);
        } else
          s.every((e) => "number" == typeof e) && (i.type = "number"),
            s.every((e) => "string" == typeof e) && (i.type = "string"),
            s.every((e) => "boolean" == typeof e) && (i.type = "boolean"),
            s.every((e) => null === e) && (i.type = "null"),
            (i.enum = s);
      },
      fQ = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("NaN cannot be represented in JSON Schema");
      },
      fJ = (e, t, i, r) => {
        let n = e._zod.pattern;
        if (!n) throw Error("Pattern not found in template literal");
        (i.type = "string"), (i.pattern = n.source);
      },
      fV = (e, t, i, r) => {
        let n = { type: "string", format: "binary", contentEncoding: "binary" },
          { minimum: s, maximum: a, mime: o } = e._zod.bag;
        void 0 !== s && (n.minLength = s),
          void 0 !== a && (n.maxLength = a),
          o
            ? 1 === o.length
              ? ((n.contentMediaType = o[0]), Object.assign(i, n))
              : (Object.assign(i, n),
                (i.anyOf = o.map((e) => ({ contentMediaType: e }))))
            : Object.assign(i, n);
      },
      fW = (e, t, i, r) => {
        i.type = "boolean";
      },
      fG = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Custom types cannot be represented in JSON Schema");
      },
      fK = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Function types cannot be represented in JSON Schema");
      },
      fX = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Transforms cannot be represented in JSON Schema");
      },
      fH = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Map cannot be represented in JSON Schema");
      },
      fY = (e, t, i, r) => {
        if ("throw" === t.unrepresentable)
          throw Error("Set cannot be represented in JSON Schema");
      },
      f0 = (e, t, i, r) => {
        let n = e._zod.def,
          { minimum: s, maximum: a } = e._zod.bag;
        "number" == typeof s && (i.minItems = s),
          "number" == typeof a && (i.maxItems = a),
          (i.type = "array"),
          (i.items = fk(n.element, t, { ...r, path: [...r.path, "items"] }));
      },
      f1 = (e, t, i, r) => {
        let n = e._zod.def;
        (i.type = "object"), (i.properties = {});
        let s = n.shape;
        for (let e in s)
          i.properties[e] = fk(s[e], t, {
            ...r,
            path: [...r.path, "properties", e],
          });
        let a = new Set(
          [...new Set(Object.keys(s))].filter((e) => {
            let i = n.shape[e]._zod;
            return "input" === t.io ? void 0 === i.optin : void 0 === i.optout;
          }),
        );
        a.size > 0 && (i.required = Array.from(a)),
          n.catchall?._zod.def.type === "never"
            ? (i.additionalProperties = !1)
            : n.catchall
              ? n.catchall &&
                (i.additionalProperties = fk(n.catchall, t, {
                  ...r,
                  path: [...r.path, "additionalProperties"],
                }))
              : "output" === t.io && (i.additionalProperties = !1);
      },
      f6 = (e, t, i, r) => {
        let n = e._zod.def,
          s = !1 === n.inclusive,
          a = n.options.map((e, i) =>
            fk(e, t, { ...r, path: [...r.path, s ? "oneOf" : "anyOf", i] }),
          );
        s ? (i.oneOf = a) : (i.anyOf = a);
      },
      f4 = (e, t, i, r) => {
        let n = e._zod.def,
          s = fk(n.left, t, { ...r, path: [...r.path, "allOf", 0] }),
          a = fk(n.right, t, { ...r, path: [...r.path, "allOf", 1] }),
          o = (e) => "allOf" in e && 1 === Object.keys(e).length;
        i.allOf = [...(o(s) ? s.allOf : [s]), ...(o(a) ? a.allOf : [a])];
      },
      f2 = (e, t, i, r) => {
        let n = e._zod.def;
        i.type = "array";
        let s = "draft-2020-12" === t.target ? "prefixItems" : "items",
          a =
            "draft-2020-12" === t.target || "openapi-3.0" === t.target
              ? "items"
              : "additionalItems",
          o = n.items.map((e, i) =>
            fk(e, t, { ...r, path: [...r.path, s, i] }),
          ),
          u = n.rest
            ? fk(n.rest, t, {
                ...r,
                path: [
                  ...r.path,
                  a,
                  ...("openapi-3.0" === t.target ? [n.items.length] : []),
                ],
              })
            : null;
        "draft-2020-12" === t.target
          ? ((i.prefixItems = o), u && (i.items = u))
          : "openapi-3.0" === t.target
            ? ((i.items = { anyOf: o }),
              u && i.items.anyOf.push(u),
              (i.minItems = o.length),
              u || (i.maxItems = o.length))
            : ((i.items = o), u && (i.additionalItems = u));
        let { minimum: l, maximum: c } = e._zod.bag;
        "number" == typeof l && (i.minItems = l),
          "number" == typeof c && (i.maxItems = c);
      },
      f5 = (e, t, i, r) => {
        let n = e._zod.def;
        i.type = "object";
        let s = n.keyType,
          a = s._zod.bag,
          o = a?.patterns;
        if ("loose" === n.mode && o && o.size > 0) {
          let e = fk(n.valueType, t, {
            ...r,
            path: [...r.path, "patternProperties", "*"],
          });
          for (let t of ((i.patternProperties = {}), o))
            i.patternProperties[t.source] = e;
        } else
          ("draft-07" === t.target || "draft-2020-12" === t.target) &&
            (i.propertyNames = fk(n.keyType, t, {
              ...r,
              path: [...r.path, "propertyNames"],
            })),
            (i.additionalProperties = fk(n.valueType, t, {
              ...r,
              path: [...r.path, "additionalProperties"],
            }));
        let u = s._zod.values;
        if (u) {
          let e = [...u].filter(
            (e) => "string" == typeof e || "number" == typeof e,
          );
          e.length > 0 && (i.required = e);
        }
      },
      f3 = (e, t, i, r) => {
        let n = e._zod.def,
          s = fk(n.innerType, t, r),
          a = t.seen.get(e);
        "openapi-3.0" === t.target
          ? ((a.ref = n.innerType), (i.nullable = !0))
          : (i.anyOf = [s, { type: "null" }]);
      },
      f8 = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r), (t.seen.get(e).ref = n.innerType);
      },
      f9 = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r),
          (t.seen.get(e).ref = n.innerType),
          (i.default = JSON.parse(JSON.stringify(n.defaultValue)));
      },
      f7 = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r),
          (t.seen.get(e).ref = n.innerType),
          "input" === t.io &&
            (i._prefault = JSON.parse(JSON.stringify(n.defaultValue)));
      },
      he = (e, t, i, r) => {
        let n,
          s = e._zod.def;
        fk(s.innerType, t, r), (t.seen.get(e).ref = s.innerType);
        try {
          n = s.catchValue(void 0);
        } catch {
          throw Error("Dynamic catch values are not supported in JSON Schema");
        }
        i.default = n;
      },
      ht = (e, t, i, r) => {
        let n = e._zod.def,
          s = n.in._zod.traits.has("$ZodTransform"),
          a = "input" === t.io ? (s ? n.out : n.in) : n.out;
        fk(a, t, r), (t.seen.get(e).ref = a);
      },
      hi = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r),
          (t.seen.get(e).ref = n.innerType),
          (i.readOnly = !0);
      },
      hr = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r), (t.seen.get(e).ref = n.innerType);
      },
      hn = (e, t, i, r) => {
        let n = e._zod.def;
        fk(n.innerType, t, r), (t.seen.get(e).ref = n.innerType);
      },
      hs = (e, t, i, r) => {
        let n = e._zod.innerType;
        fk(n, t, r), (t.seen.get(e).ref = n);
      },
      ha = {
        string: fO,
        number: fz,
        boolean: fA,
        bigint: fU,
        symbol: fD,
        null: fC,
        undefined: fj,
        void: fZ,
        never: fL,
        any: fR,
        unknown: fM,
        date: fB,
        enum: fF,
        literal: fq,
        nan: fQ,
        template_literal: fJ,
        file: fV,
        success: fW,
        custom: fG,
        function: fK,
        transform: fX,
        map: fH,
        set: fY,
        array: f0,
        object: f1,
        union: f6,
        intersection: f4,
        tuple: f2,
        record: f5,
        nullable: f3,
        nonoptional: f8,
        default: f9,
        prefault: f7,
        catch: he,
        pipe: ht,
        readonly: hi,
        promise: hr,
        optional: hn,
        lazy: hs,
      };
    function ho(e, t) {
      if ("_idmap" in e) {
        let i = fS({ ...t, processors: ha }),
          r = {};
        for (let t of e._idmap.entries()) {
          let [e, r] = t;
          fk(r, i);
        }
        let n = {};
        for (let s of ((i.external = { registry: e, uri: t?.uri, defs: r }),
        e._idmap.entries())) {
          let [e, t] = s;
          fI(i, t), (n[e] = fE(i, t));
        }
        return (
          Object.keys(r).length > 0 &&
            (n.__shared = {
              ["draft-2020-12" === i.target ? "$defs" : "definitions"]: r,
            }),
          { schemas: n }
        );
      }
      let i = fS({ ...t, processors: ha });
      return fk(e, i), fI(i, e), fE(i, e);
    }
    e.s([], 33145);
    var hu = e.i(33145);
    e.s(
      [
        "$ZodAny",
        0,
        lI,
        "$ZodArray",
        0,
        lz,
        "$ZodAsyncError",
        0,
        aP,
        "$ZodBase64",
        0,
        ld,
        "$ZodBase64URL",
        0,
        lh,
        "$ZodBigInt",
        0,
        l$,
        "$ZodBigIntFormat",
        0,
        lx,
        "$ZodBoolean",
        0,
        l_,
        "$ZodCIDRv4",
        0,
        lu,
        "$ZodCIDRv6",
        0,
        ll,
        "$ZodCUID",
        0,
        u3,
        "$ZodCUID2",
        0,
        u8,
        "$ZodCatch",
        0,
        cn,
        "$ZodCheck",
        0,
        uk,
        "$ZodCheckBigIntFormat",
        0,
        uO,
        "$ZodCheckEndsWith",
        0,
        uq,
        "$ZodCheckGreaterThan",
        0,
        uP,
        "$ZodCheckIncludes",
        0,
        uB,
        "$ZodCheckLengthEquals",
        0,
        uj,
        "$ZodCheckLessThan",
        0,
        uE,
        "$ZodCheckLowerCase",
        0,
        uR,
        "$ZodCheckMaxLength",
        0,
        uD,
        "$ZodCheckMaxSize",
        0,
        uz,
        "$ZodCheckMimeType",
        0,
        uV,
        "$ZodCheckMinLength",
        0,
        uC,
        "$ZodCheckMinSize",
        0,
        uA,
        "$ZodCheckMultipleOf",
        0,
        uN,
        "$ZodCheckNumberFormat",
        0,
        uT,
        "$ZodCheckOverwrite",
        0,
        uW,
        "$ZodCheckProperty",
        0,
        uJ,
        "$ZodCheckRegex",
        0,
        uL,
        "$ZodCheckSizeEquals",
        0,
        uU,
        "$ZodCheckStartsWith",
        0,
        uF,
        "$ZodCheckStringFormat",
        0,
        uZ,
        "$ZodCheckUpperCase",
        0,
        uM,
        "$ZodCodec",
        0,
        cu,
        "$ZodCustom",
        0,
        cy,
        "$ZodCustomStringFormat",
        0,
        lv,
        "$ZodDate",
        0,
        lT,
        "$ZodDefault",
        0,
        l9,
        "$ZodDiscriminatedUnion",
        0,
        lB,
        "$ZodE164",
        0,
        lp,
        "$ZodEmail",
        0,
        u6,
        "$ZodEmoji",
        0,
        u2,
        "$ZodEncodeError",
        0,
        aN,
        "$ZodEnum",
        0,
        l0,
        "$ZodError",
        0,
        ou,
        "$ZodExactOptional",
        0,
        l3,
        "$ZodFile",
        0,
        l6,
        "$ZodFunction",
        0,
        cm,
        "$ZodGUID",
        0,
        u0,
        "$ZodIPv4",
        0,
        ls,
        "$ZodIPv6",
        0,
        la,
        "$ZodISODate",
        0,
        li,
        "$ZodISODateTime",
        0,
        lt,
        "$ZodISODuration",
        0,
        ln,
        "$ZodISOTime",
        0,
        lr,
        "$ZodIntersection",
        0,
        lF,
        "$ZodJWT",
        0,
        lg,
        "$ZodKSUID",
        0,
        le,
        "$ZodLazy",
        0,
        cv,
        "$ZodLiteral",
        0,
        l1,
        "$ZodMAC",
        0,
        lo,
        "$ZodMap",
        0,
        lK,
        "$ZodNaN",
        0,
        cs,
        "$ZodNanoID",
        0,
        u5,
        "$ZodNever",
        0,
        lP,
        "$ZodNonOptional",
        0,
        ct,
        "$ZodNull",
        0,
        lk,
        "$ZodNullable",
        0,
        l8,
        "$ZodNumber",
        0,
        ly,
        "$ZodNumberFormat",
        0,
        lb,
        "$ZodObject",
        0,
        lC,
        "$ZodObjectJIT",
        0,
        lj,
        "$ZodOptional",
        0,
        l5,
        "$ZodPipe",
        0,
        ca,
        "$ZodPrefault",
        0,
        ce,
        "$ZodPreprocess",
        0,
        cd,
        "$ZodPromise",
        0,
        cg,
        "$ZodReadonly",
        0,
        cf,
        "$ZodRealError",
        0,
        ol,
        "$ZodRecord",
        0,
        lG,
        "$ZodRegistry",
        0,
        cA,
        "$ZodSet",
        0,
        lH,
        "$ZodString",
        0,
        uH,
        "$ZodStringFormat",
        0,
        uY,
        "$ZodSuccess",
        0,
        cr,
        "$ZodSymbol",
        0,
        lw,
        "$ZodTemplateLiteral",
        0,
        cp,
        "$ZodTransform",
        0,
        l4,
        "$ZodTuple",
        0,
        lQ,
        "$ZodType",
        0,
        uX,
        "$ZodULID",
        0,
        u9,
        "$ZodURL",
        0,
        u4,
        "$ZodUUID",
        0,
        u1,
        "$ZodUndefined",
        0,
        lS,
        "$ZodUnion",
        0,
        lL,
        "$ZodUnknown",
        0,
        lE,
        "$ZodVoid",
        0,
        lN,
        "$ZodXID",
        0,
        u7,
        "$ZodXor",
        0,
        lM,
        "$brand",
        0,
        aE,
        "$constructor",
        0,
        aI,
        "$input",
        0,
        cz,
        "$output",
        0,
        cO,
        "Doc",
        0,
        uG,
        "JSONSchema",
        0,
        hu,
        "JSONSchemaGenerator",
        0,
        class {
          get metadataRegistry() {
            return this.ctx.metadataRegistry;
          }
          get target() {
            return this.ctx.target;
          }
          get unrepresentable() {
            return this.ctx.unrepresentable;
          }
          get override() {
            return this.ctx.override;
          }
          get io() {
            return this.ctx.io;
          }
          get counter() {
            return this.ctx.counter;
          }
          set counter(e) {
            this.ctx.counter = e;
          }
          get seen() {
            return this.ctx.seen;
          }
          constructor(e) {
            let t = e?.target ?? "draft-2020-12";
            "draft-4" === t && (t = "draft-04"),
              "draft-7" === t && (t = "draft-07"),
              (this.ctx = fS({
                processors: ha,
                target: t,
                ...(e?.metadata && { metadata: e.metadata }),
                ...(e?.unrepresentable && {
                  unrepresentable: e.unrepresentable,
                }),
                ...(e?.override && { override: e.override }),
                ...(e?.io && { io: e.io }),
              }));
          }
          process(e, t = { path: [], schemaPath: [] }) {
            return fk(e, this.ctx, t);
          }
          emit(e, t) {
            t &&
              (t.cycles && (this.ctx.cycles = t.cycles),
              t.reused && (this.ctx.reused = t.reused),
              t.external && (this.ctx.external = t.external)),
              fI(this.ctx, e);
            let { "~standard": i, ...r } = fE(this.ctx, e);
            return r;
          }
        },
        "NEVER",
        0,
        ak,
        "TimePrecision",
        0,
        c8,
        "_any",
        0,
        db,
        "_array",
        0,
        d1,
        "_base64",
        0,
        c4,
        "_base64url",
        0,
        c2,
        "_bigint",
        0,
        df,
        "_boolean",
        0,
        dc,
        "_catch",
        0,
        fc,
        "_check",
        0,
        fb,
        "_cidrv4",
        0,
        c1,
        "_cidrv6",
        0,
        c6,
        "_coercedBigint",
        0,
        dh,
        "_coercedBoolean",
        0,
        dd,
        "_coercedDate",
        0,
        dS,
        "_coercedNumber",
        0,
        dr,
        "_coercedString",
        0,
        cj,
        "_cuid",
        0,
        cV,
        "_cuid2",
        0,
        cW,
        "_custom",
        0,
        fg,
        "_date",
        0,
        dw,
        "_decode",
        0,
        ok,
        "_decodeAsync",
        0,
        oN,
        "_default",
        0,
        fo,
        "_discriminatedUnion",
        0,
        d2,
        "_e164",
        0,
        c5,
        "_email",
        0,
        cZ,
        "_emoji",
        0,
        cQ,
        "_encode",
        0,
        ow,
        "_encodeAsync",
        0,
        oE,
        "_endsWith",
        0,
        dJ,
        "_enum",
        0,
        fe,
        "_file",
        0,
        fr,
        "_float32",
        0,
        ds,
        "_float64",
        0,
        da,
        "_gt",
        0,
        dP,
        "_gte",
        0,
        dN,
        "_guid",
        0,
        cL,
        "_includes",
        0,
        dq,
        "_int",
        0,
        dn,
        "_int32",
        0,
        du,
        "_int64",
        0,
        dp,
        "_intersection",
        0,
        d5,
        "_ipv4",
        0,
        cH,
        "_ipv6",
        0,
        cY,
        "_isoDate",
        0,
        c7,
        "_isoDateTime",
        0,
        c9,
        "_isoDuration",
        0,
        dt,
        "_isoTime",
        0,
        de,
        "_jwt",
        0,
        c3,
        "_ksuid",
        0,
        cX,
        "_lazy",
        0,
        fp,
        "_length",
        0,
        dR,
        "_literal",
        0,
        fi,
        "_lowercase",
        0,
        dB,
        "_lt",
        0,
        dI,
        "_lte",
        0,
        dE,
        "_mac",
        0,
        c0,
        "_map",
        0,
        d9,
        "_max",
        0,
        dE,
        "_maxLength",
        0,
        dZ,
        "_maxSize",
        0,
        dD,
        "_mime",
        0,
        dW,
        "_min",
        0,
        dN,
        "_minLength",
        0,
        dL,
        "_minSize",
        0,
        dC,
        "_multipleOf",
        0,
        dU,
        "_nan",
        0,
        dk,
        "_nanoid",
        0,
        cJ,
        "_nativeEnum",
        0,
        ft,
        "_negative",
        0,
        dO,
        "_never",
        0,
        d$,
        "_nonnegative",
        0,
        dA,
        "_nonoptional",
        0,
        fu,
        "_nonpositive",
        0,
        dz,
        "_normalize",
        0,
        dK,
        "_null",
        0,
        dy,
        "_nullable",
        0,
        fa,
        "_number",
        0,
        di,
        "_optional",
        0,
        fs,
        "_overwrite",
        0,
        dG,
        "_parse",
        0,
        om,
        "_parseAsync",
        0,
        ov,
        "_pipe",
        0,
        fd,
        "_positive",
        0,
        dT,
        "_promise",
        0,
        fm,
        "_property",
        0,
        dV,
        "_readonly",
        0,
        ff,
        "_record",
        0,
        d8,
        "_refine",
        0,
        fv,
        "_regex",
        0,
        dM,
        "_safeDecode",
        0,
        oA,
        "_safeDecodeAsync",
        0,
        oj,
        "_safeEncode",
        0,
        oO,
        "_safeEncodeAsync",
        0,
        oD,
        "_safeParse",
        0,
        ob,
        "_safeParseAsync",
        0,
        o$,
        "_set",
        0,
        d7,
        "_size",
        0,
        dj,
        "_slugify",
        0,
        d0,
        "_startsWith",
        0,
        dQ,
        "_string",
        0,
        cC,
        "_stringFormat",
        0,
        fw,
        "_stringbool",
        0,
        fx,
        "_success",
        0,
        fl,
        "_superRefine",
        0,
        fy,
        "_symbol",
        0,
        dg,
        "_templateLiteral",
        0,
        fh,
        "_toLowerCase",
        0,
        dH,
        "_toUpperCase",
        0,
        dY,
        "_transform",
        0,
        fn,
        "_trim",
        0,
        dX,
        "_tuple",
        0,
        d3,
        "_uint32",
        0,
        dl,
        "_uint64",
        0,
        dm,
        "_ulid",
        0,
        cG,
        "_undefined",
        0,
        dv,
        "_union",
        0,
        d6,
        "_unknown",
        0,
        d_,
        "_uppercase",
        0,
        dF,
        "_url",
        0,
        cq,
        "_uuid",
        0,
        cR,
        "_uuidv4",
        0,
        cM,
        "_uuidv6",
        0,
        cB,
        "_uuidv7",
        0,
        cF,
        "_void",
        0,
        dx,
        "_xid",
        0,
        cK,
        "_xor",
        0,
        d4,
        "clone",
        0,
        aY,
        "config",
        0,
        aO,
        "createStandardJSONSchemaMethod",
        0,
        fN,
        "createToJSONSchemaMethod",
        0,
        fP,
        "decode",
        0,
        oI,
        "decodeAsync",
        0,
        oT,
        "describe",
        0,
        f_,
        "encode",
        0,
        oS,
        "encodeAsync",
        0,
        oP,
        "extractDefs",
        0,
        fI,
        "finalize",
        0,
        fE,
        "flattenError",
        0,
        oc,
        "formatError",
        0,
        od,
        "globalConfig",
        0,
        aT,
        "globalRegistry",
        0,
        cD,
        "initializeContext",
        0,
        fS,
        "isValidBase64",
        0,
        lc,
        "isValidBase64URL",
        0,
        lf,
        "isValidJWT",
        0,
        lm,
        "locales",
        0,
        cT,
        "meta",
        0,
        f$,
        "parse",
        0,
        og,
        "parseAsync",
        0,
        oy,
        "prettifyError",
        0,
        op,
        "process",
        0,
        fk,
        "regexes",
        0,
        c$,
        "registry",
        0,
        cU,
        "safeDecode",
        0,
        oU,
        "safeDecodeAsync",
        0,
        oZ,
        "safeEncode",
        0,
        oz,
        "safeEncodeAsync",
        0,
        oC,
        "safeParse",
        0,
        o_,
        "safeParseAsync",
        0,
        ox,
        "toDotPath",
        0,
        oh,
        "toJSONSchema",
        0,
        ho,
        "treeifyError",
        0,
        of,
        "util",
        0,
        c_,
        "version",
        0,
        uK,
      ],
      13007,
    );
    var hl = e.i(13007);
    e.s(
      [
        "ZodAny",
        () => pW,
        "ZodArray",
        () => p2,
        "ZodBase64",
        () => pp,
        "ZodBase64URL",
        () => pg,
        "ZodBigInt",
        () => pj,
        "ZodBigIntFormat",
        () => pL,
        "ZodBoolean",
        () => pD,
        "ZodCIDRv4",
        () => pc,
        "ZodCIDRv6",
        () => pf,
        "ZodCUID",
        () => h2,
        "ZodCUID2",
        () => h3,
        "ZodCatch",
        () => mF,
        "ZodCodec",
        () => mG,
        "ZodCustom",
        () => m7,
        "ZodCustomStringFormat",
        () => px,
        "ZodDate",
        () => p6,
        "ZodDefault",
        () => mD,
        "ZodDiscriminatedUnion",
        () => ms,
        "ZodE164",
        () => py,
        "ZodEmail",
        () => hB,
        "ZodEmoji",
        () => h0,
        "ZodEnum",
        () => mb,
        "ZodExactOptional",
        () => mT,
        "ZodFile",
        () => mS,
        "ZodFunction",
        () => m8,
        "ZodGUID",
        () => hq,
        "ZodIPv4",
        () => pn,
        "ZodIPv6",
        () => pu,
        "ZodIntersection",
        () => mo,
        "ZodJWT",
        () => p_,
        "ZodKSUID",
        () => pi,
        "ZodLazy",
        () => m4,
        "ZodLiteral",
        () => mx,
        "ZodMAC",
        () => pa,
        "ZodMap",
        () => mm,
        "ZodNaN",
        () => mQ,
        "ZodNanoID",
        () => h6,
        "ZodNever",
        () => pH,
        "ZodNonOptional",
        () => mL,
        "ZodNull",
        () => pJ,
        "ZodNullable",
        () => mz,
        "ZodNumber",
        () => pE,
        "ZodNumberFormat",
        () => pN,
        "ZodObject",
        () => p8,
        "ZodOptional",
        () => mP,
        "ZodPipe",
        () => mV,
        "ZodPrefault",
        () => mj,
        "ZodPreprocess",
        () => mH,
        "ZodPromise",
        () => m5,
        "ZodReadonly",
        () => mY,
        "ZodRecord",
        () => md,
        "ZodSet",
        () => mv,
        "ZodString",
        () => hL,
        "ZodStringFormat",
        () => hM,
        "ZodSuccess",
        () => mM,
        "ZodSymbol",
        () => pB,
        "ZodTemplateLiteral",
        () => m1,
        "ZodTransform",
        () => mI,
        "ZodTuple",
        () => ml,
        "ZodType",
        () => hj,
        "ZodULID",
        () => h9,
        "ZodURL",
        () => hX,
        "ZodUUID",
        () => hJ,
        "ZodUndefined",
        () => pq,
        "ZodUnion",
        () => mt,
        "ZodUnknown",
        () => pK,
        "ZodVoid",
        () => p0,
        "ZodXID",
        () => pe,
        "ZodXor",
        () => mr,
        "_ZodString",
        () => hZ,
        "_default",
        () => mC,
        "_function",
        () => m9,
        "any",
        () => pG,
        "array",
        () => p5,
        "base64",
        () => pm,
        "base64url",
        () => pv,
        "bigint",
        () => pZ,
        "boolean",
        () => pC,
        "catch",
        () => mq,
        "check",
        () => ge,
        "cidrv4",
        () => pd,
        "cidrv6",
        () => ph,
        "codec",
        () => mK,
        "cuid",
        () => h5,
        "cuid2",
        () => h8,
        "custom",
        () => gt,
        "date",
        () => p4,
        "describe",
        () => gn,
        "discriminatedUnion",
        () => ma,
        "e164",
        () => pb,
        "email",
        () => hF,
        "emoji",
        () => h1,
        "enum",
        () => m_,
        "exactOptional",
        () => mO,
        "file",
        () => mk,
        "float32",
        () => pO,
        "float64",
        () => pz,
        "function",
        () => m9,
        "guid",
        () => hQ,
        "hash",
        () => pI,
        "hex",
        () => pk,
        "hostname",
        () => pS,
        "httpUrl",
        () => hY,
        "instanceof",
        () => ga,
        "int",
        () => pT,
        "int32",
        () => pA,
        "int64",
        () => pR,
        "intersection",
        () => mu,
        "invertCodec",
        () => mX,
        "ipv4",
        () => ps,
        "ipv6",
        () => pl,
        "json",
        () => gu,
        "jwt",
        () => p$,
        "keyof",
        () => p3,
        "ksuid",
        () => pr,
        "lazy",
        () => m2,
        "literal",
        () => mw,
        "looseObject",
        () => me,
        "looseRecord",
        () => mp,
        "mac",
        () => po,
        "map",
        () => mg,
        "meta",
        () => gs,
        "nan",
        () => mJ,
        "nanoid",
        () => h4,
        "nativeEnum",
        () => m$,
        "never",
        () => pY,
        "nonoptional",
        () => mR,
        "null",
        () => pV,
        "nullable",
        () => mA,
        "nullish",
        () => mU,
        "number",
        () => pP,
        "object",
        () => p9,
        "optional",
        () => mN,
        "partialRecord",
        () => mh,
        "pipe",
        () => mW,
        "prefault",
        () => mZ,
        "preprocess",
        () => gl,
        "promise",
        () => m3,
        "readonly",
        () => m0,
        "record",
        () => mf,
        "refine",
        () => gi,
        "set",
        () => my,
        "strictObject",
        () => p7,
        "string",
        () => hR,
        "stringFormat",
        () => pw,
        "stringbool",
        () => go,
        "success",
        () => mB,
        "superRefine",
        () => gr,
        "symbol",
        () => pF,
        "templateLiteral",
        () => m6,
        "transform",
        () => mE,
        "tuple",
        () => mc,
        "uint32",
        () => pU,
        "uint64",
        () => pM,
        "ulid",
        () => h7,
        "undefined",
        () => pQ,
        "union",
        () => mi,
        "unknown",
        () => pX,
        "url",
        () => hH,
        "uuid",
        () => hV,
        "uuidv4",
        () => hW,
        "uuidv6",
        () => hG,
        "uuidv7",
        () => hK,
        "void",
        () => p1,
        "xid",
        () => pt,
        "xor",
        () => mn,
      ],
      7855,
    );
    var hc = c$,
      hd = c_;
    e.s(
      [
        "ZodISODate",
        () => hp,
        "ZodISODateTime",
        () => hf,
        "ZodISODuration",
        () => hy,
        "ZodISOTime",
        () => hg,
        "date",
        () => hm,
        "datetime",
        () => hh,
        "duration",
        () => hb,
        "time",
        () => hv,
      ],
      51047,
    );
    let hf = aI("ZodISODateTime", (e, t) => {
      lt.init(e, t), hM.init(e, t);
    });
    function hh(e) {
      return c9(hf, e);
    }
    let hp = aI("ZodISODate", (e, t) => {
      li.init(e, t), hM.init(e, t);
    });
    function hm(e) {
      return c7(hp, e);
    }
    let hg = aI("ZodISOTime", (e, t) => {
      lr.init(e, t), hM.init(e, t);
    });
    function hv(e) {
      return de(hg, e);
    }
    let hy = aI("ZodISODuration", (e, t) => {
      ln.init(e, t), hM.init(e, t);
    });
    function hb(e) {
      return dt(hy, e);
    }
    let h_ = (e, t) => {
        ou.init(e, t),
          (e.name = "ZodError"),
          Object.defineProperties(e, {
            format: { value: (t) => od(e, t) },
            flatten: { value: (t) => oc(e, t) },
            addIssue: {
              value: (t) => {
                e.issues.push(t), (e.message = JSON.stringify(e.issues, aU, 2));
              },
            },
            addIssues: {
              value: (t) => {
                e.issues.push(...t),
                  (e.message = JSON.stringify(e.issues, aU, 2));
              },
            },
            isEmpty: { get: () => 0 === e.issues.length },
          });
      },
      h$ = aI("ZodError", h_),
      hx = aI("ZodError", h_, { Parent: Error });
    e.s(["ZodError", 0, h$, "ZodRealError", 0, hx], 15874);
    let hw = om(hx),
      hS = ov(hx),
      hk = ob(hx),
      hI = o$(hx),
      hE = ow(hx),
      hP = ok(hx),
      hN = oE(hx),
      hT = oN(hx),
      hO = oO(hx),
      hz = oA(hx),
      hA = oD(hx),
      hU = oj(hx);
    e.s(
      [
        "decode",
        0,
        hP,
        "decodeAsync",
        0,
        hT,
        "encode",
        0,
        hE,
        "encodeAsync",
        0,
        hN,
        "parse",
        0,
        hw,
        "parseAsync",
        0,
        hS,
        "safeDecode",
        0,
        hz,
        "safeDecodeAsync",
        0,
        hU,
        "safeEncode",
        0,
        hO,
        "safeEncodeAsync",
        0,
        hA,
        "safeParse",
        0,
        hk,
        "safeParseAsync",
        0,
        hI,
      ],
      48804,
    );
    let hD = new WeakMap();
    function hC(e, t, i) {
      let r = Object.getPrototypeOf(e),
        n = hD.get(r);
      if ((n || ((n = new Set()), hD.set(r, n)), !n.has(t)))
        for (let e in (n.add(t), i)) {
          let t = i[e];
          Object.defineProperty(r, e, {
            configurable: !0,
            enumerable: !1,
            get() {
              let i = t.bind(this);
              return (
                Object.defineProperty(this, e, {
                  configurable: !0,
                  writable: !0,
                  enumerable: !0,
                  value: i,
                }),
                i
              );
            },
            set(t) {
              Object.defineProperty(this, e, {
                configurable: !0,
                writable: !0,
                enumerable: !0,
                value: t,
              });
            },
          });
        }
    }
    let hj = aI(
        "ZodType",
        (e, t) => (
          uX.init(e, t),
          Object.assign(e["~standard"], {
            jsonSchema: { input: fN(e, "input"), output: fN(e, "output") },
          }),
          (e.toJSONSchema = fP(e, {})),
          (e.def = t),
          (e.type = t.type),
          Object.defineProperty(e, "_def", { value: t }),
          (e.parse = (t, i) => hw(e, t, i, { callee: e.parse })),
          (e.safeParse = (t, i) => hk(e, t, i)),
          (e.parseAsync = async (t, i) =>
            hS(e, t, i, { callee: e.parseAsync })),
          (e.safeParseAsync = async (t, i) => hI(e, t, i)),
          (e.spa = e.safeParseAsync),
          (e.encode = (t, i) => hE(e, t, i)),
          (e.decode = (t, i) => hP(e, t, i)),
          (e.encodeAsync = async (t, i) => hN(e, t, i)),
          (e.decodeAsync = async (t, i) => hT(e, t, i)),
          (e.safeEncode = (t, i) => hO(e, t, i)),
          (e.safeDecode = (t, i) => hz(e, t, i)),
          (e.safeEncodeAsync = async (t, i) => hA(e, t, i)),
          (e.safeDecodeAsync = async (t, i) => hU(e, t, i)),
          hC(e, "ZodType", {
            check(...e) {
              let t = this.def;
              return this.clone(
                hd.mergeDefs(t, {
                  checks: [
                    ...(t.checks ?? []),
                    ...e.map((e) =>
                      "function" == typeof e
                        ? {
                            _zod: {
                              check: e,
                              def: { check: "custom" },
                              onattach: [],
                            },
                          }
                        : e,
                    ),
                  ],
                }),
                { parent: !0 },
              );
            },
            with(...e) {
              return this.check(...e);
            },
            clone(e, t) {
              return aY(this, e, t);
            },
            brand() {
              return this;
            },
            register(e, t) {
              return e.add(this, t), this;
            },
            refine(e, t) {
              return this.check(gi(e, t));
            },
            superRefine(e, t) {
              return this.check(gr(e, t));
            },
            overwrite(e) {
              return this.check(dG(e));
            },
            optional() {
              return mN(this);
            },
            exactOptional() {
              return mO(this);
            },
            nullable() {
              return mA(this);
            },
            nullish() {
              return mN(mA(this));
            },
            nonoptional(e) {
              return mR(this, e);
            },
            array() {
              return p5(this);
            },
            or(e) {
              return mi([this, e]);
            },
            and(e) {
              return mu(this, e);
            },
            transform(e) {
              return mW(this, mE(e));
            },
            default(e) {
              return mC(this, e);
            },
            prefault(e) {
              return mZ(this, e);
            },
            catch(e) {
              return mq(this, e);
            },
            pipe(e) {
              return mW(this, e);
            },
            readonly() {
              return m0(this);
            },
            describe(e) {
              let t = this.clone();
              return cD.add(t, { description: e }), t;
            },
            meta(...e) {
              if (0 === e.length) return cD.get(this);
              let t = this.clone();
              return cD.add(t, e[0]), t;
            },
            isOptional() {
              return this.safeParse(void 0).success;
            },
            isNullable() {
              return this.safeParse(null).success;
            },
            apply(e) {
              return e(this);
            },
          }),
          Object.defineProperty(e, "description", {
            get: () => cD.get(e)?.description,
            configurable: !0,
          }),
          e
        ),
      ),
      hZ = aI("_ZodString", (e, t) => {
        uH.init(e, t),
          hj.init(e, t),
          (e._zod.processJSONSchema = (t, i, r) => fO(e, t, i, r));
        let i = e._zod.bag;
        (e.format = i.format ?? null),
          (e.minLength = i.minimum ?? null),
          (e.maxLength = i.maximum ?? null),
          hC(e, "_ZodString", {
            regex(...e) {
              return this.check(dM(...e));
            },
            includes(...e) {
              return this.check(dq(...e));
            },
            startsWith(...e) {
              return this.check(dQ(...e));
            },
            endsWith(...e) {
              return this.check(dJ(...e));
            },
            min(...e) {
              return this.check(dL(...e));
            },
            max(...e) {
              return this.check(dZ(...e));
            },
            length(...e) {
              return this.check(dR(...e));
            },
            nonempty(...e) {
              return this.check(dL(1, ...e));
            },
            lowercase(e) {
              return this.check(dB(e));
            },
            uppercase(e) {
              return this.check(dF(e));
            },
            trim() {
              return this.check(dX());
            },
            normalize(...e) {
              return this.check(dK(...e));
            },
            toLowerCase() {
              return this.check(dH());
            },
            toUpperCase() {
              return this.check(dY());
            },
            slugify() {
              return this.check(d0());
            },
          });
      }),
      hL = aI("ZodString", (e, t) => {
        uH.init(e, t),
          hZ.init(e, t),
          (e.email = (t) => e.check(cZ(hB, t))),
          (e.url = (t) => e.check(cq(hX, t))),
          (e.jwt = (t) => e.check(c3(p_, t))),
          (e.emoji = (t) => e.check(cQ(h0, t))),
          (e.guid = (t) => e.check(cL(hq, t))),
          (e.uuid = (t) => e.check(cR(hJ, t))),
          (e.uuidv4 = (t) => e.check(cM(hJ, t))),
          (e.uuidv6 = (t) => e.check(cB(hJ, t))),
          (e.uuidv7 = (t) => e.check(cF(hJ, t))),
          (e.nanoid = (t) => e.check(cJ(h6, t))),
          (e.guid = (t) => e.check(cL(hq, t))),
          (e.cuid = (t) => e.check(cV(h2, t))),
          (e.cuid2 = (t) => e.check(cW(h3, t))),
          (e.ulid = (t) => e.check(cG(h9, t))),
          (e.base64 = (t) => e.check(c4(pp, t))),
          (e.base64url = (t) => e.check(c2(pg, t))),
          (e.xid = (t) => e.check(cK(pe, t))),
          (e.ksuid = (t) => e.check(cX(pi, t))),
          (e.ipv4 = (t) => e.check(cH(pn, t))),
          (e.ipv6 = (t) => e.check(cY(pu, t))),
          (e.cidrv4 = (t) => e.check(c1(pc, t))),
          (e.cidrv6 = (t) => e.check(c6(pf, t))),
          (e.e164 = (t) => e.check(c5(py, t))),
          (e.datetime = (t) => e.check(hh(t))),
          (e.date = (t) => e.check(hm(t))),
          (e.time = (t) => e.check(hv(t))),
          (e.duration = (t) => e.check(hb(t)));
      });
    function hR(e) {
      return cC(hL, e);
    }
    let hM = aI("ZodStringFormat", (e, t) => {
        uY.init(e, t), hZ.init(e, t);
      }),
      hB = aI("ZodEmail", (e, t) => {
        u6.init(e, t), hM.init(e, t);
      });
    function hF(e) {
      return cZ(hB, e);
    }
    let hq = aI("ZodGUID", (e, t) => {
      u0.init(e, t), hM.init(e, t);
    });
    function hQ(e) {
      return cL(hq, e);
    }
    let hJ = aI("ZodUUID", (e, t) => {
      u1.init(e, t), hM.init(e, t);
    });
    function hV(e) {
      return cR(hJ, e);
    }
    function hW(e) {
      return cM(hJ, e);
    }
    function hG(e) {
      return cB(hJ, e);
    }
    function hK(e) {
      return cF(hJ, e);
    }
    let hX = aI("ZodURL", (e, t) => {
      u4.init(e, t), hM.init(e, t);
    });
    function hH(e) {
      return cq(hX, e);
    }
    function hY(e) {
      return cq(hX, {
        protocol: hc.httpProtocol,
        hostname: hc.domain,
        ...hd.normalizeParams(e),
      });
    }
    let h0 = aI("ZodEmoji", (e, t) => {
      u2.init(e, t), hM.init(e, t);
    });
    function h1(e) {
      return cQ(h0, e);
    }
    let h6 = aI("ZodNanoID", (e, t) => {
      u5.init(e, t), hM.init(e, t);
    });
    function h4(e) {
      return cJ(h6, e);
    }
    let h2 = aI("ZodCUID", (e, t) => {
      u3.init(e, t), hM.init(e, t);
    });
    function h5(e) {
      return cV(h2, e);
    }
    let h3 = aI("ZodCUID2", (e, t) => {
      u8.init(e, t), hM.init(e, t);
    });
    function h8(e) {
      return cW(h3, e);
    }
    let h9 = aI("ZodULID", (e, t) => {
      u9.init(e, t), hM.init(e, t);
    });
    function h7(e) {
      return cG(h9, e);
    }
    let pe = aI("ZodXID", (e, t) => {
      u7.init(e, t), hM.init(e, t);
    });
    function pt(e) {
      return cK(pe, e);
    }
    let pi = aI("ZodKSUID", (e, t) => {
      le.init(e, t), hM.init(e, t);
    });
    function pr(e) {
      return cX(pi, e);
    }
    let pn = aI("ZodIPv4", (e, t) => {
      ls.init(e, t), hM.init(e, t);
    });
    function ps(e) {
      return cH(pn, e);
    }
    let pa = aI("ZodMAC", (e, t) => {
      lo.init(e, t), hM.init(e, t);
    });
    function po(e) {
      return c0(pa, e);
    }
    let pu = aI("ZodIPv6", (e, t) => {
      la.init(e, t), hM.init(e, t);
    });
    function pl(e) {
      return cY(pu, e);
    }
    let pc = aI("ZodCIDRv4", (e, t) => {
      lu.init(e, t), hM.init(e, t);
    });
    function pd(e) {
      return c1(pc, e);
    }
    let pf = aI("ZodCIDRv6", (e, t) => {
      ll.init(e, t), hM.init(e, t);
    });
    function ph(e) {
      return c6(pf, e);
    }
    let pp = aI("ZodBase64", (e, t) => {
      ld.init(e, t), hM.init(e, t);
    });
    function pm(e) {
      return c4(pp, e);
    }
    let pg = aI("ZodBase64URL", (e, t) => {
      lh.init(e, t), hM.init(e, t);
    });
    function pv(e) {
      return c2(pg, e);
    }
    let py = aI("ZodE164", (e, t) => {
      lp.init(e, t), hM.init(e, t);
    });
    function pb(e) {
      return c5(py, e);
    }
    let p_ = aI("ZodJWT", (e, t) => {
      lg.init(e, t), hM.init(e, t);
    });
    function p$(e) {
      return c3(p_, e);
    }
    let px = aI("ZodCustomStringFormat", (e, t) => {
      lv.init(e, t), hM.init(e, t);
    });
    function pw(e, t, i = {}) {
      return fw(px, e, t, i);
    }
    function pS(e) {
      return fw(px, "hostname", hc.hostname, e);
    }
    function pk(e) {
      return fw(px, "hex", hc.hex, e);
    }
    function pI(e, t) {
      let i = t?.enc ?? "hex",
        r = `${e}_${i}`,
        n = hc[r];
      if (!n) throw Error(`Unrecognized hash format: ${r}`);
      return fw(px, r, n, t);
    }
    let pE = aI("ZodNumber", (e, t) => {
      ly.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fz(e, t, i, r)),
        hC(e, "ZodNumber", {
          gt(e, t) {
            return this.check(dP(e, t));
          },
          gte(e, t) {
            return this.check(dN(e, t));
          },
          min(e, t) {
            return this.check(dN(e, t));
          },
          lt(e, t) {
            return this.check(dI(e, t));
          },
          lte(e, t) {
            return this.check(dE(e, t));
          },
          max(e, t) {
            return this.check(dE(e, t));
          },
          int(e) {
            return this.check(pT(e));
          },
          safe(e) {
            return this.check(pT(e));
          },
          positive(e) {
            return this.check(dP(0, e));
          },
          nonnegative(e) {
            return this.check(dN(0, e));
          },
          negative(e) {
            return this.check(dI(0, e));
          },
          nonpositive(e) {
            return this.check(dE(0, e));
          },
          multipleOf(e, t) {
            return this.check(dU(e, t));
          },
          step(e, t) {
            return this.check(dU(e, t));
          },
          finite() {
            return this;
          },
        });
      let i = e._zod.bag;
      (e.minValue =
        Math.max(i.minimum ?? -1 / 0, i.exclusiveMinimum ?? -1 / 0) ?? null),
        (e.maxValue =
          Math.min(i.maximum ?? 1 / 0, i.exclusiveMaximum ?? 1 / 0) ?? null),
        (e.isInt =
          (i.format ?? "").includes("int") ||
          Number.isSafeInteger(i.multipleOf ?? 0.5)),
        (e.isFinite = !0),
        (e.format = i.format ?? null);
    });
    function pP(e) {
      return di(pE, e);
    }
    let pN = aI("ZodNumberFormat", (e, t) => {
      lb.init(e, t), pE.init(e, t);
    });
    function pT(e) {
      return dn(pN, e);
    }
    function pO(e) {
      return ds(pN, e);
    }
    function pz(e) {
      return da(pN, e);
    }
    function pA(e) {
      return du(pN, e);
    }
    function pU(e) {
      return dl(pN, e);
    }
    let pD = aI("ZodBoolean", (e, t) => {
      l_.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fA(e, t, i, r));
    });
    function pC(e) {
      return dc(pD, e);
    }
    let pj = aI("ZodBigInt", (e, t) => {
      l$.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fU(e, t, i, r)),
        (e.gte = (t, i) => e.check(dN(t, i))),
        (e.min = (t, i) => e.check(dN(t, i))),
        (e.gt = (t, i) => e.check(dP(t, i))),
        (e.gte = (t, i) => e.check(dN(t, i))),
        (e.min = (t, i) => e.check(dN(t, i))),
        (e.lt = (t, i) => e.check(dI(t, i))),
        (e.lte = (t, i) => e.check(dE(t, i))),
        (e.max = (t, i) => e.check(dE(t, i))),
        (e.positive = (t) => e.check(dP(BigInt(0), t))),
        (e.negative = (t) => e.check(dI(BigInt(0), t))),
        (e.nonpositive = (t) => e.check(dE(BigInt(0), t))),
        (e.nonnegative = (t) => e.check(dN(BigInt(0), t))),
        (e.multipleOf = (t, i) => e.check(dU(t, i)));
      let i = e._zod.bag;
      (e.minValue = i.minimum ?? null),
        (e.maxValue = i.maximum ?? null),
        (e.format = i.format ?? null);
    });
    function pZ(e) {
      return df(pj, e);
    }
    let pL = aI("ZodBigIntFormat", (e, t) => {
      lx.init(e, t), pj.init(e, t);
    });
    function pR(e) {
      return dp(pL, e);
    }
    function pM(e) {
      return dm(pL, e);
    }
    let pB = aI("ZodSymbol", (e, t) => {
      lw.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fD(e, t, i, r));
    });
    function pF(e) {
      return dg(pB, e);
    }
    let pq = aI("ZodUndefined", (e, t) => {
      lS.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fj(e, t, i, r));
    });
    function pQ(e) {
      return dv(pq, e);
    }
    let pJ = aI("ZodNull", (e, t) => {
      lk.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fC(e, t, i, r));
    });
    function pV(e) {
      return dy(pJ, e);
    }
    let pW = aI("ZodAny", (e, t) => {
      lI.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fR(e, t, i, r));
    });
    function pG() {
      return db(pW);
    }
    let pK = aI("ZodUnknown", (e, t) => {
      lE.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fM(e, t, i, r));
    });
    function pX() {
      return d_(pK);
    }
    let pH = aI("ZodNever", (e, t) => {
      lP.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fL(e, t, i, r));
    });
    function pY(e) {
      return d$(pH, e);
    }
    let p0 = aI("ZodVoid", (e, t) => {
      lN.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fZ(e, t, i, r));
    });
    function p1(e) {
      return dx(p0, e);
    }
    let p6 = aI("ZodDate", (e, t) => {
      lT.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fB(e, t, i, r)),
        (e.min = (t, i) => e.check(dN(t, i))),
        (e.max = (t, i) => e.check(dE(t, i)));
      let i = e._zod.bag;
      (e.minDate = i.minimum ? new Date(i.minimum) : null),
        (e.maxDate = i.maximum ? new Date(i.maximum) : null);
    });
    function p4(e) {
      return dw(p6, e);
    }
    let p2 = aI("ZodArray", (e, t) => {
      lz.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f0(e, t, i, r)),
        (e.element = t.element),
        hC(e, "ZodArray", {
          min(e, t) {
            return this.check(dL(e, t));
          },
          nonempty(e) {
            return this.check(dL(1, e));
          },
          max(e, t) {
            return this.check(dZ(e, t));
          },
          length(e, t) {
            return this.check(dR(e, t));
          },
          unwrap() {
            return this.element;
          },
        });
    });
    function p5(e, t) {
      return d1(p2, e, t);
    }
    function p3(e) {
      return m_(Object.keys(e._zod.def.shape));
    }
    let p8 = aI("ZodObject", (e, t) => {
      lj.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f1(e, t, i, r)),
        hd.defineLazy(e, "shape", () => t.shape),
        hC(e, "ZodObject", {
          keyof() {
            return m_(Object.keys(this._zod.def.shape));
          },
          catchall(e) {
            return this.clone({ ...this._zod.def, catchall: e });
          },
          passthrough() {
            return this.clone({ ...this._zod.def, catchall: pX() });
          },
          loose() {
            return this.clone({ ...this._zod.def, catchall: pX() });
          },
          strict() {
            return this.clone({ ...this._zod.def, catchall: pY() });
          },
          strip() {
            return this.clone({ ...this._zod.def, catchall: void 0 });
          },
          extend(e) {
            return hd.extend(this, e);
          },
          safeExtend(e) {
            return hd.safeExtend(this, e);
          },
          merge(e) {
            return hd.merge(this, e);
          },
          pick(e) {
            return hd.pick(this, e);
          },
          omit(e) {
            return hd.omit(this, e);
          },
          partial(...e) {
            return hd.partial(mP, this, e[0]);
          },
          required(...e) {
            return hd.required(mL, this, e[0]);
          },
        });
    });
    function p9(e, t) {
      return new p8({
        type: "object",
        shape: e ?? {},
        ...hd.normalizeParams(t),
      });
    }
    function p7(e, t) {
      return new p8({
        type: "object",
        shape: e,
        catchall: pY(),
        ...hd.normalizeParams(t),
      });
    }
    function me(e, t) {
      return new p8({
        type: "object",
        shape: e,
        catchall: pX(),
        ...hd.normalizeParams(t),
      });
    }
    let mt = aI("ZodUnion", (e, t) => {
      lL.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f6(e, t, i, r)),
        (e.options = t.options);
    });
    function mi(e, t) {
      return new mt({ type: "union", options: e, ...hd.normalizeParams(t) });
    }
    let mr = aI("ZodXor", (e, t) => {
      mt.init(e, t),
        lM.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f6(e, t, i, r)),
        (e.options = t.options);
    });
    function mn(e, t) {
      return new mr({
        type: "union",
        options: e,
        inclusive: !1,
        ...hd.normalizeParams(t),
      });
    }
    let ms = aI("ZodDiscriminatedUnion", (e, t) => {
      mt.init(e, t), lB.init(e, t);
    });
    function ma(e, t, i) {
      return new ms({
        type: "union",
        options: t,
        discriminator: e,
        ...hd.normalizeParams(i),
      });
    }
    let mo = aI("ZodIntersection", (e, t) => {
      lF.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f4(e, t, i, r));
    });
    function mu(e, t) {
      return new mo({ type: "intersection", left: e, right: t });
    }
    let ml = aI("ZodTuple", (e, t) => {
      lQ.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f2(e, t, i, r)),
        (e.rest = (t) => e.clone({ ...e._zod.def, rest: t }));
    });
    function mc(e, t, i) {
      let r = t instanceof uX,
        n = r ? i : t;
      return new ml({
        type: "tuple",
        items: e,
        rest: r ? t : null,
        ...hd.normalizeParams(n),
      });
    }
    let md = aI("ZodRecord", (e, t) => {
      lG.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f5(e, t, i, r)),
        (e.keyType = t.keyType),
        (e.valueType = t.valueType);
    });
    function mf(e, t, i) {
      return new md(
        t && t._zod
          ? {
              type: "record",
              keyType: e,
              valueType: t,
              ...hd.normalizeParams(i),
            }
          : {
              type: "record",
              keyType: hR(),
              valueType: e,
              ...hd.normalizeParams(t),
            },
      );
    }
    function mh(e, t, i) {
      let r = aY(e);
      return (
        (r._zod.values = void 0),
        new md({
          type: "record",
          keyType: r,
          valueType: t,
          ...hd.normalizeParams(i),
        })
      );
    }
    function mp(e, t, i) {
      return new md({
        type: "record",
        keyType: e,
        valueType: t,
        mode: "loose",
        ...hd.normalizeParams(i),
      });
    }
    let mm = aI("ZodMap", (e, t) => {
      lK.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fH(e, t, i, r)),
        (e.keyType = t.keyType),
        (e.valueType = t.valueType),
        (e.min = (...t) => e.check(dC(...t))),
        (e.nonempty = (t) => e.check(dC(1, t))),
        (e.max = (...t) => e.check(dD(...t))),
        (e.size = (...t) => e.check(dj(...t)));
    });
    function mg(e, t, i) {
      return new mm({
        type: "map",
        keyType: e,
        valueType: t,
        ...hd.normalizeParams(i),
      });
    }
    let mv = aI("ZodSet", (e, t) => {
      lH.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fY(e, t, i, r)),
        (e.min = (...t) => e.check(dC(...t))),
        (e.nonempty = (t) => e.check(dC(1, t))),
        (e.max = (...t) => e.check(dD(...t))),
        (e.size = (...t) => e.check(dj(...t)));
    });
    function my(e, t) {
      return new mv({ type: "set", valueType: e, ...hd.normalizeParams(t) });
    }
    let mb = aI("ZodEnum", (e, t) => {
      l0.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fF(e, t, i, r)),
        (e.enum = t.entries),
        (e.options = Object.values(t.entries));
      let i = new Set(Object.keys(t.entries));
      (e.extract = (e, r) => {
        let n = {};
        for (let r of e)
          if (i.has(r)) n[r] = t.entries[r];
          else throw Error(`Key ${r} not found in enum`);
        return new mb({
          ...t,
          checks: [],
          ...hd.normalizeParams(r),
          entries: n,
        });
      }),
        (e.exclude = (e, r) => {
          let n = { ...t.entries };
          for (let t of e)
            if (i.has(t)) delete n[t];
            else throw Error(`Key ${t} not found in enum`);
          return new mb({
            ...t,
            checks: [],
            ...hd.normalizeParams(r),
            entries: n,
          });
        });
    });
    function m_(e, t) {
      return new mb({
        type: "enum",
        entries: Array.isArray(e)
          ? Object.fromEntries(e.map((e) => [e, e]))
          : e,
        ...hd.normalizeParams(t),
      });
    }
    function m$(e, t) {
      return new mb({ type: "enum", entries: e, ...hd.normalizeParams(t) });
    }
    let mx = aI("ZodLiteral", (e, t) => {
      l1.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fq(e, t, i, r)),
        (e.values = new Set(t.values)),
        Object.defineProperty(e, "value", {
          get() {
            if (t.values.length > 1)
              throw Error(
                "This schema contains multiple valid literal values. Use `.values` instead.",
              );
            return t.values[0];
          },
        });
    });
    function mw(e, t) {
      return new mx({
        type: "literal",
        values: Array.isArray(e) ? e : [e],
        ...hd.normalizeParams(t),
      });
    }
    let mS = aI("ZodFile", (e, t) => {
      l6.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fV(e, t, i, r)),
        (e.min = (t, i) => e.check(dC(t, i))),
        (e.max = (t, i) => e.check(dD(t, i))),
        (e.mime = (t, i) => e.check(dW(Array.isArray(t) ? t : [t], i)));
    });
    function mk(e) {
      return fr(mS, e);
    }
    let mI = aI("ZodTransform", (e, t) => {
      l4.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fX(e, t, i, r)),
        (e._zod.parse = (i, r) => {
          if ("backward" === r.direction) throw new aN(e.constructor.name);
          i.addIssue = (r) => {
            "string" == typeof r
              ? i.issues.push(hd.issue(r, i.value, t))
              : (r.fatal && (r.continue = !1),
                r.code ?? (r.code = "custom"),
                r.input ?? (r.input = i.value),
                r.inst ?? (r.inst = e),
                i.issues.push(hd.issue(r)));
          };
          let n = t.transform(i.value, i);
          return n instanceof Promise
            ? n.then((e) => ((i.value = e), (i.fallback = !0), i))
            : ((i.value = n), (i.fallback = !0), i);
        });
    });
    function mE(e) {
      return new mI({ type: "transform", transform: e });
    }
    let mP = aI("ZodOptional", (e, t) => {
      l5.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => hn(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mN(e) {
      return new mP({ type: "optional", innerType: e });
    }
    let mT = aI("ZodExactOptional", (e, t) => {
      l3.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => hn(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mO(e) {
      return new mT({ type: "optional", innerType: e });
    }
    let mz = aI("ZodNullable", (e, t) => {
      l8.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f3(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mA(e) {
      return new mz({ type: "nullable", innerType: e });
    }
    function mU(e) {
      return mN(mA(e));
    }
    let mD = aI("ZodDefault", (e, t) => {
      l9.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f9(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType),
        (e.removeDefault = e.unwrap);
    });
    function mC(e, t) {
      return new mD({
        type: "default",
        innerType: e,
        get defaultValue() {
          return "function" == typeof t ? t() : hd.shallowClone(t);
        },
      });
    }
    let mj = aI("ZodPrefault", (e, t) => {
      ce.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f7(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mZ(e, t) {
      return new mj({
        type: "prefault",
        innerType: e,
        get defaultValue() {
          return "function" == typeof t ? t() : hd.shallowClone(t);
        },
      });
    }
    let mL = aI("ZodNonOptional", (e, t) => {
      ct.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => f8(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mR(e, t) {
      return new mL({
        type: "nonoptional",
        innerType: e,
        ...hd.normalizeParams(t),
      });
    }
    let mM = aI("ZodSuccess", (e, t) => {
      cr.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fW(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function mB(e) {
      return new mM({ type: "success", innerType: e });
    }
    let mF = aI("ZodCatch", (e, t) => {
      cn.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => he(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType),
        (e.removeCatch = e.unwrap);
    });
    function mq(e, t) {
      return new mF({
        type: "catch",
        innerType: e,
        catchValue: "function" == typeof t ? t : () => t,
      });
    }
    let mQ = aI("ZodNaN", (e, t) => {
      cs.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fQ(e, t, i, r));
    });
    function mJ(e) {
      return dk(mQ, e);
    }
    let mV = aI("ZodPipe", (e, t) => {
      ca.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => ht(e, t, i, r)),
        (e.in = t.in),
        (e.out = t.out);
    });
    function mW(e, t) {
      return new mV({ type: "pipe", in: e, out: t });
    }
    let mG = aI("ZodCodec", (e, t) => {
      mV.init(e, t), cu.init(e, t);
    });
    function mK(e, t, i) {
      return new mG({
        type: "pipe",
        in: e,
        out: t,
        transform: i.decode,
        reverseTransform: i.encode,
      });
    }
    function mX(e) {
      let t = e._zod.def;
      return new mG({
        type: "pipe",
        in: t.out,
        out: t.in,
        transform: t.reverseTransform,
        reverseTransform: t.transform,
      });
    }
    let mH = aI("ZodPreprocess", (e, t) => {
        mV.init(e, t), cd.init(e, t);
      }),
      mY = aI("ZodReadonly", (e, t) => {
        cf.init(e, t),
          hj.init(e, t),
          (e._zod.processJSONSchema = (t, i, r) => hi(e, t, i, r)),
          (e.unwrap = () => e._zod.def.innerType);
      });
    function m0(e) {
      return new mY({ type: "readonly", innerType: e });
    }
    let m1 = aI("ZodTemplateLiteral", (e, t) => {
      cp.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fJ(e, t, i, r));
    });
    function m6(e, t) {
      return new m1({
        type: "template_literal",
        parts: e,
        ...hd.normalizeParams(t),
      });
    }
    let m4 = aI("ZodLazy", (e, t) => {
      cv.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => hs(e, t, i, r)),
        (e.unwrap = () => e._zod.def.getter());
    });
    function m2(e) {
      return new m4({ type: "lazy", getter: e });
    }
    let m5 = aI("ZodPromise", (e, t) => {
      cg.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => hr(e, t, i, r)),
        (e.unwrap = () => e._zod.def.innerType);
    });
    function m3(e) {
      return new m5({ type: "promise", innerType: e });
    }
    let m8 = aI("ZodFunction", (e, t) => {
      cm.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fK(e, t, i, r));
    });
    function m9(e) {
      return new m8({
        type: "function",
        input: Array.isArray(e?.input) ? mc(e?.input) : (e?.input ?? p5(pX())),
        output: e?.output ?? pX(),
      });
    }
    let m7 = aI("ZodCustom", (e, t) => {
      cy.init(e, t),
        hj.init(e, t),
        (e._zod.processJSONSchema = (t, i, r) => fG(e, t, i, r));
    });
    function ge(e) {
      let t = new uk({ check: "custom" });
      return (t._zod.check = e), t;
    }
    function gt(e, t) {
      return fg(m7, e ?? (() => !0), t);
    }
    function gi(e, t = {}) {
      return fv(m7, e, t);
    }
    function gr(e, t) {
      return fy(e, t);
    }
    let gn = f_,
      gs = f$;
    function ga(e, t = {}) {
      let i = new m7({
        type: "custom",
        check: "custom",
        fn: (t) => t instanceof e,
        abort: !0,
        ...hd.normalizeParams(t),
      });
      return (
        (i._zod.bag.Class = e),
        (i._zod.check = (t) => {
          t.value instanceof e ||
            t.issues.push({
              code: "invalid_type",
              expected: e.name,
              input: t.value,
              inst: i,
              path: [...(i._zod.def.path ?? [])],
            });
        }),
        i
      );
    }
    let go = (...e) => fx({ Codec: mG, Boolean: pD, String: hL }, ...e);
    function gu(e) {
      let t = m2(() => mi([hR(e), pP(), pC(), pV(), p5(t), mf(hR(), t)]));
      return t;
    }
    function gl(e, t) {
      return new mH({ type: "pipe", in: mE(e), out: t });
    }
    var gc = e.i(7855);
    e.s([], 64328),
      e.i(64328),
      e.s(
        [
          "endsWith",
          0,
          dJ,
          "gt",
          0,
          dP,
          "gte",
          0,
          dN,
          "includes",
          0,
          dq,
          "length",
          0,
          dR,
          "lowercase",
          0,
          dB,
          "lt",
          0,
          dI,
          "lte",
          0,
          dE,
          "maxLength",
          0,
          dZ,
          "maxSize",
          0,
          dD,
          "mime",
          0,
          dW,
          "minLength",
          0,
          dL,
          "minSize",
          0,
          dC,
          "multipleOf",
          0,
          dU,
          "negative",
          0,
          dO,
          "nonnegative",
          0,
          dA,
          "nonpositive",
          0,
          dz,
          "normalize",
          0,
          dK,
          "overwrite",
          0,
          dG,
          "positive",
          0,
          dT,
          "property",
          0,
          dV,
          "regex",
          0,
          dM,
          "size",
          0,
          dj,
          "slugify",
          0,
          d0,
          "startsWith",
          0,
          dQ,
          "toLowerCase",
          0,
          dH,
          "toUpperCase",
          0,
          dY,
          "trim",
          0,
          dX,
          "uppercase",
          0,
          dF,
        ],
        85648,
      );
    var gd = e.i(85648);
    e.i(15874), e.i(48804);
    let gf = {
      invalid_type: "invalid_type",
      too_big: "too_big",
      too_small: "too_small",
      invalid_format: "invalid_format",
      not_multiple_of: "not_multiple_of",
      unrecognized_keys: "unrecognized_keys",
      invalid_union: "invalid_union",
      invalid_key: "invalid_key",
      invalid_element: "invalid_element",
      invalid_value: "invalid_value",
      custom: "custom",
    };
    function gh(e) {
      aO({ customError: e });
    }
    function gp() {
      return aO().customError;
    }
    h || (h = {}),
      e.s(
        [
          "ZodFirstPartyTypeKind",
          0,
          h,
          "ZodIssueCode",
          0,
          gf,
          "getErrorMap",
          0,
          gp,
          "setErrorMap",
          0,
          gh,
        ],
        33137,
      ),
      e.i(33137),
      e.s(
        [
          "$brand",
          0,
          aE,
          "ZodFirstPartyTypeKind",
          0,
          h,
          "ZodIssueCode",
          0,
          gf,
          "config",
          0,
          aO,
          "getErrorMap",
          0,
          gp,
          "setErrorMap",
          0,
          gh,
        ],
        63203,
      ),
      e.i(63203);
    var hc = c$,
      hd = c_,
      gm = e.i(51047);
    let gg = { ...gc, ...gd, iso: gm },
      gv = new Set([
        "$schema",
        "$ref",
        "$defs",
        "definitions",
        "$id",
        "id",
        "$comment",
        "$anchor",
        "$vocabulary",
        "$dynamicRef",
        "$dynamicAnchor",
        "type",
        "enum",
        "const",
        "anyOf",
        "oneOf",
        "allOf",
        "not",
        "properties",
        "required",
        "additionalProperties",
        "patternProperties",
        "propertyNames",
        "minProperties",
        "maxProperties",
        "items",
        "prefixItems",
        "additionalItems",
        "minItems",
        "maxItems",
        "uniqueItems",
        "contains",
        "minContains",
        "maxContains",
        "minLength",
        "maxLength",
        "pattern",
        "format",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
        "description",
        "default",
        "contentEncoding",
        "contentMediaType",
        "contentSchema",
        "unevaluatedItems",
        "unevaluatedProperties",
        "if",
        "then",
        "else",
        "dependentSchemas",
        "dependentRequired",
        "nullable",
        "readOnly",
      ]);
    e.s(
      [
        "bigint",
        0,
        function (e) {
          return dh(pj, e);
        },
        "boolean",
        0,
        function (e) {
          return dd(pD, e);
        },
        "date",
        0,
        function (e) {
          return dS(p6, e);
        },
        "number",
        0,
        function (e) {
          return dr(pE, e);
        },
        "string",
        0,
        function (e) {
          return cj(hL, e);
        },
      ],
      34512,
    );
    var gy = e.i(34512);
    e.s(
      [
        "$brand",
        0,
        aE,
        "$input",
        0,
        cz,
        "$output",
        0,
        cO,
        "NEVER",
        0,
        ak,
        "TimePrecision",
        0,
        c8,
        "ZodAny",
        0,
        pW,
        "ZodArray",
        0,
        p2,
        "ZodBase64",
        0,
        pp,
        "ZodBase64URL",
        0,
        pg,
        "ZodBigInt",
        0,
        pj,
        "ZodBigIntFormat",
        0,
        pL,
        "ZodBoolean",
        0,
        pD,
        "ZodCIDRv4",
        0,
        pc,
        "ZodCIDRv6",
        0,
        pf,
        "ZodCUID",
        0,
        h2,
        "ZodCUID2",
        0,
        h3,
        "ZodCatch",
        0,
        mF,
        "ZodCodec",
        0,
        mG,
        "ZodCustom",
        0,
        m7,
        "ZodCustomStringFormat",
        0,
        px,
        "ZodDate",
        0,
        p6,
        "ZodDefault",
        0,
        mD,
        "ZodDiscriminatedUnion",
        0,
        ms,
        "ZodE164",
        0,
        py,
        "ZodEmail",
        0,
        hB,
        "ZodEmoji",
        0,
        h0,
        "ZodEnum",
        0,
        mb,
        "ZodError",
        0,
        h$,
        "ZodExactOptional",
        0,
        mT,
        "ZodFile",
        0,
        mS,
        "ZodFirstPartyTypeKind",
        0,
        h,
        "ZodFunction",
        0,
        m8,
        "ZodGUID",
        0,
        hq,
        "ZodIPv4",
        0,
        pn,
        "ZodIPv6",
        0,
        pu,
        "ZodISODate",
        0,
        hp,
        "ZodISODateTime",
        0,
        hf,
        "ZodISODuration",
        0,
        hy,
        "ZodISOTime",
        0,
        hg,
        "ZodIntersection",
        0,
        mo,
        "ZodIssueCode",
        0,
        gf,
        "ZodJWT",
        0,
        p_,
        "ZodKSUID",
        0,
        pi,
        "ZodLazy",
        0,
        m4,
        "ZodLiteral",
        0,
        mx,
        "ZodMAC",
        0,
        pa,
        "ZodMap",
        0,
        mm,
        "ZodNaN",
        0,
        mQ,
        "ZodNanoID",
        0,
        h6,
        "ZodNever",
        0,
        pH,
        "ZodNonOptional",
        0,
        mL,
        "ZodNull",
        0,
        pJ,
        "ZodNullable",
        0,
        mz,
        "ZodNumber",
        0,
        pE,
        "ZodNumberFormat",
        0,
        pN,
        "ZodObject",
        0,
        p8,
        "ZodOptional",
        0,
        mP,
        "ZodPipe",
        0,
        mV,
        "ZodPrefault",
        0,
        mj,
        "ZodPreprocess",
        0,
        mH,
        "ZodPromise",
        0,
        m5,
        "ZodReadonly",
        0,
        mY,
        "ZodRealError",
        0,
        hx,
        "ZodRecord",
        0,
        md,
        "ZodSet",
        0,
        mv,
        "ZodString",
        0,
        hL,
        "ZodStringFormat",
        0,
        hM,
        "ZodSuccess",
        0,
        mM,
        "ZodSymbol",
        0,
        pB,
        "ZodTemplateLiteral",
        0,
        m1,
        "ZodTransform",
        0,
        mI,
        "ZodTuple",
        0,
        ml,
        "ZodType",
        0,
        hj,
        "ZodULID",
        0,
        h9,
        "ZodURL",
        0,
        hX,
        "ZodUUID",
        0,
        hJ,
        "ZodUndefined",
        0,
        pq,
        "ZodUnion",
        0,
        mt,
        "ZodUnknown",
        0,
        pK,
        "ZodVoid",
        0,
        p0,
        "ZodXID",
        0,
        pe,
        "ZodXor",
        0,
        mr,
        "_ZodString",
        0,
        hZ,
        "_default",
        0,
        mC,
        "_function",
        0,
        m9,
        "any",
        0,
        pG,
        "array",
        0,
        p5,
        "base64",
        0,
        pm,
        "base64url",
        0,
        pv,
        "bigint",
        0,
        pZ,
        "boolean",
        0,
        pC,
        "catch",
        0,
        mq,
        "check",
        0,
        ge,
        "cidrv4",
        0,
        pd,
        "cidrv6",
        0,
        ph,
        "clone",
        0,
        aY,
        "codec",
        0,
        mK,
        "coerce",
        0,
        gy,
        "config",
        0,
        aO,
        "core",
        0,
        hl,
        "cuid",
        0,
        h5,
        "cuid2",
        0,
        h8,
        "custom",
        0,
        gt,
        "date",
        0,
        p4,
        "decode",
        0,
        hP,
        "decodeAsync",
        0,
        hT,
        "describe",
        0,
        gn,
        "discriminatedUnion",
        0,
        ma,
        "e164",
        0,
        pb,
        "email",
        0,
        hF,
        "emoji",
        0,
        h1,
        "encode",
        0,
        hE,
        "encodeAsync",
        0,
        hN,
        "endsWith",
        0,
        dJ,
        "enum",
        0,
        m_,
        "exactOptional",
        0,
        mO,
        "file",
        0,
        mk,
        "flattenError",
        0,
        oc,
        "float32",
        0,
        pO,
        "float64",
        0,
        pz,
        "formatError",
        0,
        od,
        "fromJSONSchema",
        0,
        function (e, t) {
          var i, r;
          let n, s;
          if ("boolean" == typeof e) return e ? gg.any() : gg.never();
          try {
            n = JSON.parse(JSON.stringify(e));
          } catch {
            throw Error(
              "fromJSONSchema input is not valid JSON (possibly cyclic); use $defs/$ref for recursive schemas",
            );
          }
          let a = {
            version:
              ((i = n),
              (r = t?.defaultTarget),
              "https://json-schema.org/draft/2020-12/schema" === (s = i.$schema)
                ? "draft-2020-12"
                : "http://json-schema.org/draft-07/schema#" === s
                  ? "draft-7"
                  : "http://json-schema.org/draft-04/schema#" === s
                    ? "draft-4"
                    : (r ?? "draft-2020-12")),
            defs: n.$defs || n.definitions || {},
            refs: new Map(),
            processing: new Set(),
            rootSchema: n,
            registry: t?.registry ?? cD,
          };
          return (function e(t, i) {
            if ("boolean" == typeof t) return t ? gg.any() : gg.never();
            let r = (function t(i, r) {
                let n;
                if (void 0 !== i.not) {
                  if (
                    "object" == typeof i.not &&
                    0 === Object.keys(i.not).length
                  )
                    return gg.never();
                  throw Error(
                    "not is not supported in Zod (except { not: {} } for never)",
                  );
                }
                if (void 0 !== i.unevaluatedItems)
                  throw Error("unevaluatedItems is not supported");
                if (void 0 !== i.unevaluatedProperties)
                  throw Error("unevaluatedProperties is not supported");
                if (void 0 !== i.if || void 0 !== i.then || void 0 !== i.else)
                  throw Error(
                    "Conditional schemas (if/then/else) are not supported",
                  );
                if (
                  void 0 !== i.dependentSchemas ||
                  void 0 !== i.dependentRequired
                )
                  throw Error(
                    "dependentSchemas and dependentRequired are not supported",
                  );
                if (i.$ref) {
                  let t = i.$ref;
                  if (r.refs.has(t)) return r.refs.get(t);
                  if (r.processing.has(t))
                    return gg.lazy(() => {
                      if (!r.refs.has(t))
                        throw Error(`Circular reference not resolved: ${t}`);
                      return r.refs.get(t);
                    });
                  r.processing.add(t);
                  let n = e(
                    (function (e, t) {
                      if (!e.startsWith("#"))
                        throw Error(
                          "External $ref is not supported, only local refs (#/...) are allowed",
                        );
                      let i = e.slice(1).split("/").filter(Boolean);
                      if (0 === i.length) return t.rootSchema;
                      let r =
                        "draft-2020-12" === t.version ? "$defs" : "definitions";
                      if (i[0] === r) {
                        let r = i[1];
                        if (!r || !t.defs[r])
                          throw Error(`Reference not found: ${e}`);
                        return t.defs[r];
                      }
                      throw Error(`Reference not found: ${e}`);
                    })(t, r),
                    r,
                  );
                  return r.refs.set(t, n), r.processing.delete(t), n;
                }
                if (void 0 !== i.enum) {
                  let e = i.enum;
                  if (
                    "openapi-3.0" === r.version &&
                    !0 === i.nullable &&
                    1 === e.length &&
                    null === e[0]
                  )
                    return gg.null();
                  if (0 === e.length) return gg.never();
                  if (1 === e.length) return gg.literal(e[0]);
                  if (e.every((e) => "string" == typeof e)) return gg.enum(e);
                  let t = e.map((e) => gg.literal(e));
                  return t.length < 2
                    ? t[0]
                    : gg.union([t[0], t[1], ...t.slice(2)]);
                }
                if (void 0 !== i.const) return gg.literal(i.const);
                let s = i.type;
                if (Array.isArray(s)) {
                  let e = s.map((e) => t({ ...i, type: e }, r));
                  return 0 === e.length
                    ? gg.never()
                    : 1 === e.length
                      ? e[0]
                      : gg.union(e);
                }
                if (!s) return gg.any();
                switch (s) {
                  case "string": {
                    let e = gg.string();
                    if (i.format) {
                      let t = i.format;
                      "email" === t
                        ? (e = e.check(gg.email()))
                        : "uri" === t || "uri-reference" === t
                          ? (e = e.check(gg.url()))
                          : "uuid" === t || "guid" === t
                            ? (e = e.check(gg.uuid()))
                            : "date-time" === t
                              ? (e = e.check(gg.iso.datetime()))
                              : "date" === t
                                ? (e = e.check(gg.iso.date()))
                                : "time" === t
                                  ? (e = e.check(gg.iso.time()))
                                  : "duration" === t
                                    ? (e = e.check(gg.iso.duration()))
                                    : "ipv4" === t
                                      ? (e = e.check(gg.ipv4()))
                                      : "ipv6" === t
                                        ? (e = e.check(gg.ipv6()))
                                        : "mac" === t
                                          ? (e = e.check(gg.mac()))
                                          : "cidr" === t
                                            ? (e = e.check(gg.cidrv4()))
                                            : "cidr-v6" === t
                                              ? (e = e.check(gg.cidrv6()))
                                              : "base64" === t
                                                ? (e = e.check(gg.base64()))
                                                : "base64url" === t
                                                  ? (e = e.check(
                                                      gg.base64url(),
                                                    ))
                                                  : "e164" === t
                                                    ? (e = e.check(gg.e164()))
                                                    : "jwt" === t
                                                      ? (e = e.check(gg.jwt()))
                                                      : "emoji" === t
                                                        ? (e = e.check(
                                                            gg.emoji(),
                                                          ))
                                                        : "nanoid" === t
                                                          ? (e = e.check(
                                                              gg.nanoid(),
                                                            ))
                                                          : "cuid" === t
                                                            ? (e = e.check(
                                                                gg.cuid(),
                                                              ))
                                                            : "cuid2" === t
                                                              ? (e = e.check(
                                                                  gg.cuid2(),
                                                                ))
                                                              : "ulid" === t
                                                                ? (e = e.check(
                                                                    gg.ulid(),
                                                                  ))
                                                                : "xid" === t
                                                                  ? (e =
                                                                      e.check(
                                                                        gg.xid(),
                                                                      ))
                                                                  : "ksuid" ===
                                                                      t &&
                                                                    (e =
                                                                      e.check(
                                                                        gg.ksuid(),
                                                                      ));
                    }
                    "number" == typeof i.minLength && (e = e.min(i.minLength)),
                      "number" == typeof i.maxLength &&
                        (e = e.max(i.maxLength)),
                      i.pattern && (e = e.regex(new RegExp(i.pattern))),
                      (n = e);
                    break;
                  }
                  case "number":
                  case "integer": {
                    let e = "integer" === s ? gg.number().int() : gg.number();
                    "number" == typeof i.minimum && (e = e.min(i.minimum)),
                      "number" == typeof i.maximum && (e = e.max(i.maximum)),
                      "number" == typeof i.exclusiveMinimum
                        ? (e = e.gt(i.exclusiveMinimum))
                        : !0 === i.exclusiveMinimum &&
                          "number" == typeof i.minimum &&
                          (e = e.gt(i.minimum)),
                      "number" == typeof i.exclusiveMaximum
                        ? (e = e.lt(i.exclusiveMaximum))
                        : !0 === i.exclusiveMaximum &&
                          "number" == typeof i.maximum &&
                          (e = e.lt(i.maximum)),
                      "number" == typeof i.multipleOf &&
                        (e = e.multipleOf(i.multipleOf)),
                      (n = e);
                    break;
                  }
                  case "boolean":
                    n = gg.boolean();
                    break;
                  case "null":
                    n = gg.null();
                    break;
                  case "object": {
                    let t = {},
                      s = i.properties || {},
                      a = new Set(i.required || []);
                    for (let [i, n] of Object.entries(s)) {
                      let s = e(n, r);
                      t[i] = a.has(i) ? s : s.optional();
                    }
                    if (i.propertyNames) {
                      let s = e(i.propertyNames, r),
                        a =
                          i.additionalProperties &&
                          "object" == typeof i.additionalProperties
                            ? e(i.additionalProperties, r)
                            : gg.any();
                      if (0 === Object.keys(t).length) {
                        n = gg.record(s, a);
                        break;
                      }
                      let o = gg.object(t).passthrough(),
                        u = gg.looseRecord(s, a);
                      n = gg.intersection(o, u);
                      break;
                    }
                    if (i.patternProperties) {
                      let s = i.patternProperties,
                        a = Object.keys(s),
                        o = [];
                      for (let t of a) {
                        let i = e(s[t], r),
                          n = gg.string().regex(new RegExp(t));
                        o.push(gg.looseRecord(n, i));
                      }
                      let u = [];
                      if (
                        (Object.keys(t).length > 0 &&
                          u.push(gg.object(t).passthrough()),
                        u.push(...o),
                        0 === u.length)
                      )
                        n = gg.object({}).passthrough();
                      else if (1 === u.length) n = u[0];
                      else {
                        let e = gg.intersection(u[0], u[1]);
                        for (let t = 2; t < u.length; t++)
                          e = gg.intersection(e, u[t]);
                        n = e;
                      }
                      break;
                    }
                    let o = gg.object(t);
                    n =
                      !1 === i.additionalProperties
                        ? o.strict()
                        : "object" == typeof i.additionalProperties
                          ? o.catchall(e(i.additionalProperties, r))
                          : o.passthrough();
                    break;
                  }
                  case "array": {
                    let t = i.prefixItems,
                      s = i.items;
                    if (t && Array.isArray(t)) {
                      let a = t.map((t) => e(t, r)),
                        o =
                          s && "object" == typeof s && !Array.isArray(s)
                            ? e(s, r)
                            : void 0;
                      (n = o ? gg.tuple(a).rest(o) : gg.tuple(a)),
                        "number" == typeof i.minItems &&
                          (n = n.check(gg.minLength(i.minItems))),
                        "number" == typeof i.maxItems &&
                          (n = n.check(gg.maxLength(i.maxItems)));
                    } else if (Array.isArray(s)) {
                      let t = s.map((t) => e(t, r)),
                        a =
                          i.additionalItems &&
                          "object" == typeof i.additionalItems
                            ? e(i.additionalItems, r)
                            : void 0;
                      (n = a ? gg.tuple(t).rest(a) : gg.tuple(t)),
                        "number" == typeof i.minItems &&
                          (n = n.check(gg.minLength(i.minItems))),
                        "number" == typeof i.maxItems &&
                          (n = n.check(gg.maxLength(i.maxItems)));
                    } else if (void 0 !== s) {
                      let t = e(s, r),
                        a = gg.array(t);
                      "number" == typeof i.minItems && (a = a.min(i.minItems)),
                        "number" == typeof i.maxItems &&
                          (a = a.max(i.maxItems)),
                        (n = a);
                    } else n = gg.array(gg.any());
                    break;
                  }
                  default:
                    throw Error(`Unsupported type: ${s}`);
                }
                return n;
              })(t, i),
              n = t.type || void 0 !== t.enum || void 0 !== t.const;
            if (t.anyOf && Array.isArray(t.anyOf)) {
              let s = t.anyOf.map((t) => e(t, i)),
                a = gg.union(s);
              r = n ? gg.intersection(r, a) : a;
            }
            if (t.oneOf && Array.isArray(t.oneOf)) {
              let s = t.oneOf.map((t) => e(t, i)),
                a = gg.xor(s);
              r = n ? gg.intersection(r, a) : a;
            }
            if (t.allOf && Array.isArray(t.allOf))
              if (0 === t.allOf.length) r = n ? r : gg.any();
              else {
                let s = n ? r : e(t.allOf[0], i),
                  a = +!n;
                for (let r = a; r < t.allOf.length; r++)
                  s = gg.intersection(s, e(t.allOf[r], i));
                r = s;
              }
            !0 === t.nullable &&
              "openapi-3.0" === i.version &&
              (r = gg.nullable(r)),
              !0 === t.readOnly && (r = gg.readonly(r)),
              void 0 !== t.default && (r = r.default(t.default));
            let s = {};
            for (let e of [
              "$id",
              "id",
              "$comment",
              "$anchor",
              "$vocabulary",
              "$dynamicRef",
              "$dynamicAnchor",
            ])
              e in t && (s[e] = t[e]);
            for (let e of [
              "contentEncoding",
              "contentMediaType",
              "contentSchema",
            ])
              e in t && (s[e] = t[e]);
            for (let e of Object.keys(t)) gv.has(e) || (s[e] = t[e]);
            return (
              Object.keys(s).length > 0 && i.registry.add(r, s),
              t.description && (r = r.describe(t.description)),
              r
            );
          })(n, a);
        },
        "function",
        0,
        m9,
        "getErrorMap",
        0,
        gp,
        "globalRegistry",
        0,
        cD,
        "gt",
        0,
        dP,
        "gte",
        0,
        dN,
        "guid",
        0,
        hQ,
        "hash",
        0,
        pI,
        "hex",
        0,
        pk,
        "hostname",
        0,
        pS,
        "httpUrl",
        0,
        hY,
        "includes",
        0,
        dq,
        "instanceof",
        0,
        ga,
        "int",
        0,
        pT,
        "int32",
        0,
        pA,
        "int64",
        0,
        pR,
        "intersection",
        0,
        mu,
        "invertCodec",
        0,
        mX,
        "ipv4",
        0,
        ps,
        "ipv6",
        0,
        pl,
        "iso",
        0,
        gm,
        "json",
        0,
        gu,
        "jwt",
        0,
        p$,
        "keyof",
        0,
        p3,
        "ksuid",
        0,
        pr,
        "lazy",
        0,
        m2,
        "length",
        0,
        dR,
        "literal",
        0,
        mw,
        "locales",
        0,
        cT,
        "looseObject",
        0,
        me,
        "looseRecord",
        0,
        mp,
        "lowercase",
        0,
        dB,
        "lt",
        0,
        dI,
        "lte",
        0,
        dE,
        "mac",
        0,
        po,
        "map",
        0,
        mg,
        "maxLength",
        0,
        dZ,
        "maxSize",
        0,
        dD,
        "meta",
        0,
        gs,
        "mime",
        0,
        dW,
        "minLength",
        0,
        dL,
        "minSize",
        0,
        dC,
        "multipleOf",
        0,
        dU,
        "nan",
        0,
        mJ,
        "nanoid",
        0,
        h4,
        "nativeEnum",
        0,
        m$,
        "negative",
        0,
        dO,
        "never",
        0,
        pY,
        "nonnegative",
        0,
        dA,
        "nonoptional",
        0,
        mR,
        "nonpositive",
        0,
        dz,
        "normalize",
        0,
        dK,
        "null",
        0,
        pV,
        "nullable",
        0,
        mA,
        "nullish",
        0,
        mU,
        "number",
        0,
        pP,
        "object",
        0,
        p9,
        "optional",
        0,
        mN,
        "overwrite",
        0,
        dG,
        "parse",
        0,
        hw,
        "parseAsync",
        0,
        hS,
        "partialRecord",
        0,
        mh,
        "pipe",
        0,
        mW,
        "positive",
        0,
        dT,
        "prefault",
        0,
        mZ,
        "preprocess",
        0,
        gl,
        "prettifyError",
        0,
        op,
        "promise",
        0,
        m3,
        "property",
        0,
        dV,
        "readonly",
        0,
        m0,
        "record",
        0,
        mf,
        "refine",
        0,
        gi,
        "regex",
        0,
        dM,
        "regexes",
        () => hc,
        "registry",
        0,
        cU,
        "safeDecode",
        0,
        hz,
        "safeDecodeAsync",
        0,
        hU,
        "safeEncode",
        0,
        hO,
        "safeEncodeAsync",
        0,
        hA,
        "safeParse",
        0,
        hk,
        "safeParseAsync",
        0,
        hI,
        "set",
        0,
        my,
        "setErrorMap",
        0,
        gh,
        "size",
        0,
        dj,
        "slugify",
        0,
        d0,
        "startsWith",
        0,
        dQ,
        "strictObject",
        0,
        p7,
        "string",
        0,
        hR,
        "stringFormat",
        0,
        pw,
        "stringbool",
        0,
        go,
        "success",
        0,
        mB,
        "superRefine",
        0,
        gr,
        "symbol",
        0,
        pF,
        "templateLiteral",
        0,
        m6,
        "toJSONSchema",
        0,
        ho,
        "toLowerCase",
        0,
        dH,
        "toUpperCase",
        0,
        dY,
        "transform",
        0,
        mE,
        "treeifyError",
        0,
        of,
        "trim",
        0,
        dX,
        "tuple",
        0,
        mc,
        "uint32",
        0,
        pU,
        "uint64",
        0,
        pM,
        "ulid",
        0,
        h7,
        "undefined",
        0,
        pQ,
        "union",
        0,
        mi,
        "unknown",
        0,
        pX,
        "uppercase",
        0,
        dF,
        "url",
        0,
        hH,
        "util",
        () => hd,
        "uuid",
        0,
        hV,
        "uuidv4",
        0,
        hW,
        "uuidv6",
        0,
        hG,
        "uuidv7",
        0,
        hK,
        "void",
        0,
        p1,
        "xid",
        0,
        pt,
        "xor",
        0,
        mn,
      ],
      62810,
    );
    var gb = e.i(62810),
      gb = gb;
    let g_ = {
      INT8_MIN: -128,
      INT8_MAX: 127,
      INT8_UNSIGNED_MAX: 255,
      INT16_MIN: -32768,
      INT16_MAX: 32767,
      INT16_UNSIGNED_MAX: 65535,
      INT24_MIN: -8388608,
      INT24_MAX: 8388607,
      INT24_UNSIGNED_MAX: 0xffffff,
      INT32_MIN: -0x80000000,
      INT32_MAX: 0x7fffffff,
      INT32_UNSIGNED_MAX: 0xffffffff,
      INT48_MIN: -0x800000000000,
      INT48_MAX: 0x7fffffffffff,
      INT48_UNSIGNED_MAX: 0xffffffffffff,
      INT64_MIN: -0x8000000000000000n,
      INT64_MAX: 0x7fffffffffffffffn,
      INT64_UNSIGNED_MAX: 0xffffffffffffffffn,
    };
    function g$(e, t) {
      return t.includes(e.columnType);
    }
    let gx = gb.union([gb.string(), gb.number(), gb.boolean(), gb.null()]),
      gw = gb.union([gx, gb.record(gb.string(), gb.any()), gb.array(gb.any())]),
      gS = gb.custom((e) => e instanceof Buffer);
    function gk(e) {
      return i_(e) ? iW(e) : e[il].selectedFields;
    }
    let gI = {
        never: (e) =>
          e?.generated?.type === "always" ||
          e?.generatedIdentity?.type === "always",
        optional: (e) => !e.notNull || (e.notNull && e.hasDefault),
        nullable: (e) => !e.notNull,
      },
      gE = (e, t) =>
        (function e(t, i, r, n) {
          let s = {};
          for (let [a, o] of Object.entries(t)) {
            if (
              !tB(o, tV) &&
              !tB(o, ik) &&
              !tB(o, ik.Aliased) &&
              "object" == typeof o
            ) {
              let t =
                i_(o) || ("object" == typeof o && null !== o && iD in o)
                  ? gk(o)
                  : o;
              s[a] = e(t, i[a] ?? {}, r, n);
              continue;
            }
            let t = i[a];
            if (void 0 !== t && "function" != typeof t) {
              s[a] = t;
              continue;
            }
            let u = tB(o, tV) ? o : void 0,
              l = u
                ? (function e(t, i) {
                    let r,
                      n = i?.zodInstance ?? gb,
                      s = i?.coerce ?? {};
                    return (
                      "enumValues" in t &&
                        Array.isArray(t.enumValues) &&
                        t.enumValues.length > 0 &&
                        (r = t.enumValues.length
                          ? n.enum(t.enumValues)
                          : n.string()),
                      r ||
                        (g$(t, ["PgGeometry", "PgPointTuple"])
                          ? (r = n.tuple([n.number(), n.number()]))
                          : g$(t, ["PgGeometryObject", "PgPointObject"])
                            ? (r = n.object({ x: n.number(), y: n.number() }))
                            : g$(t, ["PgHalfVector", "PgVector"])
                              ? ((r = n.array(n.number())),
                                (r = t.dimensions ? r.length(t.dimensions) : r))
                              : g$(t, ["PgLine"])
                                ? (r = n.tuple([
                                    n.number(),
                                    n.number(),
                                    n.number(),
                                  ]))
                                : g$(t, ["PgLineABC"])
                                  ? (r = n.object({
                                      a: n.number(),
                                      b: n.number(),
                                      c: n.number(),
                                    }))
                                  : g$(t, ["PgArray"])
                                    ? ((r = n.array(e(t.baseColumn, i))),
                                      (r = t.size ? r.length(t.size) : r))
                                    : "array" === t.dataType
                                      ? (r = n.array(n.any()))
                                      : "number" === t.dataType
                                        ? (r = (function (e, t, i) {
                                            let r,
                                              n,
                                              s = e
                                                .getSQLType()
                                                .includes("unsigned"),
                                              a = !1;
                                            g$(e, [
                                              "MySqlTinyInt",
                                              "SingleStoreTinyInt",
                                            ])
                                              ? ((r = s ? 0 : g_.INT8_MIN),
                                                (n = s
                                                  ? g_.INT8_UNSIGNED_MAX
                                                  : g_.INT8_MAX),
                                                (a = !0))
                                              : g$(e, [
                                                    "PgSmallInt",
                                                    "PgSmallSerial",
                                                    "MySqlSmallInt",
                                                    "SingleStoreSmallInt",
                                                  ])
                                                ? ((r = s ? 0 : g_.INT16_MIN),
                                                  (n = s
                                                    ? g_.INT16_UNSIGNED_MAX
                                                    : g_.INT16_MAX),
                                                  (a = !0))
                                                : g$(e, [
                                                      "PgReal",
                                                      "MySqlFloat",
                                                      "MySqlMediumInt",
                                                      "SingleStoreMediumInt",
                                                      "SingleStoreFloat",
                                                    ])
                                                  ? ((r = s ? 0 : g_.INT24_MIN),
                                                    (n = s
                                                      ? g_.INT24_UNSIGNED_MAX
                                                      : g_.INT24_MAX),
                                                    (a = g$(e, [
                                                      "MySqlMediumInt",
                                                      "SingleStoreMediumInt",
                                                    ])))
                                                  : g$(e, [
                                                        "PgInteger",
                                                        "PgSerial",
                                                        "MySqlInt",
                                                        "SingleStoreInt",
                                                      ])
                                                    ? ((r = s
                                                        ? 0
                                                        : g_.INT32_MIN),
                                                      (n = s
                                                        ? g_.INT32_UNSIGNED_MAX
                                                        : g_.INT32_MAX),
                                                      (a = !0))
                                                    : g$(e, [
                                                          "PgDoublePrecision",
                                                          "MySqlReal",
                                                          "MySqlDouble",
                                                          "SingleStoreReal",
                                                          "SingleStoreDouble",
                                                          "SQLiteReal",
                                                        ])
                                                      ? ((r = s
                                                          ? 0
                                                          : g_.INT48_MIN),
                                                        (n = s
                                                          ? g_.INT48_UNSIGNED_MAX
                                                          : g_.INT48_MAX))
                                                      : g$(e, [
                                                            "PgBigInt53",
                                                            "PgBigSerial53",
                                                            "MySqlBigInt53",
                                                            "MySqlSerial",
                                                            "SingleStoreBigInt53",
                                                            "SingleStoreSerial",
                                                            "SQLiteInteger",
                                                          ])
                                                        ? ((r = (s =
                                                            s ||
                                                            g$(e, [
                                                              "MySqlSerial",
                                                              "SingleStoreSerial",
                                                            ]))
                                                            ? 0
                                                            : Number.MIN_SAFE_INTEGER),
                                                          (n =
                                                            Number.MAX_SAFE_INTEGER),
                                                          (a = !0))
                                                        : g$(e, [
                                                              "MySqlYear",
                                                              "SingleStoreYear",
                                                            ])
                                                          ? ((r = 1901),
                                                            (n = 2155),
                                                            (a = !0))
                                                          : ((r =
                                                              Number.MIN_SAFE_INTEGER),
                                                            (n =
                                                              Number.MAX_SAFE_INTEGER));
                                            let o =
                                              !0 === i || i?.number
                                                ? a
                                                  ? t.coerce.number()
                                                  : t.coerce.number().int()
                                                : a
                                                  ? t.int()
                                                  : t.number();
                                            return o.gte(r).lte(n);
                                          })(t, n, s))
                                        : "bigint" === t.dataType
                                          ? (r = (function (e, t, i) {
                                              let r = e
                                                  .getSQLType()
                                                  .includes("unsigned"),
                                                n = r ? 0n : g_.INT64_MIN,
                                                s = r
                                                  ? g_.INT64_UNSIGNED_MAX
                                                  : g_.INT64_MAX;
                                              return (
                                                !0 === i || i?.bigint
                                                  ? t.coerce.bigint()
                                                  : t.bigint()
                                              )
                                                .gte(n)
                                                .lte(s);
                                            })(t, n, s))
                                          : "boolean" === t.dataType
                                            ? (r =
                                                !0 === s || s.boolean
                                                  ? n.coerce.boolean()
                                                  : n.boolean())
                                            : "date" === t.dataType
                                              ? (r =
                                                  !0 === s || s.date
                                                    ? n.coerce.date()
                                                    : n.date())
                                              : "string" === t.dataType
                                                ? (r = (function (e, t, i) {
                                                    let r, n;
                                                    if (g$(e, ["PgUUID"]))
                                                      return t.uuid();
                                                    let s = !1;
                                                    g$(e, [
                                                      "PgVarchar",
                                                      "SQLiteText",
                                                    ])
                                                      ? (r = e.length)
                                                      : g$(e, [
                                                            "MySqlVarChar",
                                                            "SingleStoreVarChar",
                                                          ])
                                                        ? (r =
                                                            e.length ??
                                                            g_.INT16_UNSIGNED_MAX)
                                                        : g$(e, [
                                                            "MySqlText",
                                                            "SingleStoreText",
                                                          ]) &&
                                                          (r =
                                                            "longtext" ===
                                                            e.textType
                                                              ? g_.INT32_UNSIGNED_MAX
                                                              : "mediumtext" ===
                                                                  e.textType
                                                                ? g_.INT24_UNSIGNED_MAX
                                                                : "text" ===
                                                                    e.textType
                                                                  ? g_.INT16_UNSIGNED_MAX
                                                                  : g_.INT8_UNSIGNED_MAX),
                                                      g$(e, [
                                                        "PgChar",
                                                        "MySqlChar",
                                                        "SingleStoreChar",
                                                      ]) &&
                                                        ((r = e.length),
                                                        (s = !0)),
                                                      g$(e, [
                                                        "PgBinaryVector",
                                                      ]) &&
                                                        ((n = /^[01]+$/),
                                                        (r = e.dimensions));
                                                    let a =
                                                      !0 === i || i?.string
                                                        ? t.coerce.string()
                                                        : t.string();
                                                    return (
                                                      (a = n ? a.regex(n) : a),
                                                      r && s
                                                        ? a.length(r)
                                                        : r
                                                          ? a.max(r)
                                                          : a
                                                    );
                                                  })(t, n, s))
                                                : "json" === t.dataType
                                                  ? (r = gw)
                                                  : "custom" === t.dataType
                                                    ? (r = n.any())
                                                    : "buffer" === t.dataType &&
                                                      (r = gS)),
                      r || (r = n.any()),
                      r
                    );
                  })(u, n)
                : gb.any(),
              c = "function" == typeof t ? t(l) : l;
            !r.never(u) &&
              ((s[a] = c),
              u &&
                (r.nullable(u) && (s[a] = s[a].nullable()),
                r.optional(u) && (s[a] = s[a].optional())));
          }
          return gb.object(s);
        })(gk(e), t ?? {}, gI),
      gP = nq("category", {
        id: rS("id").primaryKey().generatedAlwaysAsIdentity(),
        name: nP("name", { length: 255 }).notNull().unique(),
      }),
      gN = gE(gP);
    e.s(["categoriesTable", 0, gP, "categorySchema", 0, gN], 49580),
      e.s(["commentSchema", () => gL, "commentsTable", () => gZ], 85121),
      e.s(
        [
          "postSchema",
          () => gC,
          "postTagSchema",
          () => gj,
          "postTagsTable",
          () => gU,
          "postsTable",
          () => gA,
          "statusEnum",
          () => gz,
        ],
        7785,
      );
    var gb = gb;
    let gT = nq("tag", {
        id: rS("id").primaryKey().generatedAlwaysAsIdentity(),
        name: nP("name", { length: 100 }).notNull().unique(),
      }),
      gO = gE(gT);
    e.s(["tagSchema", 0, gO, "tagsTable", 0, gT], 25625);
    let gz =
        ((o = "status"),
        Array.isArray((u = ["draft", "published", "archived"]))
          ? (r = Object.assign((e) => new ir(e ?? "", r), {
              enumName: o,
              enumValues: [...u],
              schema: void 0,
              [ii]: !0,
            }))
          : ((s = void 0),
            (n = Object.assign((e) => new ie(e ?? "", n), {
              enumName: o,
              enumValues: Object.values(u),
              schema: s,
              [ii]: !0,
            })))),
      gA = nq("post", {
        id: rS("id").primaryKey().generatedAlwaysAsIdentity(),
        userId: np("user_id")
          .notNull()
          .references(() => av.id, { onDelete: "cascade" }),
        title: nP("title", { length: 500 }).notNull(),
        slug: nP("slug", { length: 500 }).notNull().unique(),
        shortDescription: np("short_description"),
        content: np("content").notNull(),
        categoryId: rS("category_id").references(() => gP.id, {
          onDelete: "set null",
        }),
        status: gz("status").notNull().default("draft"),
        ...ag,
      }),
      gU = nq(
        "post_tags",
        {
          postId: rS("post_id")
            .notNull()
            .references(() => gA.id, { onDelete: "cascade" }),
          tagId: rS("tag_id")
            .notNull()
            .references(() => gT.id, { onDelete: "cascade" }),
        },
        (e) => [
          (function (...e) {
            return e[0].columns ? new nH(e[0].columns, e[0].name) : new nH(e);
          })({ columns: [e.postId, e.tagId] }),
        ],
      ),
      gD = gE(gA, {
        title: (e) => e.min(1),
        slug: (e) => e.min(1),
        shortDescription: (e) => e.min(1).max(255).optional(),
        content: (e) => e.min(1),
        userId: (e) => e.min(1),
        categoryId: (e) => e.min(1).optional(),
      })
        .pick({
          title: !0,
          slug: !0,
          shortDescription: !0,
          content: !0,
          userId: !0,
          categoryId: !0,
        })
        .extend({ tagIds: gb.array(gb.number().int().min(1)) }),
      gC = gb.discriminatedUnion("mode", [
        gD.extend({ mode: gb.literal("create") }),
        gD.extend({ mode: gb.literal("edit"), id: gb.number().int().min(1) }),
      ]),
      gj = gE(gU),
      gZ = nq("comment", {
        id: rS("id").primaryKey().generatedAlwaysAsIdentity(),
        parentId: rS("parent_id").references(() => gZ.id, {
          onDelete: "set null",
        }),
        userId: np("user_id")
          .notNull()
          .references(() => av.id, { onDelete: "cascade" }),
        content: np("content").notNull(),
        postId: rS("post_id")
          .notNull()
          .references(() => gA.id, { onDelete: "cascade" }),
        ...ag,
      }),
      gL = gE(gZ, {
        content: (e) => e.min(1),
        userId: (e) => e.min(1),
        postId: (e) => e.min(1),
      }).pick({ content: !0, userId: !0, parentId: !0, postId: !0 }),
      gR = sI(av, ({ many: e }) => ({ posts: e(gA), comments: e(gZ) })),
      gM = sI(gP, ({ many: e }) => ({ posts: e(gA) })),
      gB = sI(gT, ({ many: e }) => ({ postTags: e(gU) })),
      gF = sI(gA, ({ one: e, many: t }) => ({
        user: e(av, { fields: [gA.userId], references: [av.id] }),
        category: e(gP, { fields: [gA.categoryId], references: [gP.id] }),
        postTags: t(gU),
        comments: t(gZ),
      })),
      gq = sI(gU, ({ one: e }) => ({
        post: e(gA, { fields: [gU.postId], references: [gA.id] }),
        tag: e(gT, { fields: [gU.tagId], references: [gT.id] }),
      })),
      gQ = sI(gZ, ({ one: e, many: t }) => ({
        user: e(av, { fields: [gZ.userId], references: [av.id] }),
        post: e(gA, { fields: [gZ.postId], references: [gA.id] }),
        parent: e(gZ, {
          fields: [gZ.parentId],
          references: [gZ.id],
          relationName: "comment_replies",
        }),
        replies: t(gZ, { relationName: "comment_replies" }),
      }));
    e.i(10494),
      e.i(46568),
      e.i(49580),
      e.i(85121),
      e.i(7785),
      e.i(25625),
      e.s(
        [
          "account",
          0,
          ab,
          "accountRelations",
          0,
          aS,
          "categoriesTable",
          0,
          gP,
          "categoryRelations",
          0,
          gM,
          "categorySchema",
          0,
          gN,
          "commentRelations",
          0,
          gQ,
          "commentSchema",
          0,
          gL,
          "commentsTable",
          0,
          gZ,
          "postRelations",
          0,
          gF,
          "postSchema",
          0,
          gC,
          "postTagRelations",
          0,
          gq,
          "postTagSchema",
          0,
          gj,
          "postTagsTable",
          0,
          gU,
          "postsTable",
          0,
          gA,
          "rateLimit",
          0,
          a$,
          "session",
          0,
          ay,
          "sessionRelations",
          0,
          aw,
          "statusEnum",
          0,
          gz,
          "tagRelations",
          0,
          gB,
          "tagSchema",
          0,
          gO,
          "tagsTable",
          0,
          gT,
          "timestamps",
          0,
          ag,
          "user",
          0,
          av,
          "userRelations",
          0,
          gR,
          "usersTable",
          0,
          av,
          "verification",
          0,
          a_,
        ],
        6771,
      );
    var gJ = e.i(6771);
    let gV = process.env.DATABASE_URL;
    if (!gV) throw Error("DATABASE_URL environment variable is not set");
    let gW = am(tN(gV), { schema: gJ, logger: !1 });
    e.s(["db", 0, gW], 28285);
  },
  79832,
  (e) =>
    e.a(async (t, i) => {
      try {
        var r = e.i(22240),
          n = e.i(28500),
          s = e.i(39235),
          a = e.i(28285),
          o = t([r, n, s]);
        [r, n, s] = o.then ? (await o)() : o;
        let u = (0, r.betterAuth)({
          database: (0, n.drizzleAdapter)(a.db, { provider: "pg" }),
          session: { cookieCache: { enabled: !0, maxAge: 300 } },
          plugins: [(0, s.nextCookies)()],
          emailAndPassword: { enabled: !0 },
          rateLimit: {
            enabled: !0,
            window: 10,
            max: 100,
            storage: "database",
            customRules: {
              "/api/auth/sign-in/email": { window: 10, max: 3 },
              "/api/auth/sign-up/email": { window: 10, max: 3 },
              "/api/auth/reset-password": { window: 60, max: 3 },
              "/api/auth/get-session": !1,
            },
          },
          advanced: {
            ipAddress: {
              ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
              disableIpTracking: !1,
            },
          },
        });
        e.s(["auth", 0, u]), i();
      } catch (e) {
        i(e);
      }
    }, !1),
  67110,
  (e) =>
    e.a(async (t, i) => {
      try {
        var r = e.i(39235),
          n = e.i(79832),
          s = t([r, n]);
        [r, n] = s.then ? (await s)() : s;
        let { POST: a, GET: o } = (0, r.toNextJsHandler)(n.auth);
        e.s(["GET", 0, o, "POST", 0, a]), i();
      } catch (e) {
        i(e);
      }
    }, !1),
  67691,
  (e) =>
    e.a(async (t, i) => {
      try {
        var r = e.i(47909),
          n = e.i(74017),
          s = e.i(96250),
          a = e.i(59756),
          o = e.i(61916),
          u = e.i(74677),
          l = e.i(69741),
          c = e.i(16795),
          d = e.i(87718),
          f = e.i(95169),
          h = e.i(47587),
          p = e.i(66012),
          m = e.i(70101),
          g = e.i(26937),
          v = e.i(10372),
          y = e.i(93695);
        e.i(52474);
        var b = e.i(220),
          _ = e.i(67110),
          $ = t([_]);
        [_] = $.then ? (await $)() : $;
        let w = new r.AppRouteRouteModule({
            definition: {
              kind: n.RouteKind.APP_ROUTE,
              page: "/api/auth/[...all]/route",
              pathname: "/api/auth/[...all]",
              filename: "route",
              bundlePath: "",
            },
            distDir: ".next",
            relativeProjectDir: "",
            resolvedPagePath: "[project]/src/app/api/auth/[...all]/route.ts",
            nextConfigOutput: "",
            userland: _,
            ...{},
          }),
          { workAsyncStorage: S, workUnitAsyncStorage: k, serverHooks: I } = w;
        async function x(e, t, i) {
          i.requestMeta && (0, a.setRequestMeta)(e, i.requestMeta),
            w.isDev &&
              (0, a.addRequestMeta)(
                e,
                "devRequestTimingInternalsEnd",
                process.hrtime.bigint(),
              );
          let r = "/api/auth/[...all]/route";
          r = r.replace(/\/index$/, "") || "/";
          let s = await w.prepare(e, t, { srcPage: r, multiZoneDraftMode: !1 });
          if (!s)
            return (
              (t.statusCode = 400),
              t.end("Bad Request"),
              null == i.waitUntil || i.waitUntil.call(i, Promise.resolve()),
              null
            );
          let {
              buildId: _,
              deploymentId: $,
              params: x,
              nextConfig: S,
              parsedUrl: k,
              isDraftMode: I,
              prerenderManifest: E,
              routerServerContext: P,
              isOnDemandRevalidate: N,
              revalidateOnlyGenerated: T,
              resolvedPathname: O,
              clientReferenceManifest: z,
              serverActionsManifest: A,
            } = s,
            U = (0, l.normalizeAppPath)(r),
            D = !!(E.dynamicRoutes[U] || E.routes[O]),
            C = async () => (
              (null == P ? void 0 : P.render404)
                ? await P.render404(e, t, k, !1)
                : t.end("This page could not be found"),
              null
            );
          if (D && !I) {
            let e = !!E.routes[O],
              t = E.dynamicRoutes[U];
            if (t && !1 === t.fallback && !e) {
              if (S.adapterPath) return await C();
              throw new y.NoFallbackError();
            }
          }
          let j = null;
          !D || w.isDev || I || ((j = O), (j = "/index" === j ? "/" : j));
          let Z = !0 === w.isDev || !D,
            L = D && !Z;
          A &&
            z &&
            (0, u.setManifestsSingleton)({
              page: r,
              clientReferenceManifest: z,
              serverActionsManifest: A,
            });
          let R = e.method || "GET",
            M = (0, o.getTracer)(),
            B = M.getActiveScopeSpan(),
            F = !!(null == P ? void 0 : P.isWrappedByNextServer),
            q = !!(0, a.getRequestMeta)(e, "minimalMode"),
            Q =
              (0, a.getRequestMeta)(e, "incrementalCache") ||
              (await w.getIncrementalCache(e, S, E, q));
          null == Q || Q.resetRequestCache(),
            (globalThis.__incrementalCache = Q);
          let J = {
              params: x,
              previewProps: E.preview,
              renderOpts: {
                experimental: {
                  authInterrupts: !!S.experimental.authInterrupts,
                },
                cacheComponents: !!S.cacheComponents,
                supportsDynamicResponse: Z,
                incrementalCache: Q,
                cacheLifeProfiles: S.cacheLife,
                waitUntil: i.waitUntil,
                onClose: (e) => {
                  t.on("close", e);
                },
                onAfterTaskError: void 0,
                onInstrumentationRequestError: (t, i, r, n) =>
                  w.onRequestError(e, t, r, n, P),
              },
              sharedContext: { buildId: _, deploymentId: $ },
            },
            V = new c.NodeNextRequest(e),
            W = new c.NodeNextResponse(t),
            G = d.NextRequestAdapter.fromNodeNextRequest(
              V,
              (0, d.signalFromNodeResponse)(t),
            );
          try {
            let s,
              a = async (e) =>
                w.handle(G, J).finally(() => {
                  if (!e) return;
                  e.setAttributes({
                    "http.status_code": t.statusCode,
                    "next.rsc": !1,
                  });
                  let i = M.getRootSpanAttributes();
                  if (!i) return;
                  if (
                    i.get("next.span_type") !== f.BaseServerSpan.handleRequest
                  )
                    return void console.warn(
                      `Unexpected root span type '${i.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`,
                    );
                  let n = i.get("next.route");
                  if (n) {
                    let t = `${R} ${n}`;
                    e.setAttributes({
                      "next.route": n,
                      "http.route": n,
                      "next.span_name": t,
                    }),
                      e.updateName(t),
                      s &&
                        s !== e &&
                        (s.setAttribute("http.route", n), s.updateName(t));
                  } else e.updateName(`${R} ${r}`);
                }),
              u = async (s) => {
                var o, u;
                let l = async ({ previousCacheEntry: n }) => {
                    try {
                      if (!q && N && T && !n)
                        return (
                          (t.statusCode = 404),
                          t.setHeader("x-nextjs-cache", "REVALIDATED"),
                          t.end("This page could not be found"),
                          null
                        );
                      let r = await a(s);
                      e.fetchMetrics = J.renderOpts.fetchMetrics;
                      let o = J.renderOpts.pendingWaitUntil;
                      o && i.waitUntil && (i.waitUntil(o), (o = void 0));
                      let u = J.renderOpts.collectedTags;
                      if (!D)
                        return (
                          await (0, p.sendResponse)(
                            V,
                            W,
                            r,
                            J.renderOpts.pendingWaitUntil,
                          ),
                          null
                        );
                      {
                        let e = await r.blob(),
                          t = (0, m.toNodeOutgoingHttpHeaders)(r.headers);
                        u && (t[v.NEXT_CACHE_TAGS_HEADER] = u),
                          !t["content-type"] &&
                            e.type &&
                            (t["content-type"] = e.type);
                        let i =
                            void 0 !== J.renderOpts.collectedRevalidate &&
                            !(
                              J.renderOpts.collectedRevalidate >=
                              v.INFINITE_CACHE
                            ) &&
                            J.renderOpts.collectedRevalidate,
                          n =
                            void 0 === J.renderOpts.collectedExpire ||
                            J.renderOpts.collectedExpire >= v.INFINITE_CACHE
                              ? void 0
                              : J.renderOpts.collectedExpire;
                        return {
                          value: {
                            kind: b.CachedRouteKind.APP_ROUTE,
                            status: r.status,
                            body: Buffer.from(await e.arrayBuffer()),
                            headers: t,
                          },
                          cacheControl: { revalidate: i, expire: n },
                        };
                      }
                    } catch (t) {
                      throw (
                        ((null == n ? void 0 : n.isStale) &&
                          (await w.onRequestError(
                            e,
                            t,
                            {
                              routerKind: "App Router",
                              routePath: r,
                              routeType: "route",
                              revalidateReason: (0, h.getRevalidateReason)({
                                isStaticGeneration: L,
                                isOnDemandRevalidate: N,
                              }),
                            },
                            !1,
                            P,
                          )),
                        t)
                      );
                    }
                  },
                  c = await w.handleResponse({
                    req: e,
                    nextConfig: S,
                    cacheKey: j,
                    routeKind: n.RouteKind.APP_ROUTE,
                    isFallback: !1,
                    prerenderManifest: E,
                    isRoutePPREnabled: !1,
                    isOnDemandRevalidate: N,
                    revalidateOnlyGenerated: T,
                    responseGenerator: l,
                    waitUntil: i.waitUntil,
                    isMinimalMode: q,
                  });
                if (!D) return null;
                if (
                  (null == c || null == (o = c.value) ? void 0 : o.kind) !==
                  b.CachedRouteKind.APP_ROUTE
                )
                  throw Object.defineProperty(
                    Error(
                      `Invariant: app-route received invalid cache entry ${null == c || null == (u = c.value) ? void 0 : u.kind}`,
                    ),
                    "__NEXT_ERROR_CODE",
                    { value: "E701", enumerable: !1, configurable: !0 },
                  );
                q ||
                  t.setHeader(
                    "x-nextjs-cache",
                    N
                      ? "REVALIDATED"
                      : c.isMiss
                        ? "MISS"
                        : c.isStale
                          ? "STALE"
                          : "HIT",
                  ),
                  I &&
                    t.setHeader(
                      "Cache-Control",
                      "private, no-cache, no-store, max-age=0, must-revalidate",
                    );
                let d = (0, m.fromNodeOutgoingHttpHeaders)(c.value.headers);
                return (
                  (q && D) || d.delete(v.NEXT_CACHE_TAGS_HEADER),
                  !c.cacheControl ||
                    t.getHeader("Cache-Control") ||
                    d.get("Cache-Control") ||
                    d.set(
                      "Cache-Control",
                      (0, g.getCacheControlHeader)(c.cacheControl),
                    ),
                  await (0, p.sendResponse)(
                    V,
                    W,
                    new Response(c.value.body, {
                      headers: d,
                      status: c.value.status || 200,
                    }),
                  ),
                  null
                );
              };
            F && B
              ? await u(B)
              : ((s = M.getActiveScopeSpan()),
                await M.withPropagatedContext(
                  e.headers,
                  () =>
                    M.trace(
                      f.BaseServerSpan.handleRequest,
                      {
                        spanName: `${R} ${r}`,
                        kind: o.SpanKind.SERVER,
                        attributes: { "http.method": R, "http.target": e.url },
                      },
                      u,
                    ),
                  void 0,
                  !F,
                ));
          } catch (t) {
            if (
              (t instanceof y.NoFallbackError ||
                (await w.onRequestError(
                  e,
                  t,
                  {
                    routerKind: "App Router",
                    routePath: U,
                    routeType: "route",
                    revalidateReason: (0, h.getRevalidateReason)({
                      isStaticGeneration: L,
                      isOnDemandRevalidate: N,
                    }),
                  },
                  !1,
                  P,
                )),
              D)
            )
              throw t;
            return (
              await (0, p.sendResponse)(
                V,
                W,
                new Response(null, { status: 500 }),
              ),
              null
            );
          }
        }
        e.s([
          "handler",
          0,
          x,
          "patchFetch",
          0,
          function () {
            return (0, s.patchFetch)({
              workAsyncStorage: S,
              workUnitAsyncStorage: k,
            });
          },
          "routeModule",
          0,
          w,
          "serverHooks",
          0,
          I,
          "workAsyncStorage",
          0,
          S,
          "workUnitAsyncStorage",
          0,
          k,
        ]),
          i();
      } catch (e) {
        i(e);
      }
    }, !1),
];

//# sourceMappingURL=_1u-jf-k._.js.map
