const crypto = require('crypto');
const { redirect } = require('./response');

const SECRET = process.env.SECRET || '3828aaf8ba32fe3006d37c7f3ac46bcb';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'ou_admin_auth';

function encryptCookie(value) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET), iv);
  let encrypted = cipher.update(JSON.stringify(value));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptCookie(cookie) {
  try {
    const [iv, encrypted] = cookie.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (e) {
    return null;
  }
}

function getCookie(req, key) {
  const cookies = {};
  req.headers.cookie && req.headers.cookie.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    cookies[parts[0].trim()] = (parts[1] || '').trim();
  });
  return cookies[key];
}

function setCookie(res, key, value, options = {}) {
  const cookieParts = [`${key}=${value}`];
  if(options.httpOnly) cookieParts.push('HttpOnly');
  if(options.maxAge) cookieParts.push(`Max-Age=${options.maxAge}`);
  if(options.path) cookieParts.push(`Path=${options.path}`);
  if(options.domain) cookieParts.push(`Domain=${options.domain}`);
  if(options.secure) cookieParts.push('Secure');
  if(options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function removeCookie(res, key) {
  setCookie(res, key, '', { maxAge: 0, path: '/' });
}

function getUserFromRequest(req) {
  const cookie = getCookie(req, AUTH_COOKIE_NAME);
  if (!cookie) return null;
  return decryptCookie(cookie);
}

function login(res, username, role = 'user') {
  const authData = { 
    username, 
    role, 
    date: new Date().toISOString() 
  };

  const encrypted = encryptCookie(authData);
  setCookie(res, AUTH_COOKIE_NAME, encrypted, { httpOnly: true, maxAge: 3600, path: '/' });
}

function logout(res) {
  removeCookie(res, AUTH_COOKIE_NAME);
}

module.exports = {
  encryptCookie,
  decryptCookie,
  getCookie,
  setCookie,
  removeCookie,
  login,
  logout,
  getUserFromRequest
};