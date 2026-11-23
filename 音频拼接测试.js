/* 音频拼接的测试：拿 音频/ 里真实的 mp3 来验，不用假数据。 */
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("./音频拼接.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log("✗ " + name + (extra ? "  → " + extra : ""));
}
function near(name, a, b, tol) {
  ok(name, Math.abs(a - b) <= tol, a + " ≠ " + b + "（差 " + Math.abs(a - b).toFixed(3) + "）");
}

const DIR = path.join(__dirname, "音频");
const files = fs.readdirSync(DIR).filter(f => f.endsWith(".mp3")).sort().slice(0, 6);
ok("找得到测试用的 mp3", files.length >= 3, "只有 " + files.length + " 个");

const raw = files.map(f => new Uint8Array(fs.readFileSync(path.join(DIR, f))));

/* ---- 去标签 ---- */
raw.forEach((b, i) => {
  const s = L.stripTags(b);
  ok("第 " + (i + 1) + " 个文件去标签后不为空", s.length > 0);
  ok("去标签后开头就是帧同步头", s[0] === 0xff && (s[1] & 0xe0) === 0xe0,
     "开头是 " + s[0].toString(16) + " " + s[1].toString(16));
  ok("去标签只会变短", s.length <= b.length);
  ok("去过一次再去一次不变", L.stripTags(s).length === s.length);
});
{
  // 手造一个带 ID3v2 头的文件：头 + 原始音频
  const body = L.stripTags(raw[0]);
  const head = new Uint8Array(10 + 50);
  head[0] = 0x49; head[1] = 0x44; head[2] = 0x33;    // "ID3"
  head[9] = 50;                                       // 内容 50 字节
  const joined = new Uint8Array(head.length + body.length);
  joined.set(head, 0); joined.set(body, head.length);
  ok("认得出 ID3v2 头并整块去掉", L.stripTags(joined).length === body.length);
}
{
  // ID3v1 在结尾，128 字节以 "TAG" 开头
  const body = L.stripTags(raw[0]);
  const tail = new Uint8Array(128);
  tail[0] = 0x54; tail[1] = 0x41; tail[2] = 0x47;     // "TAG"
  const joined = new Uint8Array(body.length + 128);
  joined.set(body, 0); joined.set(tail, body.length);
  ok("认得出结尾的 ID3v1 并去掉", L.stripTags(joined).length === body.length);
}

/* ---- 时长 ---- */
const durs = raw.map(b => L.duration(b));
durs.forEach((d, i) => {
  ok("第 " + (i + 1) + " 句算得出时长", d > 0.3 && d < 30, files[i] + " = " + d.toFixed(2) + "s");
});
ok("去不去标签算出来的时长一样",
   Math.abs(L.duration(raw[0]) - L.duration(L.stripTags(raw[0]))) < 1e-6);

/* ---- 拼接 ---- */
{
  const r = L.joinParts(raw);
  near("拼起来的总时长 = 各段之和", r.total, durs.reduce((a, b) => a + b, 0), 1e-6);
  ok("拼起来的字节数 = 各段去标签后之和",
     r.bytes.length === raw.reduce((n, b) => n + L.stripTags(b).length, 0));
  ok("标记数量 = 段数", r.marks.length === raw.length);
  ok("每一段的起点接着上一段的终点",
     r.marks.every((m, i) => i === 0 ? m.from === 0 : Math.abs(m.from - r.marks[i - 1].to) < 1e-9));
  ok("拼出来的还是合法 mp3（开头是帧头）",
     r.bytes[0] === 0xff && (r.bytes[1] & 0xe0) === 0xe0);
  near("对拼接结果重新数帧，时长对得上", L.duration(r.bytes), r.total, 0.05);

  /* ---- 时间 → 第几句 ---- */
  ok("0 秒是第一句", L.indexAt(r.marks, 0) === 0);
  ok("第一句中间还是第一句", L.indexAt(r.marks, durs[0] / 2) === 0);
  ok("刚过第一句就是第二句", L.indexAt(r.marks, durs[0] + 0.01) === 1);
  ok("最后一句末尾不会越界", L.indexAt(r.marks, r.total + 5) === raw.length - 1);
  ok("每一段的中点都能定位回自己",
     r.marks.every((m, i) => L.indexAt(r.marks, (m.from + m.to) / 2) === i));
  ok("空列表返回 -1", L.indexAt([], 1) === -1);
}
{
  const r = L.joinParts([]);
  ok("空的拼接不炸", r.bytes.length === 0 && r.total === 0 && r.marks.length === 0);
}
{
  const r = L.joinParts([raw[0]]);
  near("只有一段时总时长就是它自己", r.total, durs[0], 1e-6);
}

console.log(fail ? `\n${fail} 项没过，${pass} 项通过` : `全部 ${pass} 项通过`);
process.exit(fail ? 1 : 0);
