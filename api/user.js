const auth = require('../utils/auth');

async function list() {
  return [
    { id: 1, username: 'user1', email: 'user1@example.com', date: '2024-06-01' },
    { id: 2, username: 'user2', email: 'user2@example.com', date: '2024-06-02' },
    { id: 3, username: 'user3', email: 'user3@example.com', date: '2024-06-03' }
  ];
}

async function get({ username }) {
  return null;
}

async function create(body) {
  return null;
}

async function remove({ id }) {
  return null;
}

async function userApi({ url, method, body, params, queryParams }) {
  if (method === 'GET' && url === '/api/user') return await list();
  if (method === 'GET' && url.startsWith('/api/user/')) return await get(params);
  if (method === 'POST' && url === '/api/user') return await create(body);
  if (method === 'DELETE' && url.startsWith('/api/user/')) return await remove(params);
  return { error: 'Unsupported method', url, method, params, queryParams };
}

module.exports = { userApi };