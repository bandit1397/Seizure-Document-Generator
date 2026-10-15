/*
 * hwp-forms.js — 사건 입력값을 서식원본 HWP의 어느 칸에 넣을지 정한다.
 *
 * 칸 주소는 hwp-fill.js의 문단 주소 형식이다. 서식이 개정되면 HwpFill.inspect()로
 * 새 원본의 주소를 확인해 아래 값을 고친다.
 * 값이 빈 칸은 손대지 않아 원본 서식 그대로 남는다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./case.js"));
  else root.HwpForms = factory(root.CaseUtil);
})(typeof self !== "undefined" ? self : this, function (U) {
  "use strict";

  function has(x) { return x != null && String(x).trim() !== ""; }
  function pick(x, ph) { return has(x) ? String(x) : ph; }
  function edits() {
    var list = [];
    return {
      set: function (path, value) { if (has(value)) list.push({ path: path, set: String(value) }); },
      replace: function (path, pairs) {
        pairs = pairs.filter(function (p) { return has(p[1]); });
        if (pairs.length) list.push({ path: path, replace: pairs });
      },
      list: list
    };
  }
  function at(base, r, c, tail) { return base.concat([[r, c]], tail || [0]); }

  // 경찰수사규칙 별지 제66호서식 압수조서
  function form66(state) {
    var jo = state.jo, o = jo.officer, p = jo.part, e = edits(), B = [0, [0, 0], 1];
    var oName = pick(o.name, "000"), pName = pick(p.name, "000");
    e.set(at(B, 1, 0),
      pick(U.suspects(jo), "000외 0명") + "에 대한 " + pick(jo.crime, "죄명") + " " + U.caseWord(jo) + "사건에 관하여 " +
      pick(U.fmtDT(jo.datetime), "0000. 00. 00. 00:00") + " " + pick(jo.place, "○○○○○") + "에서 " +
      U.title(o.rank) + " " + o.rank + " " + oName + U.josa(oName, "은", "는") + " " +
      U.title(p.rank) + " " + p.rank + " " + pName + U.josa(pName, "을", "를") +
      " 참여하게 하고, 별지 목록의 물건을 다음과 같이 압수하다.");
    e.set(at(B, 3, 0), jo.narrative);
    jo.witnesses.forEach(function (w, i) {
      e.set(at(B, 5 + i, 1), w.name); e.set(at(B, 5 + i, 3), w.rrn); e.set(at(B, 5 + i, 5), w.addr);
    });
    e.set(at(B, 8, 0, [0]), U.fmtD(jo.writeDate));
    e.set(at(B, 8, 0, [1]), jo.agency);
    e.replace(at(B, 8, 0, [2]), [["사법경찰관", U.title(o.rank)], ["계급", o.rank], ["작성자", o.name]]);
    e.replace(at(B, 8, 0, [3]), [["사법경찰관/리", U.title(p.rank)], ["계급", p.rank], ["작성자", p.name]]);
    return [{ edits: e.list }];
  }

  // 경찰수사규칙 별지 제67호서식 압수목록 (1쪽 6건)
  function form67(state) {
    var B = [0, [0, 0], 0];
    return U.chunk(U.filledItems(state), 6).map(function (page, pi) {
      var e = edits();
      page.forEach(function (it, k) {
        var r = 2 + k * 4, h = it.holder, ow = U.ownerOf(it);
        e.set(at(B, r, 0), String(pi * 6 + k + 1));
        e.set(at(B, r, 1), it.name + (it.feature ? "\n(" + it.feature + ")" : ""));
        e.set(at(B, r, 3), it.qty);
        e.set(at(B, r, 5), h.name); e.set(at(B, r + 1, 5), h.addr); e.set(at(B, r + 2, 5), h.rrn); e.set(at(B, r + 3, 5), h.phone);
        e.set(at(B, r, 7), ow.name); e.set(at(B, r + 1, 7), ow.addr); e.set(at(B, r + 2, 7), ow.rrn); e.set(at(B, r + 3, 7), ow.phone);
        e.set(at(B, r, 8), it.opinion);
        e.set(at(B, r, 9), it.note);
      });
      return { edits: e.list };
    });
  }

  // 경찰수사규칙 별지 제68호서식 압수목록 교부서 (피압수자별, 1쪽 17건)
  function form68(state) {
    var jo = state.jo, o = jo.officer, B = [0];
    var groups = U.groupBy(U.filledItems(state), function (it) { return it.holder; });
    var out = [];
    groups.forEach(function (g) {
      var holder = g.person.name, S = [0, [23, 0], 0];
      U.chunk(g.items, 17).forEach(function (page, pi) {
        var e = edits();
        e.set([0, [0, 0], 2], jo.agency);
        if (has(jo.docNo)) e.set(at(B, 1, 0), "제 " + jo.docNo + " 호");
        e.set(at(B, 1, 3), U.fmtD(jo.writeDate));
        if (has(holder)) e.set(at(B, 2, 0), "수 신 : " + holder);
        e.set(at(B, 4, 0),
          pick(U.suspects(jo), "○○○") + "에 대한 " + pick(jo.crime, "○○○○") + " " + U.caseWord(jo) + "사건에 관하여 " +
          pick(holder, "○○○") + U.josa(pick(holder, "○"), "으로", "로") + "부터 다음 물건을 압수하였으므로 이에 압수목록을 교부합니다.");
        page.forEach(function (it, k) {
          var r = 6 + k;
          e.set(at(B, r, 0), String(pi * 17 + k + 1));
          e.set(at(B, r, 1), U.itemText(it));
          e.set(at(B, r, 4), it.qty);
          e.set(at(B, r, 5), it.note);
        });
        e.set(at(S, 1, 2), jo.agency);
        e.set(at(S, 3, 3), U.title(o.rank));
        e.set(at(S, 3, 4), o.rank);
        e.set(at(S, 3, 5, [0, [0, 0], 0]), o.name);
        out.push({ person: holder, edits: e.list });
      });
    });
    return out;
  }

  function who(e, cells, p) {
    e.set(cells.name, p.name); e.set(cells.rrn, p.rrn); e.set(cells.job, p.job); e.set(cells.phone, p.phone); e.set(cells.addr, p.addr);
  }

  // 범죄수사규칙 별지 제62호서식 임의제출 (제출자별, 1쪽 8건)
  function form62(state) {
    var jo = state.jo;
    if (jo.method !== "임의제출") return [];
    var out = [];
    U.groupBy(U.filledItems(state), function (it) { return it.holder; }).forEach(function (g) {
      U.chunk(g.items, 8).forEach(function (page, pi) {
        var e = edits(), T = [3];
        who(e, { name: at(T, 0, 1), rrn: at(T, 0, 3), job: at(T, 1, 1), phone: at(T, 1, 3), addr: at(T, 2, 1) }, g.person);
        e.set([6], U.fmtD(jo.writeDate));
        if (has(g.person.name)) e.replace([7], [[/:\s*제 출 자/, ":  " + g.person.name]]);
        page.forEach(function (it, k) {
          var r = 1 + k;
          e.set(at([9], r, 0), String(pi * 8 + k + 1));
          e.set(at([9], r, 1), U.itemText(it));
          e.set(at([9], r, 2), it.qty);
          e.set(at([9], r, 3), it.disposal);
          e.set(at([9], r, 4), it.note);
        });
        e.replace([11], [["소속관서장", U.chief(jo)]]);
        out.push({ person: g.person.name, edits: e.list });
      });
    });
    return out;
  }

  // 범죄수사규칙 별지 제60호서식 소유권 포기서 (소유자별, 1쪽 9건)
  function form60(state) {
    var jo = state.jo, B = [0], out = [];
    var waived = U.filledItems(state).filter(function (it) { return it.waive; });
    U.groupBy(waived, U.ownerOf).forEach(function (g) {
      U.chunk(g.items, 9).forEach(function (page, pi) {
        var e = edits();
        who(e, { name: at(B, 2, 3), rrn: at(B, 2, 9), job: at(B, 3, 3), phone: at(B, 3, 9), addr: at(B, 4, 3) }, g.person);
        e.set(at(B, 5, 0, [1]), U.fmtD(jo.writeDate));
        if (has(g.person.name)) e.replace(at(B, 5, 0, [2]), [[/:\s+/, ":  " + g.person.name + "    "]]);
        e.set(at(B, 6, 2), U.suspects(jo));
        e.set(at(B, 7, 2), jo.crime);
        e.set(at(B, 8, 2), jo.seizureNo);
        e.set(at(B, 8, 6), jo.receiptNo);
        e.set(at(B, 8, 11), jo.caseNo);
        page.forEach(function (it, k) {
          var r = 10 + k;
          e.set(at(B, r, 0), String(pi * 9 + k + 1));
          e.set(at(B, r, 1), U.itemText(it));
          e.set(at(B, r, 8), it.qty);
          e.set(at(B, r, 10), it.note);
        });
        e.replace(at(B, 19, 0), [["소속관서장", U.chief(jo)]]);
        out.push({ person: g.person.name, edits: e.list });
      });
    });
    return out;
  }

  var FORMS = [
    { id: "jo", name: "압수조서", template: "66", build: form66 },
    { id: "mok", name: "압수목록", template: "67", build: form67 },
    { id: "gyobu", name: "압수목록교부서", template: "68", build: form68 },
    { id: "imui", name: "임의제출", template: "62", build: form62 },
    { id: "pogi", name: "소유권포기서", template: "60", build: form60 }
  ];

  // 서류별로 만들 파일 목록: [{ docId, template, fileName, edits }]
  function plan(state, docIds, base) {
    var files = [];
    FORMS.forEach(function (f) {
      if (docIds && docIds.indexOf(f.id) < 0) return;
      var pages = f.build(state);
      var people = {};
      pages.forEach(function (pg) { people[pg.person || ""] = (people[pg.person || ""] || 0) + 1; });
      var seen = {};
      pages.forEach(function (pg) {
        var who = pg.person || "", n = (seen[who] = (seen[who] || 0) + 1);
        var multiPeople = Object.keys(people).length > 1;
        var name = base + "_" + f.name + (multiPeople && who ? "_" + who : "") +
          (people[who] > 1 || (!multiPeople && pages.length > 1) ? "_" + n : "") + ".hwp";
        files.push({ docId: f.id, template: f.template, fileName: name.replace(/[\\/:*?"<>|]/g, "_"), edits: pg.edits });
      });
    });
    return files;
  }

  return { FORMS: FORMS, plan: plan };
});
