/**
 * LEVoiceCall — Call history (created + joined)
 */
(function (global) {
  const KEY = 'levc_call_history';
  const MAX = 50;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch (e) {}
  }

  function add(entry) {
    if (!entry || !entry.joinCode) return;
    const list = load().filter(
      (x) => !(x.joinCode === entry.joinCode && x.role === entry.role)
    );
    list.unshift({
      joinCode: String(entry.joinCode).toUpperCase(),
      callName: entry.callName || 'Call',
      role: entry.role === 'created' ? 'created' : 'joined',
      creatorName: entry.creatorName || '',
      at: entry.at || new Date().toISOString(),
      status: entry.status || 'active'
    });
    save(list);
  }

  function markClosed(joinCode) {
    const code = String(joinCode || '').toUpperCase();
    const list = load().map((x) => {
      if (x.joinCode === code) return { ...x, status: 'closed' };
      return x;
    });
    save(list);
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function getAll() {
    return load();
  }

  global.LEVCHistory = { add, getAll, clear, markClosed, load };
})(window);
