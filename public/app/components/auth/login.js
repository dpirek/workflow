import BaseComponent from "../base-component.js";

class Login extends BaseComponent {  
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  getLoginForm() {
    return this.createElement('form', {
      id: 'loginForm',
      children: [
        this.createElement('div', {
          class: 'mb-3',
          children: [
            this.createElement('label', { for: 'username', class: 'form-label', innerText: 'Username' }),
            this.createElement('input', { type: 'text', class: 'form-control', id: 'username', name: 'username', required: true })
          ]
        }),
        this.createElement('div', {
          class: 'mb-3',
          children: [
            this.createElement('label', { for: 'password', class: 'form-label', innerText: 'Password' }),
            this.createElement('input', { type: 'password', class: 'form-control', id: 'password', name: 'password', required: true })
          ]
        }),
        this.createElement('button', { type: 'submit', class: 'btn btn-primary', innerText: 'Login' }),
        this.createElement('div', { id: 'loginError', class: 'mt-3 text-danger' })
      ],
      addEventListener: {
        name: 'submit',
        handler: (e) => this.handleLogin(e)
      }
    });
  }

  render() {
    const loginForm = this.createElement('div', {
      class: 'container mt-5',
      children: [
        this.createElement('div', {
          class: 'row justify-content-center',
          children: [
            this.createElement('div', {
              class: 'col-md-6',
              children: [
                this.createElement('div', {
                  class: 'card',
                  children: [
                    this.createElement('div', {
                      class: 'card-header',
                      children: [
                        this.createElement('h3', { innerText: 'Login' })
                      ]
                    }),
                    this.createElement('div', {
                      class: 'card-body',
                      children: [
                        this.getLoginForm()
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    this.appendChild(loginForm);
  }

  async handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();
      if (result.error) {
        this.showError(result.error);
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      this.showError('An error occurred during login. Please try again.');
      console.error('Login error:', error);
    }
  }

  showError(message) {
    const errorDiv = this.querySelector('#loginError');
    if (errorDiv) {
      errorDiv.innerText = message;
    }
  }
}

customElements.define('app-login', Login);

export default Login;