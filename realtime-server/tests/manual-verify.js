import http from 'node:http';
import { io as ClientIO } from 'socket.io-client';
import { execSync } from 'node:child_process';
import { startServer, stopServer } from '../src/server.js';

async function runManualVerification() {
  console.log('=== NEXORA REAL-TIME INFRASTRUCTURE MANUAL VERIFICATION ===');

  // 1. Start realtime server on port 8002
  console.log('[Step 1] Starting realtime server...');
  await startServer(8002);
  console.log('[Step 1] Realtime server started on port 8002.');

  // 2. Verify GET /health
  console.log('[Step 2] Testing GET /health endpoint...');
  const healthRes = await fetch('http://127.0.0.1:8002/health');
  const healthBody = await healthRes.json();
  console.log(`[Step 2] Health status: HTTP ${healthRes.status}, Body:`, JSON.stringify(healthBody));
  if (healthRes.status !== 200 || healthBody.mongodb !== 'connected') {
    throw new Error('Health check failed or MongoDB is not connected');
  }

  // 3. Test unauthenticated connection rejection
  console.log('[Step 3] Testing unauthenticated connection (missing token)...');
  const unauthClient = ClientIO('http://127.0.0.1:8002', {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false,
  });

  const missingTokenErr = await new Promise((resolve) => {
    unauthClient.on('connect_error', (err) => resolve(err.message));
  });
  console.log(`[Step 3] Result: Successfully rejected with error: "${missingTokenErr}"`);
  unauthClient.disconnect();

  // 4. Test invalid token rejection
  console.log('[Step 4] Testing invalid token rejection...');
  const invalidClient = ClientIO('http://127.0.0.1:8002', {
    auth: { token: 'invalid_dummy_token_999' },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false,
  });

  const invalidTokenErr = await new Promise((resolve) => {
    invalidClient.on('connect_error', (err) => resolve(err.message));
  });
  console.log(`[Step 4] Result: Successfully rejected with error: "${invalidTokenErr}"`);
  invalidClient.disconnect();

  // 5. Generate a real Laravel Sanctum token for Sanskriti via artisan tinker (without exposing token in logs)
  console.log('[Step 5] Acquiring real Laravel Sanctum token from backend...');
  const tokenCommand = 'php artisan tinker --execute="echo App\\Models\\User::first()->createToken(\'realtime_manual_test\')->plainTextToken;"';
  const rawTokenOutput = execSync(tokenCommand, {
    cwd: 'c:\\Users\\sansk\\OneDrive\\Desktop\\Nexora\\backend',
    encoding: 'utf-8',
  });
  const sanctumToken = rawTokenOutput.trim();

  if (!sanctumToken || sanctumToken.length < 10) {
    throw new Error('Failed to acquire valid Sanctum token from Laravel');
  }
  console.log('[Step 5] Real Sanctum token acquired successfully (token value redacted).');

  // 6. Test Socket.IO connection with real Sanctum token
  console.log('[Step 6] Connecting Socket.IO client using real Laravel Sanctum token...');
  const authClient = ClientIO('http://127.0.0.1:8002', {
    auth: { token: sanctumToken },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    authClient.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    authClient.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  console.log(`[Step 6] Connected successfully! Socket ID: ${authClient.id}, Authenticated: ${authClient.connected}`);

  // 7. Test realtime:ping -> realtime:pong
  console.log('[Step 7] Testing realtime:ping -> realtime:pong...');
  const pingStart = Date.now();
  const pongData = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Pong timeout')), 5000);
    authClient.once('realtime:pong', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    authClient.emit('realtime:ping');
  });

  const rtt = Date.now() - pingStart;
  console.log(`[Step 7] Received realtime:pong! Round-trip time: ${rtt}ms, Server timestamp: ${pongData.timestamp}`);

  // 8. Test clean disconnect
  console.log('[Step 8] Testing clean disconnect...');
  await new Promise((resolve) => {
    authClient.on('disconnect', (reason) => {
      console.log(`[Step 8] Disconnected cleanly. Reason: ${reason}`);
      resolve();
    });
    authClient.disconnect();
  });

  // 9. Stop server & disconnect DB
  console.log('[Step 9] Stopping realtime test server...');
  await stopServer();
  console.log('[Step 9] Realtime server stopped.');

  console.log('=== ALL MANUAL VERIFICATION STEPS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runManualVerification().catch((err) => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
