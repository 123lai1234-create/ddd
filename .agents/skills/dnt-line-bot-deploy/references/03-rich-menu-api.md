# LINE Rich Menu API（細節）

## 升級需求

LINE Rich Menu API（create / link / setDefault rich menu）需要 **verified 或 premium** channel：

```
400 invalid channel
或
403 forbidden
```

對 unverified / free channel。

## 升級流程

### 1. LINE Official Account Manager

```
https://manager.line.biz/
```

登入 → 右上「設定」→ 「帳號設定」

### 2. 升級選項

| 類型 | 費用 | Rich Menu API | 訊息 quota |
|---|---|---|---|
| Unverified (Free) | 0 | ❌ | 500 則/月 |
| Light | $0–$15 USD/月 | ✅ | 15,000 則/月 |
| Standard | ~$45/月 | ✅ | 45,000 則/月 |
| Premium | ~$200/月 | ✅ | 200,000 則/月 |

**Light 方案就夠** 一般小型 bot 用。

### 3. 升級步驟

1. 設定 → 帳號升級
2. 選 Light / Standard / Premium
3. 付款方式（信用卡）
4. 等 LINE 審核（通常 1-3 天）

## Rich Menu 結構

每個 Rich Menu 包含：

- **Menu bar**（底部選單列）— 寬 2500px / 高 843px（標準）或 2500×1686（兩列）
- **Tap areas**（點擊區域）— 在 menu bar 內定義，最多 20 個
- **Image**（背景圖）— JPEG/PNG，2500×843 / 2500×1686

## Rich Menu API

### Create Rich Menu

```js
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

const richMenu = await client.createRichMenu({
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'main-menu',
  chatBarText: '選單',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', text: '個股' },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', text: 'ETF' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'uri', uri: 'https://donttalk.vercel.app/' },
    },
  ],
});
// → richMenuId
```

### Upload Image

```js
import { readFileSync } from 'node:fs';

await client.setRichMenuImage(richMenuId, Buffer.from(readFileSync('menu.png')), 'image/png');
```

### Link to User

```js
await client.linkRichMenuToUser(userId, richMenuId);
```

### Set Default

```js
await client.setDefaultRichMenu(richMenuId);
```

## 開發期手動上傳（無 API 也能用）

如果 channel unverified 但要測試 rich menu：

```
LINE Official Account Manager
  → 首頁
  → 增設 Rich Menu
  → 建立（手動填 areas + upload image）
  → 設為預設 / link 給 user
```

這個 UI 流程**不需要** Rich Menu API。

## Rich Menu alias

Verified channel 可用 alias（字串名稱）替代 richMenuId：

```js
await client.linkRichMenuToUser(userId, 'main-menu-alias');
```

比 UUID 易管理。

## Bulk 操作

```js
// 批次 link 給多 user（quota 內）
const userIds = await getAllFollowers();
for (const userId of userIds) {
  await client.linkRichMenuToUser(userId, mainMenuId);
}
```

`getAllFollowers()` 要分頁拿：

```js
let cursor;
const allIds = [];
do {
  const followers = await client.getFollowers(cursor, 1000);
  allIds.push(...followers.userIds);
  cursor = followers.next;
} while (cursor);
```

## 圖片設計工具

- **Figma** — 2500×843 template
- **Canva** — LINE Rich Menu template
- **Adobe XD / Photoshop** — 客製

## 動態切換（依 user 行為）

```js
// user 點「個股」→ 切到個股 submenu
async function switchToStockMenu(userId) {
  await client.linkRichMenuToUser(userId, stockMenuId);
}
```

兩個 rich menu 之間切換：main → stock → back。user 體驗更順。

## 圖片 cache

LINE 對 rich menu image cache **24 小時**。改完 image 後 24h 內 user 看到舊的。

**debug 技巧**：
- 改 image hash（`menu.png?v=2`）
- 或用 alias 切到新 menu
- 或 unlink + re-link

## 配額

| Channel 類型 | Rich Menu 數量上限 |
|---|---|
| Unverified | 0 |
| Verified (Light+) | 1000 |
| Premium | 無限 |

## 替代：Flex Message

如果只是要「選單」UI，可以用 Flex Message 替代 Rich Menu：

```js
await client.pushMessage(userId, {
  type: 'flex',
  altText: '選單',
  contents: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'button', action: { type: 'message', label: '個股', text: '個股' } },
        { type: 'button', action: { type: 'message', label: 'ETF', text: 'ETF' } },
        { type: 'button', action: { type: 'uri', label: '網站', uri: 'https://donttalk.vercel.app/' } },
      ],
    },
  },
});
```

Flex Message 不需要 verified channel。
