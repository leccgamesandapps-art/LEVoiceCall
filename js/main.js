/**
 * LEVoiceCall main shell — menu, profile, guest name, permissions
 */
(function () {
  if (!window.LEVCAuth) return;

  const $ = (id) => document.getElementById(id);
  let user = window.LEVCAuth.getUser();

  function showGuestNameModal() {
    const modal = $('guest-name-modal');
    if (!modal) {
      window.LEVCAuth.completeGuest('');
      user = window.LEVCAuth.getUser();
      fillProfile();
      return;
    }
    modal.classList.remove('hidden');
    $('guest-name-continue')?.addEventListener(
      'click',
      () => {
        const name = ($('guest-name-input')?.value || '').trim();
        window.LEVCAuth.completeGuest(name);
        user = window.LEVCAuth.getUser();
        modal.classList.add('hidden');
        fillProfile();
      },
      { once: true }
    );
  }

  function fillProfile() {
    user = window.LEVCAuth.getUser();
    if (!user) return;
    const avatars = document.querySelectorAll('#nav-avatar, #panel-avatar');
    avatars.forEach((img) => {
      if (img) {
        img.src =
          user.profilePicture ||
          'https://ui-avatars.com/api/?name=' +
            encodeURIComponent(user.name || 'User') +
            '&background=5b6af0&color=fff';
        img.alt = user.name || 'User';
      }
    });
    const names = document.querySelectorAll('#nav-name, #panel-name');
    names.forEach((el) => {
      if (el) el.textContent = user.name || 'User';
    });
    const statusEl = document.getElementById('panel-status');
    if (statusEl) {
      if (user.isGuest || user.authType === 'guest') statusEl.textContent = 'Guest';
      else statusEl.textContent = 'Facebook';
    }
  }

  if (window.LEVCAuth.needsGuestName()) {
    showGuestNameModal();
  } else if (!window.LEVCAuth.isAuthenticated()) {
    window.location.replace('/index.html');
    return;
  } else {
    fillProfile();
  }

  const menu = $('side-menu');
  const overlay = $('menu-overlay');
  function openMenu() {
    menu?.classList.add('open');
    menu?.setAttribute('aria-hidden', 'false');
    overlay?.classList.remove('hidden');
  }
  function closeMenu() {
    menu?.classList.remove('open');
    menu?.setAttribute('aria-hidden', 'true');
    overlay?.classList.add('hidden');
  }
  $('menu-btn')?.addEventListener('click', openMenu);
  $('close-menu')?.addEventListener('click', closeMenu);
  overlay?.addEventListener('click', closeMenu);

  function doLogout() {
    window.LEVCAuth.logout();
  }
  $('menu-logout')?.addEventListener('click', doLogout);
  $('panel-logout')?.addEventListener('click', doLogout);

  const panel = $('profile-panel');
  $('profile-btn')?.addEventListener('click', () => {
    panel?.classList.toggle('hidden');
    updatePermStatus();
  });
  $('close-profile')?.addEventListener('click', () => panel?.classList.add('hidden'));

  async function updatePermStatus() {
    const set = (id, text) => {
      const el = $(id);
      if (el) el.textContent = text;
    };
    try {
      if (navigator.permissions) {
        const mic = await navigator.permissions.query({ name: 'microphone' });
        set('perm-mic', mic.state);
        try {
          const cam = await navigator.permissions.query({ name: 'camera' });
          set('perm-cam', cam.state);
        } catch (e) {
          set('perm-cam', '—');
        }
        try {
          const n = await navigator.permissions.query({ name: 'notifications' });
          set('perm-notif', n.state);
        } catch (e) {
          set('perm-notif', (typeof Notification !== 'undefined' && Notification.permission) || '—');
        }
      }
    } catch (e) {}
  }

  $('test-mic')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      alert('Microphone OK');
      updatePermStatus();
    } catch (e) {
      alert('Microphone: ' + (e.message || e.name));
    }
  });
  $('test-cam')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      alert('Camera OK');
      updatePermStatus();
    } catch (e) {
      alert('Camera: ' + (e.message || e.name));
    }
  });
  $('enable-notif')?.addEventListener('click', async () => {
    try {
      const p = await Notification.requestPermission();
      alert('Notifications: ' + p);
      updatePermStatus();
    } catch (e) {
      alert('Notifications not available');
    }
  });
})();
