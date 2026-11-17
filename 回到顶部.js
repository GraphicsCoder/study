/**
 * 回到顶部 · 一个浮在右下角的小按钮
 *
 * 用法：在页面末尾加一行 script 标签引用本文件（和 同步.js 一样）。
 *
 * 页面本身一行都不用改。往下滚一屏才出现，点一下回到最上面。
 *
 * 注：注释里刻意不写出完整的 script 结束标签——真写了，这个文件被内联到
 * HTML 里时 HTML 解析器会在那儿提前截断脚本。
 *
 * 位置：如果这一页还挂了同步小圆点（#syncchip），就叠在它上面，
 * 两个按钮不会打架；没有就贴着右下角。
 */
(function () {
  "use strict";

  var SHOW_AT = 420;          // 滚过这么多像素才露面，免得一进页面就挡着
  var btn = null;

  function soft() {
    // 系统设了「减少动态效果」就别做平滑滚动，直接跳
    try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return true; }
  }

  function style() {
    var css = document.createElement("style");
    css.textContent =
      '#totop{position:fixed;right:12px;z-index:99997;' +
      'width:42px;height:42px;border-radius:50%;cursor:pointer;' +
      'border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.94);' +
      'color:#4b5563;font-size:19px;line-height:1;' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.12);' +
      // 默认缩在角落里不可见，滚动到位才淡入——不要一上来就挡住内容
      'opacity:0;transform:translateY(8px);pointer-events:none;' +
      'transition:opacity .2s,transform .2s;-webkit-tap-highlight-color:transparent}' +
      '#totop.on{opacity:1;transform:none;pointer-events:auto}' +
      '#totop:hover{color:#1f2430;background:#fff}' +
      '#totop:active{transform:scale(.92)}' +
      '@media print{#totop{display:none}}';
    document.head.appendChild(css);
  }

  function toTop() {
    var before = window.pageYOffset || document.documentElement.scrollTop || 0;
    try { window.scrollTo({ top: 0, behavior: soft() ? "smooth" : "auto" }); }
    catch (e) { window.scrollTo(0, 0); }        // 老浏览器不认对象参数

    // 兜底：有些环境里平滑滚动是空操作（无合成器的内核、个别 WebView），
    // 点了没反应比没这个按钮还糟。等一下还没动，就直接跳过去。
    setTimeout(function () {
      var now = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (now > 0 && now >= before) window.scrollTo(0, 0);
    }, 400);
  }

  function place() {
    // 同步小圆点占着右下角，就往上让一层
    var chip = document.getElementById("syncchip");
    btn.style.bottom = (chip ? 64 : 14) + "px";
  }

  function onScroll() {
    // 直接判、直接切。读 pageYOffset 和切 class 都很便宜，
    // 原来套了一层 requestAnimationFrame 节流，结果是「滚了但按钮没出现」——
    // 某些情况下（后台标签页、无合成器的环境）rAF 根本不回调。不值当。
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var on = y > SHOW_AT;
    if (on !== btn.classList.contains("on")) {
      btn.classList.toggle("on", on);
      if (on) place();                     // 小圆点是异步插进来的，露面时复查一次
    }
  }

  function init() {
    if (document.getElementById("totop")) return;
    style();

    btn = document.createElement("button");
    btn.id = "totop";
    btn.type = "button";
    btn.title = "回到顶部";
    btn.setAttribute("aria-label", "回到顶部");
    btn.textContent = "↑";
    btn.onclick = function () { toTop(); btn.blur(); };
    document.body.appendChild(btn);
    place();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", place);
    onScroll();
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
