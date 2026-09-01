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
    return this.routes.find((r) => r.path === path) || this.routes.find((r) => r.path === '*');
  }
  navigate(path, options = {}) {
    window.history[options.replace ? 'replaceState' : 'pushState']({}, '', path);
    return this.render(path);
  }
  render(path = window.location.pathname) {
    const route = this.match(path);
    if (!route) return false;
    route.handler({ query: new URLSearchParams(path.split('?')[1] || '') });
    return true;
  }
}
