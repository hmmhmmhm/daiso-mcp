import { buildAgentStartText } from './agentStart.js';

const BASE = 'https://mcp.aka.page';

/** 레지스트리 설명이 HTML로 해석되지 않도록 이스케이프합니다. */
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** 배포마다 현재 레지스트리에서 정적 발견 자산을 생성합니다. */
export function buildDiscoveryAssets(info: { services: { name: string }[]; tools: string[] }): Record<string, string> {
  const services = info.services.map((service) => escapeHtml(service.name)).join(' · ');
  const firstQuery = '/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&pageSize=3';
  return {
    'discovery.html': `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>다이소 MCP — 설치 없이 상품·매장·재고 조회</title>
<meta name="description" content="다이소, 편의점, 마트, 올리브영과 영화관을 조회하는 무료 공개 MCP. 설치나 사용자 API 키 없이 시작하세요.">
<meta name="robots" content="index,follow"><link rel="canonical" href="${BASE}/">
<link rel="alternate" type="text/plain" href="${BASE}/llms.txt" title="에이전트 시작 안내">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;line-height:1.7;color:#18222c;background:#fafafa}h1{line-height:1.3}a{color:#075bb5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf1f5;padding:16px;border-radius:8px}code{font-size:.9em}section{margin:32px 0}footer{border-top:1px solid #d8dee5;padding-top:20px}</style>
</head><body><main>
<h1>다이소 MCP</h1><p>설치 없이 상품·매장·재고와 영화관 정보를 조회하세요. 사용자 API 키나 로그인 없이 쓸 수 있는 공개 서비스입니다.</p>
<section><h2>바로 조회하기</h2><p><a href="${firstQuery}">다이소 수납박스 상품 3개 조회</a></p>
<p>위 링크는 공개 REST GET입니다. 검색한 상품의 실제 ID로 재고를 조회하세요. 상품 검색만으로 매장 재고를 단정하지 마세요.</p></section>
<section><h2>에이전트에서 설치 없이 사용하기</h2><p>원격 MCP 주소: <code>${BASE}</code><br>전송: Streamable HTTP · 인증: 없음</p>
<p>원격 MCP 클라이언트가 있으면 이 주소에 연결하고 <code>daiso_search_products</code>를 <code>{"query":"수납박스","pageSize":3}</code>으로 호출하세요.</p>
<p>HTTP POST나 셸이 있으면 아래 한 요청으로 첫 조회를 실행할 수 있습니다.</p>
<pre><code>curl --max-time 20 -sS -N ${BASE}/ \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"daiso_search_products","arguments":{"query":"수납박스","pageSize":3}}}'</code></pre>
<p>웹 읽기 기능으로 이 페이지를 읽는 것만으로 MCP 연결이 생기지는 않습니다. GET만 가능한 에이전트는 위 REST 링크를 사용하세요. 오류를 상품 없음으로 해석하지 마세요.</p>
<p><a href="/llms.txt">짧은 시작 안내</a> · <a href="/prompt">전체 API 사용 안내</a> · <a href="/root.json">현재 서비스·도구 목록 JSON</a></p></section>
<section><h2>지원 서비스</h2><p>${services}</p></section>
<footer><a href="https://github.com/hmmhmmhm/daiso-mcp">GitHub 문서와 소스</a> · <a href="/privacy">개인정보 처리방침</a></footer>
</main></body></html>\n`,
    'root.json': JSON.stringify(info, null, 2) + '\n',
    'llms.txt': buildAgentStartText(BASE),
    'robots.txt': '# 공개 검색 및 AI 에이전트의 읽기를 허용합니다.\n' +
      ['*', 'ChatGPT-User', 'OAI-SearchBot', 'GPTBot', 'CCBot', 'anthropic-ai', 'Claude-Web',
        'Claude-User', 'Claude-SearchBot', 'Google-Extended', 'PerplexityBot', 'Perplexity-User', 'Applebot-Extended']
        .map((bot) => `User-agent: ${bot}\nAllow: /\n`).join('\n') +
      `\nSitemap: ${BASE}/sitemap.xml\n# 에이전트 안내: ${BASE}/llms.txt\n`,
    'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ['/', '/llms.txt', '/prompt', '/root.json', '/privacy']
        .map((path) => `<url><loc>${BASE}${path}</loc></url>`).join('\n') + '\n</urlset>\n',
    '_headers': '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n  X-Content-Type-Options: nosniff\n',
  };
}
