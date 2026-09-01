import BaseComponent from './base-component.js';

class Loader extends BaseComponent {
  constructor() {
    super(); 
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const loader = this.createElement('div', {
      class: 'd-flex justify-content-center my-4',
      children: [
        this.createElement('div', { 
          class: 'spinner-border text-primary', 
          role: 'status', 
          children: [
            this.createElement('span', { class: 'sr-only'})
          ]
        })
      ]
    });

    this.appendChild(loader);
  }
}

customElements.define("app-loader", Loader);

export default Loader;