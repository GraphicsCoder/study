/* 两台设备同时停在同一页各做各的，怎么合
   原来是「整页谁后保存谁赢」，另一台做的题会被整份盖掉。现在按内容合：
   数组取并集、对象按题号合、同一题冲突以晚的为准；「清空重做」例外，
   它会记一个清空时间，比它旧的那份整份让位，免得被并集又拼回来。

   跑法：node 同步测试-合并.js  （桩件和双设备那套一样） */

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

const MATH = "math-tdsjs-v1";
const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));
const tick = (n = 14) => new Promise(r => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });
const mathOf = dev => JSON.parse(dev.store[MATH]);

(async () => {
  const cloud = Cloud();
  const A = Device("A", cloud), B = Device("B", cloud);
  Object.assign(A.store, { __sync_mode__: "gist", __sync_gh_token__: "ghp_a", __sync_gist_id__: "GID" });
  Object.assign(B.store, { __sync_mode__: "gist", __sync_gh_token__: "ghp_b", __sync_gist_id__: "GID" });
  cloud.gists.GID = { files: { "study-progress.json": { content: "{}" } } };

  /* ---- 一、两台同时在同一页做不同的题 ---- */
  let a = A.open(MATH), b = B.open(MATH);
  await tick();
  a.answer({ correct: ["q1"], picked: { q1: "A" } });
  a.flush(); await tick();
  tickClock();
  b.answer({ correct: ["q2"], picked: { q2: "B" } });   // B 这时还不知道 A 做了 q1
  b.flush(); await tick();
  const cl = cloud.progress()[MATH].v;
  ok("云端把两边做的题都留下了",
     cl.correct.indexOf("q1") > -1 && cl.correct.indexOf("q2") > -1, JSON.stringify(cl));
  ok("每题选了什么也都在", cl.picked.q1 === "A" && cl.picked.q2 === "B", JSON.stringify(cl.picked));

  tickClock(60000);
  let a2 = A.open(MATH); await tick();
  ok("A 再打开时拿到合并后的那份",
     mathOf(A).correct.indexOf("q2") > -1 && mathOf(A).correct.indexOf("q1") > -1, A.store[MATH]);

  /* ---- 二、同一题两边答得不一样，以晚的那次为准 ---- */
  tickClock(60000);
  let a3 = A.open(MATH); await tick();
  a3.answer(Object.assign(mathOf(A), { picked: Object.assign(mathOf(A).picked, { q1: "改成C" }) }));
  a3.flush(); await tick();
  tickClock(60000);
  let b3 = B.open(MATH); await tick();
  ok("同一题冲突时留晚的那次", mathOf(B).picked.q1 === "改成C", B.store[MATH]);

  /* ---- 三、清空重做不能被另一台的旧数据复活 ---- */
  tickClock(60000);
  let b4 = B.open(MATH); await tick();          // B 停在这一页，手里是清空前的数据
  tickClock(60000);
  let a4 = A.open(MATH); await tick();
  a4.answer({ correct: [], picked: {} });       // A 点了「清空重做」
  a4.flush(); await tick();
  ok("清空这一下传上去了", cloud.progress()[MATH].v.correct.length === 0,
     JSON.stringify(cloud.progress()[MATH]));
  ok("云端记下了清空时间", !!cloud.progress()[MATH].d, JSON.stringify(cloud.progress()[MATH]));

  tickClock(60000);
  b4.show();                                    // B 切回前台，带着清空前的旧数据
  await tick();
  ok("B 的旧题没有被并集拼回来", mathOf(B).correct.length === 0, B.store[MATH]);
  ok("云端也没有被拼回来", cloud.progress()[MATH].v.correct.length === 0,
     JSON.stringify(cloud.progress()[MATH]));

  /* ---- 四、清空之后再做的题要留住 ---- */
  tickClock(60000);
  let b5 = B.open(MATH); await tick();
  b5.answer({ correct: ["新做的"], picked: {} });
  b5.flush(); await tick();
  tickClock(60000);
  let a5 = A.open(MATH); await tick();
  ok("清空之后做的题照常同步", mathOf(A).correct[0] === "新做的", A.store[MATH]);

  /* ---- 五、本机已经包含云端那份时，不该来回折腾 ---- */
  tickClock(60000);
  cloud.log.length = 0;
  let a6 = A.open(MATH); await tick();
  ok("没有新东西就不写回云端", !cloud.log.some(x => x.startsWith("PATCH")), cloud.log.join(" | "));
  ok("也不刷新页面", a6.reloads.length === 0, a6.reloads.length);

  console.log(out.join("\n"));
  const bad = out.filter(x => x.startsWith("FAIL")).length;
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
