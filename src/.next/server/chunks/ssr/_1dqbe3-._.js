module.exports = [
  64831,
  (a) => {
    "use strict";
    var b = a.i(72131),
      c = a.i(58430);
    let d = (a) => {
      let b = a.replace(/^([A-Z])|[\s-_]+(\w)/g, (a, b, c) =>
        c ? c.toUpperCase() : b.toLowerCase(),
      );
      return b.charAt(0).toUpperCase() + b.slice(1);
    };
    var e = a.i(90864);
    a.s(
      [
        "default",
        0,
        (a, f) => {
          let g = (0, b.forwardRef)(({ className: g, ...h }, i) =>
            (0, b.createElement)(e.default, {
              ref: i,
              iconNode: f,
              className: (0, c.mergeClasses)(
                `lucide-${d(a)
                  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
                  .toLowerCase()}`,
                `lucide-${a}`,
                g,
              ),
              ...h,
            }),
          );
          return (g.displayName = d(a)), g;
        },
      ],
      64831,
    );
  },
  187,
  98621,
  70121,
  11011,
  (a) => {
    "use strict";
    function b() {
      for (var a, b, c = 0, d = "", e = arguments.length; c < e; c++)
        (a = arguments[c]) &&
          (b = (function a(b) {
            var c,
              d,
              e = "";
            if ("string" == typeof b || "number" == typeof b) e += b;
            else if ("object" == typeof b)
              if (Array.isArray(b)) {
                var f = b.length;
                for (c = 0; c < f; c++)
                  b[c] && (d = a(b[c])) && (e && (e += " "), (e += d));
              } else for (d in b) b[d] && (e && (e += " "), (e += d));
            return e;
          })(a)) &&
          (d && (d += " "), (d += b));
      return d;
    }
    a.s(["clsx", 0, b], 98621);
    let c = (a) => ("boolean" == typeof a ? `${a}` : 0 === a ? "0" : a);
    a.s(
      [
        "cva",
        0,
        (a, d) => (e) => {
          var f;
          if ((null == d ? void 0 : d.variants) == null)
            return b(
              a,
              null == e ? void 0 : e.class,
              null == e ? void 0 : e.className,
            );
          let { variants: g, defaultVariants: h } = d,
            i = Object.keys(g).map((a) => {
              let b = null == e ? void 0 : e[a],
                d = null == h ? void 0 : h[a];
              if (null === b) return null;
              let f = c(b) || c(d);
              return g[a][f];
            }),
            j =
              e &&
              Object.entries(e).reduce((a, b) => {
                let [c, d] = b;
                return void 0 === d || (a[c] = d), a;
              }, {});
          return b(
            a,
            i,
            null == d || null == (f = d.compoundVariants)
              ? void 0
              : f.reduce((a, b) => {
                  let { class: c, className: d, ...e } = b;
                  return Object.entries(e).every((a) => {
                    let [b, c] = a;
                    return Array.isArray(c)
                      ? c.includes({ ...h, ...j }[b])
                      : { ...h, ...j }[b] === c;
                  })
                    ? [...a, c, d]
                    : a;
                }, []),
            null == e ? void 0 : e.class,
            null == e ? void 0 : e.className,
          );
        },
      ],
      187,
    );
    var d = a.i(72131);
    function e(a, b) {
      if ("function" == typeof a) return a(b);
      null != a && (a.current = b);
    }
    function f(...a) {
      return (b) => {
        let c = !1,
          d = a.map((a) => {
            let d = e(a, b);
            return c || "function" != typeof d || (c = !0), d;
          });
        if (c)
          return () => {
            for (let b = 0; b < d.length; b++) {
              let c = d[b];
              "function" == typeof c ? c() : e(a[b], null);
            }
          };
      };
    }
    a.s(
      [
        "composeRefs",
        0,
        f,
        "useComposedRefs",
        0,
        function (...a) {
          return d.useCallback(f(...a), a);
        },
      ],
      70121,
    );
    var g = a.i(87924);
    function h(a) {
      var b;
      let c,
        e =
          ((b = a),
          ((c = d.forwardRef((a, b) => {
            let { children: c, ...e } = a;
            if (d.isValidElement(c)) {
              var g;
              let a,
                h,
                i =
                  ((g = c),
                  (h =
                    (a = Object.getOwnPropertyDescriptor(
                      g.props,
                      "ref",
                    )?.get) &&
                    "isReactWarning" in a &&
                    a.isReactWarning)
                    ? g.ref
                    : (h =
                          (a = Object.getOwnPropertyDescriptor(
                            g,
                            "ref",
                          )?.get) &&
                          "isReactWarning" in a &&
                          a.isReactWarning)
                      ? g.props.ref
                      : g.props.ref || g.ref),
                j = (function (a, b) {
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
                })(e, c.props);
              return (
                c.type !== d.Fragment && (j.ref = b ? f(b, i) : i),
                d.cloneElement(c, j)
              );
            }
            return d.Children.count(c) > 1 ? d.Children.only(null) : null;
          })).displayName = `${b}.SlotClone`),
          c),
        h = d.forwardRef((a, b) => {
          let { children: c, ...f } = a,
            h = d.Children.toArray(c),
            i = h.find(m);
          if (i) {
            let a = i.props.children,
              c = h.map((b) =>
                b !== i
                  ? b
                  : d.Children.count(a) > 1
                    ? d.Children.only(null)
                    : d.isValidElement(a)
                      ? a.props.children
                      : null,
              );
            return (0, g.jsx)(e, {
              ...f,
              ref: b,
              children: d.isValidElement(a)
                ? d.cloneElement(a, void 0, c)
                : null,
            });
          }
          return (0, g.jsx)(e, { ...f, ref: b, children: c });
        });
      return (h.displayName = `${a}.Slot`), h;
    }
    var i = h("Slot"),
      j = Symbol("radix.slottable");
    function k(a) {
      let b = ({ children: a }) => (0, g.jsx)(g.Fragment, { children: a });
      return (b.displayName = `${a}.Slottable`), (b.__radixId = j), b;
    }
    var l = k("Slottable");
    function m(a) {
      return (
        d.isValidElement(a) &&
        "function" == typeof a.type &&
        "__radixId" in a.type &&
        a.type.__radixId === j
      );
    }
    a.s(
      [
        "Root",
        0,
        i,
        "Slot",
        0,
        i,
        "Slottable",
        0,
        l,
        "createSlot",
        0,
        h,
        "createSlottable",
        0,
        k,
      ],
      11011,
    );
  },
  76306,
  (a) => {
    "use strict";
    var b = a.i(11011);
    a.s(["Slot", 0, b]);
  },
  68114,
  (a) => {
    "use strict";
    let b, c;
    var d,
      e = a.i(98621);
    let f = Symbol.for("drizzle:entityKind");
    function g(a, b) {
      if (!a || "object" != typeof a) return !1;
      if (a instanceof b) return !0;
      if (!Object.prototype.hasOwnProperty.call(b, f))
        throw Error(
          `Class "${b.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`,
        );
      let c = Object.getPrototypeOf(a).constructor;
      if (c)
        for (; c; ) {
          if (f in c && c[f] === b[f]) return !0;
          c = Object.getPrototypeOf(c);
        }
      return !1;
    }
    Symbol.for("drizzle:hasOwnEntityKind");
    class h {
      constructor(a, b) {
        (this.table = a),
          (this.config = b),
          (this.name = b.name),
          (this.keyAsName = b.keyAsName),
          (this.notNull = b.notNull),
          (this.default = b.default),
          (this.defaultFn = b.defaultFn),
          (this.onUpdateFn = b.onUpdateFn),
          (this.hasDefault = b.hasDefault),
          (this.primary = b.primaryKey),
          (this.isUnique = b.isUnique),
          (this.uniqueName = b.uniqueName),
          (this.uniqueType = b.uniqueType),
          (this.dataType = b.dataType),
          (this.columnType = b.columnType),
          (this.generated = b.generated),
          (this.generatedIdentity = b.generatedIdentity);
      }
      static [f] = "Column";
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
      mapFromDriverValue(a) {
        return a;
      }
      mapToDriverValue(a) {
        return a;
      }
      shouldDisableInsert() {
        return (
          void 0 !== this.config.generated &&
          "byDefault" !== this.config.generated.type
        );
      }
    }
    class i {
      static [f] = "ColumnBuilder";
      config;
      constructor(a, b, c) {
        this.config = {
          name: a,
          keyAsName: "" === a,
          notNull: !1,
          default: void 0,
          hasDefault: !1,
          primaryKey: !1,
          isUnique: !1,
          uniqueName: void 0,
          uniqueType: void 0,
          dataType: b,
          columnType: c,
          generated: void 0,
        };
      }
      $type() {
        return this;
      }
      notNull() {
        return (this.config.notNull = !0), this;
      }
      default(a) {
        return (this.config.default = a), (this.config.hasDefault = !0), this;
      }
      $defaultFn(a) {
        return (this.config.defaultFn = a), (this.config.hasDefault = !0), this;
      }
      $default = this.$defaultFn;
      $onUpdateFn(a) {
        return (
          (this.config.onUpdateFn = a), (this.config.hasDefault = !0), this
        );
      }
      $onUpdate = this.$onUpdateFn;
      primaryKey() {
        return (this.config.primaryKey = !0), (this.config.notNull = !0), this;
      }
      setName(a) {
        "" === this.config.name && (this.config.name = a);
      }
    }
    let j = Symbol.for("drizzle:Name");
    class k {
      static [f] = "PgForeignKeyBuilder";
      reference;
      _onUpdate = "no action";
      _onDelete = "no action";
      constructor(a, b) {
        (this.reference = () => {
          let { name: b, columns: c, foreignColumns: d } = a();
          return {
            name: b,
            columns: c,
            foreignTable: d[0].table,
            foreignColumns: d,
          };
        }),
          b && ((this._onUpdate = b.onUpdate), (this._onDelete = b.onDelete));
      }
      onUpdate(a) {
        return (this._onUpdate = void 0 === a ? "no action" : a), this;
      }
      onDelete(a) {
        return (this._onDelete = void 0 === a ? "no action" : a), this;
      }
      build(a) {
        return new l(a, this);
      }
    }
    class l {
      constructor(a, b) {
        (this.table = a),
          (this.reference = b.reference),
          (this.onUpdate = b._onUpdate),
          (this.onDelete = b._onDelete);
      }
      static [f] = "PgForeignKey";
      reference;
      onUpdate;
      onDelete;
      getName() {
        let { name: a, columns: b, foreignColumns: c } = this.reference(),
          d = b.map((a) => a.name),
          e = c.map((a) => a.name),
          f = [this.table[j], ...d, c[0].table[j], ...e];
        return a ?? `${f.join("_")}_fk`;
      }
    }
    function m(a, ...b) {
      return a(...b);
    }
    function n(a, b) {
      return `${a[j]}_${b.join("_")}_unique`;
    }
    class o {
      constructor(a, b) {
        (this.name = b), (this.columns = a);
      }
      static [f] = "PgUniqueConstraintBuilder";
      columns;
      nullsNotDistinctConfig = !1;
      nullsNotDistinct() {
        return (this.nullsNotDistinctConfig = !0), this;
      }
      build(a) {
        return new q(a, this.columns, this.nullsNotDistinctConfig, this.name);
      }
    }
    class p {
      static [f] = "PgUniqueOnConstraintBuilder";
      name;
      constructor(a) {
        this.name = a;
      }
      on(...a) {
        return new o(a, this.name);
      }
    }
    class q {
      constructor(a, b, c, d) {
        (this.table = a),
          (this.columns = b),
          (this.name =
            d ??
            n(
              this.table,
              this.columns.map((a) => a.name),
            )),
          (this.nullsNotDistinct = c);
      }
      static [f] = "PgUniqueConstraint";
      columns;
      name;
      nullsNotDistinct = !1;
      getName() {
        return this.name;
      }
    }
    function r(a, b, c) {
      for (let d = b; d < a.length; d++) {
        let e = a[d];
        if ("\\" === e) {
          d++;
          continue;
        }
        if ('"' === e) return [a.slice(b, d).replace(/\\/g, ""), d + 1];
        if (!c && ("," === e || "}" === e))
          return [a.slice(b, d).replace(/\\/g, ""), d];
      }
      return [a.slice(b).replace(/\\/g, ""), a.length];
    }
    class s extends i {
      foreignKeyConfigs = [];
      static [f] = "PgColumnBuilder";
      array(a) {
        return new w(this.config.name, this, a);
      }
      references(a, b = {}) {
        return this.foreignKeyConfigs.push({ ref: a, actions: b }), this;
      }
      unique(a, b) {
        return (
          (this.config.isUnique = !0),
          (this.config.uniqueName = a),
          (this.config.uniqueType = b?.nulls),
          this
        );
      }
      generatedAlwaysAs(a) {
        return (
          (this.config.generated = { as: a, type: "always", mode: "stored" }),
          this
        );
      }
      buildForeignKeys(a, b) {
        return this.foreignKeyConfigs.map(({ ref: c, actions: d }) =>
          m(
            (c, d) => {
              let e = new k(() => ({ columns: [a], foreignColumns: [c()] }));
              return (
                d.onUpdate && e.onUpdate(d.onUpdate),
                d.onDelete && e.onDelete(d.onDelete),
                e.build(b)
              );
            },
            c,
            d,
          ),
        );
      }
      buildExtraConfigColumn(a) {
        return new u(a, this.config);
      }
    }
    class t extends h {
      constructor(a, b) {
        b.uniqueName || (b.uniqueName = n(a, [b.name])),
          super(a, b),
          (this.table = a);
      }
      static [f] = "PgColumn";
    }
    class u extends t {
      static [f] = "ExtraConfigColumn";
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
      op(a) {
        return (this.indexConfig.opClass = a), this;
      }
    }
    class v {
      static [f] = "IndexedColumn";
      constructor(a, b, c, d) {
        (this.name = a),
          (this.keyAsName = b),
          (this.type = c),
          (this.indexConfig = d);
      }
      name;
      keyAsName;
      type;
      indexConfig;
    }
    class w extends s {
      static [f] = "PgArrayBuilder";
      constructor(a, b, c) {
        super(a, "array", "PgArray"),
          (this.config.baseBuilder = b),
          (this.config.size = c);
      }
      build(a) {
        let b = this.config.baseBuilder.build(a);
        return new x(a, this.config, b);
      }
    }
    class x extends t {
      constructor(a, b, c, d) {
        super(a, b),
          (this.baseColumn = c),
          (this.range = d),
          (this.size = b.size);
      }
      size;
      static [f] = "PgArray";
      getSQLType() {
        return `${this.baseColumn.getSQLType()}[${"number" == typeof this.size ? this.size : ""}]`;
      }
      mapFromDriverValue(a) {
        return (
          "string" == typeof a &&
            (a = (function (a) {
              let [b] = (function a(b, c = 0) {
                let d = [],
                  e = c,
                  f = !1;
                for (; e < b.length; ) {
                  let g = b[e];
                  if ("," === g) {
                    (f || e === c) && d.push(""), (f = !0), e++;
                    continue;
                  }
                  if (((f = !1), "\\" === g)) {
                    e += 2;
                    continue;
                  }
                  if ('"' === g) {
                    let [a, c] = r(b, e + 1, !0);
                    d.push(a), (e = c);
                    continue;
                  }
                  if ("}" === g) return [d, e + 1];
                  if ("{" === g) {
                    let [c, f] = a(b, e + 1);
                    d.push(c), (e = f);
                    continue;
                  }
                  let [h, i] = r(b, e, !1);
                  d.push(h), (e = i);
                }
                return [d, e];
              })(a, 1);
              return b;
            })(a)),
          a.map((a) => this.baseColumn.mapFromDriverValue(a))
        );
      }
      mapToDriverValue(a, b = !1) {
        let c = a.map((a) =>
          null === a
            ? null
            : g(this.baseColumn, x)
              ? this.baseColumn.mapToDriverValue(a, !0)
              : this.baseColumn.mapToDriverValue(a),
        );
        return b
          ? c
          : (function a(b) {
              return `{${b.map((b) => (Array.isArray(b) ? a(b) : "string" == typeof b ? `"${b.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `${b}`)).join(",")}}`;
            })(c);
      }
    }
    class y extends s {
      static [f] = "PgEnumObjectColumnBuilder";
      constructor(a, b) {
        super(a, "string", "PgEnumObjectColumn"), (this.config.enum = b);
      }
      build(a) {
        return new z(a, this.config);
      }
    }
    class z extends t {
      static [f] = "PgEnumObjectColumn";
      enum;
      enumValues = this.config.enum.enumValues;
      constructor(a, b) {
        super(a, b), (this.enum = b.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    let A = Symbol.for("drizzle:isPgEnum");
    class B extends s {
      static [f] = "PgEnumColumnBuilder";
      constructor(a, b) {
        super(a, "string", "PgEnumColumn"), (this.config.enum = b);
      }
      build(a) {
        return new C(a, this.config);
      }
    }
    class C extends t {
      static [f] = "PgEnumColumn";
      enum = this.config.enum;
      enumValues = this.config.enum.enumValues;
      constructor(a, b) {
        super(a, b), (this.enum = b.enum);
      }
      getSQLType() {
        return this.enum.enumName;
      }
    }
    class D {
      static [f] = "Subquery";
      constructor(a, b, c, d = !1, e = []) {
        this._ = {
          brand: "Subquery",
          sql: a,
          selectedFields: b,
          alias: c,
          isWith: d,
          usedTables: e,
        };
      }
    }
    class E extends D {
      static [f] = "WithSubquery";
    }
    let F = (a, d) =>
        b
          ? (c || (c = b.trace.getTracer("drizzle-orm", "0.45.2")),
            m(
              (b, c) =>
                c.startActiveSpan(a, (a) => {
                  try {
                    return d(a);
                  } catch (c) {
                    throw (
                      (a.setStatus({
                        code: b.SpanStatusCode.ERROR,
                        message:
                          c instanceof Error ? c.message : "Unknown error",
                      }),
                      c)
                    );
                  } finally {
                    a.end();
                  }
                }),
              b,
              c,
            ))
          : d(),
      G = Symbol.for("drizzle:ViewBaseConfig"),
      H = Symbol.for("drizzle:Schema"),
      I = Symbol.for("drizzle:Columns"),
      J = Symbol.for("drizzle:ExtraConfigColumns"),
      K = Symbol.for("drizzle:OriginalName"),
      L = Symbol.for("drizzle:BaseName"),
      M = Symbol.for("drizzle:IsAlias"),
      N = Symbol.for("drizzle:ExtraConfigBuilder"),
      O = Symbol.for("drizzle:IsDrizzleTable");
    class P {
      static [f] = "Table";
      static Symbol = {
        Name: j,
        Schema: H,
        OriginalName: K,
        Columns: I,
        ExtraConfigColumns: J,
        BaseName: L,
        IsAlias: M,
        ExtraConfigBuilder: N,
      };
      [j];
      [K];
      [H];
      [I];
      [J];
      [L];
      [M] = !1;
      [O] = !0;
      [N] = void 0;
      constructor(a, b, c) {
        (this[j] = this[K] = a), (this[H] = b), (this[L] = c);
      }
    }
    class Q {
      static [f] = "FakePrimitiveParam";
    }
    class R {
      static [f] = "StringChunk";
      value;
      constructor(a) {
        this.value = Array.isArray(a) ? a : [a];
      }
      getSQL() {
        return new S([this]);
      }
    }
    class S {
      constructor(a) {
        for (const b of ((this.queryChunks = a), a))
          if (g(b, P)) {
            const a = b[P.Symbol.Schema];
            this.usedTables.push(
              void 0 === a ? b[P.Symbol.Name] : a + "." + b[P.Symbol.Name],
            );
          }
      }
      static [f] = "SQL";
      decoder = U;
      shouldInlineParams = !1;
      usedTables = [];
      append(a) {
        return this.queryChunks.push(...a.queryChunks), this;
      }
      toQuery(a) {
        return F("drizzle.buildSQL", (b) => {
          let c = this.buildQueryFromSourceParams(this.queryChunks, a);
          return (
            b?.setAttributes({
              "drizzle.query.text": c.sql,
              "drizzle.query.params": JSON.stringify(c.params),
            }),
            c
          );
        });
      }
      buildQueryFromSourceParams(a, b) {
        let c = Object.assign({}, b, {
            inlineParams: b.inlineParams || this.shouldInlineParams,
            paramStartIndex: b.paramStartIndex || { value: 0 },
          }),
          {
            casing: d,
            escapeName: e,
            escapeParam: f,
            prepareTyping: i,
            inlineParams: j,
            paramStartIndex: k,
          } = c;
        var l = a.map((a) => {
          if (g(a, R)) return { sql: a.value.join(""), params: [] };
          if (g(a, T)) return { sql: e(a.value), params: [] };
          if (void 0 === a) return { sql: "", params: [] };
          if (Array.isArray(a)) {
            let b = [new R("(")];
            for (let [c, d] of a.entries())
              b.push(d), c < a.length - 1 && b.push(new R(", "));
            return b.push(new R(")")), this.buildQueryFromSourceParams(b, c);
          }
          if (g(a, S))
            return this.buildQueryFromSourceParams(a.queryChunks, {
              ...c,
              inlineParams: j || a.shouldInlineParams,
            });
          if (g(a, P)) {
            let b = a[P.Symbol.Schema],
              c = a[P.Symbol.Name];
            return {
              sql: void 0 === b || a[M] ? e(c) : e(b) + "." + e(c),
              params: [],
            };
          }
          if (g(a, h)) {
            let c = d.getColumnCasing(a);
            if ("indexes" === b.invokeSource) return { sql: e(c), params: [] };
            let f = a.table[P.Symbol.Schema];
            return {
              sql:
                a.table[M] || void 0 === f
                  ? e(a.table[P.Symbol.Name]) + "." + e(c)
                  : e(f) + "." + e(a.table[P.Symbol.Name]) + "." + e(c),
              params: [],
            };
          }
          if (g(a, aa)) {
            let b = a[G].schema,
              c = a[G].name;
            return {
              sql: void 0 === b || a[G].isAlias ? e(c) : e(b) + "." + e(c),
              params: [],
            };
          }
          if (g(a, W)) {
            if (g(a.value, $))
              return { sql: f(k.value++, a), params: [a], typings: ["none"] };
            let b =
              null === a.value ? null : a.encoder.mapToDriverValue(a.value);
            if (g(b, S)) return this.buildQueryFromSourceParams([b], c);
            if (j) return { sql: this.mapInlineParam(b, c), params: [] };
            let d = ["none"];
            return (
              i && (d = [i(a.encoder)]),
              { sql: f(k.value++, b), params: [b], typings: d }
            );
          }
          return g(a, $)
            ? { sql: f(k.value++, a), params: [a], typings: ["none"] }
            : g(a, S.Aliased) && void 0 !== a.fieldAlias
              ? { sql: e(a.fieldAlias), params: [] }
              : g(a, D)
                ? a._.isWith
                  ? { sql: e(a._.alias), params: [] }
                  : this.buildQueryFromSourceParams(
                      [new R("("), a._.sql, new R(") "), new T(a._.alias)],
                      c,
                    )
                : a && "function" == typeof a && A in a && !0 === a[A]
                  ? a.schema
                    ? { sql: e(a.schema) + "." + e(a.enumName), params: [] }
                    : { sql: e(a.enumName), params: [] }
                  : null != a && "function" == typeof a.getSQL
                    ? a.shouldOmitSQLParens?.()
                      ? this.buildQueryFromSourceParams([a.getSQL()], c)
                      : this.buildQueryFromSourceParams(
                          [new R("("), a.getSQL(), new R(")")],
                          c,
                        )
                    : j
                      ? { sql: this.mapInlineParam(a, c), params: [] }
                      : {
                          sql: f(k.value++, a),
                          params: [a],
                          typings: ["none"],
                        };
        });
        let m = { sql: "", params: [] };
        for (let a of l)
          (m.sql += a.sql),
            m.params.push(...a.params),
            a.typings?.length &&
              (m.typings || (m.typings = []), m.typings.push(...a.typings));
        return m;
      }
      mapInlineParam(a, { escapeString: b }) {
        if (null === a) return "null";
        if ("number" == typeof a || "boolean" == typeof a) return a.toString();
        if ("string" == typeof a) return b(a);
        if ("object" == typeof a) {
          let c = a.toString();
          return "[object Object]" === c ? b(JSON.stringify(a)) : b(c);
        }
        throw Error("Unexpected param value: " + a);
      }
      getSQL() {
        return this;
      }
      as(a) {
        return void 0 === a ? this : new S.Aliased(this, a);
      }
      mapWith(a) {
        return (
          (this.decoder =
            "function" == typeof a ? { mapFromDriverValue: a } : a),
          this
        );
      }
      inlineParams() {
        return (this.shouldInlineParams = !0), this;
      }
      if(a) {
        return a ? this : void 0;
      }
    }
    class T {
      constructor(a) {
        this.value = a;
      }
      static [f] = "Name";
      brand;
      getSQL() {
        return new S([this]);
      }
    }
    let U = { mapFromDriverValue: (a) => a },
      V = { mapToDriverValue: (a) => a };
    ({ ...U, ...V });
    class W {
      constructor(a, b = V) {
        (this.value = a), (this.encoder = b);
      }
      static [f] = "Param";
      brand;
      getSQL() {
        return new S([this]);
      }
    }
    function X(a, ...b) {
      let c = [];
      for (let [d, e] of ((b.length > 0 || (a.length > 0 && "" !== a[0])) &&
        c.push(new R(a[0])),
      b.entries()))
        c.push(e, new R(a[d + 1]));
      return new S(c);
    }
    ((d = X || (X = {})).empty = function () {
      return new S([]);
    }),
      (d.fromList = function (a) {
        return new S(a);
      }),
      (d.raw = function (a) {
        return new S([new R(a)]);
      }),
      (d.join = function (a, b) {
        let c = [];
        for (let [d, e] of a.entries())
          d > 0 && void 0 !== b && c.push(b), c.push(e);
        return new S(c);
      }),
      (d.identifier = function (a) {
        return new T(a);
      }),
      (d.placeholder = function (a) {
        return new $(a);
      }),
      (d.param = function (a, b) {
        return new W(a, b);
      });
    var Y = S || (S = {});
    class Z {
      constructor(a, b) {
        (this.sql = a), (this.fieldAlias = b);
      }
      static [f] = "SQL.Aliased";
      isSelectionField = !1;
      getSQL() {
        return this.sql;
      }
      clone() {
        return new Z(this.sql, this.fieldAlias);
      }
    }
    Y.Aliased = Z;
    class $ {
      constructor(a) {
        this.name = a;
      }
      static [f] = "Placeholder";
      getSQL() {
        return new S([this]);
      }
    }
    let _ = Symbol.for("drizzle:IsDrizzleView");
    class aa {
      static [f] = "View";
      [G];
      [_] = !0;
      constructor({ name: a, schema: b, selectedFields: c, query: d }) {
        this[G] = {
          name: a,
          originalName: a,
          schema: b,
          selectedFields: c,
          query: d,
          isExisting: !d,
          isAlias: !1,
        };
      }
      getSQL() {
        return new S([this]);
      }
    }
    (h.prototype.getSQL = function () {
      return new S([this]);
    }),
      (P.prototype.getSQL = function () {
        return new S([this]);
      }),
      (D.prototype.getSQL = function () {
        return new S([this]);
      }),
      "u" < typeof TextDecoder || new TextDecoder();
    class ab extends s {
      static [f] = "PgDateColumnBaseBuilder";
      defaultNow() {
        return this.default(X`now()`);
      }
    }
    class ac extends ab {
      static [f] = "PgTimestampBuilder";
      constructor(a, b, c) {
        super(a, "date", "PgTimestamp"),
          (this.config.withTimezone = b),
          (this.config.precision = c);
      }
      build(a) {
        return new ad(a, this.config);
      }
    }
    class ad extends t {
      static [f] = "PgTimestamp";
      withTimezone;
      precision;
      constructor(a, b) {
        super(a, b),
          (this.withTimezone = b.withTimezone),
          (this.precision = b.precision);
      }
      getSQLType() {
        let a = void 0 === this.precision ? "" : ` (${this.precision})`;
        return `timestamp${a}${this.withTimezone ? " with time zone" : ""}`;
      }
      mapFromDriverValue(a) {
        return "string" == typeof a
          ? new Date(this.withTimezone ? a : a + "+0000")
          : a;
      }
      mapToDriverValue = (a) => a.toISOString();
    }
    class ae extends ab {
      static [f] = "PgTimestampStringBuilder";
      constructor(a, b, c) {
        super(a, "string", "PgTimestampString"),
          (this.config.withTimezone = b),
          (this.config.precision = c);
      }
      build(a) {
        return new af(a, this.config);
      }
    }
    class af extends t {
      static [f] = "PgTimestampString";
      withTimezone;
      precision;
      constructor(a, b) {
        super(a, b),
          (this.withTimezone = b.withTimezone),
          (this.precision = b.precision);
      }
      getSQLType() {
        let a = void 0 === this.precision ? "" : `(${this.precision})`;
        return `timestamp${a}${this.withTimezone ? " with time zone" : ""}`;
      }
      mapFromDriverValue(a) {
        if ("string" == typeof a) return a;
        let b = a.toISOString().slice(0, -1).replace("T", " ");
        if (this.withTimezone) {
          let c = a.getTimezoneOffset();
          return `${b}${c <= 0 ? "+" : "-"}${Math.floor(Math.abs(c) / 60)
            .toString()
            .padStart(2, "0")}`;
        }
        return b;
      }
    }
    function ag(a, b = {}) {
      let { name: c, config: d } = {
        name: "string" == typeof a && a.length > 0 ? a : "",
        config: "object" == typeof a ? a : b,
      };
      return d?.mode === "string"
        ? new ae(c, d.withTimezone ?? !1, d.precision)
        : new ac(c, d?.withTimezone ?? !1, d?.precision);
    }
    let ah = (a = new Map(), b = null, c) => ({
        nextPart: a,
        validators: b,
        classGroupId: c,
      }),
      ai = [],
      aj = (a, b, c) => {
        if (0 == a.length - b) return c.classGroupId;
        let d = a[b],
          e = c.nextPart.get(d);
        if (e) {
          let c = aj(a, b + 1, e);
          if (c) return c;
        }
        let f = c.validators;
        if (null === f) return;
        let g = 0 === b ? a.join("-") : a.slice(b).join("-"),
          h = f.length;
        for (let a = 0; a < h; a++) {
          let b = f[a];
          if (b.validator(g)) return b.classGroupId;
        }
      },
      ak = (a, b) => {
        let c = ah();
        for (let d in a) al(a[d], c, d, b);
        return c;
      },
      al = (a, b, c, d) => {
        let e = a.length;
        for (let f = 0; f < e; f++) am(a[f], b, c, d);
      },
      am = (a, b, c, d) => {
        "string" == typeof a
          ? an(a, b, c)
          : "function" == typeof a
            ? ao(a, b, c, d)
            : ap(a, b, c, d);
      },
      an = (a, b, c) => {
        ("" === a ? b : aq(b, a)).classGroupId = c;
      },
      ao = (a, b, c, d) => {
        ar(a)
          ? al(a(d), b, c, d)
          : (null === b.validators && (b.validators = []),
            b.validators.push({ classGroupId: c, validator: a }));
      },
      ap = (a, b, c, d) => {
        let e = Object.entries(a),
          f = e.length;
        for (let a = 0; a < f; a++) {
          let [f, g] = e[a];
          al(g, aq(b, f), c, d);
        }
      },
      aq = (a, b) => {
        let c = a,
          d = b.split("-"),
          e = d.length;
        for (let a = 0; a < e; a++) {
          let b = d[a],
            e = c.nextPart.get(b);
          e || ((e = ah()), c.nextPart.set(b, e)), (c = e);
        }
        return c;
      },
      ar = (a) => "isThemeGetter" in a && !0 === a.isThemeGetter,
      as = [],
      at = (a, b, c, d, e) => ({
        modifiers: a,
        hasImportantModifier: b,
        baseClassName: c,
        maybePostfixModifierPosition: d,
        isExternal: e,
      }),
      au = /\s+/,
      av = (a) => {
        let b;
        if ("string" == typeof a) return a;
        let c = "";
        for (let d = 0; d < a.length; d++)
          a[d] && (b = av(a[d])) && (c && (c += " "), (c += b));
        return c;
      },
      aw = [],
      ax = (a) => {
        let b = (b) => b[a] || aw;
        return (b.isThemeGetter = !0), b;
      },
      ay = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
      az = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
      aA = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,
      aB = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
      aC =
        /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
      aD = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
      aE = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
      aF =
        /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
      aG = (a) => aA.test(a),
      aH = (a) => !!a && !Number.isNaN(Number(a)),
      aI = (a) => !!a && Number.isInteger(Number(a)),
      aJ = (a) => a.endsWith("%") && aH(a.slice(0, -1)),
      aK = (a) => aB.test(a),
      aL = () => !0,
      aM = (a) => aC.test(a) && !aD.test(a),
      aN = () => !1,
      aO = (a) => aE.test(a),
      aP = (a) => aF.test(a),
      aQ = (a) => !aT(a) && !a_(a),
      aR = (a) =>
        a.startsWith("@container") &&
        (("/" === a[10] && void 0 !== a[11]) ||
          ("s" === a[11] && void 0 !== a[16] && a.startsWith("-size/", 10)) ||
          ("n" === a[11] && void 0 !== a[18] && a.startsWith("-normal/", 10))),
      aS = (a) => a7(a, bb, aN),
      aT = (a) => ay.test(a),
      aU = (a) => a7(a, bc, aM),
      aV = (a) => a7(a, bd, aH),
      aW = (a) => a7(a, bf, aL),
      aX = (a) => a7(a, be, aN),
      aY = (a) => a7(a, a9, aN),
      aZ = (a) => a7(a, ba, aP),
      a$ = (a) => a7(a, bg, aO),
      a_ = (a) => az.test(a),
      a0 = (a) => a8(a, bc),
      a1 = (a) => a8(a, be),
      a2 = (a) => a8(a, a9),
      a3 = (a) => a8(a, bb),
      a4 = (a) => a8(a, ba),
      a5 = (a) => a8(a, bg, !0),
      a6 = (a) => a8(a, bf, !0),
      a7 = (a, b, c) => {
        let d = ay.exec(a);
        return !!d && (d[1] ? b(d[1]) : c(d[2]));
      },
      a8 = (a, b, c = !1) => {
        let d = az.exec(a);
        return !!d && (d[1] ? b(d[1]) : c);
      },
      a9 = (a) => "position" === a || "percentage" === a,
      ba = (a) => "image" === a || "url" === a,
      bb = (a) => "length" === a || "size" === a || "bg-size" === a,
      bc = (a) => "length" === a,
      bd = (a) => "number" === a,
      be = (a) => "family-name" === a,
      bf = (a) => "number" === a || "weight" === a,
      bg = (a) => "shadow" === a,
      bh = ((a, ...b) => {
        let c,
          d,
          e,
          f,
          g = (a) => {
            let b = d(a);
            if (b) return b;
            let f = ((a, b) => {
              let {
                  parseClassName: c,
                  getClassGroupId: d,
                  getConflictingClassGroupIds: e,
                  sortModifiers: f,
                  postfixLookupClassGroupIds: g,
                } = b,
                h = [],
                i = a.trim().split(au),
                j = "";
              for (let a = i.length - 1; a >= 0; a -= 1) {
                let b,
                  k = i[a],
                  {
                    isExternal: l,
                    modifiers: m,
                    hasImportantModifier: n,
                    baseClassName: o,
                    maybePostfixModifierPosition: p,
                  } = c(k);
                if (l) {
                  j = k + (j.length > 0 ? " " + j : j);
                  continue;
                }
                let q = !!p;
                if (q) {
                  let a = (b = d(o.substring(0, p))) && g[b] ? d(o) : void 0;
                  a && a !== b && ((b = a), (q = !1));
                } else b = d(o);
                if (!b) {
                  if (!q || !(b = d(o))) {
                    j = k + (j.length > 0 ? " " + j : j);
                    continue;
                  }
                  q = !1;
                }
                let r =
                    0 === m.length
                      ? ""
                      : 1 === m.length
                        ? m[0]
                        : f(m).join(":"),
                  s = n ? r + "!" : r,
                  t = s + b;
                if (h.indexOf(t) > -1) continue;
                h.push(t);
                let u = e(b, q);
                for (let a = 0; a < u.length; ++a) {
                  let b = u[a];
                  h.push(s + b);
                }
                j = k + (j.length > 0 ? " " + j : j);
              }
              return j;
            })(a, c);
            return e(a, f), f;
          };
        return (
          (f = (h) => {
            var i;
            let j;
            return (
              (d = (c = {
                cache: ((a) => {
                  if (a < 1) return { get: () => void 0, set: () => {} };
                  let b = 0,
                    c = Object.create(null),
                    d = Object.create(null),
                    e = (e, f) => {
                      (c[e] = f),
                        ++b > a &&
                          ((b = 0), (d = c), (c = Object.create(null)));
                    };
                  return {
                    get(a) {
                      let b = c[a];
                      return void 0 !== b
                        ? b
                        : void 0 !== (b = d[a])
                          ? (e(a, b), b)
                          : void 0;
                    },
                    set(a, b) {
                      a in c ? (c[a] = b) : e(a, b);
                    },
                  };
                })((i = b.reduce((a, b) => b(a), a())).cacheSize),
                parseClassName: ((a) => {
                  let { prefix: b, experimentalParseClassName: c } = a,
                    d = (a) => {
                      let b,
                        c = [],
                        d = 0,
                        e = 0,
                        f = 0,
                        g = a.length;
                      for (let h = 0; h < g; h++) {
                        let g = a[h];
                        if (0 === d && 0 === e) {
                          if (":" === g) {
                            c.push(a.slice(f, h)), (f = h + 1);
                            continue;
                          }
                          if ("/" === g) {
                            b = h;
                            continue;
                          }
                        }
                        "[" === g
                          ? d++
                          : "]" === g
                            ? d--
                            : "(" === g
                              ? e++
                              : ")" === g && e--;
                      }
                      let h = 0 === c.length ? a : a.slice(f),
                        i = h,
                        j = !1;
                      return (
                        h.endsWith("!")
                          ? ((i = h.slice(0, -1)), (j = !0))
                          : h.startsWith("!") && ((i = h.slice(1)), (j = !0)),
                        at(c, j, i, b && b > f ? b - f : void 0)
                      );
                    };
                  if (b) {
                    let a = b + ":",
                      c = d;
                    d = (b) =>
                      b.startsWith(a)
                        ? c(b.slice(a.length))
                        : at(as, !1, b, void 0, !0);
                  }
                  if (c) {
                    let a = d;
                    d = (b) => c({ className: b, parseClassName: a });
                  }
                  return d;
                })(i),
                sortModifiers:
                  ((j = new Map()),
                  i.orderSensitiveModifiers.forEach((a, b) => {
                    j.set(a, 1e6 + b);
                  }),
                  (a) => {
                    let b = [],
                      c = [];
                    for (let d = 0; d < a.length; d++) {
                      let e = a[d],
                        f = "[" === e[0],
                        g = j.has(e);
                      f || g
                        ? (c.length > 0 && (c.sort(), b.push(...c), (c = [])),
                          b.push(e))
                        : c.push(e);
                    }
                    return c.length > 0 && (c.sort(), b.push(...c)), b;
                  }),
                postfixLookupClassGroupIds: ((a) => {
                  let b = Object.create(null),
                    c = a.postfixLookupClassGroups;
                  if (c) for (let a = 0; a < c.length; a++) b[c[a]] = !0;
                  return b;
                })(i),
                ...((a) => {
                  let b = ((a) => {
                      let { theme: b, classGroups: c } = a;
                      return ak(c, b);
                    })(a),
                    {
                      conflictingClassGroups: c,
                      conflictingClassGroupModifiers: d,
                    } = a;
                  return {
                    getClassGroupId: (a) => {
                      if (a.startsWith("[") && a.endsWith("]")) {
                        var c;
                        let b, d, e;
                        return -1 === (c = a).slice(1, -1).indexOf(":")
                          ? void 0
                          : ((d = (b = c.slice(1, -1)).indexOf(":")),
                            (e = b.slice(0, d)) ? "arbitrary.." + e : void 0);
                      }
                      let d = a.split("-"),
                        e = +("" === d[0] && d.length > 1);
                      return aj(d, e, b);
                    },
                    getConflictingClassGroupIds: (a, b) => {
                      if (b) {
                        let b = d[a],
                          e = c[a];
                        if (b) {
                          if (e) {
                            let a = Array(e.length + b.length);
                            for (let b = 0; b < e.length; b++) a[b] = e[b];
                            for (let c = 0; c < b.length; c++)
                              a[e.length + c] = b[c];
                            return a;
                          }
                          return b;
                        }
                        return e || ai;
                      }
                      return c[a] || ai;
                    },
                  };
                })(i),
              }).cache.get),
              (e = c.cache.set),
              (f = g),
              g(h)
            );
          }),
          (...a) =>
            f(
              ((...a) => {
                let b,
                  c,
                  d = 0,
                  e = "";
                for (; d < a.length; )
                  (b = a[d++]) && (c = av(b)) && (e && (e += " "), (e += c));
                return e;
              })(...a),
            )
        );
      })(() => {
        let a = ax("color"),
          b = ax("font"),
          c = ax("text"),
          d = ax("font-weight"),
          e = ax("tracking"),
          f = ax("leading"),
          g = ax("breakpoint"),
          h = ax("container"),
          i = ax("spacing"),
          j = ax("radius"),
          k = ax("shadow"),
          l = ax("inset-shadow"),
          m = ax("text-shadow"),
          n = ax("drop-shadow"),
          o = ax("blur"),
          p = ax("perspective"),
          q = ax("aspect"),
          r = ax("ease"),
          s = ax("animate"),
          t = () => [
            "auto",
            "avoid",
            "all",
            "avoid-page",
            "page",
            "left",
            "right",
            "column",
          ],
          u = () => [
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
          v = () => [...u(), a_, aT],
          w = () => ["auto", "hidden", "clip", "visible", "scroll"],
          x = () => ["auto", "contain", "none"],
          y = () => [a_, aT, i],
          z = () => [aG, "full", "auto", ...y()],
          A = () => [aI, "none", "subgrid", a_, aT],
          B = () => ["auto", { span: ["full", aI, a_, aT] }, aI, a_, aT],
          C = () => [aI, "auto", a_, aT],
          D = () => ["auto", "min", "max", "fr", a_, aT],
          E = () => [
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
          F = () => [
            "start",
            "end",
            "center",
            "stretch",
            "center-safe",
            "end-safe",
          ],
          G = () => ["auto", ...y()],
          H = () => [
            aG,
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
            ...y(),
          ],
          I = () => [
            aG,
            "screen",
            "full",
            "dvw",
            "lvw",
            "svw",
            "min",
            "max",
            "fit",
            ...y(),
          ],
          J = () => [
            aG,
            "screen",
            "full",
            "lh",
            "dvh",
            "lvh",
            "svh",
            "min",
            "max",
            "fit",
            ...y(),
          ],
          K = () => [a, a_, aT],
          L = () => [...u(), a2, aY, { position: [a_, aT] }],
          M = () => ["no-repeat", { repeat: ["", "x", "y", "space", "round"] }],
          N = () => ["auto", "cover", "contain", a3, aS, { size: [a_, aT] }],
          O = () => [aJ, a0, aU],
          P = () => ["", "none", "full", j, a_, aT],
          Q = () => ["", aH, a0, aU],
          R = () => ["solid", "dashed", "dotted", "double"],
          S = () => [
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
          T = () => [aH, aJ, a2, aY],
          U = () => ["", "none", o, a_, aT],
          V = () => ["none", aH, a_, aT],
          W = () => ["none", aH, a_, aT],
          X = () => [aH, a_, aT],
          Y = () => [aG, "full", ...y()];
        return {
          cacheSize: 500,
          theme: {
            animate: ["spin", "ping", "pulse", "bounce"],
            aspect: ["video"],
            blur: [aK],
            breakpoint: [aK],
            color: [aL],
            container: [aK],
            "drop-shadow": [aK],
            ease: ["in", "out", "in-out"],
            font: [aQ],
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
            "inset-shadow": [aK],
            leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
            perspective: [
              "dramatic",
              "near",
              "normal",
              "midrange",
              "distant",
              "none",
            ],
            radius: [aK],
            shadow: [aK],
            spacing: ["px", aH],
            text: [aK],
            "text-shadow": [aK],
            tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
          },
          classGroups: {
            aspect: [{ aspect: ["auto", "square", aG, aT, a_, q] }],
            container: ["container"],
            "container-type": [
              { "@container": ["", "normal", "size", a_, aT] },
            ],
            "container-named": [aR],
            columns: [{ columns: [aH, aT, a_, h] }],
            "break-after": [{ "break-after": t() }],
            "break-before": [{ "break-before": t() }],
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
            "object-position": [{ object: v() }],
            overflow: [{ overflow: w() }],
            "overflow-x": [{ "overflow-x": w() }],
            "overflow-y": [{ "overflow-y": w() }],
            overscroll: [{ overscroll: x() }],
            "overscroll-x": [{ "overscroll-x": x() }],
            "overscroll-y": [{ "overscroll-y": x() }],
            position: ["static", "fixed", "absolute", "relative", "sticky"],
            inset: [{ inset: z() }],
            "inset-x": [{ "inset-x": z() }],
            "inset-y": [{ "inset-y": z() }],
            start: [{ "inset-s": z(), start: z() }],
            end: [{ "inset-e": z(), end: z() }],
            "inset-bs": [{ "inset-bs": z() }],
            "inset-be": [{ "inset-be": z() }],
            top: [{ top: z() }],
            right: [{ right: z() }],
            bottom: [{ bottom: z() }],
            left: [{ left: z() }],
            visibility: ["visible", "invisible", "collapse"],
            z: [{ z: [aI, "auto", a_, aT] }],
            basis: [{ basis: [aG, "full", "auto", h, ...y()] }],
            "flex-direction": [
              { flex: ["row", "row-reverse", "col", "col-reverse"] },
            ],
            "flex-wrap": [{ flex: ["nowrap", "wrap", "wrap-reverse"] }],
            flex: [{ flex: [aH, aG, "auto", "initial", "none", aT] }],
            grow: [{ grow: ["", aH, a_, aT] }],
            shrink: [{ shrink: ["", aH, a_, aT] }],
            order: [{ order: [aI, "first", "last", "none", a_, aT] }],
            "grid-cols": [{ "grid-cols": A() }],
            "col-start-end": [{ col: B() }],
            "col-start": [{ "col-start": C() }],
            "col-end": [{ "col-end": C() }],
            "grid-rows": [{ "grid-rows": A() }],
            "row-start-end": [{ row: B() }],
            "row-start": [{ "row-start": C() }],
            "row-end": [{ "row-end": C() }],
            "grid-flow": [
              {
                "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"],
              },
            ],
            "auto-cols": [{ "auto-cols": D() }],
            "auto-rows": [{ "auto-rows": D() }],
            gap: [{ gap: y() }],
            "gap-x": [{ "gap-x": y() }],
            "gap-y": [{ "gap-y": y() }],
            "justify-content": [{ justify: [...E(), "normal"] }],
            "justify-items": [{ "justify-items": [...F(), "normal"] }],
            "justify-self": [{ "justify-self": ["auto", ...F()] }],
            "align-content": [{ content: ["normal", ...E()] }],
            "align-items": [{ items: [...F(), { baseline: ["", "last"] }] }],
            "align-self": [
              { self: ["auto", ...F(), { baseline: ["", "last"] }] },
            ],
            "place-content": [{ "place-content": E() }],
            "place-items": [{ "place-items": [...F(), "baseline"] }],
            "place-self": [{ "place-self": ["auto", ...F()] }],
            p: [{ p: y() }],
            px: [{ px: y() }],
            py: [{ py: y() }],
            ps: [{ ps: y() }],
            pe: [{ pe: y() }],
            pbs: [{ pbs: y() }],
            pbe: [{ pbe: y() }],
            pt: [{ pt: y() }],
            pr: [{ pr: y() }],
            pb: [{ pb: y() }],
            pl: [{ pl: y() }],
            m: [{ m: G() }],
            mx: [{ mx: G() }],
            my: [{ my: G() }],
            ms: [{ ms: G() }],
            me: [{ me: G() }],
            mbs: [{ mbs: G() }],
            mbe: [{ mbe: G() }],
            mt: [{ mt: G() }],
            mr: [{ mr: G() }],
            mb: [{ mb: G() }],
            ml: [{ ml: G() }],
            "space-x": [{ "space-x": y() }],
            "space-x-reverse": ["space-x-reverse"],
            "space-y": [{ "space-y": y() }],
            "space-y-reverse": ["space-y-reverse"],
            size: [{ size: H() }],
            "inline-size": [{ inline: ["auto", ...I()] }],
            "min-inline-size": [{ "min-inline": ["auto", ...I()] }],
            "max-inline-size": [{ "max-inline": ["none", ...I()] }],
            "block-size": [{ block: ["auto", ...J()] }],
            "min-block-size": [{ "min-block": ["auto", ...J()] }],
            "max-block-size": [{ "max-block": ["none", ...J()] }],
            w: [{ w: [h, "screen", ...H()] }],
            "min-w": [{ "min-w": [h, "screen", "none", ...H()] }],
            "max-w": [
              {
                "max-w": [
                  h,
                  "screen",
                  "none",
                  "prose",
                  { screen: [g] },
                  ...H(),
                ],
              },
            ],
            h: [{ h: ["screen", "lh", ...H()] }],
            "min-h": [{ "min-h": ["screen", "lh", "none", ...H()] }],
            "max-h": [{ "max-h": ["screen", "lh", ...H()] }],
            "font-size": [{ text: ["base", c, a0, aU] }],
            "font-smoothing": ["antialiased", "subpixel-antialiased"],
            "font-style": ["italic", "not-italic"],
            "font-weight": [{ font: [d, a6, aW] }],
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
                  aJ,
                  aT,
                ],
              },
            ],
            "font-family": [{ font: [a1, aX, b] }],
            "font-features": [{ "font-features": [aT] }],
            "fvn-normal": ["normal-nums"],
            "fvn-ordinal": ["ordinal"],
            "fvn-slashed-zero": ["slashed-zero"],
            "fvn-figure": ["lining-nums", "oldstyle-nums"],
            "fvn-spacing": ["proportional-nums", "tabular-nums"],
            "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
            tracking: [{ tracking: [e, a_, aT] }],
            "line-clamp": [{ "line-clamp": [aH, "none", a_, aV] }],
            leading: [{ leading: [f, ...y()] }],
            "list-image": [{ "list-image": ["none", a_, aT] }],
            "list-style-position": [{ list: ["inside", "outside"] }],
            "list-style-type": [{ list: ["disc", "decimal", "none", a_, aT] }],
            "text-alignment": [
              { text: ["left", "center", "right", "justify", "start", "end"] },
            ],
            "placeholder-color": [{ placeholder: K() }],
            "text-color": [{ text: K() }],
            "text-decoration": [
              "underline",
              "overline",
              "line-through",
              "no-underline",
            ],
            "text-decoration-style": [{ decoration: [...R(), "wavy"] }],
            "text-decoration-thickness": [
              { decoration: [aH, "from-font", "auto", a_, aU] },
            ],
            "text-decoration-color": [{ decoration: K() }],
            "underline-offset": [{ "underline-offset": [aH, "auto", a_, aT] }],
            "text-transform": [
              "uppercase",
              "lowercase",
              "capitalize",
              "normal-case",
            ],
            "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
            "text-wrap": [{ text: ["wrap", "nowrap", "balance", "pretty"] }],
            indent: [{ indent: y() }],
            "tab-size": [{ tab: [aI, a_, aT] }],
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
                  a_,
                  aT,
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
            content: [{ content: ["none", a_, aT] }],
            "bg-attachment": [{ bg: ["fixed", "local", "scroll"] }],
            "bg-clip": [
              { "bg-clip": ["border", "padding", "content", "text"] },
            ],
            "bg-origin": [{ "bg-origin": ["border", "padding", "content"] }],
            "bg-position": [{ bg: L() }],
            "bg-repeat": [{ bg: M() }],
            "bg-size": [{ bg: N() }],
            "bg-image": [
              {
                bg: [
                  "none",
                  {
                    linear: [
                      { to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"] },
                      aI,
                      a_,
                      aT,
                    ],
                    radial: ["", a_, aT],
                    conic: [aI, a_, aT],
                  },
                  a4,
                  aZ,
                ],
              },
            ],
            "bg-color": [{ bg: K() }],
            "gradient-from-pos": [{ from: O() }],
            "gradient-via-pos": [{ via: O() }],
            "gradient-to-pos": [{ to: O() }],
            "gradient-from": [{ from: K() }],
            "gradient-via": [{ via: K() }],
            "gradient-to": [{ to: K() }],
            rounded: [{ rounded: P() }],
            "rounded-s": [{ "rounded-s": P() }],
            "rounded-e": [{ "rounded-e": P() }],
            "rounded-t": [{ "rounded-t": P() }],
            "rounded-r": [{ "rounded-r": P() }],
            "rounded-b": [{ "rounded-b": P() }],
            "rounded-l": [{ "rounded-l": P() }],
            "rounded-ss": [{ "rounded-ss": P() }],
            "rounded-se": [{ "rounded-se": P() }],
            "rounded-ee": [{ "rounded-ee": P() }],
            "rounded-es": [{ "rounded-es": P() }],
            "rounded-tl": [{ "rounded-tl": P() }],
            "rounded-tr": [{ "rounded-tr": P() }],
            "rounded-br": [{ "rounded-br": P() }],
            "rounded-bl": [{ "rounded-bl": P() }],
            "border-w": [{ border: Q() }],
            "border-w-x": [{ "border-x": Q() }],
            "border-w-y": [{ "border-y": Q() }],
            "border-w-s": [{ "border-s": Q() }],
            "border-w-e": [{ "border-e": Q() }],
            "border-w-bs": [{ "border-bs": Q() }],
            "border-w-be": [{ "border-be": Q() }],
            "border-w-t": [{ "border-t": Q() }],
            "border-w-r": [{ "border-r": Q() }],
            "border-w-b": [{ "border-b": Q() }],
            "border-w-l": [{ "border-l": Q() }],
            "divide-x": [{ "divide-x": Q() }],
            "divide-x-reverse": ["divide-x-reverse"],
            "divide-y": [{ "divide-y": Q() }],
            "divide-y-reverse": ["divide-y-reverse"],
            "border-style": [{ border: [...R(), "hidden", "none"] }],
            "divide-style": [{ divide: [...R(), "hidden", "none"] }],
            "border-color": [{ border: K() }],
            "border-color-x": [{ "border-x": K() }],
            "border-color-y": [{ "border-y": K() }],
            "border-color-s": [{ "border-s": K() }],
            "border-color-e": [{ "border-e": K() }],
            "border-color-bs": [{ "border-bs": K() }],
            "border-color-be": [{ "border-be": K() }],
            "border-color-t": [{ "border-t": K() }],
            "border-color-r": [{ "border-r": K() }],
            "border-color-b": [{ "border-b": K() }],
            "border-color-l": [{ "border-l": K() }],
            "divide-color": [{ divide: K() }],
            "outline-style": [{ outline: [...R(), "none", "hidden"] }],
            "outline-offset": [{ "outline-offset": [aH, a_, aT] }],
            "outline-w": [{ outline: ["", aH, a0, aU] }],
            "outline-color": [{ outline: K() }],
            shadow: [{ shadow: ["", "none", k, a5, a$] }],
            "shadow-color": [{ shadow: K() }],
            "inset-shadow": [{ "inset-shadow": ["none", l, a5, a$] }],
            "inset-shadow-color": [{ "inset-shadow": K() }],
            "ring-w": [{ ring: Q() }],
            "ring-w-inset": ["ring-inset"],
            "ring-color": [{ ring: K() }],
            "ring-offset-w": [{ "ring-offset": [aH, aU] }],
            "ring-offset-color": [{ "ring-offset": K() }],
            "inset-ring-w": [{ "inset-ring": Q() }],
            "inset-ring-color": [{ "inset-ring": K() }],
            "text-shadow": [{ "text-shadow": ["none", m, a5, a$] }],
            "text-shadow-color": [{ "text-shadow": K() }],
            opacity: [{ opacity: [aH, a_, aT] }],
            "mix-blend": [
              { "mix-blend": [...S(), "plus-darker", "plus-lighter"] },
            ],
            "bg-blend": [{ "bg-blend": S() }],
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
            "mask-image-linear-pos": [{ "mask-linear": [aH] }],
            "mask-image-linear-from-pos": [{ "mask-linear-from": T() }],
            "mask-image-linear-to-pos": [{ "mask-linear-to": T() }],
            "mask-image-linear-from-color": [{ "mask-linear-from": K() }],
            "mask-image-linear-to-color": [{ "mask-linear-to": K() }],
            "mask-image-t-from-pos": [{ "mask-t-from": T() }],
            "mask-image-t-to-pos": [{ "mask-t-to": T() }],
            "mask-image-t-from-color": [{ "mask-t-from": K() }],
            "mask-image-t-to-color": [{ "mask-t-to": K() }],
            "mask-image-r-from-pos": [{ "mask-r-from": T() }],
            "mask-image-r-to-pos": [{ "mask-r-to": T() }],
            "mask-image-r-from-color": [{ "mask-r-from": K() }],
            "mask-image-r-to-color": [{ "mask-r-to": K() }],
            "mask-image-b-from-pos": [{ "mask-b-from": T() }],
            "mask-image-b-to-pos": [{ "mask-b-to": T() }],
            "mask-image-b-from-color": [{ "mask-b-from": K() }],
            "mask-image-b-to-color": [{ "mask-b-to": K() }],
            "mask-image-l-from-pos": [{ "mask-l-from": T() }],
            "mask-image-l-to-pos": [{ "mask-l-to": T() }],
            "mask-image-l-from-color": [{ "mask-l-from": K() }],
            "mask-image-l-to-color": [{ "mask-l-to": K() }],
            "mask-image-x-from-pos": [{ "mask-x-from": T() }],
            "mask-image-x-to-pos": [{ "mask-x-to": T() }],
            "mask-image-x-from-color": [{ "mask-x-from": K() }],
            "mask-image-x-to-color": [{ "mask-x-to": K() }],
            "mask-image-y-from-pos": [{ "mask-y-from": T() }],
            "mask-image-y-to-pos": [{ "mask-y-to": T() }],
            "mask-image-y-from-color": [{ "mask-y-from": K() }],
            "mask-image-y-to-color": [{ "mask-y-to": K() }],
            "mask-image-radial": [{ "mask-radial": [a_, aT] }],
            "mask-image-radial-from-pos": [{ "mask-radial-from": T() }],
            "mask-image-radial-to-pos": [{ "mask-radial-to": T() }],
            "mask-image-radial-from-color": [{ "mask-radial-from": K() }],
            "mask-image-radial-to-color": [{ "mask-radial-to": K() }],
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
            "mask-image-radial-pos": [{ "mask-radial-at": u() }],
            "mask-image-conic-pos": [{ "mask-conic": [aH] }],
            "mask-image-conic-from-pos": [{ "mask-conic-from": T() }],
            "mask-image-conic-to-pos": [{ "mask-conic-to": T() }],
            "mask-image-conic-from-color": [{ "mask-conic-from": K() }],
            "mask-image-conic-to-color": [{ "mask-conic-to": K() }],
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
            "mask-position": [{ mask: L() }],
            "mask-repeat": [{ mask: M() }],
            "mask-size": [{ mask: N() }],
            "mask-type": [{ "mask-type": ["alpha", "luminance"] }],
            "mask-image": [{ mask: ["none", a_, aT] }],
            filter: [{ filter: ["", "none", a_, aT] }],
            blur: [{ blur: U() }],
            brightness: [{ brightness: [aH, a_, aT] }],
            contrast: [{ contrast: [aH, a_, aT] }],
            "drop-shadow": [{ "drop-shadow": ["", "none", n, a5, a$] }],
            "drop-shadow-color": [{ "drop-shadow": K() }],
            grayscale: [{ grayscale: ["", aH, a_, aT] }],
            "hue-rotate": [{ "hue-rotate": [aH, a_, aT] }],
            invert: [{ invert: ["", aH, a_, aT] }],
            saturate: [{ saturate: [aH, a_, aT] }],
            sepia: [{ sepia: ["", aH, a_, aT] }],
            "backdrop-filter": [{ "backdrop-filter": ["", "none", a_, aT] }],
            "backdrop-blur": [{ "backdrop-blur": U() }],
            "backdrop-brightness": [{ "backdrop-brightness": [aH, a_, aT] }],
            "backdrop-contrast": [{ "backdrop-contrast": [aH, a_, aT] }],
            "backdrop-grayscale": [{ "backdrop-grayscale": ["", aH, a_, aT] }],
            "backdrop-hue-rotate": [{ "backdrop-hue-rotate": [aH, a_, aT] }],
            "backdrop-invert": [{ "backdrop-invert": ["", aH, a_, aT] }],
            "backdrop-opacity": [{ "backdrop-opacity": [aH, a_, aT] }],
            "backdrop-saturate": [{ "backdrop-saturate": [aH, a_, aT] }],
            "backdrop-sepia": [{ "backdrop-sepia": ["", aH, a_, aT] }],
            "border-collapse": [{ border: ["collapse", "separate"] }],
            "border-spacing": [{ "border-spacing": y() }],
            "border-spacing-x": [{ "border-spacing-x": y() }],
            "border-spacing-y": [{ "border-spacing-y": y() }],
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
                  a_,
                  aT,
                ],
              },
            ],
            "transition-behavior": [{ transition: ["normal", "discrete"] }],
            duration: [{ duration: [aH, "initial", a_, aT] }],
            ease: [{ ease: ["linear", "initial", r, a_, aT] }],
            delay: [{ delay: [aH, a_, aT] }],
            animate: [{ animate: ["none", s, a_, aT] }],
            backface: [{ backface: ["hidden", "visible"] }],
            perspective: [{ perspective: [p, a_, aT] }],
            "perspective-origin": [{ "perspective-origin": v() }],
            rotate: [{ rotate: V() }],
            "rotate-x": [{ "rotate-x": V() }],
            "rotate-y": [{ "rotate-y": V() }],
            "rotate-z": [{ "rotate-z": V() }],
            scale: [{ scale: W() }],
            "scale-x": [{ "scale-x": W() }],
            "scale-y": [{ "scale-y": W() }],
            "scale-z": [{ "scale-z": W() }],
            "scale-3d": ["scale-3d"],
            skew: [{ skew: X() }],
            "skew-x": [{ "skew-x": X() }],
            "skew-y": [{ "skew-y": X() }],
            transform: [{ transform: [a_, aT, "", "none", "gpu", "cpu"] }],
            "transform-origin": [{ origin: v() }],
            "transform-style": [{ transform: ["3d", "flat"] }],
            translate: [{ translate: Y() }],
            "translate-x": [{ "translate-x": Y() }],
            "translate-y": [{ "translate-y": Y() }],
            "translate-z": [{ "translate-z": Y() }],
            "translate-none": ["translate-none"],
            zoom: [{ zoom: [aI, a_, aT] }],
            accent: [{ accent: K() }],
            appearance: [{ appearance: ["none", "auto"] }],
            "caret-color": [{ caret: K() }],
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
                  a_,
                  aT,
                ],
              },
            ],
            "field-sizing": [{ "field-sizing": ["fixed", "content"] }],
            "pointer-events": [{ "pointer-events": ["auto", "none"] }],
            resize: [{ resize: ["none", "", "y", "x"] }],
            "scroll-behavior": [{ scroll: ["auto", "smooth"] }],
            "scrollbar-thumb-color": [{ "scrollbar-thumb": K() }],
            "scrollbar-track-color": [{ "scrollbar-track": K() }],
            "scrollbar-gutter": [
              { "scrollbar-gutter": ["auto", "stable", "both"] },
            ],
            "scrollbar-w": [{ scrollbar: ["auto", "thin", "none"] }],
            "scroll-m": [{ "scroll-m": y() }],
            "scroll-mx": [{ "scroll-mx": y() }],
            "scroll-my": [{ "scroll-my": y() }],
            "scroll-ms": [{ "scroll-ms": y() }],
            "scroll-me": [{ "scroll-me": y() }],
            "scroll-mbs": [{ "scroll-mbs": y() }],
            "scroll-mbe": [{ "scroll-mbe": y() }],
            "scroll-mt": [{ "scroll-mt": y() }],
            "scroll-mr": [{ "scroll-mr": y() }],
            "scroll-mb": [{ "scroll-mb": y() }],
            "scroll-ml": [{ "scroll-ml": y() }],
            "scroll-p": [{ "scroll-p": y() }],
            "scroll-px": [{ "scroll-px": y() }],
            "scroll-py": [{ "scroll-py": y() }],
            "scroll-ps": [{ "scroll-ps": y() }],
            "scroll-pe": [{ "scroll-pe": y() }],
            "scroll-pbs": [{ "scroll-pbs": y() }],
            "scroll-pbe": [{ "scroll-pbe": y() }],
            "scroll-pt": [{ "scroll-pt": y() }],
            "scroll-pr": [{ "scroll-pr": y() }],
            "scroll-pb": [{ "scroll-pb": y() }],
            "scroll-pl": [{ "scroll-pl": y() }],
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
                  a_,
                  aT,
                ],
              },
            ],
            fill: [{ fill: ["none", ...K()] }],
            "stroke-w": [{ stroke: [aH, a0, aU, aV] }],
            stroke: [{ stroke: ["none", ...K()] }],
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
    ag("created_at", { withTimezone: !0 }).notNull().defaultNow(),
      ag("updated_at", { withTimezone: !0 })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      a.s(
        [
          "cn",
          0,
          function (...a) {
            return bh((0, e.clsx)(a));
          },
        ],
        68114,
      );
  },
  99570,
  (a) => {
    "use strict";
    var b = a.i(87924),
      c = a.i(187),
      d = a.i(76306),
      e = a.i(68114);
    let f = (0, c.cva)(
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
    a.s([
      "Button",
      0,
      function ({
        className: a,
        variant: c = "default",
        size: g = "default",
        asChild: h = !1,
        ...i
      }) {
        let j = h ? d.Slot.Root : "button";
        return (0, b.jsx)(j, {
          "data-slot": "button",
          "data-variant": c,
          "data-size": g,
          className: (0, e.cn)(f({ variant: c, size: g, className: a })),
          ...i,
        });
      },
    ]);
  },
];

//# sourceMappingURL=_1dqbe3-._.js.map
