# 專案技術規格書: 大慈恩官網 (AMRTF) 獨立雙視窗播控艙 (SPEC-004)

* **文件編號**：SPEC-004-amrtf-desktop-controller
* **建立日期**：2026-09-17
* **負責架構師**：Antigravity (首席架構師)
* **規格依據**：`/grill-me` 雙輪反向拷問共識 (Round 1 & Round 2 · 100% 裁定清空)

---

## 1. 問題陳述 (Problem Statement)

現行開源專案 `companion-module-amrtf-website` 透過「Chrome 擴充套件 + Companion 模組」實現實體按鍵遠端遙控大慈恩官網（amrtf.org），在通訊邏輯上驗證了可行性，但對現場研討操作員與志工而言面臨嚴重的使用體驗瓶頸：

1. **高門檻安裝陷阱**：強迫操作員開啟 Chrome「開發人員模式」、手動翻找資料夾「載入未封裝項目」；且必須在 Companion 網頁後台手動匯入 `.tgz` 模組包，非技術背景學員極易卡關。
2. **主持與放映畫面割裂**：現行方案直接在大慈恩原始網頁上操作，若大螢幕正在向台下觀眾投影手抄稿，操作員點擊暫停、調整倍速或切換分頁時，滑鼠軌跡與選單會直接穿幫暴露在觀眾眼前。
3. **重度依賴特定硬體與軟體**：若現場沒有配備 Elgato Stream Deck 或未安裝 Companion，單靠 Chrome 瀏覽器操作極易發生誤觸；缺乏隨手可得的行動端手把遙控方案。

---

## 2. 解決方案 (Solution Overview)

打造一款單一免安裝、體積極致輕量（<10MB）的 Windows 原生桌面軟體 **`AMRTF-Desk.exe`**（採用 **Tauri + Rust + WebView2** 架構）：

* **完全消滅 Chrome 擴充套件**：內建原生腳本注入引擎，雙擊啟動即可無感託管大慈恩官網，零手動配置。
* **廣播級雙視窗「主客解耦」**：
  - **主控台視窗 (Control Desk)**：操作員專屬工作台，具備巨型 50/50 盲按鍵、LED 碼表、實時手抄稿提詞機（Prompter），並可一鍵折疊為 Mini 懸浮條。
  - **放映副視窗 (Projection Screen)**：純淨無框的大慈恩官網放映艙，自動偵測並獨佔第二螢幕/投影機全螢幕，台下視覺 100% 純淨無穿幫。
* **雙向自適應通訊**：
  - **對外**：維持相容 Companion 原廠 WebSocket（Port 9999），實體 Stream Deck 隨插即用。
  - **對內**：自帶輕量 Mini-Web 遙控伺服器（Port 9998），主控台一鍵彈出 QR Code，手機掃碼即刻化身帶震動反饋的無線觸控手把。

---

## 3. 使用者故事與驗收情境 (User Stories & Scenarios)

1. **極速開箱（學員/志工視角）**：
   - 作為現場義工，我希望能雙擊單一 `AMRTF-Desk.exe` 即可直接進入研討狀態，無需打開 Chrome 擴充功能或安裝任何依賴軟體。
2. **大螢幕純淨投影（台下觀眾視角）**：
   - 作為台下學員，我希望大螢幕/電視牆只看到乾淨的大字手抄稿與前行影片，完全看不到操作員的滑鼠指標、按鈕點擊或視窗切換。
3. **視訊/音訊精準掌控（操作員視角）**：
   - 作為控場操作員，我希望能在主控視窗上邊聽音檔邊看實時滾動的手抄稿文字，並能一鍵跳回師父引文起點或循環播放重點段落。
4. **講者離席無線遙控（主講法師/主持人視角）**：
   - 作為在講台上走動的主持人，我希望能用手機相機掃描操作員螢幕上的 QR Code，直接在手機大按鈕上盲按暫停或倒退 5 秒，無需大聲示意控台。
