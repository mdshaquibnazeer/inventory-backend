const { exec, spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const BACKEND = path.join(ROOT, 'backend');
const INDEX = path.join(ROOT, 'index.html');

console.log('\n🚀 RetailOS — Starting Inventory System...\n');

console.log('🔧 Starting backend server (connecting to Cloud DB)...');

const backend = spawn('node', ['src/server.js'], {
  cwd: BACKEND,
  stdio: 'inherit',
  shell: true,
});

backend.on('error', (err) => {
  console.error('❌ Backend failed:', err.message);
  console.log('💡 Try running: cd backend && npm install');
});

// Wait for backend to be ready, then open browser
waitForBackend(() => {
  console.log('\n🌐 Opening frontend in browser...');
  exec(`start "" "${INDEX}"`);
  console.log('\n─────────────────────────────────────────');
  console.log('  ✅ RetailOS is running!');
  console.log('  📡 Backend:  http://localhost:5000');
  console.log('  🌐 Frontend: index.html (opened in browser)');
  console.log('  🔐 Login:    admin@inventory.com / Admin@123');
  console.log('─────────────────────────────────────────');
  console.log('  Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  backend.kill();
  process.exit(0);
});

function waitForBackend(cb, retries = 30) {
  setTimeout(() => {
    http.get('http://localhost:5000/health', (res) => {
      if (res.statusCode === 200) return cb();
      if (retries <= 0) return cb();
      waitForBackend(cb, retries - 1);
    }).on('error', () => {
      if (retries <= 0) return cb();
      waitForBackend(cb, retries - 1);
    });
  }, 1000);
}
