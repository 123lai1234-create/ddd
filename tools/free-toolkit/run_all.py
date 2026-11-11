"""
一次跑完四條產線
================
用法：
    python run_all.py            # 全部跑
    python run_all.py --only 3   # 只跑產線 3
"""

import argparse
import os
import subprocess
import sys

import common

LINES = [
    (1, "line1_mv_platforms.py", "音樂 MV 多平台版本", []),
    (2, "line2_site_assets.py", "donttalk 網站素材批次", []),
    (3, "line3_lyric_cards.py", "歌詞卡 / 封面圖批次", []),
    # 產線 4 是子命令式，沒有預設動作 → 給 "all" 讓它依序跑完所有子命令
    (4, "line4_pdf_batch.py", "PDF 批次處理", ["all"]),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int, default=0, help="只跑某一條產線（1~4）")
    ap.add_argument("--limit", type=int, default=0,
                    help="產線 2/3 只處理前 N 首（0 = 全部；全部 126 首會產出幾 GB 圖）")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    overall = True
    for no, script, title, extra in LINES:
        if args.only and args.only != no:
            continue
        print("")
        print("#" * 66)
        print("# 產線 %d：%s" % (no, title))
        print("#" * 66)
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        cmd = [sys.executable, os.path.join(here, script)] + extra
        if args.limit and no in (2, 3):
            cmd += ["--limit", str(args.limit)]
        r = subprocess.run(cmd, cwd=here, env=env)
        overall = overall and (r.returncode == 0)

    print("")
    print("=" * 66)
    print("四條產線總結：%s" % ("全部通過" if overall else "有產線未通過，詳見上面"))
    print("產出都在：%s" % common.OUT_ROOT)
    print("=" * 66)
    sys.exit(0 if overall else 1)


if __name__ == "__main__":
    main()
