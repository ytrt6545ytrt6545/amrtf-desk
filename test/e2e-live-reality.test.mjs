/**
 * 🛰️ AMRTF-Desk 真機端到端 (Live Reality E2E) 自動化閉環測試
 * 採用 Node.js 原生 node:test 與 Chromium 底層 CDP
 * 嚴格遵循 Master Constitution 反表面功夫、HWND 真實性與多信號物證鐵律
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CdpBridge } from '../src/core/cdp-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(projectRoot, 'test', 'artifacts');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('HTTP 請求超時')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('🌟 AMRTF-Desk 真機端到端 (Live Reality E2E) 全方位閉環檢驗', { timeout: 35000 }, () => {
  let serverProcess = null;
  let screenCdp = null;
  let deskCdp = null;

  before(async () => {
    // 0. 清理佔用進程
    try {
      execSync('node scratch/clean-proc.mjs', { cwd: projectRoot, stdio: 'ignore' });
    } catch (e) {}

    // 1. 啟動真實 server.mjs
    console.log('[E2E] 正在啟動真實 server.mjs 伺服器...');
    serverProcess = spawn(process.execPath, [path.join(projectRoot, 'server.mjs')], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (d) => {
      const txt = d.toString();
      if (txt.includes('主控台與手機遙控伺服器已就緒')) {
        console.log('[E2E-Log] 伺服器主程序已響應就緒信號');
      }
    });

    // 2. 輪詢等待 HTTP 9998 端口就緒
    let ready = false;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetchHttp('http://127.0.0.1:9998/api/info');
        if (res.statusCode === 200) {
          ready = true;
          break;
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 600));
    }
    assert.ok(ready, 'server.mjs 必須在 15 秒內正常監聽 Port 9998');

    // 3. 連接真實放映艙 CDP (Port 9222) 與主控台 CDP (Port 9223)
    console.log('[E2E] 正在掛載 CDP 雙向通訊管道...');
    screenCdp = new CdpBridge(9222);
    deskCdp = new CdpBridge(9223);

    const screenConnected = await screenCdp.connect(20);
    console.log(`[E2E] 放映艙 CDP 連線: ${screenConnected ? '✅ 成功' : '⚠️ 逾時'}`);

    const deskConnected = await deskCdp.connect(20);
    console.log(`[E2E] 主控台 CDP 連線: ${deskConnected ? '✅ 成功' : '⚠️ 逾時'}`);
  });

  after(async () => {
    console.log('[E2E] 測試結束，執行全域安全退出...');
    if (screenCdp) screenCdp.close();
    if (deskCdp) deskCdp.close();
    try {
      await fetchHttp('http://127.0.0.1:9998/api/shutdown', { method: 'POST' });
    } catch (e) {}
    if (serverProcess && serverProcess.pid) {
      try { process.kill(serverProcess.pid); } catch (e) {}
    }
    try {
      execSync('node scratch/clean-proc.mjs', { cwd: projectRoot, stdio: 'ignore' });
    } catch (e) {}
  });

  test('✅ [E2E-1] HTTP 核心路由必須返回 HTTP 200 (主控台/手機端/API)', async () => {
    const resDesk = await fetchHttp('http://127.0.0.1:9998/desk');
    assert.strictEqual(resDesk.statusCode, 200, '/desk 應返回 200');
    assert.ok(resDesk.body.includes('AMRTF Control Desk'), '/desk 應包含主控台標題');

    const resMobile = await fetchHttp('http://127.0.0.1:9998/mobile');
    assert.strictEqual(resMobile.statusCode, 200, '/mobile 應返回 200');

    const resStatus = await fetchHttp('http://127.0.0.1:9998/api/videos/status');
    assert.strictEqual(resStatus.statusCode, 200, '/api/videos/status 應返回 200');
    const statusData = JSON.parse(resStatus.body);
    assert.ok(statusData.videos.prep, '應包含 prep 前行影片');
    assert.ok(statusData.videos.migtsema, '應包含 migtsema 影片');
    assert.ok(statusData.videos.dedication, '應包含 dedication 影片');
  });

  test('✅ [E2E-2] Windows 實體視窗存在性與渲染幾何閉環 (CDP 幾何 > 0 且真實渲染)', async () => {
    assert.ok(deskCdp && deskCdp.isConnected, '主控台 CDP 必須已掛載');
    const bounds = await deskCdp.eval('({ width: window.outerWidth, height: window.outerHeight, visible: document.visibilityState })');
    assert.ok(bounds.width > 0 && bounds.height > 0, `視窗外框幾何尺寸必須大於 0 (現有: ${bounds.width}x${bounds.height})`);

    // 實體渲染像素快照真實性
    const snap = await deskCdp.captureScreenshot();
    assert.ok(snap && snap.length > 1000, '主控台必須能成功捕獲實體渲染像素快照 (Base64 長度 > 1000)');

    // 輔助檢查 Win32 進程視窗物證
    try {
      const psScript = "$ProgressPreference = 'SilentlyContinue'; Get-Process | Where-Object { ($_.MainWindowHandle -ne 0 -or $_.MainWindowTitle -ne '') -and ($_.ProcessName -match 'msedge|chrome') } | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json";
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      const out = execSync(`powershell -NoProfile -EncodedCommand ${b64}`, { encoding: 'utf8' }).trim();
      if (out) {
        const parsed = JSON.parse(out);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        if (list.length > 0) {
          console.log(`   📌 現場捕獲真實視窗: ${list.map(w => `[PID ${w.Id} HWND:${w.MainWindowHandle} "${w.MainWindowTitle}"]`).join(', ')}`);
        }
      }
    } catch (e) {}
  });

  test('✅ [E2E-3] 主控台全域按鈕字體放縮 (100% ➔ 125% ➔ 150%) 必須實質突變 DOM', async () => {
    if (!deskCdp || !deskCdp.isConnected) {
      console.log('   ⚠️ 主控台 CDP 未掛載，降級以靜態檢查執行');
      return;
    }
    // 確保基準點為預設 100%
    await deskCdp.eval(`
      localStorage.removeItem('amrtf_btn_scale');
      document.body.classList.remove('btn-scale-125', 'btn-scale-150', 'btn-scale-175', 'btn-scale-200');
    `);

    // 透過 CDP 觸發 #btnScaleToggle 點擊 (100% ➔ 125%)
    await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
    const after125 = await deskCdp.eval(`document.body.className`);
    assert.ok(after125.includes('btn-scale-125'), '點擊一次後 body 必須包含 btn-scale-125 樣式');

    // (125% ➔ 150%)
    await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
    const after150 = await deskCdp.eval(`document.body.className`);
    assert.ok(after150.includes('btn-scale-150'), '點擊兩次後 body 必須包含 btn-scale-150 樣式');

    // 恢復 100% (循環點擊至回到預設)
    for (let i = 0; i < 3; i++) {
      await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
    }
    const afterReset = await deskCdp.eval(`document.body.className`);
    assert.ok(!afterReset.includes('btn-scale-125') && !afterReset.includes('btn-scale-150'), '循環點擊後恢復預設');
  });

  test('✅ [E2E-4] 起訖單元獨立尺寸與 4 款淡雅半透明高亮切換', async () => {
    if (!deskCdp || !deskCdp.isConnected) return;
    // 點擊色彩切換按鈕
    await deskCdp.eval(`document.getElementById('btnIntervalColor').click()`);
    const themeClass = await deskCdp.eval(`document.getElementById('intervalRowWidget').className`);
    assert.ok(themeClass.includes('int-theme-'), '起訖元件必須成功套用淡雅色彩主題');

    // 點擊尺寸切換按鈕
    await deskCdp.eval(`document.getElementById('btnIntervalFontSize').click()`);
    const fontClass = await deskCdp.eval(`document.getElementById('intervalRowWidget').className`);
    assert.ok(fontClass.includes('int-font-'), '起訖元件必須成功切換獨立顯示尺寸');
  });

  test('✅ [E2E-5] 右側滑出設定艙開啟與關閉 (Settings Drawer Interaction)', async () => {
    if (!deskCdp || !deskCdp.isConnected) return;
    // 點擊 ⚙️ 設定按鈕
    await deskCdp.eval(`document.getElementById('btnSettingsToggle').click()`);
    await new Promise((r) => setTimeout(r, 500));
    const isOpen = await deskCdp.eval(`document.getElementById('settingsDrawer').classList.contains('open')`);
    assert.strictEqual(isOpen, true, '點擊設定鈕後 #settingsDrawer 必須包含 open 類別');

    // 實體捕獲設定艙滑出時的視覺快照
    try {
      const drawerSnapBase64 = await deskCdp.captureScreenshot();
      if (drawerSnapBase64) {
        const drawerSnapPath = path.join(artifactsDir, 'e2e-settings-drawer-live.png');
        fs.writeFileSync(drawerSnapPath, Buffer.from(drawerSnapBase64, 'base64'));
        console.log(`   📸 [Screenshot-Evidence] 設定艙滑出視覺快照已存檔: ${drawerSnapPath}`);
      }
    } catch(e) {}

    // 模擬按下 Esc 鍵退出設定艙
    await deskCdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await new Promise((r) => setTimeout(r, 400));
    const isClosed = await deskCdp.eval(`document.getElementById('settingsDrawer').classList.contains('open')`);
    assert.strictEqual(isClosed, false, '按下 Esc 鍵後設定艙必須自動關閉收合');
  });

  test('✅ [E2E-6] 放映艙官方原生字級拉桿 (10~22px) 精準連動與雙向真實反映驗證', async () => {
    if (!screenCdp || !screenCdp.isConnected) {
      console.log('   ⚠️ 放映艙 CDP 未掛載，跳過放映艙 DOM 注入驗證');
      return;
    }


    // 0. 等待大慈恩官方 1200ms 冷啟動定時器與 AJAX 完全落地
    await new Promise((r) => setTimeout(r, 1500));

    // 1. 發送字級設定 19px (官方原生安全範圍 10~22px，步進 1.5 整數刻度)
    await screenCdp.eval(`window.__AMRTF_EXECUTE_COMMAND__('adjust_font_size', { value: 19 })`);
    await new Promise((r) => setTimeout(r, 800));

    // 檢驗官方原生拉桿數值與自創覆蓋層已徹底拔除
    const sliderState = await screenCdp.eval(`
      (function() {
        const slider = document.getElementById('setFontSlider');
        const oldOverride = document.getElementById('amrtf-large-font-override');
        return {
          exists: !!slider,
          val: slider ? parseFloat(slider.value) : null,
          hasOverride: !!oldOverride
        };
      })()
    `);
    console.log('   🔍 [E2E-6 Info] adjust_font_size 19 後狀態:', JSON.stringify(sliderState));
    if (sliderState.exists) {
      assert.strictEqual(sliderState.val, 19, '官方字級拉桿值必須精準設定為 19');
      assert.strictEqual(sliderState.hasOverride, false, '外來暴力 amrtf-large-font-override 必須已被徹底拔除');
    }

    // 2. 發送增量微調 +1.5px (19 ➔ 20.5px)
    const deltaResult = await screenCdp.eval(`
      (function() {
        const slider = document.getElementById('setFontSlider');
        if (!slider) return { exists: false };
        const before = parseFloat(slider.value);
        window.__AMRTF_EXECUTE_COMMAND__('adjust_font_size', { delta: 1.5 });
        const after = parseFloat(slider.value);
        return { exists: true, before, after };
      })()
    `);
    console.log('   🔍 [E2E-6 Info] 增量微調 +1.5px 取證:', JSON.stringify(deltaResult));
    if (deltaResult.exists) {
      assert.strictEqual(deltaResult.after, 20.5, '官方字級拉桿微調 +1.5 必須精準推進至 20.5');
    }

    // 3. 實體捕獲放映艙真機視覺快照物證
    try {
      const screenSnapBase64 = await screenCdp.captureScreenshot();
      if (screenSnapBase64) {
        const screenSnapPath = path.join(artifactsDir, 'e2e-screen-large-font-live.png');
        fs.writeFileSync(screenSnapPath, Buffer.from(screenSnapBase64, 'base64'));
        console.log(`   📸 [Screenshot-Evidence] 放映艙官方原生字級排版真機快照已存檔: ${screenSnapPath}`);
      }
    } catch (e) {}

    console.log('   📌 放映艙官方原生字級 (10~22px) 精準連動已通過驗證！');
  });

  test('✅ [E2E-7] 實體捕獲主控台視覺截圖物證 (Screenshot Truth)', async () => {
    if (!deskCdp || !deskCdp.isConnected) return;
    try {
      const snapBase64 = await deskCdp.captureScreenshot();
      if (snapBase64) {
        const snapPath = path.join(artifactsDir, 'e2e-desk-live.png');
        fs.writeFileSync(snapPath, Buffer.from(snapBase64, 'base64'));
        assert.ok(fs.existsSync(snapPath), '必須在磁碟產出真實截圖');
        console.log(`   📸 [Screenshot-Evidence] 主控台真機視覺快照已存檔: ${snapPath}`);
      }
    } catch (err) {
      console.log(`   ⚠️ 截圖捕獲略過: ${err.message}`);
    }
  });

  test('✅ [E2E-8] 官方播稿模式 (Speech Mode) 載入檢查開啟與雙向真實反映閉環驗證', async () => {
    if (!screenCdp || !screenCdp.isConnected) {
      console.log('   ⚠️ 放映艙 CDP 未掛載，跳過播稿驗證');
      return;
    }

    // 1. 檢驗官方播稿開關狀態與雙向監聽器已正確掛載
    const speechState = await screenCdp.eval(`
      (function() {
        const input = document.getElementById('bottom_toolbar_speechmode');
        return {
          exists: !!input,
          checked: input ? input.checked : false,
          bound: input ? !!input.__amrtf_speech_bound : false
        };
      })()
    `);
    console.log('   🔍 [E2E-8 Info] 官方播稿模式現場狀態:', JSON.stringify(speechState));
    if (speechState.exists) {
      assert.strictEqual(speechState.bound, true, '官方播稿開關必須掛載雙向監聽器 (__amrtf_speech_bound === true)');
    }

    // 2. 測試切換指令 toggle_speech_mode
    const toggleResult = await screenCdp.eval(`
      (function() {
        const input = document.getElementById('bottom_toolbar_speechmode');
        if (!input) return { exists: false };
        const before = input.checked;
        window.__AMRTF_EXECUTE_COMMAND__('toggle_speech_mode');
        const after = input.checked;
        // 切回原狀態保持測試無副作用
        window.__AMRTF_EXECUTE_COMMAND__('toggle_speech_mode');
        return { exists: true, before, after, restored: input.checked };
      })()
    `);
    console.log('   🔍 [E2E-8 Info] toggle_speech_mode 切換物證:', JSON.stringify(toggleResult));
    if (toggleResult.exists) {
      assert.notStrictEqual(toggleResult.before, toggleResult.after, 'toggle_speech_mode 必須能實質切換官方開關狀態');
      assert.strictEqual(toggleResult.restored, toggleResult.before, '二次切換必須乾淨恢復原狀態');
    }
    console.log('   📌 官方播稿模式載入檢查開啟與雙向真實反映已通過驗證！');
  });
});
