const auth = require('../utils/auth');

async function login({ username, password, response }) {
  if (username === 'dave' && password === 'zkouzka321') {
    auth.login(response, username, 'admin');
    return {
      username: username,
      email: 'dpirek@gmail.com',
      role: 'admin',
    };
  } else {
    return { error: 'invalid credentials' };
  }
}

async function authApi({ url, method, authUser, body, response }) {
  if (method === 'GET' && url === '/api/auth') {
    return authUser;
  } else if (method === 'POST' && url === '/api/login') {
    const { username, password } = body;
    return await login({ username, password, response });
  } else if (method === 'POST' && url === '/api/logout') {
    auth.logout(response);
    return { message: 'logged out' };
  }
  return { error: 'method not allowed' };
}

module.exports = { authApi };
