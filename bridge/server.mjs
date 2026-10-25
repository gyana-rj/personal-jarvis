import http from 'node:http';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
http
  .createServer((_req, res) => res.end('ok'))
  .listen(port, '127.0.0.1', () => console.log(`bridge listening on 127.0.0.1:${port}`));
