import BaseComponent from '../base-component.js';
import ConversationContainer from '../school/school-container.js';
import ModalComponent from '../modal-component.js';

/*
// Example user object
{
  "id": 1,
  "username": "dave",
  "first_name": "Dave",
  "last_name": ".",
  "email": "dpirek@gmail.com",
  "pristup": "public",
  "sex": "m",
  "regip": "69.142.155.166",
  "profile_image": "user-petkaa.JPG",
  "status_message": "dave",
  "birth_date": "3/5/1978 12:00:00 AM",
  "stav": "ženatý",
  "nabozenstvi": "protestant",
  "mesto": "Novy Jicin",
  "zemne": "Ceska",
  "aktivity": "spim",
  "zajmy": "kolo, voda",
  "oblibena_hudba": "worship, bluegrass",
  "oblibeny_tv_porad": "cestomanie",
  "oblibene_filmy": "horem padem",
  "oblibene_knihy": "bible",
  "oblibene_hlasky": "bohusu koza sa ti objesila",
  "dale_o_mne": "to je vse",
  "kde_pracuji": "Doma v kanclu",
  "pracovni_titul": "programator",
  "pracovni_popis": "zaměstnání snů"
  "verification_code": 633,
  "verification_count": 1,
  "verification_phone": 420739038408,
  "verification_status": "verified",
  "valid_image": "yes"
}
*/

class UserDetail extends BaseComponent {
  userDetails = {};
  conversations = [];

  constructor(user) {
    super();
    this.user = user;
    this.render();
  }

  close() {
    this.remove();
    document.body.classList.remove('modal-open');
    const modalBackdrop = document.querySelector('.modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.remove();
    }
  }

