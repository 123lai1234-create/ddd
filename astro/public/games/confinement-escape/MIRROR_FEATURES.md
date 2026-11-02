# 鏡像版專屬功能（MIRROR FEATURES）

> 這些功能**只存在於本站鏡像**（`astro/public/games/confinement-escape/index.html`），
> 不在上游 `gagatim/confinement-escape-text`。
> 日後從上游同步時，同步會覆蓋 `index.html`，以下改動必須**手動重套**。
> 所有新增程式碼都用 `/* ===== MIRROR FEATURE: <名稱> ===== */` 註解包起來，
> 同步時可用 `grep "MIRROR FEATURE" index.html` 列出全部改動點。

## A. 每日任務系統（DAILY QUESTS）

- 位置：主頁每日登入獎勵面板下方（`viewHome()` 裡 `${dailyQuestPanel()}`）。
- 內容：每天 3 個任務——完成 1 次遠征、競技場勝利 1 次、招募 1 次；
  每個任務獎勵 🪙150，三項全完成可再領 💎突破石×2。每天依日期重置。
- 日期邏輯：沿用 `dateStr()`（與每日登入獎勵、合作討伐同一套）。
- 掛鉤點：
  - `doPull()`：`SAVE.pulls += n` 後呼叫 `dailyQuestProgress("gacha")`（一次招募操作計 1 次，不論單抽或十連）。
  - `startArena()` 的 `onEnd` 勝場分支：`SAVE.stats.arenaWins++` 後呼叫 `dailyQuestProgress("arena")`。
  - `endRun()`：結算帶回金條前呼叫 `dailyQuestProgress("run")`（逃出或全滅都算完成一次遠征）。
- 函式：`dailyQ()`（取用／隔日重置）、`dailyQuestProgress(id)`、`claimDailyQuest(id)`、
  `claimDailyQuestBonus()`、`dailyQuestPanel()`；常數 `DAILYQ_DEFS`、`DAILYQ_GOLD=150`、`DAILYQ_ALL_STONE=2`。
- 存檔欄位：`SAVE.dailyq = {d, run, arena, gacha, claimed}`，`migrate()` 會為舊存檔補預設值。
  `packSave()` 是全量序列化（無白名單），欄位會跟著存檔走。

## B. 主線第 16 章「最後一頁」（CHAPTER 16）

- 章節資料：`CHAPTERS[15]`（插在深淵前面），名稱「最後一頁」、圖示 🪶、
  地圖 `FLOORS_LAST`（`mkFloors("M", …)`，M1 未寫完的走廊 → M14 終章之間）、
  小怪沿用抹除者（`eraser`）、魔王沿用編輯者（`editor`，`bossScale 2.15`、`bossHp n => 200 + n*44`）、
  同伴沿用阿燼與晴（`mates: ["ashen", "qing"]`）、`noSeats: true`。
- 房間名／事件對應（`ROOM_NAME`、`ROOM_EV`）：
  魔王房叫「終章之間」→ `helipad`；準備房叫「未寫完的桌子」→ `gene`；
  出生房「未寫完的走廊」→ `morgue`；「殘頁之間」「墨水池」「提燈之間」→ `shade`。
  ⚠️ 魔王房**不能**叫「最後一頁」：`ROOM_EV` 已把「最後一頁」對應到第 14 章的晴劇情（`qing2`），
  叫同名會走到晴劇情而不是魔王戰。
- 通關成就：`ACH` 的 `ch16`（通關第 16 章，💎突破石×14），`checkAch()` 自動發放。
- 通關獎勵角色：`CARDS.oldking`「老國王」（SSR、劇情角色、`gachaCh: 16`，通關第 16 章後進入招募池；
  美術用 👑 emoji，不新增立繪）。技能「守夜人的提燈」（全體防禦+3 三回合＋各回 10% 生命）；
  被動「守夜」在 `battleLoopInner()` 每回合開始時特判實作（比照阿燼／晴被動的特判模式），
  生命最低的隊友恢復 5% 最大生命（至少 2）。
