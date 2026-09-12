/**
 * LEVoiceCall — Unified call + mobile WebRTC (3G/4G/2.4GHz Wi‑Fi)
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
  let signalTimer = null;
  let timerInterval = null;
  let callStartTime = null;
  let micEnabled = true;
  let camEnabled = true;
  let audioOutEnabled = true;
  let qualityLevel = window.LEVCNetworkQuality?.initFromNetwork?.() || 'low';
  let handledSignalIds = new Set();

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  function paintCode(code) {
    const c = (code || '—').toUpperCase();
    ['display-code', 'hint-code'].forEach((id) => { if ($(id)) $(id).textContent = c; });
    if ($('loading-code-hint')) $('loading-code-hint').textContent = c !== '—' ? 'Code: ' + c : '';
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

  function setConnStatus(text, state) {
    let el = $('conn-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'conn-status';
      el.className = 'conn-status';
      document.querySelector('.call-top')?.appendChild(el);
    }
    el.textContent = text;
    el.dataset.state = state || 'info';
  }

  function startCallTimer() {
    callStartTime = Date.now();
    const el = $('call-timer');
    if (!el) return;
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - callStartTime) / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      el.textContent = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }, 1000);
  }

  async function loadRoom() {
    try {
      const res = await fetch('/api/rooms?code=' + encodeURIComponent(joinCode));
      if (res.ok) return await res.json();
    } catch (e) {}
    const local = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
    return local[joinCode] || null;
  }

  function shouldInitiate(peerId) {
    return String(user.facebookId) < String(peerId);
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
    if (!room.participants.find((p) => p.id === user.facebookId)) {
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
    startCallTimer();
    setConnStatus('Connecting media…', 'wait');
    document.getElementById('net-quality')?.remove();

    try {
      qualityLevel = window.LEVCNetworkQuality?.initFromNetwork?.() || qualityLevel || 'low';
      let constraints = window.LEVCNetworkQuality
        ? window.LEVCNetworkQuality.getConstraints('video', qualityLevel)
        : {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
          };
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoErr) {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        camEnabled = false;
      }
      localStream.getTracks().forEach((t) => { t.enabled = true; });
      if (!camEnabled) localStream.getVideoTracks().forEach((t) => { t.enabled = false; });
      startLocalPreview();
      updateQualityBadge();
      setConnStatus(room.participants.length <= 1 ? 'Waiting for others…' : 'Connecting peers…', 'wait');
    } catch (e) {
      $('perm-modal')?.classList.remove('hidden');
      if ($('perm-title')) $('perm-title').textContent = e.name === 'NotAllowedError' ? 'Permission Denied' : 'Unable to access device';
      if ($('perm-msg')) $('perm-msg').textContent = humanMediaError(e);
      $('perm-retry')?.addEventListener('click', () => location.reload());
    }

    const protectOpts = {
      userLabel: (user.name || 'Guest') + ' · ' + (room.joinCode || joinCode),
      selectors: ['.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap']
    };
    const prot = {
      screenshotProtection: !!room.screenshotProtection,
      screenRecordingProtection: !!room.screenRecordingProtection
    };
    if (window.IPCallProtection) window.IPCallProtection.start(prot, protectOpts);
    else window.LEVCProtection?.start(prot, protectOpts);

    if (room.screenshotProtection || room.screenRecordingProtection) {
      $('privacy-badge')?.classList.remove('hidden');
    }

    if (window.LEVCNetworkQuality) {
      window.LEVCNetworkQuality.startMonitor(peers, (level) => {
        qualityLevel = level;
        window.LEVCNetworkQuality.applyToAllPeers(peers, level);
      });
    }
    pollTimer = setInterval(syncRoom, 2000);
    signalTimer = setInterval(pollSignals, 800);
    room.participants.forEach((p) => {
      if (p.id !== user.facebookId) ensurePeer(p.id, shouldInitiate(p.id));
    });
  }

  function humanMediaError(e) {
    const name = e.name || '';
    if (name === 'NotAllowedError') return 'Allow microphone (and camera if available) in browser settings for LEVoiceCall, then try again.';
    if (name === 'NotFoundError') return 'No microphone found on this device.';
    if (name === 'NotReadableError') return 'Device is already in use by another app.';
    if (name === 'SecurityError') return 'Media needs HTTPS (secure connection).';
    return e.message || 'Check device permissions and try again.';
  }

  function setupUI() {
    paintCode(room.joinCode || joinCode);
    if ($('call-name')) $('call-name').textContent = room.callName || 'Call';
    if ($('call-type-badge')) $('call-type-badge').textContent = 'Call';
    if ($('call-creator')) $('call-creator').textContent = 'Creator: ' + (room.creatorName || '—');
    $('btn-cam')?.classList.remove('hidden');
    renderParticipants();
  }

  function renderParticipants() {
    const list = $('participants-list');
    if (!list || !room) return;
    list.innerHTML = '';
    (room.participants || []).forEach((p) => {
      const li = document.createElement('li');
      const you = p.id === user.facebookId ? ' (you)' : '';
      const cr = p.isCreator ? ' · creator' : '';
      li.innerHTML = '<img src="' + (p.profilePicture || '') + '" alt="" class="avatar-xs" onerror="this.style.display=\'none\'"/><span>' + escapeHtml(p.name || 'User') + you + cr + '</span>';
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

  function showAvatarOn(wrap, person) {
    if (!wrap) return;
    let av = wrap.querySelector('.tile-avatar');
    if (!av) {
      av = document.createElement('div');
      av.className = 'tile-avatar';
      wrap.appendChild(av);
    }
    const name = person?.name || '?';
    const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    if (person?.profilePicture) av.innerHTML = '<img src="' + person.profilePicture + '" alt=""/>';
    else av.textContent = initials || '•';
    av.classList.add('show');
  }

  function hideAvatarOn(wrap) {
    wrap?.querySelector('.tile-avatar')?.classList.remove('show');
  }

  function startLocalPreview() {
    const v = $('local-video');
    const wrap = $('local-wrap');
    if (!v || !localStream) return;
    v.classList.add('mirrored');
    const hasLiveVideo = localStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
    if (!hasLiveVideo || !camEnabled) {
      v.style.display = 'none';
      wrap?.classList.add('audio-only');
      showAvatarOn(wrap, user);
      $('btn-cam')?.classList.add('off');
    } else {
      v.style.display = '';
      wrap?.classList.remove('audio-only');
      hideAvatarOn(wrap);
      v.srcObject = localStream;
      const tryPlay = () => { v.play().catch(() => {}); };
      if (v.readyState >= 2) tryPlay();
      else {
        v.addEventListener('loadedmetadata', tryPlay, { once: true });
        setTimeout(tryPlay, 400);
      }
    }
    if ($('local-label')) $('local-label').textContent = (user.name || 'You') + ' (you)';
  }

  async function saveRoom() {
    const local = JSON.parse(localStorage.getItem('levc_rooms') || '{}');
    local[joinCode] = room;
    localStorage.setItem('levc_rooms', JSON.stringify(local));
    try {
      await fetch('/api/rooms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(room) });
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
    room.participants.forEach((p) => {
      if (p.id !== user.facebookId && !peers[p.id]) ensurePeer(p.id, shouldInitiate(p.id));
    });
    Object.keys(peers).forEach((pid) => {
      if (!room.participants.find((p) => p.id === pid)) {
        peers[pid]?.close();
        delete peers[pid];
        document.getElementById('remote-' + pid)?.remove();
      }
    });
    if (Object.keys(peers).length === 0 && room.participants.length <= 1) setConnStatus('Waiting for others…', 'wait');
  }

  function ensurePeer(peerId, initiator) {
    if (peers[peerId]) return peers[peerId];
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 8,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
    peers[peerId] = pc;
    if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.ontrack = (ev) => {
      attachRemote(peerId, ev.streams[0] || new MediaStream([ev.track]));
      setConnStatus('Connected', 'ok');
    };
    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        await postSignal({
          type: 'ice',
          from: user.facebookId,
          to: peerId,
          candidate: ev.candidate,
          id: 'ice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        });
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setConnStatus('Connected', 'ok');
      else if (st === 'connecting') setConnStatus('Connecting peers…', 'wait');
      else if (st === 'failed') {
        setConnStatus('Reconnecting…', 'warn');
        try { pc.restartIce(); } catch (e) {}
      } else if (st === 'disconnected') {
        setConnStatus('Unstable…', 'warn');
        try { pc.restartIce(); } catch (e) {}
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        try { pc.restartIce(); } catch (e) {}
      }
    };
    window.LEVCNetworkQuality?.applySenderParams?.(pc, qualityLevel);
    if (initiator) createAndSendOffer(pc, peerId);
    return pc;
  }

  async function createAndSendOffer(pc, peerId) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      await postSignal({
        type: 'offer',
        from: user.facebookId,
        to: peerId,
        sdp: pc.localDescription,
        id: 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      });
    } catch (e) {
      console.error('offer', e);
    }
  }

  function attachRemote(peerId, stream) {
    let el = document.getElementById('remote-' + peerId);
    if (!el) {
      el = document.createElement('div');
      el.id = 'remote-' + peerId;
      el.className = 'video-tile remote';
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      el.appendChild(video);
      const label = document.createElement('div');
      label.className = 'tile-label';
      const p = room.participants.find((x) => x.id === peerId);
      label.textContent = p?.name || 'Participant';
      el.appendChild(label);
      $('remote-container')?.appendChild(el);
      $('no-participants')?.classList.add('hidden');
      if (p) showAvatarOn(el, p);
    }
    const video = el.querySelector('video');
    if (video && stream) {
      video.srcObject = stream;
      video.muted = !audioOutEnabled;
      video.play?.().catch(() => {});
      const hideAv = () => {
        const av = el.querySelector('.tile-avatar');
        if (av && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')) av.classList.remove('show');
      };
      video.addEventListener('loadeddata', hideAv);
      setTimeout(hideAv, 1500);
    }
  }

  async function postSignal(msg) {
    const payload = { code: joinCode, ...msg, ts: Date.now() };
    try {
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      const key = 'levc_sig_' + joinCode;
      const q = JSON.parse(localStorage.getItem(key) || '[]');
      q.push(payload);
      localStorage.setItem(key, JSON.stringify(q.slice(-60)));
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
      const mine = q.filter((m) => m.to === user.facebookId || (!m.to && m.from !== user.facebookId));
      for (const m of mine) await handleSignal(m);
      localStorage.setItem(key, JSON.stringify(q.filter((m) => Date.now() - (m.ts || 0) < 90000)));
    }
  }

  async function handleSignal(m) {
    if (!m || m.from === user.facebookId) return;
    if (m.id && handledSignalIds.has(m.id)) return;
    if (m.id) {
      handledSignalIds.add(m.id);
      if (handledSignalIds.size > 200) handledSignalIds = new Set([...handledSignalIds].slice(-100));
    }
    const pc = ensurePeer(m.from, false);
    try {
      if (m.type === 'offer' && m.sdp) {
        await pc.setRemoteDescription(m.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal({
          type: 'answer',
          from: user.facebookId,
          to: m.from,
          sdp: pc.localDescription,
          id: 'ans_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        });
      } else if (m.type === 'answer' && m.sdp) {
        if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(m.sdp);
      } else if (m.type === 'ice' && m.candidate) {
        try { await pc.addIceCandidate(m.candidate); } catch (e) {}
      }
    } catch (err) {
      console.warn('signal', err);
    }
  }

  $('btn-mic')?.addEventListener('click', () => {
    micEnabled = !micEnabled;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
    $('btn-mic').classList.toggle('muted', !micEnabled);
    $('btn-mic').classList.toggle('off', !micEnabled);
  });

  $('btn-cam')?.addEventListener('click', () => {
    camEnabled = !camEnabled;
    localStream?.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
    $('btn-cam').classList.toggle('muted', !camEnabled);
    $('btn-cam').classList.toggle('off', !camEnabled);
    const wrap = $('local-wrap');
    const v = $('local-video');
    if (!camEnabled) {
      if (v) v.style.display = 'none';
      wrap?.classList.add('audio-only');
      showAvatarOn(wrap, user);
    } else {
      if (v) {
        v.style.display = '';
        v.srcObject = localStream;
        v.play?.().catch(() => {});
      }
      wrap?.classList.remove('audio-only');
      hideAvatarOn(wrap);
    }
  });

  $('btn-audio')?.addEventListener('click', () => {
    audioOutEnabled = !audioOutEnabled;
    document.querySelectorAll('.video-tile.remote video').forEach((v) => { v.muted = !audioOutEnabled; });
    $('btn-audio').classList.toggle('muted', !audioOutEnabled);
    $('btn-audio').classList.toggle('off', !audioOutEnabled);
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
      room.participants = room.participants.filter((p) => p.id !== user.facebookId);
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
    clearInterval(signalTimer);
    clearInterval(timerInterval);
    Object.values(peers).forEach((pc) => pc.close());
    peers = {};
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    window.IPCallProtection?.stop();
    window.LEVCProtection?.stop();
    window.LEVCNetworkQuality?.stopMonitor();
  }

  function updateQualityBadge() {
    document.getElementById('net-quality')?.remove();
  }

  init();
})();
