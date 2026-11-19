/* 扫码配第二台设备：生成链接、落地、确认、以及令牌别乱跑
 * 跑法：node 同步测试-扫码.js
 */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync(process.env.SYNC_SRC || "同步.js", "utf8");

function makeDoc() {
  const byId = {};
  function el(tag) {
    const e = {
      tag, dataset: {}, children: [], style: {},
      id: "", className: "", textContent: "", title: "", type: "", value: "", src: "", _html: "",
      get innerHTML() { return this._html; },
      set innerHTML(h) { this._html = h;
        for (const m of h.matchAll(/id="([^"]+)"/g)) { const c = el("div"); c.id = m[1]; byId[m[1]] = c; } },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c;
        // 二维码脚本是动态插进来的：这里模拟「加载完成」，由 doc._onScript 决定它定义了什么
        if (c.tag === "script") { if (doc._onScript) doc._onScript(c); if (c.onload) c.onload(); }
        return c; },
      contains() { return true; },
      setAttribute() {}, play() { this._played = true; },
      addEventListener() {}, querySelector(s) { return byId[s.replace("#", "")] || null; }, focus() {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                   contains(c) { return this._s.has(c); } },
    };
    return e;
  }
  const doc = { _byId: byId, head: el("head"), body: el("body"), createElement: el,
                addEventListener() {},
                currentScript: { dataset: { key: "en-arcade-v1" }, src: "https://x.github.io/study/%E5%90%8C%E6%AD%A5.js?v=202611190001" } };
  let n = 0; const orig = doc.createElement;
  doc.createElement = t => { const e = orig(t);
    if (++n === 2) { e.id = "syncchip"; byId.syncchip = e; }
    if (t === "div" && n === 3) { e.id = "syncmask"; byId.syncmask = e; }
    return e; };
  return doc;
}

function open(store, hash, fetchFn, lazyQR, cam) {
  const s = { ...store };
  const doc = makeDoc();
  const qrCalls = [];
  const hist = [];
  const loc = {
    href: "https://x.github.io/study/%E5%AD%A6%E4%B9%A0%E9%97%AF%E5%85%B3.html" + (hash || ""),
    hash: hash || "", reload() {},
  };
  const ctx = {
    document: doc, localStorage: {
      getItem: k => (k in s ? s[k] : null),
      setItem: (k, v) => { s[k] = String(v); },
      removeItem: k => { delete s[k]; },
    },
    window: { addEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: {}, location: loc, console, confirm: () => true,
    history: { replaceState(a, b, url) { hist.push(url); loc.href = url; loc.hash = ""; } },
    setTimeout: (fn, ms) => { if (ms !== 15000 && ms !== 600) fn(); return 0; },
    clearTimeout: () => {},
    setInterval: (fn) => { ticks.push(fn); return ticks.length; },
    clearInterval: (id) => { cleared.push(id); },
    fetch: fetchFn || (() => new Promise(() => {})),
  };
  // 摄像头那一路：cam = { codes:[...扫到的内容], deny:true }
  const ticks = [], cleared = [], stopped = [], clip = [];
  const track = { stop() { stopped.push(1); } };
  if (cam) {
    ctx.navigator.mediaDevices = {
      getUserMedia: () => cam.deny
        ? Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }))
        : Promise.resolve({ getTracks: () => [track] }),
    };
    ctx.BarcodeDetector = function () {
      return { detect: () => Promise.resolve((cam.codes || []).map(v => ({ rawValue: v }))) };
    };
  }
  ctx.navigator.clipboard = { writeText: t => { clip.push(t); return Promise.resolve(); } };
  const fakeQR = { svg(text, opt) { qrCalls.push([text, opt]); return "<svg>码</svg>"; } };
  if (lazyQR) doc._onScript = () => { ctx.window.QR = fakeQR; };
  else ctx.window.QR = fakeQR;
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return {
    store: s, hist, qrCalls, doc, clip, stopped, cleared,
    tick: () => ticks.forEach(f => f()),
    $: id => doc._byId[id],
    panel: () => (doc._byId.syncmask.children[0] || {})._html || "",
    // 面板里的子区块（输入框那一片、提示那一行）是各自 set innerHTML 的，
    // 要看全文得把它们拼起来
    html: () => Object.keys(doc._byId).map(k => doc._byId[k]._html || "").join(""),
    chip: () => doc._byId.syncchip,
    shown: () => doc._byId.syncmask.classList.contains("show"),
    scripts: () => doc.head.children.filter(c => c.tag === "script").map(c => c.src),
  };
}

const TOK = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
const GID = "0123456789abcdef0123456789abcdef";
const CONFIGURED = { __sync_mode__: "gist", __sync_gh_token__: TOK, __sync_gist_id__: GID };

