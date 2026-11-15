"""生成二维码并写进导航页 index.html。

用法：
    python 生成二维码.py https://你的用户名.github.io/仓库名/
    python 生成二维码.py http://192.168.0.122:8000/        # 局域网地址也行

会做两件事：
    1. 生成 二维码.png（可以打印出来贴墙上 / 发微信）
    2. 把二维码直接嵌进 index.html（内嵌 SVG，不联网也能显示）
"""
import sys
import re
from pathlib import Path

import segno

HERE = Path(__file__).resolve().parent

# Windows 控制台默认编码可能是 cp1252/cp936，中文和符号会直接报错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    url = sys.argv[1].strip()
    page = HERE / (sys.argv[2] if len(sys.argv) > 2 else "index.html")

    qr = segno.make(url, error="m")

    png = HERE / "二维码.png"
    qr.save(png, scale=10, border=2)
    print(f"[OK] 已生成 {png.name}（{qr.designator}，可打印）")

    if not page.exists():
        print(f"[!] 找不到 {page.name}，只生成了图片")
        return 0

    # 用 <img> 包在 <a download> 里：点击直接下载，右键/长按也能"保存图片"
    # （内联 SVG 是 DOM 元素不是图片，浏览器不给保存选项）
    data_uri = qr.png_data_uri(scale=8, border=2, dark="#1f2430")
    img = (
        f'<a href="{data_uri}" download="二维码.png" title="点击下载二维码">'
        f'<img src="{data_uri}" alt="扫码在手机上做题"></a>'
    )
    html = page.read_text(encoding="utf-8")

    new_html, n = re.subn(
        r"<!--QR-START-->.*?<!--QR-END-->",
        lambda _: f"<!--QR-START-->{img}<!--QR-END-->",
        html,
        flags=re.S,
    )
    if not n:
        print(f"[!] {page.name} 里找不到 <!--QR-START--> 标记，没改动")
        return 1

    new_html = re.sub(
        r'(<div class="url" id="qrurl">).*?(</div>)',
        lambda m: f"{m.group(1)}{url}{m.group(2)}",
        new_html,
        flags=re.S,
    )

    page.write_text(new_html, encoding="utf-8")
    print(f"[OK] 已把二维码嵌入 {page.name}")
    print(f"  指向：{url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
