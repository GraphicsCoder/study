/* 自动更新检查的判断逻辑测试：什么时候该刷新，什么时候不敢刷。 */
"use strict";
const L = require("./检查更新.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log("✗ " + name + (extra ? "  → " + extra : ""));
}

/* ---- 该不该刷 ---- */
ok("版本不一样且页面闲着，就刷", L.shouldReload("202601010000", "202601020000", false));
ok("版本一样不刷", !L.shouldReload("202601010000", "202601010000", false));
ok("页面正忙不刷", !L.shouldReload("202601010000", "202601020000", true));
ok("取不到线上版本不刷", !L.shouldReload("202601010000", "", false));
ok("页面自己没版本号不刷", !L.shouldReload("", "202601020000", false));
ok("两边都空不刷", !L.shouldReload("", "", false));
ok("线上版本比本地旧也刷（以线上为准）", L.shouldReload("202601020000", "202601010000", false));

/* ---- 页面忙不忙 ---- */
function fakeDoc(opts) {
  opts = opts || {};
  return {
    body: { className: opts.cls || "" },
    activeElement: opts.active || null,
    querySelectorAll: function () { return opts.fields || []; },
    querySelector: function () { return opts.media || null; },
  };
}
ok("空页面不算忙", !L.busyNow(fakeDoc()));
ok("填了字就算忙", L.busyNow(fakeDoc({ fields: [{ type: "text", value: "教室" }] })));
ok("只有空白字符不算忙", !L.busyNow(fakeDoc({ fields: [{ type: "text", value: "   " }] })));
ok("隐藏域里的值不算忙", !L.busyNow(fakeDoc({ fields: [{ type: "hidden", value: "x" }] })));
ok("禁用的输入框不算忙", !L.busyNow(fakeDoc({ fields: [{ type: "text", value: "x", disabled: true }] })));
ok("光标停在输入框里算忙", L.busyNow(fakeDoc({ active: { tagName: "INPUT" } })));
ok("光标在按钮上不算忙", !L.busyNow(fakeDoc({ active: { tagName: "BUTTON" } })));
ok("正在玩游戏算忙", L.busyNow(fakeDoc({ cls: "playing" })));
ok("正在答题算忙", L.busyNow(fakeDoc({ cls: "quiz" })));
ok("熏听正在放算忙", L.busyNow(fakeDoc({ media: { paused: false } })));
ok("熏听暂停着不算忙", !L.busyNow(fakeDoc({ media: { paused: true } })));

ok("两次检查之间留了间隔", L.CHECK_GAP >= 60 * 1000);

console.log(fail ? `\n${fail} 项没过，${pass} 项通过` : `全部 ${pass} 项通过`);
process.exit(fail ? 1 : 0);
