import { createServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { buildMcpServer } from './tools.js';

export async function startHttpServer(engine, options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const allowed = [...new Set([host, 'localhost', '127.0.0.1', '[::1]'])];
  const validateHost = hostHeaderValidation(allowed);
  const validateOrigin = originValidation(allowed);
  const handler = createMcpHandler(() => buildMcpServer(engine), {
    responseMode: 'auto',
    legacy: 'stateless',
    onerror: (error) => console.error(JSON.stringify({ event: 'mcp.error', message: error.message }))
  });
  const handleMcp = toNodeHandler(handler, {
    onerror: (error) => console.error(JSON.stringify({ event: 'http.error', message: error.message }))
  });

  const httpServer = createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'sqlite-workflow-mcp' }));
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', mcpEndpoint: '/mcp' }));
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': req.headers.origin || '*',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
        'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version'
      });
      res.end();
      return;
    }
    await handleMcp(req, res);
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, resolve);
  });
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server: httpServer,
    url: `http://${host}:${actualPort}`,
    async close() {
      await handler.close();
      await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
  };
}
