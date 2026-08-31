// 驗證 marker_text 清理邏輯（含 4 種 raw text 開頭）
const cases = [
  { input: "站上三均線 + 5日/20日漲幅 0.21%/1.04%", expect: "站上三均線 + 5日/20日漲幅 0.21%/1.04%" },
  { input: "x || {\"close\":null,\"ma5\":null,\"position\":\"aboveBar\"} || {\"close\":null}", expect: "x" },
  { input: " || {\"close\":null,\"ma5\":null,\"position\":\"aboveBar\"} || {\"close\":null}", expect: "" },
  { input: "test || {\"close\":null}", expect: "test" },
  { input: "賣出 || {\"close\":null,\"position\":\"aboveBar\"}", expect: "賣出" },
  { input: "逢低買 || {\"close\":null,\"position\":\"belowBar\"}", expect: "逢低買" },
  { input: "", expect: "" },
  { input: "x", expect: "x" },
];
let pass = 0, fail = 0;
for (const c of cases) {
  const got = c.input.replace(/\s*\|\|\s*\{[\s\S]*$/, "").trim();
  const ok = got === c.expect;
  if (ok) pass++;
  else { fail++; console.log(`✗ input=${JSON.stringify(c.input)} expect=${JSON.stringify(c.expect)} got=${JSON.stringify(got)}`); }
}
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
