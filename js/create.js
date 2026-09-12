/**
 * Create unified Messenger-style call (voice + video in one room)
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
    if (!name) name = (user.name || 'Guest').split(' ')[0] + "'s Call";
    const ss = $('tog-ss')?.dataset.on === 'true';
    const sr = $('tog-sr')?.dataset.on === 'true';

    const err = $('create-error');
    err?.classList.add('hidden');

    let hasVideo = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' }
      });
      hasVideo = stream.getVideoTracks().length > 0;
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioOnly.getTracks().forEach((t) => t.stop());
        hasVideo = false;
      } catch (e2) {
        if (err) {
          err.textContent =
            'Microphone permission is required. Allow access in the browser and try again.';
          err.classList.remove('hidden');
        }
        return;
      }
    }

    const joinCode = genCode();
    const room = {
      callId: genId(),
      joinCode,
      callName: name,
      callType: 'unified',
      preferVideo: hasVideo,
      creatorId: user.facebookId || user.userId,
      creatorName: user.name,
      creatorPicture: user.profilePicture || '',
      status: 'active',
      screenshotProtection: ss,
      screenRecordingProtection: sr,
      participants: [
        {
          id: user.facebookId || user.userId,
          name: user.name,
          profilePicture: user.profilePicture || '',
          isCreator: true,
          joinedAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString()
    };

    try {
      const local = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
      local[joinCode] = room;
      localStorage.setItem('levc_rooms', JSON.stringify(local));
    } catch (e) {}

    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(room)
      });
    } catch (e) {}

    close();
    window.location.href = '/main/call.html?call=' + encodeURIComponent(joinCode);
  });
})();
