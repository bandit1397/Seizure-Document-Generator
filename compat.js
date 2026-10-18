/*
 * compat.js — 구형 브라우저(인터넷 익스플로러 11, 오래된 Edge·Chrome)용 보완 코드
 *
 * 브라우저에 이미 있는 기능은 건드리지 않고, 없는 기능만 채운다.
 * 따라서 최신 Chrome·Edge에서는 아무 일도 하지 않는다.
 */
(function () {
  "use strict";

  function define(obj, name, fn) {
    if (obj && !obj[name]) {
      try { Object.defineProperty(obj, name, { value: fn, configurable: true, writable: true }); }
      catch (e) { obj[name] = fn; }
    }
  }

  // ---------- Object / String ----------
  define(Object, "assign", function (target) {
    if (target == null) throw new TypeError("Cannot convert undefined or null to object");
    var to = Object(target);
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src == null) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) to[k] = src[k];
    }
    return to;
  });
  define(String.prototype, "padStart", function (len, pad) {
    var s = String(this); len = len >> 0; pad = pad === undefined ? " " : String(pad);
    if (s.length >= len || !pad) return s;
    var fill = "";
    while (fill.length < len - s.length) fill += pad;
    return fill.slice(0, len - s.length) + s;
  });

  // ---------- 형식화 배열 (HWP 파일 읽기·쓰기) ----------
  if (typeof Uint8Array !== "undefined") {
    define(Uint8Array.prototype, "slice", function (begin, end) {
      var sub = this.subarray(begin || 0, end === undefined ? this.length : end);
      var out = new Uint8Array(sub.length); out.set(sub);
      return out;
    });
    define(Uint8Array.prototype, "fill", function (value, start, end) {
      var n = this.length;
      start = start === undefined ? 0 : start < 0 ? Math.max(n + start, 0) : Math.min(start, n);
      end = end === undefined ? n : end < 0 ? Math.max(n + end, 0) : Math.min(end, n);
      for (var i = start; i < end; i++) this[i] = value;
      return this;
    });
    define(Uint8Array, "from", function (src) { return new Uint8Array(src); });
  }

  // ---------- Promise ----------
  if (typeof window !== "undefined" && typeof window.Promise !== "function") {
    var later = function (fn) { setTimeout(fn, 0); };
    var P = function (executor) {
      var self = this;
      self._state = 0; self._value = undefined; self._handlers = [];
      var done = false;
      function settle(state, value) {
        if (self._state) return;
        self._state = state; self._value = value;
        var hs = self._handlers; self._handlers = [];
        for (var i = 0; i < hs.length; i++) run(hs[i]);
      }
      function resolve(value) {
        if (done) return; done = true;
        resolveWith(value);
      }
      function resolveWith(value) {
        if (value === self) return settle(2, new TypeError("Promise resolved with itself"));
        if (value && (typeof value === "object" || typeof value === "function")) {
          var then;
          try { then = value.then; } catch (e) { return settle(2, e); }
          if (typeof then === "function") {
            var called = false;
            try {
              then.call(value,
                function (v) { if (!called) { called = true; resolveWith(v); } },
                function (r) { if (!called) { called = true; settle(2, r); } });
            } catch (e) { if (!called) { called = true; settle(2, e); } }
            return;
          }
        }
        settle(1, value);
      }
      function reject(reason) { if (done) return; done = true; settle(2, reason); }
      function run(h) {
        later(function () {
          var cb = self._state === 1 ? h.onFul : h.onRej;
          if (typeof cb !== "function") { (self._state === 1 ? h.resolve : h.reject)(self._value); return; }
          var out;
          try { out = cb(self._value); } catch (e) { h.reject(e); return; }
          h.resolve(out);
        });
      }
      self._run = run;
      try { executor(resolve, reject); } catch (e) { reject(e); }
    };
    P.prototype.then = function (onFul, onRej) {
      var self = this;
      return new P(function (resolve, reject) {
        var h = { onFul: onFul, onRej: onRej, resolve: resolve, reject: reject };
        if (self._state) self._run(h); else self._handlers.push(h);
      });
    };
    P.prototype["catch"] = function (onRej) { return this.then(null, onRej); };
    P.resolve = function (v) { return v instanceof P ? v : new P(function (r) { r(v); }); };
    P.reject = function (r) { return new P(function (_, rej) { rej(r); }); };
    window.Promise = P;
  }

  // ---------- DOM ----------
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.NodeList) define(NodeList.prototype, "forEach", Array.prototype.forEach);
  var EP = window.Element && Element.prototype;
  if (EP) {
    define(EP, "matches", EP.msMatchesSelector || EP.webkitMatchesSelector);
    define(EP, "closest", function (sel) {
      var el = this;
      while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement || el.parentNode; }
      return null;
    });
    define(EP, "remove", function () { if (this.parentNode) this.parentNode.removeChild(this); });
  }
  // IE11의 classList.toggle은 두 번째 인자(켜기/끄기)를 무시한다
  (function () {
    var probe = document.createElement("div");
    if (!probe.classList) return;
    probe.classList.toggle("x", false);
    if (!probe.classList.contains("x")) return;          // 정상 동작
    var DTL = window.DOMTokenList.prototype, orig = DTL.toggle;
    DTL.toggle = function (name, force) {
      if (arguments.length < 2) return orig.call(this, name);
      if (force) this.add(name); else this.remove(name);
      return !!force;
    };
  })();
})();
