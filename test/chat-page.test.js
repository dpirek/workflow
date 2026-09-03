import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantReply, chatPage, renderMarkdown } from '../public/app/components/chat-page.js';

test('renders the chat welcome screen and composer controls', () => {
  const html = chatPage();
  assert.match(html, /Ask Flow/);
  assert.match(html, /data-chat-new/);
  assert.match(html, /Conversation history/);
  assert.match(html, /aria-label="Add image"/);
  assert.match(html, /aria-label="Send message"/);
});

test('escapes chat messages and creates a contextual local reply', () => {
  const html = chatPage({
    sessions: [{ id: 'safe-id', title: '<img src=x>', updatedAt: new Date().toISOString() }],
    activeSession: { id: 'safe-id', messages: [{ role: 'user', content: '<script>alert(1)</script>' }] },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
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
