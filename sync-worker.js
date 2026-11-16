/**
 * 学习进度同步 · Cloudflare Worker
 *
 * 这个文件不是网站的一部分，是要粘到 Cloudflare 后台去跑的。
 * 部署步骤见 同步说明.md。
 *
 * 接口：
 *   GET  /?k=家庭口令              → { ok, blob }   取回全部进度
 *   POST /?k=家庭口令  {key,t,v}   → { ok, saved }  存某个页面的进度
 *
 * 存储结构（KV 里一个口令一条记录）：
 *   {
 *     "prep-practice-v1": { t: 1763000000000, v: {...} },
 *     "en-arcade-v1":     { t: 1763000001234, v: {...} },
 *     ...
 *   }
 *
 * 为什么按页面分别记时间戳，而不是整块覆盖：
 *   整块覆盖的话，iPad 上做了介词、电脑上做了数学，后保存的那台会把
 *   另一台的成果抹掉。分开记之后，只有「同一个页面在两台设备上都改过、
 *   中间又没同步」才会冲突，这种情况少得多。
 */

const MAX_BYTES = 200 * 1024;   // 一个口令最多存 200KB，防止被人当免费网盘

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(req.url);
    const code = (url.searchParams.get("k") || "").trim();
    if (code.length < 6 || code.length > 64) {
      return json({ ok: false, err: "口令长度要在 6~64 位之间" }, 400, cors);
    }
    const kvKey = "fam:" + code;

    if (req.method === "GET") {
      const blob = (await env.STUDY.get(kvKey, "json")) || {};
      return json({ ok: true, blob }, 200, cors);
    }

    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, err: "请求不是合法 JSON" }, 400, cors);
      }
      const { key, t, v } = body || {};
      if (typeof key !== "string" || !key || typeof t !== "number" || !isFinite(t)) {
        return json({ ok: false, err: "缺 key 或 t" }, 400, cors);
      }

      const blob = (await env.STUDY.get(kvKey, "json")) || {};
      const cur = blob[key];

      // 远端的更新就不覆盖，把远端的时间戳告诉客户端，让它下次拉取
      if (cur && cur.t > t) {
        return json({ ok: true, saved: false, t: cur.t }, 200, cors);
      }

      blob[key] = { t, v };
      const text = JSON.stringify(blob);
      if (text.length > MAX_BYTES) {
        return json({ ok: false, err: "数据超过 200KB，存不下" }, 413, cors);
      }
      await env.STUDY.put(kvKey, text);
      return json({ ok: true, saved: true, t }, 200, cors);
    }

    return json({ ok: false, err: "不支持的请求方式" }, 405, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}