- 首通獎勵：`FIRST_CLEAR[15] = 500`；強度倍率：`CH_POW[15] = 2.15`。
- 劇情文案：章節 `intro`／`shade`／`prep`／`bossLines`／`story`／`recap`／`finale`／`escape` 皆為鏡像原創，
  接續第 15 章《名冊》劇情（晴寫下所有人的名字、老國王交棒）。

### ABYSS 哨兵後移（重要）

- 原本 `ABYSS = 15`（章節索引 0–14 是主線 1–15 章，15 號是深淵，16–20 號是肥宅物語）。
  第 16 章插在深淵前面後，深淵移到 16 號、肥宅物語移到 17–21 號，因此 `ABYSS` 改為 `16`。
- 大部分判斷用 `ABYSS` 常數，會自動跟著走：章節選單、深淵音樂／機制、首通訊息、
  「下一目標」提示、主線全破判定、`validSave` 的進度範圍、`CHAPTERS.slice(12, ABYSS)` 的名冊故事區。
- `migrate()` 新增 `chv < 8` 遷移：舊存檔進行中的深淵遠征（`run.ch`／`runCk.ch` 為 15）改成 16；
  主線第 15 章進行中的遠征（`ch = 14`）不受影響。
- **刻意不跟著移的兩個門檻**（避免舊玩家權益倒退）：
  - `FATTY_REQ` 固定為 `15`：肥宅物語維持通關 15 章開放，否則已通關 15 章的玩家會被鎖住肥宅物語。
  - `FIVE_REQ` 固定為 `15`：5 人出戰維持通關 15 章開放，否則已通關 15 章的 5 人隊伍會被
    `validSave()` 判定「隊伍資料異常」而**清空存檔**。
- 舊玩家行為變化（符合預期）：`cleared = 15` 的玩家不再顯示「主線全破」，下一目標改為第 16 章；
  通關第 16 章後才算全破、才算 5 人出戰以外的「全部」條件（`fiveOk` 除外，見上）。

## C. 強化保底（ENHANCE PITY）

- 規則：每次強化失敗累積 +5% 成功率加成（`SAVE.enhBonus`，上限 +25%），下次強化計入；
  超頻區（目前等級 +10 以上，即衝 +11～+20）加成減半計算（無條件捨去）；成功後歸零。
- 顯示：強化面板成功率旁顯示「🍀 手氣加成 +X%」，下方有規則說明；失敗訊息會寫目前累積加成，成功訊息會寫加成已歸零。
- 位置：`enhBonusNow(g)`（計算當次適用加成）、`openEnhance()`（面板顯示）、
  `doEnhance()`（成功率計算與結算；結算在 `save()` 之前）。
- 存檔欄位：`SAVE.enhBonus`（整數，`migrate()` 為舊存檔補 0），跨重整保留；
  `packSave()` 全量序列化，無白名單問題。

## 日後上游同步時如何重套

1. 先同步上游檔案（照舊流程：轉 mp3、加 `<base href>`、lazy loading、右上角按鈕等在地化調整）。
2. `grep "MIRROR FEATURE" index.html` 會列出本份文件對應的全部改動點——目前共 14 處標記
   （含 ABYSS 哨兵、FIVE_REQ／FATTY_REQ 解耦、遷移區塊在內）。
3. 依 A／B／C 三節把程式碼區塊、章節資料、卡片、成就、房間名對應逐一貼回；
   特別注意 B 節的哨兵與門檻解耦，漏了 `FIVE_REQ` 會造成舊玩家存檔被清空。
4. 重套後跑驗證：抽出 inline `<script>` 用 `node --check` 檢查語法；
   並確認 `CHAPTERS[15]` 為「最後一頁」、`CHAPTERS[16].abyss` 為真、`ABYSS === 16`。
