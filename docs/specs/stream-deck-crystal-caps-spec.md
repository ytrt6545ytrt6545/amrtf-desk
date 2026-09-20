# 專案技術規格書: Stream Deck 3D 透光水晶鍵帽與嵌入式 LCD 液晶操作艙升級 (SPEC-005)

> 文件代號：`SPEC-005-stream-deck-crystal-caps`  
> 建立日期：2026-09-20  
> 依據共識：`/grill-me` 雙方 4 項前沿決策（1.A 專注手機與模擬器 / 2.A 嵌入式 LCD 視窗 / 3.B 極致三維機械開關 / 4.A 居中發光圖示 + 底部微字）

---

## 1. 問題陳述 (Problem Statement)
* **扁平化視覺疲勞與誤觸風險**：目前手機 4×8 畫布與電腦端手機模擬器採用現代扁平漸層（Flat Gradient）與細邊框，在手機觸控高壓現場操作時，視覺缺乏實體按鍵的邊界「凹槽感知」與「凸起觸感」，容易產生按鍵盲操的不確定感。
* **缺乏實體硬體沉浸感**：長官期望行動端能高度還原廣播直播界標竿 —— **Elgato Stream Deck XL** 的頂級手感：具有晶瑩剔透的 3D 透光壓克力弧面水晶鍵帽、沉雕金屬槽座、內嵌高飽和 LCD 背光液晶螢幕、以及按下時的物理段落感。

---

## 2. 解決方案 (Solution Overview)
全面升級 **行動端 4×8 網格畫布 (`web-remote.js`)** 與 **電腦端 1:1 手機模擬器抽屜 (`mobile-studio-drawer.js` / `desk.css`)** 的按鈕視覺與交互系統：
1. **純 CSS 向量水晶鍵帽（0 圖片依賴、60fps 零延遲）**：
   - **外框底座**：沉雕深色金屬凹槽（Recessed Bezel Housing），形成按鈕鑲嵌在面板槽內的深邃立體感；
   - **水晶鍵帽本體**：高對比發光色（極光藍、影片亮黃、急煞亮紅、循環紫、黑曜石黑），疊加 `box-shadow` 內雙層高光與厚度倒角；
   - **拋物弧面反光罩 (`::before`)**：頂部 42% 漸層弧形高光反射，模擬凸面水晶壓克力的物理光澤。
2. **Stream Deck 經典圖文排版**：
   - 居中 **`24px~28px` 巨型高對比立體符號**（Icon / Glyph）；
   - 底部 **`10px~11px` 半透明微型液晶標籤**（Micro Label，`letter-spacing: 0.5px`）。
3. **極致三維機械微動按壓（Tactile Micro-Switch Feedback）**：
   - `:active` 時物理下沉 `translateY(2px) scale(0.96)`、外凸轉為內陷深陰影、光罩透明度偏移；
   - 行動端支援 `navigator.vibrate?.(15)` 觸覺微震動。
4. **嵌入式 LCD 液晶監視艙（起訖模組 4×2 與提詞機 4×3）**：
   - 外圍包覆與水晶鍵相同的黑鉻沉雕外框與防眩光深色玻罩；
   - 內部選單與時間文字以高對比螢光墨綠／賽博藍液晶字體渲染。

---

## 3. 使用者故事與驗收情境 (User Stories & Scenarios)
1. **情境 1：手機端真機盲按體驗**  
   作為現場音訊操作員，在手機端開啟遙控頁面時，能看到整面 32 格宛如一台實體 Elgato Stream Deck XL 亮起，手指按壓任意水晶鍵時，按鍵即時下沉 2px、光影收縮並伴隨指尖微震，放開後彈回，達成 100% 盲按確認感。
2. **情境 2：電腦端真機預覽操控**  
   作為導播員，在電腦主控台打開「📱 手機編排」並切換為「🎮 真機預覽操作」時，模擬框呈現 1:1 等比縮小的水晶按鍵，以滑鼠點擊任意鍵帽即刻體驗機械下沉與放映艙即時聯動。
3. **情境 3：起訖模組與提詞機的硬體一體感**  
   操作員在畫布加入「起訖區間模組」或「提詞機」時，兩者呈現出如同專業工控台嵌入的 LCD 液晶監視器，與周圍的水晶鍵完美融為一體，無視覺割裂。

