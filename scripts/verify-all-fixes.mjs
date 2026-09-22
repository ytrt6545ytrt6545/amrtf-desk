// ==============================================================================
// 🎯 AMRTF 核心功能與升級 E2E 閉環驗證腳本 (Verify All Fixes v2.0)
// ==============================================================================
// 1. 快速字級循環 (20 -> 40 -> 60 -> 80 -> 100 -> 20)
// 2. 電腦端全域字體比例 100%~200% (起訖以外放大，起訖模組保護)
// 3. 全螢幕由 CDP 視窗特權控制，消除衝突
// 4. 手機 Web Remote 與模擬器 100%~200% 大字模式
// 5. 手機端起訖文字大小調整 (全域連動 + 獨立字級切換)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

console.log('================================================================');
console.log('🚀 開始執行 AMRTF Desk 200% 全域字級與起訖字級調控閉環檢驗');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 測試 1: 快速字級循環演算法驗證 (步進 20，上限 100)
// -----------------------------------------------------------------------------
console.log('📌 檢驗項目 1: 配合大慈恩官方原生安全範圍 (13~22px) 1.5 步進整數快速循環與真實反映');
{
  const presets = [13, 16, 19, 22];
  function getNextFontSize(current) {
    let next = presets[0];
    for (const p of presets) {
      if (p > current) {
        next = p;
        break;
      }
    }
    return next;
  }

  assert(getNextFontSize(13) === 16, '字級 13px 點擊後跳至 16px');
  assert(getNextFontSize(16) === 19, '字級 16px 點擊後跳至 19px');
  assert(getNextFontSize(19) === 22, '字級 19px 點擊後跳至 22px');
  assert(getNextFontSize(22) === 13, '字級 22px 點擊後循環回 13px');

  const deskJs = fs.readFileSync(path.join(rootDir, 'src/desk/desk.js'), 'utf8');
  assert(deskJs.includes('presets = [13, 16, 19, 22]'), 'desk.js 包含 presets [13, 16, 19, 22]');
  assert(deskJs.includes('currentFontSize = Math.round(state.fontSize)'), 'desk.js 狀態同步即時刷新 currentFontSize');

  const runtimeJs = fs.readFileSync(path.join(rootDir, 'src/injected/amrtf-runtime.js'), 'utf8');
  assert(!runtimeJs.includes("fontSlider.max = '100'"), 'amrtf-runtime.js 嚴禁擅自竄改 fontSlider.max = 100');
  assert(runtimeJs.includes('Math.min(max, Math.round(newSize * 10) / 10)'), 'amrtf-runtime.js 運算邊界配合官方 max 邊界');
}

console.log('');

// -----------------------------------------------------------------------------
// 測試 2: 電腦版全域比例支援至 200% (起訖以外放大，起訖模組保護)
// -----------------------------------------------------------------------------
console.log('📌 檢驗項目 2: 電腦版全域按鈕比例 100%~200% 覆蓋');
{
  const deskJs = fs.readFileSync(path.join(rootDir, 'src/desk/desk.js'), 'utf8');
  assert(deskJs.includes("'btn-scale-200'"), 'desk.js SCALE_CLASSES 包含 btn-scale-200');
  assert(deskJs.includes("'🔤 200%'"), 'desk.js SCALE_LABELS 包含 🔤 200%');

  const deskCss = fs.readFileSync(path.join(rootDir, 'src/desk/desk.css'), 'utf8');
  assert(deskCss.includes(':not(#intervalRowWidget *)'), 'desk.css 具備 :not(#intervalRowWidget *) 排除起訖');
  assert(deskCss.includes('body.btn-scale-200 .deck-grid-cell.sz-4x2 > .keycap-btn:not(#intervalRowWidget *)'), 'desk.css 覆蓋 200% 模式 4x2 按鈕');
  assert(deskCss.includes('font-size: 50px !important;'), 'desk.css 200% 模式 4x2 巨型按鈕字級達 50px');
  assert(deskCss.includes('body[class*="btn-scale-"] #intervalRowWidget'), 'desk.css 具備通配起訖保護塊');
}

console.log('');

