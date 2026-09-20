import http from 'http';
import { WebSocket } from 'ws';

async function main() {
  const res = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  const desk = res.find(p => p.url.includes('/desk') || p.type === 'page');
  const ws = new WebSocket(desk.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  const evalCode = (code) => new Promise((resolve) => {
    const id = Math.floor(Math.random() * 10000);
    const h = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off('message', h);
        resolve(msg.result?.result?.value);
      }
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } }));
  });

  const info = await evalCode(`(() => {
    const intervalRow = document.getElementById('intervalRowWidget');
    const playBtn = document.getElementById('btnPlayInterval');
    const loopBtn = document.getElementById('btnLoopInterval');
    const stopBtn = document.getElementById('btnStopInterval');
    const fsBtn = document.getElementById('btnFullscreen');
    const selectStart = document.getElementById('selectIntervalStart');
    const selectEnd = document.getElementById('selectIntervalEnd');
    return {
      intervalRowFound: !!intervalRow,
      startOptionsCount: selectStart ? selectStart.options.length : 0,
      startOptionsSample: selectStart ? Array.from(selectStart.options).slice(0, 5).map(o => o.text) : [],
      endOptionsCount: selectEnd ? selectEnd.options.length : 0,
      playBtnFound: !!playBtn,
      loopBtnFound: !!loopBtn,
      fsBtnFound: !!fsBtn
    };
  })()`);

  console.log('DOM Info:', JSON.stringify(info, null, 2));

  // 測試 2: 點擊全螢幕按鈕，看有什麼反應
  console.log('\n點擊 btnFullscreen 測試:');
  const clickRes = await evalCode(`(() => {
    const fsBtn = document.getElementById('btnFullscreen');
    if (fsBtn) {
      fsBtn.click();
      return 'Clicked btnFullscreen';
    }
    return 'Not found';
  })()`);
  console.log(clickRes);

  ws.close();
}

main().catch(console.error);
