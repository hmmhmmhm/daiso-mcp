import { buildAgentStartText, WEB_READ_RULE, ROUTE_SELECTION_TEXT, IMAGE_SOURCE_RULE, EXECUTION_EVIDENCE_RULE, AGENT_GUIDE_STAMP, WEB_SEARCH_DESCRIPTION, AGENT_GUIDE_PATH, HTML_GUIDE_QUERY, AGENT_GUIDE_VERSION } from './agentStart.js';

const BASE = 'https://mcp.aka.page';

/** 레지스트리 설명이 HTML로 해석되지 않도록 이스케이프합니다. */
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** 배포마다 현재 레지스트리에서 정적 발견 자산을 생성합니다. */
export function buildDiscoveryAssets(info: { services: { name: string }[]; tools: string[] }): Record<string, string> {
  const services = info.services.map((service) => escapeHtml(service.name)).join(' · ');
  const firstQuery = '/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&pageSize=3&format=html' + HTML_GUIDE_QUERY;
  return {
    'discovery.html': `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DAISO MCP: 설치 없이 상품·매장·재고 조회</title>
<meta name="description" content="${escapeHtml(WEB_SEARCH_DESCRIPTION)}">
<meta name="robots" content="index,follow"><link rel="canonical" href="${BASE}/">
<link rel="alternate" type="text/plain" href="${BASE}${AGENT_GUIDE_PATH}" title="에이전트 시작 안내">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;line-height:1.7;color:#18222c;background:#fafafa}h1{line-height:1.3}a{color:#075bb5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf1f5;padding:16px;border-radius:8px}code{font-size:.9em}section{margin:32px 0}footer{border-top:1px solid #d8dee5;padding-top:20px}</style>
</head><body><main>
<h1>DAISO MCP</h1><p>${escapeHtml(AGENT_GUIDE_STAMP)} · <a href="${AGENT_GUIDE_PATH}">현재 버전 안내</a> · <a href="/guide/latest">항상 최신 안내로 이동</a></p><p>설치 없이 상품·매장·재고와 영화관 정보를 조회하세요. 사용자 API 키나 로그인 없이 쓸 수 있는 공개 서비스입니다.</p>
<p>${escapeHtml(WEB_SEARCH_DESCRIPTION)}</p>
<p><strong>${escapeHtml(WEB_READ_RULE)}</strong></p>
<section><h2>바로 조회하기</h2><p><a href="${escapeHtml(firstQuery)}">다이소 수납박스 상품 3개 조회</a></p>
<p>위 링크는 셸·설치 없이 웹 읽기로 호출하는 공개 REST GET의 HTML 결과입니다. 다른 공개 GET 조회도 기존 파라미터에 <code>format=html</code>을 추가하세요. 검색한 상품의 실제 ID로 재고를 조회하세요. 상품 검색만으로 매장 재고를 단정하지 마세요.</p></section>
<section><h2>에이전트에서 설치 없이 사용하기</h2><p>원격 MCP 주소: <code>${BASE}</code><br>전송: Streamable HTTP · 인증: 없음</p>
<p>${escapeHtml(ROUTE_SELECTION_TEXT).replaceAll('\n', '<br>')}</p>
<p><strong>${escapeHtml(IMAGE_SOURCE_RULE)}</strong></p>
<p>${escapeHtml(EXECUTION_EVIDENCE_RULE)}</p>
<p>웹 읽기 기능으로 이 페이지를 읽는 것만으로 MCP 연결이 생기지는 않습니다. 연결된 MCP 도구가 없고 웹 읽기가 가능하면 셸 유무와 무관하게 위 HTML REST 링크를 바로 여세요. 오류를 상품 없음으로 해석하지 마세요.</p>
<p><a href="${AGENT_GUIDE_PATH}">짧은 시작 안내 (현재 버전)</a> · <a href="/prompt?guide=${AGENT_GUIDE_VERSION}">전체 API 사용 안내</a> · <a href="/root.json">개발자용 서비스·도구 목록 JSON</a></p></section>
<section><h2>지원 서비스</h2><p>${services}</p></section>
<footer><a href="https://github.com/hmmhmmhm/daiso-mcp">GitHub 문서와 소스</a> · <a href="/privacy">개인정보 처리방침</a></footer>
</main></body></html>\n`,
    'root.json': JSON.stringify(info, null, 2) + '\n',
    'llms.txt': buildAgentStartText(BASE),
    'robots.txt': '# 공개 검색 및 AI 에이전트의 읽기를 허용합니다.\n' +
      ['*', 'ChatGPT-User', 'OAI-SearchBot', 'GPTBot', 'CCBot', 'anthropic-ai', 'Claude-Web',
        'Claude-User', 'Claude-SearchBot', 'Google-Extended', 'PerplexityBot', 'Perplexity-User', 'Applebot-Extended']
        .map((bot) => `User-agent: ${bot}\nAllow: /\n`).join('\n') +
      `\nSitemap: ${BASE}/sitemap.xml\n# 에이전트 안내: ${BASE}${AGENT_GUIDE_PATH}\n# 최신 안내 연결: ${BASE}/guide/latest\n`,
    'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ['/', AGENT_GUIDE_PATH, '/guide/latest', '/llms.txt', '/prompt', '/root.json', '/privacy']
        .map((path) => `<url><loc>${BASE}${path}</loc></url>`).join('\n') + '\n</urlset>\n',
    '_headers': '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n  X-Content-Type-Options: nosniff\n/llms.txt\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-store\n/discovery.html\n  Cache-Control: no-store\n/robots.txt\n  Content-Type: text/plain; charset=utf-8\n',
  };
}
