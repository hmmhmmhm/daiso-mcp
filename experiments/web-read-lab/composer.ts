/** 외부 조회 없이 실제 링크 선택만으로 한글·영문 검색어를 전달하는 실험입니다. */
const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const ASCII = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'];
const TEXT = /^[가-힣a-zA-Z0-9 -]{0,32}$/;

export function renderComposer(parts: string[], requestId: string): string | null {
  if (parts.length < 3 || parts.length > 4) return null;
  let text: string;
  try {
    text = parts[2] === '~' ? '' : decodeURIComponent(parts[2]);
  } catch {
    return null;
  }
  if (!TEXT.test(text)) return null;
  const stage = parts[3] ?? '';
  const base = `/compose/${parts[1]}/`;
  const href = (value: string, next = '') =>
    `${base}${value ? encodeURIComponent(value) : '~'}${next ? `/${next}` : ''}`;
  const link = (label: string, value: string, next = '') =>
    `<a href="${href(value, next)}">${label}</a>`;
  const intro = `<h2>링크로 검색어 만들기</h2><p>가상 실험입니다. 실제 상품 조회가 아닙니다. 개인정보를 입력하지 마세요.</p><p>현재 입력: <strong>${text || '(비어 있음)'}</strong></p>`;
  if (stage === 'done') {
    if (!text.trim()) return null;
    return (
      intro +
      `<pre>${JSON.stringify({ synthetic: true, query: text, requestId, generatedAt: new Date().toISOString() }, null, 2)}</pre>` +
      `<h3>입력한 검색어로 실제 조회하기</h3><p>아래 링크는 별도 운영 서비스로 이동합니다. 링크를 열기 전에는 실제 상품이나 매장을 조회한 것이 아닙니다. 상품 검색 성공은 매장 재고 보유를 뜻하지 않습니다.</p><ul><li><a href="https://mcp.aka.page/browse/daiso/products/${encodeURIComponent(text)}/pageSize/3">실제 다이소 상품 검색</a></li><li><a href="https://mcp.aka.page/browse/daiso/stores/${encodeURIComponent(text)}">실제 다이소 매장 검색</a></li></ul><p>${link('입력 수정', text)}</p>`
    );
  }
  const choice = /^ko-(\d{1,2})(?:-(\d{1,2}))?$/.exec(stage);
  if (stage && !choice) return null;
  let options: string[];
  if (choice) {
    const initial = Number(choice[1]);
    const vowel = choice[2] === undefined ? undefined : Number(choice[2]);
    if (
      initial >= INITIALS.length ||
      (vowel !== undefined && vowel >= VOWELS.length) ||
      text.length >= 32
    )
      return null;
    options =
      vowel === undefined
        ? VOWELS.map((v, i) => link(`중성 ${v}`, text, `ko-${initial}-${i}`))
        : Array.from({ length: 28 }, (_, final) => {
            const character = String.fromCharCode(0xac00 + initial * 588 + vowel * 28 + final);
            return link(character, text + character);
          });
  } else {
    options =
      text.length >= 32
        ? []
        : [
            ...INITIALS.map((c, i) => link(`초성 ${c}`, text, `ko-${i}`)),
            ...ASCII.map((c) => link(c === ' ' ? '공백' : c, text + c)),
          ];
  }
  return (
    intro +
    '<p>한글은 초성, 중성, 완성 글자를 차례로 선택하세요. 영문과 숫자는 바로 선택합니다. URL을 조립하지 않고 실제 링크를 따라갈 수 있는지 확인하는 실험입니다. 최대32자.</p>' +
    `<ul>${options.map((option) => `<li>${option}</li>`).join('')}</ul><p>${link('현재 입력으로 돌아가기', text)} · ${link('한 글자 지우기', text.slice(0, -1))} · ${link('처음부터', '')}${text.trim() ? ` · ${link('입력 완료', text, 'done')}` : ''}</p>`
  );
}
