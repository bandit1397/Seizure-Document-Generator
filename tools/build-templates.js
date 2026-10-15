// 서식원본/*.hwp → hwp-templates.js (브라우저가 file://에서도 원본을 읽을 수 있도록 base64로 넣는다)
// 사용: node tools/build-templates.js
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "서식원본");
const T = { "66": "경찰수사규칙_별지66_압수조서", "67": "경찰수사규칙_별지67_압수목록", "68": "경찰수사규칙_별지68_압수목록교부서",
  "60": "범죄수사규칙_별지60_소유권포기서", "62": "범죄수사규칙_별지62_임의제출" };
let out = "// 자동 생성 파일 — 직접 고치지 말고 `node tools/build-templates.js`로 다시 만드세요.\n" +
  "// 국가법령정보센터 서식원본(HWP)을 base64로 담았습니다.\nwindow.HWP_TEMPLATES = {\n";
for (const [id, name] of Object.entries(T)) {
  out += "  \"" + id + "\": \"" + fs.readFileSync(path.join(dir, name + ".hwp")).toString("base64") + "\",\n";
}
out += "};\n";
fs.writeFileSync(path.join(__dirname, "..", "hwp-templates.js"), out);
console.log("hwp-templates.js", out.length, "bytes");
