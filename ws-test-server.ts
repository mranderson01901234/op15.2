// ws-test-server.ts
// Standalone WebSocket test server - completely separate from Next.js
// Used to prove if WebSocket issues are in Next.js integration or agent itself

import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const server = http.createServer();
const wss = new WebSocketServer({ server, path: "/api/bridge" });

wss.on("connection", (ws, req) => {
  console.log("[ws-test] connection from", req.url);

  ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));

  ws.on("message", (data) => {
    console.log("[ws-test] message:", data.toString());
    // Echo ack
    ws.send(JSON.stringify({ type: "ack", echo: data.toString() }));
  });

  ws.on("close", (code, reason) => {
    console.log("[ws-test] close:", code, reason.toString());
  });

  ws.on("error", (err) => {
    console.error("[ws-test] error:", err);
  });
});

server.listen(4000, () => {
  console.log("WS test server listening on ws://localhost:4000/bridge");
});

