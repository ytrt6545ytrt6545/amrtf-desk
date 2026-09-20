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
      const id = 1234;
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

    const out = await evalCode(`(() => {
      return {
        getParagraphTimeMarkers: typeof getParagraphTimeMarkers === 'function' ? getParagraphTimeMarkers.toString() : 'missing',
        notifyStateUpdate: typeof notifyStateUpdate === 'function' ? notifyStateUpdate.toString() : 'missing'
      };
    })()`);

    console.log('getParagraphTimeMarkers:', out.getParagraphTimeMarkers);
    ws.close();
    process.exit(0);
  });
});
