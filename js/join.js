/**
 * System B — Join Call (exact one room by code)
 */
(function () {
  if (!window.LEVCAuth?.isAuthenticated()) return;

  const $ = (id) => document.getElementById(id);
  const modal = $('join-modal');
  const user = window.LEVCAuth.getUser();

  function open() {
    modal?.classList.remove('hidden');
    $('join-code').value = '';
    $('join-error')?.classList.add('hidden');
    $('join-code')?.focus();
  }
  function close() {
    modal?.classList.add('hidden');
  }

  $('btn-join')?.addEventListener('click', open);
  $('join-cancel')?.addEventListener('click', close);
  modal?.querySelector('[data-close="join"]')?.addEventListener('click', close);

  $('join-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('join-submit')?.click();
  });

  $('join-submit')?.addEventListener('click', async () => {
    const code = ($('join-code')?.value || '').trim().toUpperCase();
    const err = $('join-error');
    if (!code) {
      err.textContent = 'Please enter a join code.';
      err.classList.remove('hidden');
      return;
    }

    err.classList.add('hidden');

    try {
      const res = await fetch('/api/rooms?code=' + encodeURIComponent(code));
      if (res.status === 404) {
        err.textContent = 'Call not found or invalid Join Code.';
        err.classList.remove('hidden');
        return;
      }
      if (!res.ok) throw new Error('Lookup failed');
      const room = await res.json();
      if (room.status !== 'active') {
        err.textContent = 'This call has been shut down.';
        err.classList.remove('hidden');
        return;
      }

      try {
        const constraints = room.callType === 'video' ? { audio: true, video: true } : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {
        err.textContent = room.callType === 'video'
          ? 'Camera and microphone access required. Allow permissions and try again.'
          : 'Microphone access required. Allow permission and try again.';
        err.classList.remove('hidden');
        return;
      }

      await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joinCode: code,
          participant: {
            id: user.facebookId,
            name: user.name,
            profilePicture: user.profilePicture,
            isCreator: false,
            joinedAt: new Date().toISOString()
          }
        })
      }).catch(() => {});

      window.location.href = '/main/call.html?call=' + encodeURIComponent(code);
    } catch (e) {
      const localRooms = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
      const room = localRooms[code];
      if (!room || room.status !== 'active') {
        err.textContent = 'Call not found or invalid Join Code.';
        err.classList.remove('hidden');
        return;
      }
      if (!room.participants.find(p => p.id === user.facebookId)) {
        room.participants.push({
          id: user.facebookId,
          name: user.name,
          profilePicture: user.profilePicture,
          isCreator: false,
          joinedAt: new Date().toISOString()
        });
        localRooms[code] = room;
        localStorage.setItem('levc_rooms', JSON.stringify(localRooms));
      }
      window.location.href = '/main/call.html?call=' + encodeURIComponent(code);
    }
  });
})();
