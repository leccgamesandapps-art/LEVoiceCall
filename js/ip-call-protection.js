/**
 * LEVoiceCall — IPCallProtection
 * No diagonal name/CODE spam. Blackout when tab hidden + tiny corner badge on video.
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
          '<strong>Protected</strong>' +
          '<span>Capture protection is on for this room</span></div>';
        document.body.appendChild(veil);
      }
      veil.classList.add('on');
    } else if (veil) {
      veil.classList.remove('on');
    }
  }

  function stripPageWatermark() {
    document.getElementById('levc-watermark')?.remove();
    document.querySelectorAll('#levc-watermark, .levc-watermark').forEach((el) => el.remove());
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

  function drawFrame(ctx, video, w, h, label) {
    ctx.drawImage(video, 0, 0, w, h);
    const code = (label || '').split(' · ').pop() || 'LEVC';
    const badge = '🔒 ' + String(code).slice(0, 10);
    const fontSize = Math.max(10, Math.floor(Math.min(w, h) / 28));
    ctx.save();
    ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
    const tw = ctx.measureText(badge).width;
    const pad = 6;
    const bh = fontSize + pad * 2;
    const bw = tw + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(pad, h - bh - pad, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, pad * 2, h - bh / 2 - pad);
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
        drawFrame(ctx, video, w, h, label);
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

  function start(settings, opts) {
    stop();
    STATE.active = true;
    STATE.screenshot = !!settings?.screenshotProtection;
    STATE.screenRecord = !!settings?.screenRecordingProtection;
    if (!STATE.screenshot && !STATE.screenRecord) return;

    STATE.label = opts?.userLabel || 'LEVoiceCall';
    const selectors = opts?.selectors || [
      '.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap'
    ];
    sensitive = selectors.map((s) => document.querySelector(s)).filter(Boolean);

    document.documentElement.classList.add('levc-ip-protect');
    stripPageWatermark();

    setTimeout(() => {
      stripPageWatermark();
      bindProtectedVideos(STATE.label);
      startDrawLoop();
    }, 200);

    STATE.capturePoll = setInterval(() => {
      if (!STATE.active) return;
      stripPageWatermark();
      bindProtectedVideos(STATE.label);
      startDrawLoop();
      if ((STATE.screenshot || STATE.screenRecord) && document.hidden) setObscured(true);
    }, 1000);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
  }

  function stop() {
    STATE.active = false;
    setObscured(false);
    stripPageWatermark();
    stopDrawLoop();
    document.documentElement.classList.remove('levc-ip-protect', 'levc-ss-protect', 'levc-sr-protect');
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    if (STATE.capturePoll) {
      clearInterval(STATE.capturePoll);
      STATE.capturePoll = null;
    }
    document.getElementById('levc-protect-veil')?.remove();
  }

  global.IPCallProtection = { start, stop };
  global.LEVCProtection = { start, stop };
})(window);
