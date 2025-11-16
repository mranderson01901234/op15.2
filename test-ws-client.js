// test-ws-client.js
// Simple WebSocket client to test the standalone server

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:4000/bridge');

ws.on('open', () => {
  console.log('✅ Connected to test server');
  
  // Send a test message
  ws.send(JSON.stringify({ 
    type: 'test', 
    message: 'Hello from test client',
    timestamp: Date.now()
  }));
  
  console.log('📤 Sent test message');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📥 Received:', message);
  
  // If we got an ack, send another message after 2 seconds
  if (message.type === 'ack') {
    console.log('✅ Received acknowledgment');
    setTimeout(() => {
      ws.send(JSON.stringify({ 
        type: 'ping', 
        timestamp: Date.now() 
      }));
    }, 2000);
  }
});

ws.on('close', (code, reason) => {
  console.log(`❌ Connection closed: code=${code}, reason=${reason.toString()}`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

// Keep connection alive for 10 seconds
setTimeout(() => {
  console.log('⏱️  Test complete - closing connection');
  ws.close(1000, 'Test complete');
}, 10000);

