class BaseComponent extends HTMLElement {
  constructor() {
    super();
  }

  createElement(tag, props) {
    const element = (typeof tag === 'string')? document.createElement(tag) : tag;
  
    if(props) {
      for (let key in props) {
        if(key === 'children') continue;
        if(key === 'addEventListener') continue;
        if(key === 'innerHTML') continue;
        if(key === 'innerText') continue;
        element.setAttribute(key, props[key]);
      }
  
      if(props.innerHTML) element.innerHTML = props.innerHTML;
      if(props.innerText) element.innerText = props.innerText;
  
      if(props.addEventListener) {
        element.addEventListener(props.addEventListener.name, props.addEventListener.handler);
      }
  
      if(props.children) {
        this.appendChildren(element, props.children);
      }
  
      if(props.style) {
        for (let key in props.style) {
          element.style[key] = props.style[key];
        }
      }
    }
    
    return element;
  }

  appendChildren(parent, children) {
    children.forEach(child => {
      if (child) {
        parent.appendChild(child);
      } 
    });
  }

  append(element) {
    this.appendChild(element);
  }

  navigateTo(url, event) {
    if (event) {
      event.preventDefault();
    }
    window.history.pushState({}, '', url);
    const navEvent = new PopStateEvent('popstate');
    window.dispatchEvent(navEvent);
  }

  showNoActivityMessage(message = '', type = 'info', duration = 2000) {
    const messageElement = this.createElement('div', {
      class: `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`,
      innerText: message
    });

    this.appendChild(messageElement);

    setTimeout(() => {
      this.removeChild(messageElement);
    }, duration);
  }

  render() {
    // to be implemented by subclasses
  }

  clear() {
    this.innerHTML = '';
  }

  refresh() {
    this.clear();
    this.render();
  }
}

export default BaseComponent;