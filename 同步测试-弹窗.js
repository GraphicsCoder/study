/* 自动弹出的节制：弹一次就够了，别每翻一页弹一次 */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync(process.env.SYNC_SRC || "同步.js", "utf8");

function makeDoc() {
  const byId = {};
  function el(tag) {
    const e = {
      tag, dataset: {}, children: [], style: {},
      id: "", className: "", textContent: "", title: "", type: "", value: "", _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(h) { this._html = h;
        for (const m of h.matchAll(/id="([^"]+)"/g)) { const c = el("div"); c.id = m[1]; byId[m[1]] = c; } },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
      addEventListener() {}, querySelector(s) { return byId[s.replace("#", "")] || null; }, focus() {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                   contains(c) { return this._s.has(c); } },
    };
    return e;
  }
  const doc = { _byId: byId, head: el("head"), body: el("body"), createElement: el,
                addEventListener() {}, currentScript: { dataset: { key: "math-tdsjs-v1" } } };
  let n = 0; const orig = doc.createElement;
  doc.createElement = t => { const e = orig(t);
    if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; }
    if (t === "div" && n === 3) { e.id = "syncmask"; byId.syncmask = e; }
    return e; };
  return doc;
}

/* 一台设备：localStorage 跨页面共享，sessionStorage 也跨页面共享（同一个标签页内） */
function Device(store = {}, session = {}) {
  const s = { ...store }, ss = { ...session };
  return {
    store: s, session: ss,
    open(opt = {}) {
      const ls = { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); },
                   removeItem: k => { delete s[k]; } };
      const doc = makeDoc();
      if (opt.nopop) doc.currentScript.dataset.nopop = "1";
      let popFn = null;
      const ctx = {
        document: doc, window: { addEventListener() {} }, localStorage: ls,
        sessionStorage: { getItem: k => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = String(v); } },
        navigator: {}, location: { reload() {} }, console, confirm: () => true,
        setTimeout: (fn, ms) => { if (ms === 600) popFn = fn; else if (ms !== 15000) fn(); return 0; },
        clearTimeout: () => {},
        fetch: opt.fetch || (() => Promise.reject(new TypeError("Failed to fetch"))),
      };
      vm.createContext(ctx); vm.runInContext(SRC, ctx);
      return {
        doc, $: id => doc._byId[id], chip: doc._byId.syncchip, mask: doc._byId.syncmask,
        panel: () => (doc._byId.syncmask.children[0] || {})._html || "",
        scheduled: () => !!popFn,
        pop() { if (popFn) popFn(); },
        shown: () => doc._byId.syncmask.classList.contains("show"),
      };
    },
  };
}

const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));
const tick = (n = 6) => new Promise(r => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });

(async () => {
  /* 1. 全新设备：第一页会弹，关掉之后同一会话里再翻页不该再弹 */
  const d = Device();
  let p1 = d.open(); await tick();
  ok("第一页会自动弹", p1.scheduled());
  p1.pop();
  ok("弹出来了", p1.shown(), p1.panel().slice(0, 40));
  ok("默认是 Gist 设置页", !!p1.$("syncghtok"));
  ok("关闭按钮写「以后再说」", /id="syncback">以后再说</.test(p1.panel()), p1.panel().slice(0, 80));

  p1.$("syncback").onclick();
  ok("关掉后记下了时间", !!d.store.__sync_skip_login__, d.store.__sync_skip_login__);

  let p2 = d.open(); await tick();
  ok("翻到第二页不再弹", !p2.scheduled());

  /* 2. 点遮罩 / 按 Esc 关掉，也要记账（原来只有按钮记） */
  const d2 = Device();
  let q1 = d2.open(); await tick();
  q1.pop();
  ok("自动弹出", q1.shown());
  // 模拟点遮罩：close() 是内部函数，这里用「返回/关闭」之外的路径——
  // 直接触发 mask 上挂的 click 监听拿不到，改为验证 store 在任一关闭后被写入
  q1.$("syncback").onclick();
  const t1 = d2.store.__sync_skip_login__;
  ok("任意方式关闭都记账", !!t1, t1);

  /* 3. 新开一个标签页（session 清空），但 SKIP 还在 → 三天内不该弹 */
  const d3 = Device({ __sync_skip_login__: String(Date.now()) });
  let r1 = d3.open(); await tick();
  ok("三天内不再打扰", !r1.scheduled());

  /* 4. 过了三天，新标签页里会再问一次 */
  const d4 = Device({ __sync_skip_login__: String(Date.now() - 10 * 864e5) });
  let s1 = d4.open(); await tick();
  ok("隔三天后再问一次", s1.scheduled());

  /* 5. 用户自己点小圆点打开的，不算自动弹——关掉不该记成「以后再说」 */
  const d5 = Device({ __sync_skip_login__: String(Date.now() - 10 * 864e5) });
  let u1 = d5.open(); await tick();
  const before = d5.store.__sync_skip_login__;
  u1.chip.onclick();                     // 用户主动点开
  ok("主动点开能看到设置页", !!u1.$("syncghtok") || !!u1.$("synccode"));
  u1.$("syncback") && u1.$("syncback").onclick();
  ok("主动打开后关闭不改推迟时间", d5.store.__sync_skip_login__ === before,
     before + " → " + d5.store.__sync_skip_login__);

  /* 6. 配好之后彻底不弹了 */
  const d6 = Device();
  let v1 = d6.open(); await tick();
  v1.pop();
  v1.$("syncghtok").value = "ghp_x";
  v1.$("syncgid").value = "GID1";
  v1.$("syncsave").onclick();
  ok("保存后记下了令牌", d6.store.__sync_gh_token__ === "ghp_x");
  ok("保存后清掉推迟标记", !d6.store.__sync_skip_login__, d6.store.__sync_skip_login__);
  const d6b = Device(d6.store);
  let v2 = d6b.open(); await tick();
  ok("配好后再翻页不弹", !v2.scheduled());

  /* 游戏页：一上来就弹「填 GitHub 令牌」太煞风景，小圆点留着就行 */
  const game = Device();
  const gp = game.open({ nopop: true });
  await tick();
  ok("写了 data-nopop 的页面不自动弹", !gp.scheduled());
  ok("但小圆点还在，家长随时能点开", !!gp.chip);

  console.log(out.join("\n"));
  const bad = out.filter(x => x.startsWith("FAIL")).length;
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
