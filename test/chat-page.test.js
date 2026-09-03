import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantReply, chatPage, renderMarkdown, stepProgressGraphic } from '../public/app/components/chat-page.js';

test('renders the chat welcome screen and composer controls', () => {
  const html = chatPage();
  assert.match(html, /Ask Flow/);
  assert.match(html, /data-chat-new/);
  assert.match(html, /Conversation history/);
  assert.match(html, /aria-label="Add image"/);
  assert.match(html, /aria-label="Send message"/);
  assert.doesNotMatch(html, /microphone|data-chat-mic/i);
  assert.doesNotMatch(html, /chat-avatar/);
});

test('escapes chat messages and creates a contextual local reply', () => {
  const html = chatPage({
    sessions: [{ id: 'safe-id', title: '<img src=x>', updatedAt: new Date().toISOString() }],
    activeSession: { id: 'safe-id', messages: [{ role: 'user', content: '<script>alert(1)</script>' }] },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /chat-avatar/);
  assert.match(assistantReply('show active requests'), /show active requests/);
});

test('renders a failed run error in both the conversation and step list', () => {
  const html = chatPage({
    activeSession: {
      id: 'failed-session',
      messages: [{ role: 'user', content: 'Run it' }],
      latestRun: {
        status: 'failed',
        error: 'Provider <offline>',
        stepSummary: [{ id: 'model-1', label: 'Model turn 1', status: 'failed', error: 'Provider <offline>' }],
      },
    },
  });
  assert.match(html, /Flow couldn’t complete this request/);
  assert.match(html, /Model turn 1/);
  assert.equal(html.match(/Provider &lt;offline&gt;/g)?.length, 2);
  assert.doesNotMatch(html, /Provider <offline>/);
});

test('renders pipe tables with column alignment and escaped content', () => {
  const markdown = `| ID | Key | Name | Version |
|---:|---|---|---:|
| 1 | candidate-recruitment-onboarding | Candidate Recruitment and Onboarding | 1 |
| 10 | it-customer-support | IT and Customer Support — Request Resolution | 1 |
| 11 | opus2 | <script>alert(1)</script> | 1 |`;
  const html = renderMarkdown(markdown);
  assert.match(html, /<table>/);
  assert.match(html, /<thead><tr><th class="align-right">ID<\/th>/);
  assert.match(html, /<td class="align-right">10<\/td>/);
  assert.match(html, /Candidate Recruitment and Onboarding/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal((html.match(/<tr>/g) || []).length, 4);
});

test('renders fenced and raw SVG as safe image previews', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 20 20"><title>Process map</title><script>alert(2)</script><circle cx="10" cy="10" r="8"/></svg>';
  for (const markdown of [`\`\`\`svg\n${source}\n\`\`\``, source]) {
    const html = renderMarkdown(markdown);
    assert.match(html, /<figure class="chat-svg-preview">/);
    assert.match(html, /<img src="data:image\/svg\+xml;charset=utf-8,/);
    assert.match(html, /alt="Process map"/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /onload="alert/);
    const encoded = html.match(/data:image\/svg\+xml;charset=utf-8,([^\"]+)/)?.[1];
    assert.equal(decodeURIComponent(encoded), source);
  }
});

test('keeps every run inline and makes every step independently expandable', () => {
  const html = chatPage({
    activeSession: {
      id: 'history-session',
      messages: [
        { id: 1, role: 'user', content: 'First prompt' },
        { id: 2, role: 'assistant', content: 'First answer' },
        { id: 3, role: 'user', content: 'Second prompt' },
        { id: 4, role: 'assistant', content: 'Second answer' },
      ],
      runs: [
        {
          id: 'run-1', userMessageId: 1, status: 'completed', inputTokens: 4, outputTokens: 2,
          stepSummary: [{ id: 'model-1', label: 'Model turn 1', status: 'completed', details: [{ title: 'Model', text: 'test-model' }] }],
        },
        {
          id: 'run-2', userMessageId: 3, status: 'completed', inputTokens: 5, outputTokens: 3,
          stepSummary: [{ id: 'tool-1', label: 'workflow.list_tasks', status: 'completed', details: [{ title: 'Response', text: '{"tasks":[]}' }] }],
        },
      ],
    },
  });
  assert.equal((html.match(/class="chat-steps chat-run-history"/g) || []).length, 2);
  assert.equal((html.match(/class="chat-step completed"/g) || []).length, 2);
  assert.match(html, /class="chat-run-copy"[\s\S]*?class="chat-step-progress"/);
  assert.match(html, /<details ><summary><span class="chat-step-marker">/);
  assert.match(html, /<h4>Response<\/h4><pre>\{&quot;tasks&quot;:\[\]\}<\/pre>/);
  assert.ok(html.indexOf('First prompt') < html.indexOf('run-1') || html.includes('Model turn 1'));
});

test('shows the current model and renders an escaped model selector', () => {
  const html = chatPage({
    model: 'provider/model-a',
    models: ['provider/model-a', 'provider/<model-b>'],
  });
  assert.match(html, /data-chat-model-picker/);
  assert.match(html, />provider\/model-a</);
  assert.match(html, /data-chat-model="provider\/model-a" class="active"/);
  assert.match(html, /provider\/&lt;model-b&gt;/);
  assert.doesNotMatch(html, /provider\/<model-b>/);
});

test('renders animated step progress instead of a summary dot', () => {
  const completed = stepProgressGraphic([
    { status: 'completed' },
    { status: 'failed' },
  ], 'failed');
  assert.match(completed, /class="chat-step-progress"/);
  assert.match(completed, /chat-progress-connector failed/);
  assert.match(completed, /chat-progress-node completed/);
  assert.match(completed, /chat-progress-node failed/);
  assert.doesNotMatch(completed, /step-pulse/);
  assert.doesNotMatch(completed, /<animate/);

  const running = stepProgressGraphic([
    { status: 'completed' },
    { status: 'running' },
  ], 'running');
  assert.match(running, /chat-progress-pulse/);
  assert.match(running, /chat-progress-runner/);
  assert.match(running, /<animate attributeName="cx"/);
});
