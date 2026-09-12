/**
 * LEVoiceCall — Adaptive network / media quality
 */
(function (global) {
  const LEVELS = {
    low: {
      label: 'Low',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 },
      video: { width: { ideal: 320, max: 480 }, height: { ideal: 240, max: 360 }, frameRate: { ideal: 12, max: 15 }, facingMode: 'user' },
      bitrate: { audio: 24000, video: 150000 }
    },
    medium: {
      label: 'Balanced',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 32000, channelCount: 1 },
      video: { width: { ideal: 640, max: 960 }, height: { ideal: 360, max: 540 }, frameRate: { ideal: 20, max: 24 }, facingMode: 'user' },
      bitrate: { audio: 40000, video: 500000 }
    },
    high: {
      label: 'High',
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
      video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
      bitrate: { audio: 64000, video: 1200000 }
    }
  };

  let currentLevel = 'medium';
  let monitorTimer = null;
  let lastStats = { rtt: 0, loss: 0, level: 'medium' };

  function detectInitialLevel() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return 'medium';
    const type = (conn.effectiveType || '').toLowerCase();
    if (type === 'slow-2g' || type === '2g' || type === '3g') return 'low';
    if (type === '4g') return 'high';
    if (conn.saveData) return 'low';
    if (typeof conn.downlink === 'number') {
      if (conn.downlink < 1) return 'low';
      if (conn.downlink < 5) return 'medium';
      return 'high';
    }
    return 'medium';
  }

  function getConstraints(callType, level) {
    const L = LEVELS[level] || LEVELS.medium;
    if (callType === 'video') return { audio: L.audio, video: L.video };
    return { audio: L.audio, video: false };
  }

  async function applySenderParams(pc, level) {
    if (!pc) return;
    const L = LEVELS[level] || LEVELS.medium;
    try {
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        if (sender.track.kind === 'video') {
          params.encodings[0].maxBitrate = L.bitrate.video;
          params.encodings[0].maxFramerate = L.video.frameRate?.ideal || 24;
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
    for (const id of Object.keys(peers)) {
      await applySenderParams(peers[id], level);
    }
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
              if (total > 0) {
                totalLoss += r.packetsLost / total;
                samples++;
              }
            }
          });
        }
      } catch (e) { return; }
      if (!samples) return;
      const rtt = totalRtt / samples;
      const loss = totalLoss / samples;
      lastStats = { rtt, loss, level: currentLevel };
      let next = currentLevel;
      if (rtt > 400 || loss > 0.08) next = 'low';
      else if (rtt > 200 || loss > 0.03) next = 'medium';
      else if (rtt < 100 && loss < 0.015) next = 'high';
      if (next !== currentLevel) {
        currentLevel = next;
        lastStats.level = next;
        if (typeof onChange === 'function') onChange(next, lastStats);
        applyToAllPeers(peers, next);
      }
    }, 4000);
  }

  function stopMonitor() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  function getLevel() { return currentLevel; }
  function setLevel(level) {
    if (LEVELS[level]) currentLevel = level;
    return currentLevel;
  }
  function initFromNetwork() {
    currentLevel = detectInitialLevel();
    return currentLevel;
  }
  function getStatus() {
    return { ...lastStats, level: currentLevel, label: LEVELS[currentLevel]?.label };
  }

  global.LEVCNetworkQuality = {
    LEVELS, detectInitialLevel, getConstraints, applySenderParams,
    applyToAllPeers, startMonitor, stopMonitor, getLevel, setLevel,
    initFromNetwork, getStatus
  };
})(window);