  save(validImage) {
    fetch('/api/user/update-valid-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.user.username,
        status: validImage,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          this.showAlert('User updated successfully');
          this.close();
        } else {
          this.showAlert('Error updating user: ' + data.error);
        }
      })
      .catch((error) => console.error('Error updating user:', error));
  }

  showAlert(message) {
    alert(message);
  }

  imageStatusSelector(currentStatus) {
    const statuses = ['yes', 'no', 'unknown'];

    const options = statuses.map((status) => {
      const props = { value: status, innerText: status.charAt(0).toUpperCase() + status.slice(1) };

      if (status === currentStatus) {
        props.selected = 'selected';
      }

      return this.createElement('option', props);
    });

    this.selectElement = this.createElement('select', {
      id: 'validImage',
      class: 'form-select',
      style: { maxWidth: '100px' },
      children: [...options],
    });

    return this.createElement('div', {
      //class: 'mb-3 mt-3',
      children: [
        // this.createElement('label', {
        //   for: 'validImage',
        //   class: 'form-label',
        //   innerHTML: '<strong>Valid Image Status:</strong>'
        // }),
        this.selectElement,
      ],
    });
  }

  getSelectedValue() {
    return this.selectElement.value;
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

  userInfoDetails() {
    return `
      <p><strong>Full Name:</strong> ${this.userDetails.first_name} ${this.userDetails.last_name ? this.userDetails.last_name : ''}</p>
      <p><strong>Age:</strong> ${this.getAge(this.userDetails.birth_date) || 'N/A'}</p>
      <p><strong>Email:</strong> ${this.userDetails.email}</p>
      ${this.userDetails.dale_o_mne ? '<p><strong>More About Me:</strong> ' + this.userDetails.dale_o_mne + '</p>' : ''}
      ${this.userDetails.about_me ? '<p><strong>About Me:</strong> ' + this.userDetails.about_me + '</p>' : ''}
      ${this.userDetails.hledam ? '<p><strong>Looking For:</strong> ' + this.userDetails.hledam + '</p>' : ''}
      ${this.userDetails.job ? '<p><strong>Job:</strong> ' + this.userDetails.job + '</p>' : ''}
      ${this.userDetails.kde_pracuji ? '<p><strong>Where I Work:</strong> ' + this.userDetails.kde_pracuji + '</p>' : ''}
      ${this.userDetails.pracovni_titul ? '<p><strong>Job Title:</strong> ' + this.userDetails.pracovni_titul + '</p>' : ''}
      ${this.userDetails.pracovni_popis ? '<p><strong>Job Description:</strong> ' + this.userDetails.pracovni_popis + '</p>' : ''}
      ${this.userDetails.mesto ? '<p><strong>City:</strong> ' + this.userDetails.mesto + '</p>' : ''}
      ${this.userDetails.zemne ? '<p><strong>Country:</strong> ' + this.userDetails.zemne + '</p>' : ''}
      ${this.userDetails.stav ? '<p><strong>Marital Status:</strong> ' + this.userDetails.stav + '</p>' : ''}
      ${this.userDetails.nabozenstvi ? '<p><strong>Religion:</strong> ' + this.userDetails.nabozenstvi + '</p>' : ''}
      ${this.userDetails.oblibena_hudba ? '<p><strong>Favorite Music:</strong> ' + this.userDetails.oblibena_hudba + '</p>' : ''}
      ${this.userDetails.oblibeny_tv_porad ? '<p><strong>Favorite TV Shows:</strong> ' + this.userDetails.oblibeny_tv_porad + '</p>' : ''}
      ${this.userDetails.oblibene_filmy ? '<p><strong>Favorite Movies:</strong> ' + this.userDetails.oblibene_filmy + '</p>' : ''}
      ${this.userDetails.oblibene_knihy ? '<p><strong>Favorite Books:</strong> ' + this.userDetails.oblibene_knihy + '</p>' : ''}
      ${this.userDetails.oblibene_hlasky ? '<p><strong>Favorite Quotes:</strong> ' + this.userDetails.oblibene_hlasky + '</p>' : ''}
      ${this.userDetails.icq ? '<p><strong>ICQ:</strong> ' + this.userDetails.icq + '</p>' : ''}
      ${this.userDetails.mobil_cislo ? '<p><strong>Mobile Number:</strong> ' + this.userDetails.mobil_cislo + '</p>' : ''}
      ${this.userDetails.regip ? '<p><strong>Registered IP:</strong> ' + this.userDetails.regip + '</p>' : ''}
      ${this.userDetails.ip_location ? '<p><strong>IP Location:</strong> ' + this.userDetails.ip_location.city + ', ' + this.userDetails.ip_location.country + '</p>' : ''}
      ${this.userDetails.status_message ? '<p><strong>Status Message:</strong> ' + this.userDetails.status_message + '</p>' : ''}
    `;
  }

  render() {
    const detailContainer = this.createElement('div', {
      //innerText: 'Loading...',
      class: 'mt-3',
    });

    const conversationContainer = this.createElement('div', {});

    this.appendChild(
      new ModalComponent({
        title: `User Detail: ${this.user.username}`,
        body: this.createElement('div', {
          //class: 'modal-body',
          children: [
            this.createElement('div', {
              class: 'row mb-3',
              children: [
                this.createElement('div', {
                  class: 'col',
                  children: [
                    this.createElement('img', {
                      src: `/img/p/user-${this.user.username}.jpg`,
                      alt: `${this.user.username}'s profile image`,
                      style: {
                        //maxWidth: '300px',
                        //maxHeight: '300px',
                        //objectFit: 'cover',
                        //borderRadius: '50%'
                      },
                    }),
                    this.createElement('div', {
                      class: 'mt-3 row',
                      children: [
                        this.createElement('div', {
                          class: 'col',
                          children: [this.imageStatusSelector(this.user.valid_image)],
                        }),
                        this.createElement('div', {
                          // align right
                          class: 'col text-end',
                          children: [
                            this.createElement('button', {
                              class: 'btn btn-primary',
                              innerText: 'Save',
                              addEventListener: {
                                name: 'click',
                                handler: () => {
                                  const selectedStatus = this.getSelectedValue();
                                  this.save(selectedStatus);
                                },
                              },
                            }),
                            this.createElement('button', {
                              class: 'btn btn-danger',
                              style: { marginLeft: '10px' },
                              innerText: 'delete',
                              addEventListener: {
                                name: 'click',
                                handler: () => {
                                  if (confirm(`Are you sure you want to delete user ${this.user.username}?`)) {
                                    console.log('Deleting user', this.user.username);
                                    fetch('/api/user-kill', {
                                      method: 'DELETE',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ username: this.user.username }),
                                    })
                                      .then((response) => response.json())
                                      .then((data) => {
                                        if (data.success) {
                                          console.log(`${this.user.username} deleted successfully`);
                                        } else {
                                          console.error('Error deleting user:', data.error);
                                        }
                                      })
                                      .catch((error) => {
                                        console.error('Error updating user:', error);
                                      });
                                  }
                                },
                              },
                            }),
                          ],
                        }),
                        //this.imageStatusSelector(this.user.valid_image),
                      ],
                    }),
                  ],
                }),
                this.createElement('div', {
                  class: 'col',
                  children: [detailContainer],
                }),
              ],
            }),
            conversationContainer,
          ],
        }),
        footer: this.createElement('div', {
          class: 'd-flex justify-content-end',
          children: [],
        }),
      }),
    );

    document.body.appendChild(this);

    // fetch user details
    fetch(`/api/users/detail/${this.user.username}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.user) {
          this.userDetails = data.user;
          detailContainer.appendChild(
            this.createElement('div', {
              innerHTML: this.userInfoDetails(),
            }),
          );
          //this.render(); // Re-render with updated user data
        }
      })
      .catch((error) => console.error('Error fetching user detail:', error));

    // fetch conversations for this user
    const username = this.user.username;
    fetch(`/api/messages/conversations/${username}`)
      .then((response) => response.json())
      .then((res) => {
        this.conversations = res.conversations || [];
        if (this.conversations.length > 0) {
          const container = new ConversationContainer({ conversations: this.conversations, user: username });
          conversationContainer.appendChild(this.createElement('h3', { innerText: 'Conversations' }));
          conversationContainer.appendChild(container);
        }
      })
      .catch((error) => console.error('Error fetching conversations:', error));
  }
}

const register = () => customElements.define('user-detail', UserDetail);
window.WebComponents ? window.WebComponents.waitFor(register) : register();

export default UserDetail;
