/* 复现：自动弹出 → 点「以后再说」→ 再点右下角小圆点，还能不能打开登录框 */
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
        // 把 id="xxx" 解析出来登记，供 querySelector 查找
        const ids = [...h.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
        for (const id of ids) { const c = el("div"); c.id = id; byId[id] = c; }
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
    _byId: byId,
    head: el("head"), body: el("body"),
    createElement: el,
    addEventListener() {},
    currentScript: { dataset: { key: "math-tdsjs-v1" } },
  };
  // chip 是第 2 个被创建的元素（第 1 个是 style）
  let n = 0;
  const orig = doc.createElement;
  doc.createElement = (t) => { const e = orig(t); if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; } return e; };
  return doc;
}

const store = {};
const ls = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const doc = makeDoc();
let autoPopFn = null;
const ctx = {
  document: doc,
  window: { addEventListener() {} },
  localStorage: ls,
  sessionStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { reload() {} }, console,
  setTimeout: (fn, ms) => { if (ms === 600) autoPopFn = fn; else fn(); return 0; },
  clearTimeout: () => {},
  fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true, blob: {} }) }),
};
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

const mask = doc.body.children.find((c) => c.id === "syncmask") || doc._byId.syncmask;
const chip = doc._byId.syncchip;
const shown = () => mask.classList.contains("show");

const out = [];
function ok(name, cond) { out.push((cond ? "✓ " : "✗ ") + name); return cond; }

setImmediate(() => {
  ok("未登录时安排了自动弹框", !!autoPopFn);
  autoPopFn && autoPopFn();
  ok("自动弹框已显示", shown());

  // 点「以后再说」
  const later = doc._byId.synclater;
  ok("能拿到「以后再说」按钮", !!later);
  later && later.onclick && later.onclick();
  ok("关掉后弹框隐藏", !shown());
  ok("记下了「以后再说」的时间", Math.abs(Date.now() - +store.__sync_skip_login__) < 5000);

  // 关键：再点右下角小圆点，应该还能打开登录框
  chip.onclick && chip.onclick();
  const reopened = ok("点小圆点能重新打开登录框", shown());
  if (reopened) {
    const input = doc._byId.synccode;
    ok("登录框里有输入框", !!input);
    if (input) {
      input.value = "family123";
      doc._byId.syncok.onclick();
      ok("能成功登录", store.__sync_code__ === "family123");
      ok("登录后清掉「以后再说」标记", !store.__sync_skip_login__);
    }
  }

  console.log(out.join("\n"));
  process.exit(out.some((l) => l.startsWith("✗")) ? 1 : 0);
});
