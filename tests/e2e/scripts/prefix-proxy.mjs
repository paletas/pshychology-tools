// Test stand-in for Traefik stripprefix /new + redirectregex (HomeLab psychology-next.compose.yml.j2).
// Switch mode: LEGACY_UPSTREAM set = /legacy and /legacy/ redirect 302 to /legacy/wisc3, /legacy/* forwarded unchanged (no strip) to it, as Traefik psytoolslegacy.
// Env: PROXY_PORT, NEW_UPSTREAM (http url), and exactly one of ROOT_UPSTREAM (http url) or ROOT_DIR (static directory); optional RETIRE_PATH (as Traefik psytoolsretire: /new/service-worker.js is forwarded to that upstream path, no strip).
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const port = Number(process.env.PROXY_PORT);
const newUp = new URL(process.env.NEW_UPSTREAM ?? '');
const rootUp = process.env.ROOT_UPSTREAM ? new URL(process.env.ROOT_UPSTREAM) : null;
const legacyUp = process.env.LEGACY_UPSTREAM ? new URL(process.env.LEGACY_UPSTREAM) : null;
const rootDir = process.env.ROOT_DIR ?? null;
const retirePath = process.env.RETIRE_PATH ?? '';
if (!port || (!rootUp === !rootDir)) {
  console.error('set PROXY_PORT, NEW_UPSTREAM and exactly one of ROOT_UPSTREAM / ROOT_DIR');
  process.exit(2);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function forward(req, res, upstream, path) {
  const up = request(
    { hostname: upstream.hostname, port: upstream.port, path, method: req.method, headers: { ...req.headers, host: upstream.host } },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = normalize(join(rootDir, rel));
  const type = types[extname(file)];
  if (!type || !file.startsWith(normalize(rootDir) + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

const server = createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://proxy');
  if (retirePath && u.pathname === '/new/service-worker.js') {
    forward(req, res, newUp, retirePath);
  } else if (legacyUp && (u.pathname === '/legacy' || u.pathname === '/legacy/')) {
    res.writeHead(302, { location: '/legacy/wisc3' }).end();
  } else if (legacyUp && u.pathname.startsWith('/legacy/')) {
    forward(req, res, legacyUp, req.url);
  } else if (u.pathname === '/new' || u.pathname === '/new/') {
    res.writeHead(302, { location: '/new/wisc3' }).end();
  } else if (u.pathname.startsWith('/new/')) {
    forward(req, res, newUp, req.url.slice(4));
  } else if (rootUp) {
    forward(req, res, rootUp, req.url);
  } else {
    serveStatic(u.pathname, res);
  }
});

// the old app registers server interactivity (Blazor circuit WebSocket)
server.on('upgrade', (req, socket, head) => {
  const target = legacyUp ? ((req.url ?? '').startsWith('/legacy/') ? legacyUp : null) : rootUp && !(req.url ?? '').startsWith('/new/') ? rootUp : null;
  if (!target) {
    socket.destroy();
    return;
  }
  const up = connect(Number(target.port), target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i].toLowerCase() === 'host' ? target.host : req.rawHeaders[i + 1]}`);
    }
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(port, () => console.log(`prefix-proxy on :${port}`));
