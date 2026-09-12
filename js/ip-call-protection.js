/**
 * LEVoiceCall — IPCallProtection
 * Best-effort screenshot / screen-recording protection within browser limits.
 * Watermarks made much softer so they don’t dominate the UI.
 */
(function (global) {
  const STATE = {
    active: false,
    screenshot: false,
    screenRecord: false,
    obscured: false,
    capturePoll: null
  };

  let sensitive = [];

  function setObscured(on, reason) {
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
          '<span>Screenshot / capture protection is on for this room.</span>' +
          '</div>';
        document.body.appendChild(veil);
      }
      veil.classList.add('on');
    } else if (veil) {
      veil.classList.remove('on');
    }
  }

  function ensureWatermark(text) {
    let wm = document.getElementById('levc-watermark');
    if (!wm) {
      wm = document.createElement('div');
      wm.id = 'levc-watermark';
      wm.setAttribute('aria-hidden', 'true');
      document.body.appendChild(wm);
    }
    // Fewer tiles = less aggressive
    const tiles = [];
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div');
      d.textContent = text;
      tiles.push('<span>' + d.innerHTML + '</span>');
    }
    wm.innerHTML = tiles.join('');
    wm.classList.add('on');
  }

  function clearWatermark() {
    const wm = document.getElementById('levc-watermark');
    if (wm) wm.classList.remove('on');
  }

  function onVisibility() {
    if (!STATE.active) return;
    if (document.hidden && (STATE.screenshot || STATE.screenRecord)) {
      setObscured(true, 'visibility');
    } else if (!document.hidden) {
      setObscured(false);
    }
  }

  function onWindowBlur() {
    if (!STATE.active) return;
    if (STATE.screenshot || STATE.screenRecord) setObscured(true, 'blur');
  }

  function onWindowFocus() {
    if (!STATE.active) return;
    if (!document.hidden) setObscured(false);
  }

  function onCapture() {
    if (!STATE.active) return;
    if (STATE.screenshot || STATE.screenRecord) {
      setObscured(true, 'capture');
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

    const selectors = opts?.selectors || [
      '.media-stage', '.call-shell', '.video-tile', '#remote-container', '#local-wrap'
    ];
    sensitive = selectors.map((s) => document.querySelector(s)).filter(Boolean);

    document.documentElement.classList.add('levc-ip-protect');
    if (STATE.screenshot) document.documentElement.classList.add('levc-ss-protect');
    if (STATE.screenRecord) document.documentElement.classList.add('levc-sr-protect');

    ensureWatermark(opts?.userLabel || 'LEVoiceCall');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('capture', onCapture, true);
    window.addEventListener('keyup', function (e) {
      if (STATE.screenshot && e.key === 'PrintScreen') onCapture();
    }, true);

    STATE.capturePoll = setInterval(() => {
      if (!STATE.active) return;
      if ((STATE.screenshot || STATE.screenRecord) && document.hidden) setObscured(true);
    }, 800);
  }

  function stop() {
    STATE.active = false;
    setObscured(false);
    clearWatermark();
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
