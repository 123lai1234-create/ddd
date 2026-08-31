import os, sys, json, re, shutil
import opencc
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# T2T = 簡體→繁體，採用中國大陸習慣（兩岸詞彙轉換）
converter = opencc.OpenCC('s2t')

TRACKS_JSON = "D:/project/astro/public/music/tracks.json"
MUSIC_DIR = "D:/project/astro/public/music"

def convert_text(text):
    if not text:
        return text
    return converter.convert(text)

def is_simplified(text):
    """檢查字串是否含簡體中文"""
    simplified_chars = set('万与丑专且东丝丢两严丧个临丽举义乌乐习乡书买乱了吗义之乌乍于乏'
                           ' MarzLadvance周围缠绕贝内冈凤办劝午又卫叉吗土垒塑'
                           ' 节术两头丢並丐丑专且世丘丙业丛东丝丞丢两严丧个临丽'
                           ' 丽丸么临丸丹主乍乏乒乓乒乓义勇，乔'
                           ' 网贝讪讥扌扎址坂坍坝坊坎坏坐坑块坠坠声壴夏夕外多夜够'
                           ' 大天太夫头夸夹夺奋妆妆妇妈好戏羽欢观现约麦购进远连迟里'
                           ' 针钓钮闲间闷陆陈转轮软轰轻鸦鸭鸪诗诚话诞诬诱诲语贼宾'
                           ' 贾资赋赶赵赵钞钟钢钦钧钩钮间阔阎阐队阶阳阴阵饱饰饥饭饮'
                           ' 馆馋驱验骏鲍鲜龟龙龚龚龟')
    return any('\u4e00' <= c <= '\u9fff' and c in simplified_chars for c in text)

def convert_lrc_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    converted = []
    changed = False
    for line in lines:
        # 只轉換非時間戳的純文字部分（[mm:ss.xx] 之後的內容）
        m = re.match(r'^(\[ti:|\[ar:|\[al:|\[by:|\[offset:|\[length:)(.*)(\])$', line)
        if m:
            prefix, content, suffix = m.group(1), m.group(2), m.group(3)
            new_content = convert_text(content)
            if new_content != content:
                changed = True
                converted.append(prefix + new_content + suffix + "\n")
            else:
                converted.append(line)
        elif re.match(r'^\[\d{2}:\d{2}\.\d{2}\]', line):
            # 時間戳行：找到第一個 ] 的位置，]之後是歌詞文字
            idx = line.index(']') + 1
            prefix = line[:idx]
            lyric_part = line[idx:]
            new_lyric = convert_text(lyric_part.rstrip("\r\n"))
            if new_lyric != lyric_part.rstrip("\r\n"):
                changed = True
            converted.append(prefix + new_lyric + "\n")
        else:
            converted.append(line)

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(converted)
        return True
    return False

# --- 主程式 ---
with open(TRACKS_JSON, "r", encoding="utf-8") as f:
    data = json.load(f)

fixed_tracks = 0
fixed_lrcs = []

# 轉換 tracks.json 裡的所有文字欄位
for track in data["tracks"]:
    for field in ["title", "artist", "album"]:
        if track.get(field):
            original = track[field]
            converted = convert_text(original)
            if converted != original:
                print(f"  tracks.json [{field}]: {original} → {converted}", flush=True)
                track[field] = converted
                fixed_tracks += 1

# 轉換所有 LRC 檔
for fname in os.listdir(MUSIC_DIR):
    if not fname.endswith(".lrc"):
        continue
    fpath = os.path.join(MUSIC_DIR, fname)
    changed = convert_lrc_file(fpath)
    if changed:
        fixed_lrcs.append(fname)
        print(f"  LRC: {fname}", flush=True)

# 寫回 tracks.json
with open(TRACKS_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\n完成: tracks.json 改動 {fixed_tracks} 處, LRC 改動 {len(fixed_lrcs)} 個檔案")
print("LRC 改動:", fixed_lrcs)
