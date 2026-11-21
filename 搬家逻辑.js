/* 搬家逻辑.js —— 「大象搬家」的纯逻辑：出题、摆放位置、判对错
 *
 * 游戏本身：屏幕上是一个小场景（箱子、床、树…），底下有个要搬的东西
 * （小猫、球、苹果…），上面写着 "Put the cat UNDER the bed"，手指把它拖到
 * 正确的位置就算对。
 *
 * 为什么是拖放而不是选择题：in / on / under 本来就是空间关系，拖到位置上
 * 这件事本身就是答案；选择题考的是「认得这个词」，拖放考的是「知道它在哪儿」。
 *
 * 这个文件不碰 DOM，几何算完就返回坐标，画面那边只管画（大象搬家.html），
 * 所以这里能在 node 里直接测（搬家测试.js）。
 */
(function (root) {
  "use strict";

  /* ---------------- 词和场景 ---------------- */

  // 每个介词配一句中文说明：答错时要讲清楚「刚才那个位置是什么」
  var PREPS = {
    "in":          { cn: "在…里面",   needContainer: true },
    "on":          { cn: "在…上面" },
    "under":       { cn: "在…下面" },
    "next to":     { cn: "在…旁边" },
    "behind":      { cn: "在…后面" },
    "in front of": { cn: "在…前面" },
    "between":     { cn: "在…中间", needTwo: true },
  };

  // 三档：先把最直观的三个练熟，再上前后左右，最后才是 between
  var STAGES = [
    { name: "in · on · under", preps: ["in", "on", "under"] },
    { name: "再加 next to · behind", preps: ["in", "on", "under", "next to", "behind"] },
    { name: "全部 · 含 between", preps: ["in", "on", "under", "next to", "behind", "in front of", "between"] },
  ];

  var LEVELS_PER_STAGE = 2;
  var MAX_LEVEL = STAGES.length * LEVELS_PER_STAGE;     // 6 关
  var PER_LEVEL = 6;                                    // 每关 6 题
  var CLEAR_AT = MAX_LEVEL * PER_LEVEL;

  // 家具用 emoji：又好看又省代码，iPad 上的 emoji 本来就画得比我好。
  // container 表示「东西可以放进去」，只有这类才出 in
  var ANCHORS = [
    { emoji: "📦", en: "box",     cn: "箱子", container: true },
    { emoji: "🧺", en: "basket",  cn: "篮子", container: true },
    { emoji: "🛏️", en: "bed",     cn: "床" },
    { emoji: "🪑", en: "chair",   cn: "椅子" },
    { emoji: "🌳", en: "tree",    cn: "树" },
    { emoji: "🚗", en: "car",     cn: "小汽车", container: true },
    { emoji: "🏠", en: "house",   cn: "房子" },
  ];

  var ITEMS = [
    { emoji: "🐱", en: "cat",    cn: "小猫" },
    { emoji: "⚽", en: "ball",   cn: "球" },
    { emoji: "🍎", en: "apple",  cn: "苹果" },
    { emoji: "📚", en: "book",   cn: "书" },
    { emoji: "🧸", en: "teddy",  cn: "小熊" },
    { emoji: "🐶", en: "dog",    cn: "小狗" },
    { emoji: "🎒", en: "bag",    cn: "书包" },
  ];

  function rndInt(rnd, a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(rnd, arr) { return arr[rndInt(rnd, 0, arr.length - 1)]; }

  function stageIndex(level) {
    return Math.min(STAGES.length - 1, Math.floor((Math.max(1, level) - 1) / LEVELS_PER_STAGE));
  }
  function stageOf(level) {
    var i = stageIndex(level);
    return { index: i, name: STAGES[i].name };
  }
  function levelFor(solved) { return Math.min(MAX_LEVEL, 1 + Math.floor(solved / PER_LEVEL)); }
  function isCleared(solved) { return (solved | 0) >= CLEAR_AT; }
  function leftToClear(solved) { return Math.max(0, CLEAR_AT - (solved | 0)); }

  /* ---------------- 出题 ---------------- */

  // 一道题：两件家具 + 一个要搬的东西 + 一个介词（指向其中一件家具）
  function makeTask(level, rnd) {
    rnd = rnd || Math.random;
    var lv = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
    var preps = STAGES[stageIndex(lv)].preps;
    var prep = pick(rnd, preps);

    // 挑两件不一样的家具；要出 in 就得保证至少有一件是能装东西的
    var a0 = pick(rnd, ANCHORS), a1 = pick(rnd, ANCHORS);
    var guard = 0;
    while (a1.en === a0.en && guard++ < 50) a1 = pick(rnd, ANCHORS);
    if (PREPS[prep].needContainer && !a0.container && !a1.container) {
      a0 = pick(rnd, ANCHORS.filter(function (a) { return a.container; }));
      while (a1.en === a0.en) a1 = pick(rnd, ANCHORS);
    }
    var anchors = [a0, a1];

    // 目标家具：in 只能指向能装东西的那件；between 指向两件
    var ai = rndInt(rnd, 0, 1);
    if (PREPS[prep].needContainer && !anchors[ai].container) ai = 1 - ai;
    if (prep === "between") ai = -1;

    var item = pick(rnd, ITEMS);
    return {
      prep: prep, ai: ai, anchors: anchors, item: item, level: lv,
      en: sentence(prep, ai, anchors, item),
      cn: chinese(prep, ai, anchors, item),
    };
  }

  function sentence(prep, ai, anchors, item) {
    var tail = prep === "between"
      ? "between the " + anchors[0].en + " and the " + anchors[1].en
      : prep + " the " + anchors[ai].en;
    return "Put the " + item.en + " " + tail + ".";
  }

  function chinese(prep, ai, anchors, item) {
    return prep === "between"
      ? "把" + item.cn + "放到" + anchors[0].cn + "和" + anchors[1].cn + "中间"
      : "把" + item.cn + "放到" + anchors[ai].cn + PREPS[prep].cn.replace("…", "");
  }

  /* ---------------- 位置 ----------------
     家具摆在场地上，每件家具周围有几个「可以放」的点：上面、下面、里面、
     旁边、后面、前面；两件家具中间还有一个 between。

     判对错就是看手指松开时离哪个点最近。所以这些点必须离得够开——
     两个点挨太近，孩子放对了也会被判成旁边那个。测试里专门盯这件事。 */

  // side = -1 / +1：往哪一侧摆「旁边、后面、前面」。两件家具各朝外侧摆，
  // 中间留给 between——否则左边那件的「旁边」正好压在 between 上
  /* 两件家具摆在哪儿、多大：场地只有这么宽，而每件家具旁边还要留出
     「旁边 / 前面 / 后面」三个点（最远伸到 1.6h，加上点本身的半径 0.62h，
     等于往外还要 2.22 个 h）。所以先按宽度算出家具能有多大，再摆位置，
     而不是先定大小——定死了就一定有机型会把点甩到屏幕外。 */
  function layoutFor(w, h, top, bottom) {
    top = top || 0;
    bottom = bottom == null ? h : bottom;
    var size = Math.max(22, Math.min(56, w * .11, (bottom - top) * .16));
    // 左右各留 2.22 个 size，剩下的才是两件家具之间的距离；不够就把家具缩小
    var guard = 0;
    while (w - 2 * (10 + 2.22 * size) < 4.2 * size && size > 22 && guard++ < 40) size -= 1;
    var x0 = Math.max(10 + 2.22 * size, w * .27);
    var x1 = w - x0;
    var y = (top + bottom) / 2;
    return [{ x: x0, y: y, h: size }, { x: x1, y: y, h: size }];
  }

  function anchorSpots(ax, ay, h, side) {
    var sd = side < 0 ? -1 : 1;
    return {
      "in":          { x: ax,                  y: ay },
      "on":          { x: ax,                  y: ay - h * 1.3 },
      "under":       { x: ax,                  y: ay + h * 1.3 },
      "behind":      { x: ax + sd * h * 1.45,  y: ay - h * 1.25 },
      "next to":     { x: ax + sd * h * 1.6,   y: ay },
      "in front of": { x: ax + sd * h * 1.45,  y: ay + h * 1.25 },
    };
  }

  /* 整个场景里所有可放点。anchors 是两件家具的摆放结果：
     [{x, y, h}, {x, y, h}]，h 是家具的「半个身子」。
     只返回这一关用得到的介词，省得判错成一个还没教的词。 */
  function spots(layout, preps, anchorsMeta) {
    var out = [];
    var mid = layout.length === 2 ? (layout[0].x + layout[1].x) / 2 : null;
    layout.forEach(function (a, i) {
      // 朝远离中间的那一侧摆
      var side = mid == null ? 1 : (a.x <= mid ? -1 : 1);
      var sp = anchorSpots(a.x, a.y, a.h, side);
      Object.keys(sp).forEach(function (p) {
        if (preps.indexOf(p) < 0) return;
        if (p === "in" && anchorsMeta && !anchorsMeta[i].container) return;   // 床里面放不了东西
        out.push({ prep: p, ai: i, x: sp[p].x, y: sp[p].y, r: a.h * .62 });
      });
    });
    if (preps.indexOf("between") > -1 && layout.length === 2) {
      out.push({
        prep: "between", ai: -1,
        x: (layout[0].x + layout[1].x) / 2,
        y: (layout[0].y + layout[1].y) / 2,
        r: Math.min(layout[0].h, layout[1].h) * .62,
      });
    }
    return out;
  }

  // 手指松开的地方落在哪个点上；都不沾边就返回 null（当作放歪了，不算错）
  function hit(spotList, x, y) {
    var best = null, bestD = Infinity;
    spotList.forEach(function (s) {
      var d = Math.hypot(x - s.x, y - s.y);
      if (d < bestD) { bestD = d; best = s; }
    });
    if (!best) return null;
    // 稍微放宽一点：孩子的手没那么准，离得最近且在 1.6 倍半径内就算落在这儿
    return bestD <= best.r * 1.6 ? best : null;
  }

  function judge(spotList, x, y, task) {
    var s = hit(spotList, x, y);
    if (!s) return { ok: false, miss: true, spot: null };
    var ok = s.prep === task.prep && (task.prep === "between" || s.ai === task.ai);
    return { ok: ok, miss: false, spot: s };
  }

  /* ---------------- 计分 ---------------- */

  function newGame() {
    return { solved: 0, wrong: 0, combo: 0, bestCombo: 0, score: 0, lives: 3, over: false };
  }
  function levelMul(level) { return 1 + (Math.max(1, Math.min(MAX_LEVEL, level)) - 1) * .25; }
  function hitScore(combo, level) { return Math.round((10 + Math.min(combo, 5) * 5) * levelMul(level)); }

  function right(s, level) {
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += hitScore(s.combo, level == null ? levelFor(s.solved) : level);
    s.solved += 1;
    return s;
  }
  // 放错了不扣心：这游戏是教「它在哪儿」，错一次看清楚正确位置比掉血有用。
  // 只断连击，并且这道题会排到后面再问一次
  function wrong(s) {
    s.combo = 0;
    s.wrong += 1;
    return s;
  }

  var API = {
    PREPS: PREPS, STAGES: STAGES, ANCHORS: ANCHORS, ITEMS: ITEMS,
    LEVELS_PER_STAGE: LEVELS_PER_STAGE, MAX_LEVEL: MAX_LEVEL, PER_LEVEL: PER_LEVEL, CLEAR_AT: CLEAR_AT,
    stageOf: stageOf, levelFor: levelFor, isCleared: isCleared, leftToClear: leftToClear,
    makeTask: makeTask, sentence: sentence, chinese: chinese,
    anchorSpots: anchorSpots, spots: spots, hit: hit, judge: judge, layoutFor: layoutFor,
    newGame: newGame, hitScore: hitScore, levelMul: levelMul, right: right, wrong: wrong,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.MoveLogic = API;
}(typeof window !== "undefined" ? window : globalThis));
