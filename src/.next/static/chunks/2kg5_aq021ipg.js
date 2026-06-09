(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([
  "object" == typeof document ? document.currentScript : void 0,
  56420,
  (e) => {
    "use strict";
    var t = e.i(71645),
      r = e.i(96661);
    let o = (e) => {
      let t = e.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, t, r) =>
        r ? r.toUpperCase() : t.toLowerCase(),
      );
      return t.charAt(0).toUpperCase() + t.slice(1);
    };
    var n = e.i(5014);
    e.s(
      [
        "default",
        0,
        (e, i) => {
          let s = (0, t.forwardRef)(({ className: s, ...a }, l) =>
            (0, t.createElement)(n.default, {
              ref: l,
              iconNode: i,
              className: (0, r.mergeClasses)(
                `lucide-${o(e)
                  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
                  .toLowerCase()}`,
                `lucide-${e}`,
                s,
              ),
              ...a,
            }),
          );
          return (s.displayName = o(e)), s;
        },
      ],
      56420,
    );
  },
  25913,
  7670,
  20783,
  91918,
  (e) => {
    "use strict";
    function t() {
      for (var e, t, r = 0, o = "", n = arguments.length; r < n; r++)
        (e = arguments[r]) &&
          (t = (function e(t) {
            var r,
              o,
              n = "";
            if ("string" == typeof t || "number" == typeof t) n += t;
            else if ("object" == typeof t)
              if (Array.isArray(t)) {
                var i = t.length;
                for (r = 0; r < i; r++)
                  t[r] && (o = e(t[r])) && (n && (n += " "), (n += o));
              } else for (o in t) t[o] && (n && (n += " "), (n += o));
            return n;
          })(e)) &&
          (o && (o += " "), (o += t));
      return o;
    }
    e.s(["clsx", 0, t], 7670);
    let r = (e) => ("boolean" == typeof e ? `${e}` : 0 === e ? "0" : e);
    e.s(
      [
        "cva",
        0,
        (e, o) => (n) => {
          var i;
          if ((null == o ? void 0 : o.variants) == null)
            return t(
              e,
              null == n ? void 0 : n.class,
              null == n ? void 0 : n.className,
            );
          let { variants: s, defaultVariants: a } = o,
            l = Object.keys(s).map((e) => {
              let t = null == n ? void 0 : n[e],
                o = null == a ? void 0 : a[e];
              if (null === t) return null;
              let i = r(t) || r(o);
              return s[e][i];
            }),
            c =
              n &&
              Object.entries(n).reduce((e, t) => {
                let [r, o] = t;
                return void 0 === o || (e[r] = o), e;
              }, {});
          return t(
            e,
            l,
            null == o || null == (i = o.compoundVariants)
              ? void 0
              : i.reduce((e, t) => {
                  let { class: r, className: o, ...n } = t;
                  return Object.entries(n).every((e) => {
                    let [t, r] = e;
                    return Array.isArray(r)
                      ? r.includes({ ...a, ...c }[t])
                      : { ...a, ...c }[t] === r;
                  })
                    ? [...e, r, o]
                    : e;
                }, []),
            null == n ? void 0 : n.class,
            null == n ? void 0 : n.className,
          );
        },
      ],
      25913,
    );
    var o = e.i(71645);
    function n(e, t) {
      if ("function" == typeof e) return e(t);
      null != e && (e.current = t);
    }
    function i(...e) {
      return (t) => {
        let r = !1,
          o = e.map((e) => {
            let o = n(e, t);
            return r || "function" != typeof o || (r = !0), o;
          });
        if (r)
          return () => {
            for (let t = 0; t < o.length; t++) {
              let r = o[t];
              "function" == typeof r ? r() : n(e[t], null);
            }
          };
      };
    }
    e.s(
      [
        "composeRefs",
        0,
        i,
        "useComposedRefs",
        0,
        function (...e) {
          return o.useCallback(i(...e), e);
        },
      ],
      20783,
    );
    var s = e.i(43476);
    function a(e) {
      var t;
      let r,
        n =
          ((t = e),
          ((r = o.forwardRef((e, t) => {
            let { children: r, ...n } = e;
            if (o.isValidElement(r)) {
              var s;
              let e,
                a,
                l =
                  ((s = r),
                  (a =
                    (e = Object.getOwnPropertyDescriptor(
                      s.props,
                      "ref",
                    )?.get) &&
                    "isReactWarning" in e &&
                    e.isReactWarning)
                    ? s.ref
                    : (a =
                          (e = Object.getOwnPropertyDescriptor(
                            s,
                            "ref",
                          )?.get) &&
                          "isReactWarning" in e &&
                          e.isReactWarning)
                      ? s.props.ref
                      : s.props.ref || s.ref),
                c = (function (e, t) {
                  let r = { ...t };
                  for (let o in t) {
                    let n = e[o],
                      i = t[o];
                    /^on[A-Z]/.test(o)
                      ? n && i
                        ? (r[o] = (...e) => {
                            let t = i(...e);
                            return n(...e), t;
                          })
                        : n && (r[o] = n)
                      : "style" === o
                        ? (r[o] = { ...n, ...i })
                        : "className" === o &&
                          (r[o] = [n, i].filter(Boolean).join(" "));
                  }
                  return { ...e, ...r };
                })(n, r.props);
              return (
                r.type !== o.Fragment && (c.ref = t ? i(t, l) : l),
                o.cloneElement(r, c)
              );
            }
            return o.Children.count(r) > 1 ? o.Children.only(null) : null;
          })).displayName = `${t}.SlotClone`),
          r),
        a = o.forwardRef((e, t) => {
          let { children: r, ...i } = e,
            a = o.Children.toArray(r),
            l = a.find(m);
          if (l) {
            let e = l.props.children,
              r = a.map((t) =>
                t !== l
                  ? t
                  : o.Children.count(e) > 1
                    ? o.Children.only(null)
                    : o.isValidElement(e)
                      ? e.props.children
                      : null,
              );
            return (0, s.jsx)(n, {
              ...i,
              ref: t,
              children: o.isValidElement(e)
                ? o.cloneElement(e, void 0, r)
                : null,
            });
          }
          return (0, s.jsx)(n, { ...i, ref: t, children: r });
        });
      return (a.displayName = `${e}.Slot`), a;
    }
    var l = a("Slot"),
      c = Symbol("radix.slottable");
    function d(e) {
      let t = ({ children: e }) => (0, s.jsx)(s.Fragment, { children: e });
      return (t.displayName = `${e}.Slottable`), (t.__radixId = c), t;
    }
    var u = d("Slottable");
    function m(e) {
      return (
        o.isValidElement(e) &&
        "function" == typeof e.type &&
        "__radixId" in e.type &&
        e.type.__radixId === c
      );
    }
    e.s(
      [
        "Root",
        0,
        l,
        "Slot",
        0,
        l,
        "Slottable",
        0,
        u,
        "createSlot",
        0,
        a,
        "createSlottable",
        0,
        d,
      ],
      91918,
    );
  },
  86011,
  (e) => {
    "use strict";
    var t = e.i(91918);
    e.s(["Slot", 0, t]);
  },
  75157,
  (e) => {
    "use strict";
    let t, r;
    var o,
      n = e.i(7670);
    let i = Symbol.for("drizzle:entityKind");
    function s(e, t) {
      if (!e || "object" != typeof e) return !1;
      if (e instanceof t) return !0;
      if (!Object.prototype.hasOwnProperty.call(t, i))
        throw Error(
          `Class "${t.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`,
        );
      let r = Object.getPrototypeOf(e).constructor;
      if (r)
        for (; r; ) {
          if (i in r && r[i] === t[i]) return !0;
          r = Object.getPrototypeOf(r);
        }
      return !1;
    }
    Symbol.for("drizzle:hasOwnEntityKind");
    class a {
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
      static [i] = "Column";
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
    class l {
      static [i] = "ColumnBuilder";
      config;
      constructor(e, t, r) {
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
          columnType: r,
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
    let c = Symbol.for("drizzle:Name");
    class d {
      static [i] = "PgForeignKeyBuilder";
      reference;
      _onUpdate = "no action";
      _onDelete = "no action";
      constructor(e, t) {
        (this.reference = () => {
          let { name: t, columns: r, foreignColumns: o } = e();
          return {
            name: t,
            columns: r,
            foreignTable: o[0].table,
            foreignColumns: o,
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
        return new u(e, this);
      }
    }
    class u {
      constructor(e, t) {
        (this.table = e),
          (this.reference = t.reference),
          (this.onUpdate = t._onUpdate),
          (this.onDelete = t._onDelete);
      }
      static [i] = "PgForeignKey";
      reference;
      onUpdate;
      onDelete;
      getName() {
        let { name: e, columns: t, foreignColumns: r } = this.reference(),
          o = t.map((e) => e.name),
          n = r.map((e) => e.name),
          i = [this.table[c], ...o, r[0].table[c], ...n];
        return e ?? `${i.join("_")}_fk`;
      }
    }
    function m(e, ...t) {
      return e(...t);
    }
    function p(e, t) {
      return `${e[c]}_${t.join("_")}_unique`;
    }
    class f {
      constructor(e, t) {
        (this.name = t), (this.columns = e);
      }
      static [i] = "PgUniqueConstraintBuilder";
      columns;
      nullsNotDistinctConfig = !1;
      nullsNotDistinct() {
        return (this.nullsNotDistinctConfig = !0), this;
      }
      build(e) {
        return new g(e, this.columns, this.nullsNotDistinctConfig, this.name);
      }
    }
    class h {
      static [i] = "PgUniqueOnConstraintBuilder";
      name;
      constructor(e) {
        this.name = e;
      }
      on(...e) {
        return new f(e, this.name);
      }
    }
    class g {
      constructor(e, t, r, o) {
        (this.table = e),
          (this.columns = t),
          (this.name =
            o ??
            p(
              this.table,
              this.columns.map((e) => e.name),
            )),
          (this.nullsNotDistinct = r);
      }
      static [i] = "PgUniqueConstraint";
      columns;
      name;
      nullsNotDistinct = !1;
      getName() {
        return this.name;
      }
    }
    function b(e, t, r) {
      for (let o = t; o < e.length; o++) {
        let n = e[o];
        if ("\\" === n) {
          o++;
          continue;
        }
        if ('"' === n) return [e.slice(t, o).replace(/\\/g, ""), o + 1];
        if (!r && ("," === n || "}" === n))
          return [e.slice(t, o).replace(/\\/g, ""), o];
      }
      return [e.slice(t).replace(/\\/g, ""), e.length];
    }
    class y extends l {
      foreignKeyConfigs = [];
      static [i] = "PgColumnBuilder";
      array(e) {
        return new k(this.config.name, this, e);
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
        return this.foreignKeyConfigs.map(({ ref: r, actions: o }) =>
          m(
            (r, o) => {
              let n = new d(() => ({ columns: [e], foreignColumns: [r()] }));
              return (
                o.onUpdate && n.onUpdate(o.onUpdate),
                o.onDelete && n.onDelete(o.onDelete),
                n.build(t)
              );
            },
            r,
            o,
          ),
        );
      }
      buildExtraConfigColumn(e) {
        return new w(e, this.config);
      }
    }
    class v extends a {
      constructor(e, t) {
        t.uniqueName || (t.uniqueName = p(e, [t.name])),
          super(e, t),
          (this.table = e);
      }
      static [i] = "PgColumn";
    }
    class w extends v {
      static [i] = "ExtraConfigColumn";
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
    class x {
      static [i] = "IndexedColumn";
      constructor(e, t, r, o) {
        (this.name = e),
          (this.keyAsName = t),
          (this.type = r),
          (this.indexConfig = o);
      }
      name;
      keyAsName;
      type;
      indexConfig;
    }
    class k extends y {
      static [i] = "PgArrayBuilder";
      constructor(e, t, r) {
        super(e, "array", "PgArray"),
          (this.config.baseBuilder = t),
          (this.config.size = r);
      }
      build(e) {
        let t = this.config.baseBuilder.build(e);
        return new z(e, this.config, t);
      }
    }
    class z extends v {
      constructor(e, t, r, o) {
        super(e, t),
          (this.baseColumn = r),
          (this.range = o),
          (this.size = t.size);
      }
      size;
      static [i] = "PgArray";
      getSQLType() {
        return `${this.baseColumn.getSQLType()}[${"number" == typeof this.size ? this.size : ""}]`;
      }
      mapFromDriverValue(e) {
        return (
          "string" == typeof e &&
            (e = (function (e) {
              let [t] = (function e(t, r = 0) {
                let o = [],
                  n = r,
                  i = !1;
                for (; n < t.length; ) {
                  let s = t[n];
                  if ("," === s) {
                    (i || n === r) && o.push(""), (i = !0), n++;
                    continue;
                  }
                  if (((i = !1), "\\" === s)) {
                    n += 2;
                    continue;
                  }
                  if ('"' === s) {
                    let [e, r] = b(t, n + 1, !0);
                    o.push(e), (n = r);
                    continue;
                  }
                  if ("}" === s) return [o, n + 1];
                  if ("{" === s) {
                    let [r, i] = e(t, n + 1);
                    o.push(r), (n = i);
                    continue;
                  }
                  let [a, l] = b(t, n, !1);
                  o.push(a), (n = l);
                }
                return [o, n];
              })(e, 1);
              return t;
            })(e)),
          e.map((e) => this.baseColumn.mapFromDriverValue(e))
        );
      }
      mapToDriverValue(e, t = !1) {
        let r = e.map((e) =>
          null === e
            ? null
            : s(this.baseColumn, z)
              ? this.baseColumn.mapToDriverValue(e, !0)
              : this.baseColumn.mapToDriverValue(e),
        );
        return t
          ? r
          : (function e(t) {
              return `{${t.map((t) => (Array.isArray(t) ? e(t) : "string" == typeof t ? `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `${t}`)).join(",")}}`;
            })(r);
      }
    }
    class S extends y {
      static [i] = "PgEnumObjectColumnBuilder";
      constructor(e, t) {
        super(e, "string", "PgEnumObjectColumn"), (this.config.enum = t);
      }
      build(e) {
        return new C(e, this.config);
      }
    }
    class C extends v {
      static [i] = "PgEnumObjectColumn";
      enum;
      enumValues = this.config.enum.enumValues;
      constructor(e, t) {
        super(e, t), (this.enum = t.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    let N = Symbol.for("drizzle:isPgEnum");
    class T extends y {
      static [i] = "PgEnumColumnBuilder";
      constructor(e, t) {
        super(e, "string", "PgEnumColumn"), (this.config.enum = t);
      }
      build(e) {
        return new q(e, this.config);
      }
    }
    class q extends v {
      static [i] = "PgEnumColumn";
      enum = this.config.enum;
      enumValues = this.config.enum.enumValues;
      constructor(e, t) {
        super(e, t), (this.enum = t.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    class P {
      static [i] = "Subquery";
      constructor(e, t, r, o = !1, n = []) {
        this._ = {
          brand: "Subquery",
          sql: e,
          selectedFields: t,
          alias: r,
          isWith: o,
          usedTables: n,
        };
      }
    }
    class j extends P {
      static [i] = "WithSubquery";
    }
    let D = (e, o) =>
        t
          ? (r || (r = t.trace.getTracer("drizzle-orm", "0.45.2")),
            m(
              (t, r) =>
                r.startActiveSpan(e, (e) => {
                  try {
                    return o(e);
                  } catch (r) {
                    throw (
                      (e.setStatus({
                        code: t.SpanStatusCode.ERROR,
                        message:
                          r instanceof Error ? r.message : "Unknown error",
                      }),
                      r)
                    );
                  } finally {
                    e.end();
                  }
                }),
              t,
              r,
            ))
          : o(),
      A = Symbol.for("drizzle:ViewBaseConfig"),
      $ = Symbol.for("drizzle:Schema"),
      O = Symbol.for("drizzle:Columns"),
      F = Symbol.for("drizzle:ExtraConfigColumns"),
      _ = Symbol.for("drizzle:OriginalName"),
      Q = Symbol.for("drizzle:BaseName"),
      U = Symbol.for("drizzle:IsAlias"),
      L = Symbol.for("drizzle:ExtraConfigBuilder"),
      I = Symbol.for("drizzle:IsDrizzleTable");
    class V {
      static [i] = "Table";
      static Symbol = {
        Name: c,
        Schema: $,
        OriginalName: _,
        Columns: O,
        ExtraConfigColumns: F,
        BaseName: Q,
        IsAlias: U,
        ExtraConfigBuilder: L,
      };
      [c];
      [_];
      [$];
      [O];
      [F];
      [Q];
      [U] = !1;
      [I] = !0;
      [L] = void 0;
      constructor(e, t, r) {
        (this[c] = this[_] = e), (this[$] = t), (this[Q] = r);
      }
    }
    class E {
      static [i] = "FakePrimitiveParam";
    }
    class B {
      static [i] = "StringChunk";
      value;
      constructor(e) {
        this.value = Array.isArray(e) ? e : [e];
      }
      getSQL() {
        return new R([this]);
      }
    }
    class R {
      constructor(e) {
        for (const t of ((this.queryChunks = e), e))
          if (s(t, V)) {
            const e = t[V.Symbol.Schema];
            this.usedTables.push(
              void 0 === e ? t[V.Symbol.Name] : e + "." + t[V.Symbol.Name],
            );
          }
      }
      static [i] = "SQL";
      decoder = G;
      shouldInlineParams = !1;
      usedTables = [];
      append(e) {
        return this.queryChunks.push(...e.queryChunks), this;
      }
      toQuery(e) {
        return D("drizzle.buildSQL", (t) => {
          let r = this.buildQueryFromSourceParams(this.queryChunks, e);
          return (
            t?.setAttributes({
              "drizzle.query.text": r.sql,
              "drizzle.query.params": JSON.stringify(r.params),
            }),
            r
          );
        });
      }
      buildQueryFromSourceParams(e, t) {
        let r = Object.assign({}, t, {
            inlineParams: t.inlineParams || this.shouldInlineParams,
            paramStartIndex: t.paramStartIndex || { value: 0 },
          }),
          {
            casing: o,
            escapeName: n,
            escapeParam: i,
            prepareTyping: l,
            inlineParams: c,
            paramStartIndex: d,
          } = r;
        var u = e.map((e) => {
          if (s(e, B)) return { sql: e.value.join(""), params: [] };
          if (s(e, W)) return { sql: n(e.value), params: [] };
          if (void 0 === e) return { sql: "", params: [] };
          if (Array.isArray(e)) {
            let t = [new B("(")];
            for (let [r, o] of e.entries())
              t.push(o), r < e.length - 1 && t.push(new B(", "));
            return t.push(new B(")")), this.buildQueryFromSourceParams(t, r);
          }
          if (s(e, R))
            return this.buildQueryFromSourceParams(e.queryChunks, {
              ...r,
              inlineParams: c || e.shouldInlineParams,
            });
          if (s(e, V)) {
            let t = e[V.Symbol.Schema],
              r = e[V.Symbol.Name];
            return {
              sql: void 0 === t || e[U] ? n(r) : n(t) + "." + n(r),
              params: [],
            };
          }
          if (s(e, a)) {
            let r = o.getColumnCasing(e);
            if ("indexes" === t.invokeSource) return { sql: n(r), params: [] };
            let i = e.table[V.Symbol.Schema];
            return {
              sql:
                e.table[U] || void 0 === i
                  ? n(e.table[V.Symbol.Name]) + "." + n(r)
                  : n(i) + "." + n(e.table[V.Symbol.Name]) + "." + n(r),
              params: [],
            };
          }
          if (s(e, ee)) {
            let t = e[A].schema,
              r = e[A].name;
            return {
              sql: void 0 === t || e[A].isAlias ? n(r) : n(t) + "." + n(r),
              params: [],
            };
          }
          if (s(e, M)) {
            if (s(e.value, X))
              return { sql: i(d.value++, e), params: [e], typings: ["none"] };
            let t =
              null === e.value ? null : e.encoder.mapToDriverValue(e.value);
            if (s(t, R)) return this.buildQueryFromSourceParams([t], r);
            if (c) return { sql: this.mapInlineParam(t, r), params: [] };
            let o = ["none"];
            return (
              l && (o = [l(e.encoder)]),
              { sql: i(d.value++, t), params: [t], typings: o }
            );
          }
          return s(e, X)
            ? { sql: i(d.value++, e), params: [e], typings: ["none"] }
            : s(e, R.Aliased) && void 0 !== e.fieldAlias
              ? { sql: n(e.fieldAlias), params: [] }
              : s(e, P)
                ? e._.isWith
                  ? { sql: n(e._.alias), params: [] }
                  : this.buildQueryFromSourceParams(
                      [new B("("), e._.sql, new B(") "), new W(e._.alias)],
                      r,
                    )
                : e && "function" == typeof e && N in e && !0 === e[N]
                  ? e.schema
                    ? { sql: n(e.schema) + "." + n(e.enumName), params: [] }
                    : { sql: n(e.enumName), params: [] }
                  : null != e && "function" == typeof e.getSQL
                    ? e.shouldOmitSQLParens?.()
                      ? this.buildQueryFromSourceParams([e.getSQL()], r)
                      : this.buildQueryFromSourceParams(
                          [new B("("), e.getSQL(), new B(")")],
                          r,
                        )
                    : c
                      ? { sql: this.mapInlineParam(e, r), params: [] }
                      : {
                          sql: i(d.value++, e),
                          params: [e],
                          typings: ["none"],
                        };
        });
        let m = { sql: "", params: [] };
        for (let e of u)
          (m.sql += e.sql),
            m.params.push(...e.params),
            e.typings?.length &&
              (m.typings || (m.typings = []), m.typings.push(...e.typings));
        return m;
      }
      mapInlineParam(e, { escapeString: t }) {
        if (null === e) return "null";
        if ("number" == typeof e || "boolean" == typeof e) return e.toString();
        if ("string" == typeof e) return t(e);
        if ("object" == typeof e) {
          let r = e.toString();
          return "[object Object]" === r ? t(JSON.stringify(e)) : t(r);
        }
        throw Error("Unexpected param value: " + e);
      }
      getSQL() {
        return this;
      }
      as(e) {
        return void 0 === e ? this : new R.Aliased(this, e);
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
    class W {
      constructor(e) {
        this.value = e;
      }
      static [i] = "Name";
      brand;
      getSQL() {
        return new R([this]);
      }
    }
    let G = { mapFromDriverValue: (e) => e },
      K = { mapToDriverValue: (e) => e };
    ({ ...G, ...K });
    class M {
      constructor(e, t = K) {
        (this.value = e), (this.encoder = t);
      }
      static [i] = "Param";
      brand;
      getSQL() {
        return new R([this]);
      }
    }
    function Z(e, ...t) {
      let r = [];
      for (let [o, n] of ((t.length > 0 || (e.length > 0 && "" !== e[0])) &&
        r.push(new B(e[0])),
      t.entries()))
        r.push(n, new B(e[o + 1]));
      return new R(r);
    }
    ((o = Z || (Z = {})).empty = function () {
      return new R([]);
    }),
      (o.fromList = function (e) {
        return new R(e);
      }),
      (o.raw = function (e) {
        return new R([new B(e)]);
      }),
      (o.join = function (e, t) {
        let r = [];
        for (let [o, n] of e.entries())
          o > 0 && void 0 !== t && r.push(t), r.push(n);
        return new R(r);
      }),
      (o.identifier = function (e) {
        return new W(e);
      }),
      (o.placeholder = function (e) {
        return new X(e);
      }),
      (o.param = function (e, t) {
        return new M(e, t);
      });
    var J = R || (R = {});
    class H {
      constructor(e, t) {
        (this.sql = e), (this.fieldAlias = t);
      }
      static [i] = "SQL.Aliased";
      isSelectionField = !1;
      getSQL() {
        return this.sql;
      }
      clone() {
        return new H(this.sql, this.fieldAlias);
      }
    }
    J.Aliased = H;
    class X {
      constructor(e) {
        this.name = e;
      }
      static [i] = "Placeholder";
      getSQL() {
        return new R([this]);
      }
    }
    let Y = Symbol.for("drizzle:IsDrizzleView");
    class ee {
      static [i] = "View";
      [A];
      [Y] = !0;
      constructor({ name: e, schema: t, selectedFields: r, query: o }) {
        this[A] = {
          name: e,
          originalName: e,
          schema: t,
          selectedFields: r,
          query: o,
          isExisting: !o,
          isAlias: !1,
        };
      }
      getSQL() {
        return new R([this]);
      }
    }
    (a.prototype.getSQL = function () {
      return new R([this]);
    }),
      (V.prototype.getSQL = function () {
        return new R([this]);
      }),
      (P.prototype.getSQL = function () {
        return new R([this]);
      }),
      "u" < typeof TextDecoder || new TextDecoder();
    class et extends y {
      static [i] = "PgDateColumnBaseBuilder";
      defaultNow() {
        return this.default(Z`now()`);
      }
    }
    class er extends et {
      static [i] = "PgTimestampBuilder";
      constructor(e, t, r) {
        super(e, "date", "PgTimestamp"),
          (this.config.withTimezone = t),
          (this.config.precision = r);
      }
      build(e) {
        return new eo(e, this.config);
      }
    }
    class eo extends v {
      static [i] = "PgTimestamp";
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
    class en extends et {
      static [i] = "PgTimestampStringBuilder";
      constructor(e, t, r) {
        super(e, "string", "PgTimestampString"),
          (this.config.withTimezone = t),
          (this.config.precision = r);
      }
      build(e) {
        return new ei(e, this.config);
      }
    }
    class ei extends v {
      static [i] = "PgTimestampString";
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
          let r = e.getTimezoneOffset();
          return `${t}${r <= 0 ? "+" : "-"}${Math.floor(Math.abs(r) / 60)
            .toString()
            .padStart(2, "0")}`;
        }
        return t;
      }
    }
    function es(e, t = {}) {
      let { name: r, config: o } = {
        name: "string" == typeof e && e.length > 0 ? e : "",
        config: "object" == typeof e ? e : t,
      };
      return o?.mode === "string"
        ? new en(r, o.withTimezone ?? !1, o.precision)
        : new er(r, o?.withTimezone ?? !1, o?.precision);
    }
    let ea = (e = new Map(), t = null, r) => ({
        nextPart: e,
        validators: t,
        classGroupId: r,
      }),
      el = [],
      ec = (e, t, r) => {
        if (0 == e.length - t) return r.classGroupId;
        let o = e[t],
          n = r.nextPart.get(o);
        if (n) {
          let r = ec(e, t + 1, n);
          if (r) return r;
        }
        let i = r.validators;
        if (null === i) return;
        let s = 0 === t ? e.join("-") : e.slice(t).join("-"),
          a = i.length;
        for (let e = 0; e < a; e++) {
          let t = i[e];
          if (t.validator(s)) return t.classGroupId;
        }
      },
      ed = (e, t) => {
        let r = ea();
        for (let o in e) eu(e[o], r, o, t);
        return r;
      },
      eu = (e, t, r, o) => {
        let n = e.length;
        for (let i = 0; i < n; i++) em(e[i], t, r, o);
      },
      em = (e, t, r, o) => {
        "string" == typeof e
          ? ep(e, t, r)
          : "function" == typeof e
            ? ef(e, t, r, o)
            : eh(e, t, r, o);
      },
      ep = (e, t, r) => {
        ("" === e ? t : eg(t, e)).classGroupId = r;
      },
      ef = (e, t, r, o) => {
        eb(e)
          ? eu(e(o), t, r, o)
          : (null === t.validators && (t.validators = []),
            t.validators.push({ classGroupId: r, validator: e }));
      },
      eh = (e, t, r, o) => {
        let n = Object.entries(e),
          i = n.length;
        for (let e = 0; e < i; e++) {
          let [i, s] = n[e];
          eu(s, eg(t, i), r, o);
        }
      },
      eg = (e, t) => {
        let r = e,
          o = t.split("-"),
          n = o.length;
        for (let e = 0; e < n; e++) {
          let t = o[e],
            n = r.nextPart.get(t);
          n || ((n = ea()), r.nextPart.set(t, n)), (r = n);
        }
        return r;
      },
      eb = (e) => "isThemeGetter" in e && !0 === e.isThemeGetter,
      ey = [],
      ev = (e, t, r, o, n) => ({
        modifiers: e,
        hasImportantModifier: t,
        baseClassName: r,
        maybePostfixModifierPosition: o,
        isExternal: n,
      }),
      ew = /\s+/,
      ex = (e) => {
        let t;
        if ("string" == typeof e) return e;
        let r = "";
        for (let o = 0; o < e.length; o++)
          e[o] && (t = ex(e[o])) && (r && (r += " "), (r += t));
        return r;
      },
      ek = [],
      ez = (e) => {
        let t = (t) => t[e] || ek;
        return (t.isThemeGetter = !0), t;
      },
      eS = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
      eC = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
      eN = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,
      eT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
      eq =
        /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
      eP = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
      ej = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
      eD =
        /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
      eA = (e) => eN.test(e),
      e$ = (e) => !!e && !Number.isNaN(Number(e)),
      eO = (e) => !!e && Number.isInteger(Number(e)),
      eF = (e) => e.endsWith("%") && e$(e.slice(0, -1)),
      e_ = (e) => eT.test(e),
      eQ = () => !0,
      eU = (e) => eq.test(e) && !eP.test(e),
      eL = () => !1,
      eI = (e) => ej.test(e),
      eV = (e) => eD.test(e),
      eE = (e) => !eW(e) && !eY(e),
      eB = (e) =>
        e.startsWith("@container") &&
        (("/" === e[10] && void 0 !== e[11]) ||
          ("s" === e[11] && void 0 !== e[16] && e.startsWith("-size/", 10)) ||
          ("n" === e[11] && void 0 !== e[18] && e.startsWith("-normal/", 10))),
      eR = (e) => e7(e, tt, eL),
      eW = (e) => eS.test(e),
      eG = (e) => e7(e, tr, eU),
      eK = (e) => e7(e, to, e$),
      eM = (e) => e7(e, ti, eQ),
      eZ = (e) => e7(e, tn, eL),
      eJ = (e) => e7(e, e8, eL),
      eH = (e) => e7(e, te, eV),
      eX = (e) => e7(e, ts, eI),
      eY = (e) => eC.test(e),
      e0 = (e) => e9(e, tr),
      e1 = (e) => e9(e, tn),
      e5 = (e) => e9(e, e8),
      e2 = (e) => e9(e, tt),
      e3 = (e) => e9(e, te),
      e4 = (e) => e9(e, ts, !0),
      e6 = (e) => e9(e, ti, !0),
      e7 = (e, t, r) => {
        let o = eS.exec(e);
        return !!o && (o[1] ? t(o[1]) : r(o[2]));
      },
      e9 = (e, t, r = !1) => {
        let o = eC.exec(e);
        return !!o && (o[1] ? t(o[1]) : r);
      },
      e8 = (e) => "position" === e || "percentage" === e,
      te = (e) => "image" === e || "url" === e,
      tt = (e) => "length" === e || "size" === e || "bg-size" === e,
      tr = (e) => "length" === e,
      to = (e) => "number" === e,
      tn = (e) => "family-name" === e,
      ti = (e) => "number" === e || "weight" === e,
      ts = (e) => "shadow" === e,
      ta = ((e, ...t) => {
        let r,
          o,
          n,
          i,
          s = (e) => {
            let t = o(e);
            if (t) return t;
            let i = ((e, t) => {
              let {
                  parseClassName: r,
                  getClassGroupId: o,
                  getConflictingClassGroupIds: n,
                  sortModifiers: i,
                  postfixLookupClassGroupIds: s,
                } = t,
                a = [],
                l = e.trim().split(ew),
                c = "";
              for (let e = l.length - 1; e >= 0; e -= 1) {
                let t,
                  d = l[e],
                  {
                    isExternal: u,
                    modifiers: m,
                    hasImportantModifier: p,
                    baseClassName: f,
                    maybePostfixModifierPosition: h,
                  } = r(d);
                if (u) {
                  c = d + (c.length > 0 ? " " + c : c);
                  continue;
                }
                let g = !!h;
                if (g) {
                  let e = (t = o(f.substring(0, h))) && s[t] ? o(f) : void 0;
                  e && e !== t && ((t = e), (g = !1));
                } else t = o(f);
                if (!t) {
                  if (!g || !(t = o(f))) {
                    c = d + (c.length > 0 ? " " + c : c);
                    continue;
                  }
                  g = !1;
                }
                let b =
                    0 === m.length
                      ? ""
                      : 1 === m.length
                        ? m[0]
                        : i(m).join(":"),
                  y = p ? b + "!" : b,
                  v = y + t;
                if (a.indexOf(v) > -1) continue;
                a.push(v);
                let w = n(t, g);
                for (let e = 0; e < w.length; ++e) {
                  let t = w[e];
                  a.push(y + t);
                }
                c = d + (c.length > 0 ? " " + c : c);
              }
              return c;
            })(e, r);
            return n(e, i), i;
          };
        return (
          (i = (a) => {
            var l;
            let c;
            return (
              (o = (r = {
                cache: ((e) => {
                  if (e < 1) return { get: () => void 0, set: () => {} };
                  let t = 0,
                    r = Object.create(null),
                    o = Object.create(null),
                    n = (n, i) => {
                      (r[n] = i),
                        ++t > e &&
                          ((t = 0), (o = r), (r = Object.create(null)));
                    };
                  return {
                    get(e) {
                      let t = r[e];
                      return void 0 !== t
                        ? t
                        : void 0 !== (t = o[e])
                          ? (n(e, t), t)
                          : void 0;
                    },
                    set(e, t) {
                      e in r ? (r[e] = t) : n(e, t);
                    },
                  };
                })((l = t.reduce((e, t) => t(e), e())).cacheSize),
                parseClassName: ((e) => {
                  let { prefix: t, experimentalParseClassName: r } = e,
                    o = (e) => {
                      let t,
                        r = [],
                        o = 0,
                        n = 0,
                        i = 0,
                        s = e.length;
                      for (let a = 0; a < s; a++) {
                        let s = e[a];
                        if (0 === o && 0 === n) {
                          if (":" === s) {
                            r.push(e.slice(i, a)), (i = a + 1);
                            continue;
                          }
                          if ("/" === s) {
                            t = a;
                            continue;
                          }
                        }
                        "[" === s
                          ? o++
                          : "]" === s
                            ? o--
                            : "(" === s
                              ? n++
                              : ")" === s && n--;
                      }
                      let a = 0 === r.length ? e : e.slice(i),
                        l = a,
                        c = !1;
                      return (
                        a.endsWith("!")
                          ? ((l = a.slice(0, -1)), (c = !0))
                          : a.startsWith("!") && ((l = a.slice(1)), (c = !0)),
                        ev(r, c, l, t && t > i ? t - i : void 0)
                      );
                    };
                  if (t) {
                    let e = t + ":",
                      r = o;
                    o = (t) =>
                      t.startsWith(e)
                        ? r(t.slice(e.length))
                        : ev(ey, !1, t, void 0, !0);
                  }
                  if (r) {
                    let e = o;
                    o = (t) => r({ className: t, parseClassName: e });
                  }
                  return o;
                })(l),
                sortModifiers:
                  ((c = new Map()),
                  l.orderSensitiveModifiers.forEach((e, t) => {
                    c.set(e, 1e6 + t);
                  }),
                  (e) => {
                    let t = [],
                      r = [];
                    for (let o = 0; o < e.length; o++) {
                      let n = e[o],
                        i = "[" === n[0],
                        s = c.has(n);
                      i || s
                        ? (r.length > 0 && (r.sort(), t.push(...r), (r = [])),
                          t.push(n))
                        : r.push(n);
                    }
                    return r.length > 0 && (r.sort(), t.push(...r)), t;
                  }),
                postfixLookupClassGroupIds: ((e) => {
                  let t = Object.create(null),
                    r = e.postfixLookupClassGroups;
                  if (r) for (let e = 0; e < r.length; e++) t[r[e]] = !0;
                  return t;
                })(l),
                ...((e) => {
                  let t = ((e) => {
                      let { theme: t, classGroups: r } = e;
                      return ed(r, t);
                    })(e),
                    {
                      conflictingClassGroups: r,
                      conflictingClassGroupModifiers: o,
                    } = e;
                  return {
                    getClassGroupId: (e) => {
                      if (e.startsWith("[") && e.endsWith("]")) {
                        var r;
                        let t, o, n;
                        return -1 === (r = e).slice(1, -1).indexOf(":")
                          ? void 0
                          : ((o = (t = r.slice(1, -1)).indexOf(":")),
                            (n = t.slice(0, o)) ? "arbitrary.." + n : void 0);
                      }
                      let o = e.split("-"),
                        n = +("" === o[0] && o.length > 1);
                      return ec(o, n, t);
                    },
                    getConflictingClassGroupIds: (e, t) => {
                      if (t) {
                        let t = o[e],
                          n = r[e];
                        if (t) {
                          if (n) {
                            let e = Array(n.length + t.length);
                            for (let t = 0; t < n.length; t++) e[t] = n[t];
                            for (let r = 0; r < t.length; r++)
                              e[n.length + r] = t[r];
                            return e;
                          }
                          return t;
                        }
                        return n || el;
                      }
                      return r[e] || el;
                    },
                  };
                })(l),
              }).cache.get),
              (n = r.cache.set),
              (i = s),
              s(a)
            );
          }),
          (...e) =>
            i(
              ((...e) => {
                let t,
                  r,
                  o = 0,
                  n = "";
                for (; o < e.length; )
                  (t = e[o++]) && (r = ex(t)) && (n && (n += " "), (n += r));
                return n;
              })(...e),
            )
        );
      })(() => {
        let e = ez("color"),
          t = ez("font"),
          r = ez("text"),
          o = ez("font-weight"),
          n = ez("tracking"),
          i = ez("leading"),
          s = ez("breakpoint"),
          a = ez("container"),
          l = ez("spacing"),
          c = ez("radius"),
          d = ez("shadow"),
          u = ez("inset-shadow"),
          m = ez("text-shadow"),
          p = ez("drop-shadow"),
          f = ez("blur"),
          h = ez("perspective"),
          g = ez("aspect"),
          b = ez("ease"),
          y = ez("animate"),
          v = () => [
            "auto",
            "avoid",
            "all",
            "avoid-page",
            "page",
            "left",
            "right",
            "column",
          ],
          w = () => [
            "center",
            "top",
            "bottom",
            "left",
            "right",
            "top-left",
            "left-top",
            "top-right",
            "right-top",
            "bottom-right",
            "right-bottom",
            "bottom-left",
            "left-bottom",
          ],
          x = () => [...w(), eY, eW],
          k = () => ["auto", "hidden", "clip", "visible", "scroll"],
          z = () => ["auto", "contain", "none"],
          S = () => [eY, eW, l],
          C = () => [eA, "full", "auto", ...S()],
          N = () => [eO, "none", "subgrid", eY, eW],
          T = () => ["auto", { span: ["full", eO, eY, eW] }, eO, eY, eW],
          q = () => [eO, "auto", eY, eW],
          P = () => ["auto", "min", "max", "fr", eY, eW],
          j = () => [
            "start",
            "end",
            "center",
            "between",
            "around",
            "evenly",
            "stretch",
            "baseline",
            "center-safe",
            "end-safe",
          ],
          D = () => [
            "start",
            "end",
            "center",
            "stretch",
            "center-safe",
            "end-safe",
          ],
          A = () => ["auto", ...S()],
          $ = () => [
            eA,
            "auto",
            "full",
            "dvw",
            "dvh",
            "lvw",
            "lvh",
            "svw",
            "svh",
            "min",
            "max",
            "fit",
            ...S(),
          ],
          O = () => [
            eA,
            "screen",
            "full",
            "dvw",
            "lvw",
            "svw",
            "min",
            "max",
            "fit",
            ...S(),
          ],
          F = () => [
            eA,
            "screen",
            "full",
            "lh",
            "dvh",
            "lvh",
            "svh",
            "min",
            "max",
            "fit",
            ...S(),
          ],
          _ = () => [e, eY, eW],
          Q = () => [...w(), e5, eJ, { position: [eY, eW] }],
          U = () => ["no-repeat", { repeat: ["", "x", "y", "space", "round"] }],
          L = () => ["auto", "cover", "contain", e2, eR, { size: [eY, eW] }],
          I = () => [eF, e0, eG],
          V = () => ["", "none", "full", c, eY, eW],
          E = () => ["", e$, e0, eG],
          B = () => ["solid", "dashed", "dotted", "double"],
          R = () => [
            "normal",
            "multiply",
            "screen",
            "overlay",
            "darken",
            "lighten",
            "color-dodge",
            "color-burn",
            "hard-light",
            "soft-light",
            "difference",
            "exclusion",
            "hue",
            "saturation",
            "color",
            "luminosity",
          ],
          W = () => [e$, eF, e5, eJ],
          G = () => ["", "none", f, eY, eW],
          K = () => ["none", e$, eY, eW],
          M = () => ["none", e$, eY, eW],
          Z = () => [e$, eY, eW],
          J = () => [eA, "full", ...S()];
        return {
          cacheSize: 500,
          theme: {
            animate: ["spin", "ping", "pulse", "bounce"],
            aspect: ["video"],
            blur: [e_],
            breakpoint: [e_],
            color: [eQ],
            container: [e_],
            "drop-shadow": [e_],
            ease: ["in", "out", "in-out"],
            font: [eE],
            "font-weight": [
              "thin",
              "extralight",
              "light",
              "normal",
              "medium",
              "semibold",
              "bold",
              "extrabold",
              "black",
            ],
            "inset-shadow": [e_],
            leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
            perspective: [
              "dramatic",
              "near",
              "normal",
              "midrange",
              "distant",
              "none",
            ],
            radius: [e_],
            shadow: [e_],
            spacing: ["px", e$],
            text: [e_],
            "text-shadow": [e_],
            tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
          },
          classGroups: {
            aspect: [{ aspect: ["auto", "square", eA, eW, eY, g] }],
            container: ["container"],
            "container-type": [
              { "@container": ["", "normal", "size", eY, eW] },
            ],
            "container-named": [eB],
            columns: [{ columns: [e$, eW, eY, a] }],
            "break-after": [{ "break-after": v() }],
            "break-before": [{ "break-before": v() }],
            "break-inside": [
              {
                "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"],
              },
            ],
            "box-decoration": [{ "box-decoration": ["slice", "clone"] }],
            box: [{ box: ["border", "content"] }],
            display: [
              "block",
              "inline-block",
              "inline",
              "flex",
              "inline-flex",
              "table",
              "inline-table",
              "table-caption",
              "table-cell",
              "table-column",
              "table-column-group",
              "table-footer-group",
              "table-header-group",
              "table-row-group",
              "table-row",
              "flow-root",
              "grid",
              "inline-grid",
              "contents",
              "list-item",
              "hidden",
            ],
            sr: ["sr-only", "not-sr-only"],
            float: [{ float: ["right", "left", "none", "start", "end"] }],
            clear: [
              { clear: ["left", "right", "both", "none", "start", "end"] },
            ],
            isolation: ["isolate", "isolation-auto"],
            "object-fit": [
              { object: ["contain", "cover", "fill", "none", "scale-down"] },
            ],
            "object-position": [{ object: x() }],
            overflow: [{ overflow: k() }],
            "overflow-x": [{ "overflow-x": k() }],
            "overflow-y": [{ "overflow-y": k() }],
            overscroll: [{ overscroll: z() }],
            "overscroll-x": [{ "overscroll-x": z() }],
            "overscroll-y": [{ "overscroll-y": z() }],
            position: ["static", "fixed", "absolute", "relative", "sticky"],
            inset: [{ inset: C() }],
            "inset-x": [{ "inset-x": C() }],
            "inset-y": [{ "inset-y": C() }],
            start: [{ "inset-s": C(), start: C() }],
            end: [{ "inset-e": C(), end: C() }],
            "inset-bs": [{ "inset-bs": C() }],
            "inset-be": [{ "inset-be": C() }],
            top: [{ top: C() }],
            right: [{ right: C() }],
            bottom: [{ bottom: C() }],
            left: [{ left: C() }],
            visibility: ["visible", "invisible", "collapse"],
            z: [{ z: [eO, "auto", eY, eW] }],
            basis: [{ basis: [eA, "full", "auto", a, ...S()] }],
            "flex-direction": [
              { flex: ["row", "row-reverse", "col", "col-reverse"] },
            ],
            "flex-wrap": [{ flex: ["nowrap", "wrap", "wrap-reverse"] }],
            flex: [{ flex: [e$, eA, "auto", "initial", "none", eW] }],
            grow: [{ grow: ["", e$, eY, eW] }],
            shrink: [{ shrink: ["", e$, eY, eW] }],
            order: [{ order: [eO, "first", "last", "none", eY, eW] }],
            "grid-cols": [{ "grid-cols": N() }],
            "col-start-end": [{ col: T() }],
            "col-start": [{ "col-start": q() }],
            "col-end": [{ "col-end": q() }],
            "grid-rows": [{ "grid-rows": N() }],
            "row-start-end": [{ row: T() }],
            "row-start": [{ "row-start": q() }],
            "row-end": [{ "row-end": q() }],
            "grid-flow": [
              {
                "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"],
              },
            ],
            "auto-cols": [{ "auto-cols": P() }],
            "auto-rows": [{ "auto-rows": P() }],
            gap: [{ gap: S() }],
            "gap-x": [{ "gap-x": S() }],
            "gap-y": [{ "gap-y": S() }],
            "justify-content": [{ justify: [...j(), "normal"] }],
            "justify-items": [{ "justify-items": [...D(), "normal"] }],
            "justify-self": [{ "justify-self": ["auto", ...D()] }],
            "align-content": [{ content: ["normal", ...j()] }],
            "align-items": [{ items: [...D(), { baseline: ["", "last"] }] }],
            "align-self": [
              { self: ["auto", ...D(), { baseline: ["", "last"] }] },
            ],
            "place-content": [{ "place-content": j() }],
            "place-items": [{ "place-items": [...D(), "baseline"] }],
            "place-self": [{ "place-self": ["auto", ...D()] }],
            p: [{ p: S() }],
            px: [{ px: S() }],
            py: [{ py: S() }],
            ps: [{ ps: S() }],
            pe: [{ pe: S() }],
            pbs: [{ pbs: S() }],
            pbe: [{ pbe: S() }],
            pt: [{ pt: S() }],
            pr: [{ pr: S() }],
            pb: [{ pb: S() }],
            pl: [{ pl: S() }],
            m: [{ m: A() }],
            mx: [{ mx: A() }],
            my: [{ my: A() }],
            ms: [{ ms: A() }],
            me: [{ me: A() }],
            mbs: [{ mbs: A() }],
            mbe: [{ mbe: A() }],
            mt: [{ mt: A() }],
            mr: [{ mr: A() }],
            mb: [{ mb: A() }],
            ml: [{ ml: A() }],
            "space-x": [{ "space-x": S() }],
            "space-x-reverse": ["space-x-reverse"],
            "space-y": [{ "space-y": S() }],
            "space-y-reverse": ["space-y-reverse"],
            size: [{ size: $() }],
            "inline-size": [{ inline: ["auto", ...O()] }],
            "min-inline-size": [{ "min-inline": ["auto", ...O()] }],
            "max-inline-size": [{ "max-inline": ["none", ...O()] }],
            "block-size": [{ block: ["auto", ...F()] }],
            "min-block-size": [{ "min-block": ["auto", ...F()] }],
            "max-block-size": [{ "max-block": ["none", ...F()] }],
            w: [{ w: [a, "screen", ...$()] }],
            "min-w": [{ "min-w": [a, "screen", "none", ...$()] }],
            "max-w": [
              {
                "max-w": [
                  a,
                  "screen",
                  "none",
                  "prose",
                  { screen: [s] },
                  ...$(),
                ],
              },
            ],
            h: [{ h: ["screen", "lh", ...$()] }],
            "min-h": [{ "min-h": ["screen", "lh", "none", ...$()] }],
            "max-h": [{ "max-h": ["screen", "lh", ...$()] }],
            "font-size": [{ text: ["base", r, e0, eG] }],
            "font-smoothing": ["antialiased", "subpixel-antialiased"],
            "font-style": ["italic", "not-italic"],
            "font-weight": [{ font: [o, e6, eM] }],
            "font-stretch": [
              {
                "font-stretch": [
                  "ultra-condensed",
                  "extra-condensed",
                  "condensed",
                  "semi-condensed",
                  "normal",
                  "semi-expanded",
                  "expanded",
                  "extra-expanded",
                  "ultra-expanded",
                  eF,
                  eW,
                ],
              },
            ],
            "font-family": [{ font: [e1, eZ, t] }],
            "font-features": [{ "font-features": [eW] }],
            "fvn-normal": ["normal-nums"],
            "fvn-ordinal": ["ordinal"],
            "fvn-slashed-zero": ["slashed-zero"],
            "fvn-figure": ["lining-nums", "oldstyle-nums"],
            "fvn-spacing": ["proportional-nums", "tabular-nums"],
            "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
            tracking: [{ tracking: [n, eY, eW] }],
            "line-clamp": [{ "line-clamp": [e$, "none", eY, eK] }],
            leading: [{ leading: [i, ...S()] }],
            "list-image": [{ "list-image": ["none", eY, eW] }],
            "list-style-position": [{ list: ["inside", "outside"] }],
            "list-style-type": [{ list: ["disc", "decimal", "none", eY, eW] }],
            "text-alignment": [
              { text: ["left", "center", "right", "justify", "start", "end"] },
            ],
            "placeholder-color": [{ placeholder: _() }],
            "text-color": [{ text: _() }],
            "text-decoration": [
              "underline",
              "overline",
              "line-through",
              "no-underline",
            ],
            "text-decoration-style": [{ decoration: [...B(), "wavy"] }],
            "text-decoration-thickness": [
              { decoration: [e$, "from-font", "auto", eY, eG] },
            ],
            "text-decoration-color": [{ decoration: _() }],
            "underline-offset": [{ "underline-offset": [e$, "auto", eY, eW] }],
            "text-transform": [
              "uppercase",
              "lowercase",
              "capitalize",
              "normal-case",
            ],
            "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
            "text-wrap": [{ text: ["wrap", "nowrap", "balance", "pretty"] }],
            indent: [{ indent: S() }],
            "tab-size": [{ tab: [eO, eY, eW] }],
            "vertical-align": [
              {
                align: [
                  "baseline",
                  "top",
                  "middle",
                  "bottom",
                  "text-top",
                  "text-bottom",
                  "sub",
                  "super",
                  eY,
                  eW,
                ],
              },
            ],
            whitespace: [
              {
                whitespace: [
                  "normal",
                  "nowrap",
                  "pre",
                  "pre-line",
                  "pre-wrap",
                  "break-spaces",
                ],
              },
            ],
            break: [{ break: ["normal", "words", "all", "keep"] }],
            wrap: [{ wrap: ["break-word", "anywhere", "normal"] }],
            hyphens: [{ hyphens: ["none", "manual", "auto"] }],
            content: [{ content: ["none", eY, eW] }],
            "bg-attachment": [{ bg: ["fixed", "local", "scroll"] }],
            "bg-clip": [
              { "bg-clip": ["border", "padding", "content", "text"] },
            ],
            "bg-origin": [{ "bg-origin": ["border", "padding", "content"] }],
            "bg-position": [{ bg: Q() }],
            "bg-repeat": [{ bg: U() }],
            "bg-size": [{ bg: L() }],
            "bg-image": [
              {
                bg: [
                  "none",
                  {
                    linear: [
                      { to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"] },
                      eO,
                      eY,
                      eW,
                    ],
                    radial: ["", eY, eW],
                    conic: [eO, eY, eW],
                  },
                  e3,
                  eH,
                ],
              },
            ],
            "bg-color": [{ bg: _() }],
            "gradient-from-pos": [{ from: I() }],
            "gradient-via-pos": [{ via: I() }],
            "gradient-to-pos": [{ to: I() }],
            "gradient-from": [{ from: _() }],
            "gradient-via": [{ via: _() }],
            "gradient-to": [{ to: _() }],
            rounded: [{ rounded: V() }],
            "rounded-s": [{ "rounded-s": V() }],
            "rounded-e": [{ "rounded-e": V() }],
            "rounded-t": [{ "rounded-t": V() }],
            "rounded-r": [{ "rounded-r": V() }],
            "rounded-b": [{ "rounded-b": V() }],
            "rounded-l": [{ "rounded-l": V() }],
            "rounded-ss": [{ "rounded-ss": V() }],
            "rounded-se": [{ "rounded-se": V() }],
            "rounded-ee": [{ "rounded-ee": V() }],
            "rounded-es": [{ "rounded-es": V() }],
            "rounded-tl": [{ "rounded-tl": V() }],
            "rounded-tr": [{ "rounded-tr": V() }],
            "rounded-br": [{ "rounded-br": V() }],
            "rounded-bl": [{ "rounded-bl": V() }],
            "border-w": [{ border: E() }],
            "border-w-x": [{ "border-x": E() }],
            "border-w-y": [{ "border-y": E() }],
            "border-w-s": [{ "border-s": E() }],
            "border-w-e": [{ "border-e": E() }],
            "border-w-bs": [{ "border-bs": E() }],
            "border-w-be": [{ "border-be": E() }],
            "border-w-t": [{ "border-t": E() }],
            "border-w-r": [{ "border-r": E() }],
            "border-w-b": [{ "border-b": E() }],
            "border-w-l": [{ "border-l": E() }],
            "divide-x": [{ "divide-x": E() }],
            "divide-x-reverse": ["divide-x-reverse"],
            "divide-y": [{ "divide-y": E() }],
            "divide-y-reverse": ["divide-y-reverse"],
            "border-style": [{ border: [...B(), "hidden", "none"] }],
            "divide-style": [{ divide: [...B(), "hidden", "none"] }],
            "border-color": [{ border: _() }],
            "border-color-x": [{ "border-x": _() }],
            "border-color-y": [{ "border-y": _() }],
            "border-color-s": [{ "border-s": _() }],
            "border-color-e": [{ "border-e": _() }],
            "border-color-bs": [{ "border-bs": _() }],
            "border-color-be": [{ "border-be": _() }],
            "border-color-t": [{ "border-t": _() }],
            "border-color-r": [{ "border-r": _() }],
            "border-color-b": [{ "border-b": _() }],
            "border-color-l": [{ "border-l": _() }],
            "divide-color": [{ divide: _() }],
            "outline-style": [{ outline: [...B(), "none", "hidden"] }],
            "outline-offset": [{ "outline-offset": [e$, eY, eW] }],
            "outline-w": [{ outline: ["", e$, e0, eG] }],
            "outline-color": [{ outline: _() }],
            shadow: [{ shadow: ["", "none", d, e4, eX] }],
            "shadow-color": [{ shadow: _() }],
            "inset-shadow": [{ "inset-shadow": ["none", u, e4, eX] }],
            "inset-shadow-color": [{ "inset-shadow": _() }],
            "ring-w": [{ ring: E() }],
            "ring-w-inset": ["ring-inset"],
            "ring-color": [{ ring: _() }],
            "ring-offset-w": [{ "ring-offset": [e$, eG] }],
            "ring-offset-color": [{ "ring-offset": _() }],
            "inset-ring-w": [{ "inset-ring": E() }],
            "inset-ring-color": [{ "inset-ring": _() }],
            "text-shadow": [{ "text-shadow": ["none", m, e4, eX] }],
            "text-shadow-color": [{ "text-shadow": _() }],
            opacity: [{ opacity: [e$, eY, eW] }],
            "mix-blend": [
              { "mix-blend": [...R(), "plus-darker", "plus-lighter"] },
            ],
            "bg-blend": [{ "bg-blend": R() }],
            "mask-clip": [
              {
                "mask-clip": [
                  "border",
                  "padding",
                  "content",
                  "fill",
                  "stroke",
                  "view",
                ],
              },
              "mask-no-clip",
            ],
            "mask-composite": [
              { mask: ["add", "subtract", "intersect", "exclude"] },
            ],
            "mask-image-linear-pos": [{ "mask-linear": [e$] }],
            "mask-image-linear-from-pos": [{ "mask-linear-from": W() }],
            "mask-image-linear-to-pos": [{ "mask-linear-to": W() }],
            "mask-image-linear-from-color": [{ "mask-linear-from": _() }],
            "mask-image-linear-to-color": [{ "mask-linear-to": _() }],
            "mask-image-t-from-pos": [{ "mask-t-from": W() }],
            "mask-image-t-to-pos": [{ "mask-t-to": W() }],
            "mask-image-t-from-color": [{ "mask-t-from": _() }],
            "mask-image-t-to-color": [{ "mask-t-to": _() }],
            "mask-image-r-from-pos": [{ "mask-r-from": W() }],
            "mask-image-r-to-pos": [{ "mask-r-to": W() }],
            "mask-image-r-from-color": [{ "mask-r-from": _() }],
            "mask-image-r-to-color": [{ "mask-r-to": _() }],
            "mask-image-b-from-pos": [{ "mask-b-from": W() }],
            "mask-image-b-to-pos": [{ "mask-b-to": W() }],
            "mask-image-b-from-color": [{ "mask-b-from": _() }],
            "mask-image-b-to-color": [{ "mask-b-to": _() }],
            "mask-image-l-from-pos": [{ "mask-l-from": W() }],
            "mask-image-l-to-pos": [{ "mask-l-to": W() }],
            "mask-image-l-from-color": [{ "mask-l-from": _() }],
            "mask-image-l-to-color": [{ "mask-l-to": _() }],
            "mask-image-x-from-pos": [{ "mask-x-from": W() }],
            "mask-image-x-to-pos": [{ "mask-x-to": W() }],
            "mask-image-x-from-color": [{ "mask-x-from": _() }],
            "mask-image-x-to-color": [{ "mask-x-to": _() }],
            "mask-image-y-from-pos": [{ "mask-y-from": W() }],
            "mask-image-y-to-pos": [{ "mask-y-to": W() }],
            "mask-image-y-from-color": [{ "mask-y-from": _() }],
            "mask-image-y-to-color": [{ "mask-y-to": _() }],
            "mask-image-radial": [{ "mask-radial": [eY, eW] }],
            "mask-image-radial-from-pos": [{ "mask-radial-from": W() }],
            "mask-image-radial-to-pos": [{ "mask-radial-to": W() }],
            "mask-image-radial-from-color": [{ "mask-radial-from": _() }],
            "mask-image-radial-to-color": [{ "mask-radial-to": _() }],
            "mask-image-radial-shape": [
              { "mask-radial": ["circle", "ellipse"] },
            ],
            "mask-image-radial-size": [
              {
                "mask-radial": [
                  { closest: ["side", "corner"], farthest: ["side", "corner"] },
                ],
              },
            ],
            "mask-image-radial-pos": [{ "mask-radial-at": w() }],
            "mask-image-conic-pos": [{ "mask-conic": [e$] }],
            "mask-image-conic-from-pos": [{ "mask-conic-from": W() }],
            "mask-image-conic-to-pos": [{ "mask-conic-to": W() }],
            "mask-image-conic-from-color": [{ "mask-conic-from": _() }],
            "mask-image-conic-to-color": [{ "mask-conic-to": _() }],
            "mask-mode": [{ mask: ["alpha", "luminance", "match"] }],
            "mask-origin": [
              {
                "mask-origin": [
                  "border",
                  "padding",
                  "content",
                  "fill",
                  "stroke",
                  "view",
                ],
              },
            ],
            "mask-position": [{ mask: Q() }],
            "mask-repeat": [{ mask: U() }],
            "mask-size": [{ mask: L() }],
            "mask-type": [{ "mask-type": ["alpha", "luminance"] }],
            "mask-image": [{ mask: ["none", eY, eW] }],
            filter: [{ filter: ["", "none", eY, eW] }],
            blur: [{ blur: G() }],
            brightness: [{ brightness: [e$, eY, eW] }],
            contrast: [{ contrast: [e$, eY, eW] }],
            "drop-shadow": [{ "drop-shadow": ["", "none", p, e4, eX] }],
            "drop-shadow-color": [{ "drop-shadow": _() }],
            grayscale: [{ grayscale: ["", e$, eY, eW] }],
            "hue-rotate": [{ "hue-rotate": [e$, eY, eW] }],
            invert: [{ invert: ["", e$, eY, eW] }],
            saturate: [{ saturate: [e$, eY, eW] }],
            sepia: [{ sepia: ["", e$, eY, eW] }],
            "backdrop-filter": [{ "backdrop-filter": ["", "none", eY, eW] }],
            "backdrop-blur": [{ "backdrop-blur": G() }],
            "backdrop-brightness": [{ "backdrop-brightness": [e$, eY, eW] }],
            "backdrop-contrast": [{ "backdrop-contrast": [e$, eY, eW] }],
            "backdrop-grayscale": [{ "backdrop-grayscale": ["", e$, eY, eW] }],
            "backdrop-hue-rotate": [{ "backdrop-hue-rotate": [e$, eY, eW] }],
            "backdrop-invert": [{ "backdrop-invert": ["", e$, eY, eW] }],
            "backdrop-opacity": [{ "backdrop-opacity": [e$, eY, eW] }],
            "backdrop-saturate": [{ "backdrop-saturate": [e$, eY, eW] }],
            "backdrop-sepia": [{ "backdrop-sepia": ["", e$, eY, eW] }],
            "border-collapse": [{ border: ["collapse", "separate"] }],
            "border-spacing": [{ "border-spacing": S() }],
            "border-spacing-x": [{ "border-spacing-x": S() }],
            "border-spacing-y": [{ "border-spacing-y": S() }],
            "table-layout": [{ table: ["auto", "fixed"] }],
            caption: [{ caption: ["top", "bottom"] }],
            transition: [
              {
                transition: [
                  "",
                  "all",
                  "colors",
                  "opacity",
                  "shadow",
                  "transform",
                  "none",
                  eY,
                  eW,
                ],
              },
            ],
            "transition-behavior": [{ transition: ["normal", "discrete"] }],
            duration: [{ duration: [e$, "initial", eY, eW] }],
            ease: [{ ease: ["linear", "initial", b, eY, eW] }],
            delay: [{ delay: [e$, eY, eW] }],
            animate: [{ animate: ["none", y, eY, eW] }],
            backface: [{ backface: ["hidden", "visible"] }],
            perspective: [{ perspective: [h, eY, eW] }],
            "perspective-origin": [{ "perspective-origin": x() }],
            rotate: [{ rotate: K() }],
            "rotate-x": [{ "rotate-x": K() }],
            "rotate-y": [{ "rotate-y": K() }],
            "rotate-z": [{ "rotate-z": K() }],
            scale: [{ scale: M() }],
            "scale-x": [{ "scale-x": M() }],
            "scale-y": [{ "scale-y": M() }],
            "scale-z": [{ "scale-z": M() }],
            "scale-3d": ["scale-3d"],
            skew: [{ skew: Z() }],
            "skew-x": [{ "skew-x": Z() }],
            "skew-y": [{ "skew-y": Z() }],
            transform: [{ transform: [eY, eW, "", "none", "gpu", "cpu"] }],
            "transform-origin": [{ origin: x() }],
            "transform-style": [{ transform: ["3d", "flat"] }],
            translate: [{ translate: J() }],
            "translate-x": [{ "translate-x": J() }],
            "translate-y": [{ "translate-y": J() }],
            "translate-z": [{ "translate-z": J() }],
            "translate-none": ["translate-none"],
            zoom: [{ zoom: [eO, eY, eW] }],
            accent: [{ accent: _() }],
            appearance: [{ appearance: ["none", "auto"] }],
            "caret-color": [{ caret: _() }],
            "color-scheme": [
              {
                scheme: [
                  "normal",
                  "dark",
                  "light",
                  "light-dark",
                  "only-dark",
                  "only-light",
                ],
              },
            ],
            cursor: [
              {
                cursor: [
                  "auto",
                  "default",
                  "pointer",
                  "wait",
                  "text",
                  "move",
                  "help",
                  "not-allowed",
                  "none",
                  "context-menu",
                  "progress",
                  "cell",
                  "crosshair",
                  "vertical-text",
                  "alias",
                  "copy",
                  "no-drop",
                  "grab",
                  "grabbing",
                  "all-scroll",
                  "col-resize",
                  "row-resize",
                  "n-resize",
                  "e-resize",
                  "s-resize",
                  "w-resize",
                  "ne-resize",
                  "nw-resize",
                  "se-resize",
                  "sw-resize",
                  "ew-resize",
                  "ns-resize",
                  "nesw-resize",
                  "nwse-resize",
                  "zoom-in",
                  "zoom-out",
                  eY,
                  eW,
                ],
              },
            ],
            "field-sizing": [{ "field-sizing": ["fixed", "content"] }],
            "pointer-events": [{ "pointer-events": ["auto", "none"] }],
            resize: [{ resize: ["none", "", "y", "x"] }],
            "scroll-behavior": [{ scroll: ["auto", "smooth"] }],
            "scrollbar-thumb-color": [{ "scrollbar-thumb": _() }],
            "scrollbar-track-color": [{ "scrollbar-track": _() }],
            "scrollbar-gutter": [
              { "scrollbar-gutter": ["auto", "stable", "both"] },
            ],
            "scrollbar-w": [{ scrollbar: ["auto", "thin", "none"] }],
            "scroll-m": [{ "scroll-m": S() }],
            "scroll-mx": [{ "scroll-mx": S() }],
            "scroll-my": [{ "scroll-my": S() }],
            "scroll-ms": [{ "scroll-ms": S() }],
            "scroll-me": [{ "scroll-me": S() }],
            "scroll-mbs": [{ "scroll-mbs": S() }],
            "scroll-mbe": [{ "scroll-mbe": S() }],
            "scroll-mt": [{ "scroll-mt": S() }],
            "scroll-mr": [{ "scroll-mr": S() }],
            "scroll-mb": [{ "scroll-mb": S() }],
            "scroll-ml": [{ "scroll-ml": S() }],
            "scroll-p": [{ "scroll-p": S() }],
            "scroll-px": [{ "scroll-px": S() }],
            "scroll-py": [{ "scroll-py": S() }],
            "scroll-ps": [{ "scroll-ps": S() }],
            "scroll-pe": [{ "scroll-pe": S() }],
            "scroll-pbs": [{ "scroll-pbs": S() }],
            "scroll-pbe": [{ "scroll-pbe": S() }],
            "scroll-pt": [{ "scroll-pt": S() }],
            "scroll-pr": [{ "scroll-pr": S() }],
            "scroll-pb": [{ "scroll-pb": S() }],
            "scroll-pl": [{ "scroll-pl": S() }],
            "snap-align": [{ snap: ["start", "end", "center", "align-none"] }],
            "snap-stop": [{ snap: ["normal", "always"] }],
            "snap-type": [{ snap: ["none", "x", "y", "both"] }],
            "snap-strictness": [{ snap: ["mandatory", "proximity"] }],
            touch: [{ touch: ["auto", "none", "manipulation"] }],
            "touch-x": [{ "touch-pan": ["x", "left", "right"] }],
            "touch-y": [{ "touch-pan": ["y", "up", "down"] }],
            "touch-pz": ["touch-pinch-zoom"],
            select: [{ select: ["none", "text", "all", "auto"] }],
            "will-change": [
              {
                "will-change": [
                  "auto",
                  "scroll",
                  "contents",
                  "transform",
                  eY,
                  eW,
                ],
              },
            ],
            fill: [{ fill: ["none", ..._()] }],
            "stroke-w": [{ stroke: [e$, e0, eG, eK] }],
            stroke: [{ stroke: ["none", ..._()] }],
            "forced-color-adjust": [
              { "forced-color-adjust": ["auto", "none"] },
            ],
          },
          conflictingClassGroups: {
            "container-named": ["container-type"],
            overflow: ["overflow-x", "overflow-y"],
            overscroll: ["overscroll-x", "overscroll-y"],
            inset: [
              "inset-x",
              "inset-y",
              "inset-bs",
              "inset-be",
              "start",
              "end",
              "top",
              "right",
              "bottom",
              "left",
            ],
            "inset-x": ["right", "left"],
            "inset-y": ["top", "bottom"],
            flex: ["basis", "grow", "shrink"],
            gap: ["gap-x", "gap-y"],
            p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
            px: ["pr", "pl"],
            py: ["pt", "pb"],
            m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
            mx: ["mr", "ml"],
            my: ["mt", "mb"],
            size: ["w", "h"],
            "font-size": ["leading"],
            "fvn-normal": [
              "fvn-ordinal",
              "fvn-slashed-zero",
              "fvn-figure",
              "fvn-spacing",
              "fvn-fraction",
            ],
            "fvn-ordinal": ["fvn-normal"],
            "fvn-slashed-zero": ["fvn-normal"],
            "fvn-figure": ["fvn-normal"],
            "fvn-spacing": ["fvn-normal"],
            "fvn-fraction": ["fvn-normal"],
            "line-clamp": ["display", "overflow"],
            rounded: [
              "rounded-s",
              "rounded-e",
              "rounded-t",
              "rounded-r",
              "rounded-b",
              "rounded-l",
              "rounded-ss",
              "rounded-se",
              "rounded-ee",
              "rounded-es",
              "rounded-tl",
              "rounded-tr",
              "rounded-br",
              "rounded-bl",
            ],
            "rounded-s": ["rounded-ss", "rounded-es"],
            "rounded-e": ["rounded-se", "rounded-ee"],
            "rounded-t": ["rounded-tl", "rounded-tr"],
            "rounded-r": ["rounded-tr", "rounded-br"],
            "rounded-b": ["rounded-br", "rounded-bl"],
            "rounded-l": ["rounded-tl", "rounded-bl"],
            "border-spacing": ["border-spacing-x", "border-spacing-y"],
            "border-w": [
              "border-w-x",
              "border-w-y",
              "border-w-s",
              "border-w-e",
              "border-w-bs",
              "border-w-be",
              "border-w-t",
              "border-w-r",
              "border-w-b",
              "border-w-l",
            ],
            "border-w-x": ["border-w-r", "border-w-l"],
            "border-w-y": ["border-w-t", "border-w-b"],
            "border-color": [
              "border-color-x",
              "border-color-y",
              "border-color-s",
              "border-color-e",
              "border-color-bs",
              "border-color-be",
              "border-color-t",
              "border-color-r",
              "border-color-b",
              "border-color-l",
            ],
            "border-color-x": ["border-color-r", "border-color-l"],
            "border-color-y": ["border-color-t", "border-color-b"],
            translate: ["translate-x", "translate-y", "translate-none"],
            "translate-none": [
              "translate",
              "translate-x",
              "translate-y",
              "translate-z",
            ],
            "scroll-m": [
              "scroll-mx",
              "scroll-my",
              "scroll-ms",
              "scroll-me",
              "scroll-mbs",
              "scroll-mbe",
              "scroll-mt",
              "scroll-mr",
              "scroll-mb",
              "scroll-ml",
            ],
            "scroll-mx": ["scroll-mr", "scroll-ml"],
            "scroll-my": ["scroll-mt", "scroll-mb"],
            "scroll-p": [
              "scroll-px",
              "scroll-py",
              "scroll-ps",
              "scroll-pe",
              "scroll-pbs",
              "scroll-pbe",
              "scroll-pt",
              "scroll-pr",
              "scroll-pb",
              "scroll-pl",
            ],
            "scroll-px": ["scroll-pr", "scroll-pl"],
            "scroll-py": ["scroll-pt", "scroll-pb"],
            touch: ["touch-x", "touch-y", "touch-pz"],
            "touch-x": ["touch"],
            "touch-y": ["touch"],
            "touch-pz": ["touch"],
          },
          conflictingClassGroupModifiers: { "font-size": ["leading"] },
          postfixLookupClassGroups: ["container-type"],
          orderSensitiveModifiers: [
            "*",
            "**",
            "after",
            "backdrop",
            "before",
            "details-content",
            "file",
            "first-letter",
            "first-line",
            "marker",
            "placeholder",
            "selection",
          ],
        };
      });
    es("created_at", { withTimezone: !0 }).notNull().defaultNow(),
      es("updated_at", { withTimezone: !0 })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      e.s(
        [
          "cn",
          0,
          function (...e) {
            return ta((0, n.clsx)(e));
          },
        ],
        75157,
      );
  },
  19455,
  (e) => {
    "use strict";
    var t = e.i(43476),
      r = e.i(932),
      o = e.i(25913),
      n = e.i(86011),
      i = e.i(75157);
    let s = (0, o.cva)(
      "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      {
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
      },
    );
    e.s([
      "Button",
      0,
      function (e) {
        let o,
          a,
          l,
          c,
          d,
          u,
          m,
          p = (0, r.c)(16);
        p[0] !== e
          ? (({ className: o, variant: l, size: c, asChild: d, ...a } = e),
            (p[0] = e),
            (p[1] = o),
            (p[2] = a),
            (p[3] = l),
            (p[4] = c),
            (p[5] = d))
          : ((o = p[1]), (a = p[2]), (l = p[3]), (c = p[4]), (d = p[5]));
        let f = void 0 === l ? "default" : l,
          h = void 0 === c ? "default" : c,
          g = void 0 !== d && d ? n.Slot.Root : "button";
        return (
          p[6] !== o || p[7] !== h || p[8] !== f
            ? ((u = (0, i.cn)(s({ variant: f, size: h, className: o }))),
              (p[6] = o),
              (p[7] = h),
              (p[8] = f),
              (p[9] = u))
            : (u = p[9]),
          p[10] !== g ||
          p[11] !== a ||
          p[12] !== h ||
          p[13] !== u ||
          p[14] !== f
            ? ((m = (0, t.jsx)(g, {
                "data-slot": "button",
                "data-variant": f,
                "data-size": h,
                className: u,
                ...a,
              })),
              (p[10] = g),
              (p[11] = a),
              (p[12] = h),
              (p[13] = u),
              (p[14] = f),
              (p[15] = m))
            : (m = p[15]),
          m
        );
      },
    ]);
  },
]);
