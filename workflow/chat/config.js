import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadChatEnvironment(path = resolve('.env')) {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function chatConfig(env = process.env) {
  return {
    model: String(env.CHAT_LLM_MODEL || env.OPENAI_MODEL || 'gpt-5.1').trim(),
    apiKey: String(env.CHAT_LLM_API_KEY || env.OPENAI_API_KEY || '').trim(),
    baseUrl: String(env.CHAT_LLM_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .replace(/\/$/, ''),
    systemPrompt: String(
      env.CHAT_SYSTEM_PROMPT ||
        'You are Flow, an operations assistant for the connected workflow engine. Use the workflow MCP tools to inspect or change workflow data when needed. Be concise, accurate, and never claim an operation succeeded unless its tool result confirms it. When the user asks for any graphic, picture, image, illustration, diagram, chart, plot, graph, map, or other visual, respond with a self-contained SVG in a fenced svg code block so the chat can render it. The SVG must include xmlns, a viewBox, and a descriptive title; use inline SVG elements and styles only. Never include scripts, event handlers, foreignObject elements, external assets, Mermaid, ASCII art, or raster-image links.',
    ),
    maxToolTurns: Math.max(1, Math.min(30, Number(env.CHAT_MAX_TOOL_TURNS || 12))),
  };
}
