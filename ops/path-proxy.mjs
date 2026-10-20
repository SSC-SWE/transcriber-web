// Path-splitting reverse proxy that sits behind ngrok's single free static
// domain:
//
//   /tc/*   -> transcriber API + app   (127.0.0.1:8787, /tc prefix stripped)
//   /*      -> Hermes dashboard        (127.0.0.1:9119)
//
// Streams request and response bodies, and forwards WebSocket upgrades so the
// dashboard's live connection keeps working.
import http from 'node:http';

const PORT = Number(process.env.PROXY_PORT) || 9000;

const TRANSCRIBER = { host: '127.0.0.1', port: 8787 };
const HERMES = { host: '127.0.0.1', port: 9119 };

function routeFor(url) {
  const path = url.split('?')[0];
  if (path === '/tc' || path.startsWith('/tc/')) {
    let rest = url.slice(3);
    if (rest && !rest.startsWith('/')) rest = `/${rest}`; // '/tc?query' -> '/?query'
    return { target: TRANSCRIBER, rewrittenUrl: rest || '/' };
  }
  return { target: HERMES, rewrittenUrl: url };
}

function forward(req, res) {
  const { target, rewrittenUrl } = routeFor(req.url);
  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: rewrittenUrl,
      headers: req.headers, // Host and x-forwarded-* preserved as received
    },
    (ures) => {
      res.writeHead(ures.statusCode ?? 502, ures.headers);
      ures.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream service is unavailable.' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

const server = http.createServer(forward);
// Large audio uploads over slow links must not be cut off.
server.requestTimeout = 0;
server.headersTimeout = 60000;

server.on('upgrade', (req, socket, head) => {
  const { target, rewrittenUrl } = routeFor(req.url);
  const upstream = http.request({
    host: target.host,
    port: target.port,
    method: req.method,
    path: rewrittenUrl,
    headers: req.headers,
  });
  upstream.on('upgrade', (ures, usocket, uhead) => {
    const lines = [`HTTP/${ures.httpVersion} ${ures.statusCode} ${ures.statusMessage}`];
    for (let i = 0; i < ures.rawHeaders.length; i += 2) {
      lines.push(`${ures.rawHeaders[i]}: ${ures.rawHeaders[i + 1]}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (uhead.length) socket.write(uhead);
    usocket.pipe(socket);
    socket.pipe(usocket);
    const close = () => {
      socket.destroy();
      usocket.destroy();
    };
    socket.on('error', close);
    usocket.on('error', close);
    socket.on('close', close);
    usocket.on('close', close);
  });
  upstream.on('error', () => socket.destroy());
  // Non-101 responses (auth rejects, unknown paths) must still reach the client.
  upstream.on('response', (ures) => {
    const lines = [`HTTP/${ures.httpVersion} ${ures.statusCode} ${ures.statusMessage}`];
    for (let i = 0; i < ures.rawHeaders.length; i += 2) {
      lines.push(`${ures.rawHeaders[i]}: ${ures.rawHeaders[i + 1]}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    ures.pipe(socket);
    ures.on('end', () => socket.end());
  });
  upstream.end(head.length ? head : undefined);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[path-proxy] listening on http://127.0.0.1:${PORT} (/tc -> :8787, else -> :9119)`);
});