5. **實體導播台整合（導播師視角）**：
   - 作為專業導播，我希望能繼續使用實體 Stream Deck 按鍵與旋鈕（快進/快退 5 秒、調音量），液晶即時同步時間碼。

---

## 4. 架構與實作決策 (Implementation Decisions)

### 4.1 系統拓撲與處理程序模型

```mermaid
graph TD
    subgraph AMRTF-Desk 原生主進程 (Tauri / Rust)
        CORE[Tauri Runtime & 狀態機]
        WSS_CLI[Companion WS Client<br/>連向 127.0.0.1:9999]
        HTTP_SRV[Mini-Web & WebSocket Server<br/>監聽 0.0.0.0:9998]
        DISPLAY_MGR[Windows 顯示器拓撲管理器]
    end

    subgraph 視窗層 (WebView2)
        WIN_MAIN[視窗 1: 操作主控台<br/>提詞機 / 50-50 巨型按鈕 / QR Code]
        WIN_SCREEN[視窗 2: 大慈恩放映艙<br/>amrtf.org 原生注入 / 純淨投影]
    end

    subgraph 外部設備
        SD[Stream Deck / Companion]
        PHONE[手機 / 平板瀏覽器 (Web Remote)]
        PROJ[外接投影機 / 第二螢幕電視牆]
    end

    SD <-->|TCP/WS 9999| WSS_CLI
    PHONE <-->|HTTP/WS 9998 (QR Code)| HTTP_SRV
    CORE <-->|Tauri IPC (Event)| WIN_MAIN
    CORE <-->|Tauri IPC / EvaluateScript| WIN_SCREEN
    DISPLAY_MGR -->|自動全螢幕獨佔| PROJ
    PROJ --- WIN_SCREEN
```

---

### 4.2 模組劃分與職責

#### 1. 放映艙 (Screen Window · `window_screen`)
* **託管目標**：`https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean/`（支援動態換講次）。
* **無感腳本注入 (`init_script`)**：
  在網頁 Document 建立瞬間自動注入特製 `amrtf-injected.js`（由原 `content.js` 提煉），掛載：
  - `<audio>` 播放、暫停、倍速、跳轉攔截；
  - `timeupdate` 節流回報至 Rust 原生層；
  - 師父引文時間標籤與段落錨點解析（相容全形/半形冒號）；
  - 密集嘛、前行與迴向影片 Modal 喚起，並在關閉時強制執行 `video.pause()` 防止背景漏音。
* **純淨化樣式覆蓋**：自動注入 CSS 隱藏原生多餘導航列，突出正文與大字號排版。

#### 2. 操作主控台 (Control Desk Window · `window_main`)
* **視窗規格**：預設 640x480px，支援一鍵折疊為 480x120px 之 Mini 懸浮條（常駐置頂）。
* **介面三大區塊**：
  - **頂部狀態列**：受控分頁標題、講次號碼、Companion 連線燈號、📱 手機遙控按鈕、🖥️ 投影視窗狀態。
  - **中央提詞區 (Prompter)**：即時高亮呈現當前播放中之手抄稿段落文字，字體清晰醒目。
  - **底部巨型動作列 (50/50 Button Bar)**：
    - 左側 50%：巨型播放/暫停鍵（播放綠、暫停琥珀黃）；
    - 右側 50%：巨型停止鍵（或引文循環切換）；
    - 輔助鍵群：⏪ 倒退 5 秒、⏩ 快進 5 秒、⏮️ 跳至引文起點、🎨 深淺色切換。

#### 3. 智慧雙螢幕拓撲引擎 (Display Topology Manager)
* **自動探測**：啟動時調用 Windows EnumDisplayMonitors API 獲取螢幕清單。
* **拓撲行為**：
  - 若偵測到 2 個（含）以上顯示器：主控台視窗常駐於第 1 螢幕（操作員筆電），放映副視窗自動移動至第 2 螢幕並呼叫 `.set_fullscreen(true)` 獨佔大電視牆。
  - 若僅有 1 個顯示器（單機除錯模式）：兩視窗自動以左右並排（40% 主控台 + 60% 放映艙）排列，確保操作員立即可見兩端狀態。

