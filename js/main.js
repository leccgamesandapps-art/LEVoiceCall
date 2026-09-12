/**
 * Main page logic: nav, profile, menu, permission status, guest name
 */
(function () {
  if (!window.LEVCAuth || !window.LEVCAuth.requireAuth()) return;

  function $(id) { return document.getElementById(id); }

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
    const input = $('guest-name-input');
    const btn = $('guest-name-continue');
    input?.focus();

    function finish() {
      const name = (input?.value || '').trim();
      window.LEVCAuth.completeGuest(name);
      user = window.LEVCAuth.getUser();
      modal.classList.add('hidden');
      fillProfile();
    }

    btn?.addEventListener('click', finish);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
    });
  }

  function fillProfile() {
    user = window.LEVCAuth.getUser();
    if (!user) return;
    const avatars = document.querySelectorAll('#nav-avatar, #panel-avatar');
    avatars.forEach(img => {
      if (img) {
        img.src = user.profilePicture || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=5b6af0&color=fff');
        img.alt = user.name;
      }
    });
    const names = document.querySelectorAll('#nav-name, #panel-name');
    names.forEach(el => { if (el) el.textContent = user.name; });
  }

  if (window.LEVCAuth.needsGuestName()) {
    showGuestNameModal();
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

  async function queryPerm(name) {
    try {
      if (!navigator.permissions?.query) return 'Unavailable';
      const r = await navigator.permissions.query({ name });
      const map = { granted: 'Allowed', denied: 'Denied', prompt: 'Prompt' };
      return map[r.state] || r.state;
    } catch {
      return 'Unavailable';
    }
  }

  async function updatePermStatus() {
    if ($('perm-mic')) $('perm-mic').textContent = await queryPerm('microphone');
    if ($('perm-cam')) $('perm-cam').textContent = await queryPerm('camera');
    if ($('perm-notif')) {
      if (!('Notification' in window)) $('perm-notif').textContent = 'Unavailable';
      else {
        const s = Notification.permission;
        $('perm-notif').textContent = s === 'granted' ? 'Allowed' : s === 'denied' ? 'Denied' : 'Prompt';
      }
    }
  }

  $('test-mic')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      alert('Microphone works.');
      updatePermStatus();
    } catch (e) {
      alert('Microphone: ' + (e.message || e.name));
    }
  });
  $('test-cam')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      alert('Camera works.');
      updatePermStatus();
    } catch (e) {
      alert('Camera: ' + (e.message || e.name));
    }
  });
  $('enable-notif')?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      alert('Notifications not supported.');
      return;
    }
    const p = await Notification.requestPermission();
    alert('Notifications: ' + p);
    updatePermStatus();
  });
})();
