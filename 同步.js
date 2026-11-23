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
 * 登录名存在 __sync_code__ 下，不带页面后缀，所以一台设备登录一次，全站生效。
 *
 * 注意：登录名既是身份也是钥匙，没有密码。服务端按它取数据（KV 键 fam:<登录名>），
 * 所以它必须够独特——这是「不引入账号体系」换来的简单，代价写在 同步说明.md 里。
 */
(function () {
  "use strict";

  // ↓↓↓ 同步后端有两种，在页面上「同步方式」里选 ↓↓↓
  //
  // A. GitHub Gist（默认）—— 把进度存在你自己账号下的一个「秘密 Gist」里。
  //    不用服务器、不用域名、不花钱，走的是 api.github.com，
  //    和这个网站本身（GitHub Pages）同一家，网站打得开它就打得开。
  //    代价是每台设备要填一次个人令牌（只勾 gist 权限，碰不到仓库）。
  //
  // B. Cloudflare Worker —— 自己部署一个小服务，见 同步说明.md。
  //    注意：*.workers.dev 在国内不少网络（公司网、家宽、移动数据）都连不上，
  //    实测会被解析到无关 IP。所以它不再是默认选项，确认自己网络能通再用。
  var API_DEFAULT = "https://study-sync.eden-meng.workers.dev";

  var ASET  = "__sync_api__";             // Worker 地址（本机覆盖）
  var MODE  = "__sync_mode__";            // "worker" | "gist"
  var GTOK  = "__sync_gh_token__";        // GitHub 个人令牌
  var GID   = "__sync_gist_id__";         // Gist id，首次保存时自动创建并记下
  var GFILE = "study-progress.json";      // Gist 里的文件名
  var GDESC = "学习进度同步（本文件由网页自动维护，请勿手改）";
  var KREG  = "__sync_keys__";            // 本机见过的页面 key，补传时要用

  // 默认 Gist：实测 workers.dev 在国内多种网络下都连不上，
  // 而 api.github.com 和这个网站本身（GitHub Pages）同一家，网站能开它就能开。
  // 已经配过 Worker 的设备，MODE 里存着 "worker"，不受影响。
  function mode(){ return localStorage.getItem(MODE) === "worker" ? "worker" : "gist"; }
  function api(){
    return String(localStorage.getItem(ASET) || API_DEFAULT).trim().replace(/\/+$/, "");
  }

  var me = document.currentScript;
  var KEY = (me && me.dataset && me.dataset.key) || "";   // 导航页没有，属正常
  var SELF = (me && me.src) || "";                        // 拿来拼 二维码.js 的地址
  // 游戏页写 data-nopop：那里一上来就弹「填 GitHub 令牌」太煞风景，
  // 小圆点还在，家长随时能点开配置
  var NOPOP = !!(me && me.dataset && me.dataset.nopop);

  var CODE = "__sync_code__";             // 登录名，全站共用，登录一次就够
  var SKIP = "__sync_skip_login__";       // 推迟到什么时候再问的时间戳
  var SKIP_DAYS = 3;
  var POPPED = "__sync_popped__";         // 本次会话已经自动弹过了，别再弹第二次
  var autoPop = false;                    // 当前这个面板是自动弹出来的，还是用户自己点开的

  function tkey(k) { return "__sync_t__" + k; }           // 某份数据的本地时间戳
  function oncek(k) { return "__sync_reloaded__" + k; }   // 防刷新循环的标记

  // 内部写入走原始方法，避免触发下面的挂钩造成循环
  var rawSet = localStorage.setItem.bind(localStorage);
  var pushTimer = null;
  var busy = false;
  var lastPush = 0;
  var lastErr = "";                       // 最近一次失败原因，点小圆点时展开给人看
  var lastPull = 0;                       // 上次去云端取数据的时间
  var MIN_PULL = 15000;                   // 回到前台时，离上次取不足这么久就不重复取
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
      // 没登录时要显眼一点：之前又小又淡，点过「以后再说」之后家长就找不到入口了
      '#syncchip.off{opacity:1;color:#0e8a6e;border-color:#0e8a6e;font-weight:600;' +
      'animation:syncpulse 2.4s ease-in-out infinite}' +
      '@keyframes syncpulse{0%,100%{box-shadow:0 2px 10px rgba(0,0,0,.08)}' +
      '50%{box-shadow:0 2px 16px rgba(14,138,110,.45)}}' +
      '@media (prefers-reduced-motion:reduce){#syncchip.off{animation:none}}' +

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
      '#syncbox .hint{font-size:12.5px;color:#6b7280;margin:8px 0 0;line-height:1.7}' +
      '#syncbox code{font-family:Consolas,Menlo,monospace;font-size:12.5px;' +
      'background:#f3f5f9;border-radius:4px;padding:1px 5px;word-break:break-all}' +
      '#syncbox .bad{background:#fdeee6;color:#c2410c;border-radius:10px;padding:10px 12px;' +
      'font-size:13.5px;margin:0 0 8px;word-break:break-all}' +
      '#syncbox .more{color:#6b7280;cursor:pointer;text-decoration:underline dotted}' +
      '#syncbox .more:hover{color:#1f2430}' +
      '#syncbox .raw{margin-top:8px}' +
      '#syncbox .err{color:#c2410c;font-size:13px;margin:10px 0 0;display:none}' +
      '#syncbox .err.show,#syncbox .good.show{display:block}' +
      '#syncbox .good{color:#15803d;font-size:13px;margin:10px 0 0;line-height:1.8}' +
      '#syncbox .tabs{display:flex;gap:6px;margin:0 0 14px}' +
      '#syncbox button.tab{flex:1;font-size:13.5px;padding:8px 6px;border-radius:9px;' +
      'border:1px solid #d7dbe3;background:#f7f8fa;color:#6b7280;font-weight:500}' +
      '#syncbox button.tab.on{background:#0e8a6e;border-color:#0e8a6e;color:#fff;font-weight:600}' +
      '#syncbox .opt-note{font-weight:400;color:#9aa3b2;font-size:12px;margin-left:4px}' +
      '#syncbox .err{line-height:1.8}' +
      '#syncbox .err.show{display:block}' +
      '#syncbox .who{background:#e8f6ed;color:#15803d;border-radius:10px;padding:10px 12px;' +
      'font-size:13.5px;margin:0 0 14px;word-break:break-all}' +
      // 二维码：撑满面板宽度，但不超过 260，太大了反而要把 iPad 举远才扫得全
      '#syncbox .qr{text-align:center;margin:0 0 10px;color:#6b7280;font-size:13px}' +
      '#syncbox .qr svg{width:100%;max-width:260px;height:auto;border-radius:8px;' +
      'border:1px solid #e5e7eb;background:#fff}' +
      // 摄像头取景框：固定高度，免得视频一进来面板跳一下
      '#syncbox .cam{text-align:center;margin:0 0 10px;color:#6b7280;font-size:13px;' +
      'min-height:180px;background:#f3f5f9;border-radius:10px;display:flex;' +
      'align-items:center;justify-content:center;overflow:hidden}' +
      '#syncbox .cam video{width:100%;max-height:260px;object-fit:cover;border-radius:10px}' +
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

  // 服务端的报错里写的还是「口令」，这里统一成界面上的叫法
  function human(m) { return String(m == null ? "" : m).replace(/口令/g, "登录名"); }

  // 登录名是用户输入的，拼进 innerHTML 前先转义
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function paint(state, msg) {
    lastErr = state === "err" ? (human(msg) || "没有返回具体原因") : "";
    if (!chip) return;
    chip.className = state === "ok" ? "ok" : state === "err" ? "err" : state === "busy" ? "busy" : "off";
    chip.textContent =
      state === "off"  ? "☁ 点这里登录" :
      state === "busy" ? "☁ 同步中…" :
      state === "ok"   ? "☁ 已同步" :
                         "⚠ 同步失败";
    // 失败原因不往 tooltip 里放：悬停就弹出一长串后台报错，看不懂也没必要
    chip.title =
      state === "err"  ? "点一下看看怎么回事" :
      state === "off"  ? "两台设备用同一个登录名，进度就会互通" :
      state === "busy" ? "正在和云端对一下进度" :
                         (human(msg) || "点一下可以手动同步、退出登录");
  }

  function close() {
    // 自动弹出来的面板，不管用户是点按钮关的、点遮罩关的、还是按 Esc 关的，
    // 都要记一笔「以后再说」。原来只有那个按钮记账，于是点遮罩关掉之后
    // 下一个页面又弹——每翻一页弹一次，非常烦人。
    if (autoPop) { autoPop = false; rawSet(SKIP, String(Date.now())); }
    // 摄像头得跟着面板一起关：点遮罩、按 Esc 也算关，漏掉的话摄像头
    // 指示灯会一直亮着，谁看了都发毛
    if (camStop) camStop();
    if (mask) mask.classList.remove("show");
  }

  // Gist 模式靠「令牌 + Gist ID」认身份，不需要再起一个登录名；
  // Worker 模式的登录名就是 KV 的键，必须有。
  function ready() {
    return mode() === "gist"
      ? !!(localStorage.getItem(GTOK) || "").trim()
      : !!localStorage.getItem(CODE);
  }

  function open() {
    autoPop = false;                      // 这是用户自己点的，不是自动弹的
    // 失败时优先把原因摊开说清楚，别让人对着一个 tooltip 猜
    if (lastErr) return panelError();
    if (ready()) return panelLogged();
    // 没配好：Gist 模式直接进设置页，别让人先填一个用不上的登录名
    return mode() === "gist" ? panelServer() : panelLogin();
  }

  /* ================= 扫码把第二台设备配好 =================

     第二台设备原来要手输两样东西：一串四十位的令牌，和一串三十二位的
     Gist ID。在 iPad 上对着另一块屏幕抄这两串，是这套同步里最劝退的一步。

     现在第一台设备生成一张二维码，里面是本站的网址加一段 #s=令牌~GistID。
     第二台用系统相机扫一下就打开网页，页面自己把设置填好。
     不用装 App，也不用在网页里申请摄像头权限——相机扫出网址直接跳转，
     这是 iPad 上唯一一条不折腾的路。

     两点是有意为之：
     - 参数放在 # 后面。# 后面的内容浏览器不会发给服务器，所以令牌
       从头到尾没离开过这两台设备，GitHub Pages 的日志里也不会有。
     - 落地后立刻把 # 从地址栏抹掉，否则它会留在历史记录和书签里。 */

  var scanned = null;                     // 扫码带进来的设置，等用户确认
  var camStop = null;                     // 摄像头的关闭钩子，面板一关就得调

  // 从一段文本里拆出令牌和 Gist ID。扫码落地、手动粘贴、摄像头扫到的，
  // 都走这一个函数，省得三处各写一遍正则、各漏各的边界
  function parseLink(s) {
    var m = /#s=([A-Za-z0-9_\-]+)~([A-Za-z0-9]+)$/.exec(String(s == null ? "" : s).trim());
    return m ? { tok: m[1], gid: m[2] } : null;
  }

  // 这台设备能不能自己扫：要有 BarcodeDetector（iOS Safari 至今没有），
  // 还要能开摄像头（http 下 getUserMedia 直接不存在）
  function canScan() {
    try {
      return typeof BarcodeDetector !== "undefined" &&
             !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    } catch (e) { return false; }
  }

  function panelCam(onFound, back) {
    box.innerHTML =
      '<h3>📷 扫第一台设备的码</h3>' +
      '<p>在第一台上点小圆点 → <b>📱 新设备扫码</b>，把那张图对准摄像头。</p>' +
      '<div class="cam" id="synccam">正在打开摄像头…</div>' +
      '<p class="err" id="syncerr"></p>' +
      '<div class="btns"><button class="ghost" id="syncstop">取消</button></div>';
    mask.classList.add("show");

    var slot = box.querySelector("#synccam");
    var err  = box.querySelector("#syncerr");
    var timer = null, stream = null, dead = false;

    var stop = function () {
      dead = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
      camStop = null;
    };
    camStop = stop;
    box.querySelector("#syncstop").onclick = function () { stop(); back ? back() : close(); };

    var fail = function (msg) {
      stop();
      slot.innerHTML = "";
      err.className = "err show";
      err.innerHTML = msg;
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(function (s) {
        if (dead) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
        stream = s;
        var v = document.createElement("video");
        v.setAttribute("playsinline", "");      // 不加这个，iOS 会把视频抢成全屏播放
        v.muted = true;
        v.srcObject = s;
        slot.innerHTML = "";
        slot.appendChild(v);
        v.play();
        var det = new BarcodeDetector({ formats: ["qr_code"] });
        timer = setInterval(function () {
          det.detect(v).then(function (list) {
            for (var i = 0; i < (list || []).length; i++) {
              var hit = parseLink(list[i].rawValue);
              if (hit) { stop(); onFound(hit); return; }
            }
          }).catch(function () {});           // 每帧都可能失败（还没对上焦），不吭声
        }, 300);
      })
      .catch(function (e) {
        var n = (e && e.name) || "";
        fail(n === "NotAllowedError"
          ? "浏览器没给摄像头权限。可以改用第一台那张码配合系统相机扫，或者把链接粘到上面那格里。"
          : "打不开摄像头（" + esc(n || String(e)) + "）。用系统相机扫那张码也一样。");
      });
  }

  function scanLink() {
    var tok = (localStorage.getItem(GTOK) || "").trim();
    var gid = (localStorage.getItem(GID)  || "").trim();
    if (!tok || !gid) return "";
    // 落地页统一用导航页：它一定存在，而且不带 data-key，不会误触发某一页的同步
    var base = location.href.split("#")[0].replace(/[^/]*$/, "") + "index.html";
    return base + "#s=" + tok + "~" + gid;
  }

  // 二维码脚本按需加载：九个页面里只有点开这个面板的那一次才会用到它
  function loadQR(cb) {
    if (window.QR) { cb(true); return; }
    if (!SELF) { cb(false); return; }
    var q = SELF.indexOf("?");
    var s = document.createElement("script");
    // 和 同步.js 共用一个版本号，这样 刷新版本号.py 不用再认一个文件
    s.src = SELF.replace(/[^/?]*(\?.*)?$/, "") + encodeURIComponent("二维码.js") + (q > 0 ? SELF.slice(q) : "");
    s.onload  = function () { cb(!!window.QR); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  function panelQR(back) {
    var url = scanLink();
    box.innerHTML =
      '<h3>📱 新设备扫这个码</h3>' +
      (url
        ? '<p>用新设备的<b>相机</b>对着扫，点一下弹出来的链接，设置会自动填好。</p>' +
          '<div class="qr" id="syncqr">正在生成…</div>' +
          '<p class="hint">⚠️ 这张图里有你的 GitHub 令牌，<b>等于一把钥匙</b>。' +
          '只给自己的设备扫，别拍照发群里。面板关掉就没了。</p>' +
          // 「复制链接」光有个按钮，人拿到那串也不知道往哪儿放，所以把
          // 用法直接写在按钮旁边，而不是等点完才提示
          '<p class="hint">两台设备不在一起？点<b>复制链接</b>发过去，' +
          '在那台上点小圆点 → <b>⚙️ 同步方式</b>，粘进最上面那格「配置链接」。</p>' +
          '<p class="hint" id="syncqrtip"></p>'
        : '<p>还没配好 Gist，生成不了。先在「同步方式」里填令牌、保存一次。</p>') +
      '<div class="btns">' +
        (url ? '<button id="syncqrcopy">复制链接</button>' : "") +
        '<button class="primary" id="syncqrback">完成</button>' +
      '</div>';
    box.querySelector("#syncqrback").onclick = back ? function () { back(); } : close;
    if (box.querySelector("#syncqrcopy")) box.querySelector("#syncqrcopy").onclick = function () {
      // 两台设备不在一起（或者相机实在扫不出来）时，把这串发过去，
      // 在那台的「同步方式」里粘进「配置链接」那一格，效果一样。
      var tip = box.querySelector("#syncqrtip");
      var done = function (t) { if (tip) tip.innerHTML = t; };
      try {
        navigator.clipboard.writeText(url).then(
          function () { done('✓ 已复制。发到第二台 → <b>⚙️ 同步方式</b> → 粘进「配置链接」。' +
                             '<br><b>这串等于钥匙</b>，发完记得把聊天记录删掉。'); },
          function () { done("复制失败，用上面那张码吧。"); });
      } catch (e) { done("这个浏览器不让脚本复制，用上面那张码吧。"); }
    };
    mask.classList.add("show");

    if (!url) return;
    var slot = box.querySelector("#syncqr");
    loadQR(function (ok) {
      if (!box.contains(slot)) return;               // 面板已经被关掉了
      if (!ok) { slot.innerHTML = '<p class="err show">二维码脚本没加载出来，刷新一下页面再试。</p>'; return; }
      try {
        // 纠错级别用 L：屏幕对屏幕扫，不会有污损折角，省下的容量换更稀疏的点，
        // 隔着一块玻璃更容易对上焦
        slot.innerHTML = window.QR.svg(url, { ecl: "L", scale: 4 });
      } catch (e) {
        slot.innerHTML = '<p class="err show">' + esc(String(e && e.message || e)) + '</p>';
      }
    });
  }

  // 扫码落地：先把地址栏擦干净，再问要不要用
  function takeScan() {
    var hit = parseLink(location.hash || "");
    if (!hit) return;
    try { history.replaceState(null, "", location.href.split("#")[0]); }
    catch (e) { location.hash = ""; }
    scanned = hit;
  }

  function panelScan() {
    var s = scanned;
    box.innerHTML =
      '<h3>📱 扫到了一份同步设置</h3>' +
      '<p>启用之后，这台设备和原来那台共用一份进度。</p>' +
      '<div class="who">GitHub Gist<br>ID：<b>' + esc(s.gid) + '</b></div>' +
      '<div id="synctest"><p class="hint">正在确认这份设置能不能用…</p></div>' +
      '<div class="btns">' +
        '<button class="primary" id="syncuse">启用同步</button>' +
        '<button class="ghost" id="syncdrop">不用</button>' +
      '</div>';

    var slot = box.querySelector("#synctest");
    pingGist(s.tok, s.gid, function (r) {
      if (!box.contains(slot)) return;
      slot.innerHTML = '<p class="' + (r.ok ? "good" : "err") + ' show">' + r.msg + '</p>';
    });

    box.querySelector("#syncuse").onclick = function () {
      rawSet(MODE, "gist");
      rawSet(GTOK, s.tok);
      rawSet(GID, s.gid);
      localStorage.removeItem(SKIP);
      scanned = null;
      lastErr = "";
      autoPop = false;
      close();
      boot();
    };
    box.querySelector("#syncdrop").onclick = function () { scanned = null; close(); boot(); };
    mask.classList.add("show");
  }

  /* 服务器设置：两种后端都能在界面上配好并当场测通，不用改代码再发一次版。
     「填完只能试试看」是这套东西最熬人的地方，测一下就知道卡在哪一步。 */
  function panelServer(back) {
    var m = mode();
    box.innerHTML =
      '<h3>⚙️ 同步方式</h3>' +
      '<div class="tabs">' +
        '<button class="tab' + (m === "gist" ? " on" : "") + '" id="tabGist">GitHub Gist（推荐）</button>' +
        '<button class="tab' + (m === "worker" ? " on" : "") + '" id="tabWorker">自建服务器</button>' +
      '</div>' +
      '<div id="syncpane"></div>' +
      '<div id="synctest"></div>' +
      '<div class="btns">' +
        '<button class="primary" id="syncping">测试连接</button>' +
        '<button id="syncsave">保存</button>' +
        '<button class="ghost" id="syncback">' + (back ? "返回" : (autoPop ? "以后再说" : "关闭")) + '</button>' +
      '</div>';

    var pane = box.querySelector("#syncpane");
    var slot = box.querySelector("#synctest");
    var cur  = m;

    function say(cls, html){ slot.innerHTML = '<p class="' + cls + ' show">' + html + '</p>'; }

    // 面板只留输入框和当场要用的那一句。怎么生成令牌、怎么部署 Worker，
    // 都在 同步说明.md 里——那是给配置的人看的，不该印在每天都打开的界面上。
    // 界面里也不提这个文件名：用户手上只有网页，提了也打不开。
    function paneGist() {
      pane.innerHTML =
        '<label for="syncpaste">配置链接<span class="opt-note">（第一台给的，粘进来就行）</span></label>' +
        '<input id="syncpaste" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="https://…/index.html#s=…">' +
        '<p class="hint" id="syncscanrow"></p>' +
        '<label for="syncghtok">GitHub 个人令牌</label>' +
        '<input id="syncghtok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="ghp_… 或 github_pat_…">' +
        '<label for="syncgid">Gist ID<span class="opt-note">（留空则自动创建）</span></label>' +
        '<input id="syncgid" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="第一台设备留空">' +
        '<p class="hint">第一台设备：两格都留空，只填令牌，保存后会自动建一个。</p>';
      pane.querySelector("#syncghtok").value = localStorage.getItem(GTOK) || "";
      pane.querySelector("#syncgid").value   = localStorage.getItem(GID)  || "";

      // 粘贴链接就自动拆成令牌 + Gist ID 填进下面两格：微信、隔空投送、
      // 甚至相机扫出来后复制过来的，都是这一串，省得人工拆
      var paste = pane.querySelector("#syncpaste");
      var fill = function () {
        var v = parseLink(paste.value);
        if (!v) { if (paste.value.trim()) say("err", "这串不像配置链接。它应该带着 <code>#s=</code> 那一段。"); return; }
        pane.querySelector("#syncghtok").value = v.tok;
        pane.querySelector("#syncgid").value   = v.gid;
        paste.value = "";                       // 拆完就清掉，不把令牌留在输入框里
        say("good", "✓ 已拆好：令牌和 Gist ID 都填上了，点「保存」就行。");
      };
      paste.oninput = fill;
      paste.onchange = fill;

      // 这台设备自己能扫码的话（安卓 / 带摄像头的电脑），再给一条更省事的路。
      // iPad 的 Safari 没有 BarcodeDetector，这里就不画这个按钮——
      // 画了点下去只能报错，不如没有，那条路上它用系统相机扫。
      if (canScan()) {
        var row = pane.querySelector("#syncscanrow");
        row.innerHTML = '<span class="more" id="syncscanbtn">📷 用这台设备的摄像头扫 ›</span>';
        row.querySelector("#syncscanbtn").onclick = function () {
          panelCam(function (v) {
            pane.querySelector("#syncghtok").value = v.tok;
            pane.querySelector("#syncgid").value   = v.gid;
            say("good", "✓ 扫到了，令牌和 Gist ID 都填上了，点「保存」就行。");
          }, function () { panelServer(back); });
        };
      }
    }

    function paneWorker() {
      pane.innerHTML =
        '<label for="syncapi">服务器地址</label>' +
        '<input id="syncapi" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="https://study-sync.xxx.workers.dev">' +
        '<p class="hint">以 <code>https://</code> 开头，结尾不要斜杠。</p>';
      pane.querySelector("#syncapi").value = localStorage.getItem(ASET) || API_DEFAULT;
    }

    function show(which) {
      cur = which;
      box.querySelector("#tabGist").className   = "tab" + (which === "gist"   ? " on" : "");
      box.querySelector("#tabWorker").className = "tab" + (which === "worker" ? " on" : "");
      slot.innerHTML = "";
      which === "gist" ? paneGist() : paneWorker();
    }
    show(m);

    box.querySelector("#tabGist").onclick   = function () { show("gist"); };
    box.querySelector("#tabWorker").onclick = function () { show("worker"); };

    box.querySelector("#syncping").onclick = function () {
      say("hint", "正在连…");
      if (cur === "gist") {
        var tok = pane.querySelector("#syncghtok").value.trim();
        var gid = pane.querySelector("#syncgid").value.trim();
        if (!tok) { say("err", "先填 GitHub 令牌。"); return; }
        pingGist(tok, gid, function (r) { say(r.ok ? "good" : "err", r.msg); });
      } else {
        var url = pane.querySelector("#syncapi").value.trim().replace(/\/+$/, "");
        if (!/^https?:\/\//.test(url)) { say("err", "地址要以 https:// 开头。"); return; }
        ping(url, function (r) { say(r.ok ? "good" : "err", r.msg); });
      }
    };

    box.querySelector("#syncsave").onclick = function () {
      if (cur === "gist") {
        var tok = pane.querySelector("#syncghtok").value.trim();
        var gid = pane.querySelector("#syncgid").value.trim();
        if (!tok) { say("err", "先填 GitHub 令牌。"); return; }
        rawSet(MODE, "gist");
        rawSet(GTOK, tok);
        localStorage.removeItem(SKIP);
        if (gid) rawSet(GID, gid); else localStorage.removeItem(GID);
        // 没填 id 就当场建一个，把 id 显示出来——第二台设备正等着抄它
        if (!gid) {
          say("hint", "正在创建 Gist…");
          ensureGist(function (r) {
            if (!r.ok) { say("err", r.err || "创建失败"); return; }
            pane.querySelector("#syncgid").value = r.id;
            say("good", "✓ 已创建。<b>Gist ID：" + esc(r.id) + "</b><br>" +
                        "第二台设备不用抄这串：关掉这个面板，点小圆点 → <b>📱 新设备扫码</b>，" +
                        "拿新设备的相机扫一下就行。");
          });
          return;                       // 留在设置页，让人把 id 抄走
        }
      } else {
        var url = pane.querySelector("#syncapi").value.trim().replace(/\/+$/, "");
        if (url && !/^https?:\/\//.test(url)) { say("err", "地址要以 https:// 开头。"); return; }
        rawSet(MODE, "worker");
        localStorage.removeItem(SKIP);
        if (url && url !== API_DEFAULT) rawSet(ASET, url); else localStorage.removeItem(ASET);
      }
      lastErr = "";
      autoPop = false;        // 已经配好了，close() 不该再记一笔「以后再说」
      close(); boot();
    };
    // 没有上一屏时（全新设备点开小圆点，第一眼就是这个面板），
    // 「返回」只会把同一个面板再画一遍，看上去像没反应——这时直接关掉。
    box.querySelector("#syncback").onclick = back ? function () { back(); } : close;
    mask.classList.add("show");
  }

  /* 探一下 Gist：令牌有没有、权限够不够、那个 id 还在不在 */
  function pingGist(tok, gid, cb) {
    var done = false;
    var fin = function (r) { if (!done) { done = true; cb(r); } };
    setTimeout(function () { fin({ ok:false, msg:"连了 15 秒没反应，检查一下网络。" }); }, 15000);

    fetch("https://api.github.com/user", {
      headers: { "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json" },
      cache: "no-store",
    })
      .then(function (r) {
        if (r.status === 401) { fin({ ok:false, msg:"令牌无效或已过期，请重新生成一个。" }); return null; }
        if (!r.ok) { fin({ ok:false, msg:"GitHub 返回 " + r.status + "，令牌可能不对。" }); return null; }
        // 顺带确认有没有 gist 权限：响应头里会列出这个令牌的 scope
        var scopes = r.headers.get("x-oauth-scopes") || "";
        if (scopes && scopes.indexOf("gist") < 0) {
          fin({ ok:false, msg:"令牌能用，但<b>没有 gist 权限</b>。重新生成时记得勾上 <code>gist</code>。" });
          return null;
        }
        return r.json();
      })
      .then(function (u) {
        if (!u) return;
        if (!gid) { fin({ ok:true, msg:"✓ 令牌有效（账号 " + esc(u.login) + "）。保存后会自动创建一个秘密 Gist。" }); return; }
        fetch("https://api.github.com/gists/" + encodeURIComponent(gid), {
          headers: { "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json" },
          cache: "no-store",
        }).then(function (r2) {
          if (r2.ok) fin({ ok:true, msg:"✓ 令牌有效（账号 " + esc(u.login) + "），Gist 也能读到，可以用了。" });
          else if (r2.status === 404) fin({ ok:false, msg:"令牌没问题，但<b>这个 Gist ID 找不到</b>。确认一下有没有抄错，或者是不是另一个账号创建的。" });
          else fin({ ok:false, msg:"读 Gist 时 GitHub 返回 " + r2.status + "。" });
        }).catch(function (e) { fin({ ok:false, msg:"读 Gist 失败：" + esc(String(e && e.message || e)) }); });
      })
      .catch(function (e) {
        fin({ ok:false, msg:"<b>连不上 api.github.com。</b>检查一下网络；这个网站本身也托管在 GitHub，" +
                            "如果网站能打开而这里连不上，多半是网络对 API 域名做了限制。" });
      });
  }

  /* 探一下自建服务器：分清「没部署」「KV 没绑定」「正常」三种情况 */
  function ping(url, cb) {
    var done = false;
    var fin = function (r) { if (!done) { done = true; cb(r); } };
    setTimeout(function () { fin({ ok:false, msg:"连了 15 秒没反应，多半是地址不对或 Worker 没部署。" }); }, 15000);
    fetch(url + "/?k=selftest123", { cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        if (o.j && o.j.ok) { fin({ ok:true, msg:"✓ 连接正常，服务器已就绪，可以登录了。" }); return; }
        var e = (o.j && o.j.err) || ("HTTP " + o.s);
        if (/STUDY/.test(e)) {
          fin({ ok:false, msg:"地址是对的，但 <b>KV 还没绑定</b>。到这个 Worker 的 Settings 里添加 KV 绑定，变量名必须正好是 <code>STUDY</code>。" });
        } else {
          fin({ ok:false, msg:"服务器返回：" + esc(e) });
        }
      })
      .catch(function () {
        fin({ ok:false, msg:"<b>连不上。</b>最常见的原因是这个地址上<b>没有部署 Worker</b>——把地址直接粘到浏览器里打开看看，如果是 Cloudflare 的报错页，就说明还没部署成功。也可能是地址打错了。" });
      });
  }

  /* 同步失败：对家长和孩子只说人话。
     服务端原话、接口地址这些只在点开「详情」后才出现——平时摊在屏幕上
     既看不懂，也没必要把后台细节露给每个用过这台设备的人。 */
  function panelError() {
    var e = lastErr;

    box.innerHTML =
      '<h3>☁ 同步暂时没连上</h3>' +
      '<p><b>做题不受影响。</b>进度存在本机，等连上了会自动补传。</p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncretry">重试</button>' +
        '<button id="syncserver">同步方式</button>' +
        (mode() === "gist" ? "" : '<button id="syncrelogin">换登录名</button>') +
        '<button class="ghost" id="syncclose">关闭</button>' +
      '</div>' +
      '<p class="hint"><span class="more" id="syncmore">详情 ›</span></p>' +
      '<div class="raw" id="syncraw"></div>';

    box.querySelector("#syncretry").onclick = function () { close(); lastErr = ""; boot(); };
    box.querySelector("#syncserver").onclick = function () { panelServer(panelError); };
    if (box.querySelector("#syncrelogin"))
      box.querySelector("#syncrelogin").onclick = function () { lastErr = ""; panelLogin(); };
    box.querySelector("#syncclose").onclick = close;
    box.querySelector("#syncmore").onclick = function () {
      this.style.display = "none";
      box.querySelector("#syncraw").innerHTML =
        '<div class="bad">' + esc(e) + '</div>' +
        '<p class="hint">接口：<code>' +
        esc(mode() === "gist" ? "api.github.com/gists" : api()) + '</code></p>';
    };
    mask.classList.add("show");
  }

  /* 未登录：登录面板 */
  function panelLogin(autoPopped) {
    box.innerHTML =
      '<h3>☁ 开启跨设备同步</h3>' +
      '<p>两台设备用<b>同一个登录名</b>，进度就互通。</p>' +
      '<label for="synccode">登录名</label>' +
      '<input id="synccode" type="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" placeholder="例如 lisa2026">' +
      '<p class="hint">至少 6 位，别用容易撞上的，建议名字加数字（如 lisa2026）。</p>' +
      '<p class="err" id="syncerr"></p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncok">登录</button>' +
        '<button class="ghost" id="synclater">' + (autoPopped ? "以后再说" : "取消") + '</button>' +
      '</div>' +
      '<p class="hint"><span class="more" id="syncsrv">⚙️ 同步方式 / 测试连接 ›</span></p>';

    var input = box.querySelector("#synccode");
    var err = box.querySelector("#syncerr");
    input.value = localStorage.getItem(CODE) || "";

    box.querySelector("#syncsrv").onclick = function () { panelServer(panelLogin); };
    box.querySelector("#synclater").onclick = function () {
      // 记下时间：过几天再问一次。永久静音的话，家长就再也等不到提示了
      if (autoPopped) rawSet(SKIP, String(Date.now()));
      close();
    };
    box.querySelector("#syncok").onclick = function () {
      var code = input.value.trim();
      if (code.length < 6) {
        err.textContent = "登录名至少 6 位。太短容易被人猜到，猜到的人就能看到和改掉进度。";
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

  /* 已登录：状态面板
     开着的时候其实不需要再盯着 Gist ID 看——那串东西只在出问题、
     或者要手动对账时才有用，所以收进「技术信息」里，默认只留
     「立即同步 / 新设备扫码」这两件真会按的事。 */
  function panelLogged() {
    var code = localStorage.getItem(CODE) || "";
    var gid = (localStorage.getItem(GID) || "").trim();
    box.innerHTML =
      '<h3>☁ 同步已开启</h3>' +
      '<div class="who">' +
        (mode() === "gist"
          ? '这台设备的进度会自动存到你的 GitHub Gist。'
          : '这台设备的进度会自动存到你的自建服务器。') +
      '</div>' +

      '<div class="btns">' +
        '<button class="primary" id="syncnow">立即同步</button>' +
        (mode() === "gist" && gid
          ? '<button id="syncqrbtn">📱 新设备扫码</button>' : "") +
        '<button class="danger" id="syncout">退出登录</button>' +
        '<button class="ghost" id="syncclose">关闭</button>' +
      '</div>' +
      '<p class="hint"><span class="more" id="syncinfo">🔎 技术信息 ›</span>' +
        '<span id="syncinfobox" style="display:none">' +
          (mode() === "gist"
            ? '<br>Gist ID：<b>' + esc(gid || "（保存后自动创建）") + '</b>'
            : '<br>登录名：<b>' + esc(code) + '</b>') +
        '</span></p>' +
      '<p class="hint"><span class="more" id="syncsrv2">⚙️ 同步方式 / 测试连接 ›</span></p>';

    box.querySelector("#syncinfo").onclick = function () {
      var b = box.querySelector("#syncinfobox");
      var open = b.style.display !== "none";
      b.style.display = open ? "none" : "inline";
      this.textContent = open ? "🔎 技术信息 ›" : "🔎 技术信息 ⌄";
    };
    box.querySelector("#syncnow").onclick = function () { close(); boot(); };

    if (box.querySelector("#syncqrbtn"))
      box.querySelector("#syncqrbtn").onclick = function () { panelQR(panelLogged); };
    box.querySelector("#syncsrv2").onclick = function () { panelServer(panelLogged); };
    box.querySelector("#syncclose").onclick = close;
    box.querySelector("#syncout").onclick = function () {
      if (!confirm("退出后这台设备不再同步，已经做过的题目记录仍然留在本机。确定吗？")) return;
      localStorage.removeItem(CODE);
      localStorage.removeItem(GTOK);      // Gist 模式下令牌才是凭证，一并清掉
      rawSet(SKIP, String(Date.now()));
      close();
      paint("off");
    };
    mask.classList.add("show");
  }

  /* ================= 两种后端 =================
     对上层只暴露三件事：
       remoteGet(code, cb)          cb({ok, blob, err})
       remotePut(code, item, cb)    cb({ok, saved, err})      item = {key, t, v}
       remotePing(cb)               cb({ok, msg})
     Worker 版把合并逻辑放在服务端；Gist 版没有服务端，只能读回来、
     在本地合并、再整份写回去——所以 remotePut 里要先 GET 一次。 */

  function remoteGet(code, cb) {
    if (mode() === "gist") return gistGet(cb);
    fetch(api() + "/?k=" + encodeURIComponent(code), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(j && j.ok ? { ok:true, blob:j.blob || {} }
                                        : { ok:false, err:(j && j.err) || "服务端拒绝了请求" }); })
      .catch(function (e) { cb({ ok:false, err:String((e && e.message) || e) }); });
  }

  function remotePut(code, item, cb) {
    if (mode() === "gist") return gistPut(item, cb);
    fetch(api() + "/?k=" + encodeURIComponent(code), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(j && j.ok ? { ok:true, saved:j.saved }
                                        : { ok:false, err:(j && j.err) || "保存失败" }); })
      .catch(function (e) { cb({ ok:false, err:String((e && e.message) || e) }); });
  }

  /* ---------- GitHub Gist ---------- */

  function gh(path, opt, cb) {
    var tok = (localStorage.getItem(GTOK) || "").trim();
    if (!tok) { cb({ ok:false, err:"还没填 GitHub 令牌" }); return; }
    var o = opt || {};
    o.headers = {
      "Authorization": "Bearer " + tok,
      "Accept": "application/vnd.github+json",
    };
    if (o.body) o.headers["Content-Type"] = "application/json";
    o.cache = "no-store";
    fetch("https://api.github.com" + path, o)
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          if (r.ok) { cb({ ok:true, data:j }); return; }
          // GitHub 的错误码翻译成人话，不然只看到 401 完全不知道干嘛
          var msg = r.status === 401 ? "令牌无效或已过期，请重新生成"
                  : r.status === 403 ? "令牌权限不足，需要勾选 gist 权限"
                  : r.status === 404 ? "找不到这个 Gist（可能被删了，或令牌不是同一个账号的）"
                  : "GitHub 返回 " + r.status + "：" + ((j && j.message) || t.slice(0, 80));
          cb({ ok:false, status:r.status, err:msg });
        });
      })
      .catch(function (e) { cb({ ok:false, err:String((e && e.message) || e) }); });
  }

  function gistGet(cb) {
    var id = (localStorage.getItem(GID) || "").trim();
    if (!id) { cb({ ok:true, blob:{} }); return; }     // 还没建过，等于空
    gh("/gists/" + id, null, function (r) {
      if (!r.ok) { cb(r); return; }
      var f = r.data && r.data.files && r.data.files[GFILE];
      if (!f) { cb({ ok:true, blob:{} }); return; }
      // 文件大于 1MB 时 GitHub 只给 raw_url，这里的数据远没那么大，不处理截断
      var blob = {};
      try { blob = JSON.parse(f.content || "{}") || {}; } catch (e) {}
      cb({ ok:true, blob:blob });
    });
  }

  /* 确保 Gist 已经存在：没有就建一个空的，并把 id 记下来。
     不能等「第一次有进度要上传」才建——那时候用户早就关掉设置页了，
     而第二台设备必须拿到这个 id 才能配上，所以保存设置时就得给出来。 */
  function ensureGist(cb) {
    var id = (localStorage.getItem(GID) || "").trim();
    if (id) { cb({ ok:true, id:id, made:false }); return; }
    gh("/gists", { method:"POST", body:JSON.stringify({
         description: GDESC,
         public: false,
         files: (function () { var o = {}; o[GFILE] = { content: "{}" }; return o; })(),
       }) }, function (r) {
      if (!r.ok) { cb(r); return; }
      rawSet(GID, r.data.id);
      cb({ ok:true, id:r.data.id, made:true });
    });
  }

  function gistPutMany(items, cb) {
    // 没有服务端做合并，只能「读 → 合 → 写」。一次把所有待传的页面合进去，
    // 分多次请求反而会互相覆盖。
    ensureGist(function (e) {
      if (!e.ok) { cb(e); return; }
      gistGet(function (g) {
        if (!g.ok) { cb(g); return; }
        var blob = g.blob || {}, wrote = false, skipped = false;
        items.forEach(function (it) {
          var cur = blob[it.key];
          var merged = mergeRec(it, cur);
          if (cur && same(merged.v, cur.v) && (cur.t || 0) >= (merged.t || 0)) { skipped = true; return; }
          blob[it.key] = { t: merged.t, v: merged.v };
          if (merged.d) blob[it.key].d = merged.d;
          wrote = true;
        });
        if (!wrote) { cb({ ok:true, saved:false }); return; }

        gh("/gists/" + e.id, { method:"PATCH", body:JSON.stringify({
             description: GDESC,
             files: (function () { var o = {}; o[GFILE] = { content: JSON.stringify(blob) }; return o; })(),
           }) }, function (r) {
          cb(r.ok ? { ok:true, saved: !skipped } : r);
        });
      });
    });
  }

  function gistPut(item, cb) { gistPutMany([item], cb); }



  /**
   * 把云端整个 blob 里比本地新的部分全部落盘。
   * 不只处理当前页：这样在导航页登录一次，所有练习的进度就都拉回来了。
   * 返回当前页的数据有没有被换掉（要不要刷新）。
   */
  /* ---------- 哪些页面的进度归我们管 ----------
     每个页面只知道自己的 KEY，但「把本机所有没传上去的都补传」需要知道全部。
     所以维护一张注册表：本页加载时登记自己，拉取时把云端出现过的 key 也登记。
     不去遍历 localStorage——那里面还有别人的东西，不该碰。 */
  function regList() {
    try { var a = JSON.parse(localStorage.getItem(KREG) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function regAdd(k) {
    if (!k) return;
    var a = regList();
    if (a.indexOf(k) > -1) return;
    a.push(k);
    rawSet(KREG, JSON.stringify(a));
  }

  function applyAll(blob) {
    var hitHere = 0;
    Object.keys(blob || {}).forEach(function (k) {
      regAdd(k);
      var r = blob[k];
      if (!r || typeof r.t !== "number" || !isFinite(r.t)) return;

      var raw = localStorage.getItem(k), mine = null;
      if (raw !== null) {
        try {
          mine = { t: +(localStorage.getItem(tkey(k)) || 0),
                   d: +(localStorage.getItem(dkey(k)) || 0), v: JSON.parse(raw) };
        } catch (e) { mine = null; }
      }

      var merged = mergeRec(mine, r);
      // 本机这份已经包含云端那份了（常见：自己刚推上去的），什么都不用动
      if (mine && same(merged.v, mine.v) && (mine.t || 0) >= (merged.t || 0)) return;

      rawSet(k, JSON.stringify(merged.v));
      rawSet(tkey(k), String(merged.t));
      if (merged.d) rawSet(dkey(k), String(merged.d));
      // 当前页的内容真变了才值得刷新；只是时间戳对齐就别折腾人
      if (k && k === KEY && !(mine && same(merged.v, mine.v))) hitHere = merged.t;
    });
    return hitHere;
  }

  /* ================= 两边都做了题，怎么合 =================

     原来是「整页谁新谁赢」。两台设备同时停在同一页各做各的，后保存的那份
     会把另一份整个盖掉——不是没同步，是同步成了一台的。

     现在按内容合：
     - 数组（做对的题号、错题本、标记）取并集，两边做过的题都留着
     - 对象（每题选了哪个、填空填了什么）按题号合，同一题两边都填过，
       以保存时间晚的那份为准
     - 其余（数字、字符串）同样以晚的为准

     「清空重做」是唯一不能靠并集解决的：并集会把刚清掉的题又拼回来。
     所以保存时顺手判断一下这次是不是变少了（有东西被删掉），是就记一个
     「清空时间」。合并时，如果一边的清空时间比另一边的保存时间还晚，
     说明另一边拿的是清空前的旧货，直接整份让位，不做并集。 */

  function dkey(k) { return "__sync_d__" + k; }           // 某份数据上次「变少」的时间

  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  // 元素可能是对象（比如 {id, 答案}），按 JSON 去重，别用 indexOf
  function unionArr(a, b) {
    var out = [], seen = {};
    [a, b].forEach(function (arr) {
      (arr || []).forEach(function (x) {
        var k = typeof x === "object" ? JSON.stringify(x) : typeof x + ":" + x;
        if (seen[k]) return;
        seen[k] = 1;
        out.push(x);
      });
    });
    return out;
  }

  function mergeVal(a, b, aNewer) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (Array.isArray(a) && Array.isArray(b)) return unionArr(a, b);
    if (isObj(a) && isObj(b)) {
      var out = {}, k;
      for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
      for (k in b) if (Object.prototype.hasOwnProperty.call(b, k))
        out[k] = Object.prototype.hasOwnProperty.call(a, k) ? mergeVal(a[k], b[k], aNewer) : b[k];
      return out;
    }
    return aNewer ? a : b;
  }

  /* 两份记录合成一份。入参都是 {t, v, d}，d 是「上次变少」的时间，可以没有 */
  function mergeRec(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((a.d || 0) > (b.t || 0)) return a;        // a 清空过，b 是清空前的旧货
    if ((b.d || 0) > (a.t || 0)) return b;
    return {
      t: Math.max(a.t || 0, b.t || 0),
      d: Math.max(a.d || 0, b.d || 0),
      v: mergeVal(a.v, b.v, (a.t || 0) >= (b.t || 0)),
    };
  }

  function same(x, y) {
    try { return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; }
  }

  /* 本机所有有进度的页面，连同各自的时间戳 */
  function localItems() {
    var out = [];
    regList().forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw === null) return;
      var v; try { v = JSON.parse(raw); } catch (e) { return; }
      out.push({ key: k, t: +(localStorage.getItem(tkey(k)) || 0),
                 d: +(localStorage.getItem(dkey(k)) || 0), v: v });
    });
    return out;
  }

  /* 和云端比一遍，挑出「本机这份合进去之后云端会变」的那些 */
  function staleOnRemote(blob) {
    blob = blob || {};
    return localItems().filter(function (it) {
      var r = blob[it.key];
      if (!r) return true;
      return !same(mergeRec(it, r).v, r.v);
    });
  }

  function boot() {
    // 扫码进来的，先问清楚再说。这一步要在「没登录就自动弹登录框」之前，
    // 不然两个面板会抢同一个弹层
    if (scanned) { paint("off"); panelScan(); return; }
    var code = localStorage.getItem(CODE) || "gist";   // Gist 模式用不到它，占个位
    if (!ready()) {
      paint("off");
      // 没登录过、或者「以后再说」已经过了几天 → 主动弹一次。
      // 旧版本这里存的是 "1"，Number("1") 很小，一样会判定成早就过期，自动修复。
      var skip = +(localStorage.getItem(SKIP) || 0);
      var pop  = sessionStorage.getItem(POPPED);
      if (!NOPOP && !pop && Date.now() - skip > SKIP_DAYS * 864e5) {
        try { sessionStorage.setItem(POPPED, "1"); } catch (e) {}
        setTimeout(function () {
          autoPop = true;
          mode() === "gist" ? panelServer() : panelLogin(true);
        }, 600);
      }
      return;
    }
    if (mode() !== "gist" && !/^https?:\/\//.test(api())) {
      paint("err", "服务器地址没填或格式不对，点小圆点进「同步方式」");
      return;
    }

    paint("busy");
    // 从旧版本升上来、或上次创建没成功的，这里补一次；已有 id 时它直接返回
    if (mode() === "gist" && !(localStorage.getItem(GID) || "").trim()) {
      ensureGist(function (r) {
        if (!r.ok) { paint("err", r.err); return; }
        pull(code);
      });
      return;
    }
    pull(code);
  }

  /* ================= 回到前台就再取一次 =================

     原来只在页面加载时拉一次云端。于是这个场景必然看不到更新：
     第二台设备的页面早就开着（iPad 上标签页会一直留着，锁屏再解锁、
     从别的 App 切回来，都不算重新加载），这时第一台刚做完的题推上去了，
     第二台却还停在打开那一刻的状态，刷新之前永远看不到。

     所以：页面回到前台、或者从「后退/前进」的缓存里被恢复出来时，
     再取一次。离上次取不到 15 秒就算了，免得来回切 App 时猛刷接口。 */

  function refresh() {
    if (!ready() || busy || scanned) return;
    if (mask && mask.classList.contains("show")) return;   // 面板开着，别在人眼前刷新
    if (Date.now() - lastPull < MIN_PULL) return;
    boot();
  }

  function watchForeground() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refresh();
    });
    // iOS Safari 从「上一页」退回来时整页是从缓存里恢复的，不会重新执行脚本，
    // 只会发 pageshow(persisted)
    window.addEventListener("pageshow", function (e) { if (e && e.persisted) refresh(); });
    window.addEventListener("focus", refresh);
  }

  function pull(code) {
    lastPull = Date.now();
    remoteGet(code, function (j) {
      if (!j.ok) { paint("err", j.err); return; }
      try {
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

        // 本机比云端新的，全部补传——不只是当前这一页。
        // 之前只看当前页，于是「在数学页做完题、没等推送就跳去英语页」这种
        // 再普通不过的操作，数学的进度就永远卡在本机，另一台设备看不到。
        var todo = staleOnRemote(j.blob);
        if (todo.length) { pushItems(todo); return; }
        paint("ok");
      } catch (e) { paint("err", String((e && e.message) || e)); }
    });
  }

  function payload() {
    if (!KEY) return null;
    var raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    return { key: KEY, t: +(localStorage.getItem(tkey(KEY)) || Date.now()),
             d: +(localStorage.getItem(dkey(KEY)) || 0), v: v };
  }

  function push() {
    var body = payload();
    if (!body) return;
    pushItems([body]);
  }

  /* 一次把若干页面的进度传上去。
     Gist 必须「读-改-写」，并发会互相覆盖，所以一次请求搞定全部；
     Worker 的合并在服务端，逐个发即可。 */
  function pushItems(items) {
    var code = localStorage.getItem(CODE) || "gist";   // Gist 模式用不到，占位
    if (!ready() || !items || !items.length || busy) return;

    busy = true;
    lastPush = Date.now();
    paint("busy");
    remotePutMany(code, items, function (j) {
      busy = false;
      if (!j.ok) { paint("err", j.err); return; }
      // saved:false 说明远端比本地新，下次打开会自动拉回来
      paint("ok", j.saved === false ? "远端有更新的记录，下次打开会同步过来" : "");
    });
  }

  function remotePutMany(code, items, cb) {
    if (mode() === "gist") return gistPutMany(items, cb);
    // Worker：串行发，避免服务端同时改同一条记录
    var i = 0, anySkipped = false;
    (function step() {
      if (i >= items.length) { cb({ ok:true, saved: !anySkipped }); return; }
      remotePut(code, items[i++], function (r) {
        if (!r.ok) { cb(r); return; }
        if (r.saved === false) anySkipped = true;
        step();
      });
    })();
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    // 攒一会儿再发，免得每答一题都发请求；
    // 同时保证两次推送至少隔 MIN_GAP，防止连续答题把 KV 的每日写入额度刷爆。
    var wait = Math.max(1200, MIN_GAP - (Date.now() - lastPush));
    pushTimer = setTimeout(push, wait);
  }

  /* ================= 挂钩本页的保存动作 ================= */

  // 这次保存是不是「变少了」。合并取并集，所以删除必须单独认出来，
  // 否则「清空重做」会被另一台设备的旧数据原样拼回来。
  function countItems(v) {
    if (Array.isArray(v)) { var n = 0; v.forEach(function (x) { n += 1 + countItems(x); }); return n; }
    if (isObj(v)) { var m = 0, k; for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) m += 1 + countItems(v[k]); return m; }
    return 0;
  }
  function shrank(oldRaw, newRaw) {
    if (oldRaw === null || oldRaw === undefined) return false;
    try { return countItems(JSON.parse(oldRaw)) > countItems(JSON.parse(newRaw)); }
    catch (e) { return false; }
  }

  if (KEY) {
    regAdd(KEY);
    localStorage.setItem = function (k, v) {
      var before = k === KEY ? localStorage.getItem(k) : null;
      rawSet(k, v);
      if (k === KEY) {
        var now = Date.now();
        if (shrank(before, v)) rawSet(dkey(KEY), String(now));
        rawSet(tkey(KEY), String(now));
        schedulePush();
      }
    };

    // 页面切到后台就立刻冲一次，不等那 1.2 秒的防抖——
    // 「做完最后一题马上切走」是最常见的动作，等不起。
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && pushTimer) {
        clearTimeout(pushTimer); pushTimer = null;
        push();
      }
    });

    window.addEventListener("pagehide", function () {
      if (!pushTimer) return;
      clearTimeout(pushTimer);
      pushTimer = null;
      var code = localStorage.getItem(CODE) || "gist";
      var body = payload();
      if (!ready() || !body) return;
      // Gist 要带 Authorization 头，sendBeacon 不支持自定义头，而且它得先 GET
      // 再 PATCH，页面正在销毁跑不完。好在任何一个页面下次打开时都会把本机
      // 所有没传上去的一起补传（见 staleOnRemote），数据不会丢，只是晚一步。
      if (mode() === "gist" || !navigator.sendBeacon) return;
      try {
        navigator.sendBeacon(
          api() + "/?k=" + encodeURIComponent(code),
          new Blob([JSON.stringify(body)], { type: "application/json" })
        );
      } catch (e) {}
    });
  }

  // 地址栏里的令牌越早抹掉越好，所以这一步不等 DOMContentLoaded
  takeScan();

  if (document.body) { ui(); watchForeground(); boot(); }
  else document.addEventListener("DOMContentLoaded", function () { ui(); watchForeground(); boot(); });
})();
