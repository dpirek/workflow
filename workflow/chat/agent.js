function extractResponseText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
}

function safeArguments(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function toolErrorMessage(result) {
  if (!result?.isError) return '';
  const text = (result.content || [])
    .filter((item) => item?.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim();
  return text || 'Workflow tool failed';
}

async function readResponseEvents(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The model response stream is unavailable');
  const decoder = new TextDecoder();
  let buffer = '';
  const parseBlock = (block) => {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data && data !== '[DONE]') onEvent(JSON.parse(data));
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(parseBlock);
  }
  if (buffer.trim()) parseBlock(buffer);
}

function openAiHistory(messages, images) {
  return messages.map((message, index) => {
    const isLast = index === messages.length - 1;
    if (message.role !== 'user' || !isLast || !images.length) {
      return { role: message.role, content: message.content };
    }
    return {
      role: 'user',
      content: [
        { type: 'input_text', text: message.content },
        ...images.map((image) => ({ type: 'input_image', image_url: image.dataUrl })),
      ],
    };
  });
}

export class WorkflowChatAgent {
  constructor({ config, mcp, fetchImpl = fetch }) {
    this.config = config;
    this.mcp = mcp;
    this.fetch = fetchImpl;
  }

  async tools() {
    const { tools } = await this.mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    return tools;
  }

  async callTool(name, args) {
    return this.mcp.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  async run({ messages, images = [], signal, emit = () => {} }) {
    return this.runOpenAi({ messages, images, signal, emit });
  }

  async runOpenAi({ messages, images, signal, emit }) {
    const tools = await this.tools();
    const toolDefinitions = tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || { type: 'object' },
      strict: false,
    }));
    let input = openAiHistory(messages, images);
    const usage = { input_tokens: 0, output_tokens: 0 };
    const steps = [];
    for (let turn = 1; turn <= this.config.maxToolTurns; turn += 1) {
      emit({ type: 'step', step: { id: `model-${turn}`, label: `Model turn ${turn}`, status: 'running' } });
      const headers = { 'content-type': 'application/json' };
      if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
      const requestBody = {
        model: this.config.model,
        instructions: this.config.systemPrompt,
        input,
        tools: toolDefinitions,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        stream: true,
      };
      const response = await this.fetch(`${this.config.baseUrl}/responses`, {
        method: 'POST', headers, body: JSON.stringify(requestBody), signal,
      });
      if (!response.ok) {
        const data = await response.text();
        throw new Error(`Model request failed (HTTP ${response.status}): ${data.slice(0, 600)}`);
      }
      let completed;
      await readResponseEvents(response, (event) => {
        if (event.type === 'response.output_text.delta' && event.delta) emit({ type: 'delta', text: event.delta });
        if (event.type === 'response.completed') completed = event.response;
        if (event.type === 'response.failed') throw new Error(event.response?.error?.message || 'Model response failed');
      });
      if (!completed) throw new Error('Model stream ended before completion');
      usage.input_tokens += Number(completed.usage?.input_tokens || 0);
      usage.output_tokens += Number(completed.usage?.output_tokens || 0);
      const modelStep = { id: `model-${turn}`, label: `Model turn ${turn}`, status: 'completed' };
      steps.push(modelStep);
      emit({ type: 'step', step: modelStep });
      const calls = (completed.output || []).filter((item) => item.type === 'function_call');
      if (!calls.length) {
        const text = extractResponseText(completed);
        if (!text) throw new Error('The model returned no answer');
        return { text, steps, usage };
      }
      // Carry response items forward explicitly instead of relying on
      // previous_response_id. Several OpenAI-compatible providers implement
      // the Responses API but only accept null for that optional field.
      input = [...input, ...(completed.output || [])];
      for (const call of calls) {
        const label = `workflow.${call.name}`;
        emit({ type: 'step', step: { id: call.call_id, label, status: 'running' } });
        const result = await this.callTool(call.name, safeArguments(call.arguments));
        const failed = result?.isError === true;
        const toolStep = {
          id: call.call_id,
          label,
          status: failed ? 'failed' : 'completed',
          ...(failed ? { error: toolErrorMessage(result) } : {}),
        };
        steps.push(toolStep);
        emit({ type: 'step', step: toolStep });
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
      }
    }
    throw new Error(`Agent exceeded the ${this.config.maxToolTurns}-turn limit`);
  }

}
