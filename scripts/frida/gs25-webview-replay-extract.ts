/*
 * GS25 재고찾기 WebView 리플레이 추출기
 *
 * 목적:
 * - evaluateJavascript로 주입되는 지도 제어 함수를 파싱해서
 *   리플레이 가능한 JSON 이벤트로 출력
 */

Java.perform(function () {
  var LOG_LIMIT = 5000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

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
    var out = {
      t: type,
      ts: Date.now(),
      payload: payload,
    };
    log('[GS25_REPLAY] ' + JSON.stringify(out));
  }

  function pickArgs(script, fnName) {
    var re = new RegExp(fnName + '\\(([^)]*)\\)');
    var m = script.match(re);
    return m ? m[1] : null;
  }

  function parseMarkers(script) {
    var m = script.match(/setAllStoreMarker\((\[[\s\S]*?\])\)/);
    if (!m || !m[1]) {
      return null;
    }
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      return null;
    }
  }

  function parseMarkerClick(script) {
    var args = pickArgs(script, 'onMarkerClick');
    if (!args) {
      return null;
    }
    var m = args.match(
      /^\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(true|false)\s*$/,
    );
    if (!m) {
      return { raw: args };
    }
    return {
      serviceCode: m[1],
      storeCode: m[2],
      selected: m[3] === 'true',
      fromList: m[4] === 'true',
      moveCenter: m[5] === 'true',
    };
  }

  function parseCenter(script) {
    var args = pickArgs(script, 'setCenter');
    if (!args) {
      return null;
    }
    var parts = args.split(',');
    if (parts.length < 2) {
      return { raw: args };
    }
    return {
      lat: Number(parts[0].trim()),
      lng: Number(parts[1].trim()),
    };
  }

  function parseLevel(script) {
    var args = pickArgs(script, 'setLevel');
    if (!args) {
      return null;
    }
    var parts = args.split(',');
    if (parts.length < 2) {
      return { raw: args };
    }
    return {
      level: Number(parts[0].trim()),
      animate: parts[1].trim() === 'true',
    };
  }

  function parseTouchable(script) {
    var args = pickArgs(script, 'setTouchable');
    if (!args) {
      return null;
    }
    var parts = args.split(',');
    if (parts.length < 2) {
      return { raw: args };
    }
    return {
      touchMap: parts[0].trim() === 'true',
      touchMarker: parts[1].trim() === 'true',
    };
  }

  try {
    var WebView = Java.use('android.webkit.WebView');
    var evalJs = WebView.evaluateJavascript.overload(
      'java.lang.String',
      'android.webkit.ValueCallback',
    );

    evalJs.implementation = function (script, callback) {
      var s = safe(script);

      if (s.indexOf('setAllStoreMarker(') >= 0) {
        var markers = parseMarkers(s);
        if (markers) {
          emit('markers', {
            count: markers.length,
            stores: markers.map(function (x) {
              return {
                storeCode: x.storeCode,
                serviceCode: x.serviceCode,
                balloonText: x.balloonText,
                latitude: x.latitude,
                longitude: x.longitude,
                enable: x.enable,
              };
            }),
          });
        } else {
          emit('markers_raw', { raw: s });
        }
      }

      if (s.indexOf('onMarkerClick(') >= 0) {
        emit('marker_click', parseMarkerClick(s));
      }

      if (s.indexOf('setCenter(') >= 0) {
        emit('center', parseCenter(s));
      }

      if (s.indexOf('setLevel(') >= 0) {
        emit('level', parseLevel(s));
      }

      if (s.indexOf('setTouchable(') >= 0) {
        emit('touchable', parseTouchable(s));
      }

      return evalJs.call(this, script, callback);
    };

    log('[+] gs25-webview-replay-extract ready');
  } catch (e) {
    log('[-] replay extractor setup failed: ' + e);
  }
});
