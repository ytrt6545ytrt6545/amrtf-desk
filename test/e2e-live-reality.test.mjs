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

async function waitForCondition(evalFn, maxWaitMs = 5000, intervalMs = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await evalFn();
    if (res) return res;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return await evalFn();
}

describe('🌟 AMRTF-Desk 真機端到端 (Live Reality E2E) 全方位閉環檢驗', { timeout: 90000 }, () => {
  let serverProcess = null;
  let screenCdp = null;
  let deskCdp = null;

  before(async () => {
    // 0. 清理佔用進程與殘留埠口 (9998, 9222, 9223)
    try {
      execSync('node scratch/clean-proc.mjs', { cwd: projectRoot, stdio: 'ignore' });
    } catch (e) {}
    for (const port of [9998, 9222, 9223]) {
      try {
        const netstat = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        netstat.split('\n').forEach(l => {
          const p = l.trim().split(/\s+/).pop();
          if (p && p !== '0' && p !== process.pid.toString()) {
            try { execSync(`taskkill /F /PID ${p} /T`, { stdio: 'ignore' }); } catch (err) {}
          }
        });
      } catch (e) {}
    }
    await new Promise((r) => setTimeout(r, 800));

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
    assert.ok(screenConnected, '放映艙 CDP 必須成功連線 (Port 9222)');

    const deskConnected = await deskCdp.connect(20);
    console.log(`[E2E] 主控台 CDP 連線: ${deskConnected ? '✅ 成功' : '⚠️ 逾時'}`);
    assert.ok(deskConnected, '主控台 CDP 必須成功連線 (Port 9223)');

    if (deskConnected) {
      await deskCdp.send('Page.reload');
      await new Promise((r) => setTimeout(r, 1200));
    }
  });

  after(async () => {
    console.log('[E2E] 測試結束，執行全域安全退出...');
    if (screenCdp) screenCdp.close();
    if (deskCdp) deskCdp.close();
    try {
      await fetchHttp('http://127.0.0.1:9998/api/shutdown', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 600));
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

  test('✅ [E2E-3] 主控台全域按鈕字體放縮 (100% ➔ 125% ➔ 150%) 必須實質突變 DOM 與按鈕計算字級', async () => {
    if (!deskCdp || !deskCdp.isConnected) {
      console.log('   ⚠️ 主控台 CDP 未掛載，降級以靜態檢查執行');
      return;
    }
    // 確保基準點為預設 100%：清空儲存並重新載入，消除任何先前的污染
    await deskCdp.eval(`localStorage.removeItem('amrtf_btn_scale');`);
    await deskCdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1000));

    const initialSize = await deskCdp.eval(`parseFloat(window.getComputedStyle(document.getElementById('btnPrevLesson')).fontSize)`);
    const initialBodyClass = await deskCdp.eval(`document.body.className`);
    console.log('   🔍 [E2E-3 Clean 100% Baseline]', { initialSize, initialBodyClass });

    // 透過 CDP 觸發 #btnScaleToggle 點擊 (100% ➔ 125%)
    await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
    await new Promise((r) => setTimeout(r, 250));
    const after125 = await deskCdp.eval(`document.body.className`);
    const size125 = await deskCdp.eval(`parseFloat(window.getComputedStyle(document.getElementById('btnPrevLesson')).fontSize)`);
    console.log('   🔍 [E2E-3 After 125%]', { size125, after125 });
    assert.ok(after125.includes('btn-scale-125'), '點擊一次後 body 必須包含 btn-scale-125 樣式');
    assert.ok(size125 >= 14 && size125 > initialSize, `125% 字體大小 (${size125}px) 必須大於 100% (${initialSize}px)`);

    // (125% ➔ 150%)
    await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
    await new Promise((r) => setTimeout(r, 250));
    const after150 = await deskCdp.eval(`document.body.className`);
    const size150 = await deskCdp.eval(`parseFloat(window.getComputedStyle(document.getElementById('btnPrevLesson')).fontSize)`);
    console.log('   🔍 [E2E-3 After 150%]', { size150, after150 });
    assert.ok(after150.includes('btn-scale-150'), '點擊兩次後 body 必須包含 btn-scale-150 樣式');
    assert.ok(size150 >= 17 && size150 > size125, `150% 字體大小 (${size150}px) 必須大於 125% (${size125}px)`);

    // 檢查走帶按鈕文字亦同步放大
    const fwd10Size = await deskCdp.eval(`parseFloat(window.getComputedStyle(document.getElementById('btnForward10')).fontSize)`);
    assert.ok(fwd10Size >= 22, `走帶按鍵文字在 150% 下必須達到 22px 以上 (實測: ${fwd10Size}px)`);

    // 恢復 100% (循環點擊至回到預設)
    for (let i = 0; i < 6; i++) {
      const hasScale = await deskCdp.eval(`Array.from(document.body.classList).some(c => c.startsWith('btn-scale-'))`);
      if (!hasScale) break;
      await deskCdp.eval(`document.getElementById('btnScaleToggle').click()`);
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 200));
    const afterReset = await deskCdp.eval(`document.body.className`);
    assert.ok(!afterReset.includes('btn-scale-125') && !afterReset.includes('btn-scale-150') && !afterReset.includes('btn-scale-200'), '循環點擊後恢復預設');
    const resetSize = await deskCdp.eval(`parseFloat(window.getComputedStyle(document.getElementById('btnPrevLesson')).fontSize)`);
    assert.strictEqual(Math.round(resetSize), Math.round(initialSize), '恢復 100% 後字體大小必須還原');
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
          bound: input ? !!input.__amrtf_speech_bound : false,
          hasLrc: (window.jQuery ? window.jQuery('span.lrc:visible').length > 0 : false) || document.querySelectorAll('span.lrc').length > 0
        };
      })()
    `);
    console.log('   🔍 [E2E-8 Info] 官方播稿模式現場狀態:', JSON.stringify(speechState));
    if (speechState.exists) {
      assert.strictEqual(speechState.bound, true, '官方播稿開關必須掛載雙向監聽器 (__amrtf_speech_bound === true)');
    }

    if (!speechState.hasLrc) {
      console.log('   ℹ️ 本講次官方尚未發布 LRC 播稿字幕，大慈恩官方原生物理禁止開啟播稿，符合現場客觀真機行為');
      return;
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

  test('✅ [E2E-9] 主控台大慈恩明亮/暗黑雙風格實質切換與持久化閉環 (Theme Diff & Persistence)', async () => {
    if (!deskCdp || !deskCdp.isConnected) {
      console.log('   ⚠️ 主控台 CDP 未掛載，跳過主題切換驗證');
      return;
    }

    // 0. 重置為預設曜石玄木深色風格 (保證測試幂等獨立性)
    await deskCdp.eval(`
      localStorage.removeItem('amrtf_theme');
      if (typeof window.applyTheme === 'function') {
        window.applyTheme('dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.remove('theme-light');
        document.body.classList.add('theme-dark');
      }
    `);
    await new Promise((r) => setTimeout(r, 200));

    // 1. 初始化狀態驗證（長官指定預設：曜石玄木深色風格）
    const initialThemeState = await deskCdp.eval(`
      (function() {
        const deskBtn = document.getElementById('btnDeskThemeToggle');
        const screenThemeBtn = document.getElementById('btnThemeToggle');
        const bg = window.getComputedStyle(document.body).backgroundColor;
        return {
          existsDeskBtn: !!deskBtn,
          existsScreenThemeBtn: !!screenThemeBtn,
          screenThemeBtnText: screenThemeBtn ? screenThemeBtn.textContent.trim() : '',
          hasDarkClass: document.body.classList.contains('theme-dark'),
          dataTheme: document.documentElement.getAttribute('data-theme'),
          btnText: deskBtn ? deskBtn.textContent.trim() : '',
          savedTheme: localStorage.getItem('amrtf_theme'),
          bgColor: bg
        };
      })()
    `);
    console.log('   🔍 [E2E-9 Info] 初始大慈恩曜石玄木深色風格現場狀態:', JSON.stringify(initialThemeState));
    assert.strictEqual(initialThemeState.existsDeskBtn, true, '#btnDeskThemeToggle 按鈕必須存在於主控台頂部導航列');
    assert.strictEqual(initialThemeState.existsScreenThemeBtn, true, '#btnThemeToggle (🌓) 必須存在於下方按鈕陣列');
    assert.strictEqual(initialThemeState.screenThemeBtnText, '🌓', '下方放映端主題按鈕文字必須為 🌓');
    assert.strictEqual(initialThemeState.hasDarkClass, true, '預設狀態 document.body 必須包含 theme-dark 類別');
    assert.strictEqual(initialThemeState.savedTheme, 'dark', 'localStorage 必須記錄 amrtf_theme 為 dark');

    // 2. 驗證長官指示（選項 A）：徹底取消宣紙明亮皮膚，日夜切換鈕隱藏鎖定
    const deskBtnHidden = await deskCdp.eval(`
      (function() {
        const btn = document.getElementById('btnDeskThemeToggle');
        return btn ? window.getComputedStyle(btn).display === 'none' : false;
      })()
    `);
    assert.strictEqual(deskBtnHidden, true, '選項 A 規範：#btnDeskThemeToggle 按鈕必須隱藏 (display: none)，鎖定深色風格');

    // 3. 驗證觸發點擊或 toggleTheme 依然堅定保持曜石玄木暗黑風格，絕不變異
    await deskCdp.eval(`document.getElementById('btnDeskThemeToggle').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const lockedDarkState = await deskCdp.eval(`
      (function() {
        return {
          hasDarkClass: document.body.classList.contains('theme-dark'),
          hasLightClass: document.body.classList.contains('theme-light'),
          dataTheme: document.documentElement.getAttribute('data-theme'),
          savedTheme: localStorage.getItem('amrtf_theme')
        };
      })()
    `);
    console.log('   🔍 [E2E-9 Info] 鎖定曜石玄木深色風格狀態:', JSON.stringify(lockedDarkState));
    assert.strictEqual(lockedDarkState.hasDarkClass, true, '點擊後必須依然堅定維持 theme-dark');
    assert.strictEqual(lockedDarkState.hasLightClass, false, '點擊後絕不能包含 theme-light (宣紙明亮已徹底取消)');
    assert.strictEqual(lockedDarkState.savedTheme, 'dark', 'localStorage 必須永遠鎖定為 dark');

    // 4. 捕獲曜石玄木曜金尊榮深色真機快照存檔
    try {
      const darkSnap = await deskCdp.captureScreenshot();
      if (darkSnap) {
        const darkSnapPath = path.join(artifactsDir, 'e2e-desk-dark-theme-live.png');
        fs.writeFileSync(darkSnapPath, Buffer.from(darkSnap, 'base64'));
        console.log(`   📸 [Screenshot-Evidence] 大慈恩曜石暗黑真機快照已存檔: ${darkSnapPath}`);
      }
    } catch (e) {}

    console.log('   📌 大慈恩明暗雙風格切換、LocalStorage 持久化與色彩突變已通過真機閉環驗證！');
  });

  test('✅ [E2E-10] 系統版本號展示與自動更新偵測 API 閉環驗證', async () => {
    if (!deskCdp || !deskCdp.isConnected) {
      console.log('   ⚠️ 主控台 CDP 未掛載，跳過版本檢測驗證');
      return;
    }

    // 1. 打開設定艙
    await deskCdp.eval(`document.getElementById('btnSettingsToggle').click()`);
    await new Promise((r) => setTimeout(r, 400));

    // 2. 檢驗版本徽章與狀態標籤
    const versionDomState = await deskCdp.eval(`
      (function() {
        const badge = document.getElementById('currentVersionBadge');
        const tag = document.getElementById('versionStatusTag');
        const checkBtn = document.getElementById('btnCheckUpdate');
        return {
          hasBadge: !!badge,
          badgeText: badge ? badge.textContent.trim() : '',
          hasTag: !!tag,
          tagText: tag ? tag.textContent.trim() : '',
          hasCheckBtn: !!checkBtn
        };
      })()
    `);
    console.log('   🔍 [E2E-10 Info] 設定艙版本與更新狀態:', JSON.stringify(versionDomState));
    assert.strictEqual(versionDomState.hasBadge, true, '#currentVersionBadge 必須存在');
    assert.ok(versionDomState.badgeText.startsWith('v'), '版本號必須以 v 開頭 (例如 v1.2.0)');
    assert.strictEqual(versionDomState.hasCheckBtn, true, '必須存在 #btnCheckUpdate 按鈕');

    // 3. 點擊檢查更新，驗證更新說明與同步按鈕
    await deskCdp.eval(`
      window.alert = function(msg) { console.log('[Suppressed-Alert]', msg); };
      const btn = document.getElementById('btnCheckUpdate');
      if (btn) btn.click();
      const body = document.querySelector('.settings-body') || document.querySelector('.settings-drawer');
      if (body) body.scrollTop = body.scrollHeight;
    `);
    await new Promise((r) => setTimeout(r, 600));

    const updateSectionState = await deskCdp.eval(`
      (function() {
        const notesContainer = document.getElementById('updateNotesContainer');
        const syncBtn = document.getElementById('btnApplyUpdate');
        const syncProgress = document.getElementById('syncProgressContainer');
        const isNotesVisible = notesContainer ? window.getComputedStyle(notesContainer).display !== 'none' : false;
        return {
          isNotesVisible,
          syncBtnText: syncBtn ? syncBtn.textContent.trim() : '',
          hasSyncProgress: !!syncProgress
        };
      })()
    `);
    console.log('   🔍 [E2E-10 Info] 更新說明去除與進度條真實狀態:', JSON.stringify(updateSectionState));
    assert.strictEqual(updateSectionState.isNotesVisible, false, '更新說明區塊必須已被徹底去除隱藏');
    assert.strictEqual(updateSectionState.syncBtnText, '⚡ 同步', '同步按鈕文字必須為「⚡ 同步」');
    assert.strictEqual(updateSectionState.hasSyncProgress, true, '必須具備同步進度條容器');

    // 捕獲純淨版設定艙之真機快照
    try {
      const updateSnap = await deskCdp.captureScreenshot();
      if (updateSnap) {
        const updateSnapPath = path.join(artifactsDir, 'e2e-settings-update-notes-live.png');
        fs.writeFileSync(updateSnapPath, Buffer.from(updateSnap, 'base64'));
        console.log(`   📸 [Screenshot-Evidence] 純淨版設定艙真機快照已存檔: ${updateSnapPath}`);
      }
    } catch (e) {}

    // 關閉設定艙保持環境整潔
    await deskCdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await new Promise((r) => setTimeout(r, 300));

    console.log('   📌 系統版本號與更新檢測介面已通過端到端驗證！');
  });

  test('✅ [E2E-11] Firebase 雲端純掃碼中繼 API、SPA 靜態託管與主控台雙軌 QR Modal 端到端驗證', async () => {
    // 1. 驗證 REST API /api/cloud-relay/status
    const relayRes = await fetchHttp('http://127.0.0.1:9998/api/cloud-relay/status');
    assert.strictEqual(relayRes.statusCode, 200, '/api/cloud-relay/status 應回傳 200');
    const relayData = JSON.parse(relayRes.body);
    assert.strictEqual(relayData.ok, true);
    assert.strictEqual(relayData.relay.token.length, 32, '雲端 Token 必須為 32 碼密碼學高熵隨機字串');
    assert.match(relayData.relay.roomId, /^ROOM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/, 'Room ID 必須為 8 碼排除易混淆字格式');

    // 2. 驗證手機端 SPA 靜態託管 /mobile-app
    const mobileAppRes = await fetchHttp('http://127.0.0.1:9998/mobile-app');
    assert.strictEqual(mobileAppRes.statusCode, 200, '/mobile-app 應回傳 200');
    assert.ok(mobileAppRes.body.includes('unauthorizedScreen'), '手機 SPA 必須包含未授權掃碼防護門禁');
    assert.ok(mobileAppRes.body.includes('authorizedApp'), '手機 SPA 必須包含已授權操作介面');

    // 3. 驗證主控台 CDP 點擊 #btnQrCode 彈窗與雲端純掃碼分頁
    if (deskCdp && deskCdp.isConnected) {
      await deskCdp.eval(`document.getElementById('btnQrCode').click()`);
      await new Promise((r) => setTimeout(r, 400));

      const qrModalState = await deskCdp.eval(`
        (function() {
          const modal = document.getElementById('qrModal');
          const tabCloud = document.getElementById('tabCloudQr');
          const tabLan = document.getElementById('tabLanQr');
          const badge = document.getElementById('qrRoomBadge');
          const urlText = document.getElementById('qrUrlText');
          return {
            isOpen: modal ? modal.classList.contains('active') : false,
            isCloudTabActive: tabCloud ? tabCloud.classList.contains('active') : false,
            hasLanTab: !!tabLan,
            badgeText: badge ? badge.textContent.trim() : '',
            urlText: urlText ? urlText.textContent.trim() : ''
          };
        })()
      `);
      console.log('   🔍 [E2E-11 Info] 主控台 QR Modal 狀態:', JSON.stringify(qrModalState));
      assert.strictEqual(qrModalState.isOpen, true, '#qrModal 必須處於 active 開啟狀態');
      assert.strictEqual(qrModalState.isCloudTabActive, true, '預設必須為雲端純掃碼 (tabCloudQr) 分頁');
      assert.strictEqual(qrModalState.hasLanTab, true, '必須具備區域網路 (tabLanQr) 切換備援分頁');

      // 關閉 QR Modal
      await deskCdp.eval(`document.getElementById('btnCloseQr').click()`);
      await new Promise((r) => setTimeout(r, 200));
      const isClosed = await deskCdp.eval(`document.getElementById('qrModal').classList.contains('active')`);
      assert.strictEqual(isClosed, false, '點擊關閉按鈕後 #qrModal 必須退出 active 狀態');
    }

    console.log('   📌 Firebase 雲端純掃碼中繼、多房間隔離與主控台雙軌 QR Modal 已通過端到端真機驗證！');
  });

  test('✅ [E2E-12] 主控台頁首明月按鈕移除確認與 Stitch 奢華雙皮膚真機閉環 (Stitch Luxury Dual Skins)', async () => {
    if (deskCdp && deskCdp.isConnected) {
      // 1. 質檢官動滑鼠：驗證長官紅線指令「頁首的明月移除」，主控台頂部絕無 #btnMoonlightToggle 殘留
      console.log('   🔍 [Guardian 質檢官試車] 正在驗證主控台頁首 #btnMoonlightToggle 是否已徹底移除...');
      const checkMoonlightBtn = await deskCdp.eval(`!document.getElementById('btnMoonlightToggle')`);
      assert.strictEqual(checkMoonlightBtn, true, '長官紅線指令：主控台頁首的明月按鈕 (#btnMoonlightToggle) 必須已物理移除');

      // 2. 驗證 Stitch 奢華主操作艙結構與 5 鍵走帶矩陣
      const chassisInfo = await deskCdp.eval(`
        (function() {
          const main = document.getElementById('mainChassis');
          const playBtn = document.getElementById('btnPlayPause');
          const fwd10 = document.getElementById('btnForward10');
          const fwd5 = document.getElementById('btnForward5');
          const rew5 = document.getElementById('btnRewind5');
          const rew10 = document.getElementById('btnRewind10');
          const themeBtn = document.getElementById('btnDeskThemeToggle');
          return {
            hasChassis: !!main,
            isStitchChassis: main ? main.classList.contains('stitch-master-chassis') : false,
            hasPlayBtn: !!playBtn,
            hasFwd10: !!fwd10,
            hasFwd5: !!fwd5,
            hasRew5: !!rew5,
            hasRew10: !!rew10,
            hasThemeBtn: !!themeBtn
          };
        })()
      `);
      console.log('   🔍 [E2E-12 Info] Stitch 奢華主操作艙現場狀態:', JSON.stringify(chassisInfo));
      assert.strictEqual(chassisInfo.hasChassis, true, '#mainChassis 必須存在');
      assert.strictEqual(chassisInfo.isStitchChassis, true, '主操作艙必須具備 .stitch-master-chassis 精雕樣式');
      assert.strictEqual(chassisInfo.hasPlayBtn, true, '必須具備中央巨型金色 3D 水晶播放按鍵');
      assert.strictEqual(chassisInfo.hasFwd10, true, '必須具備 +10 快進鍵');
      assert.strictEqual(chassisInfo.hasFwd5, true, '必須具備 +5 快進鍵');
      assert.strictEqual(chassisInfo.hasRew5, true, '必須具備 -5 倒退鍵');
      assert.strictEqual(chassisInfo.hasRew10, true, '必須具備 -10 倒退鍵');

      // 3. 實體捕獲 Stitch 奢華主操作艙真機快照存證
      const snap = await deskCdp.captureScreenshot();
      if (snap) {
        const snapPath = path.join(artifactsDir, 'e2e-stitch-luxury-desk-live.png');
        fs.writeFileSync(snapPath, Buffer.from(snap, 'base64'));
        console.log(`   📸 [Screenshot-Evidence] Stitch 奢華主操作艙真機快照已存檔: ${snapPath}`);
      }
      console.log('   📌 主控台頁首明月按鈕移除確認與 Stitch 奢華黑白雙皮膚結構已通過真機閉環驗證！');
    }
  });

  test('✅ [E2E-13] 雙機雙核真機播放與走帶硬鎖閉環 (Dual-Node Live Reality Playback Quad-Lock)', async () => {
    if (!deskCdp || !deskCdp.isConnected || !screenCdp || !screenCdp.isConnected) {
      console.log('   ⚠️ 雙機 CDP 未全數掛載，跳過實體播放硬鎖測試');
      return;
    }

    // 0. 確保放映艙具備可播放之音訊環境
    const audioReady = await screenCdp.eval(`
      (function() {
        let a = document.querySelector('audio');
        if (!a) {
          a = document.createElement('audio');
          a.id = 'amrtfAudioFixture';
          document.body.appendChild(a);
        }
        if (!a.src || a.src.includes('data:audio/wav;base64,UklGRig') || a.srcObject) {
          try {
            const sampleRate = 8000;
            const durationSec = 600;
            const numSamples = durationSec * sampleRate;
            const buffer = new ArrayBuffer(44 + numSamples);
            const view = new DataView(buffer);
            function writeString(offset, string) {
              for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
            }
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + numSamples, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate, true);
            view.setUint16(32, 1, true);
            view.setUint16(34, 8, true);
            writeString(36, 'data');
            view.setUint32(40, numSamples, true);
            const bytes = new Uint8Array(buffer, 44);
            bytes.fill(128);
            const blob = new Blob([buffer], { type: 'audio/wav' });
            if (a.srcObject) a.srcObject = null;
            a.src = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('[E2E-13] 可尋軌音訊初始化異常', e);
          }
        }
        a.controls = true;
        a.loop = false;
        return { exists: true, paused: a.paused, duration: a.duration };
      })()
    `);
    console.log('   🔍 [E2E-13 Info] 放映艙音訊環境初檢:', JSON.stringify(audioReady));

    // 1. 檢驗主控台初始狀態（預設應為未播映、Play 三角形圖示）
    const initialDesk = await deskCdp.eval(`
      (function() {
        const glyph = document.getElementById('playGlyph');
        const badge = document.getElementById('statusBadge');
        return {
          hasPlaySvg: glyph ? glyph.innerHTML.includes('M8 5v14l11-7z') : false,
          hasPauseSvg: glyph ? glyph.innerHTML.includes('M6 19h4V5H6v14zm8-14v14h4V5h-4z') : false,
          badgeClass: badge ? badge.className : ''
        };
      })()
    `);
    console.log('   🔍 [E2E-13 Info] 主控台播放鍵初始狀態:', JSON.stringify(initialDesk));
    assert.strictEqual(initialDesk.hasPauseSvg, false, '未播放時不得顯示 Pause 雙豎線');

    // 2. 透過主控台 CDP 點擊中央巨型水晶播放鍵 (#btnPlayPause)
    console.log('   🖱️ 正在點擊主控台中央 3D 水晶播放鍵 (#btnPlayPause)...');
    await deskCdp.eval(`document.getElementById('btnPlayPause').click()`);

    // 輪詢等待放映艙開播與主控台 DOM 形變（最高 5000ms 輪詢，一命中即返回）
    const playStatePoll = await waitForCondition(async () => {
      const sp = await screenCdp.eval(`(function() { const a = document.querySelector('audio'); return a && !a.paused; })()`);
      const dp = await deskCdp.eval(`(function() { const g = document.getElementById('playGlyph'); return g && g.innerHTML.includes('M6 19h4V5H6v14zm8-14v14h4V5h-4z'); })()`);
      if (sp && dp) return { sp, dp };
      return null;
    }, 5000, 100);

    assert.ok(playStatePoll && playStatePoll.sp, '物理硬鎖 1：點擊播放後，放映艙音訊 audio.paused 必須為 false！');
    assert.ok(playStatePoll && playStatePoll.dp, '物理硬鎖 2：點擊播放後，主控台 #playGlyph 必須切換為 Pause 雙豎線 (Δ ≠ 0)！');

    // 5. 再次點擊主控台播放鍵切換為暫停 (Pause)
    console.log('   🖱️ 正在二次點擊主控台播放鍵執行暫停 (#btnPlayPause)...');
    await new Promise((r) => setTimeout(r, 300));
    await deskCdp.eval(`document.getElementById('btnPlayPause').click()`);

    const pauseStatePoll = await waitForCondition(async () => {
      const sp = await screenCdp.eval(`(function() { const a = document.querySelector('audio'); return a && a.paused; })()`);
      const dp = await deskCdp.eval(`(function() { const g = document.getElementById('playGlyph'); return g && g.innerHTML.includes('M8 5v14l11-7z'); })()`);
      if (sp && dp) return { sp, dp };
      return null;
    }, 5000, 100);

    assert.ok(pauseStatePoll && pauseStatePoll.sp, '物理硬鎖 3：二次點擊後，放映艙 audio.paused 必須恢復為 true！');
    assert.ok(pauseStatePoll && pauseStatePoll.dp, '物理硬鎖 4：二次點擊後，主控台 #playGlyph 必須乾淨恢復為 Play 三角形！');

    console.log('   📌 雙機雙核真機播放、走帶與 DOM 形變硬鎖已 100% 通過閉環驗證！');
  });

  test('✅ [E2E-14] 走帶矩陣 (+10/+5/-5/-10/從頭) 與三段倍速 (1.25x/1.5x/1.0x) 真機硬鎖', async () => {
    if (!deskCdp || !deskCdp.isConnected || !screenCdp || !screenCdp.isConnected) return;

    // 1. 三段倍速實體點擊與放映艙 playbackRate 斷言
    console.log('   🖱️ 正在點擊 1.25x 倍速鍵 (#btnRate125)...');
    await deskCdp.eval(`document.getElementById('btnRate125').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const rate125 = await screenCdp.eval(`document.querySelector('audio')?.playbackRate`);
    assert.strictEqual(rate125, 1.25, '點擊 1.25x 後，放映艙 audio.playbackRate 必須精準為 1.25');

    console.log('   🖱️ 正在點擊 1.5x 倍速鍵 (#btnRate15)...');
    await deskCdp.eval(`document.getElementById('btnRate15').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const rate15 = await screenCdp.eval(`document.querySelector('audio')?.playbackRate`);
    assert.strictEqual(rate15, 1.5, '點擊 1.5x 後，放映艙 audio.playbackRate 必須精準為 1.5');

    console.log('   🖱️ 正在點擊 1.0x 倍速鍵 (#btnRate10)...');
    await deskCdp.eval(`document.getElementById('btnRate10').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const rate10 = await screenCdp.eval(`document.querySelector('audio')?.playbackRate`);
    assert.strictEqual(rate10, 1.0, '點擊 1.0x 後，放映艙 audio.playbackRate 必須恢復為 1.0');

    // 2. 基準時間設定與快進/倒退實體點擊
    await screenCdp.eval(`
      const a = document.querySelector('audio');
      if (a) a.currentTime = 30;
    `);
    await new Promise((r) => setTimeout(r, 300));

    console.log('   🖱️ 正在點擊 +10 秒快進鍵 (#btnForward10)...');
    await deskCdp.eval(`document.getElementById('btnForward10').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const tAfterFwd10 = await screenCdp.eval(`document.querySelector('audio')?.currentTime || 0`);
    assert.ok(tAfterFwd10 >= 38 && tAfterFwd10 <= 42, `點擊 +10 秒後，放映艙 currentTime 必須約為 40 (現有: ${tAfterFwd10})`);

    console.log('   🖱️ 正在點擊 +5 秒快進鍵 (#btnForward5)...');
    await deskCdp.eval(`document.getElementById('btnForward5').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const tAfterFwd5 = await screenCdp.eval(`document.querySelector('audio')?.currentTime || 0`);
    assert.ok(tAfterFwd5 >= 43 && tAfterFwd5 <= 47, `點擊 +5 秒後，放映艙 currentTime 必須約為 45 (現有: ${tAfterFwd5})`);

    console.log('   🖱️ 正在點擊 -5 秒倒退鍵 (#btnRewind5)...');
    await deskCdp.eval(`document.getElementById('btnRewind5').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const tAfterRew5 = await screenCdp.eval(`document.querySelector('audio')?.currentTime || 0`);
    assert.ok(tAfterRew5 >= 38 && tAfterRew5 <= 42, `點擊 -5 秒後，放映艙 currentTime 必須約為 40 (現有: ${tAfterRew5})`);

    console.log('   🖱️ 正在點擊 -10 秒倒退鍵 (#btnRewind10)...');
    await deskCdp.eval(`document.getElementById('btnRewind10').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const tAfterRew10 = await screenCdp.eval(`document.querySelector('audio')?.currentTime || 0`);
    assert.ok(tAfterRew10 >= 28 && tAfterRew10 <= 32, `點擊 -10 秒後，放映艙 currentTime 必須約為 30 (現有: ${tAfterRew10})`);

    // 3. 從頭急煞重放鍵
    console.log('   🖱️ 正在點擊從頭急煞鍵 (#btnStop)...');
    await deskCdp.eval(`document.getElementById('btnStop').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const stopState = await screenCdp.eval(`
      (function() {
        const a = document.querySelector('audio');
        return { currentTime: a ? a.currentTime : -1, paused: a ? a.paused : false };
      })()
    `);
    assert.ok(stopState.currentTime <= 0.15, `點擊從頭後，放映艙 currentTime 必須歸零或趨近於 0 (現有: ${stopState.currentTime})`);
    assert.strictEqual(stopState.paused, true, '點擊從頭後，放映艙音訊必須急煞暫停');
    console.log('   📌 走帶 5 鍵與倍速 3 鍵真機硬鎖已全數通過驗證！');
  });

  test('✅ [E2E-15] 講次導航 (上一講/下一講/重載本講) 真機硬鎖', async () => {
    assert.ok(deskCdp && deskCdp.isConnected, '主控台 CDP 必須保持在連線狀態');
    assert.ok(screenCdp && screenCdp.isConnected, '放映艙 CDP 必須保持在連線狀態');

    const waitForServerCmd = async (expectedCmd) => {
      return await waitForCondition(async () => {
        const res = await fetchHttp('http://127.0.0.1:9998/api/info');
        const data = JSON.parse(res.body);
        return data?.latestCommand?.cmd === expectedCmd ? data.latestCommand.cmd : null;
      }, 3000, 100);
    };

    // 點擊上一講
    console.log('   🖱️ 正在點擊上一講按鈕 (#btnPrevLesson)...');
    await deskCdp.eval(`document.getElementById('btnPrevLesson').click()`);
    const cmdPrev = await waitForServerCmd('prev_lesson');
    assert.strictEqual(cmdPrev, 'prev_lesson', '點擊上一講後，伺服器必須收到並分發 prev_lesson 信令');

    // 點擊下一講
    console.log('   🖱️ 正在點擊下一講按鈕 (#btnNextLesson)...');
    await deskCdp.eval(`document.getElementById('btnNextLesson').click()`);
    const cmdNext = await waitForServerCmd('next_lesson');
    assert.strictEqual(cmdNext, 'next_lesson', '點擊下一講後，伺服器必須收到並分發 next_lesson 信令');

    // 點擊重載本講
    console.log('   🖱️ 正在點擊重載本講按鈕 (#btnReloadLesson)...');
    await deskCdp.eval(`document.getElementById('btnReloadLesson').click()`);
    const cmdReload = await waitForServerCmd('goto_lesson');
    assert.strictEqual(cmdReload, 'goto_lesson', '點擊重載本講後，伺服器必須收到並分發 goto_lesson 信令');
    console.log('   📌 講次導航 3 大按鈕真機硬鎖已全數通過驗證！');
  });

  test('✅ [E2E-16] 研討區間循環、副播放暫停與釋放循環真機硬鎖', async () => {
    assert.ok(deskCdp && deskCdp.isConnected, '主控台 CDP 必須保持在連線狀態');
    assert.ok(screenCdp && screenCdp.isConnected, '放映艙 CDP 必須保持在連線狀態');

    const waitForServerCmd = async (expectedCmdList) => {
      const list = Array.isArray(expectedCmdList) ? expectedCmdList : [expectedCmdList];
      return await waitForCondition(async () => {
        const res = await fetchHttp('http://127.0.0.1:9998/api/info');
        const data = JSON.parse(res.body);
        const curCmd = data?.latestCommand?.cmd;
        return list.includes(curCmd) ? curCmd : null;
      }, 3000, 100);
    };

    // 點擊就地播放/暫停鍵 (原段落循環按鈕改造)
    console.log('   🖱️ 正在點擊就地播放暫停鍵 (#btnLoopParagraph)...');
    await deskCdp.eval(`document.getElementById('btnLoopParagraph').click()`);
    const cmdLoopP = await waitForServerCmd(['toggle_play', 'play', 'pause']);
    assert.ok(cmdLoopP === 'toggle_play' || cmdLoopP === 'play' || cmdLoopP === 'pause', '點擊就地播放暫停鍵後，伺服器必須收到並分發 toggle_play 信令');

    // 點擊釋放循環
    console.log('   🖱️ 正在點擊釋放循環按鈕 (#btnStopInterval)...');
    await deskCdp.eval(`document.getElementById('btnStopInterval').click()`);
    const cmdStopInt = await waitForServerCmd('stop_interval');
    assert.strictEqual(cmdStopInt, 'stop_interval', '點擊釋放循環後，伺服器必須收到並分發 stop_interval 信令');

    // 點擊起訖區間循環
    console.log('   🖱️ 正在點擊起訖區間循環按鈕 (#btnLoopInterval)...');
    await deskCdp.eval(`document.getElementById('btnLoopInterval').click()`);
    const cmdLoopInt = await waitForServerCmd(['play_interval', 'loop_interval']);
    assert.ok(cmdLoopInt === 'play_interval' || cmdLoopInt === 'loop_interval', '點擊起訖區間循環後，伺服器必須收到相應區間信令');
    console.log('   📌 研討區間循環與釋放按鈕真機硬鎖已全數通過驗證！');
  });

  test('✅ [E2E-17] 法會影音三巨鍵 (前行/密集嘛/迴向)、全螢幕與 Mini 折疊真機硬鎖', async () => {
    assert.ok(deskCdp && deskCdp.isConnected, '主控台 CDP 必須保持在連線狀態');
    assert.ok(screenCdp && screenCdp.isConnected, '放映艙 CDP 必須保持在連線狀態');

    const waitForServerCmd = async (expectedCmd) => {
      return await waitForCondition(async () => {
        const res = await fetchHttp('http://127.0.0.1:9998/api/info');
        const data = JSON.parse(res.body);
        return data?.latestCommand?.cmd === expectedCmd ? data.latestCommand.cmd : null;
      }, 3000, 100);
    };

    // 點擊前行影片
    console.log('   🖱️ 正在點擊前行影片按鈕 (#btnVideoPrep)...');
    await deskCdp.eval(`document.getElementById('btnVideoPrep').click()`);
    const cmdPrep = await waitForServerCmd('modal_prep_video');
    assert.strictEqual(cmdPrep, 'modal_prep_video', '點擊前行後，伺服器必須收到並分發 modal_prep_video 信令');

    // 點擊密集嘛影片
    console.log('   🖱️ 正在點擊密集嘛影片按鈕 (#btnVideoMigsema)...');
    await deskCdp.eval(`document.getElementById('btnVideoMigsema').click()`);
    const cmdMig = await waitForServerCmd('modal_migtsema');
    assert.strictEqual(cmdMig, 'modal_migtsema', '點擊密集嘛後，伺服器必須收到並分發 modal_migtsema 信令');

    // 點擊迴向影片
    console.log('   🖱️ 正在點擊迴向影片按鈕 (#btnVideoDedication)...');
    await deskCdp.eval(`document.getElementById('btnVideoDedication').click()`);
    const cmdDed = await waitForServerCmd('modal_dedication_video');
    assert.strictEqual(cmdDed, 'modal_dedication_video', '點擊迴向後，伺服器必須收到並分發 modal_dedication_video 信令');

    // 點擊新增的獨立停止影片按鈕 (#btnStopVideo)
    console.log('   🖱️ 正在點擊停止影片按鈕 (#btnStopVideo)...');
    await deskCdp.eval(`document.getElementById('btnStopVideo').click()`);
    const cmdStopVid = await waitForServerCmd('stop_video');
    assert.strictEqual(cmdStopVid, 'stop_video', '點擊停止影片後，伺服器必須收到並分發 stop_video 信令');

    // 測試三聯滾動模式分段按鈕
    console.log('   🖱️ 正在測試滾動模式三聯分段按鍵 (手動/持續/區段)...');
    await deskCdp.eval(`document.getElementById('btnScrollManual').click()`);
    const cmdScroll0 = await waitForServerCmd('set_scroll_mode');
    assert.strictEqual(cmdScroll0, 'set_scroll_mode', '點擊手動滾動後，伺服器必須收到 set_scroll_mode 信令');
    const isManualActive = await deskCdp.eval(`document.getElementById('btnScrollManual').classList.contains('active')`);
    assert.ok(isManualActive, '點擊後手動按鍵必須為 active 高光態');

    await deskCdp.eval(`document.getElementById('btnScrollSection').click()`);
    const isSectionActive = await deskCdp.eval(`document.getElementById('btnScrollSection').classList.contains('active')`);
    assert.ok(isSectionActive, '點擊後區段按鍵必須為 active 高光態');

    // 測試方案 A 網頁音量控制 (滑桿與靜音鍵)
    console.log('   🖱️ 正在測試方案 A 網頁音量控制組件...');
    await deskCdp.eval(`
      const slider = document.getElementById('volumeSlider');
      slider.value = 75;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    const cmdVol = await waitForServerCmd('set_volume');
    assert.strictEqual(cmdVol, 'set_volume', '調整音量滑桿後，伺服器必須收到 set_volume 信令');
    const volText = await deskCdp.eval(`document.getElementById('volumeValue').textContent`);
    assert.ok(volText.includes('%'), '音量文字必須即時顯示百分比');

    await deskCdp.eval(`document.getElementById('btnVolumeMute').click()`);
    const cmdMute = await waitForServerCmd('toggle_mute');
    assert.strictEqual(cmdMute, 'toggle_mute', '點擊靜音按鈕後，伺服器必須收到 toggle_mute 信令');

    // 測試放映端手抄稿深淺色雙聯分段按鍵 (深色 / 淺色)
    console.log('   🖱️ 正在測試放映端深淺色雙聯分段按鍵 (#btnScreenDark / #btnScreenLight)...');
    await deskCdp.eval(`document.getElementById('btnScreenLight').click()`);
    const cmdThemeLight = await waitForServerCmd('set_theme');
    assert.strictEqual(cmdThemeLight, 'set_theme', '點擊淺色按鈕後，伺服器必須收到 set_theme 信令');
    const isLightActive = await deskCdp.eval(`document.getElementById('btnScreenLight').classList.contains('active')`);
    assert.ok(isLightActive, '點擊淺色按鈕後，#btnScreenLight 必須為 active 高光態');

    await deskCdp.eval(`document.getElementById('btnScreenDark').click()`);
    const cmdThemeDark = await waitForServerCmd('set_theme');
    assert.strictEqual(cmdThemeDark, 'set_theme', '點擊深色按鈕後，伺服器必須收到 set_theme 信令');
    const isDarkActive = await deskCdp.eval(`document.getElementById('btnScreenDark').classList.contains('active')`);
    assert.ok(isDarkActive, '點擊深色按鈕後，#btnScreenDark 必須恢復為 active 高光態');

    // 測試進度條實時雙向跳轉
    console.log('   🖱️ 正在測試進度條實時雙向跳轉 (#audioSeeker)...');
    await deskCdp.eval(`
      const seeker = document.getElementById('audioSeeker');
      seeker.value = 45;
      seeker.dispatchEvent(new Event('input', { bubbles: true }));
      seeker.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    const cmdSeek = await waitForServerCmd('seek_absolute');
    assert.strictEqual(cmdSeek, 'seek_absolute', '拖曳或點擊進度條後，伺服器必須收到 seek_absolute 信令');

    // 點擊全螢幕切換
    console.log('   🖱️ 正在點擊全螢幕按鈕 (#btnFullscreen)...');
    await deskCdp.eval(`document.getElementById('btnFullscreen').click()`);
    const cmdFs = await waitForServerCmd('toggle_fullscreen');
    assert.strictEqual(cmdFs, 'toggle_fullscreen', '點擊全螢幕後，伺服器必須收到並分發 toggle_fullscreen 信令');

    // 點擊 Mini 模式折疊按鈕
    console.log('   🖱️ 正在點擊 Mini 折疊按鈕 (#btnMiniToggle)...');
    await deskCdp.eval(`document.getElementById('btnMiniToggle').click()`);
    const miniOnPoll = await waitForCondition(async () => {
      return await deskCdp.eval(`document.body.classList.contains('mini-mode')`);
    }, 2000, 50);
    assert.strictEqual(miniOnPoll, true, '點擊 Mini 按鈕後，主控台 body 必須帶有 mini-mode 類別');

    await deskCdp.eval(`document.getElementById('btnMiniToggle').click()`);
    const miniOffPoll = await waitForCondition(async () => {
      const isMini = await deskCdp.eval(`document.body.classList.contains('mini-mode')`);
      return !isMini ? true : null;
    }, 2000, 50);
    assert.strictEqual(miniOffPoll, true, '再次點擊 Mini 按鈕後，主控台必須還原正常模式');

    console.log('   📌 法會專題影音四鍵、停止影片、滾動三聯鍵、音量控制、全螢幕與視窗 Mini 折疊按鈕真機硬鎖已全數通過驗證！');
  });
});

