import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../workflow/database/database.js';
import { WorkflowEngine } from '../workflow/engine/workflow-engine.js';
import { startHttpServer } from '../workflow/mcp/server.js';

test('serves workflow tools through Streamable HTTP MCP', async () => {
  const engine = new WorkflowEngine(openDatabase(':memory:'));
  const http = await startHttpServer(engine, { host: '127.0.0.1', port: 0 });
  try {
    await rpc(http.url, 'initialize');
    const listed = await rpc(http.url, 'tools/list');
    assert.ok(listed.result.tools.some((tool) => tool.name === 'deploy_workflow'));
    assert.ok(listed.result.tools.some((tool) => tool.name === 'fetch_and_lock_jobs'));

    const deploy = await rpc(http.url, 'tools/call', {
      name: 'deploy_workflow',
      arguments: {
        definition: {
          key: 'http-flow',
          name: 'HTTP Flow',
          nodes: [
            { key: 'start', type: 'START' },
            { key: 'end', type: 'END' },
          ],
          edges: [{ from: 'start', to: 'end' }],
        },
      },
    });
    assert.equal(deploy.result.isError, undefined);
    assert.equal(deploy.result.structuredContent.result.version, 1);

    const start = await rpc(http.url, 'tools/call', {
      name: 'start_process',
      arguments: { processKey: 'http-flow', variables: {} },
    });
    assert.equal(start.result.structuredContent.result.status, 'COMPLETED');

    const health = await fetch(`${http.url}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
  } finally {
    await http.close();
    engine.close();
  }
});

async function rpc(base, method, params) {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Math.random(), method, params }),
  });
  return response.json();
}
