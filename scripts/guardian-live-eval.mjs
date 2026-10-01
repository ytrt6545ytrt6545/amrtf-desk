import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🛡️ [Guardian Live Eval] 質檢官真機端到端獨立裁判引擎啟動中...');

// 1. 環境安全清理
try {
  execSync('node scratch/clean-proc.mjs', { cwd: projectRoot, stdio: 'ignore' });
} catch (e) {}

// 2. 執行專案唯一法定裁判標準 (npm test)
const startTime = Date.now();
let exitCode = 0;
let stdout = '';
let stderr = '';

try {
  stdout = execSync('npm test', {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 100000
  });
} catch (err) {
  exitCode = err.status || 1;
  stdout = err.stdout ? err.stdout.toString() : '';
  stderr = err.stderr ? err.stderr.toString() : err.message;
}

const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

// 3. 提取關鍵物理物證指標
const hasExitZero = exitCode === 0;
const e2e13Pass = stdout.includes('✅ [E2E-13] 雙機雙核真機播放與走帶硬鎖閉環') && !stdout.includes('✖ ✅ [E2E-13]');
const e2e14Pass = stdout.includes('✅ [E2E-14] 走帶矩陣') && !stdout.includes('✖ ✅ [E2E-14]');
const e2e15Pass = stdout.includes('✅ [E2E-15] 講次導航') && !stdout.includes('✖ ✅ [E2E-15]');
const e2e16Pass = stdout.includes('✅ [E2E-16] 研討區間循環') && !stdout.includes('✖ ✅ [E2E-16]');
const e2e17Pass = stdout.includes('✅ [E2E-17] 法會影音三巨鍵') && !stdout.includes('✖ ✅ [E2E-17]');

const allPassMatch = stdout.match(/pass\s+(\d+)/);
const failMatch = stdout.match(/fail\s+(\d+)/);
const totalTestsMatch = stdout.match(/tests\s+(\d+)/);

const totalTests = totalTestsMatch ? parseInt(totalTestsMatch[1], 10) : null;
const passCount = allPassMatch ? parseInt(allPassMatch[1], 10) : null;
const failCount = failMatch ? parseInt(failMatch[1], 10) : null;

// 4. 檢查主控台所有 HTML 是否徹底移除「佈局」按鈕
const indexHtmlPath = path.join(projectRoot, 'src', 'desk', 'index.html');
const moonlightHtmlPath = path.join(projectRoot, 'src', 'desk', 'moonlight.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const moonlightHtml = fs.existsSync(moonlightHtmlPath) ? fs.readFileSync(moonlightHtmlPath, 'utf8') : '';
const hasLayoutBtn = indexHtml.includes('btnEditLayoutToggle') || indexHtml.includes('>佈局<') ||
                     moonlightHtml.includes('btnEditLayoutToggle') || moonlightHtml.includes('>佈局<');

const isAllPass = hasExitZero && failCount === 0 && e2e13Pass && e2e14Pass && e2e15Pass && e2e16Pass && e2e17Pass && !hasLayoutBtn;

const evidenceDir = path.join(projectRoot, 'test', 'artifacts');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

// 保存完整執行日誌供紅隊追溯
fs.writeFileSync(path.join(evidenceDir, 'latest-run.log'), stdout + (stderr ? '\n--- STDERR ---\n' + stderr : ''), 'utf8');

const evidence = {
  timestamp: new Date().toISOString(),
  durationSec: parseFloat(durationSec),
  exitCode,
  isStandardPass: isAllPass,
  metrics: {
    totalTests,
    passCount,
    failCount,
    e2e13PlaybackPass: e2e13Pass,
    e2e14TransportPass: e2e14Pass,
    e2e15NavigationPass: e2e15Pass,
    e2e16IntervalPass: e2e16Pass,
    e2e17SpecialMediaPass: e2e17Pass,
    layoutButtonRemoved: !hasLayoutBtn
  },
  logSnippet: stdout.slice(-4000)
};

fs.writeFileSync(path.join(evidenceDir, 'guardian-live-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

console.log('\n======================================================');
console.log(`🎯 [Guardian Verdict] 裁判結果: ${evidence.isStandardPass ? '✅ 100% 全綠 PASS' : '❌ 存在報紅 FAIL'}`);
console.log(`   - Exit Code: ${exitCode}`);
console.log(`   - 通過測試: ${passCount} / ${totalTests} (失敗: ${failCount})`);
console.log(`   - E2E-13 播放硬鎖: ${e2e13Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   - E2E-14 走帶矩陣: ${e2e14Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   - E2E-15 講次導航: ${e2e15Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   - E2E-16 區間循環: ${e2e16Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   - E2E-17 法會影音: ${e2e17Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   - 佈局按鈕徹底移除: ${!hasLayoutBtn ? '✅ 已移除' : '❌ 仍有殘留'}`);
console.log(`   - 耗時: ${durationSec} 秒`);
console.log('======================================================\n');

process.exit(exitCode);
