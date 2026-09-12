/**
 * System A — Create Call (Unified Messenger-style)
 * No voice/video split — every room supports both. Camera is optional during the call.
 */
(function () {
  if (!window.LEVCAuth?.isAuthenticated()) return;

  const $ = (id) => document.getElementById(id);
  const modal = $('create-modal');
  const user = window.LEVCAuth.getUser();

  function open() {
    modal?.classList.remove('hidden');
    if ($('call-name')) $('call-name').value = '';
    $('create-error')?.classList.add('hidden');
    // Default privacy ON for stronger security feel
    setToggle($('tog-ss'), true);
    setToggle($('tog-sr'), true);
  }
  function close() {
    modal?.classList.add('hidden');
  }

  function setToggle(btn, on) {
    if (!btn) return;
    btn.dataset.on = on ? 'true' : 'false';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'ON' : 'OFF';
    btn.classList.toggle('on', on);
  }

  $('btn-create')?.addEventListener('click', open);
  $('create-cancel')?.addEventListener('click', close);
  modal?.querySelector('[data-close="create"]')?.addEventListener('click', close);

  $('tog-ss')?.addEventListener('click', function () {
    setToggle(this, this.dataset.on !== 'true');
  });
  $('tog-sr')?.addEventListener('click', function () {
    setToggle(this, this.dataset.on !== 'true');
  });

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function genId() {
    return 'call_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  $('create-submit')?.addEventListener('click', async () => {
    let name = ($('call-name')?.value || '').trim();
    if (!name) name = (user.name || 'User').split(' ')[0] + "'s Call";
    const ss = $('tog-ss')?.dataset.on === 'true';
    const sr = $('tog-sr')?.dataset.on === 'true';

    const err = $('create-error');
    err?.classList.add('hidden');

    // Unified: always request mic + camera capability (user can turn camera off later)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }
      });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      // Fallback: at least require mic
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioOnly.getTracks().forEach(t => t.stop());
      } catch (e2) {
        err.textContent = 'Microphone permission is required. Allow access and try again.';
        err?.classList.remove('hidden');
        return;
      }
    }

    const room = {
      callId: genId(),
      joinCode: genCode(),
      callName: name,
      creatorId: user.facebookId,
      creatorName: user.name,
      creatorProfile: user.profilePicture,
      callType: 'call', // unified — supports both audio + video
      screenshotProtection: ss,
      screenRecordingProtection: sr,
      participants: [{
        id: user.facebookId,
        name: user.name,
        profilePicture: user.profilePicture,
        isCreator: true,
        joinedAt: new Date().toISOString()
      }],
      status: 'active',
      createdAt: new Date().toISOString(),
      closedAt: null
    };

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(room)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create room');
      }
      const created = await res.json();
      sessionStorage.setItem('levc_last_code', created.joinCode || room.joinCode);
      window.location.href = '/main/call.html?call=' + encodeURIComponent(created.joinCode || room.joinCode);
    } catch (e) {
      console.warn('API create failed, using local store', e);
      const localRooms = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
      localRooms[room.joinCode] = room;
      localStorage.setItem('levc_rooms', JSON.stringify(localRooms));
      sessionStorage.setItem('levc_last_code', room.joinCode);
      window.location.href = '/main/call.html?call=' + encodeURIComponent(room.joinCode);
    }
  });
})();
