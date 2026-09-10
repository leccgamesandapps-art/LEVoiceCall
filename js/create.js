/**
 * System A — Create Call
 */
(function () {
  if (!window.LEVCAuth?.isAuthenticated()) return;

  const $ = (id) => document.getElementById(id);
  const modal = $('create-modal');
  const user = window.LEVCAuth.getUser();

  function open() {
    modal?.classList.remove('hidden');
    $('call-name').value = '';
    $('create-error')?.classList.add('hidden');
    document.querySelector('input[name="callType"][value="voice"]').checked = true;
    setToggle($('tog-ss'), false);
    setToggle($('tog-sr'), false);
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
    const type = document.querySelector('input[name="callType"]:checked')?.value || 'voice';
    let name = ($('call-name')?.value || '').trim();
    if (!name) name = user.name.split(' ')[0] + "'s Call";
    const ss = $('tog-ss')?.dataset.on === 'true';
    const sr = $('tog-sr')?.dataset.on === 'true';

    const err = $('create-error');
    err?.classList.add('hidden');

    try {
      const constraints = type === 'video' ? { audio: true, video: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      err.textContent = type === 'video'
        ? 'Camera and/or microphone permission is required for video calls. Allow access and try again.'
        : 'Microphone permission is required for voice calls. Allow access and try again.';
      err?.classList.remove('hidden');
      return;
    }

    const room = {
      callId: genId(),
      joinCode: genCode(),
      callName: name,
      creatorId: user.facebookId,
      creatorName: user.name,
      creatorProfile: user.profilePicture,
      callType: type,
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
