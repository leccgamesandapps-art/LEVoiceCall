/**
 * Main page logic: nav, profile, menu, permission status
 */
(function () {
  if (!window.LEVCAuth || !window.LEVCAuth.requireAuth()) return;

  const user = window.LEVCAuth.getUser();

  function $(id) { return document.getElementById(id); }

  function fillProfile() {
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
  fillProfile();

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
      return r.state === 'granted' ? 'Granted' : r.state === 'denied' ? 'Denied' : 'Prompt';
    } catch {
      return 'Unavailable';
    }
  }

  async function updatePermStatus() {
    const mic = await queryPerm('microphone');
    const cam = await queryPerm('camera');
    let notif = 'Unavailable';
    if ('Notification' in window) {
      notif = Notification.permission === 'granted' ? 'Granted' :
              Notification.permission === 'denied' ? 'Denied' : 'Prompt';
    }
    if ($('perm-mic')) $('perm-mic').textContent = mic;
    if ($('perm-cam')) $('perm-cam').textContent = cam;
    if ($('perm-notif')) $('perm-notif').textContent = notif;
  }

  $('test-mic')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      toast('Microphone works');
      updatePermStatus();
    } catch (e) {
      toast('Microphone: ' + (e.name || e.message), true);
    }
  });

  $('test-cam')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      toast('Camera works');
      updatePermStatus();
    } catch (e) {
      toast('Camera: ' + (e.name || e.message), true);
    }
  });

  $('enable-notif')?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Notifications not supported', true);
      return;
    }
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notifications enabled' : 'Notifications not granted');
    updatePermStatus();
  });

  function toast(msg, isError) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden', 'error');
    if (isError) t.classList.add('error');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  window.LEVCMain = { toast, updatePermStatus };
})();
