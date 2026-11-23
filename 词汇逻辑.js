/* 4A 词汇闯关 · 纯逻辑
 *
 * 不碰 DOM，方便用 node 直接测。页面负责画，这里负责决定：
 *   「这一关出哪些词」「这个词现在该用哪种问法」「答完之后它什么时候再出现」。
 *
 * 记忆模型用的是最老实的 Leitner 盒子：每个词有个等级 0..5，答对升一级、
 * 答错退一级，等级决定下次该隔多久再见面，也决定题目的难度——
 * 刚认识的词只要求「英→中」认得出来，熟了才要求你把它拼出来。
 * 这样同一个词在不同阶段是不同的题，背起来不会腻。
 */
(function (root) {
  "use strict";

  var MAX_LEVEL = 5;
  var MASTER_LEVEL = 4;              // 到这一级就算「会了」，用来算 unit 掌握度
  var MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  // 每一级答对之后隔多久再问。第 0 级是「刚答错 / 刚认识」，本节课内就要再见一次。
  var GAP = [1 * MIN, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];

  var PER_ROUND = 10;                // 一关十题，四年级小朋友一口气能吃下的量

  function rand(rnd) { return (rnd || Math.random)(); }

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand(rnd) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 进度 ---------------- */

  /* 进度表长这样：{ "u1-3": { lv: 2, due: 1700000000000, ok: 5, no: 1 } }
     没出现过的词就是没学过。读的时候一律走 recOf，省得到处判空。 */
  function recOf(prog, id) {
    var r = prog && prog[id];
    return { lv: (r && r.lv) || 0, due: (r && r.due) || 0,
             ok: (r && r.ok) || 0, no: (r && r.no) || 0,
             seen: !!r };
  }

  function grade(prog, id, right, now) {
    now = now || Date.now();
    var r = recOf(prog, id);
    var lv = right ? Math.min(MAX_LEVEL, r.lv + 1) : Math.max(0, r.lv - 1);
    var next = {
      lv: lv,
      // 答错的词不按等级排队，本关内就得再碰一次，所以直接 due 到当下
      due: right ? now + GAP[lv] : now,
      ok: r.ok + (right ? 1 : 0),
      no: r.no + (right ? 0 : 1)
    };
    prog[id] = next;
    return next;
  }

  function isMastered(prog, id) { return recOf(prog, id).lv >= MASTER_LEVEL; }

  /* unit 掌握度：会了几个 / 一共几个，页面上用来画进度条 */
  function unitStat(pool, prog) {
    var done = 0, started = 0;
    pool.forEach(function (x) {
      var r = recOf(prog, x.id);
      if (r.seen) started++;
      if (r.lv >= MASTER_LEVEL) done++;
    });
    return { total: pool.length, started: started, mastered: done,
             pct: pool.length ? Math.round(done / pool.length * 100) : 0 };
  }

  /* ---------------- 选词 ----------------
     优先级：到期该复习的 → 没学过的新词 → 还没到期但等级最低的。
     新词每关最多塞一半，剩下留给复习；不然背到后面全是新面孔，越背越慌。 */
  function pickSession(pool, prog, now, n, rnd) {
    now = now || Date.now();
    n = n || PER_ROUND;

    var due = [], fresh = [], rest = [];
    pool.forEach(function (x) {
      var r = recOf(prog, x.id);
      if (!r.seen) fresh.push(x);
      else if (r.due <= now) due.push([x, r]);
      else rest.push([x, r]);
    });

    due.sort(function (a, b) { return a[1].due - b[1].due; });
    rest.sort(function (a, b) { return a[1].lv - b[1].lv || a[1].due - b[1].due; });

    var out = due.slice(0, n).map(function (p) { return p[0]; });
    var maxFresh = Math.max(1, Math.ceil(n / 2));
    if (out.length < n) out = out.concat(fresh.slice(0, Math.min(n - out.length, maxFresh)));
    if (out.length < n) {
      var used = {};
      out.forEach(function (x) { used[x.id] = 1; });
      var more = fresh.concat(rest.map(function (p) { return p[0]; }))
        .filter(function (x) { return !used[x.id]; });
      out = out.concat(more.slice(0, n - out.length));
    }
    return shuffle(out, rnd);
  }

  /* ---------------- 出题 ----------------
     同一个词，等级越高问得越狠：
       0  en2cn   看见英文选中文（最容易，只要求脸熟）
       1  listen  听发音选中文（把音和义接上）
       2  cn2en   看中文选英文（反过来想得起来）
       3+ spell   看中文把字母拼出来（真的会写了）
     词组没法听写也不好拼，所以只在 en2cn / cn2en 之间轮换。 */
  var KINDS = ["en2cn", "listen", "cn2en", "spell"];

  function kindFor(item, lv, rnd) {
    if (item.phrase) return lv >= 2 ? "cn2en" : "en2cn";
    if (lv >= 3 && canSpell(item)) return "spell";
    if (lv >= 3) return "cn2en";
    return KINDS[Math.min(lv, 2)];
  }

  function canSpell(item) {
    return !item.phrase && /^[a-zA-Z']{3,10}$/.test(item.w);
  }

  /* 干扰项：先在同一个 unit、同一类（单词/词组）里找，不够再放宽到全库。
     同 unit 的干扰项才有意义——跨 unit 的词一眼就能排除，等于白送。 */
  function distractors(item, pool, all, n, rnd) {
    function fit(list) {
      return list.filter(function (x) {
        return x.id !== item.id && x.phrase === item.phrase &&
               x.c !== item.c && x.w.toLowerCase() !== item.w.toLowerCase();
      });
    }
    var near = shuffle(fit(pool), rnd);
    var out = near.slice(0, n);
    if (out.length < n) {
      var used = {}; out.concat([item]).forEach(function (x) { used[x.id] = 1; });
      var wide = shuffle(fit(all || pool).filter(function (x) { return !used[x.id]; }), rnd);
      out = out.concat(wide.slice(0, n - out.length));
    }
    return out;
  }

  function makeQuestion(item, pool, prog, rnd, all) {
    var lv = recOf(prog, item.id).lv;
    var kind = kindFor(item, lv, rnd);

    if (kind === "spell") {
      return {
        kind: "spell", item: item, lv: lv,
        ask: item.c, hint: item.w[0] + "……（" + item.w.length + " 个字母）",
        answer: item.w,
        tiles: scramble(item.w, rnd),
        speak: item.w
      };
    }

    var bad = distractors(item, pool, all, 3, rnd);
    var opts, answer;
    if (kind === "cn2en") {
      answer = item.w;
      opts = shuffle([item].concat(bad).map(function (x) { return x.w; }), rnd);
      return { kind: kind, item: item, lv: lv, ask: item.c, choices: opts,
               answer: answer, speak: item.w };
    }
    // en2cn / listen：选项都是中文，区别只在题面给不给英文
    answer = item.c;
    opts = shuffle([item].concat(bad).map(function (x) { return x.c; }), rnd);
    return { kind: kind, item: item, lv: lv,
             ask: kind === "listen" ? "" : item.w,
             choices: opts, answer: answer, speak: item.w };
  }

  /* 拼写题的字母块：打乱，但保证不等于原词（否则题目等于答案白给） */
  function scramble(word, rnd) {
    var letters = word.split("");
    if (letters.length < 2) return letters;
    for (var i = 0; i < 12; i++) {
      var s = shuffle(letters, rnd);
      if (s.join("") !== word) return s;
    }
    // 极端情况（比如 "aaa"）打乱不出区别，那就原样给，答案照样对
    return letters;
  }

  function check(q, ans) {
    if (q.kind === "spell") return norm(ans) === norm(q.answer);
    return ans === q.answer;
  }
  function norm(s) { return String(s || "").trim().toLowerCase(); }

  /* ---------------- 一关 ---------------- */

  function newRound(pool, prog, now, rnd, all) {
    var items = pickSession(pool, prog, now, PER_ROUND, rnd);
    return {
      queue: items, i: 0, right: 0, wrong: 0, combo: 0, best: 0,
      again: [],                      // 答错的词，本关结束前会再来一遍
      total: items.length, pool: pool, all: all || pool
    };
  }

  function answer(round, q, ans, prog, now) {
    var right = check(q, ans);
    grade(prog, q.item.id, right, now);
    if (right) {
      round.right++;
      round.combo++;
      if (round.combo > round.best) round.best = round.combo;
    } else {
      round.wrong++;
      round.combo = 0;
      // 错词补到队尾，必须当场再答对一次才放过——错完就溜等于没学
      round.again.push(q.item);
    }
    return right;
  }

  function nextItem(round) {
    if (round.i < round.queue.length) return round.queue[round.i++];
    if (round.again.length) return round.again.shift();
    return null;
  }

  function stars(round) {
    if (!round.total) return 0;
    var r = round.right / (round.right + round.wrong);
    return r >= 0.95 ? 3 : r >= 0.8 ? 2 : r >= 0.6 ? 1 : 0;
  }

  var API = {
    MAX_LEVEL: MAX_LEVEL, MASTER_LEVEL: MASTER_LEVEL, PER_ROUND: PER_ROUND, GAP: GAP,
    recOf: recOf, grade: grade, isMastered: isMastered, unitStat: unitStat,
    pickSession: pickSession, kindFor: kindFor, canSpell: canSpell,
    distractors: distractors, makeQuestion: makeQuestion, scramble: scramble,
    check: check, newRound: newRound, answer: answer, nextItem: nextItem,
    stars: stars, shuffle: shuffle
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.词汇逻辑 = API;
})(typeof window !== "undefined" ? window : this);
