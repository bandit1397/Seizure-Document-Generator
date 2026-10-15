/*
 * hwp-fill.js — HWP 5.0 원본 서식의 표 칸에 글자를 채워 새 .hwp 파일로 만든다.
 *
 * 한글 프로그램 없이 동작한다.
 *  1) 복합 파일(CFB)에서 BodyText/Section0 스트림을 꺼내 압축을 푼다.
 *  2) 레코드(문단·표·셀)를 해석해 지정한 문단의 글자만 바꾼다.
 *     - 바뀐 문단의 줄 배치 정보(LINE_SEG)는 지워서 한글이 열 때 다시 계산하게 한다.
 *     - 누름틀(%clk) 같은 필드는 일반 글자로 바꾸고, 그 밖의 컨트롤(표·단 정의 등)은 그대로 둔다.
 *  3) 다시 압축해 원본과 같은 스트림 구성으로 복합 파일을 새로 쓴다.
 *
 * 문단 주소(path): [최상위 문단 번호, [행, 열], 셀 안 문단 번호, [행, 열], ...]
 *   예) [0, [0, 0], 1, [3, 0], 0] = 0번 문단의 표 → (0,0) 셀의 1번 문단 → 그 안 표의 (3,0) 셀 → 0번 문단
 *
 * 브라우저와 Node 모두에서 쓴다. 압축은 호출하는 쪽이 { inflateRaw, deflateRaw }로 넘긴다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HwpFill = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- CFB(복합 파일) 읽기
  var FREESECT = 0xFFFFFFFF, ENDOFCHAIN = 0xFFFFFFFE, FATSECT = 0xFFFFFFFD, NOSTREAM = 0xFFFFFFFF;

  function cfbRead(buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    for (var i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("HWP(복합 파일) 형식이 아닙니다.");
    var shift = dv.getUint16(30, true), ssz = 1 << shift, miniShift = dv.getUint16(32, true);
    var nFat = dv.getUint32(44, true), firstDir = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
    var firstMiniFat = dv.getUint32(60, true), firstDifat = dv.getUint32(68, true);
    function sectOff(n) { return (n + 1) * ssz; }

    var fatSects = [];
    for (i = 0; i < 109 && fatSects.length < nFat; i++) fatSects.push(dv.getUint32(76 + i * 4, true));
    var d = firstDifat;
    while (fatSects.length < nFat && d !== ENDOFCHAIN && d !== FREESECT) {
      for (i = 0; i < ssz / 4 - 1 && fatSects.length < nFat; i++) fatSects.push(dv.getUint32(sectOff(d) + i * 4, true));
      d = dv.getUint32(sectOff(d) + ssz - 4, true);
    }
    var fat = [];
    fatSects.forEach(function (s) { for (var k = 0; k < ssz / 4; k++) fat.push(dv.getUint32(sectOff(s) + k * 4, true)); });

    function chain(start, table) {
      var out = [], guard = 0;
      while (start !== ENDOFCHAIN && start !== FREESECT && guard++ < 1e6) { out.push(start); start = table[start]; }
      return out;
    }
    function readChain(start) {
      var secs = chain(start, fat), out = new Uint8Array(secs.length * ssz);
      secs.forEach(function (s, k) { out.set(buf.subarray(sectOff(s), sectOff(s) + ssz), k * ssz); });
      return out;
    }

    var dirBytes = readChain(firstDir), entries = [];
    for (var off = 0; off + 128 <= dirBytes.length; off += 128) {
      var e = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
      var nameLen = e.getUint16(64, true), name = "";
      for (var c = 0; c < Math.max(0, nameLen / 2 - 1); c++) name += String.fromCharCode(e.getUint16(c * 2, true));
      entries.push({
        name: name, type: e.getUint8(66), left: e.getUint32(68, true), right: e.getUint32(72, true), child: e.getUint32(76, true),
        clsid: dirBytes.slice(off + 80, off + 96), state: e.getUint32(96, true),
        ctime: dirBytes.slice(off + 100, off + 108), mtime: dirBytes.slice(off + 108, off + 116),
        start: e.getUint32(116, true), size: e.getUint32(120, true)
      });
    }
    var rootE = entries[0];
    var miniStream = rootE.start === ENDOFCHAIN ? new Uint8Array(0) : readChain(rootE.start);
    var miniFat = [];
    if (firstMiniFat !== ENDOFCHAIN) {
      var mf = readChain(firstMiniFat);
      for (i = 0; i + 4 <= mf.length; i += 4) miniFat.push(new DataView(mf.buffer, mf.byteOffset + i, 4).getUint32(0, true));
    }
    var mssz = 1 << miniShift;

    function streamData(e) {
      if (e.size < cutoff) {
        var secs = chain(e.start, miniFat), out = new Uint8Array(secs.length * mssz);
        secs.forEach(function (s, k) { out.set(miniStream.subarray(s * mssz, (s + 1) * mssz), k * mssz); });
        return out.slice(0, e.size);
      }
      return readChain(e.start).slice(0, e.size);
    }

    // 트리를 따라가며 저장소/스트림 구조를 만든다
    function node(idx) {
      var e = entries[idx];
      var n = { name: e.name, type: e.type, clsid: e.clsid, state: e.state, ctime: e.ctime, mtime: e.mtime };
      if (e.type === 2) n.data = streamData(e);
      else {
        n.children = [];
        (function walk(k) {
          if (k === NOSTREAM || k >= entries.length) return;
          walk(entries[k].left); n.children.push(node(k)); walk(entries[k].right);
        })(e.child);
      }
      return n;
    }
    return node(0);
  }

  // ---------------------------------------------------------------- CFB 쓰기 (v3, 512바이트 섹터)
  function cfbCompare(a, b) {
    if (a.length !== b.length) return a.length - b.length;
    var A = a.toUpperCase(), B = b.toUpperCase();
    return A < B ? -1 : A > B ? 1 : 0;
  }

  function cfbWrite(rootNode) {
    var SS = 512, MSS = 64, CUTOFF = 4096;
    var list = [];                       // 디렉터리 항목 (0번 = 루트)
    (function flatten(n) {
      var id = list.length;
      var item = { n: n, id: id, left: NOSTREAM, right: NOSTREAM, child: NOSTREAM };
      list.push(item);
      if (n.children) {
        var kids = n.children.map(flatten);
        kids.sort(function (x, y) { return cfbCompare(x.n.name, y.n.name); });
        item.child = (function balance(lo, hi) {   // 정렬된 형제들로 균형 이진 탐색 트리를 만든다
          if (lo > hi) return NOSTREAM;
          var mid = (lo + hi) >> 1;
          kids[mid].left = balance(lo, mid - 1);
          kids[mid].right = balance(mid + 1, hi);
          return kids[mid].id;
        })(0, kids.length - 1);
      }
      return item;
    })(rootNode);

    // 작은 스트림은 미니 스트림, 큰 스트림은 일반 섹터에 배치
    var mini = [], miniFat = [], big = [];
    list.forEach(function (it) {
      if (it.n.type !== 2) return;
      var data = it.n.data, size = data.length;
      it.size = size;
      if (size === 0) { it.start = ENDOFCHAIN; return; }
      if (size < CUTOFF) {
        var first = mini.length / MSS, cnt = Math.ceil(size / MSS);
        for (var k = 0; k < cnt; k++) miniFat.push(k === cnt - 1 ? ENDOFCHAIN : first + k + 1);
        var padded = new Uint8Array(cnt * MSS); padded.set(data);
        for (k = 0; k < padded.length; k++) mini.push(padded[k]);
        it.start = first;
      } else big.push(it);
    });
    var miniBytes = Uint8Array.from(mini);

    var sectors = [];                    // 각 일반 섹터의 내용(Uint8Array) 또는 null(FAT 자리)
    var fatEntries = [];
    function addChain(bytes) {
      var n = Math.ceil(bytes.length / SS), start = sectors.length;
      for (var k = 0; k < n; k++) {
        var s = new Uint8Array(SS); s.set(bytes.subarray(k * SS, Math.min(bytes.length, (k + 1) * SS)));
        sectors.push(s); fatEntries.push(k === n - 1 ? ENDOFCHAIN : start + k + 1);
      }
      return n ? start : ENDOFCHAIN;
    }
    big.forEach(function (it) { it.start = addChain(it.n.data); });
    var rootItem = list[0];
    rootItem.start = addChain(miniBytes); rootItem.size = miniBytes.length;

    var mfBytes = new Uint8Array(Math.ceil(miniFat.length * 4 / SS) * SS).fill(0xFF);
    var mfDv = new DataView(mfBytes.buffer);
    miniFat.forEach(function (v, k) { mfDv.setUint32(k * 4, v, true); });
    var miniFatStart = miniFat.length ? addChain(mfBytes) : ENDOFCHAIN;
    var miniFatCount = mfBytes.length / SS;

    var dirBytes = new Uint8Array(Math.ceil(list.length / 4) * 512);
    var dd = new DataView(dirBytes.buffer);
    for (var e = 0; e < dirBytes.length / 128; e++) {          // 빈 항목 기본값
      dd.setUint32(e * 128 + 68, NOSTREAM, true); dd.setUint32(e * 128 + 72, NOSTREAM, true); dd.setUint32(e * 128 + 76, NOSTREAM, true);
    }
    list.forEach(function (it, k) {
      var o = k * 128, name = it.n.name;
      if (name.length > 31) throw new Error("스트림 이름이 너무 깁니다: " + name);
      for (var c = 0; c < name.length; c++) dd.setUint16(o + c * 2, name.charCodeAt(c), true);
      dd.setUint16(o + 64, (name.length + 1) * 2, true);
      dd.setUint8(o + 66, it.n.type); dd.setUint8(o + 67, 1);   // 모두 검은색 노드
      dd.setUint32(o + 68, it.left, true); dd.setUint32(o + 72, it.right, true); dd.setUint32(o + 76, it.child, true);
      if (it.n.clsid) dirBytes.set(it.n.clsid, o + 80);
      dd.setUint32(o + 96, it.n.state || 0, true);
      if (it.n.type !== 2 && it.n.type !== 5) {               // 스트림에는 시간을 쓰지 않는다
        if (it.n.ctime) dirBytes.set(it.n.ctime, o + 100);
        if (it.n.mtime) dirBytes.set(it.n.mtime, o + 108);
      }
      if (it.n.type === 5 && it.n.mtime) dirBytes.set(it.n.mtime, o + 108);
      var start = it.n.type === 1 ? 0 : (it.start == null ? ENDOFCHAIN : it.start);
      dd.setUint32(o + 116, start, true);
      dd.setUint32(o + 120, it.n.type === 1 ? 0 : (it.size || 0), true);
    });
    var dirStart = addChain(dirBytes);

    // FAT 섹터 수는 FAT 자신도 포함해야 하므로 맞을 때까지 늘린다
    var nFat = 1;
    while (Math.ceil((sectors.length + nFat) / (SS / 4)) > nFat) nFat++;
    if (nFat > 109) throw new Error("파일이 너무 큽니다.");
    var fatStart = sectors.length;
    for (var f = 0; f < nFat; f++) { sectors.push(null); fatEntries.push(FATSECT); }
    var fatBytes = new Uint8Array(nFat * SS).fill(0xFF), fdv = new DataView(fatBytes.buffer);
    fatEntries.forEach(function (v, k) { fdv.setUint32(k * 4, v, true); });
    for (f = 0; f < nFat; f++) sectors[fatStart + f] = fatBytes.subarray(f * SS, (f + 1) * SS);

    var out = new Uint8Array(SS + sectors.length * SS), hv = new DataView(out.buffer);
    out.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 0);
    hv.setUint16(24, 0x003E, true); hv.setUint16(26, 0x0003, true); hv.setUint16(28, 0xFFFE, true);
    hv.setUint16(30, 9, true); hv.setUint16(32, 6, true);
    hv.setUint32(44, nFat, true); hv.setUint32(48, dirStart, true); hv.setUint32(56, CUTOFF, true);
    hv.setUint32(60, miniFatStart, true); hv.setUint32(64, miniFatCount, true);
    hv.setUint32(68, ENDOFCHAIN, true); hv.setUint32(72, 0, true);
    for (var k = 0; k < 109; k++) hv.setUint32(76 + k * 4, k < nFat ? fatStart + k : FREESECT, true);
    sectors.forEach(function (s, n) { out.set(s, SS + n * SS); });
    return out;
  }

  function findStream(node, path) {
    var parts = path.split("/"), n = node;
    for (var i = 0; i < parts.length; i++) {
      n = (n.children || []).filter(function (c) { return c.name === parts[i]; })[0];
      if (!n) return null;
    }
    return n;
  }

  // ---------------------------------------------------------------- HWP 레코드
  var TAG = { PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, PARA_LINE_SEG: 69, PARA_RANGE_TAG: 70, CTRL_HEADER: 71, LIST_HEADER: 72, TABLE: 77 };

  function parseRecords(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), recs = [], off = 0;
    while (off + 4 <= u8.length) {
      var h = dv.getUint32(off, true), tag = h & 0x3FF, level = (h >>> 10) & 0x3FF, size = h >>> 20, hl = 4;
      if (size === 0xFFF) { size = dv.getUint32(off + 4, true); hl = 8; }
      recs.push({ tag: tag, level: level, data: u8.slice(off + hl, off + hl + size) });
      off += hl + size;
    }
    return recs;
  }
  function serializeRecords(recs) {
    var total = 0;
    recs.forEach(function (r) { total += (r.data.length >= 0xFFF ? 8 : 4) + r.data.length; });
    var out = new Uint8Array(total), dv = new DataView(out.buffer), off = 0;
    recs.forEach(function (r) {
      var big = r.data.length >= 0xFFF;
      dv.setUint32(off, (r.tag & 0x3FF) | ((r.level & 0x3FF) << 10) | ((big ? 0xFFF : r.data.length) << 20) >>> 0, true);
      if (big) dv.setUint32(off + 4, r.data.length, true);
      off += big ? 8 : 4;
      out.set(r.data, off); off += r.data.length;
    });
    return out;
  }
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  function ctrlId(rec) { return String.fromCharCode(rec.data[3], rec.data[2], rec.data[1], rec.data[0]); }

  // ---------------------------------------------------------------- 문단·표 구조
  function parasIn(recs, start, end, level) {
    var paras = [];
    for (var i = start; i < end; i++) {
      if (recs[i].tag !== TAG.PARA_HEADER || recs[i].level !== level) continue;
      var j = i + 1;
      while (j < end && recs[j].level > level) j++;
      paras.push({ start: i, end: j, level: level });
      i = j - 1;
    }
    return paras;
  }
  function cellsOf(recs, para) {
    var L = para.level, k;
    for (k = para.start + 1; k < para.end; k++) {
      if (recs[k].tag === TAG.CTRL_HEADER && recs[k].level === L + 1 && ctrlId(recs[k]) === "tbl ") break;
    }
    if (k >= para.end) return null;
    var tEnd = k + 1;
    while (tEnd < para.end && recs[tEnd].level > L + 1) tEnd++;
    var cells = [];
    for (var m = k + 1; m < tEnd; m++) {
      if (recs[m].tag !== TAG.LIST_HEADER || recs[m].level !== L + 2) continue;
      var n = m + 1;
      while (n < tEnd && !(recs[n].tag === TAG.LIST_HEADER && recs[n].level === L + 2)) n++;
      var d = recs[m].data;
      cells.push({ col: u16(d, 8), row: u16(d, 10), paras: parasIn(recs, m + 1, n, L + 2) });
      m = n - 1;
    }
    return cells;
  }
  function resolve(recs, path) {
    var paras = parasIn(recs, 0, recs.length, 0), p = null;
    for (var i = 0; i < path.length; i++) {
      var step = path[i];
      if (typeof step === "number") {
        p = paras[step];
        if (!p) throw new Error("문단을 찾을 수 없습니다: " + JSON.stringify(path));
      } else {
        var cells = p && cellsOf(recs, p);
        var cell = cells && cells.filter(function (c) { return c.row === step[0] && c.col === step[1]; })[0];
        if (!cell) throw new Error("표 칸을 찾을 수 없습니다: " + JSON.stringify(path));
        paras = cell.paras;
      }
    }
    if (typeof path[path.length - 1] !== "number") throw new Error("주소는 문단 번호로 끝나야 합니다.");
    return p;
  }

  // ---------------------------------------------------------------- 문단 글자 바꾸기
  var EXTENDED = { 1: 1, 2: 1, 3: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 21: 1, 22: 1, 23: 1 };
  var INLINE = { 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 19: 1, 20: 1 };

  function readPara(recs, para) {
    var hdr = recs[para.start].data, L = para.level, raw = [13], shapes = [], ctrls = [];
    for (var i = para.start + 1; i < para.end; i++) {
      var r = recs[i];
      if (r.level !== L + 1) continue;
      if (r.tag === TAG.PARA_TEXT) { raw = []; for (var k = 0; k + 1 < r.data.length; k += 2) raw.push(u16(r.data, k)); }
      else if (r.tag === TAG.PARA_CHAR_SHAPE) { for (k = 0; k + 8 <= r.data.length; k += 8) shapes.push([u32(r.data, k), u32(r.data, k + 4)]); }
      else if (r.tag === TAG.CTRL_HEADER) {
        var j = i + 1;
        while (j < para.end && recs[j].level > L + 1) j++;
        ctrls.push(recs.slice(i, j));
      }
    }
    function shapeAt(pos) {
      var id = shapes.length ? shapes[0][1] : 0;
      shapes.forEach(function (s) { if (s[0] <= pos) id = s[1]; });
      return id;
    }
    var tokens = [], visible = [], ci = 0;
    for (var p = 0; p < raw.length;) {
      var c = raw[p];
      if (c < 32 && (EXTENDED[c] || INLINE[c])) {
        var tok = { code: c, units: raw.slice(p, p + 8), shape: shapeAt(p) };
        if (EXTENDED[c]) tok.ctrl = ctrls[ci++];
        tokens.push(tok); p += 8;
      } else {
        if (c !== 13) visible.push({ ch: c, shape: shapeAt(p) });   // 일반 글자와 줄바꿈·묶음빈칸 등 1칸짜리 문자
        p++;
      }
    }
    if (ci !== ctrls.length) throw new Error("문단의 컨트롤 수가 맞지 않습니다.");
    return { hdr: hdr, tokens: tokens, visible: visible, shapeAt: shapeAt };
  }

  function visibleText(info) { return info.visible.map(function (v) { return String.fromCharCode(v.ch); }).join(""); }

  // edit: { set: "글자" } 또는 { replace: [[찾을 글자 또는 정규식, 바꿀 글자, "last"?], ...] }
  function rewritePara(recs, para, edit) {
    var info = readPara(recs, para), L = para.level;
    var vis = info.visible.slice();
    var baseShape = vis.length ? vis[0].shape : info.shapeAt(0);
    function charsOf(str, shape) {
      var out = [];
      for (var i = 0; i < str.length; i++) out.push({ ch: str.charCodeAt(i) === 0x0A ? 10 : str.charCodeAt(i), shape: shape });
      return out;
    }
    if (edit.set != null) vis = charsOf(String(edit.set).replace(/\r\n?/g, "\n"), baseShape);
    (edit.replace || []).forEach(function (r) {
      var text = vis.map(function (v) { return String.fromCharCode(v.ch); }).join("");
      var idx, len;
      if (r[0] instanceof RegExp) { var m = r[0].exec(text); idx = m ? m.index : -1; len = m ? m[0].length : 0; }
      else { idx = r[2] === "last" ? text.lastIndexOf(r[0]) : text.indexOf(r[0]); len = r[0].length; }
      if (idx < 0) throw new Error("서식에서 '" + r[0] + "' 글자를 찾지 못했습니다.");
      var shape = vis[idx] ? vis[idx].shape : baseShape;
      vis = vis.slice(0, idx).concat(charsOf(String(r[1]), shape), vis.slice(idx + len));
    });

    // 남길 컨트롤: 누름틀(필드 시작 3·필드 끝 4)을 뺀 확장 컨트롤
    var kept = info.tokens.filter(function (t) { return EXTENDED[t.code] && t.code !== 3; });
    var units = [], unitShapes = [], mask = 0;
    kept.forEach(function (t) {
      t.units.forEach(function (u) { units.push(u); unitShapes.push(t.shape); });
      mask |= 1 << t.code;
    });
    vis.forEach(function (v) { units.push(v.ch); unitShapes.push(v.shape); if (v.ch < 32) mask |= 1 << v.ch; });
    units.push(13); unitShapes.push(unitShapes.length ? unitShapes[unitShapes.length - 1] : baseShape);

    var runs = [];
    unitShapes.forEach(function (s, pos) { if (!runs.length || runs[runs.length - 1][1] !== s) runs.push([pos, s]); });

    var hdr = info.hdr.slice(), hd = new DataView(hdr.buffer);
    var lastFlag = u32(info.hdr, 0) & 0x80000000;
    hd.setUint32(0, (units.length | lastFlag) >>> 0, true);
    hd.setUint32(4, mask >>> 0, true);
    hd.setUint16(12, runs.length, true);
    hd.setUint16(14, 0, true);        // 범위 태그 없음
    hd.setUint16(16, 0, true);        // 줄 배치 정보 없음 → 한글이 다시 계산
    var outRecs = [{ tag: TAG.PARA_HEADER, level: L, data: hdr }];
    if (units.length > 1) {
      var t = new Uint8Array(units.length * 2), tv = new DataView(t.buffer);
      units.forEach(function (u, k) { tv.setUint16(k * 2, u, true); });
      outRecs.push({ tag: TAG.PARA_TEXT, level: L + 1, data: t });
    }
    var cs = new Uint8Array(runs.length * 8), cv = new DataView(cs.buffer);
    runs.forEach(function (r, k) { cv.setUint32(k * 8, r[0], true); cv.setUint32(k * 8 + 4, r[1], true); });
    outRecs.push({ tag: TAG.PARA_CHAR_SHAPE, level: L + 1, data: cs });
    kept.forEach(function (tk) { outRecs.push.apply(outRecs, tk.ctrl); });
    return outRecs;
  }

  // ---------------------------------------------------------------- 압축 스트림
  // 한글은 deflate 데이터 뒤에 CRC32와 원래 길이(각 4바이트, gzip 꼬리와 같은 형식)를 붙인다.
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function inflateStream(data, codec) {
    function tryInflate(part) { return Promise.resolve().then(function () { return codec.inflateRaw(part); }); }
    if (data.length <= 8) return tryInflate(data).then(function (out) { return { body: out, trailer: false }; });
    var tail = data.subarray(data.length - 8);
    return tryInflate(data.subarray(0, data.length - 8)).then(function (out) {
      if (crc32(out) === u32(tail, 0) && (out.length >>> 0) === u32(tail, 4)) return { body: out, trailer: true };
      return tryInflate(data).then(function (o2) { return { body: o2, trailer: false }; });
    }, function () {
      return tryInflate(data).then(function (o2) { return { body: o2, trailer: false }; });
    });
  }
  function deflateStream(body, trailer, codec) {
    return Promise.resolve(codec.deflateRaw(body)).then(function (comp) {
      if (!trailer) return comp;
      var out = new Uint8Array(comp.length + 8), dv = new DataView(out.buffer);
      out.set(comp);
      dv.setUint32(comp.length, crc32(body), true);
      dv.setUint32(comp.length + 4, body.length >>> 0, true);
      return out;
    });
  }

  // ---------------------------------------------------------------- 공개 API
  function sectionOf(doc) {
    var header = findStream(doc, "FileHeader");
    if (!header) throw new Error("HWP 파일 헤더가 없습니다.");
    var flags = u32(header.data, 36);
    if (flags & 2) throw new Error("암호가 걸린 HWP는 쓸 수 없습니다.");
    if (flags & 4) throw new Error("배포용 HWP는 쓸 수 없습니다.");
    var sec = findStream(doc, "BodyText/Section0");
    if (!sec) throw new Error("본문(Section0)이 없습니다.");
    return { sec: sec, compressed: !!(flags & 1) };
  }

  // edits: [{ path: [...], set: "..." } | { path: [...], replace: [[찾기, 바꾸기], ...] }]
  function fill(templateBytes, edits, codec) {
    var doc = cfbRead(templateBytes), s = sectionOf(doc), trailer = false;
    var read = s.compressed ? inflateStream(s.sec.data, codec) : Promise.resolve({ body: s.sec.data, trailer: false });
    return read.then(function (got) {
      trailer = got.trailer;
      var recs = parseRecords(got.body);
      var targets = edits.map(function (e) { return { e: e, p: resolve(recs, e.path) }; });
      targets.forEach(function (t, i) {
        targets.forEach(function (u, j) { if (i < j && t.p.start === u.p.start) throw new Error("같은 문단을 두 번 채우려 합니다: " + JSON.stringify(t.e.path)); });
      });
      targets.sort(function (a, b) { return b.p.start - a.p.start; });     // 뒤에서부터 바꿔야 앞쪽 위치가 유지된다
      targets.forEach(function (t) {
        var repl = rewritePara(recs, t.p, t.e);
        Array.prototype.splice.apply(recs, [t.p.start, t.p.end - t.p.start].concat(repl));
      });
      var raw = serializeRecords(recs);
      return s.compressed ? deflateStream(raw, trailer, codec) : raw;
    }).then(function (newBody) {
      s.sec.data = newBody;
      return cfbWrite(doc);
    });
  }

  // 개발용: 문단 주소와 글자를 나열한다
  function inspect(templateBytes, codec) {
    var doc = cfbRead(templateBytes), s = sectionOf(doc);
    var read = s.compressed ? inflateStream(s.sec.data, codec) : Promise.resolve({ body: s.sec.data });
    return read.then(function (got) {
      var recs = parseRecords(got.body), lines = [];
      (function walk(paras, path) {
        paras.forEach(function (p, i) {
          var here = path.concat([i]);
          lines.push(JSON.stringify(here) + "  " + JSON.stringify(visibleText(readPara(recs, p))));
          (cellsOf(recs, p) || []).forEach(function (c) { walk(c.paras, here.concat([[c.row, c.col]])); });
        });
      })(parasIn(recs, 0, recs.length, 0), []);
      return lines;
    });
  }

  return { fill: fill, inspect: inspect, _cfbRead: cfbRead, _cfbWrite: cfbWrite, _parseRecords: parseRecords, _serializeRecords: serializeRecords };
});
