/* 接答案测试.js —— 跑法：node 接答案测试.js
 *
 * 游戏的「手感」测不了，但下面这些测得了，而且错了很伤：
 * 掉下来的数里必须正好有一个是对的（不然孩子接对了反而算错）、
 * 干扰项不能长得离谱、难度只能越来越快但要有底、分数和命的账要算对。
 */
"use strict";
const G = require("./接答案逻辑.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("PASS " + name); pass++; }
  catch (e) { console.log("FAIL " + name + " —— " + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || "不成立"); }

// 可复现的伪随机：测试里不用真 Math.random，不然挂了也复现不出来
function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const ROUNDS = [];
for (let lv = 1; lv <= G.MAX_LEVEL; lv++)
  for (let i = 0; i < 200; i++) ROUNDS.push(G.makeRound(lv, rng(lv * 1000 + i)));

/* ---------------- 出题 ---------------- */

t("算式算出来就是标称的答案", () => {
  ROUNDS.forEach(r => {
    // 把题面还原成 JS 表达式：× ÷ − 都是全角，先换回来
    const expr = r.q.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
    assert(/^[\d\s+\-*/().]+$/.test(expr), "题面里有算不了的字符：" + r.q);
    // eslint-disable-next-line no-eval
    assert(eval(expr) === r.ans, r.q + " 应该等于 " + eval(expr) + "，却标成 " + r.ans);
  });
});

t("答案一定在掉下来的那几个数里，而且只有一个", () => {
  ROUNDS.forEach(r => {
    const hit = r.drops.filter(d => d === r.ans).length;
    assert(hit === 1, r.q + " → " + JSON.stringify(r.drops) + " 里有 " + hit + " 个正确答案");
  });
});

t("掉下来的数互不相同", () => {
  ROUNDS.forEach(r => {
    assert(new Set(r.drops).size === r.drops.length, r.q + " → " + JSON.stringify(r.drops));
  });
});

t("掉下来的数都是非负整数（屏幕上不该出现 -3 或 7.5）", () => {
  ROUNDS.forEach(r => r.drops.forEach(d => {
    assert(Number.isInteger(d) && d >= 0, r.q + " → " + d);
  }));
});

t("答案不至于大到心算做不动", () => {
  ROUNDS.forEach(r => assert(r.ans <= 1000, r.q + " = " + r.ans + "，这超出心算了"));
});

t("前两关只掉 3 个数，往后 4 个", () => {
  ROUNDS.forEach(r => assert(r.drops.length === (r.level <= 2 ? 3 : 4), r.level + " 关掉了 " + r.drops.length + " 个"));
});

t("低关卡不出两步混合，难的留到后面", () => {
  ROUNDS.filter(r => r.level === 1).forEach(r => {
    assert(!/[+−].*×|×.*[+−]|\(/.test(r.q), "第 1 关出现了 " + r.q);
  });
});

t("同一个随机种子出同一道题（挂了能复现）", () => {
  const a = G.makeRound(4, rng(42)), b = G.makeRound(4, rng(42));
  assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
});

t("干扰项要像算错的结果，不是随便一个数", () => {
  // 和答案差太远的（超过答案本身 + 100）一个都不该有
  ROUNDS.forEach(r => r.drops.forEach(d => {
    assert(Math.abs(d - r.ans) <= r.ans + 100, r.q + " 的干扰项 " + d + " 离谱了");
  }));
});

t("答案很小时也能凑够干扰项", () => {
  const d = G.decoysFor(1, rng(7), 3);
  assert(d.length === 3 && new Set(d).size === 3 && d.every(x => x >= 0 && x !== 1), JSON.stringify(d));
});

/* ---------------- 难度 ---------------- */

t("每答对 5 题升一级，封顶不再升", () => {
  assert(G.levelFor(0) === 1, "开局是第 1 关");
  assert(G.levelFor(4) === 1 && G.levelFor(5) === 2, "第 5 题该升级");
  assert(G.levelFor(99999) === G.MAX_LEVEL, "封顶");
});

t("越往后掉得越快，但有下限（再快就只剩手速）", () => {
  let last = Infinity;
  for (let lv = 1; lv <= G.MAX_LEVEL; lv++) {
    const s = G.fallSecs(lv);
    assert(s < last, lv + " 关没有比上一关快");
    assert(s >= 2, lv + " 关只剩 " + s + " 秒，太快了");
    last = s;
  }
  assert(G.fallSecs(G.MAX_LEVEL + 50) >= 2, "超出范围也不能更快");
});

/* ---------------- 计分和命 ---------------- */

t("接对了加分、连击累加，连击上限按 5 算", () => {
  const s = G.newGame();
  G.catchRight(s);
  assert(s.score === G.hitScore(1) && s.combo === 1 && s.solved === 1, JSON.stringify(s));
  for (let i = 0; i < 10; i++) G.catchRight(s);
  assert(s.combo === 11 && s.bestCombo === 11, JSON.stringify(s));
  assert(G.hitScore(11) === G.hitScore(5), "连到 11 不该比连到 5 还值钱");
});

t("接错扣一颗心并断连击，三颗扣完就结束", () => {
  const s = G.newGame();
  G.catchRight(s); G.catchRight(s);
  G.catchWrong(s);
  assert(s.combo === 0 && s.lives === G.LIVES - 1 && !s.over, JSON.stringify(s));
  G.catchWrong(s); G.catchWrong(s);
  assert(s.lives === 0 && s.over && s.wrong === 3, JSON.stringify(s));
});

t("漏接不扣心，只断连击（手慢不是不会）", () => {
  const s = G.newGame();
  G.catchRight(s);
  G.missRound(s);
  assert(s.lives === G.LIVES && s.combo === 0 && s.missed === 1 && !s.over, JSON.stringify(s));
});

t("接错之后还能把连击重新攒起来", () => {
  const s = G.newGame();
  G.catchRight(s); G.catchWrong(s); G.catchRight(s);
  assert(s.combo === 1 && s.bestCombo === 1 && s.solved === 2, JSON.stringify(s));
});

t("最长连击记的是历史最好，不会被后来的归零抹掉", () => {
  const s = G.newGame();
  for (let i = 0; i < 4; i++) G.catchRight(s);
  G.catchWrong(s);
  assert(s.bestCombo === 4, JSON.stringify(s));
});

/* ---------------- 夸奖的句子 ---------------- */

t("三档句子都够用：连得久也不会很快听到重样", () => {
  assert(G.PRAISE.length >= 15, "普通档只有 " + G.PRAISE.length + " 句");
  assert(G.PRAISE_HOT.length >= 10, "连对档只有 " + G.PRAISE_HOT.length + " 句");
  assert(G.PRAISE_FIRE.length >= 8, "爆发档只有 " + G.PRAISE_FIRE.length + " 句");
});

t("连对越久夸得越夸张：三档各走各的", () => {
  const inList = (n, list) => { for (let i = 0; i < 60; i++) assert(list.indexOf(G.praisePhrase(n)) > -1, n + " 连对拿到了别档的句子"); };
  inList(1, G.PRAISE); inList(2, G.PRAISE);
  inList(3, G.PRAISE_HOT); inList(6, G.PRAISE_HOT);
  inList(7, G.PRAISE_FIRE); inList(30, G.PRAISE_FIRE);
});

t("同一句不会连着冒出来（这是最出戏的地方）", () => {
  let last = "";
  for (let i = 0; i < 400; i++) {
    const w = G.praisePhrase(1 + (i % 12));   // 连对数来回变，三档都会走到
    assert(w && typeof w === "string", "拿到空句子");
    assert(w !== last, "连着两次都是「" + w + "」");
    last = w;
  }
});

t("最近四句之内也不重样", () => {
  const seen = [];
  for (let i = 0; i < 200; i++) {
    const w = G.praisePhrase(1);
    assert(seen.indexOf(w) < 0, "「" + w + "」在最近 4 句里重复了");
    seen.push(w);
    if (seen.length > 4) seen.shift();
  }
});

t("夸奖都是英文短句，不混中文、也不会长到一屏放不下", () => {
  [].concat(G.PRAISE, G.PRAISE_HOT, G.PRAISE_FIRE).forEach(w => {
    assert(!/[\u4e00-\u9fa5]/.test(w), "混进了中文：" + w);
    assert(w.length <= 22, "太长了：" + w);
  });
});

console.log("\n" + (fail ? "失败 " + fail + " 项，" : "全部 ") + (pass + fail) + " 项" + (fail ? "" : "通过"));
process.exit(fail ? 1 : 0);
