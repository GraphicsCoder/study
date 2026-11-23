# -*- coding: utf-8 -*-
"""把英语句子生成 mp3，并把播放清单写进 熏听.html。

准备（只做一次）：
    pip install edge-tts

用法：
    python 生成熏听音频.py            # 生成缺的音频 + 更新清单
    python 生成熏听音频.py --clean    # 顺便删掉已经没人用的旧 mp3

做三件事：
    1. 从两份英语练习页里，把题目还原成「填好答案的完整正确句子」
       （选择题填回正确选项、填空题填回答案、改错题换成对的词）
    2. 加上 熏听材料.py 里的对话 / 短文
    3. 逐句生成 mp3 放进 音频/，再把清单注入 熏听.html 的 <!--TRACKS-START--> 标记之间

同一句话只会生成一次（文件名是内容的哈希），所以加了新题重跑很快。
改了某句话 → 会生成新文件，旧文件用 --clean 清掉。

嫌内容太多，改下面的 KINDS 就能增减类别。
"""

import asyncio
import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUDIO_DIR = HERE / "音频"
PLAYER = HERE / "熏听.html"

PRACTICE = [
    ("介词",     HERE / "介词专项练习.html"),
    ("划线提问", HERE / "划线部分提问专项练习.html"),
]

# 牛津版教材用英音（教材里写 colour 不是 color），所以默认英式发音
VOICE_F = "en-GB-SoniaNeural"   # 女声
VOICE_M = "en-GB-RyanNeural"    # 男声
RATE = "-10%"                   # 比正常语速慢一点，四年级听得清
CONCURRENCY = 4                 # 同时生成几个，太大容易被限流

# 熏听要放哪几类内容。改这一行就能增减，然后重跑脚本：
#   "对话" "短文" → 熏听材料.py 里的情景材料，约 65 句，最耐听
#   "问答"        → 划线提问：陈述句 + 对应问句成对，约 210 句
#   "单句"        → 介词练习的独立句子，约 110 句；没情景又跟闯关游戏重复，默认不放
#
# 想更精简就只留 {"对话", "短文"}；想全都要就四个都写上。
# 去掉某一类之后，加 --clean 重跑可以把对应的 mp3 一起删掉。
KINDS = {"对话", "短文", "问答"}

# Windows 控制台默认编码可能是 cp936，中文和符号会直接报错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ====================== 从练习页里抠题库 ======================

def js_to_py(src: str):
    """把 JS 的对象字面量数组转成 Python 对象。

    只处理这个项目用到的子集：双引号字符串、数字、数组、对象。
    做法是给裸键名补上引号再交给 json 解析，补的时候会跳过字符串内部，
    免得把句子里的冒号当成键名。顺便去掉 JSON 不接受的尾逗号。
    """
    out = []
    i, n = 0, len(src)
    in_str = False
    while i < n:
        ch = src[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < n:          # 转义，整对跳过
                out.append(src[i + 1])
                i += 2
                continue
            if ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        m = re.match(r"([A-Za-z_$][\w$]*)\s*:", src[i:])   # 裸键名
        if m:
            out.append('"' + m.group(1) + '":')
            i += m.end()
            continue
        if ch == ",":                              # 尾逗号 ,} 或 ,]
            j = i + 1
            while j < n and src[j] in " \t\r\n":
                j += 1
            if j < n and src[j] in "}]":
                i += 1
                continue
        out.append(ch)
        i += 1
    return json.loads("".join(out))


def read_bank(path: Path):
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"const\s+DATA\s*=\s*(\[[\s\S]*?^\];)", txt, re.M)
    if not m:
        raise SystemExit(f"[x] {path.name} 里没找到题库 DATA")
    return js_to_py(m.group(1).rstrip().rstrip(";"))


