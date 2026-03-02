/**
 * 개인정보 처리방침 페이지
 *
 * 서비스의 개인정보 처리방침을 제공합니다.
 * 이 서비스는 사용자 데이터를 수집하지 않습니다.
 */

/**
 * 개인정보 처리방침 텍스트 생성
 */
export function generatePrivacyText(baseUrl: string): string {
  const currentDate = new Date().toISOString().split('T')[0];

  return `# 개인정보 처리방침

**시행일자**: ${currentDate}

---

## 1. 개요

본 개인정보 처리방침은 다이소 MCP API 서비스(이하 "서비스")의 개인정보 처리에 관한 사항을 안내합니다.

**서비스 URL**: ${baseUrl}

---

## 2. 수집하는 개인정보

**본 서비스는 어떠한 개인정보도 수집하지 않습니다.**

구체적으로 다음 정보를 수집, 저장, 처리하지 않습니다:

- 이름, 이메일, 전화번호 등 개인 식별 정보
- IP 주소, 브라우저 정보 등 기기 식별 정보
- 쿠키, 세션 정보
- 위치 정보 (API 요청에 포함된 좌표는 처리 후 즉시 폐기)
- 검색 기록 및 사용 패턴
- 기타 모든 형태의 개인정보

---

## 3. 서비스 작동 방식

본 서비스는 다음과 같이 작동합니다:

1. **무상태(Stateless) 처리**: 모든 API 요청은 독립적으로 처리되며, 요청 간 사용자 정보를 저장하지 않습니다.
2. **데이터 미보관**: 요청 처리에 사용된 정보는 응답 후 즉시 폐기됩니다.
3. **로그 미수집**: 사용자 활동에 대한 로그를 기록하지 않습니다.
4. **제3자 공유 없음**: 어떠한 정보도 제3자에게 제공하지 않습니다.

---

## 4. 쿠키 및 추적 기술

**본 서비스는 쿠키나 추적 기술을 사용하지 않습니다.**

- 쿠키 설정 없음
- 웹 비콘 없음
- 분석 도구 없음
- 광고 추적 없음

---

## 5. 제3자 서비스

본 서비스는 다이소 공식 API를 통해 제품 및 매장 정보를 조회합니다. 다이소 서비스 이용 시 다이소의 개인정보 처리방침이 적용될 수 있습니다.

---

## 6. 아동의 개인정보

본 서비스는 개인정보를 수집하지 않으므로, 아동의 개인정보 보호와 관련된 별도의 조치가 필요하지 않습니다.

---

## 7. 보안

개인정보를 수집하지 않으므로 보호할 개인정보가 없습니다. 다만, 서비스의 안정적인 운영을 위해 Cloudflare의 보안 인프라를 활용합니다.

---

## 8. 개인정보 처리방침의 변경

본 방침이 변경될 경우, 변경 사항을 이 페이지에 게시합니다.

---

## 9. 문의

본 개인정보 처리방침에 대한 문의사항은 GitHub 저장소의 이슈를 통해 연락해 주시기 바랍니다.

---

## 10. 동의

본 서비스를 이용함으로써 귀하는 이 개인정보 처리방침에 동의하는 것으로 간주됩니다.

---

**요약: 본 서비스는 사용자의 개인정보를 일체 수집, 저장, 처리하지 않습니다.**
`;
}

/**
 * 개인정보 처리방침 HTML 생성
 */
