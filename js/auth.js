/**
 * LEVoiceCall Authentication — Facebook + Guest only
 */
(function (global) {
  const STORAGE_KEY = 'levc_user';
  const TOKEN_KEY = 'levc_fb_token';
  const GUEST_PENDING = 'levc_guest_pending';

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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: id,
        facebookId: user.facebookId || id,
        name: user.name || 'User',
        profilePicture: user.profilePicture || '',
        isGuest: isGuest,
        authType: isGuest ? 'guest' : 'facebook',
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

  function fetchMe(accessToken) {
    FB.api('/me', { fields: 'id,name,picture.type(large)' }, function (res) {
      if (!res || res.error) {
        showStatus('Could not load Facebook profile.', true);
        return;
      }
      setUser({
        userId: res.id,
        facebookId: res.id,
        name: res.name || 'Facebook User',
        profilePicture: (res.picture && res.picture.data && res.picture.data.url) || '',
        authType: 'facebook'
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
    // Only on the sign-in page — never on main/history/about/call (prevents infinite reload)
    const path = (location.pathname || '').replace(/\/+$/, '') || '/';
    const onLanding = path === '/' || path.endsWith('index.html');
    if (!onLanding) return;
    if (isAuthenticated() && !needsGuestName()) {
      window.location.replace('/main/main.html');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('fb-login-btn');
    if (btn) btn.addEventListener('click', loginWithFacebook);
    const guestBtn = document.getElementById('guest-login-btn');
    if (guestBtn) guestBtn.addEventListener('click', continueAsGuest);
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
    randomGuestCode
  };
})(window);
