# 專案技術規格書: AMRTF-Desk 行動端 4 × 8 自訂畫布與主控模擬器 (Mobile 4x8 Canvas & Studio Simulator)

> 文件版本：v1.0.0  
> 建立日期：2026-09-20  
> 狀態：已定稿 (Ready for Tickets)  
> 關聯前線：`projects/amrtf-desk`

---

## 1. 問題陳述 (Problem Statement)
* **手機端空間失衡與按鈕受限**：目前 AMRTF-Desk 行動端（`/mobile`）僅具備 6 顆固定按鈕，無法執行換講次、播稿、持續捲動或段落循環等電腦端具備的進階操作。
* **虛擬導航列與安全區切字**：行動端使用 `100vh`，導致最底層「師父開示逐字提詞機」遭 Android / iOS 虛擬導航列嚴重切字遮擋。
* **版面僵化不可調**：各導播人員之握持手勢與現場需求互異（有人需要巨型播放鍵，有人需要巨型提詞機），缺乏客製化按鈕尺寸與排版的彈性。

---

## 2. 解決方案 (Solution Overview)
* **電腦端 1:1 手機模擬編排艙 (Mobile Studio Drawer)**：於主控台頂部新增一鍵喚出的半透明抽屜，以 1:1 真實比例模擬直向手機視窗，採用 **4 欄 × 8 列（32 格）** 磁吸格點畫布，右側附帶元件庫存盒（Toolbox），支援滑鼠拖曳、尺寸拉伸與智慧推擠。
* **全介面元素積木化 (All-Widget Architecture)**：所有控制鍵、講次時鐘與「師父開示逐字提詞機」全面抽象為可拖曳 Widget，允許自由調整跨欄跨列（如 4×2 提詞機、2×2 主控播放鍵）。
* **動態滿版與系統安全區自適應**：手機端全面採用 CSS `100dvh` 與 `grid-template-columns: repeat(4, 1fr)`、`grid-template-rows: repeat(8, 1fr)`，搭配 `env(safe-area-inset-bottom)`，達成 0 黑邊、0 捲軸、絕不切字。
* **50ms 零閃爍 WebSocket 即時熱推播**：電腦端放開滑鼠立即自動持久化至伺服器端 JSON，並廣播信令通知手機端無縫平滑重排，不中斷當前音訊與播放進度。

---

## 3. 使用者故事與驗收情境 (User Stories & Scenarios)
1. **作為導播人員**，我希望能於電腦端主控台滑出手機模擬器，自由將按鈕拖入 4×8 畫布中並拉伸成 2×2 大小，以便為現場打造專屬的握持按鍵佈局。
2. **作為手機端使用者**，當電腦端調整好版面後，我的手機畫面能在不重新載入網頁的情況下即時重排，且最底部的逐字字幕不會被手機系統列遮擋。
3. **作為研討主持人**，我希望能將「師父逐字提詞機」拉大成 4×3 巨幅字幕，並將按鈕精簡為 4 顆，以專注於開示字幕閱讀與段落切換。
4. **作為排版操作員**，當我把按鈕拉大撞到相鄰按鈕時，系統能自動推擠（Auto-Reflow）相鄰按鈕至下一空格，避免繁瑣的手動逐一搬移。

---

## 4. 架構與實作決策 (Implementation Decisions)

### 4.1 模組劃分與職責（Deep Modules）
1. **`src/desk/modules/mobile-studio-drawer.js`（新模組 - 手機模擬編輯艙）**：
   - 封裝 1:1 手機框 DOM、4×8 CSS Grid 畫布、右側按鈕庫存盒（Arsenal Drawer）；
   - 處理 HTML5 Drag & Drop、懸浮 `⤡` 拉伸把手與快捷尺寸膠囊（1×1, 2×1, 2×2, 4×1, 4×2）；
   - 實作智慧碰撞推擠演算法（Auto-Reflow Engine）與滿格邊框震動熔斷保護。
2. **`src/server/mobile-layout-store.js`（新模組 - 版面持久化與推播中樞）**：
   - 管理 `data/mobile-layout.json` 的讀取、寫入與結構校驗；
   - 內建「預設精簡 6 鍵模板」與「全功能導播模板」；
   - 透過現有 WebSocket 廣播 `MOBILE_LAYOUT_UPDATED` 輕量信令。
