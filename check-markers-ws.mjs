import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:9998');

ws.on('open', () => {
  console.log('連線至 9998 成功，等待 STATE_UPDATE...');
});

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'STATE_UPDATE') {
      const state = msg.data;
      console.log('收到狀態推播:');
      console.log('- 講次:', state.lessonNumber || state.lessonTitle);
      console.log('- 時間:', state.currentTimeStr, '/', state.totalTimeStr);
      console.log('- 段落數量 (markers):', state.markers ? state.markers.length : '無');
      if (state.markers && state.markers.length > 0) {
        console.log('- 前 5 個段落:', state.markers.slice(0, 5));
      }
      if (state.markers && state.markers.length >= 5) {
        console.log('🎉 驗收合格：段落標記完整存在！');
        ws.close();
        process.exit(0);
      }
    }
  } catch (e) {}
});

setTimeout(() => {
  console.log('超時結束');
  ws.close();
  process.exit(0);
}, 6000);
