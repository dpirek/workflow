export default class Router {
  constructor() {
    this.routes = [];
    this.beforeRender = null;
    window.addEventListener('popstate', () => this.render().catch((error) => {
      window.dispatchEvent(new CustomEvent('router-error', { detail: error }));
    }));
  }
  setBeforeRender(handler) {
    this.beforeRender = handler;
    return this;
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
    return this.render(path, options);
  }
  async render(path = window.location.pathname, options = {}) {
    if (!options.skipRefresh && this.beforeRender) await this.beforeRender(path);
    const match = this.match(path);
    if (!match) return false;
    await match.route.handler({ params: match.params, query: new URLSearchParams(path.split('?')[1] || '') });
    return true;
  }
}
