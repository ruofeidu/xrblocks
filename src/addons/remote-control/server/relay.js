#!/usr/bin/env node
/* eslint-env node */
/**
 * Local WebSocket relay for xrblocks remote-control.
 *
 * Run with:
 *
 *     node src/addons/remote-control/server/relay.js
 *
 * Dependencies: install `ws` in the consuming project when running the relay.
 */
import {WebSocketServer} from 'ws';

const PORT = Number(process.env.PORT ?? 8791);
const HOST = process.env.HOST ?? '127.0.0.1';

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  maxPayload: 4 * 1024 * 1024,
});

let simulator = null;
const clients = new Set();
const pending = new Map();

console.log(`[remote-control-relay] listening on ws://${HOST}:${PORT}`);

wss.on('connection', (ws) => {
  ws.role = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, {
        type: 'response',
        id: '',
        ok: false,
        error: {code: 'parse_error', message: 'Invalid JSON message.'},
      });
      return;
    }

    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      handleHello(ws, msg);
      return;
    }

    if (msg.type === 'response') {
      const client = pending.get(msg.id);
      if (client) {
        pending.delete(msg.id);
        send(client, msg);
      }
      return;
    }

    if (ws.role === 'client') {
      if (!simulator || simulator.readyState !== simulator.OPEN) {
        send(ws, {
          type: 'response',
          id: msg.id ?? '',
          ok: false,
          error: {
            code: 'simulator_unavailable',
            message: 'No simulator is connected to the relay.',
          },
        });
        return;
      }
      if (typeof msg.id === 'string') pending.set(msg.id, ws);
      send(simulator, msg);
    }
  });

  ws.on('close', () => {
    if (ws.role === 'simulator' && simulator === ws) {
      simulator = null;
      for (const client of clients) {
        send(client, {type: 'simulatorDisconnected'});
      }
    } else if (ws.role === 'client') {
      clients.delete(ws);
      for (const [id, client] of pending) {
        if (client === ws) pending.delete(id);
      }
    }
  });
});

setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      try {
        client.terminate();
      } catch {
        // ignore
      }
      continue;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {
      // ignore
    }
  }
}, 15000);

function handleHello(ws, msg) {
  if (msg.role === 'simulator') {
    simulator = ws;
    ws.role = 'simulator';
    send(ws, {type: 'simulatorReady'});
    for (const client of clients) send(client, {type: 'simulatorReady'});
    return;
  }

  if (msg.role === 'client') {
    ws.role = 'client';
    clients.add(ws);
    if (simulator && simulator.readyState === simulator.OPEN) {
      send(ws, {type: 'simulatorReady'});
    }
  }
}

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}
