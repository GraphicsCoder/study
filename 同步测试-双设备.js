/* 两台设备的完整往返：A 做题 → 推上去 → B 打开 → 看得到
   这一套专门盯「跨页面补传」：A 在数学页做完题没等推送就跳走，
   数学进度能不能靠别的页面（甚至导航页）补传上去。 */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync(process.env.SYNC_SRC || "同步.js", "utf8");

function makeDoc() {
  const byId = {};
  const listeners = {};
  function el(tag) {
    const e = {
      tag, dataset: {}, children: [], style: {},
      id: "", className: "", textContent: "", title: "", type: "", value: "", _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(h) {
        this._html = h;
        for (const m of h.matchAll(/id="([^"]+)"/g)) { const c = el("div"); c.id = m[1]; byId[m[1]] = c; }
      },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
      addEventListener() {}, querySelector(s) { return byId[s.replace("#", "")] || null; }, focus() {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    };
    return e;
  }
  const doc = {
    _byId: byId, _on: listeners, head: el("head"), body: el("body"), createElement: el,
    visibilityState: "visible",
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    currentScript: { dataset: {} },
  };
  let n = 0; const orig = doc.createElement;
  doc.createElement = t => { const e = orig(t); if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; } return e; };
  return doc;
}

/* 一台「设备」：自带一份 localStorage，可以反复打开不同的页面 */
function Device(name, cloud) {
  const store = {};
  const dev = {
    name, store,
    /* 打开某个页面：跑一次 sync.js；返回这个页面上下文 */
    open(dataKey) {
      const ls = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
      };
      const doc = makeDoc();
      doc.currentScript = { dataset: dataKey ? { key: dataKey } : {} };
      const reloads = [];
      const pending = [];        // 挂起的防抖定时器
      const ctx = {
        document: doc, window: { addEventListener(t, fn) { (doc._on[t] = doc._on[t] || []).push(fn); } },
        localStorage: ls,
        sessionStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = v; } },
        navigator: {}, location: { reload() { reloads.push(1); } }, console, confirm: () => true,
        Date: FakeDate,
        // 防抖要真的生效，否则「切后台提前冲一次」根本测不出来：
        // ≥1 秒的定时器挂起，由测试显式 flush；短的（内部流程用）立即执行。
        setTimeout: (fn, ms) => {
          if (ms === 15000 || ms === 600) return 0;
          if (ms >= 1000) { pending.push(fn); return pending.length; }
          fn(); return 0;
        },
        clearTimeout: (id) => { if (id >= 1) pending[id - 1] = null; },
        fetch: cloud.fetch,
      };
      vm.createContext(ctx); vm.runInContext(SRC, ctx);
      return {
        doc, reloads, ls, pending,
        flush() { const q = pending.splice(0); q.forEach(f => f && f()); },
        /* 模拟页面保存一次进度（练习页就是这么存的） */
        answer(payload) { ls.setItem(dataKey, JSON.stringify(payload)); },
        hide() { doc.visibilityState = "hidden"; (doc._on.visibilitychange || []).forEach(f => f()); },
        show() { doc.visibilityState = "visible"; (doc._on.visibilitychange || []).forEach(f => f()); },
        back() { (doc._on.pageshow || []).forEach(f => f({ persisted: true })); },
        chipText: () => doc._byId.syncchip.textContent,
      };
    },
  };
  return dev;
}

/* 共享的假 GitHub：两台设备连同一个 gist */
function Cloud() {
  const gists = {};
  const log = [];
  const resp = (status, obj) => Promise.resolve({
    ok: status >= 200 && status < 300, status,
    headers: { get: () => null },
    json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)),
  });
  const c = {
    gists, log,
    fetch(url, opt = {}) {
      log.push((opt.method || "GET") + " " + url.replace("https://api.github.com", ""));
      if (url.endsWith("/user")) return resp(200, { login: "lisa" });
      const m = url.match(/\/gists\/([^?]+)/);
      if (m) {
        const id = m[1];
        if (!gists[id]) return resp(404, { message: "Not Found" });
        if (opt.method === "PATCH") { gists[id] = { files: JSON.parse(opt.body).files }; return resp(200, { id }); }
        return resp(200, { id, files: gists[id].files });
      }
      if (url.endsWith("/gists") && opt.method === "POST") {
        gists.GID = { files: JSON.parse(opt.body).files };
        return resp(201, { id: "GID" });
      }
      return resp(404, { message: "Not Found" });
    },
    progress() {
      const g = gists.GID;
      if (!g) return null;
      return JSON.parse(g.files["study-progress.json"].content);
    },
  };
  return c;
}

