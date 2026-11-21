/* 搬家测试.js —— 跑法：node 搬家测试.js
 *
 * 拖放游戏最怕两件事，都测了：
 *   1. 题出得不合理：让人把球放进「床里面」，或者 between 只给了一件家具
 *   2. 可放点挨得太近：孩子明明拖对了，却被判成旁边那个点
 * 另外还有句子本身——Put the cat under the bed. 这句话会被读出来，
 * 拼错一个词，听力就跟着错。
 */
"use strict";
const M = require("./搬家逻辑.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("PASS " + name); pass++; }
  catch (e) { console.log("FAIL " + name + " —— " + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || "不成立"); }

function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next();
  return next;
}

const TASKS = [];
for (let lv = 1; lv <= M.MAX_LEVEL; lv++)
  for (let i = 0; i < 300; i++) TASKS.push(M.makeTask(lv, rng(lv * 811 + i)));

/* ---------------- 出题 ---------------- */

t("两件家具不会是同一件", () => {
  TASKS.forEach(k => assert(k.anchors[0].en !== k.anchors[1].en, JSON.stringify(k.anchors.map(a => a.en))));
});

t("只有能装东西的才出 in（床里面放不了球）", () => {
  TASKS.filter(k => k.prep === "in").forEach(k => {
    assert(k.anchors[k.ai].container, "让人把东西放进 " + k.anchors[k.ai].en + " 里");
  });
});

t("between 指向两件家具，不指某一件", () => {
  TASKS.filter(k => k.prep === "between").forEach(k => assert(k.ai === -1, JSON.stringify(k)));
});

t("每一关只出这一关教过的词", () => {
  TASKS.forEach(k => {
    const allow = M.STAGES[Math.min(M.STAGES.length - 1, Math.floor((k.level - 1) / M.LEVELS_PER_STAGE))].preps;
    assert(allow.indexOf(k.prep) > -1, "第 " + k.level + " 关出现了 " + k.prep);
  });
});

t("第一关只有 in / on / under，最难的词留到后面", () => {
  TASKS.filter(k => k.level <= M.LEVELS_PER_STAGE).forEach(k => {
    assert(["in", "on", "under"].indexOf(k.prep) > -1, "第 1 关出现了 " + k.prep);
  });
});

/* ---------------- 读出来的那句话 ---------------- */

t("英文句子是完整的一句，没有缺词或多余空格", () => {
  TASKS.forEach(k => {
    assert(/^Put the [a-z]+ .+\.$/.test(k.en), "句子不成形：" + k.en);
    assert(!/\s\s|\sthe\s+the\s/.test(k.en), "多了空格或 the：" + k.en);
    assert(k.en.indexOf(k.item.en) > -1, k.en + " 里没有要搬的东西");
  });
});

t("between 读成 between A and B，不是 between the A", () => {
  TASKS.filter(k => k.prep === "between").forEach(k => {
    assert(k.en.indexOf("between the " + k.anchors[0].en + " and the " + k.anchors[1].en) > -1, k.en);
  });
});

t("中文提示跟英文说的是同一件事", () => {
  TASKS.forEach(k => {
    assert(k.cn.indexOf(k.item.cn) > -1, k.cn + " 里没有要搬的东西");
    if (k.prep === "between") {
      assert(k.cn.indexOf("中间") > -1, k.cn);
    } else {
      assert(k.cn.indexOf(k.anchors[k.ai].cn) > -1, k.cn + " 没提到 " + k.anchors[k.ai].cn);
    }
  });
});

/* ---------------- 可放点的几何 ---------------- */

// 布局用的就是游戏里那一份（上面留 150 给题面，下面留 120 给待搬的东西）
const layout = (w, h) => M.layoutFor(w, h, 150, h - 120);
const SCREENS = [[360, 640], [390, 780], [430, 860], [768, 1024], [1024, 768]];
const ALL = M.STAGES[M.STAGES.length - 1].preps;
const META = [{ container: true }, { container: true }];

t("可放点两两离得够开：拖对了不会被判成旁边那个", () => {
  SCREENS.forEach(([w, h]) => {
    const sp = M.spots(layout(w, h), ALL, META);
    for (let i = 0; i < sp.length; i++)
      for (let j = i + 1; j < sp.length; j++) {
        const d = Math.hypot(sp[i].x - sp[j].x, sp[i].y - sp[j].y);
        assert(d >= Math.max(sp[i].r, sp[j].r) * 1.1,
               w + "×" + h + " 上 " + sp[i].prep + "(" + sp[i].ai + ") 和 " +
               sp[j].prep + "(" + sp[j].ai + ") 只差 " + Math.round(d));
      }
  });
});

