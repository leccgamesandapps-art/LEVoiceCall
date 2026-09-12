/**
 * LEVoiceCall Auth — Facebook + Guest + LEID (balanced with OfficialLEWeb)
 * Cross-origin: URL handoff ?leid=&name=&fb= or manual LEID entry.
 * OfficialLEWeb key: officialleweb_session = { leid, facebookId?, ... }
 */
(function (global) {
  const STORAGE_KEY = 'levc_user';
  const TOKEN_KEY = 'levc_fb_token';
  const GUEST_PENDING = 'levc_guest_pending';
  const LEID_LINK_KEY = 'levc_leid_link';
  const OFFICIAL_LEWEB = 'https://officialleweb.vercel.app';

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setUser(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(GUEST_PENDING);
      return;
    }
    const isGuest = !!(user.isGuest || user.authType === 'guest');
    const id = user.userId || user.id || user.facebookId || ('guest_' + Date.now());
    const authType = isGuest ? 'guest' : user.authType || (user.leid ? 'leid' : 'facebook');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: id,
        facebookId: user.facebookId || id,
        name: user.name || 'User',
        profilePicture: user.profilePicture || '',
        isGuest: isGuest,
        authType,
        leid: user.leid || null,
        loggedInAt: new Date().toISOString()
      })
    );
    if (isGuest) localStorage.removeItem(GUEST_PENDING);
  }

  function isAuthenticated() {
    const u = getUser();
    return !!(u && (u.userId || u.facebookId));
  }

  function isGuest() {
    const u = getUser();
    return !!(u && (u.isGuest || u.authType === 'guest'));
  }

  function needsGuestName() {
    return localStorage.getItem(GUEST_PENDING) === '1';
  }

  function requireAuth() {
    if (!isAuthenticated()) {
      window.location.replace('/index.html');
      return false;
    }
    return true;
  }

  function logout() {
    setUser(null);
    try {
      if (typeof FB !== 'undefined' && FB.getAuthResponse()) FB.logout(function () {});
    } catch (e) {}
    window.location.replace('/index.html');
  }

  function continueAsGuest() {
    localStorage.setItem(GUEST_PENDING, '1');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/main/main.html';
  }

  function randomGuestCode() {
    let s = '';
    for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function completeGuest(displayName) {
    let name = (displayName || '').trim();
    if (!name) name = 'guest#' + randomGuestCode();
    const id = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    setUser({
      userId: id,
      facebookId: id,
      name,
      profilePicture: '',
      isGuest: true,
      authType: 'guest'
    });
    localStorage.removeItem(GUEST_PENDING);
    return getUser();
  }

  function onFBReady() {}

  function showStatus(msg, isError) {
    const el = document.getElementById('fb-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
  }

  function setLEIDUser(session) {
    const leid = String(session.leid || '').trim();
    if (!leid) return null;
    const name = (session.name || leid).trim();
    const facebookId = session.facebookId || null;
    setUser({
      userId: facebookId || 'leid_' + leid.toLowerCase(),
      facebookId: facebookId || 'leid_' + leid.toLowerCase(),
      name,
      profilePicture: session.picture || '',
      isGuest: false,
      authType: 'leid',
      leid
    });
    try {
      localStorage.setItem(
        LEID_LINK_KEY,
        JSON.stringify({
          leid,
          facebookId,
          linkedAt: new Date().toISOString(),
          site: 'levoicecall',
          from: session.from || 'manual'
        })
      );
      localStorage.setItem(
        'officialleweb_session',
        JSON.stringify({
          leid,
          loggedInAt: Date.now(),
          viaFacebook: !!facebookId,
          facebookId: facebookId || undefined
        })
      );
    } catch (e) {}
    return getUser();
  }

  function consumeLEIDFromURL() {
    const p = new URLSearchParams(location.search);
    const leid = p.get('leid') || p.get('LEID') || p.get('username');
    if (!leid) return null;
    const session = {
      leid: String(leid).trim(),
      name: p.get('name') || String(leid).trim(),
      facebookId: p.get('fb') || p.get('facebookId') || null,
      picture: p.get('picture') || '',
      from: p.get('from') || 'url'
    };
    try {
      const u = new URL(location.href);
      ['leid', 'LEID', 'username', 'name', 'fb', 'facebookId', 'picture', 'from', 'return_to', 'app'].forEach(
        (k) => u.searchParams.delete(k)
      );
      history.replaceState({}, '', u.pathname + (u.search || ''));
    } catch (e) {}
    return session;
  }

  function readLocalLEIDSession() {
    const keys = [
      'officialleweb_session',
      'leid_session',
      'officialleweb_user',
      'leid_user',
      LEID_LINK_KEY
    ];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const o = JSON.parse(raw);
        const leid = o.leid || o.LEID || o.username;
        if (leid) {
          return {
            leid: String(leid),
            name: o.name || o.displayName || String(leid),
            facebookId: o.facebookId || o.fbId || null,
            picture: o.picture || o.profilePicture || '',
            from: 'local'
          };
        }
      } catch (e) {}
    }
    return null;
  }

  function hideLeidModal() {
    document.getElementById('leid-modal')?.classList.add('hidden');
  }

  function showLeidModal() {
    let modal = document.getElementById('leid-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'leid-modal';
      modal.className = 'modal leid-modal';
      modal.innerHTML =
        '<div class="modal-backdrop" data-leid-close></div>' +
        '<div class="modal-card leid-modal-card">' +
        '<h2>Continue with LEID</h2>' +
        '<p class="leid-modal-desc">Use the same LEID as on <strong>OfficialLEWeb</strong> so your account matches across sites.</p>' +
        '<div class="field"><label for="leid-input">LEID / Username</label>' +
        '<input id="leid-input" type="text" maxlength="40" placeholder="Your LEID" autocomplete="username" /></div>' +
        '<div class="field"><label for="leid-display">Display name <span class="optional">(optional)</span></label>' +
        '<input id="leid-display" type="text" maxlength="60" placeholder="Leave empty to use LEID" /></div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-ghost" data-leid-close>Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="leid-submit">Sign in with LEID</button>' +
        '</div>' +
        '<p class="leid-modal-foot"><a href="' +
        OFFICIAL_LEWEB +
        '" target="_blank" rel="noopener">Open OfficialLEWeb</a> to register if you do not have a LEID yet.</p>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-leid-close]').forEach((el) => {
        el.addEventListener('click', hideLeidModal);
      });
      document.getElementById('leid-submit')?.addEventListener('click', () => {
        const leid = (document.getElementById('leid-input')?.value || '').trim();
        if (!leid) {
          showStatus('Enter your LEID.', true);
          return;
        }
        const name = (document.getElementById('leid-display')?.value || '').trim() || leid;
        setLEIDUser({ leid, name, from: 'manual' });
        hideLeidModal();
        showStatus('Signed in as LEID: ' + leid, false);
        setTimeout(() => {
          window.location.replace('/main/main.html');
        }, 350);
      });
      document.getElementById('leid-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('leid-submit')?.click();
      });
    }
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('leid-input')?.focus(), 100);
  }

  function loginWithLEID() {
    let session = consumeLEIDFromURL();
    if (!session) session = readLocalLEIDSession();
    if (session) {
      setLEIDUser(session);
      showStatus('Signed in with LEID: ' + session.leid, false);
      setTimeout(() => {
        window.location.replace('/main/main.html');
      }, 350);
      return;
    }
    showLeidModal();
  }

  function fetchMe(accessToken) {
    FB.api('/me', { fields: 'id,name,picture.type(large)' }, function (res) {
      if (!res || res.error) {
        showStatus('Could not load Facebook profile.', true);
        return;
      }
      const picture = (res.picture && res.picture.data && res.picture.data.url) || '';
      let leid = null;
      try {
        const link = JSON.parse(localStorage.getItem(LEID_LINK_KEY) || 'null');
        if (link && link.facebookId && String(link.facebookId) === String(res.id)) {
          leid = link.leid;
        }
      } catch (e) {}
      setUser({
        userId: res.id,
        facebookId: res.id,
        name: res.name || 'Facebook User',
        profilePicture: picture,
        authType: leid ? 'leid' : 'facebook',
        leid: leid
      });
      if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.removeItem(GUEST_PENDING);
      window.location.replace('/main/main.html');
    });
  }

  function loginWithFacebook() {
    const appId =
      window.LEVC_FB_APP_ID || localStorage.getItem('levc_fb_app_id') || '1065855442874700';
    if (!appId) {
      showStatus('Please configure Facebook App ID.', true);
      return;
    }
    if (typeof FB === 'undefined') {
      showStatus('Facebook SDK still loading. Try again in a moment.', true);
      return;
    }
    const btn = document.getElementById('fb-login-btn');
    const loading = document.getElementById('auth-loading');
    if (btn) btn.disabled = true;
    if (loading) loading.classList.remove('hidden');
    FB.login(
      function (response) {
        if (response.authResponse) {
          fetchMe(response.authResponse.accessToken);
        } else {
          if (btn) btn.disabled = false;
          if (loading) loading.classList.add('hidden');
          showStatus('Facebook login was cancelled or failed.', true);
        }
      },
      { scope: 'public_profile' }
    );
  }

  function redirectIfAuthed() {
    if (isAuthenticated() && !needsGuestName()) {
      window.location.replace('/main/main.html');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const early = consumeLEIDFromURL();
    if (early) {
      setLEIDUser(early);
      window.location.replace('/main/main.html');
      return;
    }
    const btn = document.getElementById('fb-login-btn');
    if (btn) btn.addEventListener('click', loginWithFacebook);
    const guestBtn = document.getElementById('guest-login-btn');
    if (guestBtn) guestBtn.addEventListener('click', continueAsGuest);
    const leidBtn = document.getElementById('leid-login-btn');
    if (leidBtn) leidBtn.addEventListener('click', loginWithLEID);
    redirectIfAuthed();
  });

  global.LEVCAuth = {
    getUser,
    setUser,
    isAuthenticated,
    isGuest,
    needsGuestName,
    requireAuth,
    logout,
    onFBReady,
    loginWithFacebook,
    continueAsGuest,
    completeGuest,
    randomGuestCode,
    loginWithLEID,
    setLEIDUser,
    OFFICIAL_LEWEB
  };
})(window);
