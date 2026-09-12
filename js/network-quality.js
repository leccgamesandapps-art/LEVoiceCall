/**
 * LEVoiceCall — Mobile-friendly WebRTC quality (3G / 4G / 2.4GHz Wi‑Fi)
 * No UI badge — adjusts bitrates only.
 */
(function (global) {
  const LEVELS = {
    low: {
      label: 'Low',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: { width: { ideal: 320, max: 480 }, height: { ideal: 240, max: 360 }, frameRate: { ideal: 12, max: 15 }, facingMode: 'user' },
      bitrate: { audio: 20000, video: 120000 }
    },
    medium: {
      label: 'Balanced',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: { width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' },
      bitrate: { audio: 32000, video: 350000 }
    },
    high: {
      label: 'High',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: { width: { ideal: 640, max: 960 }, height: { ideal: 360, max: 540 }, frameRate: { ideal: 20, max: 24 }, facingMode: 'user' },
      bitrate: { audio: 48000, video: 600000 }
    }
  };

  let currentLevel = 'low';
  let monitorTimer = null;

  function detectInitialLevel() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return 'medium';
    if (conn.saveData) return 'low';
    const type = (conn.effectiveType || '').toLowerCase();
    if (type === 'slow-2g' || type === '2g' || type === '3g') return 'low';
    if (type === '4g') return 'medium';
    if (typeof conn.downlink === 'number') {
      if (conn.downlink < 1.5) return 'low';
      if (conn.downlink < 5) return 'medium';
      return 'medium';
    }
    return 'medium';
  }

  function getConstraints(callType, level) {
    const L = LEVELS[level] || LEVELS.low;
    return { audio: L.audio, video: L.video };
  }

  async function applySenderParams(pc, level) {
    if (!pc) return;
    const L = LEVELS[level] || LEVELS.low;
    try {
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        if (sender.track.kind === 'video') {
          params.encodings[0].maxBitrate = L.bitrate.video;
          params.encodings[0].maxFramerate = L.video.frameRate?.ideal || 15;
          if (level === 'low') params.encodings[0].scaleResolutionDownBy = 2;
          else if (level === 'medium') params.encodings[0].scaleResolutionDownBy = 1.5;
          else params.encodings[0].scaleResolutionDownBy = 1;
        } else if (sender.track.kind === 'audio') {
          params.encodings[0].maxBitrate = L.bitrate.audio;
        }
        await sender.setParameters(params);
      }
    } catch (e) {
      console.warn('[NetworkQuality]', e);
    }
  }

  async function applyToAllPeers(peers, level) {
    if (!peers) return;
    for (const id of Object.keys(peers)) await applySenderParams(peers[id], level);
  }

  function startMonitor(peers, onChange) {
    stopMonitor();
    monitorTimer = setInterval(async () => {
      let totalRtt = 0, totalLoss = 0, samples = 0;
      try {
        for (const id of Object.keys(peers || {})) {
          const pc = peers[id];
          if (!pc) continue;
          const stats = await pc.getStats();
          stats.forEach((r) => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') {
              totalRtt += r.currentRoundTripTime * 1000;
              samples++;
            }
            if (r.type === 'inbound-rtp' && r.packetsLost != null && r.packetsReceived != null) {
              const total = r.packetsLost + r.packetsReceived;
              if (total > 0) { totalLoss += r.packetsLost / total; samples++; }
            }
          });
        }
      } catch (e) { return; }
      if (!samples) return;
      const rtt = totalRtt / samples;
      const loss = totalLoss / samples;
      let next = currentLevel;
      if (rtt > 350 || loss > 0.06) next = 'low';
      else if (rtt > 180 || loss > 0.025) next = 'medium';
      else if (rtt < 80 && loss < 0.01) next = 'medium';
      if (next !== currentLevel) {
        currentLevel = next;
        if (typeof onChange === 'function') onChange(next, { rtt, loss, level: next });
        applyToAllPeers(peers, next);
      }
    }, 5000);
  }

  function stopMonitor() {
    if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
  }

  function getLevel() { return currentLevel; }
  function setLevel(level) { if (LEVELS[level]) currentLevel = level; return currentLevel; }
  function initFromNetwork() { currentLevel = detectInitialLevel(); return currentLevel; }
  function getStatus() { return { level: currentLevel, label: LEVELS[currentLevel]?.label }; }

  global.LEVCNetworkQuality = {
    LEVELS, detectInitialLevel, getConstraints, applySenderParams,
    applyToAllPeers, startMonitor, stopMonitor, getLevel, setLevel,
    initFromNetwork, getStatus
  };
})(window);
