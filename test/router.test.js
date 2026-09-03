import assert from 'node:assert/strict';
import test from 'node:test';

test('router refreshes data before rendering every navigation', async () => {
  const listeners = new Map();
  const originalWindow = globalThis.window;
  const originalCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };
  globalThis.window = {
    location: { pathname: '/first' },
    history: {
      pushState(_state, _title, path) { globalThis.window.location.pathname = path; },
      replaceState(_state, _title, path) { globalThis.window.location.pathname = path; },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatchEvent() {},
  };

  try {
    const { default: Router } = await import(`../public/app/router.js?test=${Date.now()}`);
    const calls = [];
    const router = new Router()
      .setBeforeRender(async (path) => calls.push(`refresh:${path}`))
      .addRoute('/first', () => calls.push('render:first'))
      .addRoute('/second', () => calls.push('render:second'));

    await router.navigate('/second');
    assert.deepEqual(calls, ['refresh:/second', 'render:second']);

    calls.length = 0;
    await router.render('/first', { skipRefresh: true });
    assert.deepEqual(calls, ['render:first']);
    assert.equal(typeof listeners.get('popstate'), 'function');
  } finally {
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  }
});
