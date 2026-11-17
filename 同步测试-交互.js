/* 交互测试：真的把按钮点下去，看面板的开关和状态流转对不对
   （第一版测试里 querySelector 每次返回新桩件，点击路径根本没覆盖到，
     「以后再说」之后打不开登录框的问题就是这么漏掉的） */
const fs = require("fs");
const vm = require("vm");
const SRC = fs.readFileSync("同步.js", "utf8");

/* 带 id 注册表的 DOM 桩：querySelector 能查到同一个对象，onclick 能真的调起来 */
function makeDoc() {
  const byId = {};
  function el(tag) {
    const e = {
      tag, dataset: {}, children: [], style: {},
      id: "", className: "", textContent: "", title: "", type: "", value: "", checked: false,
      _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(h) {
        this._html = h;
        for (const m of h.matchAll(/id="([^"]+)"/g)) {
          const c = el("div"); c.id = m[1]; byId[m[1]] = c;
        }
      },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
      addEventListener(t, fn) { (this._ev ||= {})[t] = fn; },
      querySelector(sel) { return byId[sel.replace("#", "")] || null; },
      focus() {},
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
      },
    };
    return e;
  }
  const doc = {
    _byId: byId, head: el("head"), body: el("body"),
    createElement: el, addEventListener() {},
    currentScript: { dataset: { key: "math-tdsjs-v1" } },
  };
  let n = 0;
  const orig = doc.createElement;
  doc.createElement = (t) => {
    const e = orig(t);
    if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; }
    if (t === "div" && n === 3) { e.id = "syncmask"; byId.syncmask = e; }
    return e;
  };
  return doc;
}

// 登录名面板是 Worker 模式专属的流程，显式声明，别依赖默认后端
function launch({ store = {}, failFetch = false } = {}) {
  const s = Object.assign({ __sync_mode__: "worker" }, store);
  const ls = {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
  };
  const doc = makeDoc();
  let autoPop = null;
  const ctx = {
    document: doc,
    window: { addEventListener() {} },
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: {}, location: { reload() {} }, console,
    confirm: () => true,
    setTimeout: (fn, ms) => { if (ms === 600) autoPop = fn; else fn(); return 0; },
    clearTimeout: () => {},
    fetch: () => failFetch
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve({ json: () => Promise.resolve({ ok: true, blob: {} }) }),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    store: s, doc,
    chip: doc._byId.syncchip,
    mask: doc._byId.syncmask,
    shown: () => doc._byId.syncmask.classList.contains("show"),
    pop: () => autoPop && autoPop(),
    hasAutoPop: () => !!autoPop,
    $: (id) => doc._byId[id],
  };
}

const out = [];
const ok = (n, c) => { out.push((c ? "✓ " : "✗ ") + n); return c; };
const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));

(async () => {
  /* 场景一：自动弹出 → 以后再说 → 还能从小圆点进来登录 */
  let a = launch();
  await tick();
  ok("未登录时安排了自动弹框", a.hasAutoPop());
  a.pop();
  ok("自动弹框已显示", a.shown());
  a.$("synclater").onclick();
  ok("关掉后弹框隐藏", !a.shown());
  ok("记下了「以后再说」的时间", Math.abs(Date.now() - +a.store.__sync_skip_login__) < 5000);

  a.chip.onclick();
  if (ok("点小圆点能重新打开登录框", a.shown())) {
    a.$("synccode").value = "lisa2026";
    a.$("syncok").onclick();
    ok("能成功登录", a.store.__sync_code__ === "lisa2026");
    ok("登录后清掉「以后再说」标记", !a.store.__sync_skip_login__);
  }

  /* 场景二：登录名太短要拦住 */
  let b = launch();
  await tick();
  b.pop();
  b.$("synccode").value = "lisa";
  b.$("syncok").onclick();
  ok("登录名太短不放行", !b.store.__sync_code__);
  ok("太短时弹框不关闭", b.shown());

  /* 场景三：同步失败时，点小圆点要看得到原因，而不是只有 tooltip */
  let c = launch({ store: { __sync_code__: "lisa2026" }, failFetch: true });
  await tick();
  ok("失败时小圆点显示失败", c.chip.textContent.includes("失败"));
  c.chip.onclick();
  ok("点开是失败面板", c.shown() && !!c.$("syncretry"));
  const html = c.mask.children[0]._html;
  ok("默认不显示服务器原话", !/Failed to fetch/.test(html));
  ok("默认不显示接口地址", !/workers\.dev/.test(html));
  ok("提示换个网络试试", /流量/.test(html));
  ok("写明不影响做题", /做题不受影响/.test(html));
  ok("有重试按钮", !!c.$("syncretry"));
  ok("有换登录名按钮", !!c.$("syncrelogin"));

  // 「详情」是留给大人排查的，点开才给原话
  c.$("syncmore").onclick.call(c.$("syncmore"));
  const raw = c.$("syncraw")._html;
  ok("详情里能看到原话", /Failed to fetch/.test(raw));
  ok("详情里能看到接口地址", /workers\.dev/.test(raw));

  c.$("syncrelogin").onclick();
  ok("能从失败面板切到登录框", !!c.$("synccode"));

  /* 场景四：已登录且正常 → 点开是状态面板，能退出 */
  let d = launch({ store: { __sync_code__: "lisa2026" } });
  await tick();
  ok("正常时显示已同步", d.chip.textContent.includes("已同步"));
  d.chip.onclick();
  ok("点开是状态面板", !!d.$("syncout"));
  d.$("syncout").onclick();
  ok("能退出登录", !d.store.__sync_code__);

  console.log(out.join("\n"));
  const bad = out.filter((l) => l.startsWith("✗")).length;
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
