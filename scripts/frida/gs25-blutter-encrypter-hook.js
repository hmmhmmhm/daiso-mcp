/**
 * GS25 Blutter 기반 암복호화 + API 후킹 스크립트 v4
 *
 * 캡처 대상:
 * 1. 암호화 전 평문 입력 (onEnter)
 * 2. 복호화 후 평문 출력 (onLeave)
 * 3. HTTP 요청 URL 및 바디
 */

'use strict';

const SCRIPT_NAME = 'gs25-blutter-encrypter-hook';

// blutter에서 추출한 오프셋 (libapp.so 기준)
const OFFSETS = {
    _encrypt: 0xa98420,
    encrypter_encrypt: 0xa984c4,
    _decrypt: 0xb07064,
    encrypter_decrypt64: 0xa9b50c
};

function jsonLog(obj) {
    obj.ts = Date.now();
    console.log(JSON.stringify(obj));
}

function log(msg) {
    jsonLog({ t: 'log', msg: msg });
}

// 메모리에서 문자열 스캔 (UTF-8 지원)
function scanForReadableString(ptr, maxLen) {
    try {
        const bytes = ptr.readByteArray(maxLen);
        if (!bytes) return null;

        const arr = new Uint8Array(bytes);
        let result = '';
        let nullCount = 0;

        for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            // ASCII 출력 가능 문자 + 한글/UTF-8 상위 바이트
            if ((b >= 32 && b < 127) || (b >= 0xC0 && b <= 0xFD)) {
                result += String.fromCharCode(b);
                nullCount = 0;
            } else if (b === 0) {
                nullCount++;
                // 연속 null 3개 이상이면 문자열 끝
                if (nullCount >= 3 && result.length > 5) {
                    break;
                }
            } else if (b === 10 || b === 13) {
                // 줄바꿈 허용
                result += ' ';
                nullCount = 0;
            }
        }

        return result.length > 5 ? result.trim() : null;
    } catch (e) {
        return null;
    }
}

function readLargeData(ptr, maxSize) {
    try {
        if (!ptr || ptr.isNull()) return null;
        return scanForReadableString(ptr, maxSize);
    } catch (e) {
        return null;
    }
}

