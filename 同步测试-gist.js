/* Gist 后端：读写合并、错误翻译、面板流程
   用一个「假 GitHub」桩件，真的存一份 gist 并支持 GET/PATCH/POST，
   这样「读-合-写」有没有把别人的数据抹掉才测得出来。 */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync("同步.js", "utf8");

function makeDoc() {
  const byId = {};
  function el(tag) {
    const e = {
      tag, dataset: {}, children: [], style: {},
      id: "", className: "", textContent: "", title: "", type: "", value: "", checked: false, _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(h) {
        this._html = h;
        for (const m of h.matchAll(/id="([^"]+)"/g)) { const c = el("div"); c.id = m[1]; byId[m[1]] = c; }
      },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
      addEventListener() {},
      querySelector(s) { return byId[s.replace("#", "")] || null; },
      focus() {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    };
    return e;
  }
  const doc = {
    _byId: byId, head: el("head"), body: el("body"), createElement: el,
    addEventListener() {}, currentScript: { dataset: { key: "math-tdsjs-v1" } },
  };
  let n = 0; const orig = doc.createElement;
  doc.createElement = t => {
    const e = orig(t);
    if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; }
    if (t === "div" && n === 3) { e.id = "syncmask"; byId.syncmask = e; }
    return e;
  };
  return doc;
}

function fakeGitHub({ scopes = "gist", gists = {}, failNet = false, tokenOk = true } = {}) {
  const log = [];
  const resp = (status, obj, hdr = {}) => Promise.resolve({
    ok: status >= 200 && status < 300, status,
    headers: { get: k => (k.toLowerCase() in hdr ? hdr[k.toLowerCase()] : null) },
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj)),
  });
  const fn = (url, opt = {}) => {
    log.push((opt.method || "GET") + " " + url);
    if (failNet) return Promise.reject(new TypeError("Failed to fetch"));
    if (!tokenOk) return resp(401, { message: "Bad credentials" });
    if (url.endsWith("/user")) return resp(200, { login: "lisa" }, { "x-oauth-scopes": scopes });
    const m = url.match(/\/gists\/([^?]+)/);
    if (m) {
      const id = m[1];
      if (!gists[id]) return resp(404, { message: "Not Found" });
      if (opt.method === "PATCH") { gists[id] = { files: JSON.parse(opt.body).files }; return resp(200, { id }); }
      return resp(200, { id, files: gists[id].files });
    }
    if (url.endsWith("/gists") && opt.method === "POST") {
      gists.NEWID = { files: JSON.parse(opt.body).files };
      return resp(201, { id: "NEWID" });
    }
    return resp(404, { message: "Not Found" });
  };
  fn.log = log; fn.gists = gists;
  return fn;
}

function launch({ store = {}, fetchImpl } = {}) {
  const s = { ...store };
  const ls = { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
  const doc = makeDoc();
  const reloads = [];
  const ctx = {
    document: doc, window: { addEventListener() {} }, localStorage: ls,
    sessionStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = v; } },
    navigator: {}, location: { reload() { reloads.push(1); } }, console, confirm: () => true,
    setTimeout: (fn, ms) => { if (ms !== 15000 && ms !== 600) fn(); return 0; },
    clearTimeout: () => {},
    fetch: fetchImpl || (() => Promise.reject(new TypeError("Failed to fetch"))),
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return {
    store: s, doc, reloads, $: id => doc._byId[id],
    chip: doc._byId.syncchip, mask: doc._byId.syncmask,
    panel: () => (doc._byId.syncmask.children[0] || {})._html || "",
  };
}

const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));
const tick = (n = 6) => new Promise(r => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });
const GIST = () => ({ __sync_mode__: "gist", __sync_gh_token__: "ghp_x" });
const content = (gh, id) => JSON.parse(gh.gists[id].files["study-progress.json"].content);

