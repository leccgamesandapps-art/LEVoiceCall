/**
 * Compatibility wrapper — uses IPCallProtection when available.
 */
(function (global) {
  function start(settings, opts) {
    if (global.IPCallProtection) return global.IPCallProtection.start(settings, opts);
  }
  function stop() {
    if (global.IPCallProtection) return global.IPCallProtection.stop();
  }
  global.LEVCProtection = { start, stop };
})(window);
