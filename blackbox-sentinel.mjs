// ==============================================================================
// 🛰️ AMRTF-Desk 毫秒級 CDP 現場黑盒子監控器 (CDP Flight Recorder Sentinel)
// ==============================================================================

import http from 'http';
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

async function startBlackbox() {
  console.log('📡 [黑盒子啟動] 正在連線主控台專屬除錯埠 (Port 9223)...');

  const res = await checkHttp('http://127.0.0.1:9223/json');
  const pages = JSON.parse(res.data);
  const deskPage = pages.find(p => p.url.includes('/desk') || p.type === 'page');

  if (!deskPage) {
    console.error('❌ 未在 Port 9223 找到主控台分頁！');
    process.exit(1);
  }

  console.log(`🎯 [黑盒子掛載成功] 已鎖定主控台: "${deskPage.title}" (${deskPage.url})`);
  const ws = new WebSocket(deskPage.webSocketDebuggerUrl);

  await new Promise(r => ws.on('open', r));

  // 啟用除錯協定
  await cdpRequest(ws, 1, 'Console.enable');
  await cdpRequest(ws, 2, 'Runtime.enable');
  await cdpRequest(ws, 3, 'Page.enable');

  // 注入黑盒子前端探針 (監聽所有滑鼠、點擊、拖曳與報錯)
  const injectionScript = `
    (function() {
      if (window.__BLACKBOX_SENTINEL_MOUNTED__) return;
      window.__BLACKBOX_SENTINEL_MOUNTED__ = true;

      console.log('🛰️ [探針注入] 全域操作事件黑盒子已就緒');

      // 監聽點擊
      document.addEventListener('click', function(e) {
        const target = e.target;
        const cell = target.closest('.deck-grid-cell');
        const btn = target.closest('button');
        const mode = window.DeckCanvas ? window.DeckCanvas.getMode() : 'unknown';

        const info = {
          time: new Date().toLocaleTimeString(),
          type: 'CLICK',
          mode: mode,
          targetTag: target.tagName,
          targetId: target.id || (btn ? btn.id : null),
          cellId: cell ? cell.getAttribute('data-id') : null,
          targetText: (target.innerText || '').trim().substring(0, 30),
          classes: Array.from(target.classList).join(' ')
        };
        console.warn('🖱️ [黑盒子 CLICK 動作]: ' + JSON.stringify(info));
      }, true);

      // 監聽拖曳開始
      document.addEventListener('dragstart', function(e) {
        const cell = e.target.closest('.deck-grid-cell');
        console.warn('🤏 [黑盒子 DRAG-START 拖曳開始]: ' + (cell ? cell.getAttribute('data-id') : 'unknown'));
      }, true);

      // 監聽拖曳放下
      document.addEventListener('drop', function(e) {
        const targetCell = e.target.closest('.deck-grid-cell');
        console.warn('🎯 [黑盒子 DROP 拖曳放下]: 目標格位 ' + (targetCell ? targetCell.getAttribute('data-id') : 'non-cell'));
      }, true);

      // 監聽前端異常
      window.addEventListener('error', function(err) {
        console.error('💥 [黑盒子 攔截到前端未處理異常]: ' + err.message + ' at ' + err.filename + ':' + err.lineno);
      });
    })();
  `;

  await cdpRequest(ws, 4, 'Runtime.evaluate', { expression: injectionScript });

  console.log('✅ 黑盒子探針已無感注入主控台視窗！正在即時監聽中...\n');

  // 監聽來自瀏覽器的所有訊息並格式化輸出
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // 1. Console API 呼叫
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const args = msg.params.args.map(a => a.value || a.description || '').join(' ');

        if (args.includes('[黑盒子')) {
          console.log(args);
        } else if (type === 'error') {
          console.log('🔴 [前端 ERROR 報錯]:', args);
        } else if (type === 'warn') {
          console.log('🟡 [前端 WARN 警告]:', args);
        } else {
          console.log('ℹ️ [Console]:', args);
        }
      }

      // 2. 未捕捉 JavaScript 異常
      if (msg.method === 'Runtime.exceptionThrown') {
        const ex = msg.params.exceptionDetails;
        console.log(`💥💥 [致命 JavaScript 崩潰]: ${ex.text} (行號: ${ex.lineNumber}) - ${ex.exception?.description || ''}`);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log('📡 [黑盒子監控結束] 主控台連線已斷開');
  });
}

startBlackbox().catch(e => {
  console.error('❌ 黑盒子啟動失敗:', e.message);
});
