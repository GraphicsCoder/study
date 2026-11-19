/* 同步.js 的行为测试：用桩件模拟浏览器环境，不碰真网络 */
const fs = require("fs");
const vm = require("vm");

const SRC = fs.readFileSync("同步.js", "utf8");

function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [],
    id: "", className: "", textContent: "", title: "", innerHTML: "", type: "", value: "", checked: false,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    querySelector() { return makeEl(); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    focus() {},
  };
  return el;
}

// 这套测的是 Worker 传输层，所以显式声明模式——不要依赖「默认是哪个后端」，
// 那是会变的（现在默认已经是 Gist）。
function run({ dataKey, store = {}, session = {}, remoteBlob = {}, failFetch = false }) {
  store = Object.assign({ __sync_mode__: "worker" }, store);
  const log = { reloaded: false, posted: [], painted: [], popped: false };

  const ls = {
    _d: { ...store },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  const ss = {
    _d: { ...session },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
  };

  const chip = makeEl();
  const doc = {
    currentScript: { dataset: dataKey ? { key: dataKey } : {} },
    head: makeEl(),
    body: makeEl(),
    createElement() { return makeEl(); },
    addEventListener() {},
  };
  // 第一个 createElement 是 style，第二个是 chip —— 用计数器把 chip 抓出来看状态
  let n = 0;
  doc.createElement = () => { n++; return n === 2 ? chip : makeEl(); };

  const ctx = {
    document: doc,
    window: { addEventListener() {} },
    localStorage: ls,
    sessionStorage: ss,
    navigator: {},
    location: { reload() { log.reloaded = true; } },
    setTimeout: (fn, ms) => { if (ms === 600) log.popped = true; return 0; },  // 自动弹登录框
    clearTimeout: () => {},
    console,
    fetch(url, opt) {
      if (failFetch) return Promise.reject(new Error("Failed to fetch"));
      if (opt && opt.method === "POST") {
        log.posted.push(JSON.parse(opt.body));
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, saved: true }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, blob: remoteBlob }) });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  return new Promise((res) => setImmediate(() => setImmediate(() => setImmediate(() =>
    res({ log, ls: ls._d, ss: ss._d, chip })))));
}

const T = [];
function ok(name, cond, extra) { T.push({ name, pass: !!cond, extra }); }

(async () => {
  const CODE = "__sync_code__";

  // 1. 没登录：显示未登录，并自动弹一次登录框
  let r = await run({ dataKey: "math-tdsjs-v1" });
  ok("未登录时提示登录", r.chip.textContent.includes("登录"), r.chip.textContent);
  ok("未登录时自动弹框", r.log.popped);

  // 2. 刚点过「以后再说」，短期内不再打扰
  r = await run({ dataKey: "math-tdsjs-v1", store: { __sync_skip_login__: String(Date.now()) } });
  ok("刚拒绝过就不再打扰", !r.log.popped);

  // 2b. 「以后再说」是暂时的：过几天要再问一次，否则家长等不到提示就以为入口没了
  r = await run({ dataKey: "math-tdsjs-v1", store: { __sync_skip_login__: String(Date.now() - 10 * 864e5) } });
  ok("隔几天会再问一次", r.log.popped);

  // 2c. 旧版本存的是 "1"，要能自动当成早就过期
  r = await run({ dataKey: "math-tdsjs-v1", store: { __sync_skip_login__: "1" } });
  ok("旧标记不会永久静音", r.log.popped);

  // 3. 关键改动：云端别的页面的进度，也会在当前页落盘
  r = await run({
    dataKey: "math-tdsjs-v1",
    store: { [CODE]: "family123" },
    remoteBlob: {
      "prep-practice-v1": { t: 2000, v: { score: 9 } },
      "en-arcade-v1": { t: 3000, v: { star: 5 } },
    },
  });
  ok("拉回其它页面的进度", r.ls["prep-practice-v1"] === '{"score":9}' && r.ls["en-arcade-v1"] === '{"star":5}');
  ok("同时写入它们的时间戳", r.ls["__sync_t__prep-practice-v1"] === "2000");
  ok("别的页面更新不触发刷新", !r.log.reloaded);

  // 4. 当前页被云端更新 → 落盘并刷新一次
  r = await run({
    dataKey: "math-tdsjs-v1",
    store: { [CODE]: "family123", "math-tdsjs-v1": '{"old":1}', "__sync_t__math-tdsjs-v1": "100" },
    remoteBlob: { "math-tdsjs-v1": { t: 9000, v: { fresh: 1 } } },
  });
  // 合并语义：云端的新内容拼进本机那份，而不是整份盖掉
  ok("当前页把云端的新内容合进来", r.ls["math-tdsjs-v1"] === '{"old":1,"fresh":1}', r.ls["math-tdsjs-v1"]);
  ok("当前页更新要刷新", r.log.reloaded);

  // 5. 同一时间戳已刷新过 → 不再重复刷新（防循环）
  r = await run({
    dataKey: "math-tdsjs-v1",
    store: { [CODE]: "family123", "__sync_t__math-tdsjs-v1": "100" },
    session: { "__sync_reloaded__math-tdsjs-v1": "9000" },
    remoteBlob: { "math-tdsjs-v1": { t: 9000, v: { fresh: 1 } } },
  });
  ok("同一份数据不重复刷新", !r.log.reloaded);

  // 6. 本机有、云端没有的内容 → 推上去
  r = await run({
    dataKey: "math-tdsjs-v1",
    store: { [CODE]: "family123", "math-tdsjs-v1": '{"mine":1}', "__sync_t__math-tdsjs-v1": "8000" },
    remoteBlob: { "math-tdsjs-v1": { t: 100, v: {} } },
  });
  ok("云端缺的内容会补上去", r.log.posted.length === 1 && r.log.posted[0].v.mine === 1, JSON.stringify(r.log.posted));
  ok("本机这份没被云端的旧货改动，就不用刷新", !r.log.reloaded, r.ls["math-tdsjs-v1"]);

  // 7. 导航页（没有 data-key）：能拉取，但不上传
  r = await run({
    dataKey: null,
    store: { [CODE]: "family123" },
    remoteBlob: { "math-tdsjs-v1": { t: 5000, v: { a: 1 } } },
  });
  ok("导航页也能拉回进度", r.ls["math-tdsjs-v1"] === '{"a":1}');
  ok("导航页不上传、不刷新", r.log.posted.length === 0 && !r.log.reloaded);
  ok("导航页显示已同步", r.chip.textContent.includes("已同步"), r.chip.textContent);

  // 8. 网络挂了：显示失败，不影响做题
  r = await run({ dataKey: "math-tdsjs-v1", store: { [CODE]: "family123" }, failFetch: true });
  ok("同步失败有提示", r.chip.textContent.includes("失败"), r.chip.textContent);

  let bad = 0;
  for (const t of T) {
    console.log((t.pass ? "✓ " : "✗ ") + t.name + (t.pass ? "" : "   <<< " + (t.extra || "")));
    if (!t.pass) bad++;
  }
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${T.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