function hookLibapp() {
    const libapp = Process.findModuleByName('libapp.so');
    if (!libapp) {
        log('libapp.so not found, retrying in 2s...');
        setTimeout(hookLibapp, 2000);
        return;
    }

    log('libapp.so found at ' + libapp.base);

    // _decrypt 후킹 (응답 평문 캡처)
    try {
        const _decrypt_addr = libapp.base.add(OFFSETS._decrypt);
        Interceptor.attach(_decrypt_addr, {
            onLeave: function(retval) {
                const plaintext = readLargeData(retval, 16384);
                if (plaintext && plaintext.length > 10) {
                    // JSON 응답 또는 중요 데이터 필터링
                    if (plaintext.includes('{') ||
                        plaintext.includes('store') ||
                        plaintext.includes('Stock') ||
                        plaintext.includes('quantity')) {
                        jsonLog({
                            t: 'DECRYPT_RESPONSE',
                            data: plaintext.substring(0, 8000)
                        });
                    } else {
                        jsonLog({
                            t: 'DECRYPT',
                            data: plaintext.substring(0, 2000)
                        });
                    }
                }
            }
        });
        log('Hooked _decrypt');
    } catch (e) {
        log('_decrypt hook failed: ' + e);
    }

    // decrypt64 후킹
    try {
        const decrypt64_addr = libapp.base.add(OFFSETS.encrypter_decrypt64);
        Interceptor.attach(decrypt64_addr, {
            onLeave: function(retval) {
                const plaintext = readLargeData(retval, 4096);
                if (plaintext && plaintext.length > 5) {
                    jsonLog({
                        t: 'DECRYPT64',
                        plaintext: plaintext.substring(0, 2000)
                    });
                }
            }
        });
        log('Hooked decrypt64');
    } catch (e) {
        log('decrypt64 hook failed: ' + e);
    }

    // _encrypt 후킹 (onEnter로 평문 입력 캡처)
    try {
        const _encrypt_addr = libapp.base.add(OFFSETS._encrypt);
        Interceptor.attach(_encrypt_addr, {
            onEnter: function(args) {
                // Dart 함수 인자 탐색 - 여러 위치 시도
                for (let i = 0; i < 6; i++) {
                    try {
                        const argPtr = args[i];
                        if (!argPtr || argPtr.isNull()) continue;

                        const plaintext = readLargeData(argPtr, 8192);
                        if (plaintext && plaintext.length > 20) {
                            // JSON, URL, HTTP 관련 문자열 필터링
                            if (plaintext.includes('{') ||
                                plaintext.includes('http') ||
                                plaintext.includes('store') ||
                                plaintext.includes('item') ||
                                plaintext.includes('stock') ||
                                plaintext.includes('keyword') ||
                                plaintext.includes('Coordination')) {
                                jsonLog({
                                    t: 'ENCRYPT_INPUT',
                                    argIndex: i,
                                    plaintext: plaintext.substring(0, 4000)
                                });
                            }
                        }
                    } catch (e) {
                        // 인자 읽기 실패 무시
                    }
                }
            },
            onLeave: function(retval) {
                const encrypted = readLargeData(retval, 2048);
                if (encrypted && encrypted.length > 10) {
                    jsonLog({
                        t: 'ENCRYPT_OUTPUT',
                        data: encrypted.substring(0, 1000)
                    });
                }
            }
        });
        log('Hooked _encrypt (onEnter + onLeave)');
    } catch (e) {
        log('_encrypt hook failed: ' + e);
    }

    // encrypter_encrypt 후킹 (실제 암호화 함수)
    try {
        const encrypter_encrypt_addr = libapp.base.add(OFFSETS.encrypter_encrypt);
        Interceptor.attach(encrypter_encrypt_addr, {
            onEnter: function(args) {
                // 실제 Encrypter.encrypt 함수의 인자 탐색
                for (let i = 0; i < 6; i++) {
                    try {
                        const argPtr = args[i];
                        if (!argPtr || argPtr.isNull()) continue;

                        const plaintext = readLargeData(argPtr, 8192);
                        if (plaintext && plaintext.length > 10) {
                            jsonLog({
                                t: 'ENCRYPTER_INPUT',
                                argIndex: i,
                                plaintext: plaintext.substring(0, 4000)
                            });
                        }
                    } catch (e) {
                        // 인자 읽기 실패 무시
                    }
                }
            }
        });
        log('Hooked encrypter_encrypt');
    } catch (e) {
        log('encrypter_encrypt hook failed: ' + e);
    }

    log('Dart hooks installed');
}

// Java HTTP 후킹
function hookJavaHttp() {
    Java.perform(function() {
        log('Java.perform started');

        // OkHttp3 RealCall 후킹
        try {
            const RealCall = Java.use('okhttp3.internal.connection.RealCall');
            RealCall.getResponseWithInterceptorChain$okhttp.implementation = function() {
                const request = this.getOriginalRequest();
                const url = request.url().toString();
                const method = request.method();

                jsonLog({
                    t: 'HTTP_REQUEST',
                    method: method,
                    url: url
                });

                const response = this.getResponseWithInterceptorChain$okhttp();
                return response;
            };
            log('Hooked OkHttp3 RealCall');
        } catch (e) {
            log('OkHttp3 hook failed: ' + e);
        }

        // URL.openConnection 후킹
        try {
            const URL = Java.use('java.net.URL');
            URL.openConnection.overload().implementation = function() {
                const urlStr = this.toString();
                if (urlStr.includes('woodongs') || urlStr.includes('b2c') || urlStr.includes('bff')) {
                    jsonLog({
                        t: 'URL_OPEN',
                        url: urlStr
                    });
                }
                return this.openConnection();
            };
            log('Hooked URL.openConnection');
        } catch (e) {
            log('URL hook failed: ' + e);
        }

        // HttpURLConnection 후킹
        try {
            const HttpURLConnection = Java.use('java.net.HttpURLConnection');
            HttpURLConnection.setRequestMethod.implementation = function(method) {
                const url = this.getURL().toString();
                if (url.includes('woodongs') || url.includes('b2c') || url.includes('bff') || url.includes('gsretail')) {
                    jsonLog({
                        t: 'HTTP_METHOD',
                        method: method,
                        url: url
                    });
                }
                return this.setRequestMethod(method);
            };
            log('Hooked HttpURLConnection');
        } catch (e) {
            log('HttpURLConnection hook failed: ' + e);
        }

        // Cronet (if used)
        try {
            const CronetUrlRequest = Java.use('org.chromium.net.impl.CronetUrlRequest');
            CronetUrlRequest.start.implementation = function() {
                const url = this.mInitialUrl.value;
                jsonLog({
                    t: 'CRONET_REQUEST',
                    url: url
                });
                return this.start();
            };
            log('Hooked Cronet');
        } catch (e) {
            // Cronet not used
        }

        log('Java hooks installed');
    });
}

