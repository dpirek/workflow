import BaseComponent from '../base-component.js';
import Header from './user-header.js';
import UserTable from './user-table.js';

class UserContainer extends BaseComponent {
  userTable = null;
  constructor({ users, type }) {
    super();
    this.users = users;
    this.type = type;
  }

  navigateTo(path, event) {
    if (event) event.preventDefault();
    history.pushState({}, '', path);
    this.userTable.render([]);
  }

  connectedCallback() {
    this.appendChild(
      this.createElement('div', {
        class: 'container-fluid px-3 py-2',
        children: [new Header({ users: this.users, type: this.type }), new UserTable({ users: this.users })],
      }),
    );
  }
}

const register = () => customElements.define('user-container', UserContainer);
window.WebComponents ? window.WebComponents.waitFor(register) : register();

export default UserContainer;
