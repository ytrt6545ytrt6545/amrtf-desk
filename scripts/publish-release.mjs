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
  execSync(`"${ghCmd}" release create ${tagName} "${zipPath}" --title "${releaseTitle}" --generate-notes`, { cwd: ROOT_DIR, stdio: 'inherit' });
}

console.log(`\n============================================================`);
console.log(`🎉 恭喜！AMRTF-Desk ${tagName} 已成功自動發布至 GitHub Releases！`);
console.log(`🌐 下載頁面: https://github.com/ytrt6545ytrt6545/amrtf-desk/releases/tag/${tagName}`);
console.log(`============================================================`);
