/* 把好几句 mp3 接成一条，给熏听的「后台连播」用。
 *
 * 为什么要接起来：在 iOS 上，从「添加到主屏幕」的图标进去是 standalone 模式，
 * 锁屏之后给 <audio> 换 src 基本就不让播了——于是放完一句就没声音。
 * 只要一整段时间里不换 src，锁屏就不会打断。所以干脆把接下来的几十句
 * 先拼成一个 Blob，一次性交给 <audio>，几分钟之内不碰 src。
 *
 * mp3 可以直接按字节首尾相接（同一个编码器出来的文件尤其安全），
 * 只要先把 ID3 标签去掉、再把帧一帧帧对齐就行。这里做三件事：
 *   stripTags  去掉开头的 ID3v2 和结尾的 ID3v1
 *   duration   不解码，只数帧，算出这段音频有多长（拿来定位第几句）
 *   joinParts  拼接 + 算出每一句的起止时间
 *
 * 纯计算，不碰 DOM，可以直接在 node 里拿真实 mp3 测。
 */
(function (root) {
  "use strict";

  var BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  var BITRATES25 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  var RATES = {
    3: [44100, 48000, 32000, 0],   // MPEG-1
    2: [22050, 24000, 16000, 0],   // MPEG-2
    0: [11025, 12000, 8000, 0]     // MPEG-2.5
  };

  function u8(bytes) {
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  /* 去掉 ID3：开头的 ID3v2 头里写着自己多长（七位一组的同步安全整数），
     结尾的 ID3v1 固定 128 字节、以 "TAG" 开头。两个都不是音频，留着
     接在中间会被当成垃圾字节，有的解码器会卡一下。 */
  function stripTags(bytes) {
    var b = u8(bytes);
    var from = 0, to = b.length;
    if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {   // "ID3"
      var size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) |
                 ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
      var foot = (b[5] & 0x10) ? 10 : 0;      // 有 footer 再多 10 字节
      from = Math.min(b.length, 10 + size + foot);
    }
    if (to - from > 128) {
      var t = to - 128;
      if (b[t] === 0x54 && b[t + 1] === 0x41 && b[t + 2] === 0x47) to = t;    // "TAG"
    }
    return b.subarray(from, to);
  }

  /* 读一个帧头，返回 {size, samples, rate}；不是合法帧头就返回 null */
  function frameAt(b, i) {
    if (i + 4 > b.length) return null;
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
    var ver = (b[i + 1] >> 3) & 0x03;          // 3=MPEG1 2=MPEG2 0=MPEG2.5
    var layer = (b[i + 1] >> 1) & 0x03;        // 1=Layer III
    if (ver === 1 || layer !== 1) return null;
    var brIdx = (b[i + 2] >> 4) & 0x0f;
    var srIdx = (b[i + 2] >> 2) & 0x03;
    if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
    var rate = RATES[ver][srIdx];
    var kbps = (ver === 3 ? BITRATES : BITRATES25)[brIdx];
    if (!rate || !kbps) return null;
    var pad = (b[i + 2] >> 1) & 0x01;
    var samples = ver === 3 ? 1152 : 576;      // MPEG-2 / 2.5 的 Layer III 是半帧
    var size = Math.floor(samples / 8 * kbps * 1000 / rate) + pad;
    if (size < 4) return null;
    return { size: size, samples: samples, rate: rate };
  }

  /* 数帧算时长：比解码快得多，也不需要 AudioContext */
  function duration(bytes) {
    var b = stripTags(bytes);
    var i = 0, secs = 0, guard = 0;
    while (i < b.length && guard++ < 1e6) {
      var f = frameAt(b, i);
      if (!f) { i++; continue; }               // 遇到杂字节就一个个往后找同步头
      secs += f.samples / f.rate;
      i += f.size;
    }
    return secs;
  }

  /* 拼接：返回拼好的字节和每一段的起止时间（秒）。
     段与段之间不插任何东西——mp3 帧是自洽的，直接接上就能连着放。 */
  function joinParts(parts) {
    var clean = parts.map(function (p) { return stripTags(p); });
    var total = 0;
    clean.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total);
    var at = 0, t = 0, marks = [];
    clean.forEach(function (c, i) {
      out.set(c, at);
      at += c.length;
      var d = duration(c);
      marks.push({ i: i, from: t, to: t + d, dur: d });
      t += d;
    });
    return { bytes: out, marks: marks, total: t };
  }

  /* 放到第几秒了，就是第几句 */
  function indexAt(marks, time) {
    for (var i = 0; i < marks.length; i++) {
      if (time < marks[i].to - 1e-6) return i;
    }
    return marks.length ? marks.length - 1 : -1;
  }

  var API = { stripTags: stripTags, duration: duration, joinParts: joinParts,
              indexAt: indexAt, frameAt: frameAt };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.音频拼接 = API;
})(typeof window !== "undefined" ? window : this);
