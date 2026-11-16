/**
 * 学习进度同步 · 客户端
 *
 * 用法：
 *     <script src="同步.js" data-key="prep-practice-v1"></script>   练习页
 *     <script src="同步.js"></script>                                导航页（只登录 + 拉取）
 *
 * data-key 是这个页面自己的 localStorage 键名。不写也能用，只是这个页面
 * 没有自己的进度要往上推。
 *
 * 页面内部一行都不用改——这里通过挂钩 localStorage.setItem 感知保存动作。
 *
 * 同步逻辑：
 *   打开任意页面 → 拉回云端的「全部」进度，比本地新的就落盘
 *                  （所以在 iPad 上做的数学，电脑上打开导航页就已经同步回来了，
 *                    不用非得打开数学页）
 *   当前页的数据被更新 → 刷新一次页面，让它拿新数据重新初始化
 *   页面保存 → 盖上本地时间戳 → 停 1.2 秒没有新动作就推送
 *   关闭页面 → 用 sendBeacon 补推一次
 *
 * 口令存在 __sync_code__ 下，不带页面后缀，所以一台设备登录一次，全站生效。
 */
(function () {
  "use strict";

  // ↓↓↓ 部署完 Cloudflare Worker 后，把这里换成你自己的地址 ↓↓↓
  // 必须带 https:// 开头，结尾不要斜杠。少了协议头的话浏览器会当成相对路径，
  // 实际去请求 你的网站域名/study-sync.xxx.workers.dev，必然失败。
  var API = "https://study-sync.eden-meng.workers.dev";

  var me = document.currentScript;
  var KEY = (me && me.dataset && me.dataset.key) || "";   // 导航页没有，属正常

  var CODE = "__sync_code__";             // 家庭口令，全站共用，登录一次就够
  var SKIP = "__sync_skip_login__";       // 用户点过「以后再说」，别再自动弹

  function tkey(k) { return "__sync_t__" + k; }           // 某份数据的本地时间戳
  function oncek(k) { return "__sync_reloaded__" + k; }   // 防刷新循环的标记

  // 内部写入走原始方法，避免触发下面的挂钩造成循环
  var rawSet = localStorage.setItem.bind(localStorage);
  var pushTimer = null;
  var busy = false;
  var lastPush = 0;
  var MIN_GAP = 10000;                    // 两次推送至少隔 10 秒

  /* ================= 界面 ================= */

  var chip, mask, box;

  function style() {
    var css = document.createElement("style");
    css.textContent =
      '#syncchip{position:fixed;right:12px;bottom:12px;z-index:99998;' +
      'font:13px/1.4 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:99px;padding:7px 13px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.08);cursor:pointer;color:#6b7280;' +
      'opacity:.72;transition:opacity .2s,transform .1s;user-select:none}' +
      '#syncchip:hover{opacity:1}' +
      '#syncchip:active{transform:scale(.95)}' +
      '#syncchip.ok{color:#15803d;border-color:#86d7a5}' +
      '#syncchip.err{color:#c2410c;border-color:#f0b48e;opacity:1}' +
      '#syncchip.busy{color:#0284c7;border-color:#9ad2f5}' +

      '#syncmask{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.45);' +
      'display:none;align-items:center;justify-content:center;padding:16px;' +
      'font:15px/1.65 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif}' +
      '#syncmask.show{display:flex}' +
      '#syncbox{background:#fff;border-radius:16px;padding:22px 22px 18px;width:100%;max-width:380px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.25);color:#1f2430;box-sizing:border-box}' +
      '#syncbox h3{margin:0 0 6px;font-size:18px}' +
      '#syncbox p{margin:0 0 14px;font-size:13.5px;color:#6b7280;line-height:1.8}' +
      '#syncbox label{display:block;font-size:13px;color:#6b7280;margin-bottom:5px}' +
      // 字号必须 ≥16px，否则 iOS 点输入框会自动放大页面
      '#syncbox input[type=password],#syncbox input[type=text]{width:100%;box-sizing:border-box;' +
      'padding:11px 12px;font-size:16px;font-family:inherit;border:1px solid #d7dbe3;' +
      'border-radius:10px;background:#fcfcfd;outline:none}' +
      '#syncbox input:focus{border-color:#0e8a6e;background:#fff}' +
      '#syncbox .eye{margin:8px 0 0;font-size:13px;color:#6b7280;display:flex;align-items:center;gap:6px;cursor:pointer}' +
      '#syncbox .eye input{width:auto;margin:0}' +
      '#syncbox .err{color:#c2410c;font-size:13px;margin:10px 0 0;display:none}' +
      '#syncbox .err.show{display:block}' +
      '#syncbox .who{background:#e8f6ed;color:#15803d;border-radius:10px;padding:10px 12px;' +
      'font-size:13.5px;margin:0 0 14px;word-break:break-all}' +
      '#syncbox .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}' +
      '#syncbox button{font-family:inherit;font-size:14px;padding:10px 15px;border-radius:10px;' +
      'cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#1f2430}' +
      '#syncbox button:hover{background:#f3f5f9}' +
      '#syncbox button.primary{background:#0e8a6e;border-color:#0e8a6e;color:#fff;font-weight:600}' +
      '#syncbox button.primary:hover{filter:brightness(1.07)}' +
      '#syncbox button.ghost{margin-left:auto;color:#6b7280}' +
      '#syncbox button.danger{color:#c2410c;border-color:#f0b48e}' +
      '@media print{#syncchip,#syncmask{display:none !important}}';
    document.head.appendChild(css);
  }

  function ui() {
    style();

    chip = document.createElement("div");
    chip.id = "syncchip";
    chip.onclick = open;
    document.body.appendChild(chip);

    mask = document.createElement("div");
    mask.id = "syncmask";
    box = document.createElement("div");
    box.id = "syncbox";
    mask.appendChild(box);
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    document.body.appendChild(mask);
  }

  function paint(state, msg) {
    if (!chip) return;
    chip.className = state === "ok" ? "ok" : state === "err" ? "err" : state === "busy" ? "busy" : "";
    chip.textContent =
      state === "off"  ? "☁ 点这里登录同步" :
      state === "busy" ? "☁ 同步中…" :
      state === "ok"   ? "☁ 已同步" :
                         "⚠ 同步失败";
    chip.title = msg || (state === "off"
      ? "两台设备登录同一个口令，进度就会互通"
      : "点一下可以手动同步、退出登录");
  }

  function close() { if (mask) mask.classList.remove("show"); }

  function open() {
    localStorage.getItem(CODE) ? panelLogged() : panelLogin();
  }

  /* 未登录：登录面板 */
  function panelLogin(autoPopped) {
    box.innerHTML =
      '<h3>☁ 开启跨设备同步</h3>' +
      '<p>在 iPad 和电脑上登录<b>同一个口令</b>，做题进度、错题本、闯关星星就互通了。<br>' +
      '口令由你自己定，至少 6 位，不用注册、不用手机号。</p>' +
      '<label for="synccode">家庭口令</label>' +
      '<input id="synccode" type="password" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" placeholder="两台设备填一模一样的">' +
      '<label class="eye"><input id="syncshow" type="checkbox">显示口令</label>' +
      '<p class="err" id="syncerr"></p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncok">登录</button>' +
        '<button class="ghost" id="synclater">' + (autoPopped ? "以后再说" : "取消") + '</button>' +
      '</div>';

    var input = box.querySelector("#synccode");
    var err = box.querySelector("#syncerr");
    input.value = localStorage.getItem(CODE) || "";

    box.querySelector("#syncshow").onchange = function () {
      input.type = this.checked ? "text" : "password";
    };
    box.querySelector("#synclater").onclick = function () {
      if (autoPopped) rawSet(SKIP, "1");   // 点过「以后再说」就不再主动打扰
      close();
    };
    box.querySelector("#syncok").onclick = function () {
      var code = input.value.trim();
      if (code.length < 6) {
        err.textContent = "口令至少 6 位，别用 123456 这种——知道口令的人就能看到和改掉进度。";
        err.className = "err show";
        input.focus();
        return;
      }
      rawSet(CODE, code);
      localStorage.removeItem(SKIP);
      close();
      boot();
    };
    input.onkeydown = function (e) { if (e.key === "Enter") box.querySelector("#syncok").click(); };

    mask.classList.add("show");
    setTimeout(function () { input.focus(); }, 50);
  }

  /* 已登录：状态面板 */
  function panelLogged() {
    var code = localStorage.getItem(CODE) || "";
    var masked = code.slice(0, 2) + "····" + code.slice(-1);
    box.innerHTML =
      '<h3>☁ 同步已开启</h3>' +
      '<div class="who">当前口令：<b>' + masked + '</b><br>' +
      '另一台设备登录同样的口令，进度就会互通。</div>' +
      '<p>进度是打开页面时拉取、做完题后自动上传的，平时不用管它。</p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncnow">立即同步</button>' +
        '<button class="danger" id="syncout">退出登录</button>' +
        '<button class="ghost" id="syncclose">关闭</button>' +
      '</div>';

    box.querySelector("#syncnow").onclick = function () { close(); boot(); };
    box.querySelector("#syncclose").onclick = close;
    box.querySelector("#syncout").onclick = function () {
      if (!confirm("退出后这台设备不再同步，已经做过的题目记录仍然留在本机。确定吗？")) return;
      localStorage.removeItem(CODE);
      rawSet(SKIP, "1");
      close();
      paint("off");
    };
    mask.classList.add("show");
  }

  /* ================= 拉取 / 推送 ================= */

  /**
   * 把云端整个 blob 里比本地新的部分全部落盘。
   * 不只处理当前页：这样在导航页登录一次，所有练习的进度就都拉回来了。
   * 返回当前页的数据有没有被换掉（要不要刷新）。
   */
  function applyAll(blob) {
    var hitHere = 0;
    Object.keys(blob || {}).forEach(function (k) {
      var r = blob[k];
      if (!r || typeof r.t !== "number" || !isFinite(r.t)) return;
      if (r.t <= +(localStorage.getItem(tkey(k)) || 0)) return;
      rawSet(k, JSON.stringify(r.v));
      rawSet(tkey(k), String(r.t));
      if (k && k === KEY) hitHere = r.t;
    });
    return hitHere;
  }

  function boot() {
    var code = localStorage.getItem(CODE);
    if (!code) {
      paint("off");
      // 没登录过、也没拒绝过 → 主动弹一次，省得家长找不到那个小圆点
      if (!localStorage.getItem(SKIP)) setTimeout(function () { panelLogin(true); }, 600);
      return;
    }
    if (API.indexOf("请改成") > -1) {
      paint("err", "同步.js 里的 API 地址还没填，见 同步说明.md");
      return;
    }

    paint("busy");
    fetch(API + "/?k=" + encodeURIComponent(code), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.err) || "服务端拒绝了请求");

        var hitHere = applyAll(j.blob);

        // 当前页的数据被云端覆盖了 → 刷新一次，页面才会拿新进度重新初始化。
        // 用「这次的时间戳」当标记而不是布尔值：既不会反复刷新，
        // 之后真有更新的数据进来时也还能再刷一次。
        if (hitHere) {
          var mark = String(hitHere);
          if (sessionStorage.getItem(oncek(KEY)) !== mark) {
            sessionStorage.setItem(oncek(KEY), mark);
            location.reload();
            return;
          }
        }

        // 本地比云端新 → 推上去
        var remote = KEY ? (j.blob || {})[KEY] : null;
        if (KEY && localStorage.getItem(KEY) !== null &&
            +(localStorage.getItem(tkey(KEY)) || 0) > (remote ? remote.t : -1)) {
          push();
          return;
        }
        paint("ok");
      })
      .catch(function (e) { paint("err", String((e && e.message) || e)); });
  }

  function payload() {
    if (!KEY) return null;
    var raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    return JSON.stringify({ key: KEY, t: +(localStorage.getItem(tkey(KEY)) || Date.now()), v: v });
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
      .catch(function (e) { paint("err", String((e && e.message) || e)); })
      .then(function () { busy = false; });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    // 攒一会儿再发，免得每答一题都发请求；
    // 同时保证两次推送至少隔 MIN_GAP，防止连续答题把 KV 的每日写入额度刷爆。
    var wait = Math.max(1200, MIN_GAP - (Date.now() - lastPush));
    pushTimer = setTimeout(push, wait);
  }

  /* ================= 挂钩本页的保存动作 ================= */

  if (KEY) {
    localStorage.setItem = function (k, v) {
      rawSet(k, v);
      if (k === KEY) {
        rawSet(tkey(KEY), String(Date.now()));
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
  }

  if (document.body) { ui(); boot(); }
  else document.addEventListener("DOMContentLoaded", function () { ui(); boot(); });
})();
