import BaseComponent from './base-component.js';

class ModalComponent extends BaseComponent {
  constructor({ title, body, footer }) {
    super();
    this.title = title;
    this.body = body;
    this.footer = footer;
    this.render();
  }

  connectedCallback() {}

  render() {
    document.body.classList.add('modal-open');
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(modalBackdrop);

    // bind close to escape key
    const escFunction = (event) => {
      if (event.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escFunction);
      }
    };

    document.addEventListener('keydown', escFunction);

    this.className = 'modal fade show';
    this.style.display = 'block';

    this.appendChild(
      this.createElement('div', {
        class: 'modal-dialog modal-lg',
        children: [
          this.createElement('div', {
            class: 'modal-content',
            children: [
              this.createElement('div', {
                class: 'modal-header',
                children: [
                  this.createElement('h5', {
                    class: 'modal-title',
                    innerText: this.title,
                  }),
                  this.createElement('button', {
                    type: 'button',
                    class: 'btn-close',
                    ariaLabel: 'Close',
                    addEventListener: {
                      name: 'click',
                      handler: () => this.close(),
                    },
                  }),
                ],
              }),
              this.createElement('div', {
                class: 'modal-body',
                children: [this.body],
              }),
              this.createElement('div', {
                class: 'modal-footer',
                children: [
                  this.footer ||
                    this.createElement('button', {
                      type: 'button',
                      class: 'btn btn-secondary',
                      innerText: 'Close',
                      addEventListener: {
                        name: 'click',
                        handler: () => this.close(),
                      },
                    }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    document.body.appendChild(this);
  }

  close() {
    this.remove();
    document.body.classList.remove('modal-open');
    const modalBackdrop = document.querySelector('.modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.remove();
    }
  }
}

const register = () => customElements.define('modal-component', ModalComponent);
window.WebComponents ? window.WebComponents.waitFor(register) : register();

export default ModalComponent;
