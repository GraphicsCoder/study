/* 回到顶部按钮：出现时机、位置、点击行为、以及平滑滚动失效时的兜底 */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync("回到顶部.js", "utf8");

function makeEl(tag, byId) {
  const e = {
    tag, id: "", type: "", title: "", textContent: "", style: {}, children: [],
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
    focus() {}, blur() {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
    },
  };
  return e;
}

/* 一个够用的浏览器桩：能滚动、能派发事件、能把定时器攥在手里 */
function launch({ hasChip = true, smoothWorks = true, reduceMotion = false } = {}) {
  const byId = {};
  const on = {};
  const timers = [];
  let scrollY = 0;

  const doc = {
    _byId: byId,
    head: makeEl("head", byId),
    body: makeEl("body", byId),
    documentElement: { get scrollTop() { return scrollY; }, scrollHeight: 6000 },
    createElement: t => makeEl(t, byId),
    getElementById: id => byId[id] || null,
    addEventListener(t, fn) { (on[t] = on[t] || []).push(fn); },
  };
  if (hasChip) { const c = makeEl("div", byId); c.id = "syncchip"; byId.syncchip = c; }

  const win = {
    get pageYOffset() { return scrollY; },
    addEventListener(t, fn) { (on[t] = on[t] || []).push(fn); },
    matchMedia: () => ({ matches: reduceMotion }),
    scrollTo(a, b) {
      // 对象参数 = 现代浏览器；smoothWorks=false 模拟「平滑滚动是空操作」
      if (typeof a === "object") {
        if (a.behavior === "smooth" && !smoothWorks) return;
        scrollY = a.top;
      } else scrollY = b;
    },
  };

  const ctx = {
    document: doc, window: win, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);

  return {
    doc, byId, timers,
    btn: () => byId.totop,
    css: () => doc.head.children.map(c => c.textContent).join(""),
    scrollTo(y) { scrollY = y; (on.scroll || []).forEach(f => f()); },
    at: () => scrollY,
    fire(t) { (on[t] || []).forEach(f => f()); },
    runTimers() { const q = timers.splice(0); q.forEach(t => t.fn()); },
  };
}

const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));

/* 1. 基本外观与初始状态 */
let a = launch();
ok("按钮已插入", !!a.btn());
ok("是个 button，带无障碍标签",
   a.btn().tag === "button" && a.btn().attrs["aria-label"] === "回到顶部", a.btn().tag);
ok("初始不显示", !a.btn().classList.contains("on"));
ok("打印时隐藏", /@media print\{#totop\{display:none\}\}/.test(a.css()));

/* 2. 出现时机 */
a.scrollTo(100);
ok("滚一点点还不出现", !a.btn().classList.contains("on"), "y=100");
a.scrollTo(500);
ok("滚过阈值就出现", a.btn().classList.contains("on"), "y=500");
a.scrollTo(80);
ok("滚回去又隐藏", !a.btn().classList.contains("on"), "y=80");

/* 3. 位置：有同步小圆点时让开 */
ok("有小圆点时上移", a.btn().style.bottom === "64px", a.btn().style.bottom);
let b = launch({ hasChip: false });
ok("没小圆点时贴底", b.btn().style.bottom === "14px", b.btn().style.bottom);

/* 4. 小圆点是异步插进来的，露面时要复查位置 */
let c = launch({ hasChip: false });
ok("一开始按没有小圆点算", c.btn().style.bottom === "14px", c.btn().style.bottom);
const chip = makeEl("div", c.byId); chip.id = "syncchip"; c.byId.syncchip = chip;
c.scrollTo(600);
ok("小圆点后到也会让开", c.btn().style.bottom === "64px", c.btn().style.bottom);

/* 5. 点击回到顶部 */
let d = launch();
d.scrollTo(2000);
d.btn().onclick();
ok("点击后滚到顶", d.at() === 0, "y=" + d.at());

/* 6. 平滑滚动是空操作时的兜底 —— 点了没反应比没这个按钮还糟 */
let e = launch({ smoothWorks: false });
e.scrollTo(2000);
e.btn().onclick();
ok("平滑失效时当场没动", e.at() === 2000, "y=" + e.at());
e.runTimers();                       // 400ms 的兜底定时器
ok("兜底把页面直接拉回顶部", e.at() === 0, "y=" + e.at());

/* 7. 减少动态效果时直接跳，不走平滑 */
let f = launch({ reduceMotion: true, smoothWorks: false });
f.scrollTo(2000);
f.btn().onclick();
ok("减少动效时不依赖平滑滚动", f.at() === 0, "y=" + f.at());

/* 8. 已经在顶部时，兜底不该乱动 */
let g = launch({ smoothWorks: false });
g.scrollTo(0);
g.btn().onclick();
g.runTimers();
ok("本来就在顶部不出乱子", g.at() === 0, "y=" + g.at());

/* 9. 不会重复插入 */
let h = launch();
const before = h.doc.body.children.length;
vm.runInContext(SRC, vm.createContext({
  document: h.doc, window: { addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {} },
  console, setTimeout: () => 0, clearTimeout: () => {},
}));
ok("重复加载不会插两个", h.doc.body.children.length === before, h.doc.body.children.length);

/* 10. 文件里不能出现 script 结束标签，否则内联进 HTML 会被截断 */
ok("没有裸的 script 结束标签", !/<\/script/i.test(SRC));

console.log(out.join("\n"));
const bad = out.filter(x => x.startsWith("FAIL")).length;
console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
process.exit(bad ? 1 : 0);
