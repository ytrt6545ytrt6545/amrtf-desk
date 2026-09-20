import { WebSocket } from 'ws';
import http from 'http';

http.get('http://127.0.0.1:9222/json', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', async () => {
    const pages = JSON.parse(d);
    const screen = pages.find(p => p.url.includes('amrtf.org'));
    const ws = new WebSocket(screen.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    const evalCode = (code) => new Promise((resolve) => {
      const id = 777;
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) resolve(msg.result?.result?.value);
      });
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } }));
    });

    const res = await evalCode(`(() => {
      const keys = Object.keys(window).filter(k => k.toLowerCase().includes('speech'));
      const input = document.getElementById('bottom_toolbar_speechmode');
      
      // 查看 input 或其父級綁定的 jQuery 事件
      const tr = document.getElementById('tr_toolbar_speechmode');
      return { html: tr ? tr.outerHTML : 'none' };
    })()`);
    console.log('tr_toolbar_speechmode HTML:');
    console.log(res.html);
    ws.close();
    process.exit(0);
  });
});
