/* 词库体检：数据是手抄 PDF 来的，最容易出的错是抄漏、抄重、中英错位。
   这些检查不保证翻译对，但能保证结构干净、出题时不会撞车。 */
"use strict";
const L = require("./英语4A词库.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log("✗ " + name + (extra ? "  → " + extra : ""));
}
function eq(name, a, b) { ok(name, a === b, JSON.stringify(a) + " ≠ " + JSON.stringify(b)); }

/* ---- 规模 ---- */
eq("十个 unit", L.UNITS.length, 10);
eq("unit 编号是 1..10", L.UNITS.map(u => u.u).join(","), "1,2,3,4,5,6,7,8,9,10");
ok("总条数在预习单量级上", L.count > 200 && L.count < 240, "count=" + L.count);
eq("单词 + 词组 = 全部", L.words().length + L.phrases().length, L.count);
ok("每个 unit 都不少于 15 条",
   L.UNITS.every(u => u.words.length >= 15),
   L.UNITS.map(u => u.u + ":" + u.words.length).join(" "));

/* ---- 字段 ---- */
const bad = L.all().filter(x => !x.w || !x.c || !x.unit || !x.id);
eq("没有缺字段的条目", bad.length, 0);

const ascii = L.all().filter(x => /[一-龥]/.test(x.w));
eq("英文栏里没混进中文", ascii.length, 0);

const cn = L.all().filter(x => !/[一-龥]/.test(x.c));
eq("中文栏里都有中文", cn.length, 0);

const pos = new Set(L.words().map(x => x.p));
ok("词性都在常见集合里",
   [...pos].every(p => ["n.", "v.", "adj.", "adv.", "v.& n.", "v./n."].includes(p)),
   [...pos].join(" "));

/* ---- 词组判定 ---- */
ok("标成词组的都没有词性", L.phrases().every(x => x.p === ""));
ok("标成单词的都有词性", L.words().every(x => x.p !== ""));
ok("单个英文单词不会被当成词组",
   L.phrases().every(x => /[ .]/.test(x.w)),
   L.phrases().filter(x => !/[ .]/.test(x.w)).map(x => x.w).join(" "));

/* ---- 不重复：出题时两个一样的词会让选项自相矛盾 ---- */
const seen = new Map();
const dupW = [];
L.all().forEach(x => {
  const k = x.w.toLowerCase();
  if (seen.has(k)) dupW.push(k + "（" + seen.get(k) + " / u" + x.unit + "）");
  else seen.set(k, "u" + x.unit);
});
eq("英文没有重复", dupW.length, 0, dupW.join("，"));

const seenC = new Map();
const dupC = [];
L.all().forEach(x => {
  if (seenC.has(x.c)) dupC.push(x.c + "（" + seenC.get(x.c) + " / " + x.w + "）");
  else seenC.set(x.c, x.w);
});
eq("中文释义没有完全重复", dupC.length, 0, dupC.join("，"));

const ids = new Set(L.all().map(x => x.id));
eq("id 唯一", ids.size, L.count);

/* ---- 干扰项够不够：选择题一题要 1 正 3 误 ---- */
L.UNITS.forEach(u => {
  const ws = L.unit(u.u).filter(x => !x.phrase);
  ok("unit " + u.u + " 的单词够出四选一", ws.length >= 4, "只有 " + ws.length + " 个");
});

/* ---- 取数接口 ---- */
eq("unit(3) 条数", L.unit(3).length, L.UNITS[2].words.length);
ok("unit(99) 返回空", L.unit(99).length === 0);
ok("all() 是副本，改不坏原数据", (() => { const a = L.all(); a.pop(); return L.all().length === L.count; })());

console.log(fail ? `\n${fail} 项没过，${pass} 项通过` : `全部 ${pass} 项通过`);
process.exit(fail ? 1 : 0);
