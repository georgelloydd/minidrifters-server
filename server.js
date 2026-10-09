// ===== Mini Drifters game server =====
// A tiny WebSocket relay: the host's game still runs the race, but every message goes through this
// server instead of the host's own internet connection. That means:
//  - the host only uploads ONE copy of each update (the server copies it to everyone)
//  - no peer-to-peer connection problems on school / work Wi-Fi
//  - no player limit from the host's upload speed
// It also serves the Open rooms list (replaces the Supabase room list).
// Run:  npm install && npm start      (PORT env var, default 8080)
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const MAX_MSG = 64 * 1024;          // ignore anything bigger than this
const MAX_PER_SEC = 120;            // per connection, generous (game sends ~20/s)
const CODE_RE = /^[A-Z0-9]{3,12}$/;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map();            // code -> { host, clients: Map(id -> ws), meta, public, created }
let nextId = 1;

function randCode() { let s = ''; for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }
function send(ws, obj) { if (ws && ws.readyState === 1) try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { } }
function roomList() {
  const out = [];
  for (const [code, r] of rooms) if (r.public && r.meta) out.push(Object.assign({}, r.meta, { code, players: r.clients.size + 1 }));
  return out.sort((a, b) => ((a.inRace | 0) - (b.inRace | 0)) || (b.players - a.players)).slice(0, 200);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const url = (req.url || '/').split('?')[0];
  if (url === '/rooms') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(roomList())); }
  if (url === '/' || url === '/health') { res.setHeader('Content-Type', 'text/plain'); return res.end('Mini Drifters server OK. Rooms: ' + rooms.size + '\n'); }
  res.statusCode = 404; res.end('not found');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG, perMessageDeflate: false });

wss.on('connection', ws => {
  ws.id = 'p' + (nextId++).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.room = null; ws.isHost = false; ws.alive = true; ws.n = 0; ws.nT = Date.now();
  ws.on('pong', () => { ws.alive = true; });
  send(ws, { op: 'id', id: ws.id });

  ws.on('message', (buf, isBin) => {
    if (isBin) return;
    const now = Date.now(); if (now - ws.nT > 1000) { ws.nT = now; ws.n = 0; } if (++ws.n > MAX_PER_SEC) return;
    let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const r = ws.room && rooms.get(ws.room);
    switch (m.op) {
      case 'host': {
        if (ws.room) return;
        let code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
        if (code && (!CODE_RE.test(code) || rooms.has(code))) return send(ws, { op: 'err', type: 'unavailable-id' });
        if (!code) { do code = randCode(); while (rooms.has(code)); }
        rooms.set(code, { host: ws, clients: new Map(), meta: null, public: m.public !== false, created: now });
        ws.room = code; ws.isHost = true; send(ws, { op: 'hosted', code });
        break;
      }
      case 'join': {
        if (ws.room) return;
        const code = String(m.code || '').toUpperCase(), room = rooms.get(code);
        if (!room) return send(ws, { op: 'err', type: 'peer-unavailable' });
        ws.room = code; room.clients.set(ws.id, ws);
        send(room.host, { op: 'conn', id: ws.id }); send(ws, { op: 'joined', code });
        break;
      }
      case 'meta': if (r && ws.isHost && m.meta && typeof m.meta === 'object') { r.meta = m.meta; r.public = m.public !== false; } break;
      case 'up': if (r && !ws.isHost) send(r.host, { op: 'from', id: ws.id, d: m.d }); break;          // client -> host
      case 'to': if (r && ws.isHost) send(r.clients.get(m.id), { op: 'd', d: m.d }); break;              // host -> one client
      case 'all': if (r && ws.isHost) { const s = JSON.stringify({ op: 'd', d: m.d }); for (const c of r.clients.values()) send(c, s); } break; // host -> everyone (serialised once)
      case 'kick': if (r && ws.isHost) { const c = r.clients.get(m.id); if (c) { r.clients.delete(m.id); c.room = null; send(c, { op: 'closed' }); } } break;
      case 'leave': leave(ws); break;
      case 'ping': send(ws, { op: 'pong', t: m.t }); break;
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => { });
});

function leave(ws) {
  const code = ws.room; if (!code) return; ws.room = null;
  const r = rooms.get(code); if (!r) return;
  if (ws.isHost && r.host === ws) { rooms.delete(code); for (const c of r.clients.values()) { c.room = null; send(c, { op: 'hostgone' }); } }
  else if (r.clients.delete(ws.id)) send(r.host, { op: 'close', id: ws.id });
  ws.isHost = false;
}

// drop dead connections every 20 s (also keeps proxies from closing idle sockets)
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { } } }, 20000);

server.listen(PORT, () => console.log('Mini Drifters server listening on ' + PORT));
module.exports = { server, rooms };
