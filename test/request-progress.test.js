import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRequestProgress, requestProgressGraphic } from '../public/app/components/request-progress.js';

test('normalizes request progress for display', () => {
  assert.deepEqual(normalizeRequestProgress({ completed: 3, remaining: 5 }), {
    completed: 3,
    remaining: 5,
    total: 8,
  });
});

test('truncates long request progress graphics while preserving exact counts', () => {
  const graphic = requestProgressGraphic({ completed: 7, remaining: 13 });
  assert.equal((graphic.match(/request-step-dot/g) || []).length, 8);
  assert.equal((graphic.match(/request-step-dot completed/g) || []).length, 7);
  assert.match(graphic, /request-step-more">\+12/);
  assert.match(graphic, /7 steps completed, 13 to go/);
  assert.match(graphic, /<strong>7<\/strong> completed/);
});