t("能装东西的才有「里面」这个点", () => {
  const sp = M.spots(layout(390, 780), ALL, [{ container: false }, { container: true }]);
  assert(!sp.some(s => s.prep === "in" && s.ai === 0), "床也给了「里面」");
  assert(sp.some(s => s.prep === "in" && s.ai === 1), "箱子没有「里面」");
});

t("这一关没教的词不出现在场上", () => {
  const sp = M.spots(layout(390, 780), ["in", "on", "under"], META);
  assert(sp.every(s => ["in", "on", "under"].indexOf(s.prep) > -1),
         "出现了没教的：" + sp.map(s => s.prep).join(","));
  assert(!sp.some(s => s.prep === "between"), "between 还没教就摆出来了");
});

t("between 只在两件家具的正中间，而且要有两件才出现", () => {
  const lay = layout(390, 780);
  const sp = M.spots(lay, ALL, META);
  const b = sp.find(s => s.prep === "between");
  assert(b && Math.abs(b.x - (lay[0].x + lay[1].x) / 2) < .001, JSON.stringify(b));
  const one = M.spots([lay[0]], ALL, [META[0]]);
  assert(!one.some(s => s.prep === "between"), "只有一件家具也给了 between");
});

t("上面在上、下面在下、旁边在旁边（方向不能搞反）", () => {
  const lay = layout(390, 780);
  const sp = M.spots(lay, ALL, META);
  const at = (p, i) => sp.find(s => s.prep === p && s.ai === i);
  assert(at("on", 0).y < lay[0].y, "「上面」跑到下面去了");
  assert(at("under", 0).y > lay[0].y, "「下面」跑到上面去了");
  // 「旁边 / 前面 / 后面」都朝外侧摆：中间那块留给 between，
  // 否则左边这件的「旁边」正好压在 between 上
  assert(at("next to", 0).x < lay[0].x, "左边那件的「旁边」该在它左边");
  assert(at("next to", 1).x > lay[1].x, "右边那件的「旁边」该在它右边");
  assert(at("behind", 0).y < lay[0].y, "「后面」应该偏上，画起来才像在后面");
  assert(at("in front of", 0).y > lay[0].y, "「前面」应该偏下");
});

/* ---------------- 判对错 ---------------- */

t("拖到正确的点上就算对", () => {
  const lay = layout(430, 860);
  const sp = M.spots(lay, ALL, META);
  sp.forEach(s => {
    const task = { prep: s.prep, ai: s.ai };
    const r = M.judge(sp, s.x, s.y, task);
    assert(r.ok, "拖到 " + s.prep + " 的正中间却判错了");
  });
});

t("拖到别的点上判错，而且能说出那儿是什么", () => {
  const lay = layout(430, 860);
  const sp = M.spots(lay, ALL, META);
  const on0 = sp.find(s => s.prep === "on" && s.ai === 0);
  const r = M.judge(sp, on0.x, on0.y, { prep: "under", ai: 0 });
  assert(!r.ok && r.spot.prep === "on", JSON.stringify(r));
});

t("放到空地上不算错，只当没放好", () => {
  const lay = layout(430, 860);
  const sp = M.spots(lay, ALL, META);
  const r = M.judge(sp, 5, 5, { prep: "on", ai: 0 });
  assert(r.miss && !r.ok, JSON.stringify(r));
});

t("手指差一点也算：偏半个点的距离仍然判对", () => {
  SCREENS.forEach(([w, h]) => {
    const sp = M.spots(layout(w, h), ALL, META);
    sp.forEach(s => {
      [[s.r * .5, 0], [-s.r * .5, 0], [0, s.r * .5], [0, -s.r * .5]].forEach(([dx, dy]) => {
        const r = M.judge(sp, s.x + dx, s.y + dy, { prep: s.prep, ai: s.ai });
        assert(r.ok, w + "×" + h + " 上，" + s.prep + " 偏了半个点就判错，太苛刻了");
      });
    });
  });
});

t("所有可放点都在场地里，没有被甩到屏幕外", () => {
  SCREENS.forEach(([w, h]) => {
    M.spots(layout(w, h), ALL, META).forEach(s => {
      assert(s.x - s.r >= 0 && s.x + s.r <= w, w + "×" + h + " 上 " + s.prep + " 横向出界：" + Math.round(s.x));
      assert(s.y - s.r >= 0 && s.y + s.r <= h, w + "×" + h + " 上 " + s.prep + " 纵向出界：" + Math.round(s.y));
    });
  });
});

