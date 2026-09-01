import BaseComponent from "../base-component.js";

class Header extends BaseComponent {
  users = [];
  
  constructor({ users, type }) {
    super();
    this.users = users;
    this.type = type;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const header = this.createElement('div', {
      class: 'mb-4',
      children: [
        // this.createElement('p', { innerText: `Total users: ${this.users.length}` }),
        this.createElement('div', {
          class: 'btn-group float-end mt-2',
          children: [
            // this.createElement('a', {
            //   class: `btn btn-primary ${this.type === 'all' ? 'active' : ''}`,
            //   href: '/users/all', 
            //   innerText: 'all', 
            //   addEventListener: {
            //     name: 'click',
            //     handler: (e) => this.navigateTo('/users/all', e)
            //   }
            // }),
            // this.createElement('a', {
            //   class: `btn btn-primary ${this.type === 'm' ? 'active' : ''}`,
            //   href: '/user/dave', innerText: 'male', addEventListener: {
            //     name: 'click',
            //     handler: (e) => this.navigateTo('/users/m', e)
            //   }
            // }),
            // this.createElement('a', {
            //   class: `btn btn-primary ${this.type === 'z' ? 'active' : ''}`,
            //   href: '/settings', innerText: 'female', addEventListener: {
            //     name: 'click',
            //     handler: (e) => this.navigateTo('/users/z', e)
            //   }
            // }),
          ]
        }),
        this.createElement('h1', { innerText: 'Users' }),
        this.createElement('hr'),
      ]
    });

    this.appendChild(header);
  }

  navigateTo(path, event) {
    if (event) event.preventDefault();
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

customElements.define("user-header", Header);

export default Header;