export function generatePrivacyHtml(baseUrl: string): string {
  const currentDate = new Date().toISOString().split('T')[0];

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>개인정보 처리방침 - 다이소 MCP API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f9fafb;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #111;
    }
    h2 {
      font-size: 1.25rem;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: #111;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
    }
    p { margin-bottom: 1rem; }
    ul {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
    }
    li { margin-bottom: 0.5rem; }
    .date { color: #666; margin-bottom: 2rem; }
    .highlight {
      background: #fef3c7;
      padding: 1rem;
      border-radius: 8px;
      border-left: 4px solid #f59e0b;
      margin: 1.5rem 0;
    }
    .summary {
      background: #d1fae5;
      padding: 1.5rem;
      border-radius: 8px;
      margin-top: 2rem;
      text-align: center;
      font-weight: 600;
      color: #065f46;
    }
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 2rem 0;
    }
    code {
      background: #f3f4f6;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <h1>개인정보 처리방침</h1>
  <p class="date"><strong>시행일자</strong>: ${currentDate}</p>

  <h2>1. 개요</h2>
  <p>본 개인정보 처리방침은 다이소 MCP API 서비스(이하 "서비스")의 개인정보 처리에 관한 사항을 안내합니다.</p>
  <p><strong>서비스 URL</strong>: <code>${baseUrl}</code></p>

  <h2>2. 수집하는 개인정보</h2>
  <div class="highlight">
    <strong>본 서비스는 어떠한 개인정보도 수집하지 않습니다.</strong>
  </div>
  <p>구체적으로 다음 정보를 수집, 저장, 처리하지 않습니다:</p>
  <ul>
    <li>이름, 이메일, 전화번호 등 개인 식별 정보</li>
    <li>IP 주소, 브라우저 정보 등 기기 식별 정보</li>
    <li>쿠키, 세션 정보</li>
    <li>위치 정보 (API 요청에 포함된 좌표는 처리 후 즉시 폐기)</li>
    <li>검색 기록 및 사용 패턴</li>
    <li>기타 모든 형태의 개인정보</li>
  </ul>

  <h2>3. 서비스 작동 방식</h2>
  <p>본 서비스는 다음과 같이 작동합니다:</p>
  <ul>
    <li><strong>무상태(Stateless) 처리</strong>: 모든 API 요청은 독립적으로 처리되며, 요청 간 사용자 정보를 저장하지 않습니다.</li>
    <li><strong>데이터 미보관</strong>: 요청 처리에 사용된 정보는 응답 후 즉시 폐기됩니다.</li>
    <li><strong>로그 미수집</strong>: 사용자 활동에 대한 로그를 기록하지 않습니다.</li>
    <li><strong>제3자 공유 없음</strong>: 어떠한 정보도 제3자에게 제공하지 않습니다.</li>
  </ul>

  <h2>4. 쿠키 및 추적 기술</h2>
  <div class="highlight">
    <strong>본 서비스는 쿠키나 추적 기술을 사용하지 않습니다.</strong>
  </div>
  <ul>
    <li>쿠키 설정 없음</li>
    <li>웹 비콘 없음</li>
    <li>분석 도구 없음</li>
    <li>광고 추적 없음</li>
  </ul>

  <h2>5. 제3자 서비스</h2>
  <p>본 서비스는 다이소 공식 API를 통해 제품 및 매장 정보를 조회합니다. 다이소 서비스 이용 시 다이소의 개인정보 처리방침이 적용될 수 있습니다.</p>

  <h2>6. 아동의 개인정보</h2>
  <p>본 서비스는 개인정보를 수집하지 않으므로, 아동의 개인정보 보호와 관련된 별도의 조치가 필요하지 않습니다.</p>

  <h2>7. 보안</h2>
  <p>개인정보를 수집하지 않으므로 보호할 개인정보가 없습니다. 다만, 서비스의 안정적인 운영을 위해 Cloudflare의 보안 인프라를 활용합니다.</p>

  <h2>8. 개인정보 처리방침의 변경</h2>
  <p>본 방침이 변경될 경우, 변경 사항을 이 페이지에 게시합니다.</p>

  <h2>9. 문의</h2>
  <p>본 개인정보 처리방침에 대한 문의사항은 GitHub 저장소의 이슈를 통해 연락해 주시기 바랍니다.</p>

  <h2>10. 동의</h2>
  <p>본 서비스를 이용함으로써 귀하는 이 개인정보 처리방침에 동의하는 것으로 간주됩니다.</p>

  <div class="summary">
    요약: 본 서비스는 사용자의 개인정보를 일체 수집, 저장, 처리하지 않습니다.
  </div>
</body>
</html>`;
}

/**
 * 개인정보 처리방침 HTML 응답 생성
 */
export function createPrivacyResponse(baseUrl: string): Response {
  const html = generatePrivacyHtml(baseUrl);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

/**
 * 개인정보 처리방침 텍스트 응답 생성
 */
export function createPrivacyTextResponse(baseUrl: string): Response {
  const text = generatePrivacyText(baseUrl);

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
