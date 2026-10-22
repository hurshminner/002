import http from 'node:http';

// Keep the editor preview and API on one browser origin. Only binds loopback.
const preview = new URL(process.env.CREATOR_PREVIEW_URL ?? 'http://127.0.0.1:7456');
const backend = new URL('http://127.0.0.1:8787');
function target(path) { return path.startsWith('/api/') ? backend : preview; }
function options(request) {
  const destination = target(request.url);
  return { hostname: destination.hostname, port: destination.port, path: request.url,
    method: request.method, headers: { ...request.headers, host: destination.host } };
}
const server = http.createServer((request, response) => {
  const upstream = http.request(options(request), result => {
    response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Start Creator preview and npm run dev:server first.'); });
  request.pipe(upstream);
});
server.on('upgrade', (request, socket, head) => {
  const upstream = http.request(options(request));
  upstream.on('upgrade', (response, remote, remoteHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
      .map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    remote.pipe(socket); socket.pipe(remote);
    remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
    socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy());
  });
  upstream.on('response', response => {
    socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);
    response.resume();
  });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
server.listen(8788, '127.0.0.1', () => console.log('Local preview gateway listening on port 8788. Open via hostname localhost; ALLOWED_ORIGIN must match.'));
