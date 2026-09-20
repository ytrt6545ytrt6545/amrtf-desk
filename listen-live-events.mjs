// ==============================================================================
// 🛰️ AMRTF-Desk 即時現場監聽探針 (Listen Live Events Sentinel)
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

async function startListening() {
  console.log('📡 正在探測現場 CDP (Port 9222) 與 主控伺服器 (Port 9998)...');

  let pages = [];
  try {
    const cdpRes = await checkHttp('http://127.0.0.1:9222/json');
    pages = JSON.parse(cdpRes.data);
    console.log(`✅ 成功連線 CDP！目前活躍分頁數量: ${pages.length}`);
    pages.forEach((p, idx) => {
      console.log(`   [${idx + 1}] Title: "${p.title}" | URL: ${p.url}`);
    });
  } catch (e) {
    console.error('❌ CDP 9222 連線失敗:', e.message);
  }

  // 尋找 desk 分頁
  let deskTarget = pages.find(p => p.url.includes('/desk') || p.title.includes('AMRTF Control Desk'));
  
  if (!deskTarget) {
    console.log('⚠️ 未在 9222 找到直接的 /desk 分頁，正在檢測放映艙與全域視窗...');
    // 檢查是否有 amrtf 放映艙
    const amrtfPage = pages.find(p => p.url.includes('amrtf.org'));
    if (amrtfPage) {
      console.log(`🎯 找到大慈恩放映艙分頁: "${amrtfPage.title}"`);
    }
  } else {
    console.log(`🎯 成功鎖定長官當前的操作主控台視窗: "${deskTarget.title}"`);
    const ws = new WebSocket(deskTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    // 開啟 Console、Runtime 與 Page
    await cdpRequest(ws, 1, 'Console.enable');
    await cdpRequest(ws, 2, 'Runtime.enable');
    await cdpRequest(ws, 3, 'Page.enable');

    // 監聽控制台報錯
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Console.messageAdded') {
          const m = msg.params.message;
          console.log(`🔴 [瀏覽器 Console ${m.level.toUpperCase()}]: ${m.text}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const ex = msg.params.exceptionDetails;
          console.log(`💥 [未捕捉 JavaScript 異常]: ${ex.text} at line ${ex.lineNumber}`);
        }
      } catch (e) {}
    });

    // 診斷當前操作台內部狀態
    const diag = await cdpRequest(ws, 4, 'Runtime.evaluate', {
      expression: `({
        mode: window.DeckCanvas ? window.DeckCanvas.getMode() : 'N/A',
        isEditing: document.body.classList.contains('mode-custom-editing'),
        btnCount: document.querySelectorAll('.deck-grid-cell').length,
        drawerDisplay: document.getElementById('deckDrawerContainer') ? getComputedStyle(document.getElementById('deckDrawerContainer')).display : 'N/A',
        footerDisplay: document.getElementById('deckGridContainer') ? getComputedStyle(document.getElementById('deckGridContainer')).display : 'N/A',
        footerHeight: document.getElementById('deckGridContainer') ? document.getElementById('deckGridContainer').offsetHeight : 0,
        layout: window.DeckStorage ? window.DeckStorage.loadLayout() : null
      })`,
      returnByValue: true
    });

    console.log('\n📊 操作主控台內部真實診斷數據:');
    console.log(JSON.stringify(diag.result.value, null, 2));

    // 抓取真實主控台畫面
    const snap = await cdpRequest(ws, 5, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve('projects/amrtf-desk/desk-live-snapshot.png'), Buffer.from(snap.data, 'base64'));
    console.log('📸 已即時截取長官目前的主控台視覺畫面至: desk-live-snapshot.png');
  }
}

startListening().catch(e => console.error(e));
