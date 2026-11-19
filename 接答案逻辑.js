/* 接答案逻辑.js —— 「大象接答案」的纯逻辑：出题、判定、计分、难度曲线
 *
 * 和画面完全分开，一行 DOM 都不碰：这样它能在 node 里直接跑测试
 * （接答案测试.js），而画面那边只管画。
 *
 * 游戏本身：天上掉数字，底下的大象左右跑着去接。接到正确答案得分，
 * 接错扣一颗心，漏掉不扣心只断连击——漏掉多半是手慢，不是不会，
 * 为这个扣心会让人不想玩。
 *
 * 出题刻意只出「心算做得动」的：凑整乘法（25×4）、凑整加减（99+36）、
 * 两步混合。超出一屏的大数算式留给练习页，这里是游戏。
 */
(function (root) {
  "use strict";

  var LIVES = 3;
  var PER_LEVEL = 5;            // 每答对这么多题升一级
  var MAX_LEVEL = 12;

  function rndInt(rnd, a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(rnd, arr) { return arr[rndInt(rnd, 0, arr.length - 1)]; }

  /* ---------------- 出题 ----------------
     每一档只放「一眼能看出路子」的式子，难的是速度不是算理。 */

  var MAKERS = [
    // 1. 凑整乘法：25×4、125×8 这类，背下来就能秒答
    function (rnd, lv) {
      var pairs = [[25, 4], [25, 8], [125, 8], [50, 2], [20, 5], [15, 4], [12, 5]];
      var p = pick(rnd, pairs);
      var a = p[0], b = p[1];
      if (rnd() < .5) { var t = a; a = b; b = t; }
      return { q: a + " × " + b, ans: a * b };
    },
    // 2. 凑整加减：99 + 36、102 - 47
    function (rnd, lv) {
      var near = pick(rnd, [99, 98, 101, 102, 199, 201]);
      var x = rndInt(rnd, 11, 60);
      return rnd() < .5
        ? { q: near + " + " + x, ans: near + x }
        : { q: (near + x) + " − " + x, ans: near };
    },
    // 3. 表内乘除混一把
    function (rnd, lv) {
      var a = rndInt(rnd, 3, 9), b = rndInt(rnd, 6, 9);
      return rnd() < .5
        ? { q: a + " × " + b, ans: a * b }
        : { q: (a * b) + " ÷ " + b, ans: a };
    },
    // 4. 两步：先乘后加减，顺带练运算顺序
    function (rnd, lv) {
      var a = rndInt(rnd, 2, 9), b = rndInt(rnd, 2, 9), c = rndInt(rnd, 1, 20);
      return rnd() < .5
        ? { q: a + " × " + b + " + " + c, ans: a * b + c }
        : { q: a + " × " + b + " − " + Math.min(c, a * b), ans: a * b - Math.min(c, a * b) };
    },
    // 5. 带括号：(12 + 8) × 5，括号先算
    function (rnd, lv) {
      var a = rndInt(rnd, 3, 18), b = rndInt(rnd, 2, 12), c = pick(rnd, [2, 3, 4, 5]);
      return { q: "(" + a + " + " + b + ") × " + c, ans: (a + b) * c };
    },
  ];

  // 前几关只用前两种，越往后花样越多——一上来就上两步混合会劝退
  function makersFor(level) {
    var n = level <= 1 ? 2 : level <= 3 ? 3 : level <= 5 ? 4 : 5;
    return MAKERS.slice(0, n);
  }

  /* 干扰项：要像「算错了会得到的那个数」，不能是随便一个数。
     差 1（进位丢了）、差 10（数位错）、乘法的邻格（6×7 答成 6×8）都很像。 */
  function decoysFor(ans, rnd, howMany) {
    var cand = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2,
                ans * 2, Math.round(ans / 2), ans + 100, ans - 100, ans + 5, ans - 5];
    var out = [], seen = { };
    seen[ans] = 1;
    // 洗一下，免得每次都是同样那两个
    cand = cand.slice();
    for (var i = cand.length - 1; i > 0; i--) {
      var j = rndInt(rnd, 0, i), t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }
    cand.forEach(function (c) {
      if (out.length >= howMany) return;
      if (c < 0 || !isFinite(c) || seen[c]) return;
      seen[c] = 1;
      out.push(c);
    });
    // 实在凑不出（答案很小时）就往上加，保证数量够
    var n = 1;
    while (out.length < howMany) { if (!seen[ans + n]) { seen[ans + n] = 1; out.push(ans + n); } n++; }
    return out;
  }

  // 一轮 = 一道题 + 要掉下来的几个数（含正确答案，已打乱）
  function makeRound(level, rnd) {
    rnd = rnd || Math.random;
    level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
    var m = pick(rnd, makersFor(level));
    var r = m(rnd, level);
    var count = level <= 2 ? 3 : 4;                 // 掉下来几个数
    var drops = [r.ans].concat(decoysFor(r.ans, rnd, count - 1));
    for (var i = drops.length - 1; i > 0; i--) {
      var j = rndInt(rnd, 0, i), t = drops[i]; drops[i] = drops[j]; drops[j] = t;
    }
    return { q: r.q, ans: r.ans, drops: drops, level: level };
  }

  /* ---------------- 难度 ---------------- */

  function levelFor(solved) {
    return Math.min(MAX_LEVEL, 1 + Math.floor(solved / PER_LEVEL));
  }
  // 落速：一屏高度要花几秒掉完。第 1 关 5.2 秒，往后越来越快，但不低于 2 秒——
  // 再快就只剩手速，和算得对不对没关系了
  function fallSecs(level) {
    return Math.max(2, 5.2 - (Math.min(MAX_LEVEL, level) - 1) * .28);
  }

  /* ---------------- 计分 ---------------- */

  function newGame() {
    return { score: 0, lives: LIVES, combo: 0, bestCombo: 0, solved: 0, wrong: 0, missed: 0, over: false };
  }

  // 连击最多按 5 算：再往上翻分会让「开局手气好」压过「一直在认真算」
  function hitScore(combo) { return 10 + Math.min(combo, 5) * 5; }

  function catchRight(s) {
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += hitScore(s.combo);
    s.solved += 1;
    return s;
  }

  function catchWrong(s) {
    s.combo = 0;
    s.wrong += 1;
    s.lives -= 1;
    if (s.lives <= 0) { s.lives = 0; s.over = true; }
    return s;
  }

  // 全掉到地上：多半是手没跟上，不是不会。只断连击，不扣心
  function missRound(s) {
    s.combo = 0;
    s.missed += 1;
    return s;
  }

  var API = {
    LIVES: LIVES, PER_LEVEL: PER_LEVEL, MAX_LEVEL: MAX_LEVEL,
    makeRound: makeRound, decoysFor: decoysFor,
    levelFor: levelFor, fallSecs: fallSecs,
    newGame: newGame, hitScore: hitScore,
    catchRight: catchRight, catchWrong: catchWrong, missRound: missRound,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CatchLogic = API;
}(typeof window !== "undefined" ? window : globalThis));
