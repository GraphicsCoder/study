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
  var MASTER_LEVEL = 4;              // 到这一级就算「练熟」，用来算 unit 熟练度
  var MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  /* 每升一级之后隔多久才会再问到它。前三级故意排得很密：
     一次坐下来多打几关，二十分钟内就能把一个新词推到 3 级；
     但 3 级之后要隔一天——隔夜还记得才叫记住，当天连答十遍不算。
     所以「练熟」最快是今天推到 3 级、明天再答对一次。 */
  var GAP = [1 * MIN, 3 * MIN, 15 * MIN, 1 * DAY, 4 * DAY, 14 * DAY];

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
             k: (r && r.k) || {},                 // 各题型是不是都答对过
             seen: !!r };
  }

  /* 一个词一共会被问哪几种问法。
     词组没法听写也不好拼，长单词拼起来超出耐心，所以不是每个词都有四关。 */
  /* 一个词一共会被问哪几种问法。
     词组不出拼写和默写（在 iPad 上敲一长串太折磨），长单词没有字母块
     拼写关，但默写照样要写——那本来就是作业本上最常见的一题。 */
  function modesOf(item) {
    if (item.phrase) return ["en2cn", "cn2en"];
    if (canSpell(item)) return ["en2cn", "listen", "cn2en", "spell", "write"];
    return ["en2cn", "listen", "cn2en", "write"];
  }

  /* 这个词还差哪几种问法没答对过 */
  function modesLeft(item, prog) {
    var k = recOf(prog, item.id).k;
    return modesOf(item).filter(function (m) { return !k[m]; });
  }
  function passedAll(item, prog) { return modesLeft(item, prog).length === 0; }

  /* 记一次作答。kind 传进来才能记「这种问法会了」——
     答对记上，答错就把这种问法的记号抹掉：刚才错的就是这种问法，
     不能因为上周答对过就一直算它过关。 */
  function grade(prog, id, right, now, kind) {
    now = now || Date.now();
    var r = recOf(prog, id);
    var lv = right ? Math.min(MAX_LEVEL, r.lv + 1) : Math.max(0, r.lv - 1);
    var k = {};
    Object.keys(r.k).forEach(function (m) { k[m] = 1; });
    if (kind) { if (right) k[kind] = 1; else delete k[kind]; }
    var next = {
      lv: lv,
      // 答错的词不按等级排队，本关内就得再碰一次，所以直接 due 到当下
      due: right ? now + GAP[lv] : now,
      ok: r.ok + (right ? 1 : 0),
      no: r.no + (right ? 0 : 1),
      k: k
    };
    // 收藏标记跟练习进度是两件事，答题不该把它冲掉
    if (prog[id] && prog[id].star) next.star = 1;
    prog[id] = next;
    return next;
  }

  function isMastered(prog, id) { return recOf(prog, id).lv >= MASTER_LEVEL; }

  /* ---------------- 生词本 / 错词本 ----------------
     两个本子都只是对同一张进度表的不同筛法，不另开存储：
       生词本  自己点星星收进来的（star），想练哪个练哪个
       错词本  答错过、又还没练熟的（no>0 且没到 MASTER_LEVEL），自动攒
     「已经会了」的词留在本子里只会浪费时间，所以两个本子都要能当场移除。 */
  function star(prog, id, on) {
    var r = prog[id] || (prog[id] = { lv: 0, due: 0, ok: 0, no: 0 });
    if (on) r.star = 1; else delete r.star;
    return !!r.star;
  }
  function isStarred(prog, id) { return !!(prog[id] && prog[id].star); }

  function starred(pool, prog) {
    return pool.filter(function (x) { return isStarred(prog, x.id); });
  }
  /* 错词本的出入规则：
       进来   答错过（no>0）
       出去   在「过关测试」里把这个词能出的每一种问法连着答对一次
     平时练习答对不会自动把它放走——那很可能只是认得英文选中文，
     反过来让他写就又不会。要移除就当场证明一次，由页面调 clearWrong。 */
  function weak(pool, prog) {
    return pool.filter(function (x) { return recOf(prog, x.id).no > 0; });
  }

  /* 现在有多少词该复习了、下一批还要等多久。
     页面拿它写一句人话，免得小朋友打完一关看着进度条不动，
     以为「练了也没用」——其实只是还没到点。 */
  function dueInfo(pool, prog, now) {
    now = now || Date.now();
    var ready = 0, fresh = 0, next = null;
    pool.forEach(function (x) {
      var r = recOf(prog, x.id);
      if (!r.seen) { fresh++; return; }
      if (r.lv >= MASTER_LEVEL) return;          // 练熟的不催
      if (r.due <= now) ready++;
      else if (next === null || r.due < next) next = r.due;
    });
    return { ready: ready, fresh: fresh, next: next,
             wait: next === null ? null : Math.max(0, next - now) };
  }

  /* 从本子里拿掉：生词本就是取消收藏，错词本就是把错误记录清零。
     两个都不动等级——「不想在本子里再看见它」和「假装已经练熟了」
     是两回事，后者会把复习排期骗歪。 */
  function clearWrong(prog, id) {
    if (prog[id]) prog[id].no = 0;
  }

  /* unit 进度：页面上要画一条会动的条。
     不能直接用「练熟几个 / 一共几个」——练熟要连对四次，一关十题全对
     也只让十个词各升一级，条子几乎不动，看着像坏了。所以按等级加权：
     每个词把自己的等级（封顶在掌握线）折算成分数，全部练熟才是 100%。 */
  function unitStat(pool, prog) {
    var done = 0, started = 0, score = 0;
    pool.forEach(function (x) {
      var r = recOf(prog, x.id);
      if (r.seen) started++;
      if (r.lv >= MASTER_LEVEL) done++;
      score += Math.min(r.lv, MASTER_LEVEL);
    });
    var full = pool.length * MASTER_LEVEL;
    return { total: pool.length, started: started, mastered: done,
             pct: full ? Math.round(score / full * 100) : 0,
             masteredPct: pool.length ? Math.round(done / pool.length * 100) : 0 };
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
     五种问法：
       en2cn   看见英文选中文（最容易，只要求脸熟）
       listen  听发音选中文（把音和义接上）
       cn2en   看中文选英文（反过来想得起来）
       spell   看中文把打乱的字母排好（有提示的写）
       write   看中文直接默写出来（没提示，作业本上那种）

     等级只决定「最多能难到哪儿」，不决定「这次问哪种」：
       0 级    第一次见面，只在 认 / 听 里挑
       1 级起  五种随便挑（见过一回就该敢动笔了，不然一整关都遇不上默写）
     在允许的范围里随机，并且优先挑这个词还没答对过的问法——
     原来写死成「等级 → 问法」的一一对应，练到后面每道题都是中译英，
     练着练着就只剩一种花样了。 */
  var KINDS = ["en2cn", "listen", "cn2en", "spell", "write"];

  function kindFor(item, lv, rnd, left) {
    var all = modesOf(item);
    var cap = lv <= 0 ? ["en2cn", "listen"] : KINDS;
    var pool = all.filter(function (m) { return cap.indexOf(m) >= 0; });
    if (!pool.length) pool = all;

    // 还没过的问法优先，免得老在已经会了的那一种上打转
    var fresh = (left || []).filter(function (m) { return pool.indexOf(m) >= 0; });
    var pick = fresh.length ? fresh : pool;
    return pick[Math.floor(rand(rnd) * pick.length) % pick.length];
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

  /* force 传进来就按指定问法出题——错词本就是靠它逐个补齐没过的问法。
     平时不传，按等级来。 */
  function makeQuestion(item, pool, prog, rnd, all, force) {
    var lv = recOf(prog, item.id).lv;
    var kind = force || kindFor(item, lv, rnd, modesLeft(item, prog));
    if (kind === "spell" && !canSpell(item)) kind = "cn2en";
    if (kind === "write" && item.phrase) kind = "cn2en";
    if (kind === "write") {
      // 默写：只给中文和「几个字母」，自己把词写出来，和作业本上一样
      return {
        kind: "write", item: item, lv: lv,
        ask: item.c, hint: item.w.length + " 个字母",
        answer: item.w, speak: item.w
      };
    }
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
    // 手写的答案宽容一点：大小写、首尾空格、键盘打出的弯引号都不计较
    if (q.kind === "spell" || q.kind === "write") return norm(ans) === norm(q.answer);
    return ans === q.answer;
  }
  function norm(s) {
    return String(s || "").trim().toLowerCase()
      .replace(/[‘’ʼ]/g, "'")      // ’ → '
      .replace(/\s+/g, " ");
  }

  /* ---------------- 一关 ---------------- */

  /* 本子（生词本 / 错词本）里的一关：不是一个词问一道，
     而是把每个词的每一种问法都排成一道题——本子本来就是
     「这几个没拿下」，当然要把认 / 听 / 想 / 拼都过一遍。
     题太多就先排没答对过的那些，一关最多 MAX_DRILL 道；
     本子里只有一两个词时，就把这一轮再滚一遍，凑够 MIN_DRILL 道——
     不然点一下「练这一本」答两题就结束了，像没练。 */
  var MAX_DRILL = 20, MIN_DRILL = 8;

  function newDrill(items, prog, rnd, all) {
    var fresh = [], done = [];
    items.forEach(function (x) {
      modesOf(x).forEach(function (m) {
        (modesLeft(x, prog).indexOf(m) >= 0 ? fresh : done).push({ item: x, kind: m });
      });
    });
    var one = shuffle(fresh, rnd).concat(shuffle(done, rnd));
    var q = one.slice(0, MAX_DRILL);
    while (q.length && q.length < MIN_DRILL) {
      q = q.concat(shuffle(one, rnd).slice(0, MIN_DRILL - q.length));
    }
    return {
      queue: q, i: 0, right: 0, wrong: 0, combo: 0, best: 0, again: [],
      total: q.length, pool: items, all: all || items, drill: true
    };
  }

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
    grade(prog, q.item.id, right, now, q.kind);
    if (right) {
      round.right++;
      round.combo++;
      if (round.combo > round.best) round.best = round.combo;
    } else {
      round.wrong++;
      round.combo = 0;
      // 错题补到队尾，必须当场再答对一次才放过——错完就溜等于没学
      // 本子那种关要连问法一起补回去，否则重来时又换成简单的问法了
      round.again.push(round.drill ? { item: q.item, kind: q.kind } : q.item);
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
    modesOf: modesOf, modesLeft: modesLeft, passedAll: passedAll,
    star: star, isStarred: isStarred, starred: starred, weak: weak,
    clearWrong: clearWrong, dueInfo: dueInfo,
    pickSession: pickSession, kindFor: kindFor, canSpell: canSpell,
    distractors: distractors, makeQuestion: makeQuestion, scramble: scramble,
    check: check, newRound: newRound, newDrill: newDrill, MAX_DRILL: MAX_DRILL, MIN_DRILL: MIN_DRILL, answer: answer, nextItem: nextItem,
    stars: stars, shuffle: shuffle
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.词汇逻辑 = API;
})(typeof window !== "undefined" ? window : this);