---

## 4. 架構與實作決策 (Implementation Decisions)

### 4.1 CSS 水晶鍵帽層次模型 (Layering Architecture)
```
┌─────────────────────────────────────────────────────────────┐
│ .grid-btn-housing / .mock-item-housing (外層金屬沉雕槽)     │
│  background: linear-gradient(145deg, #252a34, #0e1117);    │
│  box-shadow: inset 0 2px 4px rgba(0,0,0,0.8),               │
│              0 1px 0 rgba(255,255,255,0.08);                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ .grid-btn-crystal (內層壓克力水晶鍵帽)                  │  │
│  │  border-radius: 11px; position: relative;            │  │
│  │  box-shadow: inset 0 1.5px 1.5px rgba(255,255,255,0.7),│  │
│  │              inset 0 -3px 6px rgba(0,0,0,0.6);        │  │
│  │  ::before (頂部拋物弧面反光罩):                         │  │
│  │    height: 42%; border-radius: 9px 9px 50% 50%;       │  │
│  │    background: linear-gradient(to bottom, ...);       │  │
│  │                                                       │  │
│  │  .btn-glyph: 居中 24px 立體符號 (如 ▶, ⏹, 🎬)         │  │
│  │  .btn-label: 底部 11px 發光微文字 (如 播放/暫停)       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 色彩配置字典 (Color Matrix)
* **核心播控 (Play/Pause)**: 極光深藍 (`#0d47a1` ➔ `#1976d2`)，背光青藍光暈。
* **急煞停止 (Stop)**: 警示高亮紅 (`#b71c1c` ➔ `#e53935`)，背光紅光暈。
* **影片播放 (Videos)**: 亮琥珀黃 (`#ff8f00` ➔ `#ffb300`)，黑符號高對比。
* **循環/段落 (Loop/Interval)**: 霓虹紫 (`#4a148c` ➔ `#8e24aa`)。
* **關閉影片/一般鍵 (Close/Utility)**: 黑曜石炭黑 (`#1e222b` ➔ `#2c323f`)。

### 4.3 按壓動態與觸覺響應 (Press Micro-Interaction)
```css
.grid-btn-crystal:active {
  transform: translateY(2px) scale(0.96);
  box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.4);
}
.grid-btn-crystal:active::before {
  opacity: 0.35; /* 光影因按壓角度改變而收斂 */
}
```

### 4.4 嵌入式 LCD 液晶監視艙 (Monitor Widget Treatment)
* `.widget-interval-box` 與 `.widget-teleprompter-box`：
  - 邊框採用黑鉻 2px 倒角，內部背景為深邃黑 `#080a0f`；
  - 頂部覆蓋細微防眩光玻璃橫紋漸層（Subtle Scanlines / Matte Overlay）；
  - 下拉選單與計時數字維持廣播級高對比螢光綠 `#00e676` 與青藍 `#00e5ff`。

---

## 5. 測試策略與驗證接縫 (Testing Strategy)
* **測試接縫 (Seams)**：
  - 驗證 `web-remote.js` 產出的按鈕 HTML 結構是否包含 `.grid-btn-crystal`、`.btn-glyph` 與 `.btn-label`；
  - 驗證 `mobile-studio-drawer.js` 模擬框按鈕是否具備同款水晶樣式；
  - 驗證 `tests/test-mobile-layout-store.mjs` 與 `tests/test-e2e-api-sync.mjs` 佈局資料結構完全不變（純視覺與排版升級，不破壞既有資料庫格式）；
  - 瀏覽器快照與實機 DOM 結構驗收。

---

## 6. 不在範圍內 (Out of Scope)
* **電腦端 Desk 主控台混音操作艙按鈕**：依決策 Q1.A，主控台的 24 等分混音台操作按鈕維持現有廣播調音台設計，不換為 Stream Deck 水晶鍵帽，保持主客分明。
* **自訂圖示上傳功能**：圖示目前由系統預設字典提供，不在本期開放使用者上傳自訂 PNG。

---

## 7. 後續指引 (Next Steps)
本規格書已定稿。長官可下達指令：
1. 輸入 **`/to-tickets`**：將此規格書拆解為垂直切片微型工單（Tickets）。
2. 輸入 **`請開始製作`**：跳過拆解直接進入實作，首席架構師將全面落地代碼並完成驗收！
