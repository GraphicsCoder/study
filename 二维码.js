/* 二维码.js —— 够用就好的 QR 码生成器（字节模式，纠错 L/M，版本 1–10）
 *
 * 为什么不用现成的库：这个网站是纯静态页，二维码里装的是 GitHub 令牌，
 * 不能为了画个码去 CDN 拉一段别人的脚本——那等于把令牌所在的页面
 * 交给第三方域名。这里只实现同步要用到的那一小块：一段几十到两百字节的
 * 网址、版本 1–10、纠错 L 和 M。再长就放不下了，会直接报错而不是悄悄画错。
 *
 * 正确性不是靠眼看：二维码测试.js 会把这里生成的点阵和 Python 的 qrcode
 * 库逐格比对（同一段文本、同一个纠错级别，矩阵必须完全一致）。
 *
 *   QR.matrix(text, "M")        → { n: 边长, get(x,y): 0/1 }
 *   QR.svg(text, { ecl, scale, quiet, dark, light }) → <svg> 字符串
 */
(function (root) {
  "use strict";

  /* ---------------- 每个版本、每个纠错级别的分块表 ----------------
     [每块纠错码字数, 第一组块数, 第一组每块数据码字数, 第二组块数, 第二组每块数据码字数]
     第二组每块比第一组多一个码字，这是规范定死的。 */
  var BLOCKS = {
    L: [
      null,
      [ 7, 1, 19, 0,  0], [10, 1, 34, 0,  0], [15, 1, 55, 0,  0], [20, 1, 80, 0,  0],
      [26, 1,108, 0,  0], [18, 2, 68, 0,  0], [20, 2, 78, 0,  0], [24, 2, 97, 0,  0],
      [30, 2,116, 0,  0], [18, 2, 68, 2, 69],
    ],
    M: [
      null,
      [10, 1, 16, 0,  0], [16, 1, 28, 0,  0], [26, 1, 44, 0,  0], [18, 2, 32, 0,  0],
      [24, 2, 43, 0,  0], [16, 4, 27, 0,  0], [18, 4, 31, 0,  0], [22, 2, 38, 2, 39],
      [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
    ],
  };

  // 对齐图案中心坐标（版本 1 没有）
  var ALIGN = [
    null, [], [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38], [6,24,42], [6,26,46], [6,28,50],
  ];

  // 版本 7 起要在两个角上写 18 位版本信息，这几个常数是查表来的
  var VERINFO = { 7:0x07C94, 8:0x085BC, 9:0x09A99, 10:0x0A4D3 };

  var MAXVER = 10;

  /* ---------------- GF(256) ---------------- */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;              // 本原多项式
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  }());

  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  // 生成多项式：(x-α^0)(x-α^1)…(x-α^(n-1))
  function genPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1);
      for (var k = 0; k < ng.length; k++) ng[k] = 0;
      for (var j = 0; j < g.length; j++) {
        ng[j]     ^= mul(g[j], EXP[i]);
        ng[j + 1] ^= g[j];
      }
      g = ng;
    }
    // 按「最高次在前」返回（g[0] 恒为 1），下面的除法就是这么取系数的。
    // 上面这个循环攒出来的是反的，少这一下 reverse，纠错码字全错，
    // 而且错得很隐蔽：图能画出来，手机也能对上焦，就是扫不出东西。
    return g.reverse();
  }

  function ecBytes(data, n) {
    var g = genPoly(n), res = new Array(n), i;
    for (i = 0; i < n; i++) res[i] = 0;
    for (i = 0; i < data.length; i++) {
      var f = data[i] ^ res[0];
      res.shift(); res.push(0);
      if (f !== 0) for (var j = 0; j < n; j++) res[j] ^= mul(g[j + 1], f);
    }
    return res;
  }

  /* ---------------- 文本 → 码字 ---------------- */

  function utf8(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var c2 = s.charCodeAt(++i);
        var u = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
        out.push(0xF0 | (u >> 18), 0x80 | ((u >> 12) & 63), 0x80 | ((u >> 6) & 63), 0x80 | (u & 63));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function capacity(ver, ecl) {
    var b = BLOCKS[ecl][ver];
    return b[1] * b[2] + b[3] * b[4];
  }

  function pickVersion(len, ecl) {
    for (var v = 1; v <= MAXVER; v++) {
      // 字节模式的「字符数」字段：版本 1–9 占 8 位，10 起占 16 位
      var head = 4 + (v < 10 ? 8 : 16);
      if (capacity(v, ecl) * 8 >= head + len * 8) return v;
    }
    return 0;
  }

  function codewords(bytes, ver, ecl) {
    var bits = [], i;
    function put(val, n) { for (var k = n - 1; k >= 0; k--) bits.push((val >> k) & 1); }

    put(4, 4);                                   // 字节模式
    put(bytes.length, ver < 10 ? 8 : 16);
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);

    var total = capacity(ver, ecl) * 8;
    for (i = 0; i < 4 && bits.length < total; i++) bits.push(0);   // 结束符
    while (bits.length % 8) bits.push(0);

    var dat = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dat.push(b);
    }
    var pad = [0xEC, 0x11], p = 0;
    while (dat.length < capacity(ver, ecl)) dat.push(pad[p++ & 1]);

    // 分块、各自算纠错、再按规范交错
    var spec = BLOCKS[ecl][ver], ecn = spec[0];
    var blocks = [], pos = 0, n;
    for (i = 0; i < spec[1]; i++) { blocks.push(dat.slice(pos, pos + spec[2])); pos += spec[2]; }
    for (i = 0; i < spec[3]; i++) { blocks.push(dat.slice(pos, pos + spec[4])); pos += spec[4]; }
    var ecs = blocks.map(function (b) { return ecBytes(b, ecn); });

    var out = [];
    var maxd = Math.max(spec[2], spec[4] || 0);
    for (i = 0; i < maxd; i++)
      for (n = 0; n < blocks.length; n++)
        if (i < blocks[n].length) out.push(blocks[n][i]);
    for (i = 0; i < ecn; i++)
      for (n = 0; n < ecs.length; n++) out.push(ecs[n][i]);
    return out;
  }

  /* ---------------- 排版 ---------------- */

  function build(ver, ecl, data) {
    var n = ver * 4 + 17, i, j;
    var m = [], fn = [];                         // fn: 功能图案，数据不能占
    for (i = 0; i < n; i++) { m.push(new Array(n).fill(0)); fn.push(new Array(n).fill(0)); }

    function set(x, y, v) { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = v; fn[y][x] = 1; } }

    // 三个定位图案 + 分隔带
    [[0,0],[n-7,0],[0,n-7]].forEach(function (p) {
      for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
        var inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        var on = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(p[0] + dx, p[1] + dy, on ? 1 : 0);
      }
    });

    // 定时图案
    for (i = 8; i < n - 8; i++) { set(i, 6, i % 2 ? 0 : 1); set(6, i, i % 2 ? 0 : 1); }

    // 对齐图案（和定位图案重叠的三个角不画）
    var ac = ALIGN[ver];
    for (i = 0; i < ac.length; i++) for (j = 0; j < ac.length; j++) {
      var cx = ac[i], cy = ac[j];
      if ((cx <= 8 && cy <= 8) || (cx <= 8 && cy >= n - 9) || (cx >= n - 9 && cy <= 8)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        set(cx + dx2, cy + dy2, (Math.abs(dx2) === 2 || Math.abs(dy2) === 2 || (!dx2 && !dy2)) ? 1 : 0);
    }

    set(8, n - 8, 1);                            // 固定的黑点

    // 先把格式信息区占住，真正的内容等选完掩码再写
    for (i = 0; i <= 8; i++) { if (i !== 6) { set(i, 8, 0); set(8, i, 0); } }
    for (i = 0; i < 8; i++) { set(n - 1 - i, 8, 0); set(8, n - 1 - i, 0); }
    if (ver >= 7) for (i = 0; i < 18; i++) { set(i % 3 + n - 11, (i / 3) | 0, 0); set((i / 3) | 0, i % 3 + n - 11, 0); }

    // 数据按「右起两列一组、之字形」填
    var bit = 0, total = data.length * 8;
    function next() { var b = bit < total ? (data[bit >> 3] >> (7 - (bit & 7))) & 1 : 0; bit++; return b; }
    var up = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                      // 第 6 列是定时图案，整列跳过
      for (var k = 0; k < n; k++) {
        var y = up ? n - 1 - k : k;
        for (var c = 0; c < 2; c++) {
          var x = col - c;
          if (!fn[y][x]) m[y][x] = next();
        }
      }
      up = !up;
    }
    return { n: n, m: m, fn: fn };
  }

  function maskFn(k) {
    return [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x, y) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (((y / 2) | 0) + ((x / 3) | 0)) % 2 === 0; },
      function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
      function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; },
    ][k];
  }

  function fmtBits(ecl, mask) {
    var v = ((ecl === "L" ? 1 : 0) << 3) | mask;   // L=01 M=00
    var d = v << 10;
    for (var i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= 0x537 << i;
    return ((v << 10) | d) ^ 0x5412;
  }

  function writeFormat(g, ecl, mask) {
    var n = g.n, f = fmtBits(ecl, mask), i;
    // m[行][列]。格式信息的第一份沿着左上角拐个弯：先在第 8 列自上而下，
    // 再在第 8 行自右向左。行列写反了只错 8 个格，图看着照样像二维码，
    // 但谁也扫不出来——所以这段是照着 Python 的 qrcode 逐格对出来的。
    for (i = 0; i <= 5; i++) g.m[i][8] = (f >> i) & 1;
    g.m[7][8] = (f >> 6) & 1;
    g.m[8][8] = (f >> 7) & 1;
    g.m[8][7] = (f >> 8) & 1;
    for (i = 9; i <= 14; i++) g.m[8][14 - i] = (f >> i) & 1;
    // 第二份拷贝：低 8 位横着写在右上，高 7 位竖着写在左下
    for (i = 0; i < 8; i++) g.m[8][n - 1 - i] = (f >> i) & 1;
    for (i = 8; i < 15; i++) g.m[n - 15 + i][8] = (f >> i) & 1;
    g.m[n - 8][8] = 1;                           // 固定黑点
  }

  function writeVersion(g, ver) {
    if (ver < 7) return;
    var n = g.n, v = VERINFO[ver];
    for (var i = 0; i < 18; i++) {
      var b = (v >> i) & 1, a = (i / 3) | 0, c = i % 3;
      g.m[a][n - 11 + c] = b;
      g.m[n - 11 + c][a] = b;
    }
  }

  // 四条罚分规则，照规范算；选罚分最低的掩码
  function penalty(m, n) {
    var s = 0, x, y, i, run, dark = 0;
    function line(get) {
      for (i = 0; i < n; i++) {
        run = 1;
        for (var k = 1; k < n; k++) {
          if (get(i, k) === get(i, k - 1)) { run++; }
          else { if (run >= 5) s += run - 2; run = 1; }
        }
        if (run >= 5) s += run - 2;
      }
    }
    line(function (i, k) { return m[i][k]; });
    line(function (i, k) { return m[k][i]; });

    for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) {
      var v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) s += 3;
    }

    var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    function scan(get) {
      for (y = 0; y < n; y++) for (x = 0; x + 11 <= n; x++) {
        var a = true, b = true;
        for (i = 0; i < 11; i++) {
          var g = get(y, x + i);
          if (g !== pat1[i]) a = false;
          if (g !== pat2[i]) b = false;
        }
        if (a) s += 40;
        if (b) s += 40;
      }
    }
    scan(function (r, c) { return m[r][c]; });
    scan(function (r, c) { return m[c][r]; });

    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) dark++;
    s += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
    return s;
  }

  function matrix(text, ecl) {
    ecl = ecl === "L" ? "L" : "M";
    var bytes = utf8(String(text));
    var ver = pickVersion(bytes.length, ecl);
    if (!ver) throw new Error("内容太长，这个二维码最多装到版本 " + MAXVER + "（约 " + capacity(MAXVER, ecl) + " 字节）");

    var data = codewords(bytes, ver, ecl);
    var best = null, bestScore = Infinity;
    for (var k = 0; k < 8; k++) {
      var g = build(ver, ecl, data), f = maskFn(k), x, y;
      for (y = 0; y < g.n; y++) for (x = 0; x < g.n; x++)
        if (!g.fn[y][x] && f(x, y)) g.m[y][x] ^= 1;
      writeFormat(g, ecl, k);
      writeVersion(g, ver);
      var sc = penalty(g.m, g.n);
      if (sc < bestScore) { bestScore = sc; best = g; }
    }
    return {
      n: best.n,
      version: ver,
      get: function (x, y) { return best.m[y][x]; },
      rows: best.m,
    };
  }

  // 画成 svg 字符串：不依赖 canvas，截图、打印、放大都不糊
  function svg(text, opt) {
    opt = opt || {};
    var q = opt.quiet == null ? 4 : opt.quiet;     // 静区，规范要求 4 格，少了扫不出来
    var s = opt.scale || 4;
    var mx = matrix(text, opt.ecl);
    var n = mx.n, side = (n + q * 2) * s, d = [];
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++)
      if (mx.get(x, y)) d.push("M" + (x + q) * s + " " + (y + q) * s + "h" + s + "v" + s + "h-" + s + "z");
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + side + '" height="' + side +
           '" viewBox="0 0 ' + side + ' ' + side + '" shape-rendering="crispEdges">' +
           '<rect width="' + side + '" height="' + side + '" fill="' + (opt.light || "#fff") + '"/>' +
           '<path fill="' + (opt.dark || "#000") + '" d="' + d.join("") + '"/></svg>';
  }

  var QR = { matrix: matrix, svg: svg, MAXVER: MAXVER, capacity: capacity };
  if (typeof module !== "undefined" && module.exports) module.exports = QR;
  root.QR = QR;
}(typeof window !== "undefined" ? window : globalThis));
