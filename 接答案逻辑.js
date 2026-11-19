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

  /* ---------------- 四个阶段，由易到难 ----------------
     关卡不只是「掉得更快」，内容本身也在走台阶：
       一、20 以内加减        —— 先把手感和节奏建立起来，题本身不该拦人
       二、九九乘法（含除法） —— 练熟练度，乘和除混着出，背过的表才算会用
       三、凑整巧算           —— 25×4、99+36，开始讲「怎么算得快」
       四、两步混合 / 带括号  —— 运算顺序，最后这档才是真正的综合

     每个阶段三关（一关 5 题），所以大概十五题换一个主题。
     进了新阶段会回头抽两成旧题型：一换主题就把前面的忘光，不是我们要的。 */

  var STAGES = [
    {
      name: "20 以内加减",
      makers: [
        function (rnd) {                       // 不进位、进位都有
          var a = rndInt(rnd, 2, 18), b = rndInt(rnd, 2, 20 - a);
          return { q: a + " + " + b, ans: a + b };
        },
        function (rnd) {
          var a = rndInt(rnd, 5, 20), b = rndInt(rnd, 1, a - 1);
          return { q: a + " − " + b, ans: a - b };
        },
        function (rnd) {                       // 凑十：7 + 3 + 6 这种
          var a = rndInt(rnd, 3, 9), b = 10 - a, c = rndInt(rnd, 2, 9);
          return { q: a + " + " + b + " + " + c, ans: 10 + c };
        },
      ],
    },
    {
      name: "九九乘法 · 乘和除",
      makers: [
        function (rnd) {
          var a = rndInt(rnd, 2, 9), b = rndInt(rnd, 2, 9);
          return { q: a + " × " + b, ans: a * b };
        },
        function (rnd) {                       // 除法就是乘法反过来问
          var a = rndInt(rnd, 2, 9), b = rndInt(rnd, 2, 9);
          return { q: (a * b) + " ÷ " + b, ans: a };
        },
        function (rnd) {                       // 难背的那几行多出一点
          var a = pick(rnd, [6, 7, 8, 9]), b = pick(rnd, [6, 7, 8, 9]);
          return rnd() < .5
            ? { q: a + " × " + b, ans: a * b }
            : { q: (a * b) + " ÷ " + a, ans: b };
        },
      ],
    },
    {
      name: "凑整巧算",
      makers: [
        function (rnd) {                       // 25×4、125×8 这类，背下来就能秒答
          var pairs = [[25, 4], [25, 8], [125, 8], [50, 2], [20, 5], [15, 4], [12, 5]];
          var p = pick(rnd, pairs), a = p[0], b = p[1];
          if (rnd() < .5) { var t = a; a = b; b = t; }
          return { q: a + " × " + b, ans: a * b };
        },
        function (rnd) {                       // 99 + 36、147 − 48
          var near = pick(rnd, [99, 98, 101, 102, 199, 201]);
          var x = rndInt(rnd, 11, 60);
          return rnd() < .5
            ? { q: near + " + " + x, ans: near + x }
            : { q: (near + x) + " − " + x, ans: near };
        },
        function (rnd) {                       // 整十整百的乘法
          var a = pick(rnd, [20, 30, 40, 50, 60, 70, 80, 90]), b = rndInt(rnd, 2, 9);
          return { q: a + " × " + b, ans: a * b };
        },
      ],
    },
    {
      name: "两步混合 · 看运算顺序",
      makers: [
        function (rnd) {                       // 先乘后加减
          var a = rndInt(rnd, 2, 9), b = rndInt(rnd, 2, 9), c = rndInt(rnd, 1, 20);
          return rnd() < .5
            ? { q: a + " × " + b + " + " + c, ans: a * b + c }
            : { q: a + " × " + b + " − " + Math.min(c, a * b), ans: a * b - Math.min(c, a * b) };
        },
        function (rnd) {                       // 括号先算
          var a = rndInt(rnd, 3, 18), b = rndInt(rnd, 2, 12), c = pick(rnd, [2, 3, 4, 5]);
          return { q: "(" + a + " + " + b + ") × " + c, ans: (a + b) * c };
        },
        function (rnd) {                       // 先除后加
          var a = rndInt(rnd, 2, 9), b = rndInt(rnd, 2, 9), c = rndInt(rnd, 1, 20);
          return { q: (a * b) + " ÷ " + b + " + " + c, ans: a + c };
        },
      ],
    },
  ];

  var LEVELS_PER_STAGE = 3;

  function stageIndex(level) {
    return Math.min(STAGES.length - 1, Math.floor((Math.max(1, level) - 1) / LEVELS_PER_STAGE));
  }
  function stageOf(level) {
    var i = stageIndex(level);
    return { index: i, name: STAGES[i].name, first: i * LEVELS_PER_STAGE + 1 };
  }
  // 一关里第几关（1,2,3），用来告诉人「这个主题还剩几关」
  function stepInStage(level) {
    return ((Math.max(1, level) - 1) % LEVELS_PER_STAGE) + 1;
  }

  function makersFor(level) {
    var i = stageIndex(level);
    var list = STAGES[i].makers.slice();
    // 两成旧题型：换了主题也别把前面的丢干净
    if (i > 0) list = list.concat(STAGES[i - 1].makers, STAGES[i - 1].makers.length ? [] : []);
    return { main: STAGES[i].makers, all: list };
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
    var sets = makersFor(level);
    // 八成出本阶段的，两成回头抽上一阶段的
    var list = (rnd() < .8 || sets.all === sets.main) ? sets.main : sets.all;
    var m = pick(rnd, list);
    var r = m(rnd, level);
    var count = level <= 2 ? 3 : 4;                 // 掉下来几个数
    var drops = [r.ans].concat(decoysFor(r.ans, rnd, count - 1));
    for (var i = drops.length - 1; i > 0; i--) {
      var j = rndInt(rnd, 0, i), t = drops[i]; drops[i] = drops[j]; drops[j] = t;
    }
    return { q: r.q, ans: r.ans, drops: drops, level: level };
  }

  /* ---------------- 难度 ---------------- */

  // 选关要用：从第 N 关开局，等价于「已经答对过这么多题」
  function solvedForLevel(level) {
    return (Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1)) - 1) * PER_LEVEL;
  }

  // 打到哪一关就解锁到哪一关，但只升不降——这周打到第 7 关，下周打开还在
  function unlockTo(now, level) {
    return Math.max(1, Math.min(MAX_LEVEL, Math.max(now | 0 || 1, level | 0 || 1)));
  }

  function levelFor(solved) {
    return Math.min(MAX_LEVEL, 1 + Math.floor(solved / PER_LEVEL));
  }
  /* 落速：一屏高度要花几秒掉完。
     一开始是一路往下压到底，结果第 10 关起很难受——那时候的题是
     「9 × 6 − 16」「(14 + 5) × 3」，光读完就要两秒，再按前面的速度掉
     等于不给算。所以速度跟着「这一档的题要想多久」走：
     每进一个新阶段先松一口气，再在阶段内的三关里逐关收紧。
     题越复杂，这一档的起步就越慢——第四阶段起步比第一关还慢。 */
  var STAGE_SECS = [5.2, 5.0, 5.4, 6.6];
  var TIGHTEN = .35;                 // 同一阶段里每过一关收紧这么多秒
  var MIN_SECS = 2.6;

  function fallSecs(level) {
    var lv = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
    var base = STAGE_SECS[stageIndex(lv)];
    return Math.max(MIN_SECS, base - (stepInStage(lv) - 1) * TIGHTEN);
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

/* 夸奖用英语：一句一两个词，玩着玩着就记住了，顺带也是听力。
   分三档，连得越久夸得越夸张——一直是同一个调门，夸到第十句就没人听了。
   每一档都备足了句子：一局打顺手能连二三十个，句子少了就开始循环播放。 */
const PRAISE = [
  "Awesome!", "Great job!", "Well done!", "You got it!", "Nice one!", "Perfect!",
  "Excellent!", "Brilliant!", "Nailed it!", "Way to go!", "Super!", "Spot on!",
  "Good one!", "That's right!", "Clever!", "Sharp!", "Keep going!", "Lovely!",
];
const PRAISE_HOT = [
  "You are on fire!", "Amazing streak!", "Unstoppable!", "Fantastic!",
  "Three in a row!", "You are flying!", "So quick!", "Wonderful!",
  "Super smart!", "Look at you go!", "Incredible!", "Brilliant again!",
];
const PRAISE_FIRE = [
  "Absolutely amazing!", "You are a genius!", "Nobody can stop you!",
  "Math superstar!", "Unbelievable!", "Champion!", "Record breaker!",
  "You are on a roll!", "Legendary!", "Out of this world!",
];

// 刚说过的几句先不用：同一句连着出现两次，那股「有人在陪你」的劲儿立刻就没了
const saidLately = [];
function freshFrom(list) {
  const fresh = list.filter(x => saidLately.indexOf(x) < 0);
  const from = fresh.length ? fresh : list;         // 实在躲不开就不躲了
  const pickOne = from[Math.random() * from.length | 0];
  saidLately.push(pickOne);
  // 记住最近 6 句：比最短的那档（10 句）小，否则每次都退化成「躲不开」
  while (saidLately.length > 6) saidLately.shift();
  return pickOne;
}
function praisePhrase(combo) {
  return freshFrom(combo >= 7 ? PRAISE_FIRE : combo >= 3 ? PRAISE_HOT : PRAISE);
}


  var API = {
    LIVES: LIVES, PER_LEVEL: PER_LEVEL, MAX_LEVEL: MAX_LEVEL,
    makeRound: makeRound, decoysFor: decoysFor,
    levelFor: levelFor, fallSecs: fallSecs, solvedForLevel: solvedForLevel, unlockTo: unlockTo,
    stageOf: stageOf, stepInStage: stepInStage, STAGES: STAGES, LEVELS_PER_STAGE: LEVELS_PER_STAGE,
    newGame: newGame, hitScore: hitScore,
    praisePhrase: praisePhrase, PRAISE: PRAISE, PRAISE_HOT: PRAISE_HOT, PRAISE_FIRE: PRAISE_FIRE,
    catchRight: catchRight, catchWrong: catchWrong, missRound: missRound,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CatchLogic = API;
}(typeof window !== "undefined" ? window : globalThis));
