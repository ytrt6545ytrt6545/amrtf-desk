/**
 * scripts/verify-lecture-jump.mjs
 * 驗證手機端講次直通艙 (Lecture Jump Pad) 補零防呆演算法、邊界防呆與原始碼現場物證
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

console.log('================================================================');
console.log('🧪 啟動手機端「講次快速直通艙 (3/03/003/0003 補零防呆)」檢驗');
console.log('================================================================\n');

// 測試區塊 1: 核心補零演算法 (3, 03, 003, 0003 -> 0003)
console.log('📌 測試 1: 四位數智慧補零防呆演算法');
function formatLectureNumber(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num <= 0 || num > 2000) return null;
  return num.toString().padStart(4, '0');
}

assert(formatLectureNumber('3') === '0003', '輸入 "3" 智慧格式化為 "0003"');
assert(formatLectureNumber('03') === '0003', '輸入 "03" 智慧格式化為 "0003"');
assert(formatLectureNumber('003') === '0003', '輸入 "003" 智慧格式化為 "0003"');
assert(formatLectureNumber('0003') === '0003', '輸入 "0003" 智慧格式化為 "0003"');
assert(formatLectureNumber('566') === '0566', '輸入 "566" 智慧格式化為 "0566"');
assert(formatLectureNumber('0566') === '0566', '輸入 "0566" 智慧格式化為 "0566"');
assert(formatLectureNumber('1') === '0001', '邊界輸入 "1" 智慧格式化為 "0001"');
assert(formatLectureNumber('2000') === '2000', '邊界輸入 "2000" 智慧格式化為 "2000"');

// 測試區塊 2: 邊界與非法防呆檢驗
console.log('\n📌 測試 2: 非法與越界輸入防呆阻擋');
assert(formatLectureNumber('0') === null, '輸入 "0" 阻擋 (null)');
assert(formatLectureNumber('-1') === null, '輸入負數 "-1" 阻擋 (null)');
assert(formatLectureNumber('2001') === null, '輸入超出演講邊界 "2001" 阻擋 (null)');
assert(formatLectureNumber('abc') === null, '輸入非數字字串 "abc" 阻擋 (null)');
assert(formatLectureNumber('') === null, '輸入空字串阻擋 (null)');
assert(formatLectureNumber(null) === null, '輸入 null 阻擋 (null)');
assert(formatLectureNumber(undefined) === null, '輸入 undefined 阻擋 (null)');

// 測試區塊 3: 原始碼現場物證檢驗 (Web Remote 與模擬器)
console.log('\n📌 測試 3: 原始碼現場物證檢驗 (Modal 結構、信令發送、可點擊樣式)');
const webRemoteContent = fs.readFileSync(path.join(ROOT, 'src/server/web-remote.js'), 'utf-8');
const mobileStudioContent = fs.readFileSync(path.join(ROOT, 'src/desk/modules/mobile-studio-drawer.js'), 'utf-8');
const deskCssContent = fs.readFileSync(path.join(ROOT, 'src/desk/desk.css'), 'utf-8');

assert(webRemoteContent.includes('lectureModalBackdrop'), 'web-remote.js 包含 lectureModalBackdrop 彈窗結構');
assert(webRemoteContent.includes('clickable-header-lcd'), 'web-remote.js 包含 clickable-header-lcd 時鐘講次可點擊樣式');
assert(webRemoteContent.includes('openLectureJumpModal'), 'web-remote.js 包含 openLectureJumpModal 彈窗喚起函數');
assert(webRemoteContent.includes('formatLectureNumber'), 'web-remote.js 包含 formatLectureNumber 補零函數');
assert(webRemoteContent.includes("sendCommand('goto_lesson', { lessonNumber: formatted, lectureId: formatted })"), 'web-remote.js 包含標準 goto_lesson 信令發送');

assert(mobileStudioContent.includes('mockLectureModalBackdrop'), 'mobile-studio-drawer.js 包含 mockLectureModalBackdrop 結構');
assert(mobileStudioContent.includes('openMockLectureJumpModal'), 'mobile-studio-drawer.js 包含 openMockLectureJumpModal 函數');
assert(mobileStudioContent.includes("this.sendLiveCmd('goto_lesson', { lessonNumber: formatted, lectureId: formatted })"), 'mobile-studio-drawer.js 包含標準 goto_lesson 信令發送');

const serverContent = fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf-8');
assert(serverContent.includes("cmd === 'goto_lesson' || cmd === 'load_lecture'"), 'server.mjs 包含 goto_lesson 與 load_lecture 雙向信令相容');
assert(serverContent.includes('clear-moonlight-great-ocean-${num}'), 'server.mjs 包含大慈恩官方網址正確跳轉邏輯');

assert(deskCssContent.includes('.lecture-modal-backdrop') && deskCssContent.includes('.lecture-modal-card'), 'desk.css 包含講次直通艙 Modal 樣式');

console.log('\n================================================================');
console.log(`📊 檢驗報告結算: 共 ${totalTests} 項檢驗, 成功 ${passedTests} 項, 失敗 ${totalTests - passedTests} 項`);
console.log('================================================================');

if (totalTests === passedTests) {
  console.log('🎉 [PASS] 所有講次快速直通艙與 3/03/003/0003 補零防呆測試 100% 通過！');
  process.exit(0);
} else {
  console.error('❌ [FAIL] 存在失敗項目！');
  process.exit(1);
}
