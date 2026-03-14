/*
 * 세븐일레븐 WebView ultra-minimal 훅
 *
 * 목적:
 * - 탐지 리스크 최소화를 위해 evaluateJavascript 1개만 후킹
 * - 리플레이 후보 스크립트를 짧게 로그
 */

Java.perform(function () {
  function safe(v) {
    try {
      if (v === null || v === undefined) {
        return '';
      }
      return v.toString();
    } catch (e) {
      return '';
    }
  }

  function emit(type, payload) {
    console.log('[SE_REPLAY] ' + JSON.stringify({ t: type, ts: Date.now(), payload: payload }));
  }

  try {
    var WebView = Java.use('android.webkit.WebView');
    var evalJs = WebView.evaluateJavascript.overload(
      'java.lang.String',
      'android.webkit.ValueCallback',
    );

    evalJs.implementation = function (script, callback) {
      var s = safe(script);
      if (s.length > 0) {
        emit('evaluate_js', { script: s.slice(0, 2000) });
      }
      return evalJs.call(this, script, callback);
    };

    emit('ready', { hook: 'eval-only', version: 1 });
  } catch (e) {
    emit('error', { stage: 'setup', message: safe(e) });
  }
});
