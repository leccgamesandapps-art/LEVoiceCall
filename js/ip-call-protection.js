/**
 * LEVoiceCall — IPCallProtection
 * No full-page watermark. Burns mark into video frames only + blackout when tab hidden.
 */
(function (global) {
  const STATE = {
    active: false,
    screenshot: false,
    screenRecord: false,
    obscured: false,
    capturePoll: null,
    raf: null,
    canvasMap: new WeakMap(),
    label: 'LEVoiceCall'
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
        veil.innerHTML =
          '<div class="levc-protect-msg">' +
          '<strong>Protected content</strong>' +
          '<span>Screenshot / recording protection is on</span></div>';
        document.body.appendChild(veil);
      }
      veil.classList.add('on');
    } else if (veil) {
      veil.classList.remove('on');
    }
  }

  function ensureWatermark(text) {
    // No full-page overlay — only canvas watermark on video frames
    document.getElementById('levc-watermark')?.remove();
  }

  function clearWatermark() {
    document.getElementById('levc-watermark')?.remove();
  }

  function bindProtectedVideos(label) {
    document.querySelectorAll('.video-tile video').forEach((video) => {
      if (STATE.canvasMap.has(video)) return;
      const tile = video.closest('.video-tile');
      if (!tile) return;
      let canvas = tile.querySelector('canvas.protect-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'protect-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        tile.appendChild(canvas);
      }
      video.classList.add('protect-video-src');
      STATE.canvasMap.set(video, { canvas, label, tile });
    });
  }

  function drawWatermark(ctx, w, h, label) {
    const text = label || STATE.label || 'LEVoiceCall';
    const size = Math.max(16, Math.floor(Math.min(w, h) / 18));
    ctx.save();
    ctx.globalAlpha = STATE.screenshot ? 0.42 : 0.32;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + size + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    const stepY = size * 2.2;
    const stepX = Math.max(text.length * size * 0.55, w * 0.35);
    for (let y = -h; y <= h; y += stepY) {
      for (let x = -w; x <= w; x += stepX) {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(91,106,240,0.9)';
    const badge = 'PROTECTED · ' + (text.split(' · ')[1] || text).slice(0, 12);
    ctx.font = 'bold ' + Math.max(11, Math.floor(size * 0.55)) + 'px sans-serif';
    const pad = 8;
    const tw = ctx.measureText(badge).width;
    ctx.fillRect(pad, h - size - pad * 2, tw + pad * 2, size + pad);
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, pad * 2, h - pad * 1.5);
    ctx.restore();
  }

  function drawLoop() {
    if (!STATE.active || (!STATE.screenshot && !STATE.screenRecord)) {
      STATE.raf = null;
      return;
    }
    document.querySelectorAll('.video-tile video').forEach((video) => {
      if (!STATE.canvasMap.has(video)) return;
      const { canvas, label } = STATE.canvasMap.get(video);
      if (!video.videoWidth || video.readyState < 2) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, w, h);
        drawWatermark(ctx, w, h, label);
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
      }, 2500);
    }
  }

  function start(settings, opts) {
    stop();
    STATE.active = true;
    STATE.screenshot = !!settings?.screenshotProtection;
    STATE.screenRecord = !!settings?.screenRecordingProtection;
    if (!STATE.screenshot && !STATE.screenRecord) return;

    STATE.label = opts?.userLabel || 'LEVoiceCall';
    const selectors = opts?.selectors || ['.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap'];
    sensitive = selectors.map((s) => document.querySelector(s)).filter(Boolean);

    document.documentElement.classList.add('levc-ip-protect');
    if (STATE.screenshot) document.documentElement.classList.add('levc-ss-protect');
    if (STATE.screenRecord) document.documentElement.classList.add('levc-sr-protect');

    ensureWatermark(STATE.label);
    document.getElementById('levc-watermark')?.remove();

    setTimeout(() => {
      bindProtectedVideos(STATE.label);
      startDrawLoop();
    }, 300);

    STATE.capturePoll = setInterval(() => {
      if (!STATE.active) return;
      bindProtectedVideos(STATE.label);
      startDrawLoop();
      if ((STATE.screenshot || STATE.screenRecord) && document.hidden) setObscured(true);
    }, 800);

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
