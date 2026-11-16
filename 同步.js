/**
 * 学习进度同步 · 客户端
 *
 * 用法：在页面里加一行（放在页面自己的 <script> 之前或之后都行）
 *     <script src="同步.js" data-key="prep-practice-v1"></script>
 * data-key 填这个页面自己的 localStorage 键名。
 *
 * 页面内部一行都不用改——这里通过挂钩 localStorage.setItem 感知保存动作。
 *
 * 同步逻辑：
 *   打开页面 → 拉远端 → 远端更新就落盘并刷新一次页面，否则把本地推上去
 *   页面保存 → 盖上本地时间戳 → 停 1.2 秒没有新动作就推送（避免每敲一个字都发请求）
 *   关闭页面 → 用 sendBeacon 补推一次，防止没推完就被关掉
 */
(function () {
  "use strict";

  // ↓↓↓ 部署完 Cloudflare Worker 后，把这里换成你自己的地址 ↓↓↓
  // 必须带 https:// 开头，结尾不要斜杠。少了协议头的话浏览器会当成相对路径，
  // 实际去请求 你的网站域名/study-sync.xxx.workers.dev，必然失败。
  var API = "https://study-sync.eden-meng.workers.dev";

  var me = document.currentScript;
  var KEY = me && me.dataset ? me.dataset.key : "";
  if (!KEY) return;                       // 没写 data-key 就什么都不做

  var TKEY = "__sync_t__" + KEY;          // 本地这份数据的时间戳
  var CODE = "__sync_code__";             // 家庭口令，同一域名下六个页面共用
  var ONCE = "__sync_reloaded__" + KEY;   // 防止反复刷新的一次性标记

  // 内部写入走原始方法，避免触发下面的挂钩造成循环
  var rawSet = localStorage.setItem.bind(localStorage);
  var pushTimer = null;
  var busy = false;
  var lastPush = 0;
  var MIN_GAP = 10000;                    // 两次推送至少隔 10 秒

  /* ---------------- 角落里的状态小圆点 ---------------- */
  var chip;

  function ui() {
    var css = document.createElement("style");
    css.textContent =
      '#syncchip{position:fixed;right:12px;bottom:12px;z-index:99999;' +
      'font:13px/1.4 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:99px;padding:7px 13px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.08);cursor:pointer;color:#6b7280;' +
      'opacity:.72;transition:opacity .2s,transform .1s;user-select:none}' +
      '#syncchip:hover{opacity:1}' +
      '#syncchip:active{transform:scale(.95)}' +
      '#syncchip.ok{color:#15803d;border-color:#86d7a5}' +
      '#syncchip.err{color:#c2410c;border-color:#f0b48e;opacity:1}' +
      '#syncchip.busy{color:#0284c7;border-color:#9ad2f5}' +
      '@media print{#syncchip{display:none}}';
    document.head.appendChild(css);

    chip = document.createElement("div");
    chip.id = "syncchip";
    chip.onclick = ask;
    document.body.appendChild(chip);
  }

  function paint(state, msg) {
    if (!chip) return;
    chip.className = state === "ok" ? "ok" : state === "err" ? "err" : state === "busy" ? "busy" : "";
    chip.textContent =
      state === "off"  ? "☁ 点这里开启同步" :
      state === "busy" ? "☁ 同步中…" :
      state === "ok"   ? "☁ 已同步" :
                         "⚠ 同步失败";
    chip.title = msg || (state === "off"
      ? "两台设备填同一个口令，进度就会互通"
      : "点一下可以重新同步或换口令");
  }

  function ask() {
    var cur = localStorage.getItem(CODE) || "";
    var v = prompt(
      "家庭同步口令\n\n两台设备填一样的，学习进度就会互通。\n至少 6 位，别用太好猜的。\n\n（留空并确定 = 关闭同步）",
      cur
    );
    if (v === null) return;                       // 点了取消
    var code = v.trim();
    if (!code) {
      localStorage.removeItem(CODE);
      paint("off");
      return;
    }
    if (code.length < 6) { alert("口令至少 6 位"); return; }
    rawSet(CODE, code);
    boot();
  }

  /* ---------------- 拉取 / 推送 ---------------- */

  function boot() {
    var code = localStorage.getItem(CODE);
    if (!code) { paint("off"); return; }
    if (API.indexOf("请改成") > -1) {
      paint("err", "同步.js 里的 API 地址还没填，见 同步说明.md");
      return;
    }

    paint("busy");
    fetch(API + "/?k=" + encodeURIComponent(code), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.err) || "服务端拒绝了请求");

        var remote = (j.blob || {})[KEY];
        var localT = +(localStorage.getItem(TKEY) || 0);

        // 远端更新：落盘后刷新页面，让页面拿新数据重新初始化。
        // 页面都是在脚本开头一次性读 localStorage 的，不刷新看不到新进度。
        if (remote && remote.t > localT) {
          rawSet(KEY, JSON.stringify(remote.v));
          rawSet(TKEY, String(remote.t));
          if (!sessionStorage.getItem(ONCE)) {
            sessionStorage.setItem(ONCE, "1");    // 万一写入没生效，也只刷新一次
            location.reload();
            return;
          }
          paint("ok");
          return;
        }

        // 本地更新，或者远端根本没有这个页面的数据 → 推上去
        if (localStorage.getItem(KEY) !== null && localT > (remote ? remote.t : -1)) {
          push();
          return;
        }
        paint("ok");
      })
      .catch(function (e) { paint("err", String(e && e.message || e)); });
  }

  function payload() {
    var raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    return JSON.stringify({ key: KEY, t: +(localStorage.getItem(TKEY) || Date.now()), v: v });
  }

  function push() {
    var code = localStorage.getItem(CODE);
    var body = payload();
    if (!code || !body || busy) return;

    busy = true;
    lastPush = Date.now();
    paint("busy");
    fetch(API + "/?k=" + encodeURIComponent(code), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.err) || "保存失败");
        // saved:false 说明远端比本地新，下次打开会自动拉回来
        paint("ok", j.saved ? "" : "远端有更新的记录，下次打开会同步过来");
      })
      .catch(function (e) { paint("err", String(e && e.message || e)); })
      .then(function () { busy = false; });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    // 攒一会儿再发，免得每答一题都发请求；
    // 同时保证两次推送至少隔 MIN_GAP，防止连续答题把 KV 的每日写入额度刷爆。
    var wait = Math.max(1200, MIN_GAP - (Date.now() - lastPush));
    pushTimer = setTimeout(push, wait);
  }

  /* ---------------- 挂钩本页的保存动作 ---------------- */
  localStorage.setItem = function (k, v) {
    rawSet(k, v);
    if (k === KEY) {
      rawSet(TKEY, String(Date.now()));
      schedulePush();
    }
  };

  // 页面被关掉 / 切走时补推一次，sendBeacon 在页面销毁时也能送出去
  window.addEventListener("pagehide", function () {
    if (!pushTimer) return;
    clearTimeout(pushTimer);
    var code = localStorage.getItem(CODE);
    var body = payload();
    if (!code || !body || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(
        API + "/?k=" + encodeURIComponent(code),
        new Blob([body], { type: "application/json" })
      );
    } catch (e) {}
  });

  if (document.body) { ui(); boot(); }
  else document.addEventListener("DOMContentLoaded", function () { ui(); boot(); });
})();
