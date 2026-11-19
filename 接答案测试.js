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
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next();     // 预热：种子小的时候，头几个数会紧贴着 0，
  return next;                            // 不预热的话「两成概率」那种分支永远走不到
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

t("第一阶段只出 20 以内加减：开局不该被题本身拦住", () => {
  ROUNDS.filter(r => r.level <= 3).forEach(r => {
    assert(!/[×÷(]/.test(r.q), "第 " + r.level + " 关出现了 " + r.q);
    assert(r.ans <= 20, r.q + " = " + r.ans + "，超过 20 了");
  });
});

t("四个阶段按关卡排队，三关换一个主题", () => {
  assert(G.stageOf(1).index === 0 && G.stageOf(3).index === 0, "1–3 关是第一阶段");
  assert(G.stageOf(4).index === 1 && G.stageOf(6).index === 1, "4–6 关是第二阶段");
  assert(G.stageOf(7).index === 2, "7 关进第三阶段");
  assert(G.stageOf(10).index === 3 && G.stageOf(99).index === 3, "最后一个阶段封顶");
  assert(G.stepInStage(1) === 1 && G.stepInStage(3) === 3 && G.stepInStage(4) === 1, "阶段内第几关");
  G.STAGES.forEach(st => assert(st.name && st.makers.length >= 2, "阶段缺名字或题型太少"));
});

t("第二阶段乘除都要出，不能只剩乘法", () => {
  const qs = ROUNDS.filter(r => r.level >= 4 && r.level <= 6).map(r => r.q);
  assert(qs.some(q => q.indexOf("×") > -1), "一道乘法都没有");
  assert(qs.some(q => q.indexOf("÷") > -1), "一道除法都没有");
  // 九九表之内：乘数和被乘数都不超过 9
  qs.filter(q => q.indexOf("×") > -1).forEach(q => {
    q.split("×").forEach(x => assert(+x.trim() <= 9, "超出九九表：" + q));
  });
});

t("进了新阶段还会回头抽旧题型，别把前面的忘光", () => {
  const later = ROUNDS.filter(r => r.level >= 4 && r.level <= 6);
  assert(later.some(r => !/[×÷]/.test(r.q)), "第二阶段一道加减都没回头出");
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

t("同一个阶段里越往后掉得越快", () => {
  for (let st = 0; st < G.STAGES.length; st++) {
    let last = Infinity;
    for (let k = 0; k < G.LEVELS_PER_STAGE; k++) {
      const lv = st * G.LEVELS_PER_STAGE + k + 1;
      const sec = G.fallSecs(lv);
      assert(sec < last, "第 " + lv + " 关没比上一关快");
      last = sec;
    }
  }
});

t("换到新阶段会先松一口气：题变复杂了不能接着压速度", () => {
  for (let st = 1; st < G.STAGES.length; st++) {
    const lastOfPrev = st * G.LEVELS_PER_STAGE;          // 上一阶段最后一关
    const firstOfThis = lastOfPrev + 1;
    assert(G.fallSecs(firstOfThis) > G.fallSecs(lastOfPrev),
           "第 " + firstOfThis + " 关（新主题第一关）没有比上一关慢");
  }
});

t("两步混合那一档最慢：式子光读完就要两秒", () => {
  for (let k = 0; k < G.LEVELS_PER_STAGE; k++) {
    const hard = 3 * G.LEVELS_PER_STAGE + k + 1;         // 第四阶段
    const easy = k + 1;                                  // 第一阶段同位置
    assert(G.fallSecs(hard) > G.fallSecs(easy),
           "第 " + hard + " 关比第 " + easy + " 关还快，那是不给算");
  }
});

t("再快也有下限，超出关卡范围不会更快", () => {
  for (let lv = 1; lv <= G.MAX_LEVEL + 50; lv++) assert(G.fallSecs(lv) >= 2.6, lv + " 关只剩 " + G.fallSecs(lv) + " 秒");
  assert(G.fallSecs(G.MAX_LEVEL + 50) === G.fallSecs(G.MAX_LEVEL), "超出范围按封顶算");
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

t("选关：从第 N 关开局，关卡号对得上", () => {
  for (let lv = 1; lv <= G.MAX_LEVEL; lv++)
    assert(G.levelFor(G.solvedForLevel(lv)) === lv, "从第 " + lv + " 关开局，算出来却是第 " + G.levelFor(G.solvedForLevel(lv)) + " 关");
  assert(G.solvedForLevel(1) === 0, "第 1 关从零开始");
  assert(G.solvedForLevel(999) === G.solvedForLevel(G.MAX_LEVEL), "超出范围按封顶算");
});

t("解锁只升不降，也不会越界", () => {
  assert(G.unlockTo(1, 5) === 5, "打到第 5 关就解锁到 5");
  assert(G.unlockTo(7, 3) === 7, "打得差一点不该把解锁退回去");
  assert(G.unlockTo(1, 999) === G.MAX_LEVEL, "封顶");
  assert(G.unlockTo(0, 0) === 1, "最少解锁到第 1 关");
});
/* ---------------- 球摆在哪儿（手机上「去接中间那个却撞到旁边」的那档事） ---------------- */

const SCREENS = [320, 360, 390, 414, 430, 540, 768, 1024];
const radiusOf = w => Math.max(26, Math.min(40, w / 10));

t("任意两个球之间，大象站哪儿都只罩得住一个", () => {
  SCREENS.forEach(w => {
    const r = radiusOf(w), half = G.catchHalf(r);
    for (let lv = 1; lv <= G.MAX_LEVEL; lv++) {
      const n = G.dropCount(lv, w, r);
      for (let i = 0; i < 50; i++) {
        const xs = G.lanes(n, w, r, rng(lv * 97 + i)).slice().sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k++) {
          // 留 8px 给球自己的左右摇摆
          assert(xs[k] - xs[k - 1] >= half * 2 + 8,
                 w + "px 屏幕上两个球只隔了 " + Math.round(xs[k] - xs[k - 1]) + "，接球半宽是 " + half);
        }
      }
    }
  });
});

t("球不会排到屏幕外面去", () => {
  SCREENS.forEach(w => {
    const r = radiusOf(w);
    const n = G.dropCount(6, w, r);
    G.lanes(n, w, r, rng(w)).forEach(x => {
      assert(x - r >= 0 && x + r <= w, w + "px 屏幕上球跑到了 " + Math.round(x));
    });
  });
});

t("窄屏少掉一个球，宽屏才上四个", () => {
  assert(G.dropCount(6, 320, radiusOf(320)) === 3, "320 的屏幕还排 4 个就挤了");
  assert(G.dropCount(6, 1024, radiusOf(1024)) === 4, "大屏幕该上满 4 个");
  assert(G.dropCount(1, 1024, radiusOf(1024)) === 3, "前两关只上 3 个");
  SCREENS.forEach(w => {
    const n = G.dropCount(6, w, radiusOf(w));
    assert(n >= 2 && n <= 4, w + "px 上排了 " + n + " 个");
  });
});

t("要几个球就出几个数，答案照样只有一个", () => {
  [2, 3, 4].forEach(n => {
    for (let i = 0; i < 80; i++) {
      const r = G.makeRound(8, rng(n * 31 + i), n);
      assert(r.drops.length === n, "要 " + n + " 个却给了 " + r.drops.length);
      assert(r.drops.filter(d => d === r.ans).length === 1, JSON.stringify(r));
    }
  });
});

t("出场高度彼此错开：两个球不会同时压到大象头上", () => {
  [3, 4].forEach(n => {
    const r = 36;
    for (let i = 0; i < 80; i++) {
      const ys = G.dropOffsets(n, r, rng(i + 7)).slice().sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k++)
        assert(ys[k] - ys[k - 1] >= r * 1.5, "两个球只差 " + Math.round(ys[k] - ys[k - 1]) + " 像素就一起到了");
      ys.forEach(y => assert(y < 0, "球该从屏幕上方掉下来"));
    }
  });
});
console.log("\n" + (fail ? "失败 " + fail + " 项，" : "全部 ") + (pass + fail) + " 项" + (fail ? "" : "通过"));
process.exit(fail ? 1 : 0);
