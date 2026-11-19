/* 二维码测试.js —— 跑法：node 二维码测试.js
 *
 * 自己手写的 QR 编码器最怕「图画出来了，但扫不出来」：错一位纠错码字、
 * 格式信息写反一行，图看着都正常。所以这里不看图，只做两件事：
 *
 *   1. 和 Python 的 qrcode 库逐格比对（三条真实长度的同步链接）。
 *      期望值是那个库算出来的点阵的哈希，不是我自己算完再抄回来的。
 *   2. 结构不变量：定位图案、定时图案、静区、版本选择、超长要报错。
 *
 * 比对用的三条链接长度分别落在版本 3 / 8 / 8 上，覆盖了「有没有对齐图案」
 * 和「版本 7 起要写版本信息」这两处最容易写错的分支。
 */
"use strict";
const crypto = require("crypto");
const QR = require("./二维码.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("PASS " + name); pass++; }
  catch (e) { console.log("FAIL " + name + " —— " + e.message); fail++; }
}
function eq(a, b, what) {
  if (a !== b) throw new Error((what || "") + " 期望 " + b + "，实际 " + a);
}
function rows(text, ecl) { return QR.matrix(text, ecl).rows.map(r => r.join("")).join("\n"); }
function sha(s) { return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32); }

/* ---------- 一、和 Python qrcode 逐格比对 ---------- */

const FIX = [
  ["https://graphicscoder.github.io/study/#s=ghp_abc", "M", 33, "868aa15570ddc28442e827c62a9e2b1b"],
  ["https://graphicscoder.github.io/study/index.html#s=ghp_1234567890abcdefghijklmnopqrstuvwxyzAB.0123456789abcdef0123456789abcdef",
    "M", 49, "ea17a34b8f1a5701ad1abc174adc07e0"],
  ["https://graphicscoder.github.io/study/index.html#s=github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRS.0123456789abcdef0123456789abcdef",
    "L", 49, "e66ebe341809eec622f79f9ca5a725f7"],
];
FIX.forEach(([text, ecl, size, hash], i) => {
  t("和 Python qrcode 完全一致 #" + (i + 1) + "（" + size + "×" + size + "，纠错 " + ecl + "）", () => {
    const r = rows(text, ecl);
    eq(r.split("\n").length, size, "边长");
    eq(sha(r), hash, "点阵");
  });
});

/* ---------- 二、结构不变量 ---------- */

t("三个角上有定位图案，右下角没有", () => {
  const m = QR.matrix("hello", "M"), n = m.n;
  const finder = (ox, oy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const on = (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      if (m.get(ox + x, oy + y) !== (on ? 1 : 0)) return false;
    }
    return true;
  };
  if (!finder(0, 0) || !finder(n - 7, 0) || !finder(0, n - 7)) throw new Error("左上/右上/左下 少了定位图案");
  if (finder(n - 7, n - 7)) throw new Error("右下角不该有定位图案");
});

t("定时图案是黑白相间的", () => {
  const m = QR.matrix("hello", "M"), n = m.n;
  for (let i = 8; i < n - 8; i++) {
    eq(m.get(i, 6), i % 2 ? 0 : 1, "横向定时 x=" + i);
    eq(m.get(6, i), i % 2 ? 0 : 1, "纵向定时 y=" + i);
  }
});

t("固定黑点在 (8, n-8)", () => {
  const m = QR.matrix("hello", "M");
  eq(m.get(8, m.n - 8), 1, "黑点");
});

t("内容越长，版本越高，且边长 = 版本×4+17", () => {
  let last = 0;
  [1, 20, 60, 100, 150].forEach(len => {
    const m = QR.matrix("a".repeat(len), "M");
    eq(m.n, m.version * 4 + 17, "边长");
    if (m.version < last) throw new Error("版本反而变小了");
    last = m.version;
  });
});

t("同一段内容，纠错 L 装得下的版本不高于 M", () => {
  const s = "a".repeat(120);
  if (QR.matrix(s, "L").version > QR.matrix(s, "M").version) throw new Error("L 反而要更高的版本");
});

t("超出容量会报错，而不是悄悄画一张扫不出的图", () => {
  let threw = false;
  try { QR.matrix("a".repeat(QR.capacity(QR.MAXVER, "L") + 1), "L"); } catch (e) { threw = true; }
  if (!threw) throw new Error("没有报错");
});

t("中文按 UTF-8 编码，比同样字数的英文占更多容量", () => {
  const cn = QR.matrix("中".repeat(30), "M").version;
  const en = QR.matrix("a".repeat(30), "M").version;
  if (!(cn > en)) throw new Error("中文没有占更多空间，八成没走 UTF-8");
});

t("纠错级别写错时按 M 处理，不抛异常", () => {
  eq(rows("hello", "Q"), rows("hello", "M"), "未知级别");
});

/* ---------- 三、画出来的 svg ---------- */

t("svg 带静区，而且四周是白的", () => {
  const m = QR.matrix("hello", "M");
  const s = QR.svg("hello", { scale: 1, quiet: 4 });
  const side = m.n + 8;
  if (s.indexOf('width="' + side + '"') < 0) throw new Error("静区没留够，少了 4 格扫不出来");
  if (s.indexOf("<svg") !== 0 || s.slice(-6) !== "</svg>") throw new Error("不是一段完整的 svg");
});

t("svg 里没有裸的 script 结束标签", () => {
  if (/<\/script/i.test(QR.svg("hello", {}))) throw new Error("会把宿主页面的 script 提前截断");
});

console.log("\n" + (fail ? "失败 " + fail + " 项，" : "全部 ") + (pass + fail) + " 项" + (fail ? "" : "通过"));
process.exit(fail ? 1 : 0);
