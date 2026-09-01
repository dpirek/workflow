export default class Router {
  constructor() {
    this.routes = [];
    window.addEventListener('popstate', () => this.render());
  }
  addRoute(path, handler) {
    this.routes.push({ path, handler });
    return this;
  }
  match(pathname) {
    const path = (pathname || '/').split('?')[0];
    for (const route of this.routes) {
      if (route.path === '*') continue;
      const routeParts = route.path.split('/');
      const pathParts = path.split('/');
      if (routeParts.length !== pathParts.length) continue;

      const params = {};
      const matches = routeParts.every((part, index) => {
        if (!part.startsWith(':')) return part === pathParts[index];
        params[part.slice(1)] = decodeURIComponent(pathParts[index]);
        return true;
      });
      if (matches) return { route, params };
    }

    const fallback = this.routes.find((route) => route.path === '*');
    return fallback ? { route: fallback, params: {} } : null;
  }
  navigate(path, options = {}) {
    window.history[options.replace ? 'replaceState' : 'pushState']({}, '', path);
    return this.render(path);
  }
  render(path = window.location.pathname) {
    const match = this.match(path);
    if (!match) return false;
    match.route.handler({ params: match.params, query: new URLSearchParams(path.split('?')[1] || '') });
    return true;
  }
}
