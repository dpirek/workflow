import BaseComponent from '../base-component.js';

/*
Example response item:
{
  "id": 1,
  "username": "dave",
  "email": "dave@gmail.com",
  "date": "11/4/2007 4:20:25 AM",
}
*/

class UserTable extends BaseComponent {
  users = [];

  constructor({ users }) {
    super();
    this.users = users;
  }

  getAge(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  deleteUserButton(user) {
    return this.createElement('button', {
      class: 'btn btn-sm btn-danger',
      innerHTML: '<i class="bi bi-trash"></i>',
      addEventListener: {
        name: 'click',
        handler: () => {
          fetch(`/api/user/${user.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username }),
          })
            .then((response) => response.json())
            .then((data) => {
              // if (data.success) {
              //   console.log(`${user.username} deleted successfully`);
              //   this.users = this.users.filter(u => u.id !== user.id);
              //   this.refresh();
              // } else {
              //   console.error('Error deleting user:', data.error);
              // }
            })
            .catch((error) => {
              console.error('Error updating user:', error);
            });
        },
      },
    });
  }

  connectedCallback() {
    this.render(this.users);
  }

  render() {
    this.innerHTML = '';
    const userTable = this.createElement('table', {
      class: 'table',
      children: [
        this.createElement('thead', {
          children: [
            this.createElement('tr', {
              children: [
                this.createElement('th', { innerText: 'Username' }),
                this.createElement('th', { innerText: 'Email' }),
                this.createElement('th', { class: 'd-none d-md-table-cell', innerText: 'Date Created' }),
                this.createElement('th', { innerText: '' }),
              ],
            }),
          ],
        }),
        this.createElement('tbody', {
          children: this.users.map((user) =>
            this.createElement('tr', {
              class: `user-sex-${user.sex}`,
              style: {
                //backgroundColor: this.getRowColor(user)
              },
              children: [
                this.createElement('td', { innerText: user.username }),
                this.createElement('td', { innerText: user.email }),
                this.createElement('td', { class: 'd-none d-md-table-cell', innerText: user.date }),
                this.createElement('td', {
                  children: [this.deleteUserButton(user)].filter((el) => el !== null),
                }),
              ],
            }),
          ),
        }),
      ],
    });

    this.appendChild(userTable);
  }
}

const register = () => customElements.define('user-table', UserTable);
window.WebComponents ? window.WebComponents.waitFor(register) : register();

export default UserTable;
