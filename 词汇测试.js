/* 词汇闯关逻辑测试：选词、出题、判对错、排下次复习时间。
   随机的地方一律喂固定序列的 rnd，结果可复现。 */
"use strict";
const L = require("./词汇逻辑.js");
const DB = require("./英语4A词库.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log("✗ " + name + (extra ? "  → " + extra : ""));
}
function eq(name, a, b) { ok(name, a === b, JSON.stringify(a) + " ≠ " + JSON.stringify(b)); }

// 轮着给固定值的假随机，够打乱又能复现
function seeded(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const U1 = DB.unit(1);
const ALL = DB.all();
const now = 1700000000000;
const MIN = 60000, DAY = 24 * 60 * MIN;

/* ---------- 进度与排程 ---------- */
{
  const p = {};
  eq("没学过的词等级是 0", L.recOf(p, "u1-1").lv, 0);
  ok("没学过的词 seen 为假", !L.recOf(p, "u1-1").seen);

  L.grade(p, "u1-1", true, now);
  eq("答对升到 1 级", p["u1-1"].lv, 1);
  eq("1 级隔几分钟再问", p["u1-1"].due - now, 3 * MIN);

  L.grade(p, "u1-1", true, now);
  eq("再答对到 2 级", p["u1-1"].lv, 2);
  eq("2 级隔一刻钟", p["u1-1"].due - now, 15 * MIN);

  L.grade(p, "u1-1", true, now);
  eq("3 级开始要隔一天", p["u1-1"].due - now, DAY);
  L.grade(p, "u1-1", false, now);
  eq("答错退一级", p["u1-1"].lv, 2);
  eq("答错马上重排，不等", p["u1-1"].due, now);
  eq("对的次数记下了", p["u1-1"].ok, 3);
  eq("错的次数记下了", p["u1-1"].no, 1);
}
{
  const p = {};
  for (let i = 0; i < 9; i++) L.grade(p, "x", true, now);
  eq("等级封顶在 MAX_LEVEL", p.x.lv, L.MAX_LEVEL);
  eq("封顶后隔最长的两周", p.x.due - now, 14 * DAY);
  for (let i = 0; i < 9; i++) L.grade(p, "x", false, now);
  eq("等级不会掉到负数", p.x.lv, 0);
}
{
  const p = {};
  ok("没到 4 级不算会了", !L.isMastered(p, "u1-1"));
  for (let i = 0; i < 4; i++) L.grade(p, "u1-1", true, now);
  ok("到 4 级算会了", L.isMastered(p, "u1-1"));
}

/* ---------- unit 统计 ---------- */
{
  const p = {};
  let s = L.unitStat(U1, p);
  eq("全新 unit 掌握 0%", s.pct, 0);
  eq("总数对得上", s.total, U1.length);
  U1.forEach(x => { for (let i = 0; i < 4; i++) L.grade(p, x.id, true, now); });
  s = L.unitStat(U1, p);
  eq("全练熟是 100%", s.pct, 100);
  eq("学过的条数 = 总数", s.started, U1.length);
}
{
  // 条子要会动：一关十题全对之后不能还停在 0%
  const p = {};
  const s0 = L.unitStat(U1, p);
  U1.slice(0, 10).forEach(x => L.grade(p, x.id, true, now));
  const s1 = L.unitStat(U1, p);
  ok("练过一关进度就往前走", s1.pct > s0.pct, s0.pct + " → " + s1.pct);
  eq("但还没有词算练熟", s1.mastered, 0);
  ok("练熟之前不会虚报 100%", s1.pct < 100);

  // 同一批词再练三轮，应该一路涨到这批词满格
  for (let k = 0; k < 3; k++) U1.slice(0, 10).forEach(x => L.grade(p, x.id, true, now));
  const s2 = L.unitStat(U1, p);
  eq("十个词练熟了", s2.mastered, 10);
  eq("进度 = 10/21 的满格", s2.pct, Math.round(10 / U1.length * 100));
  eq("练熟比例另算", s2.masteredPct, Math.round(10 / U1.length * 100));
}

/* ---------- 选词 ---------- */
{
  const p = {};
  const r = L.pickSession(U1, p, now, 10, seeded(7));
  eq("一关十题", r.length, 10);
  eq("同一关里不重复", new Set(r.map(x => x.id)).size, 10);
  ok("全是本 unit 的词", r.every(x => x.unit === 1));
}
{
  // 词不够十个时给多少算多少，不会凑数凑出重复
  const small = U1.slice(0, 4);
  const r = L.pickSession(small, {}, now, 10, seeded(3));
  eq("池子小就出小关", r.length, 4);
  eq("仍然不重复", new Set(r.map(x => x.id)).size, 4);
}
{
  // 到期的复习词必须优先于新词
  const p = {};
  const old = U1.slice(0, 3);
  old.forEach(x => { p[x.id] = { lv: 2, due: now - DAY, ok: 2, no: 0 }; });
  const r = L.pickSession(U1, p, now, 10, seeded(11)).map(x => x.id);
  ok("到期的三个词都被选中", old.every(x => r.includes(x.id)), r.join(","));
}
{
  // 没到期的词不该挤掉新词
  const p = {};
  U1.slice(0, 5).forEach(x => { p[x.id] = { lv: 3, due: now + 5 * DAY, ok: 3, no: 0 }; });
  const r = L.pickSession(U1, p, now, 10, seeded(5));
  const future = r.filter(x => p[x.id]).length;
  ok("还没到期的词最多补位，不占多数", future <= 5, "占了 " + future + " 个");
}
{
  // 新词一关最多占一半，剩下留给复习
  const p = {};
  U1.forEach((x, i) => { if (i < 20) p[x.id] = { lv: 1, due: now - MIN, ok: 1, no: 0 }; });
  const r = L.pickSession(U1, p, now, 10, seeded(9));
  const fresh = r.filter(x => !p[x.id]).length;
  ok("有复习任务时不塞新词", fresh === 0, "塞了 " + fresh + " 个");
}

/* ---------- 题型随等级变 ---------- */
{
  const word = U1.find(x => !x.phrase && L.canSpell(x));
  const phrase = U1.find(x => x.phrase);
  eq("0 级看英文选中文", L.kindFor(word, 0), "en2cn");
  eq("1 级听音选中文", L.kindFor(word, 1), "listen");
  eq("2 级看中文选英文", L.kindFor(word, 2), "cn2en");
  eq("3 级开始要拼写", L.kindFor(word, 3), "spell");
  eq("5 级还是拼写", L.kindFor(word, 5), "spell");
  eq("词组低级只认不拼", L.kindFor(phrase, 0), "en2cn");
  eq("词组高级反过来问", L.kindFor(phrase, 3), "cn2en");
  ok("词组永远不出拼写题",
     DB.phrases().every(x => [0,1,2,3,4,5].every(lv => L.kindFor(x, lv) !== "spell")));
  const longWord = { w: "neighbourhood", phrase: false };
  ok("太长的词不出拼写题", !L.canSpell(longWord));
  eq("太长的词改成选择", L.kindFor(longWord, 4), "cn2en");
}

/* ---------- 出题内容 ---------- */
{
  const p = {};
  const rnd = seeded(21);
  let spellSeen = 0, listenSeen = 0;
  ALL.forEach(item => {
    [0, 1, 2, 3, 5].forEach(lv => {
      const pp = { [item.id]: { lv, due: 0, ok: 0, no: 0 } };
      const q = L.makeQuestion(item, DB.unit(item.unit), pp, rnd, ALL);
      if (q.kind === "spell") {
        spellSeen++;
        eq("拼写题答案就是这个词", q.answer, item.w);
        eq("字母块数量对得上", q.tiles.length, item.w.length);
        eq("字母块凑回去就是答案", q.tiles.slice().sort().join(""), item.w.split("").sort().join(""));
        ok("拼写题给中文作题面", q.ask === item.c);
      } else {
        eq("四选一", q.choices.length, 4);
        eq("选项不重复", new Set(q.choices).size, 4);
        ok("正确答案在选项里", q.choices.includes(q.answer), item.w);
        if (q.kind === "listen") { listenSeen++; ok("听力题不剧透英文", q.ask === ""); }
        if (q.kind === "cn2en") { eq("中译英的答案是英文", q.answer, item.w); ok("题面是中文", q.ask === item.c); }
        if (q.kind === "en2cn") { eq("英译中的答案是中文", q.answer, item.c); ok("题面是英文", q.ask === item.w); }
      }
      ok("每题都知道该读什么", q.speak === item.w);
    });
  });
  ok("确实出到过拼写题", spellSeen > 100, String(spellSeen));
  ok("确实出到过听力题", listenSeen > 100, String(listenSeen));
}
{
  // 干扰项不能和正确答案撞义，也不能跨类（词组混进单词里一眼识破）
  const rnd = seeded(33);
  ALL.slice(0, 60).forEach(item => {
    const bad = L.distractors(item, DB.unit(item.unit), ALL, 3, rnd);
    eq("凑够三个干扰项", bad.length, 3);
    ok("干扰项不含自己", bad.every(x => x.id !== item.id));
    ok("干扰项不撞中文", bad.every(x => x.c !== item.c));
    ok("干扰项同类", bad.every(x => x.phrase === item.phrase), item.w);
  });
}
{
  // 池子只有两个词时也要能凑够四个选项（去全库借）
  const item = U1[0];
  const bad = L.distractors(item, U1.slice(0, 2), ALL, 3, seeded(2));
  eq("池子小也凑得够", bad.length, 3);
}

/* ---------- 打乱字母 ---------- */
{
  const rnd = seeded(13);
  DB.words().filter(L.canSpell).forEach(x => {
    const s = L.scramble(x.w, rnd).join("");
    eq("打乱后字母不变", s.split("").sort().join(""), x.w.split("").sort().join(""));
  });
  eq("单字母原样返回", L.scramble("a", rnd).join(""), "a");
  eq("同字母词不会死循环", L.scramble("aaa", rnd).join(""), "aaa");
}

/* ---------- 判题 ---------- */
{
  const q = { kind: "spell", answer: "bamboo" };
  ok("拼对算对", L.check(q, "bamboo"));
  ok("大小写不计较", L.check(q, "BamBoo"));
  ok("前后空格不计较", L.check(q, "  bamboo "));
  ok("拼错算错", !L.check(q, "bambo"));
  const c = { kind: "en2cn", answer: "教室" };
  ok("选对算对", L.check(c, "教室"));
  ok("选错算错", !L.check(c, "礼堂"));
}

/* ---------- 一整关跑通 ---------- */
{
  const p = {};
  const rnd = seeded(77);
  const round = L.newRound(U1, p, now, rnd, ALL);
  eq("关卡题量", round.total, 10);

  let served = 0, item;
  while ((item = L.nextItem(round)) && served < 60) {
    served++;
    const q = L.makeQuestion(item, U1, p, rnd, ALL);
    // 前三题故意答错，看错词会不会回来
    const right = served > 3;
    L.answer(round, q, right ? q.answer : "——不可能的答案——", p, now);
  }
  ok("错题会回到队尾重来", served > 10, "只出了 " + served + " 题");
  eq("错了三次", round.wrong, 3);
  ok("连对数记录下来了", round.best >= 10, String(round.best));
  eq("出完就结束", L.nextItem(round), null);
  ok("每个词都写进了进度", round.queue.every(x => p[x.id]));
}
{
  const p = {};
  const rnd = seeded(5);
  const round = L.newRound(U1, p, now, rnd, ALL);
  let item;
  while ((item = L.nextItem(round))) {
    const q = L.makeQuestion(item, U1, p, rnd, ALL);
    L.answer(round, q, q.answer, p, now);
  }
  eq("全对没有错题", round.wrong, 0);
  eq("全对三颗星", L.stars(round), 3);
}
{
  const round = { total: 10, right: 7, wrong: 3 };
  eq("七成对拿一颗星", L.stars(round), 1);
  eq("八成对拿两颗星", L.stars({ total: 10, right: 8, wrong: 2 }), 2);
  eq("一半对没有星", L.stars({ total: 10, right: 5, wrong: 5 }), 0);
  eq("空关卡不给星", L.stars({ total: 0, right: 0, wrong: 0 }), 0);
}

/* ---------- 生词本 / 错词本 ---------- */
{
  const p = {};
  ok("默认没收进生词本", !L.isStarred(p, "u1-1"));
  L.star(p, "u1-1", true);
  ok("点一下收进生词本", L.isStarred(p, "u1-1"));
  ok("收藏不影响等级", L.recOf(p, "u1-1").lv === 0);
  L.star(p, "u1-1", false);
  ok("再点一下移出生词本", !L.isStarred(p, "u1-1"));
  ok("移出后进度记录还在", "u1-1" in p);

  // 练过的词收藏，不能把练习进度冲掉
  L.grade(p, "u1-2", true, now);
  L.grade(p, "u1-2", true, now);
  L.star(p, "u1-2", true);
  eq("收藏不覆盖等级", p["u1-2"].lv, 2);
  eq("收藏不覆盖对题数", p["u1-2"].ok, 2);

  // 踩过的坑：答题会整条替换进度记录，顺手把收藏标记冲掉了
  L.grade(p, "u1-2", true, now);
  ok("答对之后还在生词本里", L.isStarred(p, "u1-2"));
  L.grade(p, "u1-2", false, now);
  ok("答错之后也还在生词本里", L.isStarred(p, "u1-2"));
}
{
  const p = {};
  L.star(p, U1[0].id, true);
  L.star(p, U1[3].id, true);
  const s = L.starred(ALL, p);
  eq("生词本按收藏来", s.length, 2);
  ok("取出来的就是收藏的那两个", s.every(x => L.isStarred(p, x.id)));
}
{
  const p = {};
  L.grade(p, U1[0].id, false, now);               // 错一次，没练熟 → 进错词本
  L.grade(p, U1[1].id, true, now);                // 全对 → 不进
  for (let i = 0; i < 5; i++) L.grade(p, U1[2].id, true, now);
  L.grade(p, U1[2].id, false, now);               // 错过但等级还高
  const w = L.weak(ALL, p).map(x => x.id);
  ok("错过又没练熟的在错词本里", w.includes(U1[0].id));
  ok("没错过的不在错词本里", !w.includes(U1[1].id));

  L.clearWrong(p, U1[0].id);
  ok("移出错词本之后就不在了", !L.weak(ALL, p).map(x => x.id).includes(U1[0].id));
  eq("移出错词本不改等级", p[U1[0].id].lv, 0);
}
{
  // 生词本也能直接开一关：池子小的时候选项照样凑得齐
  const p = {};
  L.star(p, U1[0].id, true);
  const pool = L.starred(ALL, p);
  const round = L.newRound(pool, p, now, seeded(4), ALL);
  eq("一个词也能开一关", round.total, 1);
  const q = L.makeQuestion(round.queue[0], pool, p, seeded(4), ALL);
  if (q.kind !== "spell") eq("选项仍是四个", q.choices.length, 4);
}

/* ---------- 还有多久能再练 ---------- */
{
  const p = {};
  let d = L.dueInfo(U1, p, now);
  eq("全新时没有到期的", d.ready, 0);
  eq("全新时全是生词", d.fresh, U1.length);
  eq("全新时不用等", d.wait, null);

  U1.forEach(x => L.grade(p, x.id, true, now));
  d = L.dueInfo(U1, p, now);
  eq("刚练完都没到点", d.ready, 0);
  eq("刚练完也没有新词了", d.fresh, 0);
  eq("要等的就是最短那一档", d.wait, 3 * MIN);

  d = L.dueInfo(U1, p, now + 4 * MIN);
  eq("过几分钟就全到期了", d.ready, U1.length);

  // 一天之内能把词推到 3 级，第四级要隔天——这是「最快多久练熟」的答案
  let t = now;
  const id = U1[0].id;
  const p2 = {};
  L.grade(p2, id, true, t); t += 4 * MIN;
  L.grade(p2, id, true, t); t += 16 * MIN;
  L.grade(p2, id, true, t);
  eq("二十分钟能推到 3 级", p2[id].lv, 3);
  ok("第 3 级之后要隔一天", p2[id].due - t === DAY);
  ok("当天没法练熟", !L.isMastered(p2, id));
  L.grade(p2, id, true, t + DAY);
  ok("隔天再答对一次就练熟了", L.isMastered(p2, id));
}
{
  // 练熟的词不再催复习
  const p = {};
  const x = U1[0];
  for (let i = 0; i < 4; i++) L.grade(p, x.id, true, now);
  const d = L.dueInfo([x], p, now + 365 * DAY);
  eq("练熟的不算到期", d.ready, 0);
  eq("练熟的也不用等", d.wait, null);
}

/* ---------- 错词本要四种问法全过才放人 ---------- */
{
  const word = U1.find(x => !x.phrase && L.canSpell(x));
  const longWord = DB.all().find(x => !x.phrase && !L.canSpell(x));
  const phrase = U1.find(x => x.phrase);
  eq("能拼的单词有四种问法", L.modesOf(word).join(","), "en2cn,listen,cn2en,spell");
  eq("太长的单词没有拼写关", L.modesOf(longWord).join(","), "en2cn,listen,cn2en");
  eq("词组只有两种问法", L.modesOf(phrase).join(","), "en2cn,cn2en");

  const p = {};
  L.grade(p, word.id, false, now, "en2cn");       // 答错进错词本
  ok("错了就在错词本里", L.weak([word], p).length === 1);
  eq("一开始四种都没过", L.modesLeft(word, p).length, 4);

  L.grade(p, word.id, true, now, "en2cn");
  eq("过了一种还剩三种", L.modesLeft(word, p).length, 3);
  ok("只过一种还在错词本里", L.weak([word], p).length === 1);

  L.grade(p, word.id, true, now, "listen");
  L.grade(p, word.id, true, now, "cn2en");
  ok("差最后一种拼写，仍然在本子里", L.weak([word], p).length === 1);

  L.grade(p, word.id, true, now, "spell");
  ok("四种全过就自动离开错词本", L.weak([word], p).length === 0);
  ok("四种全过算过关", L.passedAll(word, p));
}
{
  // 过关之后又栽在同一种问法上，这一关要重新打
  const word = U1.find(x => !x.phrase && L.canSpell(x));
  const p = {};
  L.modesOf(word).forEach(m => L.grade(p, word.id, true, now, m));
  ok("先全过了", L.passedAll(word, p));
  L.grade(p, word.id, false, now, "spell");
  ok("拼错了就把拼写关作废", L.modesLeft(word, p).join(",") === "spell");
  ok("于是又回到错词本", L.weak([word], p).length === 1);
}
{
  // 词组只要两种问法，别卡着它等永远不会出的拼写题
  const phrase = U1.find(x => x.phrase);
  const p = {};
  L.grade(p, phrase.id, false, now, "en2cn");
  L.grade(p, phrase.id, true, now, "en2cn");
  L.grade(p, phrase.id, true, now, "cn2en");
  ok("词组过两种就出本子", L.weak([phrase], p).length === 0);
}
{
  // 指定问法出题：错词本靠它补齐没过的那几关
  const word = U1.find(x => !x.phrase && L.canSpell(x));
  const p = {};
  const q = L.makeQuestion(word, U1, p, seeded(6), ALL, "spell");
  eq("指定什么问法就出什么", q.kind, "spell");
  const q2 = L.makeQuestion(word, U1, p, seeded(6), ALL, "listen");
  eq("听力题也能指定", q2.kind, "listen");
  // 拼不了的词硬指定拼写，要退回选择题而不是出一道没法答的题
  const longWord = DB.all().find(x => !x.phrase && !L.canSpell(x));
  const q3 = L.makeQuestion(longWord, DB.unit(longWord.unit), p, seeded(6), ALL, "spell");
  ok("拼不了的词不会被硬塞拼写题", q3.kind !== "spell");
  eq("退回去的题照样能答", q3.choices.length, 4);
}
{
  // 答题要把「这种问法会了」记下来，否则错词本永远清不掉
  const p = {};
  const rnd = seeded(31);
  const word = U1.find(x => !x.phrase && L.canSpell(x));
  const round = L.newRound([word], p, now, rnd, ALL);
  const item = L.nextItem(round);
  const q = L.makeQuestion(item, [word], p, rnd, ALL, "cn2en");
  L.answer(round, q, q.answer, p, now);
  ok("答对之后这一种就算过了", L.modesLeft(word, p).indexOf("cn2en") < 0);
}

console.log(fail ? `\n${fail} 项没过，${pass} 项通过` : `全部 ${pass} 项通过`);
process.exit(fail ? 1 : 0);
