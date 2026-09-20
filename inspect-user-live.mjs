// ==============================================================================
// 🔬 即時檢測長官剛啟動的主控台實體視窗與功能 (Inspect User Live)
// ==============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

function checkHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

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

async function inspect() {
  console.log('🔍 正在探測長官剛剛拉起的所有視窗通道...');

  // 1. 檢查 9223 (主控台專屬除錯通道)
  let deskFound = false;
  try {
    const res9223 = await checkHttp('http://127.0.0.1:9223/json');
    const pages9223 = JSON.parse(res9223.data);
    console.log(`✅ [Port 9223] 成功連線主控台專屬通道！分頁數量: ${pages9223.length}`);
    const deskPage = pages9223.find(p => p.url.includes('/desk') || p.type === 'page');
    if (deskPage) {
      deskFound = true;
      console.log(`🎯 鎖定操作主控台分頁: "${deskPage.title}" (${deskPage.url})`);
      await inspectDeskPage(deskPage.webSocketDebuggerUrl);
    }
  } catch (e) {
    console.log('ℹ️ Port 9223 未開啟 (可能進程未重開到最新版 server.mjs)');
  }

  // 2. 若 9223 未找到，檢查 9222
  if (!deskFound) {
    try {
      const res9222 = await checkHttp('http://127.0.0.1:9222/json');
      const pages9222 = JSON.parse(res9222.data);
      console.log(`✅ [Port 9222] 偵測到放映艙通道分頁: ${pages9222.length}`);
      const deskPage = pages9222.find(p => p.url.includes('/desk'));
      if (deskPage) {
        console.log(`🎯 在 9222 鎖定操作台分頁: "${deskPage.title}"`);
        await inspectDeskPage(deskPage.webSocketDebuggerUrl);
      } else {
        console.log('ℹ️ 9222 內為放映艙分頁，主控台在一般視窗中運行');
      }
    } catch (e) {
      console.log('❌ Port 9222 連線失敗');
    }
  }

  // 3. 直接對 9998/desk 建立無頭驗證，捕獲當前伺服器對外輸出的 HTML 樣態
  console.log('\n--- 檢驗 9998/desk 當前輸出內容 ---');
  const deskHtmlRes = await checkHttp('http://127.0.0.1:9998/desk');
  const html = deskHtmlRes.data;
  console.log(`📄 /desk 回應大小: ${html.length} bytes`);
  console.log(`   - 包含 [🛠️ 編輯佈局]: ${html.includes('btnEditLayoutToggle')}`);
  console.log(`   - 包含 8 欄網格容器: ${html.includes('deckGridContainer')}`);
  console.log(`   - 包含未上陣倉庫: ${html.includes('deckDrawerContainer')}`);
}

async function inspectDeskPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  await cdpRequest(ws, 1, 'Console.enable');
  await cdpRequest(ws, 2, 'Runtime.enable');
  await cdpRequest(ws, 3, 'Page.enable');

  const diag = await cdpRequest(ws, 4, 'Runtime.evaluate', {
    expression: `({
      hasDeckCanvas: typeof window.DeckCanvas === 'object',
      hasDeckStorage: typeof window.DeckStorage === 'object',
      currentMode: window.DeckCanvas ? window.DeckCanvas.getMode() : 'N/A',
      gridCellCount: document.querySelectorAll('.deck-grid-cell').length,
      isEditingClassPresent: document.body.classList.contains('mode-custom-editing'),
      drawerDisplay: document.getElementById('deckDrawerContainer') ? getComputedStyle(document.getElementById('deckDrawerContainer')).display : 'N/A',
      visibleButtons: Array.from(document.querySelectorAll('.deck-grid-cell')).map(c => ({
        id: c.getAttribute('data-id'),
        cols: c.getAttribute('data-cols'),
        rows: c.getAttribute('data-rows'),
        text: c.innerText.trim().replace(/\\n/g, ' ')
      })),
      hiddenDrawerTags: Array.from(document.querySelectorAll('.drawer-tag-btn')).map(t => t.innerText.trim())
    })`,
    returnByValue: true
  });

  console.log('\n📊 長官眼前視窗真實運作狀態:');
  console.log(JSON.stringify(diag.result.value, null, 2));

  // 抓取真實截圖
  const snap = await cdpRequest(ws, 5, 'Page.captureScreenshot', { format: 'png' });
  const outPath = path.resolve('projects/amrtf-desk/user-desk-live.png');
  fs.writeFileSync(outPath, Buffer.from(snap.data, 'base64'));
  console.log(`📸 已成功抓取長官當前視窗真實截圖至: ${outPath} (${fs.statSync(outPath).size} bytes)`);

  ws.close();
}

inspect().catch(e => console.error(e));
