// ==============================================================================
// 🛠️ 診斷腳本：直連放映艙 CDP 檢測 Audio 與注入狀態
// ==============================================================================
import http from 'http';
import { WebSocket } from 'ws';

async function diagnose() {
  console.log('🔍 正在檢測 http://127.0.0.1:9222/json ...');
  http.get('http://127.0.0.1:9222/json', (res) => {
    let raw = '';
    res.on('data', (c) => raw += c);
    res.on('end', () => {
      try {
        const pages = JSON.parse(raw);
        console.log('📄 偵測到的 Chromium 分頁數量:', pages.length);
        pages.forEach((p, idx) => {
          console.log(`  [${idx}] Type: ${p.type}, Title: ${p.title}, URL: ${p.url}`);
        });

        const target = pages.find(p => p.type === 'page' && p.url.includes('amrtf.org'));
        if (!target) {
          console.log('❌ 找不到包含 amrtf.org 的放映艙分頁！');
          return;
        }

        console.log('🎯 找到放映艙分頁，正在連接 Debugger:', target.webSocketDebuggerUrl);
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.on('open', () => {
          console.log('✅ 已連接 Debugger，正在探測網頁內部 window.__AMRTF_EXECUTE_COMMAND__ 與 audio...');
          
          // 測試執行
          const testCode = `
            ({
              hasExecCmd: typeof window.__AMRTF_EXECUTE_COMMAND__ === 'function',
              audioFound: !!document.querySelector('audio'),
              audioSrc: document.querySelector('audio') ? document.querySelector('audio').src : null,
              audioPaused: document.querySelector('audio') ? document.querySelector('audio').paused : null,
              mejsFound: !!document.querySelector('.mejs-play button, .mejs-playpause-button button')
            })
          `;
          ws.send(JSON.stringify({
            id: 100,
            method: 'Runtime.evaluate',
            params: { expression: testCode, returnByValue: true }
          }));
        });

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === 100) {
            console.log('📊 網頁內部真實狀態診斷結果:');
            console.log(JSON.stringify(msg.result?.result?.value, null, 2));
            ws.close();
          }
        });
      } catch (err) {
        console.error('❌ 解析錯誤:', err.message);
      }
    });
  }).on('error', (e) => {
    console.log('❌ 無法連線至 9222 端口（放映艙未開啟或連接中斷）:', e.message);
  });
}

diagnose();
