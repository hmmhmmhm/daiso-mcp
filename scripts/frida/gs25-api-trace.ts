/**
 * GS25 API 호출 추적 스크립트
 *
 * 목적: 실제 API URL과 파라미터를 캡처
 */

'use strict';

function log(msg) {
    console.log(JSON.stringify({ ts: Date.now(), msg: msg }));
}

// HTTP URL 파싱 및 로깅
function logUrl(url) {
    if (url && (url.includes('woodongs') || url.includes('b2c') || url.includes('bff') || url.includes('stock') || url.includes('search'))) {
        console.log(JSON.stringify({
            ts: Date.now(),
            t: 'URL',
            url: url
        }));
    }
}

// 문자열에서 URL 추출
function extractUrls(str) {
    if (!str || typeof str !== 'string') return;

    // URL 패턴 매칭
    const urlPattern = /https?:\/\/[^\s"'<>]+/g;
    const matches = str.match(urlPattern);
    if (matches) {
        matches.forEach(url => logUrl(url));
    }

    // API 경로 패턴 매칭
    const apiPattern = /\/api\/[^\s"'<>]+/g;
    const apiMatches = str.match(apiPattern);
    if (apiMatches) {
        apiMatches.forEach(path => {
            console.log(JSON.stringify({
                ts: Date.now(),
                t: 'API_PATH',
                path: path
            }));
        });
    }
}

// 메모리에서 문자열 스캔 (확장된 범위)
function scanForString(ptr, maxLen) {
    try {
        const bytes = ptr.readByteArray(maxLen);
        if (!bytes) return null;

        const arr = new Uint8Array(bytes);
        let result = '';

        for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            if (b >= 32 && b < 127) {
                result += String.fromCharCode(b);
            } else if (b === 0 && result.length > 10) {
                break;
            }
        }

        return result.length > 10 ? result : null;
    } catch (e) {
        return null;
    }
}

// libapp.so 후킹 (blutter 오프셋 기반)
function hookLibapp() {
    const libapp = Process.findModuleByName('libapp.so');
    if (!libapp) {
        log('libapp.so not found, retrying...');
        setTimeout(hookLibapp, 2000);
        return;
    }

    log('libapp.so at ' + libapp.base);

    // _decrypt 후킹 (응답 복호화)
    const DECRYPT_OFFSET = 0xb07064;
    try {
        Interceptor.attach(libapp.base.add(DECRYPT_OFFSET), {
            onLeave: function(retval) {
                const str = scanForString(retval, 8192);
                if (str) {
                    // JSON 응답 캡처
                    if (str.includes('{') && (str.includes('store') || str.includes('item') || str.includes('stock') || str.includes('keyword'))) {
                        console.log(JSON.stringify({
                            ts: Date.now(),
                            t: 'DECRYPT_RESPONSE',
                            preview: str.substring(0, 3000)
                        }));
                    }
                    // URL 추출
                    extractUrls(str);
                }
            }
        });
        log('Hooked _decrypt');
    } catch (e) {
        log('_decrypt hook failed: ' + e);
    }

    // _encrypt 후킹 (요청 암호화 전)
    const ENCRYPT_OFFSET = 0xa98420;
    try {
        Interceptor.attach(libapp.base.add(ENCRYPT_OFFSET), {
            onEnter: function(args) {
                // 첫 번째 인자에서 평문 요청 추출 시도
                for (let i = 0; i < 4; i++) {
                    try {
                        const str = scanForString(args[i], 4096);
                        if (str && str.length > 20) {
                            if (str.includes('http') || str.includes('/api') || str.includes('keyword') || str.includes('itemCode') || str.includes('documentId')) {
                                console.log(JSON.stringify({
                                    ts: Date.now(),
                                    t: 'ENCRYPT_INPUT',
                                    argIndex: i,
                                    preview: str.substring(0, 2000)
                                }));
                            }
                            extractUrls(str);
                        }
                    } catch (e) {}
                }
            }
        });
        log('Hooked _encrypt');
    } catch (e) {
        log('_encrypt hook failed: ' + e);
    }

    log('Dart hooks installed');
}

// Java 레이어 후킹
function hookJava() {
    Java.perform(function() {
        log('Java.perform started');

        // StringBuilder 후킹 (URL 조립 캡처)
        try {
            const StringBuilder = Java.use('java.lang.StringBuilder');
            StringBuilder.toString.implementation = function() {
                const result = this.toString.call(this);
                if (result && result.length > 50 && result.length < 2000) {
                    if (result.includes('woodongs') || result.includes('/api/bff') || result.includes('stock') || result.includes('itemCode')) {
                        console.log(JSON.stringify({
                            ts: Date.now(),
                            t: 'STRINGBUILDER',
                            value: result
                        }));
                    }
                }
                return result;
            };
            log('Hooked StringBuilder');
        } catch (e) {}

        // Uri.parse 후킹
        try {
            const Uri = Java.use('android.net.Uri');
            Uri.parse.implementation = function(uriString) {
                if (uriString && (uriString.includes('woodongs') || uriString.includes('b2c') || uriString.includes('stock'))) {
                    console.log(JSON.stringify({
                        ts: Date.now(),
                        t: 'URI_PARSE',
                        uri: uriString
                    }));
                }
                return this.parse(uriString);
            };
            log('Hooked Uri.parse');
        } catch (e) {}

        log('Java hooks installed');
    });
}

log('gs25-api-trace loaded');
setTimeout(hookLibapp, 500);
setTimeout(hookJava, 1000);