/* ---------------- 计分和进度 ---------------- */

t("放对加分、连击累加，关卡越高越值钱", () => {
  const s = M.newGame();
  M.right(s, 1);
  assert(s.solved === 1 && s.combo === 1 && s.score === M.hitScore(1, 1), JSON.stringify(s));
  assert(M.hitScore(5, M.MAX_LEVEL) > M.hitScore(5, 1), "后面的关卡没有更值钱");
});

t("放错不扣心，只断连击（这游戏是教它在哪儿，不是罚人）", () => {
  const s = M.newGame();
  M.right(s, 1); M.wrong(s);
  assert(s.lives === 3 && s.combo === 0 && s.wrong === 1 && !s.over, JSON.stringify(s));
  assert(s.bestCombo === 1, "最长连击被抹掉了");
});

t("通关线 = 关卡数 × 每关题数", () => {
  assert(M.CLEAR_AT === M.MAX_LEVEL * M.PER_LEVEL, "通关线是 " + M.CLEAR_AT);
  assert(!M.isCleared(M.CLEAR_AT - 1) && M.isCleared(M.CLEAR_AT), "通关判定不对");
  assert(M.leftToClear(0) === M.CLEAR_AT && M.leftToClear(999) === 0, "还差几题算错了");
  assert(M.levelFor(M.CLEAR_AT - 1) === M.MAX_LEVEL, "最后一题该在最后一关");
});

/* ---------------- 错得多的词多出几次 ---------------- */

t("错得多的词权重更高，全对的词权重最低", () => {
  const w = p => M.weightOf(p, { on: { right: 10, wrong: 0 }, behind: { right: 1, wrong: 9 }, under: { right: 5, wrong: 5 } });
  assert(w("on") < w("under") && w("under") < w("behind"), [w("on"), w("under"), w("behind")].join(" "));
  assert(w("behind") <= 4, "权重最高也就 4 倍，不能变成一直按着打同一个词：" + w("behind"));
  assert(w("next to") > 1, "没做过的词该稍微偏向它");
});

t("没有统计也能正常出题（第一次玩）", () => {
  for (let i = 0; i < 200; i++) {
    const t1 = M.makeTask(3, rng(i), null);
    const t2 = M.makeTask(3, rng(i + 999), {});
    assert(t1.prep && t2.prep, "没有统计就出不了题");
  }
});

t("统计里的脏数据不会影响出题", () => {
  const junk = { on: null, 乱写: { right: 3, wrong: 9 }, under: { right: "x", wrong: undefined } };
  for (let i = 0; i < 200; i++) {
    const k = M.makeTask(6, rng(i + 7), junk);
    const allow = M.STAGES[M.STAGES.length - 1].preps;
    assert(allow.indexOf(k.prep) > -1, "出了一个不存在的词：" + k.prep);
  }
});

t("长远看，错得多的那个词确实出得更多", () => {
  const stats = { in: { right: 20, wrong: 0 }, on: { right: 20, wrong: 0 }, under: { right: 2, wrong: 18 } };
  const n = {};
  for (let i = 0; i < 3000; i++) {
    const k = M.makeTask(1, rng(i + 1), stats);
    n[k.prep] = (n[k.prep] || 0) + 1;
  }
  assert(n.under > n.on * 1.5 && n.under > n["in"] * 1.5, JSON.stringify(n));
  assert(n.on > 200 && n["in"] > 200, "练熟的词也不能一次都不出：" + JSON.stringify(n));
});

t("最该练的词：错得最多的那个；做得太少不下结论", () => {
  assert(M.weakest({ behind: { right: 1, wrong: 4 }, on: { right: 9, wrong: 1 } }) === "behind", "没挑出 behind");
  assert(M.weakest({ on: { right: 2, wrong: 1 } }) === null || M.weakest({ on: { right: 1, wrong: 1 } }) === null,
         "只做过两次就下结论了");
  assert(M.weakest({}) === null && M.weakest(null) === null, "没有统计时该返回空");
  assert(M.weakest({ on: { right: 9, wrong: 0 } }) === null, "全对的词不该被挑出来");
});
console.log("\n" + (fail ? "失败 " + fail + " 项，" : "全部 ") + (pass + fail) + " 项" + (fail ? "" : "通过"));
process.exit(fail ? 1 : 0);