const out = [];
const ok = (n, c, e) => out.push((c ? "PASS " : "FAIL ") + n + (c ? "" : "  <<< " + e));
const tick = (n = 6) => new Promise(r => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });

(async () => {
  /* ---------- 第一台：生成二维码 ---------- */

  let d = open(CONFIGURED, "", null, true);   // 这台设备还没加载过二维码脚本
  d.chip().onclick();                           // 已登录面板
  ok("配好之后，已登录面板上有「新设备扫码」", /新设备扫码/.test(d.panel()), d.panel().slice(0, 120));
  d.$("syncqrbtn").onclick();
  await tick();
  const url = d.qrCalls[0] && d.qrCalls[0][0];
  ok("二维码里是本站网址，不是别的域名", !!url && url.indexOf("https://x.github.io/study/") === 0, url);
  ok("落地页用导航页，不是当前这一页",
     !!url && url.indexOf("/index.html#") > 0 && url.indexOf("闯关") < 0, url);
  ok("参数放在 # 后面（# 后面的内容不会发给服务器）",
     !!url && url.split("#")[1] === "s=" + TOK + "~" + GID, url);
  ok("纠错级别用 L，屏幕对屏幕扫更容易对上焦",
     !!d.qrCalls[0] && d.qrCalls[0][1].ecl === "L", JSON.stringify(d.qrCalls[0] && d.qrCalls[0][1]));
  ok("二维码脚本是按需加载的，而且带着 同步.js 的版本号",
     d.scripts().some(s => /%E4%BA%8C%E7%BB%B4%E7%A0%81\.js\?v=202611190001$/.test(s)), d.scripts().join(","));
  ok("面板上写明了这张图等于钥匙", /钥匙/.test(d.panel()), d.panel().slice(0, 200));

  /* 还没配好的设备不该给出一张半截的码 */
  d = open({ __sync_mode__: "gist", __sync_gh_token__: TOK });   // 有令牌没 Gist ID
  d.chip().onclick();
  ok("还没创建 Gist 时不显示扫码按钮", !/新设备扫码/.test(d.panel()), d.panel().slice(0, 120));

  d = open({ __sync_mode__: "worker", __sync_code__: "lisa2026" });
  d.chip().onclick();
  ok("自建服务器模式没有这个按钮（扫码只对 Gist 有意义）",
     !/新设备扫码/.test(d.panel()), d.panel().slice(0, 120));

  /* ---------- 第二台：扫码落地 ---------- */

  d = open({}, "#s=" + TOK + "~" + GID);
  await tick();
  ok("落地后立刻把 # 从地址栏抹掉（别留在历史记录里）",
     d.hist.length === 1 && d.hist[0].indexOf("#") < 0, JSON.stringify(d.hist));
  ok("弹出确认面板，而不是闷头就登录", d.shown() && /扫到了一份同步设置/.test(d.panel()), d.panel().slice(0, 120));
  ok("确认之前什么都没写进本机", !d.store.__sync_gh_token__, JSON.stringify(d.store));
  ok("面板上只显示 Gist ID，不把令牌打在屏幕上",
     d.panel().indexOf(GID) > 0 && d.panel().indexOf(TOK) < 0, d.panel().slice(0, 200));

  d.$("syncuse").onclick();
  ok("点「启用同步」才真正写进去",
     d.store.__sync_gh_token__ === TOK && d.store.__sync_gist_id__ === GID && d.store.__sync_mode__ === "gist",
     JSON.stringify(d.store));
  ok("启用后会清掉「以后再说」的时间戳", !d.store.__sync_skip_login__, JSON.stringify(d.store));

  d = open({}, "#s=" + TOK + "~" + GID);
  await tick();
  d.$("syncdrop").onclick();
  ok("点「不用」什么也不写", !d.store.__sync_gh_token__ && !d.store.__sync_gist_id__, JSON.stringify(d.store));

  /* ---------- 乱七八糟的 hash ---------- */

  for (const [h, why] of [
    ["", "没有 hash"],
    ["#top", "页内锚点"],
    ["#s=onlytoken", "少了 Gist ID"],
    ["#s=" + TOK + "~" + GID + "~extra", "多了一段"],
    ["#s=<script>~abc", "带尖括号"],
  ]) {
    const x = open(CONFIGURED, h);
    await tick();
    ok("不认这种 hash：" + why, !/扫到了一份同步设置/.test(x.panel()), h + " → " + x.panel().slice(0, 60));
  }

  /* 扫码落地时，不该同时弹「自动登录」那一套 */
  d = open({}, "#s=" + TOK + "~" + GID);
  await tick();
  ok("扫码面板和自动登录框不会打架", !/开启跨设备同步|同步方式/.test(d.panel()), d.panel().slice(0, 120));

  /* ---------- 第二台：把链接粘进设置里 ---------- */

  d = open({}, "", null, true);
  d.chip().onclick();                           // 全新设备 → 直接进「同步方式」
  ok("Gist 面板上有「配置链接」这一格", /syncpaste/.test(d.html()), d.html().slice(0, 200));
  d.$("syncpaste").value = "https://x.github.io/study/index.html#s=" + TOK + "~" + GID;
  d.$("syncpaste").oninput();
  ok("粘一条链接就自动拆成令牌 + Gist ID",
     d.$("syncghtok").value === TOK && d.$("syncgid").value === GID,
     d.$("syncghtok").value + " / " + d.$("syncgid").value);
  ok("拆完把粘贴框清空，不把令牌留在输入框里", d.$("syncpaste").value === "", d.$("syncpaste").value);

  d = open({}, "", null, true);
  d.chip().onclick();
  d.$("syncpaste").value = "https://x.github.io/study/";
  d.$("syncpaste").oninput();
  ok("粘错东西会说清楚，而且不动下面两格",
     !d.$("syncghtok").value && !d.$("syncgid").value && /不像配置链接/.test(d.html()),
     d.html().slice(0, 200));

  /* ---------- 第二台：这台设备自己开摄像头扫 ---------- */

  d = open({}, "", null, true);
  d.chip().onclick();
  ok("没有 BarcodeDetector 的设备（比如 iPad 的 Safari）不画摄像头入口",
     !/syncscanbtn/.test(d.html()), d.html().slice(0, 200));

  d = open({}, "", null, true, { codes: ["https://x.github.io/study/index.html#s=" + TOK + "~" + GID] });
  d.chip().onclick();
  ok("能扫的设备才给这条路", /syncscanbtn/.test(d.html()), d.html().slice(0, 200));
  d.$("syncscanbtn").onclick();
  await tick();
  d.tick();                                     // 跑一帧识别
  await tick();
  ok("扫到之后把两格填好", d.$("syncghtok").value === TOK && d.$("syncgid").value === GID,
     d.$("syncghtok").value + " / " + d.$("syncgid").value);
  ok("扫到就关摄像头，不让它一直亮着", d.stopped.length === 1, "stop 调了 " + d.stopped.length + " 次");

  /* 扫到的要是别的二维码（超市小票、公众号），就当没看见，接着扫 */
  d = open({}, "", null, true, { codes: ["https://example.com/hello"] });
  d.chip().onclick();
  d.$("syncscanbtn").onclick();
  await tick();
  d.tick();
  await tick();
  ok("扫到不相干的码不会乱填", !d.$("syncghtok").value, d.$("syncghtok").value);
  ok("也不会就此收工，摄像头还开着继续扫", d.stopped.length === 0, "stop 调了 " + d.stopped.length + " 次");

  /* 关面板必须连摄像头一起关——点遮罩、按 Esc 都算关 */
  d = open({}, "", null, true, { codes: [] });
  d.chip().onclick();
  d.$("syncscanbtn").onclick();
  await tick();
  d.$("syncstop").onclick();
  ok("点取消会关掉摄像头", d.stopped.length === 1, "stop 调了 " + d.stopped.length + " 次");

  /* 不给权限时要给出退路，而不是只报一句失败 */
  d = open({}, "", null, true, { deny: true });
  d.chip().onclick();
  d.$("syncscanbtn").onclick();
  await tick();
  ok("不给摄像头权限时，告诉人还能用系统相机或粘链接",
     /权限/.test(d.html()) && /系统相机|粘/.test(d.html()), d.html().slice(0, 300));

  /* ---------- 第一台：复制链接 ---------- */

  d = open(CONFIGURED, "", null, true);
  d.chip().onclick();
  d.$("syncqrbtn").onclick();
  await tick();
  d.$("syncqrcopy").onclick();
  await tick();
  ok("复制出来的就是二维码里那一串",
     d.clip.length === 1 && d.clip[0] === d.qrCalls[0][0], JSON.stringify(d.clip));
  ok("复制之后提醒一句别留在聊天记录里", /删掉/.test(d.html()), d.html().slice(0, 300));
  ok("没点之前就写明了复制的那串该往哪儿放",
     /配置链接/.test(d.panel()) && /同步方式/.test(d.panel()), d.panel().slice(0, 400));

  /* ---------- 源码层面的约束 ---------- */

  ok("令牌只走 # 后面：源码里没有把它拼进查询参数的写法",
     !/\?[^"']*s=["'\s]*\+\s*tok/.test(SRC), "出现了 ?s=token 这种写法");

  console.log(out.join("\n"));
  const bad = out.filter(l => l.startsWith("FAIL")).length;
  console.log("\n" + (bad ? "失败 " + bad + " 项，" : "全部 ") + out.length + " 项" + (bad ? "" : "通过"));
  process.exit(bad ? 1 : 0);
})();
