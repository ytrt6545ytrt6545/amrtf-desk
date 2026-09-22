// ==============================================================================
// 🩺 AMRTF-Desk 啟動現場深度診斷探測器 (Diagnostic Sentinel)
// 專門用於他人電腦、全新解壓環境，逐項探測並即時輸出各環節物證
// ==============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const logDir = path.join(projectRoot, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'diagnose.log');

const logStream = fs.createWriteStream(logFile, { flags: 'w', encoding: 'utf8' });

function log(msg, status = 'INFO') {
  const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  const prefix = status === 'OK' ? ' [OK] ' : status === 'FAIL' ? ' [FAIL] ' : status === 'WARN' ? ' [WARN] ' : ' [INFO] ';
  const line = `[${time}]${prefix}${msg}`;
  console.log(line);
  logStream.write(line + '\r\n');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🩺 AMRTF-Desk 現場全方位啟動探測儀 (Diagnostic Sentinel)');
console.log('═══════════════════════════════════════════════════════════════');
log(`專案目錄: ${projectRoot}`);
log(`作業系統: ${os.type()} ${os.release()} (${os.arch()})`);
log(`目前使用者: ${os.userInfo().username}`);

// 1. 檢驗自帶 Node.js 二進制
const localNode = path.join(projectRoot, 'bin', 'node.exe');
if (fs.existsSync(localNode)) {
  const stat = fs.statSync(localNode);
  log(`發現自帶 Node.js: ${localNode} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`, 'OK');
} else {
  log(`未發現 bin/node.exe，當前環境使用系統 Node: ${process.execPath}`, 'WARN');
}

// 2. 檢驗關鍵模組檔案完整性
const requiredFiles = [
  'server.mjs',
  'package.json',
  'src/desk/index.html',
  'src/desk/desk.css',
  'src/desk/desk.js',
  'src/injected/amrtf-runtime.js',
  'node_modules/ws'
];

let filesAllExist = true;
for (const f of requiredFiles) {
  const p = path.join(projectRoot, f);
  if (fs.existsSync(p)) {
    log(`核心組件存在: ${f}`, 'OK');
  } else {
    log(`❌ 缺失關鍵組件: ${f}`, 'FAIL');
    filesAllExist = false;
  }
}

// 3. 檢驗瀏覽器可執行檔 (Edge / Chrome)
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
let foundBrowser = null;
for (const b of browserCandidates) {
  if (fs.existsSync(b)) {
    foundBrowser = b;
    break;
  }
}
if (foundBrowser) {
  log(`檢測到系統瀏覽器: ${foundBrowser}`, 'OK');
} else {
  log(`⚠️ 未在標準路徑找到 Edge 或 Chrome，將嘗試由系統 PATH 呼叫 msedge.exe`, 'WARN');
}

// 4. 檢驗臨時目錄寫入權限
const testTempDir = path.join(os.tmpdir(), 'amrtf-test-perm');
try {
  if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });
  fs.writeFileSync(path.join(testTempDir, 'test.txt'), 'write-ok');
  fs.unlinkSync(path.join(testTempDir, 'test.txt'));
  fs.rmdirSync(testTempDir);
  log(`臨時目錄 (os.tmpdir) 具備完全讀寫權限: ${os.tmpdir()}`, 'OK');
} catch (err) {
  log(`❌ 臨時目錄無法寫入: ${err.message}`, 'FAIL');
}

// 5. 檢驗 Port 9998 與 9222 佔用狀況
try {
  const netstat9998 = execSync('netstat -ano | findstr :9998', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (netstat9998) {
    log(`⚠️ Port 9998 當前已被以下進程佔用:\n${netstat9998}`, 'WARN');
  } else {
    log(`Port 9998 目前乾淨可用`, 'OK');
  }
} catch (e) {
  log(`Port 9998 目前乾淨可用 (未被佔用)`, 'OK');
}

console.log('───────────────────────────────────────────────────────────────');
log('🚀 正在嘗試於前台以即時捕獲模式啟動 server.mjs...');
console.log('───────────────────────────────────────────────────────────────');

// 6. 前台以子進程啟動 server.mjs 並捕捉所有 stdout / stderr
const nodeExe = fs.existsSync(localNode) ? localNode : process.execPath;
const srv = spawn(nodeExe, [path.join(projectRoot, 'server.mjs')], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe']
});

srv.stdout.on('data', (d) => {
  const text = d.toString();
  process.stdout.write(text);
  logStream.write(text);
});

srv.stderr.on('data', (d) => {
  const text = d.toString();
  process.stderr.write(`[STDERR] ${text}`);
  logStream.write(`[STDERR] ${text}`);
});

srv.on('error', (err) => {
  log(`❌ 無法啟動 server.mjs: ${err.message}`, 'FAIL');
});

srv.on('exit', (code, signal) => {
  log(`⚠️ server.mjs 進程已退出！(code: ${code}, signal: ${signal})`, code === 0 ? 'INFO' : 'FAIL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📋 完整診斷日誌已保存於: ${logFile}`);
  console.log('請回報此視窗最後輸出的錯誤訊息，以便即刻修復！');
  console.log('═══════════════════════════════════════════════════════════════');
});
