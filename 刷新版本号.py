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

PATTERN = re.compile(r'src="(同步|接答案逻辑|搬家逻辑|词汇逻辑|英语4A词库)\.js(?:\?v=\d+)?"')

# 「添加到主屏幕」之后 iOS 会死抱着缓存里的 HTML 不放，光给脚本加 ?v= 没用。
# 所以每个页面都挂一个 检查更新.js，并把本次版本号写在它的 data-build 上；
# 页面跑起来会去取 版本.txt 比对，对不上就带新版本号重新打开自己。
CHECKER = re.compile(r'<script src="检查更新\.js(?:\?v=\d+)?" data-build="\d+"></script>\s*')
VERSION_FILE = "版本.txt"


def main() -> int:
    stamp = datetime.now().strftime("%Y%m%d%H%M")
    changed = 0

    tag = f'<script src="检查更新.js?v={stamp}" data-build="{stamp}"></script>\n'

    for f in sorted(HERE.glob("*.html")):
        html = f.read_text(encoding="utf-8")
        new = PATTERN.sub(lambda m: f'src="{m.group(1)}.js?v={stamp}"', html)

        # 每页都装上更新检查：先把旧的那一行删掉，再插一行新的到 </body> 前
        new = CHECKER.sub("", new)
        if "</body>" in new:
            new = new.replace("</body>", tag + "</body>", 1)

        if new != html:
            f.write_text(new, encoding="utf-8")
            changed += 1
            print(f"[OK] {f.name}")

    (HERE / VERSION_FILE).write_text(stamp + "\n", encoding="utf-8")
    print(f"[OK] {VERSION_FILE}")

    print(f"\n共更新 {changed} 个页面，版本号 {stamp}")
    if changed:
        print("记得 git add -A && git commit && git push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
