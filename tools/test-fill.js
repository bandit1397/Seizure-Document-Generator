// 개발용 검사: node tools/test-fill.js <출력폴더>
// 예시 사건으로 5종 HWP를 만들어 저장하고, 아무것도 바꾸지 않은 왕복 저장도 함께 만든다.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const HwpFill = require("../hwp-fill.js"), HwpForms = require("../hwp-forms.js");
const codec = { inflateRaw: b => new Uint8Array(zlib.inflateRawSync(b)), deflateRaw: b => new Uint8Array(zlib.deflateRawSync(b)) };
const T = { "66": "경찰수사규칙_별지66_압수조서", "67": "경찰수사규칙_별지67_압수목록", "68": "경찰수사규칙_별지68_압수목록교부서",
  "60": "범죄수사규칙_별지60_소유권포기서", "62": "범죄수사규칙_별지62_임의제출" };
const out = process.argv[2] || "out";
fs.mkdirSync(out, { recursive: true });
const tpl = id => new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "서식원본", T[id] + ".hwp")));

const person = { name: "김철수", rrn: "900101-1******", job: "무직", phone: "010-0000-0000", addr: "서울 양천구 목동동로 000, 000동 000호" };
const victim = { name: "박영희", rrn: "850505-2******", job: "회사원", phone: "010-1111-2222", addr: "서울 양천구 목동서로 000" };
const item = (name, extra) => Object.assign({ name, qty: "1대", feature: "", holder: person, ownerSame: true, owner: {}, opinion: "피해자 환부",
  note: "임의제출", disposal: "", waive: false, waiveConfirmed: false }, extra);
const state = {
  jo: { agency: "서울양천경찰서", chief: "", suspect: "김철수", suspectOthers: "", crime: "절도", caseType: "피의", caseNo: "2026-001234",
    docNo: "2026-00123", seizureNo: "2026-압-77", receiptNo: "2026-55", datetime: "2026-10-12T12:00", place: "서울 양천구 목동서로 130 앞 노상",
    method: "임의제출", officer: { rank: "경위", name: "홍길동" }, part: { rank: "경위", name: "이몽룡" },
    narrative: "피의자 김철수는 2026. 10. 12. 12:00경 위 장소에서 자전거 1대를 소지하고 있던 중 절도한 것이라는 취지로 진술하였다.\n\n이에 제출 거부권을 고지한 후 임의제출받아 압수하다.",
    witnesses: [{ name: "김철수", rrn: "900101-1******", addr: person.addr }, { name: "", rrn: "", addr: "" }, { name: "", rrn: "", addr: "" }],
    writeDate: "2026-10-12" },
  items: [item("자전거", { feature: "흰색, 제조사 미상", ownerSame: false, owner: victim, waive: true, disposal: "반환 의사 없음" })]
    .concat([2, 3, 4, 5, 6, 7].map(n => item("휴대전화 " + n, { qty: "1개" })))
};

(async () => {
  for (const id of Object.keys(T)) {               // 왕복(무수정) 저장
    fs.writeFileSync(path.join(out, "roundtrip_" + id + ".hwp"), await HwpFill.fill(tpl(id), [], codec));
  }
  const files = HwpForms.plan(state, null, "20261012_김철수");
  for (const f of files) {
    const bytes = await HwpFill.fill(tpl(f.template), f.edits, codec);
    fs.writeFileSync(path.join(out, f.fileName), bytes);
    console.log(f.fileName, bytes.length, "bytes,", f.edits.length, "edits");
  }
})().catch(e => { console.error(e); process.exit(1); });
