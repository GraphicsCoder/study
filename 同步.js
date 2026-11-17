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

  // 默认 Gist：实测 workers.dev 在国内多种网络下都连不上，
  // 而 api.github.com 和这个网站本身（GitHub Pages）同一家，网站能开它就能开。
  // 已经配过 Worker 的设备，MODE 里存着 "worker"，不受影响。
  function mode(){ return localStorage.getItem(MODE) === "worker" ? "worker" : "gist"; }
  function api(){
    return String(localStorage.getItem(ASET) || API_DEFAULT).trim().replace(/\/+$/, "");
  }

  var me = document.currentScript;
  var KEY = (me && me.dataset && me.dataset.key) || "";   // 导航页没有，属正常

  var CODE = "__sync_code__";             // 登录名，全站共用，登录一次就够
  var SKIP = "__sync_skip_login__";       // 点过「以后再说」的时间戳，过几天会再问一次
  var SKIP_DAYS = 3;

  function tkey(k) { return "__sync_t__" + k; }           // 某份数据的本地时间戳
  function oncek(k) { return "__sync_reloaded__" + k; }   // 防刷新循环的标记

  // 内部写入走原始方法，避免触发下面的挂钩造成循环
  var rawSet = localStorage.setItem.bind(localStorage);
  var pushTimer = null;
  var busy = false;
  var lastPush = 0;
  var lastErr = "";                       // 最近一次失败原因，点小圆点时展开给人看
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

  function close() { if (mask) mask.classList.remove("show"); }

  // Gist 模式靠「令牌 + Gist ID」认身份，不需要再起一个登录名；
  // Worker 模式的登录名就是 KV 的键，必须有。
  function ready() {
    return mode() === "gist"
      ? !!(localStorage.getItem(GTOK) || "").trim()
      : !!localStorage.getItem(CODE);
  }

  function open() {
    // 失败时优先把原因摊开说清楚，别让人对着一个 tooltip 猜
    if (lastErr) return panelError();
    if (ready()) return panelLogged();
    // 没配好：Gist 模式直接进设置页，别让人先填一个用不上的登录名
    return mode() === "gist" ? panelServer() : panelLogin();
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
        '<button class="ghost" id="syncback">返回</button>' +
      '</div>';

    var pane = box.querySelector("#syncpane");
    var slot = box.querySelector("#synctest");
    var cur  = m;

    function say(cls, html){ slot.innerHTML = '<p class="' + cls + ' show">' + html + '</p>'; }

    function paneGist() {
      pane.innerHTML =
        '<p>把进度存在你自己 GitHub 账号下的一个<b>秘密 Gist</b> 里。不用服务器、不花钱，' +
        '走的是 <code>api.github.com</code>——这个网站打得开，它就打得开。</p>' +
        '<label for="syncghtok">GitHub 个人令牌</label>' +
        '<input id="syncghtok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="ghp_… 或 github_pat_…">' +
        '<p class="hint">令牌（Personal Access Token）相当于<b>给这个网页的一把钥匙</b>，' +
        '让它替你读写 Gist，不用在这里输入 GitHub 密码。<br>' +
        '去 <code>github.com/settings/tokens</code> → Generate new token (classic) → ' +
        'Expiration 选 <b>No expiration</b> → <b>只勾 <code>gist</code> 这一项</b>' +
        '（这样它碰不到你的仓库）→ 生成后那串只显示一次，立刻复制过来。<br>' +
        '令牌只存在这台设备的浏览器里，不会上传到本网站。</p>' +
        '<label for="syncgid">Gist ID<span class="opt-note">（第一台设备留空，会自动创建）</span></label>' +
        '<input id="syncgid" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="第一次用留空即可">' +
        '<p class="hint"><b>第一台设备</b>：留空，保存时自动创建，并把 id 显示出来。<br>' +
        '<b>第二台设备</b>：两样都要填。令牌可以直接用第一台那串，' +
        '也可以在<b>同一个 GitHub 账号</b>下另外生成一个（Gist 认账号，不认具体哪把钥匙）；' +
        'Gist ID 必须是第一台那串，否则两边各存各的。</p>';
      pane.querySelector("#syncghtok").value = localStorage.getItem(GTOK) || "";
      pane.querySelector("#syncgid").value   = localStorage.getItem(GID)  || "";
    }

    function paneWorker() {
      pane.innerHTML =
        '<p>自己部署一个 Cloudflare Worker（免费），把地址填在这里。' +
        '<b>注意：</b><code>workers.dev</code> 在国内不少网络连不上，连不通就改用 Gist。</p>' +
        '<label for="syncapi">服务器地址</label>' +
        '<input id="syncapi" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'placeholder="https://study-sync.xxx.workers.dev">' +
        '<p class="hint">要以 <code>https://</code> 开头，结尾不要斜杠。部署步骤见 <b>同步说明.md</b>。</p>';
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
        if (gid) rawSet(GID, gid); else localStorage.removeItem(GID);
        // 没填 id 就当场建一个，把 id 显示出来——第二台设备正等着抄它
        if (!gid) {
          say("hint", "正在创建 Gist…");
          ensureGist(function (r) {
            if (!r.ok) { say("err", r.err || "创建失败"); return; }
            pane.querySelector("#syncgid").value = r.id;
            say("good", "✓ 已创建，<b>Gist ID：" + esc(r.id) + "</b><br>" +
                        "把这串抄到第二台设备（连同令牌），两边才算同一份进度。" +
                        "随时点小圆点也能再看到它。");
          });
          return;                       // 留在设置页，让人把 id 抄走
        }
      } else {
        var url = pane.querySelector("#syncapi").value.trim().replace(/\/+$/, "");
        if (url && !/^https?:\/\//.test(url)) { say("err", "地址要以 https:// 开头。"); return; }
        rawSet(MODE, "worker");
        if (url && url !== API_DEFAULT) rawSet(ASET, url); else localStorage.removeItem(ASET);
      }
      lastErr = "";
      close(); boot();
    };
    box.querySelector("#syncback").onclick = function () { (back || open)(); };
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
          fin({ ok:false, msg:"地址是对的，但 <b>KV 还没绑定</b>。到这个 Worker 的 Settings 里添加 KV 绑定，变量名必须正好是 <code>STUDY</code>（说明第 4 步）。" });
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
      '<p><b>做题不受影响。</b>进度已经存在这台设备上，等连上了会自动补传。</p>' +
      '<p class="hint">' + (mode() === "gist"
        ? '偶尔一次不用管。要是一直这样，点下面的「同步方式」重新测一下令牌。'
        : '偶尔一次不用管。先换个网络试试——比如把手机的 WiFi 关掉、用流量打开。'
          + '要是流量下也连不上，点「同步方式」换一种同步方式更省事。') + '</p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncretry">重试</button>' +
        '<button id="syncserver">同步方式</button>' +
        '<button id="syncrelogin">换登录名</button>' +
        '<button class="ghost" id="syncclose">关闭</button>' +
      '</div>' +
      '<p class="hint"><span class="more" id="syncmore">详情 ›</span></p>' +
      '<div class="raw" id="syncraw"></div>';

    box.querySelector("#syncretry").onclick = function () { close(); lastErr = ""; boot(); };
    box.querySelector("#syncserver").onclick = function () { panelServer(panelError); };
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
      '<p>在 iPad 和电脑上用<b>同一个登录名</b>，做题进度、错题本、闯关星星就互通了。<br>' +
      '名字由你自己定，不用注册、不用手机号。</p>' +
      '<label for="synccode">登录名</label>' +
      '<input id="synccode" type="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" placeholder="例如 lisa2026">' +
      '<p class="hint">至少 6 位。这个名字就是进入这份进度的唯一钥匙，' +
      '别用 <b>lisa</b>、<b>123456</b> 这种容易撞上的，建议<b>名字加数字</b>。</p>' +
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

  /* 已登录：状态面板 */
  function panelLogged() {
    var code = localStorage.getItem(CODE) || "";
    box.innerHTML =
      '<h3>☁ 同步已开启</h3>' +
      (mode() === "gist"
        ? '<div class="who">同步方式：<b>GitHub Gist</b><br>' +
          'Gist ID：<b>' + esc(localStorage.getItem(GID) || "（保存后自动创建）") + '</b><br>' +
          '另一台设备填<b>同样的令牌和这个 ID</b>，进度就会互通。</div>'
        : '<div class="who">同步方式：<b>自建服务器</b><br>' +
          '当前登录名：<b>' + esc(code) + '</b><br>' +
          '另一台设备用同样的名字登录，进度就会互通。</div>') +
      '<p>进度是打开页面时拉取、做完题后自动上传的，平时不用管它。</p>' +
      '<div class="btns">' +
        '<button class="primary" id="syncnow">立即同步</button>' +
        '<button class="danger" id="syncout">退出登录</button>' +
        '<button class="ghost" id="syncclose">关闭</button>' +
      '</div>' +
      '<p class="hint"><span class="more" id="syncsrv2">⚙️ 同步方式 / 测试连接 ›</span></p>';

    box.querySelector("#syncnow").onclick = function () { close(); boot(); };
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

  function gistPut(item, cb) {
    // 没有服务端做合并，只能「读 → 合 → 写」。两台设备同时写仍可能互相覆盖，
    // 但做题是一个人一台设备在用，这个窗口（几百毫秒）实际碰不上。
    ensureGist(function (e) {
      if (!e.ok) { cb(e); return; }
      gistGet(function (g) {
        if (!g.ok) { cb(g); return; }
        var blob = g.blob || {};
        var cur = blob[item.key];
        if (cur && cur.t > item.t) { cb({ ok:true, saved:false }); return; }   // 远端更新，不覆盖
        blob[item.key] = { t:item.t, v:item.v };

        gh("/gists/" + e.id, { method:"PATCH", body:JSON.stringify({
             description: GDESC,
             files: (function () { var o = {}; o[GFILE] = { content: JSON.stringify(blob) }; return o; })(),
           }) }, function (r) {
          cb(r.ok ? { ok:true, saved:true } : r);
        });
      });
    });
  }



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
    var code = localStorage.getItem(CODE) || "gist";   // Gist 模式用不到它，占个位
    if (!ready()) {
      paint("off");
      // 没登录过、或者「以后再说」已经过了几天 → 主动弹一次。
      // 旧版本这里存的是 "1"，Number("1") 很小，一样会判定成早就过期，自动修复。
      var skip = +(localStorage.getItem(SKIP) || 0);
      if (Date.now() - skip > SKIP_DAYS * 864e5) {
        setTimeout(function () {
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

  function pull(code) {
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

        // 本地比云端新 → 推上去
        var remote = KEY ? (j.blob || {})[KEY] : null;
        if (KEY && localStorage.getItem(KEY) !== null &&
            +(localStorage.getItem(tkey(KEY)) || 0) > (remote ? remote.t : -1)) {
          push();
          return;
        }
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
    return { key: KEY, t: +(localStorage.getItem(tkey(KEY)) || Date.now()), v: v };
  }

  function push() {
    // Gist 模式没有登录名，用令牌认身份，这里给个占位值，别让下面的判空挡住
    var code = localStorage.getItem(CODE) || "gist";
    var body = payload();
    if (!ready() || !body || busy) return;

    busy = true;
    lastPush = Date.now();
    paint("busy");
    remotePut(code, body, function (j) {
      busy = false;
      if (!j.ok) { paint("err", j.err); return; }
      // saved:false 说明远端比本地新，下次打开会自动拉回来
      paint("ok", j.saved ? "" : "远端有更新的记录，下次打开会同步过来");
    });
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
      var code = localStorage.getItem(CODE) || "gist";
      var body = payload();
      if (!ready() || !body) return;
      // Gist 要带 Authorization 头，而 sendBeacon 不支持自定义头；
      // 它又得先 GET 再 PATCH，页面正在销毁根本跑不完。
      // 所以 Gist 模式只能靠下次打开页面时补传——数据不会丢，只是晚一步。
      if (mode() === "gist" || !navigator.sendBeacon) return;
      try {
        navigator.sendBeacon(
          api() + "/?k=" + encodeURIComponent(code),
          new Blob([JSON.stringify(body)], { type: "application/json" })
        );
      } catch (e) {}
    });
  }

  if (document.body) { ui(); boot(); }
  else document.addEventListener("DOMContentLoaded", function () { ui(); boot(); });
})();
