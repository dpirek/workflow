function getQueryParams(url) {
  const queryParams = {};
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const query = new URLSearchParams(url.substring(queryIndex + 1));
    query.forEach((value, key) => {
      queryParams[key] = value;
    });
  }
  return queryParams;
}

function getBaseUrl(url) {
  const queryIndex = url.indexOf('?');
  return queryIndex !== -1 ? url.substring(0, queryIndex) : url;
}

function route() {
  const routes = [];
  return {
    add: (path, method, handler, type, auth = true, response = null) => {
      routes.push({ path, method, handler, type, auth, response });
    },
    match: (url, method) => {
      const params = {};
      const queryParams = getQueryParams(url);
      
      url = getBaseUrl(url);

      const route = routes.find(r => {
        if (r.method && r.method !== method) return false;
        
        const keys = r.path.match(/:\w+/g);
        if (!keys) return r.path === url;
        const regex = new RegExp('^' + r.path.replace(/:\w+/g, '(\\w+)') + '$');
        const match = url.match(regex);
        if (match) {
          keys.forEach((key, i) => {
            params[key.slice(1)] = match[i + 1];
          });
        }
        return match;
      });

      return route ? { 
        handler: route.handler, 
        params,
        queryParams,
        type: route.type,
        auth: route.auth,
        response: route.response ? route.response : null
      } : null;
    }
  };
}

module.exports = { route, getQueryParams, getBaseUrl };