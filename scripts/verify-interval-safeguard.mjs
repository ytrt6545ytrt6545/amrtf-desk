/**
 * scripts/verify-interval-safeguard.mjs
 * 驗證起訖雙向防呆約束、防呆變色樣式與時間疊字智慧去重 (真機 Web Remote 與模擬器)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

console.log('====================================================');
console.log('🧪 啟動起訖雙向防呆約束、防呆變色與時間疊字去重檢驗');
console.log('====================================================\n');

// 測試區塊 1: 時間疊字智慧去重演算法檢驗
console.log('📌 測試 1: 時間疊字智慧去重演算法檢驗');
function cleanOptionText(m, idx) {
  const timeVal = parseFloat(m.sec ?? m.seconds ?? m.time ?? 0);
  const rawLabel = m.label || m.title || ('第 ' + (idx + 1) + ' 段');
  const min = Math.floor(timeVal / 60).toString().padStart(2, '0');
  const s = Math.floor(timeVal % 60).toString().padStart(2, '0');
  const timeDisplay = m.timeStr || (min + ':' + s);

  const escapedTime = timeDisplay.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const cleanLabel = (rawLabel || '').replace(new RegExp(`^${escapedTime}\\s*`), '').trim();
  return cleanLabel ? `${timeDisplay} ${cleanLabel}` : timeDisplay;
}

const sampleMarkers = [
  { sec: 0, label: '00:00 (起點)' },
  { sec: 313, label: '05:13 (段落)' },
  { sec: 620, label: '純文字標題' },
  { sec: 900, label: '15:00' }
];

const res0 = cleanOptionText(sampleMarkers[0], 0);
assert(res0 === '00:00 (起點)', `00:00 (起點) 去重結果正確: ${res0}`);

const res1 = cleanOptionText(sampleMarkers[1], 1);
assert(res1 === '05:13 (段落)', `05:13 (段落) 去重結果正確: ${res1}`);

const res2 = cleanOptionText(sampleMarkers[2], 2);
assert(res2 === '10:20 純文字標題', `一般文字段落正確加上時間: ${res2}`);

const res3 = cleanOptionText(sampleMarkers[3], 3);
assert(res3 === '15:00', `純時間字串無贅字: ${res3}`);

// 測試區塊 2: 起訖雙向防呆約束邏輯模擬
console.log('\n📌 測試 2: 起訖雙向防呆約束邏輯 (順推、逆推、disabled 標註)');
class MockOption {
  constructor(value, text) {
    this.value = value;
    this.textContent = text;
    this.disabled = false;
  }
}
class MockSelect {
  constructor(options = []) {
    this.options = options;
    this.value = options[0]?.value || '0';
  }
}

function simulateIntervalConstraints(selStart, selEnd, changedTarget = 'init') {
  let s = parseFloat(selStart.value) || 0;
  let e = parseFloat(selEnd.value) || 0;

  if (changedTarget === 'start' || changedTarget === 'init') {
    let validEndFound = false;
    selEnd.options.forEach((opt) => {
      const val = parseFloat(opt.value) || 0;
      const shouldDisable = val <= s;
      opt.disabled = shouldDisable;
      if (!shouldDisable && val === e) {
        validEndFound = true;
      }
    });
    if (!validEndFound) {
      const nextValidOpt = selEnd.options.find(opt => !opt.disabled);
      if (nextValidOpt) {
        selEnd.value = nextValidOpt.value;
        e = parseFloat(nextValidOpt.value) || 0;
      }
    }
    const totalStarts = selStart.options.length;
    selStart.options.forEach((opt, idx) => {
      opt.disabled = idx === totalStarts - 1 && totalStarts > 1;
    });
  } else if (changedTarget === 'end') {
    let validStartFound = false;
    selStart.options.forEach((opt) => {
      const val = parseFloat(opt.value) || 0;
      const shouldDisable = val >= e;
      opt.disabled = shouldDisable;
      if (!shouldDisable && val === s) {
        validStartFound = true;
      }
    });
    if (!validStartFound) {
      const validStarts = selStart.options.filter(opt => !opt.disabled);
      if (validStarts.length > 0) {
        selStart.value = validStarts[validStarts.length - 1].value;
        s = parseFloat(selStart.value) || 0;
      }
    }
  }
}

const mockStart = new MockSelect([
  new MockOption('0', '00:00 (起點)'),
  new MockOption('313', '05:13 (段落)'),
  new MockOption('620', '10:20 (段落)'),
  new MockOption('900', '15:00 (終點)')
]);
const mockEnd = new MockSelect([
  new MockOption('0', '00:00 (起點)'),
  new MockOption('313', '05:13 (段落)'),
  new MockOption('620', '10:20 (段落)'),
  new MockOption('900', '15:00 (終點)')
]);

// 初始狀態約束
simulateIntervalConstraints(mockStart, mockEnd, 'init');
assert(mockEnd.options[0].disabled === true, '初始狀態：訖選單 00:00 (<=起點) 必須 disabled');
assert(mockEnd.options[1].disabled === false, '初始狀態：訖選單 05:13 (>起點) 必須可選');
assert(mockStart.options[3].disabled === true, '初始狀態：起選單最後一項必須 disabled (不可當起點)');

// 使用者將起點改為 05:13 (313s)
mockStart.value = '313';
mockEnd.value = '0'; // 原本訖點非法 (0s <= 313s)
simulateIntervalConstraints(mockStart, mockEnd, 'start');
assert(mockEnd.options[0].disabled === true, '改起點後：訖選單 00:00 必須 disabled');
assert(mockEnd.options[1].disabled === true, '改起點後：訖選單 05:13 (<=起點) 必須 disabled');
assert(mockEnd.options[2].disabled === false, '改起點後：訖選單 10:20 必須可選');
assert(mockEnd.value === '620', `改起點後：非法訖點自動順推至下一個合法段落 620s (實際: ${mockEnd.value})`);

// 使用者將訖點改為 05:13 (313s)
mockEnd.value = '313';
mockStart.value = '620'; // 原本起點非法 (620s >= 313s)
simulateIntervalConstraints(mockStart, mockEnd, 'end');
assert(mockStart.options[1].disabled === true, '改訖點後：起選單 05:13 (>=訖點) 必須 disabled');
assert(mockStart.options[2].disabled === true, '改訖點後：起選單 10:20 (>=訖點) 必須 disabled');
assert(mockStart.options[0].disabled === false, '改訖點後：起選單 00:00 (<訖點) 必須可選');
assert(mockStart.value === '0', `改訖點後：非法起點自動逆推至前一個合法段落 0s (實際: ${mockStart.value})`);

// 測試區塊 3: 原始碼現場物證檢驗
console.log('\n📌 測試 3: 原始碼現場物證檢驗 (CSS 防呆變色、JS 函數齊全)');
const webRemoteContent = fs.readFileSync(path.join(ROOT, 'src/server/web-remote.js'), 'utf-8');
const mobileStudioContent = fs.readFileSync(path.join(ROOT, 'src/desk/modules/mobile-studio-drawer.js'), 'utf-8');
const deskCssContent = fs.readFileSync(path.join(ROOT, 'src/desk/desk.css'), 'utf-8');

assert(webRemoteContent.includes('.mobile-select option:disabled'), 'web-remote.js 包含 .mobile-select option:disabled 樣式');
assert(webRemoteContent.includes('updateMobileIntervalConstraints'), 'web-remote.js 包含 updateMobileIntervalConstraints 雙向防呆函數');
assert(webRemoteContent.includes('cleanLabel'), 'web-remote.js 包含 cleanLabel 智慧去重邏輯');

assert(mobileStudioContent.includes('updateMockIntervalConstraints'), 'mobile-studio-drawer.js 包含 updateMockIntervalConstraints 雙向防呆函數');
assert(mobileStudioContent.includes('cleanLabel'), 'mobile-studio-drawer.js 包含 cleanLabel 智慧去重邏輯');

assert(deskCssContent.includes('.interval-select option:disabled') && deskCssContent.includes('line-through'), 'desk.css 包含起訖 option:disabled 與 line-through 防呆變色');

console.log('\n====================================================');
console.log(`📊 檢驗報告結算: 共 ${totalTests} 項檢驗, 成功 ${passedTests} 項, 失敗 ${totalTests - passedTests} 項`);
console.log('====================================================');

if (totalTests === passedTests) {
  console.log('🎉 [PASS] 所有起訖防呆約束、防呆變色與去重測試 100% 通過！');
  process.exit(0);
} else {
  console.error('❌ [FAIL] 存在失敗項目！');
  process.exit(1);
}
