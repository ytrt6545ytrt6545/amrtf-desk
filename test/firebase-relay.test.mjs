import { test } from 'node:test';
import assert from 'node:assert';
import { FirebaseRelayManager } from '../src/server/firebase-relay.js';

test('☁️ [Firebase-Relay] 32 碼密碼學安全 Token 生成與隨機性驗證', () => {
  const manager = new FirebaseRelayManager();
  const token = manager.token;

  // 1. 長度必須為 32 碼
  assert.strictEqual(token.length, 32, 'Token 長度必須為 32 碼');

  // 2. 必須符合 Base64URL 字符集 (無 + / = 等易造成 URL 混淆字元)
  assert.match(token, /^[A-Za-z0-9_-]{32}$/, 'Token 必須符合 URL-Safe 字符集');

  // 3. 連續生成 100 次，絕不重複 (碰撞率為 0)
  const tokens = new Set();
  for (let i = 0; i < 100; i++) {
    const t = manager.generateSecureToken();
    assert.strictEqual(tokens.has(t), false, `Token 不可碰撞重複: ${t}`);
    tokens.add(t);
  }
  assert.strictEqual(tokens.size, 100, '100 次生成之 Token 必須全部唯一');
});

test('☁️ [Firebase-Relay] 8 碼人眼可辨識 Room ID 生成格式', () => {
  const manager = new FirebaseRelayManager();
  const roomId = manager.roomId;

  // 必須符合 ROOM-XXXX 格式
  assert.match(roomId, /^ROOM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/, 'Room ID 必須為排除易混淆字符的 8 碼格式');
});

test('☁️ [Firebase-Relay] 100 間研討教室多租戶物理隔離驗證 (絕不串台)', () => {
  const dispatchedLogs = [];
  const manager = new FirebaseRelayManager({
    dispatchCommand: (cmd, params) => {
      dispatchedLogs.push({ cmd, params });
    }
  });

  // 模擬註冊 100 間虛擬研討教室
  const roomDb = new Map();
  for (let i = 1; i <= 100; i++) {
    const rId = `ROOM-${String(i).padStart(4, '0')}`;
    const rToken = manager.generateSecureToken();
    manager.registerLocalRoom(rId, rToken);
    roomDb.set(rId, rToken);
  }

  // 驗證 1: 教室 0001 持有自己的合法 Token 發送指令，應成功通過
  const res1 = manager.handleIncomingCommand('ROOM-0001', roomDb.get('ROOM-0001'), 'toggle_play');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(dispatchedLogs.length, 1);
  assert.strictEqual(dispatchedLogs[0].cmd, 'toggle_play');

  // 驗證 2: 教室 0002 試圖用自己的 Token 操控教室 0001 (跨房間串台攻擊)，必須被物理攔截！
  const attackRes = manager.handleIncomingCommand('ROOM-0001', roomDb.get('ROOM-0002'), 'toggle_play');
  assert.strictEqual(attackRes.success, false);
  assert.strictEqual(attackRes.error, 'UNAUTHORIZED_TOKEN');
  assert.strictEqual(dispatchedLogs.length, 1, '被攔截之指令絕不可派發至主機');

  // 驗證 3: 隨機偽造 Token 嘗試攻擊教室 0050，必須被阻斷
  const fakeTokenRes = manager.handleIncomingCommand('ROOM-0050', 'invalid_fake_token_12345678901234', 'seek_start');
  assert.strictEqual(fakeTokenRes.success, false);
  assert.strictEqual(fakeTokenRes.error, 'UNAUTHORIZED_TOKEN');

  // 驗證 4: 空 Token 或未傳 Token，必須被阻斷
  const emptyRes = manager.handleIncomingCommand('ROOM-0050', '', 'seek_start');
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error, 'UNAUTHORIZED_TOKEN');
});

test('☁️ [Firebase-Relay] 狀態快照更新與房間安全自毀 (Zero-Garbage)', async () => {
  const manager = new FirebaseRelayManager();
  const roomId = manager.roomId;

  // 1. 廣播狀態突變
  manager.broadcastState({ lesson: 566, is_playing: true, current_time: 120 });
  const info = manager.getRelayInfo('http://127.0.0.1:9223');

  assert.strictEqual(info.state.lesson, 566);
  assert.strictEqual(info.state.is_playing, true);
  assert.strictEqual(info.state.current_time, 120);
  assert.strictEqual(info.roomId, roomId);
  assert.ok(info.cloudUrl.includes(`room=${encodeURIComponent(roomId)}`));
  assert.ok(info.cloudUrl.includes(`token=${encodeURIComponent(manager.token)}`));

  // 2. 測試自毀 (Zero-Garbage)
  manager.destroyRoom(roomId, true);
  assert.strictEqual(manager.activeRooms.has(roomId), false, '房間銷毀後記憶體池中必須徹底清除');
  await new Promise((r) => setTimeout(r, 500));
});
