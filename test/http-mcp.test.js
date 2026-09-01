import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { openDatabase } from '../workflow/database/database.js';
import { WorkflowEngine } from '../workflow/engine/workflow-engine.js';
import { startHttpServer } from '../workflow/mcp/server.js';

test('serves workflow tools through Streamable HTTP MCP', async () => {
  const engine = new WorkflowEngine(openDatabase(':memory:'));
  const http = await startHttpServer(engine, { host: '127.0.0.1', port: 0 });
  const client = new Client({ name: 'workflow-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`));
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === 'deploy_workflow'));
    assert.ok(listed.tools.some((tool) => tool.name === 'fetch_and_lock_jobs'));

    const deploy = await client.callTool({
      name: 'deploy_workflow',
      arguments: {
        definition: {
          key: 'http-flow', name: 'HTTP Flow',
          nodes: [{ key: 'start', type: 'START' }, { key: 'end', type: 'END' }],
          edges: [{ from: 'start', to: 'end' }]
        }
      }
    });
    assert.equal(deploy.isError, undefined);
    assert.equal(deploy.structuredContent.result.version, 1);

    const start = await client.callTool({ name: 'start_process', arguments: { processKey: 'http-flow', variables: {} } });
    assert.equal(start.structuredContent.result.status, 'COMPLETED');

    const health = await fetch(`${http.url}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
  } finally {
    await client.close();
    await http.close();
    engine.close();
  }
});
