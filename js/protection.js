/**
 * Best-effort Screenshot & Screen Recording protection (browser limits apply)
 */
(function (global) {
  let active = false;
  let ssEnabled = false;
  let srEnabled = false;
  let blurEls = [];

  function applyBlur(on) {
    document.documentElement.classList.toggle('blur-content', on);
    blurEls.forEach(el => el.classList.toggle('blur-content', on));
  }

  function onVisibility() {
    if (!active) return;
    if (document.hidden && (ssEnabled || srEnabled)) {
      applyBlur(true);
    } else {
      applyBlur(false);
    }
  }

  function onFocusBlur() {
    if (!active) return;
    if (!document.hasFocus() && (ssEnabled || srEnabled)) {
      applyBlur(true);
    } else {
      applyBlur(false);
    }
  }

  function start(roomSettings, sensitiveSelectors = ['.media-stage', '.call-app', '.video-tile']) {
    active = true;
    ssEnabled = !!roomSettings.screenshotProtection;
    srEnabled = !!roomSettings.screenRecordingProtection;
    blurEls = sensitiveSelectors.map(s => document.querySelector(s)).filter(Boolean);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onFocusBlur);
    window.addEventListener('focus', onFocusBlur);
  }

  function stop() {
    active = false;
    applyBlur(false);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onFocusBlur);
    window.removeEventListener('focus', onFocusBlur);
  }

  global.LEVCProtection = { start, stop };
})(window);
