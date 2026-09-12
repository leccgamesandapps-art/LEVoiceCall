/**
 * LEVoiceCall — Call room (WebRTC + adaptive quality + protection)
 */
(function () {
  if (!window.LEVCAuth?.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const user = window.LEVCAuth.getUser();
  const params = new URLSearchParams(location.search);
  const joinCode = (params.get('call') || '').toUpperCase().trim();

  let room = null;
  let localStream = null;
  let peers = {};
  let isLeaving = false;
  let pollTimer = null;
  let micEnabled = true;
  let camEnabled = true;
  let audioOutEnabled = true;
  let qualityLevel = window.LEVCNetworkQuality?.initFromNetwork?.() || 'medium';

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  function paintCode(code) {
    const c = (code || '—').toUpperCase();
    if ($('display-code')) $('display-code').textContent = c;
    if ($('hint-code')) $('hint-code').textContent = c;
    if ($('loading-code-hint')) {
      $('loading-code-hint').textContent = c !== '—' ? ('Code: ' + c) : '';
    }
  }
  paintCode(joinCode || '—');

  if (!joinCode) {
    showError('Missing call code', 'Open a call from Create or Join with a valid code.');
    return;
  }

  function showShell() {
    $('call-loading')?.classList.add('hidden');
    $('call-error')?.classList.add('hidden');
    $('call-shell')?.classList.add('visible');
    document.body.classList.add('in-call');
  }

  function showError(title, msg) {
    $('call-loading')?.classList.add('hidden');
    $('call-shell')?.classList.remove('visible');
    $('call-error')?.classList.remove('hidden');
    if ($('error-title')) $('error-title').textContent = title;
    if ($('error-msg')) $('error-msg').textContent = msg;
  }

  function showShutdown() {
    $('call-shell')?.classList.remove('visible');
    $('call-loading')?.classList.add('hidden');
    $('call-shutdown')?.classList.remove('hidden');
    cleanupMedia();
  }

  async function loadRoom() {
    try {
      const res = await fetch('/api/rooms?code=' + encodeURIComponent(joinCode));
      if (res.ok) return await res.json();
    } catch (e) {}
    const local = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
    return local[joinCode] || null;
  }

  async function init() {
    room = await loadRoom();
    if (!room) {
      showError('Call not found', 'Invalid or expired join code: ' + joinCode);
      return;
    }
    if (room.status !== 'active') {
      showShutdown();
      return;
    }

    paintCode(room.joinCode || joinCode);

    if (!room.participants.find(p => p.id === user.facebookId)) {
      room.participants.push({
        id: user.facebookId,
        name: user.name,
        profilePicture: user.profilePicture,
        isCreator: room.creatorId === user.facebookId,
        joinedAt: new Date().toISOString()
      });
      await saveRoom();
    }

    setupUI();
    showShell();

    try {
      qualityLevel = window.LEVCNetworkQuality?.initFromNetwork?.() || qualityLevel || 'medium';
      const constraints = window.LEVCNetworkQuality
        ? window.LEVCNetworkQuality.getConstraints(room.callType, qualityLevel)
        : (room.callType === 'video'
          ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } }
          : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      startLocalPreview();
      updateQualityBadge();
    } catch (e) {
      $('perm-modal')?.classList.remove('hidden');
      if ($('perm-title')) {
        $('perm-title').textContent = e.name === 'NotAllowedError' ? 'Permission Denied' : 'Unable to access device';
      }
      if ($('perm-msg')) $('perm-msg').textContent = humanMediaError(e);
      $('perm-retry')?.addEventListener('click', () => location.reload());
    }

    const protectOpts = {
      userLabel: (user.name || 'Guest') + ' · ' + (room.joinCode || joinCode),
      selectors: ['.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap']
    };
    if (window.IPCallProtection) {
      window.IPCallProtection.start({
        screenshotProtection: room.screenshotProtection,
        screenRecordingProtection: room.screenRecordingProtection
      }, protectOpts);
    } else {
      window.LEVCProtection?.start({
        screenshotProtection: room.screenshotProtection,
        screenRecordingProtection: room.screenRecordingProtection
      }, protectOpts);
    }

    if (window.LEVCNetworkQuality) {
      window.LEVCNetworkQuality.startMonitor(peers, (level, info) => {
        qualityLevel = level;
        updateQualityBadge(info);
        window.LEVCNetworkQuality.applyToAllPeers(peers, level);
      });
    }

    pollTimer = setInterval(syncRoom, 2500);
    room.participants.forEach(p => {
      if (p.id !== user.facebookId) ensurePeer(p.id, true);
    });
    setInterval(pollSignals, 1500);
  }

  function humanMediaError(e) {
    const name = e.name || '';
    if (name === 'NotAllowedError') return 'Allow microphone/camera in browser settings for LEVoiceCall, then try again.';
    if (name === 'NotFoundError') return 'No camera or microphone found on this device.';
    if (name === 'NotReadableError') return 'Device is already in use by another app.';
    if (name === 'SecurityError') return 'Media needs HTTPS (secure connection).';
    return e.message || 'Check device permissions and try again.';
  }

  function setupUI() {
    paintCode(room.joinCode || joinCode);
    if ($('call-name')) $('call-name').textContent = room.callName || 'Call';
    if ($('call-type-badge')) {
      $('call-type-badge').textContent = room.callType === 'video' ? 'Video' : 'Voice';
    }
    if ($('call-creator')) $('call-creator').textContent = 'Creator: ' + (room.creatorName || '—');
    if (room.callType === 'video') $('btn-cam')?.classList.remove('hidden');
    else $('btn-cam')?.classList.add('hidden');
    renderParticipants();
  }

  function renderParticipants() {
    const list = $('participants-list');
    if (!list || !room) return;
    list.innerHTML = '';
    (room.participants || []).forEach(p => {
      const li = document.createElement('li');
      const you = p.id === user.facebookId ? ' (you)' : '';
      const cr = p.isCreator ? ' · creator' : '';
      li.innerHTML =
        '<img src="' + (p.profilePicture || '') + '" alt="" class="avatar-xs" onerror="this.style.display=\'none\'"/>' +
        '<span>' + escapeHtml(p.name || 'User') + you + cr + '</span>';
      list.appendChild(li);
    });
    if ($('part-count')) $('part-count').textContent = '(' + (room.participants || []).length + ')';
    $('no-participants')?.classList.toggle('hidden', (room.participants || []).length > 1);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function startLocalPreview() {
    const v = $('local-video');
    if (v && localStream) {
      v.srcObject = localStream;
      if (room.callType !== 'video') {
        v.style.display = 'none';
        $('local-wrap')?.classList.add('audio-only');
      }
    }
    if ($('local-label')) $('local-label').textContent = (user.name || 'You') + ' (you)';
  }

  async function saveRoom() {
    const local = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
    local[joinCode] = room;
    localStorage.setItem('levc_rooms', JSON.stringify(local));
    try {
      await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(room)
      });
    } catch (e) {}
  }

  async function syncRoom() {
    const fresh = await loadRoom();
    if (!fresh) return;
    room = fresh;
    if (room.status !== 'active') {
      showShutdown();
      clearInterval(pollTimer);
      return;
    }
    paintCode(room.joinCode || joinCode);
    renderParticipants();
    room.participants.forEach(p => {
      if (p.id !== user.facebookId && !peers[p.id]) ensurePeer(p.id, true);
    });
    Object.keys(peers).forEach(pid => {
      if (!room.participants.find(p => p.id === pid)) {
        peers[pid]?.close();
        delete peers[pid];
        document.getElementById('remote-' + pid)?.remove();
      }
    });
  }

  function ensurePeer(peerId, initiator) {
    if (peers[peerId]) return peers[peerId];
    const pc = new RTCPeerConnection({ iceServers });
    peers[peerId] = pc;
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (ev) => {
      let el = document.getElementById('remote-' + peerId);
      if (!el) {
        el = document.createElement('div');
        el.id = 'remote-' + peerId;
        el.className = 'video-tile remote';
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        el.appendChild(video);
        const label = document.createElement('div');
        label.className = 'tile-label';
        const p = room.participants.find(x => x.id === peerId);
        label.textContent = p?.name || 'Participant';
        el.appendChild(label);
        $('remote-container')?.appendChild(el);
        $('no-participants')?.classList.add('hidden');
      }
      const video = el.querySelector('video');
      if (video && ev.streams[0]) video.srcObject = ev.streams[0];
    };

    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        await postSignal({ type: 'ice', from: user.facebookId, to: peerId, candidate: ev.candidate });
      }
    };

    window.LEVCNetworkQuality?.applySenderParams?.(pc, qualityLevel);

    if (initiator) {
      pc.createOffer()
        .then(o => pc.setLocalDescription(o))
        .then(() => postSignal({ type: 'offer', from: user.facebookId, to: peerId, sdp: pc.localDescription }))
        .catch(console.error);
    }
    return pc;
  }

  async function postSignal(msg) {
    try {
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode, ...msg })
      });
    } catch (e) {
      const key = 'levc_sig_' + joinCode;
      const q = JSON.parse(localStorage.getItem(key) || '[]');
      q.push({ ...msg, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(q.slice(-40)));
    }
  }

  async function pollSignals() {
    try {
      const res = await fetch(
        '/api/signal?code=' + encodeURIComponent(joinCode) +
        '&user=' + encodeURIComponent(user.facebookId)
      );
      if (res.ok) {
        const msgs = await res.json();
        for (const m of msgs) await handleSignal(m);
      }
    } catch (e) {
      const key = 'levc_sig_' + joinCode;
      const q = JSON.parse(localStorage.getItem(key) || '[]');
      const mine = q.filter(m => m.to === user.facebookId || (!m.to && m.from !== user.facebookId));
      for (const m of mine) await handleSignal(m);
      localStorage.setItem(key, JSON.stringify(q.filter(m => Date.now() - (m.ts || 0) < 60000)));
    }
  }

  async function handleSignal(m) {
    if (!m || m.from === user.facebookId) return;
    const pc = ensurePeer(m.from, false);
    try {
      if (m.type === 'offer' && m.sdp) {
        await pc.setRemoteDescription(m.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal({ type: 'answer', from: user.facebookId, to: m.from, sdp: pc.localDescription });
      } else if (m.type === 'answer' && m.sdp) {
        if (!pc.currentRemoteDescription) await pc.setRemoteDescription(m.sdp);
      } else if (m.type === 'ice' && m.candidate) {
        await pc.addIceCandidate(m.candidate);
      }
    } catch (err) {
      console.warn('signal', err);
    }
  }

  $('btn-mic')?.addEventListener('click', () => {
    micEnabled = !micEnabled;
    localStream?.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    $('btn-mic').classList.toggle('muted', !micEnabled);
  });
  $('btn-cam')?.addEventListener('click', () => {
    camEnabled = !camEnabled;
    localStream?.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
    $('btn-cam').classList.toggle('muted', !camEnabled);
  });
  $('btn-audio')?.addEventListener('click', () => {
    audioOutEnabled = !audioOutEnabled;
    document.querySelectorAll('.video-tile.remote video').forEach(v => { v.muted = !audioOutEnabled; });
    $('btn-audio').classList.toggle('muted', !audioOutEnabled);
  });
  $('copy-code')?.addEventListener('click', () => {
    const code = room?.joinCode || joinCode;
    navigator.clipboard?.writeText(code).then(() => {
      $('copy-code').textContent = 'Copied!';
      setTimeout(() => { $('copy-code').textContent = 'Copy'; }, 1500);
    });
  });

  function requestLeave() { $('leave-modal')?.classList.remove('hidden'); }
  function cancelLeave() { $('leave-modal')?.classList.add('hidden'); }
  async function confirmLeave() {
    isLeaving = true;
    $('leave-modal')?.classList.add('hidden');
    if (room && room.creatorId === user.facebookId) {
      room.status = 'closed';
      room.closedAt = new Date().toISOString();
      await saveRoom();
      try {
        await fetch('/api/rooms/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ joinCode, creatorId: user.facebookId })
        });
      } catch (e) {}
    } else if (room) {
      room.participants = room.participants.filter(p => p.id !== user.facebookId);
      await saveRoom();
    }
    cleanupMedia();
    window.location.replace('/main/main.html');
  }
  $('btn-leave')?.addEventListener('click', requestLeave);
  $('leave-yes')?.addEventListener('click', confirmLeave);
  $('leave-no')?.addEventListener('click', cancelLeave);

  window.addEventListener('beforeunload', (e) => {
    if (!isLeaving && room?.status === 'active') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  history.pushState({ call: true }, '');
  window.addEventListener('popstate', () => {
    if (!isLeaving) {
      history.pushState({ call: true }, '');
      requestLeave();
    }
  });

  function cleanupMedia() {
    clearInterval(pollTimer);
    Object.values(peers).forEach(pc => pc.close());
    peers = {};
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null;
    window.IPCallProtection?.stop();
    window.LEVCProtection?.stop();
    window.LEVCNetworkQuality?.stopMonitor();
  }

  function updateQualityBadge(info) {
    let el = document.getElementById('net-quality');
    if (!el) {
      el = document.createElement('div');
      el.id = 'net-quality';
      el.className = 'net-quality';
      document.querySelector('.call-top')?.appendChild(el);
    }
    const level = (info && info.level) || qualityLevel || 'medium';
    const label = window.LEVCNetworkQuality?.LEVELS?.[level]?.label || level;
    el.textContent = 'Net: ' + label;
    el.dataset.level = level;
  }

  init();
})();