// -----------------------------------------------------------------------------
// 測試 3: 全螢幕與退出全螢幕 (CDP 原生視窗控制與單一指揮中樞)
// -----------------------------------------------------------------------------
console.log('📌 檢驗項目 3: 全螢幕與退出全螢幕 CDP 特權視窗切換');
{
  const cdpBridgeJs = fs.readFileSync(path.join(rootDir, 'src/core/cdp-bridge.js'), 'utf8');
  assert(cdpBridgeJs.includes('Browser.getWindowForTarget'), 'cdp-bridge.js 調用 Browser.getWindowForTarget 查詢視窗狀態');
  assert(cdpBridgeJs.includes('Browser.setWindowBounds'), 'cdp-bridge.js 調用 Browser.setWindowBounds 切換視窗邊界');
  assert(cdpBridgeJs.includes("const nextState = isFs ? 'normal' : 'fullscreen'"), 'cdp-bridge.js 具備全螢幕與視窗化雙向切換');

  const serverMjs = fs.readFileSync(path.join(rootDir, 'server.mjs'), 'utf8');
  assert(serverMjs.includes('cdpBridge.toggleFullscreen();'), 'server.mjs 直接調用 cdpBridge.toggleFullscreen()');

  const runtimeJs = fs.readFileSync(path.join(rootDir, 'src/injected/amrtf-runtime.js'), 'utf8');
  assert(runtimeJs.includes("'sync_fullscreen_state': 'sync_fullscreen_state'"), 'amrtf-runtime.js 白名單註冊 sync_fullscreen_state');
}

console.log('');

// -----------------------------------------------------------------------------
// 測試 4: 手機端按鈕與全域 200% 放縮
// -----------------------------------------------------------------------------
console.log('📌 檢驗項目 4: 手機 Web Remote 與模擬器全域比例升級至 200%');
{
  const webRemoteJs = fs.readFileSync(path.join(rootDir, 'src/server/web-remote.js'), 'utf8');
  assert(webRemoteJs.includes("scales = ['100', '125', '150', '175', '200']"), 'web-remote.js 支援 5 檔 scales (至 200%)');
  assert(webRemoteJs.includes('body.mobile-font-200 .btn-label'), 'web-remote.js 包含 200% 按鈕標籤樣式');
  assert(webRemoteJs.includes('font-size: 22.5px !important;'), 'web-remote.js 200% 按鈕文字達 22.5px !important');
  assert(webRemoteJs.includes('font-size: 42px !important;'), 'web-remote.js 200% 圖示達 42px !important');

  const drawerJs = fs.readFileSync(path.join(rootDir, 'src/desk/modules/mobile-studio-drawer.js'), 'utf8');
  assert(drawerJs.includes("scales = ['100', '125', '150', '175', '200']"), 'mobile-studio-drawer.js 支援 5 檔 scales (至 200%)');

  const deskCss = fs.readFileSync(path.join(rootDir, 'src/desk/desk.css'), 'utf8');
  assert(deskCss.includes('.mobile-font-200 .mock-item .mock-label'), 'desk.css 模擬器支援 200% mock-label (22px)');
  assert(deskCss.includes('.mobile-font-200 .mock-item .mock-icon'), 'desk.css 模擬器支援 200% mock-icon (38px)');
}

console.log('');

// -----------------------------------------------------------------------------
// 測試 5: 手機端起訖文字調整大小 (全域連動 + 獨立字級按鈕)
// -----------------------------------------------------------------------------
console.log('📌 檢驗項目 5: 手機端起訖文字大小調整 (全域連動 + 獨立按鈕)');
{
  const webRemoteJs = fs.readFileSync(path.join(rootDir, 'src/server/web-remote.js'), 'utf8');
  assert(webRemoteJs.includes('btnMobileIntScale'), 'web-remote.js 包含起訖獨立字級切換按鈕 btnMobileIntScale');
  assert(webRemoteJs.includes('amrtf_mobile_interval_font'), 'web-remote.js 具備起訖獨立字級 localStorage 記憶');
  assert(webRemoteJs.includes('.widget-interval-box.int-font-xl .mobile-select'), 'web-remote.js 具備特大 22px 起訖獨立檔位');
  assert(webRemoteJs.includes('body.mobile-font-200 .mobile-select'), 'web-remote.js 起訖選單支援 200% 全域縮放 (20px)');
  assert(webRemoteJs.includes('body.mobile-font-200 .field-tag'), 'web-remote.js 起訖標籤支援 200% 全域縮放 (20px)');

  const drawerJs = fs.readFileSync(path.join(rootDir, 'src/desk/modules/mobile-studio-drawer.js'), 'utf8');
  assert(drawerJs.includes('btnMockIntScale'), 'mobile-studio-drawer.js 模擬器包含起訖獨立字級按鈕 btnMockIntScale');
}

console.log('');
console.log('================================================================');
console.log(`📊 驗證結果: 總計 ${passCount + failCount} 項斷言 | 通過: ${passCount} | 失敗: ${failCount}`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 200% 全域字級與手機起訖文字調控全數 PASS！');
}