3. **`src/server/web-remote.js` 與 `src/mobile/mobile-deck.js`（升級模組 - 行動端重構）**：
   - 引入 `100dvh` 與 4×8 CSS Grid，徹底移除舊版寫死之 6 按鈕 HTML；
   - 監聽 `MOBILE_LAYOUT_UPDATED` 事件，平滑套用新格點座標與 Widget 渲染；
   - 底層提詞機模組化為獨立 Widget，內建 WebKit 捲動與安全區防護。

### 4.2 資料流與 API 協定
#### 佈局持久化結構 (`data/mobile-layout.json`)
```json
{
  "version": "1.0.0",
  "updatedAt": 1789899000000,
  "grid": { "cols": 4, "rows": 8 },
  "items": [
    { "id": "header-info", "type": "widget", "col": 1, "row": 1, "w": 4, "h": 1 },
    { "id": "btn-play", "type": "button", "col": 1, "row": 2, "w": 2, "h": 2, "action": "play" },
    { "id": "btn-stop", "type": "button", "col": 3, "row": 2, "w": 2, "h": 2, "action": "stop" },
    { "id": "btn-backward", "type": "button", "col": 1, "row": 4, "w": 2, "h": 1, "action": "seek_bwd" },
    { "id": "btn-forward", "type": "button", "col": 3, "row": 4, "w": 2, "h": 1, "action": "seek_fwd" },
    { "id": "widget-teleprompter", "type": "widget", "col": 1, "row": 7, "w": 4, "h": 2 }
  ]
}
```

#### WebSocket 信令推播
- 信令名稱：`{"type": "mobile_layout_update", "payload": { ... }}`
- 手機端響應：Diff 比對目前 DOM，以 `requestAnimationFrame` 平滑微調位置，維持當前播放 state 與音訊不中斷。

---

## 5. 測試策略與驗證接縫 (Testing Strategy)

### 5.1 測試接縫 (Seams)
* **REST / WebSocket 契約接縫**：驗證 `GET /api/mobile-layout` 與 `POST /api/mobile-layout` 之 JSON 結構完整性。
* **格點碰撞推擠純函數接縫 (`resolveReflow(grid, movingItem, targetRect)`)**：撰寫單元測試覆蓋「空格置放」、「重疊推擠」、「連續骨牌推擠」與「畫布滿格阻斷」。
* **Win32 HWND / CDP 視覺快照接縫**：以特權 CDP 啟動手機模擬視窗與行動端視窗，截圖驗證 `100dvh` 安全區與 32 格無黑邊滿版。

### 5.2 驗收標準 (Acceptance Criteria)
- [ ] 電腦端主控台右上角點擊 `📱 手機編排` 能在 200ms 內平滑滑出手機編輯抽屜。
- [ ] 支援從右側庫存盒拖曳任意按鈕進 4×8 畫布，且右下角把手可將按鈕拉大為 2×2 / 4×1 / 4×2。
- [ ] 模擬器中放開滑鼠後，伺服器端 `data/mobile-layout.json` 於 20ms 內完成落盤。
- [ ] 已開啟的手機 `/mobile` 端於 50ms 內收到推播並自動重新排版，無需手動重新載入頁面。
- [ ] 手機端 iPhone / Android 虛擬導航列不再裁切最後一行提詞文字。

---

## 6. 不在範圍內 (Out of Scope)
* **手機端本體手指直接拖曳排版**：依據 Q1 共識，手機端維持純淨遙控放映態，不包含手機上的手指編輯模式以杜絕現場誤觸。
* **跨專案版面雲端多租戶同步**：本次僅限本地局域網即時持久化與同步，不涉及外網使用者帳號雲端同步。

---

## 7. 後續指引 (Next Steps)
本規格書已固化。長官可接續指示：
1. 輸入 **`/to-tickets`**：將此規格書自動拆解為鐵三角特遣工單（垂直切片 Micro-Tickets）；
2. 或直接指示 **「請開始製作／動手」**：立即率領特遣隊啟動實作！
