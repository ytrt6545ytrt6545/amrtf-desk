// ==============================================================================
// 🚀 AMRTF-Desk 安全乾淨重啟與視窗驗證引擎 (Safe Restart & Reality Verification)
// ==============================================================================

import { execSync, spawn } from 'child_process';
import path from 'path';
import http from 'http';

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return '';
  }
}

async function checkUrl(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('🧹 [1/4] 正在全面清理舊版殘留進程 (9998, 9222, 9223)...');
  
  // 查找佔用 9998, 9222, 9223 的進程
  const ports = [9998, 9222, 9223];
  for (const port of ports) {
    const netstatOut = runCmd(`netstat -ano | findstr :${port}`);
    const lines = netstatOut.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== process.pid.toString()) {
        console.log(`   - 終止佔用 Port ${port} 之進程 PID: ${pid}`);
        runCmd(`taskkill /F /PID ${pid} /T`);
      }
    }
  }

  // 稍候 1 秒確保埠口釋放
  await new Promise(r => setTimeout(r, 1000));

  console.log('🚀 [2/4] 正在拉起全新架構之 AMRTF-Desk 主伺服器 (包含 F11 特權模擬通道)...');
  const serverPath = path.resolve('projects/amrtf-desk/server.mjs');
  const child = spawn('node', [serverPath], {
    cwd: path.resolve('projects/amrtf-desk'),
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  console.log(`   - 主伺服器已派工啟動，PID: ${child.pid}`);

  console.log('⏳ [3/4] 正在輪詢等待主伺服器與雙視窗連線...');
  let serverOk = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 600));
    serverOk = await checkUrl('http://127.0.0.1:9998/desk');
    if (serverOk) break;
  }

  if (!serverOk) {
    console.error('❌ 伺服器啟動超時，未能監聽 Port 9998');
    process.exit(1);
  }
  console.log('   ✅ Port 9998 HTTP 主服務就緒！');

  // 等待放映艙與主控台 CDP 端口就緒
  let screenCdpOk = false;
  let deskCdpOk = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 800));
    if (!screenCdpOk) screenCdpOk = await checkUrl('http://127.0.0.1:9222/json');
    if (!deskCdpOk) deskCdpOk = await checkUrl('http://127.0.0.1:9223/json');
    if (screenCdpOk && deskCdpOk) break;
  }

  console.log(`   - 放映艙 CDP (9222): ${screenCdpOk ? '✅ 已連接' : '⚠️ 等待中'}`);
  console.log(`   - 主控台 CDP (9223): ${deskCdpOk ? '✅ 已連接' : '⚠️ 等待中'}`);

  console.log('🪟 [4/4] 正在調度 Win32 HWND 現場視窗取證...');
  // 透過 PowerShell 查詢實際視窗清單
  const psCmd = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match 'msedge|chrome|electron') } | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json"`;
  const winInfoRaw = runCmd(psCmd);
  console.log('   - 現場真實桌面視窗狀態:');
  try {
    const wins = JSON.parse(winInfoRaw);
    const winList = Array.isArray(wins) ? wins : [wins];
    winList.forEach(w => {
      console.log(`     * [${w.ProcessName}] HWND: ${w.MainWindowHandle} | 標題: "${w.MainWindowTitle}"`);
    });
  } catch (e) {
    console.log('     * 無法解析視窗清單，原始輸出:', winInfoRaw.trim());
  }

  console.log('\n🎉 AMRTF-Desk 全新重啟完成！');
}

main().catch(err => {
  console.error('執行失敗:', err);
  process.exit(1);
});
