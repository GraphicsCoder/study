"""给 同步.js、接答案逻辑.js、搬家逻辑.js 的引用打上版本号，强制浏览器重新下载。

改完 同步.js 之后跑一次：

    python 刷新版本号.py

否则浏览器会按 GitHub Pages 给的 Cache-Control: max-age=600
继续用缓存里的旧脚本，最长 10 分钟看不到改动（iOS Safari 可能更久），
很容易误以为"改了没生效"。
"""
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PATTERN = re.compile(r'src="(同步|接答案逻辑|搬家逻辑)\.js(?:\?v=\d+)?"')


def main() -> int:
    stamp = datetime.now().strftime("%Y%m%d%H%M")
    changed = 0

    for f in sorted(HERE.glob("*.html")):
        html = f.read_text(encoding="utf-8")
        if not PATTERN.search(html):
            continue
        new = PATTERN.sub(lambda m: f'src="{m.group(1)}.js?v={stamp}"', html)
        if new != html:
            f.write_text(new, encoding="utf-8")
            changed += 1
            print(f"[OK] {f.name}")

    print(f"\n共更新 {changed} 个页面，版本号 {stamp}")
    if changed:
        print("记得 git add -A && git commit && git push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
