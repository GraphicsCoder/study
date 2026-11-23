/* 页面自动更新检查
 *
 * 问题：把页面「添加到主屏幕」之后，iOS 会很顽固地用缓存里的那一份 HTML。
 * 脚本带了 ?v= 版本号能刷新，可 HTML 自己没有，于是主屏幕图标进去看到的
 * 一直是旧版——网页端刷新一下就好了，主屏幕那份却可能好几天不动。
 *
 * 做法：每次发布时 刷新版本号.py 会写一个 版本.txt（内容就是时间戳），
 * 同时把同一个时间戳写进每个页面的这行 script 标签上。页面跑起来后
 * 拿 no-store 去取 版本.txt，对不上就说明手里这份 HTML 过期了，
 * 带上新版本号重新打开自己（换了 URL 才能绕开缓存）。
 *
 * 什么时候检查：打开时一次，之后每次从后台切回前台、并且距上次检查
 * 超过 CHECK_GAP 才再查一次——别为了这点事一直发请求。
 *
 * 什么时候不敢刷：页面上有没做完的输入（填空、文本框、正在答题的游戏）
 * 时不刷，等下次。刷掉用户正写着的东西，比看到旧版还糟。
 */
(function (root) {
  "use strict";

  var CHECK_GAP = 10 * 60 * 1000;   // 两次检查至少隔十分钟
  var FILE = "版本.txt";

  /* 该不该重新加载：版本都拿到了、确实不一样、页面也闲着 */
  function shouldReload(mine, latest, busy) {
    if (!mine || !latest) return false;
    if (mine === latest) return false;
    return !busy;
  }

  /* 页面是不是「正忙」——有人填了东西还没走 */
  function busyNow(doc) {
    doc = doc || document;
    if (doc.body && /\bplaying\b|\bquiz\b/.test(doc.body.className)) return true;
    var typed = doc.querySelectorAll("input, textarea");
    for (var i = 0; i < typed.length; i++) {
      var el = typed[i];
      if (el.type === "hidden" || el.disabled) continue;
      if ((el.value || "").trim()) return true;
    }
    var a = doc.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return true;
    var au = doc.querySelector("audio, video");
    if (au && !au.paused) return true;      // 正在熏听，别打断
    return false;
  }

  function api(opts) {
    opts = opts || {};
    var mine = opts.build || "";
    var last = 0;

    function check() {
      if (!mine) return;
      var now = Date.now();
      if (now - last < CHECK_GAP) return;
      last = now;
      fetch(FILE + "?t=" + now, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (txt) {
          var latest = String(txt || "").trim();
          if (!shouldReload(mine, latest, busyNow())) return;
          var base = location.href.split("#")[0].split("?")[0];
          location.replace(base + "?v=" + encodeURIComponent(latest));
        })
        .catch(function () {});     // 离线就算了，下次再说
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) check();
    });
    window.addEventListener("focus", check);
    setTimeout(check, 1500);        // 开页面先让它把自己画出来，再去问
    return { check: check, shouldReload: shouldReload, busyNow: busyNow };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { shouldReload: shouldReload, busyNow: busyNow, CHECK_GAP: CHECK_GAP };
  } else {
    var me = document.currentScript;
    root.检查更新 = api({ build: me && me.getAttribute("data-build") });
  }
})(typeof window !== "undefined" ? window : this);