/* 时间戳是这套逻辑的核心（谁新谁赢），必须可控。
   真实 Date.now 在同一毫秒内会打平，也没法模拟「隔了一会儿」。 */
let CLOCK = 1_700_000_000_000;
const tickClock = (ms = 1000) => (CLOCK += ms);
const FakeDate = new Proxy(Date, { get: (t, k) => (k === "now" ? () => CLOCK : Reflect.get(t, k)) });

const MATH = "math-tdsjs-v1", ENG = "prep-practice-v1";
const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));
const tick = (n = 14) => new Promise(r => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });

(async () => {
  const cloud = Cloud();
  const A = Device("A", cloud), B = Device("B", cloud);

  // 两台设备都配好 Gist（B 填 A 那串 id）
  Object.assign(A.store, { __sync_mode__: "gist", __sync_gh_token__: "ghp_a", __sync_gist_id__: "GID" });
  cloud.gists.GID = { files: { "study-progress.json": { content: "{}" } } };
  Object.assign(B.store, { __sync_mode__: "gist", __sync_gh_token__: "ghp_b", __sync_gist_id__: "GID" });

  /* ---- 场景一：A 在数学页做题，等推送完成 ---- */
  let a1 = A.open(MATH);
  await tick();
  a1.answer({ correct: ["q1", "q2"] });
  a1.flush();                       // 防抖到点
  await tick();
  ok("A 做完题推上去了", !!(cloud.progress() || {})[MATH], JSON.stringify(cloud.progress()));

  let b1 = B.open(MATH);
  await tick();
  ok("B 打开数学页看得到", B.store[MATH] === '{"correct":["q1","q2"]}', B.store[MATH]);
  ok("B 需要刷新一次页面", b1.reloads.length === 1, b1.reloads.length);

  /* ---- 场景二：A 做完题立刻跳走（这是原来丢数据的地方） ---- */
  // 新开一页模拟「跳到英语页」：数学的改动还没来得及推
  const cloudBefore = JSON.stringify(cloud.progress());
  tickClock();
  let a2 = A.open(MATH);
  await tick();
  a2.answer({ correct: ["q1", "q2", "q3"] });   // 做了第三题
  // 不 flush，直接走人——防抖还没到点就跳去了别的页面
  ok("云端此时还是旧的", JSON.stringify(cloud.progress()) === cloudBefore, JSON.stringify(cloud.progress()));

  // A 打开英语页（完全不同的 KEY）——应当把数学的进度一并补传
  let a3 = A.open(ENG);
  await tick();
  const p = cloud.progress() || {};
  ok("换一个页面也会补传数学进度",
     p[MATH] && p[MATH].v.correct.length === 3, JSON.stringify(p[MATH]));

  // B 再打开数学页，应当拿到三题
  let b2 = B.open(MATH);
  await tick();
  ok("B 这次拿到 3 题", JSON.parse(B.store[MATH]).correct.length === 3, B.store[MATH]);

  /* ---- 场景三：导航页（没有 data-key）也能补传 ---- */
  tickClock();
  let a3b = A.open(MATH);
  await tick();
  a3b.answer({ correct: ["q1", "q2", "q3", "q4"] });   // 又做一题，仍不 flush
  let a4 = A.open(null);                     // 直接去导航页
  await tick();
  ok("导航页也会补传", (cloud.progress()[MATH] || {}).v.correct.length === 4,
     JSON.stringify(cloud.progress()[MATH]));

  /* ---- 场景四：多个页面同时待传，一次请求写完 ---- */
  tickClock();
  let a4b = A.open(ENG);  await tick();  a4b.answer({ score: 5 });
  tickClock();
  let a4c = A.open(MATH); await tick();  a4c.answer({ correct: ["q1", "q2", "q3", "q4", "q5"] });
  cloud.log.length = 0;
  let a5 = A.open(null);
  await tick();
  const patches = cloud.log.filter(x => x.startsWith("PATCH")).length;
  ok("两页待传只发一次写请求", patches === 1, cloud.log.join(" | "));
  const p2 = cloud.progress();
  ok("两页的数据都写进去了",
     !!(p2[ENG] && p2[MATH]) && p2[ENG].v.score === 5 && p2[MATH].v.correct.length === 5,
     JSON.stringify(p2));

  /* ---- 场景五：切到后台立刻冲一次，不等防抖 ---- */
  tickClock();
  let a6 = A.open(MATH);
  await tick();
  a6.answer({ correct: ["z"] });            // 防抖挂起，还没推
  cloud.log.length = 0;
  ok("防抖期间确实还没推", !cloud.log.some(x => x.startsWith("PATCH")), cloud.log.join(" | "));
  a6.hide();                                 // 切到后台
  await tick();
  ok("切后台会立刻推送", cloud.log.some(x => x.startsWith("PATCH")), cloud.log.join(" | "));
  ok("推的是最新内容", cloud.progress()[MATH].v.correct[0] === "z", JSON.stringify(cloud.progress()[MATH]));

  /* ---- 场景六：B 更新后 A 不该把旧数据盖回去 ---- */
  tickClock();
  let b3 = B.open(MATH);
  await tick();
  b3.answer({ correct: ["b-newer"] });
  b3.flush();
  await tick();
  const newest = cloud.progress()[MATH];
  let a7 = A.open(MATH);
  await tick();
  // A 本机那条 "z" 和 B 那条 "b-newer" 都该留着：两边做的题谁也不丢
  ok("A 打开后把 B 的新数据合进来",
     JSON.parse(A.store[MATH]).correct.indexOf("b-newer") > -1 &&
     JSON.parse(A.store[MATH]).correct.indexOf("z") > -1, A.store[MATH]);
  ok("A 没有把旧数据盖回云端",
     cloud.progress()[MATH].t === newest.t, JSON.stringify(cloud.progress()[MATH]));

  /* ---- 场景七：第二台的页面一直开着，回到前台要能看到新进度 ----
     这是实际用下来最常撞上的：iPad 上标签页从来不关，锁屏解锁、从别的
     App 切回来都不算重新加载。原来只在加载时拉一次，于是第一台刚做完的
     题，第二台不手动刷新就永远看不到。 */
  tickClock(60000);
  let b4 = B.open(MATH);                     // B 打开页面，先拿到当时的状态
  await tick();
  tickClock(60000);
  let a8 = A.open(MATH);                     // A 这会儿又做了一题
  await tick();
  a8.answer({ correct: ["after-b-opened"] });
  a8.flush();
  await tick();
  ok("A 的新进度已经在云端", cloud.progress()[MATH].v.correct[0] === "after-b-opened",
     JSON.stringify(cloud.progress()[MATH]));
  ok("B 这时还是旧的（它没重新加载过）",
     JSON.parse(B.store[MATH]).correct[0] !== "after-b-opened", B.store[MATH]);

  tickClock(60000);
  b4.show();                                 // 从别的 App 切回来
  await tick();
  ok("回到前台会再取一次，B 看到新进度",
     JSON.parse(B.store[MATH]).correct[0] === "after-b-opened", B.store[MATH]);
  ok("取到新数据后会刷新页面，否则屏幕上还是旧的", b4.reloads.length >= 1, b4.reloads.length);

  /* 来回切 App 不该把接口刷爆：15 秒内再回到前台就不重复取 */
  cloud.log.length = 0;
  b4.show();
  await tick();
  ok("刚取过就切回来，不重复请求", cloud.log.length === 0, cloud.log.join(" | "));

  tickClock(60000);
  cloud.log.length = 0;
  b4.back();                                 // 从「上一页」退回来（整页是缓存恢复的）
  await tick();
  ok("从缓存恢复的页面也会再取一次", cloud.log.length > 0, cloud.log.join(" | "));

  console.log(out.join("\n"));
  const bad = out.filter(x => x.startsWith("FAIL")).length;
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
