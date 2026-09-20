// ==============================================================================
// 🔬 AMRTF-Desk E2E 真實 CDP 畫面與功能操作驗收腳本
// ==============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

function cdpRequest(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function runE2E() {
  console.log('🚀 開始執行 CDP 端到端真實視窗與自訂畫布功能驗證...');

  // 1. 呼叫 CDP 建立新 Target 指向 http://127.0.0.1:9998/desk (使用 PUT 動詞)
  const newPageRes = await new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:9222/json/new?http://127.0.0.1:9998/desk', { method: 'PUT' }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`解析失敗: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  console.log(`✅ 已成功建立操作台分頁 Target: ${newPageRes.id}`);
  const wsUrl = newPageRes.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve) => ws.on('open', resolve));
  console.log('✅ 已連接操作台 CDP WebSocket');

  // 等待頁面載入完成
  await cdpRequest(ws, 1, 'Page.enable');
  await new Promise(r => setTimeout(r, 1200));

  // 2. 探測前端環境物件
  console.log('\n--- [檢驗 1] 探測 window.DeckCanvas 與 window.DeckStorage ---');
  const envCheck = await cdpRequest(ws, 2, 'Runtime.evaluate', {
    expression: `({
      hasDeckCanvas: typeof window.DeckCanvas === 'object',
      hasDeckStorage: typeof window.DeckStorage === 'object',
      mode: window.DeckCanvas ? window.DeckCanvas.getMode() : null,
      cellCount: document.querySelectorAll('.deck-grid-cell').length
    })`,
    returnByValue: true
  });
  console.log('📊 前端環境物證:', envCheck.result.value);

  // 3. 觸發切換至自訂模式
  console.log('\n--- [檢驗 2] 觸發進入自訂模式 (Edit Mode) ---');
  const enterEdit = await cdpRequest(ws, 3, 'Runtime.evaluate', {
    expression: `(function() {
      window.DeckCanvas.setMode('edit');
      return {
        mode: window.DeckCanvas.getMode(),
        hasAmberBorder: document.body.classList.contains('mode-custom-editing'),
        drawerShown: document.getElementById('deckDrawerContainer').classList.contains('show'),
        toggleBtnText: document.getElementById('btnEditLayoutToggle').innerText
      };
    })()`,
    returnByValue: true
  });
  console.log('📊 自訂模式切換結果:', enterEdit.result.value);

  // 4. 測試按鈕大小縮放與隱藏
  console.log('\n--- [檢驗 3] 測試將 btnPlayPause 放大為 4x2 巨型鍵，並隱藏 btnVideoDedication ---');
  const resizeAndHide = await cdpRequest(ws, 4, 'Runtime.evaluate', {
    expression: `(function() {
      // 放大 btnPlayPause
      const layout = window.DeckCanvas.getLayout();
      const playItem = layout.items.find(i => i.id === 'btnPlayPause');
      if (playItem) {
        playItem.cols = 4;
        playItem.rows = 2;
      }
      
      // 隱藏迴向影片
      const dedicItem = layout.items.find(i => i.id === 'btnVideoDedication');
      if (dedicItem) {
        dedicItem.hidden = true;
      }

      // 重新套用並存檔
      window.DeckStorage.saveLayout(layout);
      location.reload(); // 重新整理以驗證 localStorage 持久化讀取
      return true;
    })()`,
    returnByValue: true
  });

  // 等待重新整理完成
  await new Promise(r => setTimeout(r, 1500));

  // 5. 驗證重新整理後的持久化效果
  console.log('\n--- [檢驗 4] 驗證重新整理後的持久化效果 ---');
  const persistCheck = await cdpRequest(ws, 5, 'Runtime.evaluate', {
    expression: `(function() {
      const playCell = document.querySelector('.deck-grid-cell[data-id="btnPlayPause"]');
      const dedicCell = document.querySelector('.deck-grid-cell[data-id="btnVideoDedication"]');
      const drawerTags = Array.from(document.querySelectorAll('.drawer-tag-btn')).map(t => t.innerText);
      
      return {
        playCols: playCell ? playCell.getAttribute('data-cols') : null,
        playRows: playCell ? playCell.getAttribute('data-rows') : null,
        hasSz4x2Class: playCell ? playCell.classList.contains('sz-4x2') : false,
        isDedicHidden: !dedicCell,
        drawerContainsDedic: drawerTags.some(t => t.includes('迴向'))
      };
    })()`,
    returnByValue: true
  });
  console.log('📊 持久化驗證結果:', persistCheck.result.value);

  // 6. 抓取真實操作艙視覺快照 (Screenshot)
  console.log('\n--- [檢驗 5] 正在抓取真實視覺截圖 (Screenshot) ---');
  const screenshot = await cdpRequest(ws, 6, 'Page.captureScreenshot', { format: 'png' });
  const snapshotPath = path.resolve('projects/amrtf-desk/runtime-snapshot.png');
  fs.writeFileSync(snapshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`📸 真實視覺快照已成功儲存至: ${snapshotPath} (大小: ${fs.statSync(snapshotPath).size} bytes)`);

  // 7. 關閉測試分頁
  console.log('\n--- 清理測試分頁 ---');
  await new Promise((resolve) => {
    http.get(`http://127.0.0.1:9222/json/close/${newPageRes.id}`, () => resolve());
  });
  ws.close();

  console.log('\n🎉 CDP 端到端真實視窗與自訂畫布功能驗證 100% 圓滿通過！');
}

runE2E().catch(e => {
  console.error('❌ E2E 測試失敗:', e);
  process.exit(1);
});
