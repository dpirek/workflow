import BaseComponent from "../components/base-component.js";

class Header extends BaseComponent {
  users = [];
  navList = [
    { name: 'Home', path: '/' },
    { name: 'Users', path: '/user' }
  ];
  authNavList = [];
  
  constructor({ user } = null) {
    super();
    this.user = user;
  }

  logout() {
    fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        this.innerHTML = '';
        this.navigateTo('/login');
      } else {
        console.error('Logout failed');
      }
    })
    .catch(error => console.error('Error during logout:', error));
  }

  connectedCallback() {
    if (this.user) {
      this.authNavList.unshift({ name: `Logout (${this.user.username})` });
      this.render();
    }    
  }

  getMainNav() {
    return this.createElement('ul', { 
      class: 'nav me-auto', 
      children: this.navList.map(item => 
      this.createElement('li', { class: 'nav-item', children: [
        this.createElement('a', { 
          href: item.path, 
          class: 'nav-link link-body-emphasis px-2', 
          innerText: item.name,
          addEventListener: { 
            name: 'click',
            handler: (e) => this.navigateTo(item.path, e)
          }
        })
      ]})
    )});
  }

  getSearchForm() {
    return this.createElement('form', {
      class: 'col-12 col-md-auto mb-3 mb-md-0 me-md-3',
      addEventListener: {
        name: 'submit',
        handler: (e) => {
          e.preventDefault();
          const query = e.target.querySelector('input').value;
          this.navigateTo(`/search?q=${encodeURIComponent(query)}`, e);
        }
      },
      children: [
        this.createElement('input', { 
          type: 'search', 
          class: 'form-control', 
          placeholder: 'Search...', 
          ariaLabel: 'Search',
        })
      ]
    });
  }

  getUserNav() {
    return this.createElement('ul', { 
      class: 'nav d-none d-md-flex', // hide small screens 'd-none d-md-flex
      children: this.authNavList.map(item => {
        return this.createElement('li', { 
          class: 'nav-item', 
          children: [
            this.createElement('a', {
              href: item.path, 
              class: 'nav-link link-body-emphasis px-2', 
              innerText: item.name,
              addEventListener: { 
                name: 'click',
                handler: (e) => {
                  if(item.name.startsWith('Logout')) {
                    e.preventDefault();
                    this.logout();
                  } else {
                    this.navigateTo(item.path, e);
                  }
                }
              }
            })
          ]
        })
    })});
  }

  render() {
    const header = this.createElement('div', {
      children: [
        this.createElement('nav', { class: 'py-2 bg-body-tertiary border-bottom', children: [
          this.createElement('div', { 
            class: 'container-fluid d-flex flex-wrap', 
            children: [
              this.getMainNav(),
              this.getSearchForm(),
              this.getUserNav()
            ]
          })
        ]})
      ]
    });

    this.appendChild(header);
  }
}

customElements.define("app-header", Header);

export default Header;
