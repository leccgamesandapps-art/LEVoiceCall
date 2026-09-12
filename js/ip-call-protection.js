/**
 * LEVoiceCall — IPCallProtection (hardened)
 * Burns watermark into displayed video via canvas so screenshots carry it.
 */
(function (global) {
  const STATE = {
    active: false,
    screenshot: false,
    screenRecord: false,
    obscured: false,
    capturePoll: null,
    raf: null,
    canvasMap: new WeakMap()
  };

  let sensitive = [];

  function setObscured(on) {
    if (STATE.obscured === on) return;
    STATE.obscured = on;
    document.documentElement.classList.toggle('levc-protect-blur', on);
    document.body.classList.toggle('levc-protect-blur', on);
    sensitive.forEach((el) => el.classList.toggle('levc-protect-blur', on));
    let veil = document.getElementById('levc-protect-veil');
    if (on) {
      if (!veil) {
        veil = document.createElement('div');
        veil.id = 'levc-protect-veil';
        veil.setAttribute('aria-hidden', 'true');
        veil.innerHTML = '<div class="levc-protect-msg"><strong>Protected</strong><span>Capture protection is active</span></div>';
        document.body.appendChild(veil);
      }
      veil.classList.add('on');
    } else if (veil) veil.classList.remove('on');
  }

  function ensureWatermark(text) {
    let wm = document.getElementById('levc-watermark');
    if (!wm) {
      wm = document.createElement('div');
      wm.id = 'levc-watermark';
      wm.setAttribute('aria-hidden', 'true');
      document.body.appendChild(wm);
    }
    const tiles = [];
    for (let i = 0; i < 30; i++) {
      const d = document.createElement('div');
      d.textContent = text;
      tiles.push('<span>' + d.innerHTML + '</span>');
    }
    wm.innerHTML = tiles.join('');
    wm.classList.add('on');
    if (STATE.screenshot) wm.classList.add('strong');
  }

  function clearWatermark() {
    document.getElementById('levc-watermark')?.classList.remove('on', 'strong');
  }

  function bindProtectedVideos(label) {
    document.querySelectorAll('.video-tile video').forEach((video) => {
      if (STATE.canvasMap.has(video)) return;
      const tile = video.closest('.video-tile');
      if (!tile) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'protect-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      tile.appendChild(canvas);
      video.classList.add('protect-video-src');
      STATE.canvasMap.set(video, { canvas, label, tile });
    });
  }

  function drawLoop() {
    if (!STATE.active || (!STATE.screenshot && !STATE.screenRecord)) {
      STATE.raf = null;
      return;
    }
    document.querySelectorAll('.video-tile video').forEach((video) => {
      if (!STATE.canvasMap.has(video)) return;
      const { canvas, label } = STATE.canvasMap.get(video);
      if (!video.videoWidth) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = STATE.screenshot ? 0.22 : 0.12;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + Math.max(14, Math.floor(w / 28)) + 'px sans-serif';
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-Math.PI / 7);
        const text = label || 'LEVoiceCall';
        for (let y = -h; y < h; y += 48) {
          for (let x = -w; x < w; x += Math.max(120, text.length * 10)) {
            ctx.fillText(text, x, y);
          }
        }
        ctx.restore();
      } catch (e) {}
    });
    STATE.raf = requestAnimationFrame(drawLoop);
  }

  function startDrawLoop() {
    if (STATE.raf) return;
    STATE.raf = requestAnimationFrame(drawLoop);
  }

  function stopDrawLoop() {
    if (STATE.raf) {
      cancelAnimationFrame(STATE.raf);
      STATE.raf = null;
    }
    document.querySelectorAll('.protect-canvas').forEach((c) => c.remove());
    document.querySelectorAll('.protect-video-src').forEach((v) => v.classList.remove('protect-video-src'));
  }

  function onVisibility() {
    if (!STATE.active) return;
    if (document.hidden && (STATE.screenshot || STATE.screenRecord)) setObscured(true);
    else if (!document.hidden) setObscured(false);
  }
  function onWindowBlur() {
    if (!STATE.active) return;
    if (STATE.screenshot || STATE.screenRecord) setObscured(true);
  }
  function onWindowFocus() {
    if (!STATE.active) return;
    if (!document.hidden) setObscured(false);
  }
  function onCapture() {
    if (!STATE.active) return;
    if (STATE.screenshot || STATE.screenRecord) {
      setObscured(true);
      setTimeout(() => {
        if (!document.hidden && document.hasFocus()) setObscured(false);
      }, 2000);
    }
  }

  function start(settings, opts) {
    stop();
    STATE.active = true;
    STATE.screenshot = !!settings?.screenshotProtection;
    STATE.screenRecord = !!settings?.screenRecordingProtection;
    if (!STATE.screenshot && !STATE.screenRecord) return;

    const selectors = opts?.selectors || ['.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap'];
    sensitive = selectors.map((s) => document.querySelector(s)).filter(Boolean);

    document.documentElement.classList.add('levc-ip-protect');
    if (STATE.screenshot) document.documentElement.classList.add('levc-ss-protect');
    if (STATE.screenRecord) document.documentElement.classList.add('levc-sr-protect');

    const label = opts?.userLabel || 'LEVoiceCall';
    ensureWatermark(label);

    setTimeout(() => {
      bindProtectedVideos(label);
      startDrawLoop();
    }, 400);
    STATE.capturePoll = setInterval(() => {
      if (!STATE.active) return;
      bindProtectedVideos(label);
      if ((STATE.screenshot || STATE.screenRecord) && document.hidden) setObscured(true);
    }, 1000);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('capture', onCapture, true);
    window.addEventListener('keyup', function (e) {
      if (STATE.screenshot && e.key === 'PrintScreen') onCapture();
    }, true);
  }

  function stop() {
    STATE.active = false;
    setObscured(false);
    clearWatermark();
    stopDrawLoop();
    document.documentElement.classList.remove('levc-ip-protect', 'levc-ss-protect', 'levc-sr-protect');
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    document.removeEventListener('capture', onCapture, true);
    if (STATE.capturePoll) {
      clearInterval(STATE.capturePoll);
      STATE.capturePoll = null;
    }
    document.getElementById('levc-protect-veil')?.remove();
  }

  global.IPCallProtection = { start, stop };
  global.LEVCProtection = { start, stop };
})(window);
