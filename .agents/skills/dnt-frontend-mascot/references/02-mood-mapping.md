# 6 Mood 觸發時序

## 6 個 mood 對照

| Mood | Y offset | 持續 | 用途 |
|---|---|---|---|
| happy | 0 | 預設 | idle / hover / 完成回覆 |
| sad | -360 | 500ms | 關 panel |
| surprised | -720 | 700ms | 開 panel / reset 對話 |
| angry | -1080 | 600ms | drag start |
| sleepy | -1440 | 600ms | idle blink（隨機 6-10s） |
| curious | -1800 | 直到 done | busy / 等 API |

## 觸發時機詳細

### hover（mouseenter / mouseleave）

```js
sprite.addEventListener('mouseenter', () => {
  if (currentMood === 'happy' || currentMood === 'sleepy') {
    setMood('happy', 0);  // 持續
  }
});
```

hover 不主動觸發 mood 切換（保持 happy），但清掉 blink 計時器。

### open panel

```js
function openPanel() {
  panel.classList.add('open');
  setMood('surprised', 700);  // surprised 700ms 後回 happy
  // 期間 user 可能 hover / 開始打字
}
```

### close panel

```js
function closePanel() {
  panel.classList.remove('open');
  setMood('sad', 500);  // sad 500ms 後回 happy
}
```

### drag 浮動按鈕

```js
let dragStartTime = 0;
sprite.addEventListener('pointerdown', () => {
  dragStartTime = Date.now();
  setMood('angry', 600);  // drag 完成或 600ms 後回 happy
});
sprite.addEventListener('pointerup', () => {
  if (Date.now() - dragStartTime < 100) {
    // 短 tap = click，開 panel
    openPanel();
  }
  // long drag = 移動位置，angry 已自動回 happy
});
```

### 等 API（busy）

```js
async function sendMessage(msg) {
  setMood('curious', 0);  // 持續直到 done
  try {
    const res = await fetch('/api/chat', { /* ... */ });
    const data = await res.json();
    setMood('happy', 0);
    return data;
  } catch (e) {
    setMood('sad', 0);  // 錯誤顯示 sad
    throw e;
  }
}
```

### idle blink（隨機）

```js
let blinkInterval;
function startBlinkLoop() {
  blinkInterval = setInterval(() => {
    if (currentMood === 'happy') {  // 只在 idle 時 blink
      setMood('sleepy', 600);
    }
  }, 6000 + Math.random() * 4000);  // 6-10s 隨機
}
function stopBlinkLoop() {
  clearInterval(blinkInterval);
}
```

### reset 對話

```js
function resetConversation() {
  setMood('surprised', 700);
  conversation = [];
  renderMessages();
}
```

## 優先級規則

當多個觸發同時發生（例：drag 結束時 user 點 open panel）：

1. **last-write-wins**：最新 setMood 蓋掉前一個
2. **autoMs 累加問題**：如果前一個 mood 還在 autoMs 倒數，新 mood 設進去會把舊的 setTimeout 留下來，可能 race

解法：用 mood ID 防止 race：

```js
let moodId = 0;
function setMood(name, autoMs = 0) {
  const id = ++moodId;
  sprite.style.backgroundPosition = `0px ${MOOD_Y[name]}px`;
  currentMood = name;
  
  if (autoMs > 0) {
    setTimeout(() => {
      if (id === moodId) {  // 沒被新 mood 蓋掉才執行
        setMood('happy', 0);
      }
    }, autoMs);
  }
}
```

## 效能考量

`background-position` 切換在現代瀏覽器是 GPU 加速（composite layer），不會 reflow。但：

- 6 個 frame 都載入記憶體（957 KB PNG 解碼 ~ 10 MB RGBA）
- 切換是即時的（< 1ms），無延遲

如果在意記憶體，可以把 sprite 拆成 6 個獨立 `<img>` + opacity 切換（但複雜度 ↑）。

## 對比 3D 版本的 mood

3D chibi-3d.js 沒有 sprite sheet 的「直接切 frame」對應，而是：

| Mood sprite | 3D view |
|---|---|
| happy | front → side 短動畫 |
| sad | 頭低 + side |
| surprised | 頭抬高 + front |
| angry | 頭偏 + side |
| sleepy | 頭微低 + front |
| curious | 頭偏 + back |

實作上 3D 版本用 Three.js Object3D rotation：

```js
function setMood(name) {
  const target = {
    happy: { rx: 0, ry: 0, rz: 0 },
    sad: { rx: -0.3, ry: 0, rz: 0 },
    surprised: { rx: 0.4, ry: 0, rz: 0 },
    angry: { rx: 0, ry: 0.5, rz: 0.1 },
    sleepy: { rx: -0.2, ry: 0, rz: 0 },
    curious: { rx: 0, ry: -0.5, rz: 0 },
  }[name];
  
  // 平滑過渡
  head.rotation.x += (target.rx - head.rotation.x) * 0.1;
  head.rotation.y += (target.ry - head.rotation.y) * 0.1;
  head.rotation.z += (target.rz - head.rotation.z) * 0.1;
}
```

## CSS animation 補充

除了 mood 切換，還可以加：

```css
.kawaii-sprite {
  /* 浮動效果 */
  animation: float 3.2s ease-in-out infinite;
  
  /* 點擊 pulse */
}
.kawaii-sprite:active {
  transform: scale(0.95);
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
```

`float` 3.2s 週期跟 mood 切換無關，兩者獨立。

## 監聽 / 自訂事件

如果其他組件要 trigger mood（不是 chatbot 內部）：

```js
// 自訂 event bus
document.dispatchEvent(new CustomEvent('mascot:mood', { detail: { mood: 'happy', autoMs: 0 } }));
document.addEventListener('mascot:mood', (e) => {
  setMood(e.detail.mood, e.detail.autoMs);
});
```

例：背景音樂播完觸發 `mascot:mood { mood: 'happy' }`。
