import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowChatAgent } from '../workflow/chat/agent.js';

function eventStream(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

test('chat agent streams text and calls only the fixed workflow tool registry', async () => {
  const requests = [];
  const calls = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return eventStream([{ type: 'response.completed', response: {
      id: 'response-1',
      output: [{ type: 'function_call', name: 'list_workflows', arguments: '{}', call_id: 'call-1' }],
      usage: { input_tokens: 4, output_tokens: 2 },
    } }]);
    return eventStream([
      { type: 'response.output_text.delta', delta: 'No workflows yet.' },
      { type: 'response.completed', response: {
        id: 'response-2', output_text: 'No workflows yet.', output: [],
        usage: { input_tokens: 3, output_tokens: 5 },
      } },
    ]);
  };
  const mcp = {
    async handle(request) {
      if (request.method === 'tools/list') return {
        tools: [{ name: 'list_workflows', description: 'List workflows', inputSchema: { type: 'object' } }],
      };
      calls.push(request.params);
      return { content: [{ type: 'text', text: '[]' }] };
    },
  };
  const events = [];
  const agent = new WorkflowChatAgent({
    config: {
      model: 'test-model', apiKey: 'test-key', baseUrl: 'https://example.test/v1',
      systemPrompt: 'Test prompt', maxToolTurns: 3,
    },
    mcp,
    fetchImpl,
  });
  const result = await agent.run({
    messages: [{ role: 'user', content: 'List workflows' }],
    model: 'selected-model',
    emit: (event) => events.push(event),
  });

  assert.equal(result.text, 'No workflows yet.');
  assert.deepEqual(calls, [{ name: 'list_workflows', arguments: {} }]);
  assert.equal(requests[0].model, 'selected-model');
  assert.equal(Object.hasOwn(requests[1], 'previous_response_id'), false);
  assert.ok(requests[1].input.some((item) => item.type === 'function_call' && item.call_id === 'call-1'));
  assert.ok(requests[1].input.some((item) => item.type === 'function_call_output' && item.call_id === 'call-1'));
  assert.equal(result.usage.input_tokens, 7);
  assert.equal(result.usage.output_tokens, 7);
  assert.ok(events.some((event) => event.type === 'delta' && event.text === 'No workflows yet.'));
  assert.ok(result.steps.some((step) => step.label === 'workflow.list_workflows'));
  assert.ok(result.steps.find((step) => step.label === 'workflow.list_workflows').details.some(({ title }) => title === 'Response'));
  assert.ok(result.steps.find((step) => step.label === 'Model turn 1').details.some(({ title }) => title === 'Input'));
});

test('failed workflow tools include their error in the step summary', async () => {
  let requestCount = 0;
  const agent = new WorkflowChatAgent({
    config: {
      model: 'test-model', apiKey: 'test-key', baseUrl: 'https://example.test/v1',
      systemPrompt: 'Test prompt', maxToolTurns: 3,
    },
    mcp: {
      async handle(request) {
        if (request.method === 'tools/list') return {
          tools: [{ name: 'get_workflow', description: 'Get workflow', inputSchema: { type: 'object' } }],
        };
        return { isError: true, content: [{ type: 'text', text: 'Workflow 404 was not found' }] };
      },
    },
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) return eventStream([{ type: 'response.completed', response: {
        id: 'failed-tool-response',
        output: [{ type: 'function_call', name: 'get_workflow', arguments: '{"definitionId":404}', call_id: 'failed-call' }],
      } }]);
      return eventStream([{ type: 'response.completed', response: {
        id: 'final-response', output_text: 'That workflow could not be found.', output: [],
      } }]);
    },
  });

  const result = await agent.run({ messages: [{ role: 'user', content: 'Get workflow 404' }] });
  const failed = result.steps.find((step) => step.id === 'failed-call');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Workflow 404 was not found');
});

test('loads model identifiers from an OpenAI-compatible models endpoint', async () => {
  const requests = [];
  const agent = new WorkflowChatAgent({
    config: { model: 'default', apiKey: 'secret', baseUrl: 'https://provider.test/v1' },
    mcp: {},
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.deepEqual(await agent.listModels(), ['model-a', 'model-b']);
  assert.equal(requests[0].url, 'https://provider.test/v1/models');
  assert.equal(requests[0].options.headers.authorization, 'Bearer secret');
});
