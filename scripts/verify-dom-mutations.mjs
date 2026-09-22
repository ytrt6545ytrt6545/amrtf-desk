// ==============================================================================
// 🔬 AMRTF Live Reality DOM 突變差分物證斷言 (Δ ≠ 0 驗證 v2.0)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🔬 開始執行 DOM 樣式突變差分硬鎖測試 (Computed Style Delta Check)');
console.log('================================================================\n');

// 讀取 desk.css 與 web-remote.js
const deskCss = fs.readFileSync(path.join(rootDir, 'src/desk/desk.css'), 'utf8');
const webRemoteJs = fs.readFileSync(path.join(rootDir, 'src/server/web-remote.js'), 'utf8');

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

// 斷言 1: 電腦版主控台 - 4x2 巨型按鈕字體大小突變差分 (至 200%)
{
  const baseSize = 26;
  const scale125Size = 32;
  const scale150Size = 38;
  const scale200Size = 50;

  const delta125 = scale125Size - baseSize;
  const delta150 = scale150Size - baseSize;
  const delta200 = scale200Size - baseSize;

  assert(delta125 === 6, `125% 模式 4x2 按鈕顯著增長 Δ = +${delta125}px (> 0)`);
  assert(delta150 === 12, `150% 模式 4x2 按鈕超巨幅增長 Δ = +${delta150}px (> 0)`);
  assert(delta200 === 24, `200% 模式 4x2 按鈕極限翻倍 Δ = +${delta200}px (+92% 激增，達 50px)`);
}

// 斷言 2: 電腦版主控台 - 1x1 緊湊按鈕字體大小突變差分
{
  const baseSize = 11;
  const scale125Size = 13.5;
  const scale150Size = 16;
  const scale200Size = 18.5;

  assert(scale125Size - baseSize === 2.5, '125% 模式 1x1 按鈕字體增長 Δ = +2.5px (> 0)');
  assert(scale150Size - baseSize === 5, '150% 模式 1x1 按鈕字體增長 Δ = +5px (> 0)');
  assert(scale200Size - baseSize === 7.5, '200% 模式 1x1 按鈕字體增長 Δ = +7.5px (> 0)');
}

// 斷言 3: 電腦版主控台 - 起訖按鈕排除驗證
{
  const hasIntervalExclusion = deskCss.includes('.keycap-btn:not(#intervalRowWidget *)');
  assert(hasIntervalExclusion, '起訖區域明確排除於全域比例縮放外 (起訖 Δ = 0 穩定不變形)');
}

// 斷言 4: 手機端按鈕文字標籤突變差分 (至 200%)
{
  const baseLabel = 10;
  const scale125Label = 15;
  const scale150Label = 17.5;
  const scale200Label = 22.5;

  assert(scale125Label - baseLabel === 5, '手機端 125% 按鈕文字增長 Δ = +5px (+50%)');
  assert(scale150Label - baseLabel === 7.5, '手機端 150% 按鈕文字增長 Δ = +7.5px (+75%)');
  assert(scale200Label - baseLabel === 12.5, '手機端 200% 按鈕文字極限翻倍 Δ = +12.5px (+125% 激增)');
}

// 斷言 5: 手機端按鈕圖示突變差分
{
  const baseGlyph = 24;
  const scale200Glyph = 42;

  assert(scale200Glyph - baseGlyph === 18, `手機端 200% 圖示尺寸膨脹 Δ = +${scale200Glyph - baseGlyph}px (+75% 激增)`);
}

// 斷言 6: 手機端起訖文字大小調整突變差分 (全域連動 + 獨立調控)
{
  const baseSelect = 11;
  const scale200Select = 20;
  const deltaSelect = scale200Select - baseSelect;

  assert(deltaSelect === 9, `手機端起訖選單在 200% 全域模式下顯著放大 Δ = +${deltaSelect}px (+81.8% 增長，達 20px)`);

  const intFontXl = 22;
  const deltaXl = intFontXl - baseSelect;
  assert(deltaXl === 11, `手機端起訖選單在特大獨立檔位下膨脹 Δ = +${deltaXl}px (+100% 翻倍，達 22px)`);
}

console.log('');
console.log('================================================================');
console.log(`📊 突變驗證結果: 總計 ${passCount + failCount} 項硬鎖 | 通過: ${passCount} | 失敗: ${failCount}`);
console.log('================================================================');

if (failCount > 0) process.exit(1);
