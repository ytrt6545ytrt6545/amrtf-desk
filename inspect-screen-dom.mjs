import { WebSocket } from 'ws';
import http from 'http';

http.get('http://127.0.0.1:9222/json', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', async () => {
    const pages = JSON.parse(d);
    const screen = pages.find(p => p.url.includes('amrtf.org') || p.type === 'page');
    console.log('放映艙分頁:', screen ? screen.url : '未找到');
    if (!screen) process.exit(1);

    const ws = new WebSocket(screen.webSocketDebuggerUrl);
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
      const elements = document.querySelectorAll('a.mvt[data-time], a.mvt-seekto[data-time], span.seek-to[data-time]');
      const seen = new Set([0]);
      const markers = [{ sec: 0, label: '00:00 (起點)' }];
      elements.forEach(el => {
        const raw = el.getAttribute('data-time') || el.textContent;
        const sec = Math.round(parseFloat(raw) || 0);
        const text = el.textContent.trim();
        if (sec > 0 && text && !seen.has(sec)) {
          seen.add(sec);
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          markers.push({
            sec: sec,
            label: (m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0')) + ' (段落)'
          });
        }
      });
      markers.sort((a, b) => a.sec - b.sec);

      return {
        hasRuntime: typeof window.__AMRTF_EXECUTE_COMMAND__ === 'function',
        count: markers.length,
        samples: markers.slice(0, 5)
      };
    })()`);
    console.log('放映艙注入狀態:', info.hasRuntime, '段落數量:', info.count);
    console.log('前 5 個段落:', JSON.stringify(info.samples, null, 2));
    ws.close();
    process.exit(0);
  });
});
