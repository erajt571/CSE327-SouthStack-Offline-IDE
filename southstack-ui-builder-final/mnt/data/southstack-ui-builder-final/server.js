const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8000);
const publicDir = path.join(__dirname, 'public');

let sharedState = null;
let peers = {};

function freshState() {
  const screenId = id('screen');
  return {
    version: 1,
    updatedAt: Date.now(),
    screens: [{ id: screenId, name: 'Mobile Home', width: 390, height: 844, bg: '#f7f8fb', elements: [] }],
    activeScreenId: screenId,
    resources: [],
    chat: [],
    agentLog: ['Local design agent ready. Upload a UI photo or type a command.'],
    cursors: {}
  };
}
sharedState = freshState();

function id(prefix = 'id') { return `${prefix}_${crypto.randomBytes(4).toString('hex')}`; }

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 15 * 1024 * 1024) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}
function lanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}
function cleanupPeers() {
  const now = Date.now();
  Object.keys(peers).forEach(k => { if (now - peers[k].lastSeen > 10000) delete peers[k]; });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const clientId = url.searchParams.get('clientId') || 'anonymous';
    const name = url.searchParams.get('name') || 'Peer';
    peers[clientId] = { id: clientId, name, lastSeen: Date.now() };
    cleanupPeers();
    return send(res, 200, JSON.stringify({ ...sharedState, peers: Object.values(peers), serverTime: Date.now() }));
  }

  if (url.pathname === '/api/state' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const clientId = body.clientId || 'anonymous';
      const name = body.name || 'Peer';
      peers[clientId] = { id: clientId, name, lastSeen: Date.now() };
      if (body.state && Number(body.state.version || 0) >= Number(sharedState.version || 0)) {
        sharedState = { ...body.state, updatedAt: Date.now(), version: Number(body.state.version || 0) + 1 };
      }
      cleanupPeers();
      return send(res, 200, JSON.stringify({ ok: true, version: sharedState.version, peers: Object.values(peers) }));
    } catch (e) {
      return send(res, 400, JSON.stringify({ ok: false, error: e.message }));
    }
  }

  if (url.pathname === '/api/reset' && req.method === 'POST') {
    sharedState = freshState();
    return send(res, 200, JSON.stringify({ ok: true, state: sharedState }));
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^\.\.(\/|\\|$)/, '');
  const target = path.join(publicDir, file);
  if (!target.startsWith(publicDir)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(target, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, contentType(target));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nSouthStack UI Builder is running.');
  console.log(`Host PC:   http://127.0.0.1:${PORT}`);
  lanIps().forEach(ip => console.log(`LAN peer:  http://${ip}:${PORT}`));
  console.log('\nOpen the LAN peer URL from phones/laptops on the same Wi-Fi.');
});
