import { createServer } from 'node:http';
import { buildMcpServer } from './tools.js';

export async function startHttpServer(engine, options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const mcp = buildMcpServer(engine);
  const httpServer = createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health' && req.method === 'GET') return respond(res, 200, { status: 'ok', service: 'sqlite-workflow-mcp' });
    if (path !== '/mcp' || req.method !== 'POST') return respond(res, 404, { error: 'Not found', mcpEndpoint: '/mcp' });
    let body = ''; for await (const chunk of req) body += chunk;
    let request;
    try { request = JSON.parse(body); const result = await mcp.handle(request); if (request.id === undefined) return respond(res, 202, {}); respond(res, 200, { jsonrpc: '2.0', id: request.id, result }); }
    catch (error) { respond(res, 200, { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: error.message } }); }
  });
  await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, resolve); });
  return { server: httpServer, url: `http://${host}:${httpServer.address().port}`, async close() { await mcp.close(); await new Promise((resolve, reject) => httpServer.close((e) => e ? reject(e) : resolve())); } };
}

function respond(res, status, value) { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(value)); }