// Native SSL 후킹 (Flutter/BoringSSL)
function hookNativeSSL() {
    // libflutter.so의 SSL_write 후킹
    const modules = ['libflutter.so', 'libssl.so'];

    for (const modName of modules) {
        const mod = Process.findModuleByName(modName);
        if (!mod) continue;

        try {
            const SSL_write = Module.findExportByName(modName, 'SSL_write');
            if (SSL_write) {
                Interceptor.attach(SSL_write, {
                    onEnter: function(args) {
                        this.buf = args[1];
                        this.len = args[2].toInt32();
                    },
                    onLeave: function(retval) {
                        const written = retval.toInt32();
                        if (written > 50 && written < 8192) {
                            try {
                                const data = this.buf.readByteArray(Math.min(written, 2048));
                                const arr = new Uint8Array(data);
                                let str = '';
                                for (let i = 0; i < arr.length; i++) {
                                    if (arr[i] >= 32 && arr[i] < 127) {
                                        str += String.fromCharCode(arr[i]);
                                    }
                                }
                                // HTTP 요청 감지
                                if (str.includes('POST ') || str.includes('GET ') || str.includes('Host:')) {
                                    jsonLog({
                                        t: 'SSL_WRITE',
                                        bytes: written,
                                        preview: str.substring(0, 1000)
                                    });
                                }
                            } catch(e) {}
                        }
                    }
                });
                log('Hooked SSL_write in ' + modName);
            }

            const SSL_read = Module.findExportByName(modName, 'SSL_read');
            if (SSL_read) {
                Interceptor.attach(SSL_read, {
                    onEnter: function(args) {
                        this.buf = args[1];
                        this.len = args[2].toInt32();
                    },
                    onLeave: function(retval) {
                        const bytesRead = retval.toInt32();
                        if (bytesRead > 50 && bytesRead < 8192) {
                            try {
                                const data = this.buf.readByteArray(Math.min(bytesRead, 2048));
                                const arr = new Uint8Array(data);
                                let str = '';
                                for (let i = 0; i < arr.length; i++) {
                                    if (arr[i] >= 32 && arr[i] < 127) {
                                        str += String.fromCharCode(arr[i]);
                                    }
                                }
                                // HTTP 응답 또는 JSON 감지
                                if (str.includes('HTTP/') || str.includes('"store') || str.includes('"data"') || str.includes('woodongs')) {
                                    jsonLog({
                                        t: 'SSL_READ',
                                        bytes: bytesRead,
                                        preview: str.substring(0, 1500)
                                    });
                                }
                            } catch(e) {}
                        }
                    }
                });
                log('Hooked SSL_read in ' + modName);
            }
        } catch (e) {
            log('SSL hook failed for ' + modName + ': ' + e);
        }
    }
}

// 시작
log(SCRIPT_NAME + ' v4 loaded - capturing plaintext before encryption');
setTimeout(hookLibapp, 500);
setTimeout(hookJavaHttp, 1000);
setTimeout(hookNativeSSL, 1500);
