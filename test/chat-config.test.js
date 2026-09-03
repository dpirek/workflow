import assert from 'node:assert/strict';
import test from 'node:test';
import { chatConfig } from '../workflow/chat/config.js';

test('default chat prompt requires renderable SVG for visual requests', () => {
  const config = chatConfig({});
  assert.match(config.systemPrompt, /any graphic, picture, image/);
  assert.match(config.systemPrompt, /self-contained SVG/);
  assert.match(config.systemPrompt, /fenced svg code block/);
  assert.match(config.systemPrompt, /viewBox/);
  assert.match(config.systemPrompt, /Never include scripts/);
});

test('environment can still replace the complete system prompt', () => {
  assert.equal(chatConfig({ CHAT_SYSTEM_PROMPT: 'Custom instructions' }).systemPrompt, 'Custom instructions');
});