(async () => {
  // 1. 拉取：gist 里别的页面的进度也要落盘
  let gh = fakeGitHub({ gists: { ID1: { files: { "study-progress.json": { content: JSON.stringify({
    "prep-practice-v1": { t: 2000, v: { score: 9 } },
    "math-tdsjs-v1": { t: 3000, v: { m: 1 } },
  }) } } } } });
  let a = launch({ store: { ...GIST(), __sync_gist_id__: "ID1" }, fetchImpl: gh });
  await tick();
  ok("Gist 模式能拉回进度", a.store["prep-practice-v1"] === '{"score":9}', a.store["prep-practice-v1"]);
  ok("当前页被更新后刷新一次", a.reloads.length === 1, a.reloads.length);
  ok("只打了一次 GET", gh.log.length === 1 && gh.log[0] === "GET https://api.github.com/gists/ID1", gh.log.join(" | "));

  // 2. 本地较新 → 写回，且不能抹掉别人的数据
  gh = fakeGitHub({ gists: { ID1: { files: { "study-progress.json": { content: JSON.stringify({
    "prep-practice-v1": { t: 2000, v: { keep: true } },
    "math-tdsjs-v1": { t: 10, v: { old: 1 } },
  }) } } } } });
  launch({ store: { ...GIST(), __sync_gist_id__: "ID1", "math-tdsjs-v1": '{"mine":1}', "__sync_t__math-tdsjs-v1": "9999" }, fetchImpl: gh });
  await tick(12);
  let saved = content(gh, "ID1");
  ok("本地较新会写回 Gist", saved["math-tdsjs-v1"].v.mine === 1, JSON.stringify(saved["math-tdsjs-v1"]));
  ok("别的页面数据没被抹掉", saved["prep-practice-v1"].v.keep === true, JSON.stringify(saved["prep-practice-v1"]));
  ok("写之前先读了一次（读-合-写）",
     gh.log.filter(x => x.startsWith("GET")).length >= 2 && gh.log.some(x => x.startsWith("PATCH")), gh.log.join(" | "));

  // 3. 远端更新 → 拉回、不上传
  gh = fakeGitHub({ gists: { ID1: { files: { "study-progress.json": { content: JSON.stringify({
    "math-tdsjs-v1": { t: 999999, v: { newer: 1 } },
  }) } } } } });
  launch({ store: { ...GIST(), __sync_gist_id__: "ID1", "math-tdsjs-v1": '{"mine":1}', "__sync_t__math-tdsjs-v1": "1" }, fetchImpl: gh });
  await tick(12);
  ok("远端更新则不覆盖", !gh.log.some(x => x.startsWith("PATCH")), gh.log.join(" | "));

  // 4. 没有 Gist ID → 自动创建并记下
  gh = fakeGitHub({ gists: {} });
  let d = launch({ store: { ...GIST(), "math-tdsjs-v1": '{"x":1}', "__sync_t__math-tdsjs-v1": "5000" }, fetchImpl: gh });
  await tick(12);
  ok("首次使用自动创建 Gist", d.store.__sync_gist_id__ === "NEWID", d.store.__sync_gist_id__);
  ok("创建走的是 POST", gh.log.some(x => x.startsWith("POST")), gh.log.join(" | "));

  // 5. 令牌失效 → 失败面板的「详情」里要说得清清楚楚
  let e = launch({ store: { ...GIST(), __sync_gist_id__: "ID1" }, fetchImpl: fakeGitHub({ tokenOk: false }) });
  await tick();
  ok("令牌失效时标记为失败", /同步失败/.test(e.chip.textContent), e.chip.textContent);
  e.chip.onclick();                       // 打开失败面板
  e.$("syncmore").onclick.call(e.$("syncmore"));   // 展开详情
  ok("详情里说明令牌失效", /令牌无效或已过期/.test(e.$("syncraw")._html), e.$("syncraw")._html.slice(0, 80));
  ok("失败面板建议去同步方式页", /同步方式/.test(e.panel()), e.panel().slice(0, 80));

  // 6. Gist 模式不再要求先起登录名
  let f = launch({ store: { __sync_mode__: "gist" } });
  await tick();
  f.chip.onclick();
  ok("未配置时直接进同步方式页", !!f.$("tabGist") && !!f.$("syncghtok"), f.panel().slice(0, 60));
  ok("不要求先填登录名", !f.$("synccode"));

  // 7. 测试连接：权限不足
  let g = launch({ store: { __sync_mode__: "gist" }, fetchImpl: fakeGitHub({ scopes: "repo" }) });
  await tick(); g.chip.onclick();
  g.$("syncghtok").value = "ghp_x"; g.$("syncping").onclick();
  await tick();
  ok("认出缺 gist 权限", /没有 gist 权限/.test(g.$("synctest")._html), g.$("synctest")._html.slice(0, 60));

  // 8. 测试连接：一切正常
  let h = launch({ store: { __sync_mode__: "gist" }, fetchImpl: fakeGitHub({ gists: { ID1: { files: {} } } }) });
  await tick(); h.chip.onclick();
  h.$("syncghtok").value = "ghp_x"; h.$("syncgid").value = "ID1"; h.$("syncping").onclick();
  await tick(10);
  ok("令牌+ID 都对时给肯定答复", /可以用了/.test(h.$("synctest")._html), h.$("synctest")._html.slice(0, 70));

  // 9. 测试连接：ID 不存在
  let i = launch({ store: { __sync_mode__: "gist" }, fetchImpl: fakeGitHub({ gists: {} }) });
  await tick(); i.chip.onclick();
  i.$("syncghtok").value = "ghp_x"; i.$("syncgid").value = "GHOST"; i.$("syncping").onclick();
  await tick(10);
  ok("认出 Gist ID 找不到", /找不到/.test(i.$("synctest")._html), i.$("synctest")._html.slice(0, 60));

  // 10. 全新设备：默认就该是 Gist，并且直接进设置页
  let j = launch({ store: {}, fetchImpl: fakeGitHub() });
  await tick();
  j.chip.onclick();
  ok("全新设备默认走 Gist", !!j.$("syncghtok"), j.panel().slice(0, 50));
  ok("不先要求填登录名", !j.$("synccode"));
  ok("Gist 标签是选中的", /class="tab on" id="tabGist"/.test(j.panel()), j.panel().slice(0, 90));
  j.$("syncghtok").value = "ghp_new"; j.$("syncgid").value = "MYID";
  j.$("syncsave").onclick();
  ok("保存模式为 gist", j.store.__sync_mode__ === "gist", j.store.__sync_mode__);
  ok("保存令牌和 ID", j.store.__sync_gh_token__ === "ghp_new" && j.store.__sync_gist_id__ === "MYID");

  // 10b. 还能切回自建服务器，老用户不被挡住
  let j2 = launch({ store: {}, fetchImpl: fakeGitHub() });
  await tick();
  j2.chip.onclick();
  j2.$("tabWorker").onclick();
  ok("能切到自建服务器页", !!j2.$("syncapi"), j2.panel().slice(0, 50));
  j2.$("syncapi").value = "https://mine.workers.dev";
  j2.$("syncsave").onclick();
  ok("切回 worker 会记下来", j2.store.__sync_mode__ === "worker", j2.store.__sync_mode__);

  // 10c. 已经配过 Worker 的设备，升级后不该被改掉
  let j3 = launch({ store: { __sync_mode__: "worker", __sync_code__: "lisa2026" },
    fetchImpl: () => Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
      json: () => Promise.resolve({ ok: true, blob: {} }), text: () => Promise.resolve("{}") }) });
  await tick();
  j3.chip.onclick();
  ok("老用户仍停在 Worker", /自建服务器/.test(j3.panel()), j3.panel().slice(0, 60));

  // 11. Worker 模式不受影响（要显式声明，默认已经是 Gist 了）
  let used = null;
  launch({
    store: { __sync_mode__: "worker", __sync_code__: "lisa2026" },
    fetchImpl: u => { used = u; return Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
      json: () => Promise.resolve({ ok: true, blob: {} }), text: () => Promise.resolve("{}") }); },
  });
  await tick();
  ok("Worker 模式仍走原地址", String(used).indexOf("workers.dev/?k=") > -1, used);

  // 12. 保存设置时就把 Gist 建出来，并把 id 显示给用户
  //     原来要等「第一次有进度要上传」才建，可那时设置页早关了，
  //     第二台设备拿不到 id，用户只会看到「保存后自动创建」一直不变。
  let gh12 = fakeGitHub({ gists: {} });
  let l = launch({ store: { __sync_mode__: "gist" }, fetchImpl: gh12 });
  await tick();
  l.chip.onclick();
  l.$("syncghtok").value = "ghp_x";
  l.$("syncgid").value = "";                 // 留空 = 第一台设备
  l.$("syncsave").onclick();
  await tick(10);
  ok("保存时就创建了 Gist", l.store.__sync_gist_id__ === "NEWID", l.store.__sync_gist_id__);
  ok("创建用 POST", gh12.log.some(x => x.startsWith("POST https://api.github.com/gists")), gh12.log.join(" | "));
  ok("把 id 回填到输入框", l.$("syncgid").value === "NEWID", l.$("syncgid").value);
  ok("当场显示 id 让人抄走", /Gist ID：.*NEWID/.test(l.$("synctest")._html), l.$("synctest")._html.slice(0, 90));
  ok("新建的 Gist 是空对象", Object.keys(content(gh12, "NEWID")).length === 0, JSON.stringify(gh12.gists.NEWID));

  // 13. 导航页（没有 data-key、也没做过题）也要能把 Gist 建出来
  //     这正是用户遇到的场景：配完设置，什么都没发生
  let gh13 = fakeGitHub({ gists: {} });
  let m = launch({ store: { __sync_mode__: "gist", __sync_gh_token__: "ghp_x" }, fetchImpl: gh13 });
  await tick(10);
  ok("没有本地进度时也补建 Gist", m.store.__sync_gist_id__ === "NEWID", m.store.__sync_gist_id__);
  ok("补建后仍正常拉取", gh13.log.some(x => x.indexOf("GET https://api.github.com/gists/NEWID") === 0), gh13.log.join(" | "));

  // 14. 已有 id 时不要重复创建
  let gh14 = fakeGitHub({ gists: { ID1: { files: { "study-progress.json": { content: "{}" } } } } });
  launch({ store: { ...GIST(), __sync_gist_id__: "ID1" }, fetchImpl: gh14 });
  await tick(10);
  ok("已有 id 时不重复创建", !gh14.log.some(x => x.startsWith("POST")), gh14.log.join(" | "));

  console.log(out.join("\n"));
  const bad = out.filter(x => x.startsWith("FAIL")).length;
  console.log(bad ? `\n${bad} 项未通过` : `\n全部 ${out.length} 项通过`);
  process.exit(bad ? 1 : 0);
})();