#### 4. 本地 Mini-Web 遙控伺服器 (Web Remote Server)
* **監聽端口**：`0.0.0.0:9998`。
* **服務內容**：
  - `GET /`：提供響應式行動端單頁應用（SPA），按鍵寬大（高度 $\ge 64\text{px}$）、採用高對比暗色主題。
  - `GET /qr`：將本機區網 IP（如 `http://192.168.1.100:9998`）轉換為 DataURL PNG 供主控台彈窗展示。
  - `WS /ws`：與手機端建立全雙工連線，手機點擊按鈕時觸發 `navigator.vibrate(30)` 物理震動回饋。

---

### 4.3 廣播級 IPC 信令字典

| 命令代碼 (Action) | 參數格式 | 說明 |
| :--- | :--- | :--- |
| `TOGGLE_PLAY` | `{}` | 播放 / 暫停狀態互換 |
| `SEEK_RELATIVE` | `{"seconds": -5}` 或 `{"seconds": 5}` | 相對秒數快進/快退 |
| `SEEK_ABSOLUTE` | `{"seconds": 125}` | 精準跳轉至指定秒數 |
| `SEEK_QUOTE` | `{}` | 跳至師父引文錄音時間起點 |
| `SET_LOOP_MODE` | `{"mode": "quote" \| "segment" \| "none"}` | 設定引文或當前段落循環 |
| `SET_SPEED` | `{"speed": 1.0 \| 1.25 \| 1.5}` | 設定音訊播放倍速 |
| `SWITCH_LESSON` | `{"direction": "prev" \| "next" \| number}` | 切換上一講、下一講或指定講次 |
| `TOGGLE_THEME` | `{}` | 大慈恩頁面米白底/黑底白字切換 |
| `TRIGGER_VIDEO` | `{"type": "migsema" \| "prep" \| "dedication"}` | 喚起密集嘛/前行/迴向影片彈窗 |
| `CLOSE_VIDEO` | `{}` | 關閉影片彈窗並銷毀底層音頻 |

---

## 5. 測試策略與驗證接縫 (Testing Strategy)

嚴格遵守公共測試接縫（Test Seams）驗證原則：

1. **雙視窗生命週期驗證**：
   - 驗證單螢幕下雙視窗並排幾何、多螢幕下第 2 螢幕自動全螢幕獨佔。
2. **無頭腳本注入與 Audio 事件回播**：
   - 驗證 WebView2 載入大慈恩官網後，`init_script` 能在 100ms 內捕獲 `<audio>` 標籤並成功派發播放指令。
3. **Companion 協議向後相容性驗證**：
   - 啟動標準 Companion 模組（Port 9999），驗證 App 能自動連線、上報狀態、並響應來自 Stream Deck 的所有按鍵信令。
4. **手機 Web Remote 延遲實測**：
   - 手機透過 Wi-Fi 發送 `TOGGLE_PLAY` 指令，音訊響應延遲必須 $\le 50\text{ms}$。
5. **影片彈窗防漏音驗證**：
   - 呼叫 `TRIGGER_VIDEO` 起播後再呼叫 `CLOSE_VIDEO`，斷言底層音訊解碼管線在 100ms 內徹底進入靜音暫停態。

---

## 6. 不在範圍內 (Out of Scope)

* 不修改大慈恩官網（amrtf.org）後端伺服器或其原始資料庫。
* 不實作離線音訊 DRM 破解或盜錄儲存機制（遵守原廠串流條款）。
* 初期不支援 3 螢幕（例如第三螢幕做返送監看）之複雜矩陣切換。

---

## 7. 後續指引 (Next Steps)

本規格書經長官審核定稿後，可調用 **`/to-tickets`** 自動拆解為標準微工單，並可調用特遣助手（Guardian / Aura）協同開展代碼實作。
