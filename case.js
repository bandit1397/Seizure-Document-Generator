/*
 * case.js — 사건 입력값을 서류 문구로 바꾸는 공통 함수 (화면 미리보기·HWP 저장이 함께 쓴다)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CaseUtil = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OFFICER_RANKS = ["경위", "경감", "경정", "총경"];

  // 받침에 따라 조사 선택: josa("홍길동", "은", "는") → "은", josa("김철수", "으로", "로") → "로"
  function josa(word, a, b) {
    var w = String(word || "").trim(); if (!w) return a;
    var code = w.charCodeAt(w.length - 1) - 0xAC00;
    if (code < 0 || code > 11171) return a + "(" + b + ")";
    var jong = code % 28;
    if (a === "으로") return jong === 0 || jong === 8 ? b : a;
    return jong ? a : b;
  }
  function fmtDT(dt) {
    var m = (dt || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return "";
    return m[1] + ". " + m[2] + ". " + m[3] + "." + (m[4] ? " " + m[4] + ":" + m[5] : "");
  }
  function fmtD(d) { var m = (d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + ". " + m[2] + ". " + m[3] + "." : ""; }
  function title(rank) { return OFFICER_RANKS.indexOf(rank) >= 0 ? "사법경찰관" : "사법경찰리"; }
  function chief(jo) { return jo.chief || (jo.agency ? jo.agency + "장" : ""); }
  function suspects(jo) {
    var n = parseInt(jo.suspectOthers, 10);
    return (jo.suspect || "") + (jo.suspect && n > 0 ? " 외 " + n + "명" : "");
  }
  function caseWord(jo) { return jo.caseType === "혐의" ? "혐의" : "피의"; }
  function ownerOf(it) { return it.ownerSame ? it.holder : it.owner; }
  function personKey(p) { return (p.name || "").trim() + "|" + (p.rrn || "").trim(); }
  function groupBy(items, getP) {
    var map = {}, order = [];
    items.forEach(function (it) {
      var p = getP(it), k = personKey(p);
      if (!map[k]) { map[k] = { person: p, items: [] }; order.push(k); }
      map[k].items.push(it);
    });
    return order.map(function (k) { return map[k]; });
  }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; }
  function filledItems(state) { return state.items.filter(function (it) { return (it.name || "").trim(); }); }
  function itemText(it) { return it.name + (it.feature ? " (" + it.feature + ")" : ""); }

  return {
    OFFICER_RANKS: OFFICER_RANKS, josa: josa, fmtDT: fmtDT, fmtD: fmtD, title: title, chief: chief, suspects: suspects,
    caseWord: caseWord, ownerOf: ownerOf, personKey: personKey, groupBy: groupBy, chunk: chunk, filledItems: filledItems, itemText: itemText
  };
});
