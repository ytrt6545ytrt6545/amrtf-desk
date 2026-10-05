import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const pkgPath = path.join(ROOT_DIR, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;
const tagName = `v${version}`;
const releaseTitle = `AMRTF-Desk ${tagName} 綠色免安裝正式版`;
const zipName = `AMRTF-Desk-${tagName}-Portable.zip`;
const zipPath = path.join(ROOT_DIR, 'dist', zipName);

console.log(`============================================================`);
console.log(`🚀 開始全自動發布 AMRTF-Desk ${tagName} 至 GitHub Releases...`);
console.log(`============================================================`);

// 1. 執行唯一合法裁判標準測試
console.log(`\n🔍 [步驟 1/4] 執行全域標準測試 (npm test)...`);
try {
  execSync('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log(`✅ 測試全數通過！`);
} catch (e) {
  console.error(`❌ 全域測試失敗，依憲法終止發布！`);
  process.exit(1);
}

// 2. 建置最新綠色便攜包
console.log(`\n📦 [步驟 2/4] 打包綠色免安裝便攜包...`);
execSync('node scripts/build-portable.mjs', { cwd: ROOT_DIR, stdio: 'inherit' });

if (!fs.existsSync(zipPath)) {
  console.error(`❌ 未找到建置產物: ${zipPath}`);
  process.exit(1);
}

// 3. 確保 Git Tag 存在並推送到遠端
console.log(`\n🏷️ [步驟 3/4] 檢查並同步 Git Tag (${tagName})...`);
try {
  const existingTags = execSync('git tag -l', { cwd: ROOT_DIR, encoding: 'utf-8' });
  if (!existingTags.includes(tagName)) {
    execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
  }
  execSync(`git push origin ${tagName}`, { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log(`✅ Tag ${tagName} 已就緒！`);
} catch (e) {
  console.log(`ℹ️ Tag 已存在或推送跳過: ${e.message}`);
}

// 4. 調用 GitHub CLI (gh) 建立或更新 Release
console.log(`\n☁️ [步驟 4/4] 正在發布至 GitHub Releases 並上傳資產...`);
const ghCmd = 'C:\\Users\\truec\\bin\\gh\\gh.exe';

try {
  // 檢查是否已有該 release
  const checkOut = execSync(`"${ghCmd}" release view ${tagName} --json name`, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  console.log(`ℹ️ 偵測到已有 ${tagName} Release，正在覆蓋更新附件 (${zipName})...`);
  execSync(`"${ghCmd}" release upload ${tagName} "${zipPath}" --clobber`, { cwd: ROOT_DIR, stdio: 'inherit' });
} catch {
  console.log(`🚀 正在建立全新 Release ${tagName}...`);
  const notesPath = path.join(ROOT_DIR, 'scratch', 'release-notes.md');
  const notesContent = `### 🔄 修改變動之功能
1. **起訖區間播放模式重整**：原「起訖間循環」改為「**起訖區間播放**」，大小規格保持不變並水平置中；播放至訖點自動停止定格，再次點擊重新起播，更加契合現場研討討論節奏；拔除冗餘的「播放」鍵與「釋放循環」鍵，徹底消除按鈕歧義與視覺擁擠。
2. **手抄稿放映端開機預設淺色**：放映端開機載入預設為米白底黑字之「**宣紙淺色**」（\`light\` 主題），滿足現場投影清晰利讀需求；主控台深淺色雙聯分段按鈕即時雙向聯動反饋。

### 🌟 新增之功能
1. **純文字使用者意見與問題回饋系統**：頂部導航配置純文字 \`[回饋]\` 晶透水晶按鍵（100% 無圖標、無 emoji）；點擊開啟彈窗，系統自動診斷帶入「填寫日期」與「現場狀態物證（講次、時間碼、深淺色、捲動模式、播稿狀態）」；提供大文字輸入框與選填聯絡方式。
2. **雙軌離線防護 ＋ Email 直達長官信箱**：本地 \`data/feedback/\` 100% 離線防護備份 ＋ 雲端 FormSubmit 免金鑰通道非同步直接寄送至長官指定信箱 \`truechi2687@gmail.com\`；軟體介面不殘留回饋歷史紀錄，確保學員隱私與主控台極致純粹。`;

  if (!fs.existsSync(path.dirname(notesPath))) fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  fs.writeFileSync(notesPath, notesContent, 'utf-8');

  execSync(`"${ghCmd}" release create ${tagName} "${zipPath}" --title "${releaseTitle}" --notes-file "${notesPath}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
}

console.log(`\n============================================================`);
console.log(`🎉 恭喜！AMRTF-Desk ${tagName} 已成功自動發布至 GitHub Releases！`);
console.log(`🌐 下載頁面: https://github.com/ytrt6545ytrt6545/amrtf-desk/releases/tag/${tagName}`);
console.log(`============================================================`);