def tidy(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def drop_cn(s: str) -> str:
    """cn 字段写成「（球在盒子里面）」，去掉外面那层括号当字幕用。"""
    s = (s or "").strip()
    return s[1:-1].strip() if s.startswith("（") and s.endswith("）") else s


# 句首大写的未必是专有名词，这些常见词即使大写也不往回套
COMMON = {
    "the","this","that","these","those","there","it","he","she","they","we","you",
    "my","your","his","her","their","our","its","a","an","is","are","am","was","were",
    "do","does","did","can","could","will","would","have","has","had","don","let",
    "what","where","when","who","whose","which","how","why","look","listen",
    "today","yesterday","tomorrow","some","any","and","but","no","yes","oh","here",
    "of","in","on","at","to","for","with","from","by","near","under","behind","between",
}


def recap(text: str, src: str) -> str:
    """把题库里小写的答案还原成能看的句子。

    题库里问句答案写成 "what did tom buy yesterday"，读出来没问题，
    但显示该是 "What did Tom buy yesterday?"。
    专有名词从原句里找：原句中首字母大写、又不是 the/this 这类常见词的，
    就认为是人名地名（Tom / Beijing / Sunday），按原句的写法还原。
    """
    caps = {
        w.lower(): w
        for w in re.findall(r"[A-Za-z]+", src)
        if w[:1].isupper() and w.lower() not in COMMON
    }
    out = re.sub(r"[A-Za-z]+", lambda m: caps.get(m.group().lower(), m.group()), text)
    out = tidy(out)
    out = out[:1].upper() + out[1:]
    return out if out[-1:] in ".?!" else out + "?"


def from_prep(data):
    """介词页：把题目还原成填好答案的正确句子。"""
    out = []
    for s in data:
        group = "介词 · " + s["title"]
        for part in s["parts"]:
            kind = part["type"]
            for it in part["items"]:
                if kind == "choice":
                    en = it["s"].replace("___", it["opts"][it["a"]], 1)
                elif kind == "blank":
                    en = it["tpl"]
                    for alts in it["a"]:                  # 多个空按顺序填
                        en = en.replace("___", alts[0], 1)
                elif kind == "fix":
                    en = re.sub(r"【.*?】", it["a"][0], it["s"], count=1)
                else:
                    continue
                out.append((group, tidy(en), drop_cn(it.get("cn")), VOICE_F, "单句"))
    return out


def from_ul(data):
    """划线提问页：陈述句 + 对应的问句配成一对，用一男一女读，听起来像在问答。"""
    out = []
    for s in data:
        group = "划线提问 · " + s["title"]
        for part in s["parts"]:
            for it in part["items"]:
                q = it.get("q")
                if not q:
                    continue
                out.append((group, tidy(q.replace("【", "").replace("】", "")), "", VOICE_F, "问答"))

                if part["type"] == "blank" and it.get("tpl") and it.get("a"):
                    ask = it["tpl"]
                    for alts in it["a"]:                 # 把空按顺序填回去
                        ask = ask.replace("___", alts[0], 1)
                elif part["type"] == "full" and it.get("a"):
                    ask = it["a"][0]
                else:
                    continue
                out.append((group, recap(ask, q), "", VOICE_M, "问答"))
    return out


# ====================== 自己写的对话 / 短文 ======================

def from_material():
    spec = importlib.util.spec_from_file_location("material", HERE / "熏听材料.py")
    if spec is None or spec.loader is None:
        raise SystemExit("[x] 找不到 熏听材料.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    voices = {"A": VOICE_F, "B": VOICE_M, "N": VOICE_F}
    out = []
    for piece in mod.PIECES:
        # 有 A / B 轮流说话的是对话，全是旁白 N 的是短文——不用另外标，看说话人就知道
        kind = "对话" if any(w in ("A", "B") for w, _, _ in piece["lines"]) else "短文"
        # 材料里写了 group 就按它分组（4A 的那十段靠这个按 unit 排），
        # 没写就还是「听力材料 · 标题」
        group = piece.get("group") or ("听力材料 · " + piece["title"])
        for who, en, cn in piece["lines"]:
            out.append((group, tidy(en), cn.strip(), voices.get(who, VOICE_F), kind))
    return out


# ====================== 生成音频 ======================

def filename(text: str, voice: str) -> str:
    h = hashlib.sha1(f"{voice}|{RATE}|{text}".encode("utf-8")).hexdigest()[:12]
    return h + ".mp3"


async def synth_all(jobs):
    try:
        import edge_tts
    except ImportError:
        raise SystemExit("[x] 没装 edge-tts，先运行：pip install edge-tts")

    sem = asyncio.Semaphore(CONCURRENCY)
    done = 0
    total = len(jobs)

    async def one(text, voice, path):
        nonlocal done
        async with sem:
            tmp = path.with_suffix(".part")
            try:
                await edge_tts.Communicate(text, voice, rate=RATE).save(str(tmp))
                tmp.replace(path)          # 写完才改名，中途断了不会留半个文件
            except Exception as e:
                tmp.unlink(missing_ok=True)
                print(f"  [!] 失败：{text[:40]} … {e}")
                return
            done += 1
            print(f"  [{done}/{total}] {text[:52]}")

    await asyncio.gather(*(one(t, v, p) for t, v, p in jobs))


def main() -> int:
    clean = "--clean" in sys.argv

    # 1. 收集所有句子
    rows = []
    for name, path in PRACTICE:
        if not path.exists():
            print(f"[!] 找不到 {path.name}，跳过")
            continue
        data = read_bank(path)
        rows += from_prep(data) if name == "介词" else from_ul(data)
    rows += from_material()

    # 同一句话只留一条（不同专项里重复出现的，归到先出现的那个）
    AUDIO_DIR.mkdir(exist_ok=True)
    seen, tracks, jobs = set(), [], []
    skipped = 0
    for group, en, cn, voice, kind in rows:
        if kind not in KINDS:
            skipped += 1
            continue
        if not en or en.lower() in seen:
            continue
        seen.add(en.lower())
        path = AUDIO_DIR / filename(en, voice)
        tracks.append({"g": group, "k": kind, "t": en, "cn": cn, "f": "音频/" + path.name})
        if not path.exists():
            jobs.append((en, voice, path))

    if not tracks:
        print(f"[x] KINDS 把所有内容都排除了，没东西可生成（当前 KINDS = {sorted(KINDS)}）")
        return 1

    tally = Counter(t["k"] for t in tracks)
    detail = " / ".join(f"{k} {n}" for k, n in sorted(tally.items(), key=lambda x: -x[1]))
    print(f"[i] 一共 {len(tracks)} 句（{detail}），{len({t['g'] for t in tracks})} 个单元")
    if skipped:
        print(f"[i] 按 KINDS 设置跳过了 {skipped} 句")

    # 2. 生成还缺的音频
    if jobs:
        print(f"[i] 需要新生成 {len(jobs)} 条音频…")
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(synth_all(jobs))
    else:
        print("[i] 音频都齐了，不用重新生成")

    missing = [t for t in tracks if not (HERE / t["f"]).exists()]
    if missing:
        print(f"[!] 有 {len(missing)} 条没生成出来，先从清单里去掉了")
        keep = {t["f"] for t in tracks} - {t["f"] for t in missing}
        tracks = [t for t in tracks if t["f"] in keep]

    # 3. 把清单注入播放器
    if not PLAYER.exists():
        print(f"[x] 找不到 {PLAYER.name}，音频已生成但清单没写进去")
        return 1

    html = PLAYER.read_text(encoding="utf-8")
    block = ("<!--TRACKS-START--><script>const TRACKS="
             + json.dumps(tracks, ensure_ascii=False, separators=(",", ":"))
             + ";</script><!--TRACKS-END-->")
    new_html, n = re.subn(r"<!--TRACKS-START-->[\s\S]*?<!--TRACKS-END-->",
                          lambda _: block, html)
    if not n:
        print(f"[x] {PLAYER.name} 里找不到 <!--TRACKS-START--> 标记，没改动")
        return 1
    PLAYER.write_text(new_html, encoding="utf-8")
    print(f"[OK] 清单已写入 {PLAYER.name}（{len(tracks)} 句）")

    # 4. 清掉没人用的旧音频
    used = {(HERE / t["f"]).name for t in tracks}
    stale = [p for p in AUDIO_DIR.glob("*.mp3") if p.name not in used]
    if stale:
        if clean:
            for p in stale:
                p.unlink()
            print(f"[OK] 删掉 {len(stale)} 个没人用的旧音频")
        else:
            print(f"[i] 有 {len(stale)} 个旧音频没人用了，想删就加 --clean 重跑")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
