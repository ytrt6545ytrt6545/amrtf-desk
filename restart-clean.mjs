import { execSync, spawn } from 'child_process';
import path from 'path';

console.log('🧹 正在終止舊版進程...');
try {
  execSync('taskkill /F /PID 9976 /T', { stdio: 'ignore' });
} catch (e) {}

// 也透過 netstat 尋找 9998 並清理
try {
  const out = execSync('netstat -ano | findstr :9998', { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  lines.forEach(l => {
    const parts = l.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0') {
      try { execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' }); } catch (err) {}
    }
  });
} catch (e) {}

console.log('🚀 正在拉起全新 AMRTF-Desk 伺服器與視窗...');
const serverFile = path.resolve('projects/amrtf-desk/server.mjs');
const child = spawn('node', [serverFile], {
  cwd: path.resolve('projects/amrtf-desk'),
  detached: true,
  stdio: 'inherit'
});
child.unref();

console.log('✅ 全新主程序已在背景啟動！PID:', child.pid);
