/**
 * LEVoiceCall Authentication (Facebook only)
 */
(function (global) {
  const STORAGE_KEY = 'levc_user';
  const TOKEN_KEY = 'levc_fb_token';
  const DEFAULT_APP_ID = '1065855442874700';

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setUser(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      userId: user.userId || user.id,
      facebookId: user.facebookId || user.id,
      name: user.name,
      profilePicture: user.profilePicture || user.picture?.data?.url || user.picture || '',
      createdAt: user.createdAt || new Date().toISOString()
    }));
  }

  function isAuthenticated() {
    const u = getUser();
    return !!(u && u.facebookId && u.name);
  }

  function requireAuth() {
    if (!isAuthenticated()) {
      window.location.replace('/index.html');
      return false;
    }
    return true;
  }

  function redirectIfAuthed() {
    if (isAuthenticated() && (location.pathname === '/' || location.pathname.endsWith('index.html'))) {
      window.location.replace('/main/main.html');
    }
  }

  function logout() {
    setUser(null);
    if (typeof FB !== 'undefined' && FB.getAccessToken()) {
      try { FB.logout(() => {}); } catch (e) {}
    }
    window.location.replace('/index.html');
  }

  function onFBReady() {
    if (typeof FB === 'undefined') return;
    FB.getLoginStatus((response) => {
      if (response.status === 'connected') {
        fetchMe(response.authResponse.accessToken);
      }
    });
  }

  function fetchMe(accessToken) {
    FB.api('/me', { fields: 'id,name,picture.type(large)' }, (res) => {
      if (!res || res.error) {
        console.error('FB /me error', res?.error);
        showStatus('Could not load Facebook profile.', true);
        return;
      }
      const user = {
        userId: res.id,
        facebookId: res.id,
        name: res.name,
        profilePicture: res.picture?.data?.url || '',
        createdAt: new Date().toISOString()
      };
      setUser(user);
      if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
      window.location.replace('/main/main.html');
    });
  }

  function loginWithFacebook() {
    const appId = window.LEVC_FB_APP_ID || localStorage.getItem('levc_fb_app_id') || DEFAULT_APP_ID;
    if (!appId || appId === '0') {
      showStatus('Facebook App ID is not configured.', true);
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

    FB.login((response) => {
      if (response.authResponse) {
        fetchMe(response.authResponse.accessToken);
      } else {
        if (btn) btn.disabled = false;
        if (loading) loading.classList.add('hidden');
        showStatus('Facebook login was cancelled or failed.', true);
      }
    }, { scope: 'public_profile' });
  }

  function showStatus(msg, isError) {
    const el = document.getElementById('fb-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('fb-login-btn');
    if (btn) btn.addEventListener('click', loginWithFacebook);
    redirectIfAuthed();
  });

  global.LEVCAuth = {
    getUser,
    setUser,
    isAuthenticated,
    requireAuth,
    logout,
    onFBReady,
    loginWithFacebook
  };
})(window);
