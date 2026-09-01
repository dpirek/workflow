class Router {
  constructor() {
    this.routes = [];
    window.addEventListener('popstate', (e) => {
      this.navigate(window.location.pathname);
    });
  }

  addRoute(path, handler) {
    this.routes.push({ path, handler });
  }

  navigate(path) {
    const match = this.match(path);
    if (match) {
      match.handler(match.params);
      //match.handler(...Object.values(match.params));
    } else {
      console.warn('No route matched for path:', path);
    }
  }

  match(url) {
    const params = {};
    
    const route = this.routes.find(r => {
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

    return route ? { handler: route.handler, params, type: route.type } : null;
  }
}

export default Router;
