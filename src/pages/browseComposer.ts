/** 새 URL을 조립하지 않고 실제 링크만 선택하여 검색 조건을 입력합니다. */
const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const ASCII = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'];
const TEXT = /^[가-힣a-zA-Z0-9 -]{0,32}$/;

export function renderBrowseComposer(source: URL): string | null {
  if (source.pathname.length > 512) return null;
  for (const key of source.searchParams.keys()) {
    if (!key.startsWith('utm_') && key !== 'guide') return null;
  }
  const parts = source.pathname.split('/').filter(Boolean);
  if (parts.slice(0, 3).join('/') !== 'browse/compose/daiso') return null;
  const mode = parts[3];
  if (!['products', 'stores', 'inventory'].includes(mode)) return null;
  const rest = parts.slice(4);
  const productId = mode === 'inventory' ? rest.shift() : undefined;
  if (mode === 'inventory' && !/^[1-9][0-9]{0,19}$/.test(productId ?? '')) return null;
  if (rest.length < 1 || rest.length > 2) return null;
  let text: string;
  try {
    text = rest[0] === '~' ? '' : decodeURIComponent(rest[0]);
  } catch {
    return null;
  }
  if (!TEXT.test(text)) return null;
  const stage = rest[1] ?? '';
  const choice = /^ko-(\d{1,2})(?:-(\d{1,2}))?$/.exec(stage);
  if (stage && !choice) return null;
  const initial = choice ? Number(choice[1]) : 0;
  const vowel = choice?.[2] === undefined ? undefined : Number(choice[2]);
  if (
    choice &&
    (initial >= INITIALS.length ||
      (vowel !== undefined && vowel >= VOWELS.length) ||
      text.length >= 32)
  )
    return null;
  const base = `/browse/compose/daiso/${mode}${productId ? '/' + productId : ''}`;
  const href = (value: string, next = '') =>
    `${base}/${value ? encodeURIComponent(value) : '~'}${next ? '/' + next : ''}`;
  const link = (label: string, value: string, next = '') =>
    `<a href="${href(value, next)}">${label}</a>`;
  let options: string[];
  if (choice) {
    options =
      vowel === undefined
        ? VOWELS.map((v, i) => link(`중성 ${v}`, text, `ko-${initial}-${i}`))
        : Array.from({ length: 28 }, (_, final) => {
            const letter = String.fromCharCode(0xac00 + initial * 588 + vowel * 28 + final);
            return link(letter, text + letter);
          });
  } else {
    options =
      text.length >= 32
        ? []
        : [
            ...INITIALS.map((letter, i) => link(`초성 ${letter}`, text, `ko-${i}`)),
            ...ASCII.map((letter) => link(letter === ' ' ? '공백' : letter, text + letter)),
          ];
  }
  const title =
    mode === 'inventory'
      ? '재고를 찾을 매장 지역 선택'
      : mode === 'stores'
        ? '매장 검색어 선택'
        : '상품 검색어 선택';
  const query = encodeURIComponent(text);
  const target =
    mode === 'inventory'
      ? `/browse/daiso/inventory/${productId}/${query}/pageSize/3`
      : mode === 'stores'
        ? `/browse/daiso/stores/${query}/limit/3`
        : `/browse/daiso/products/${query}/pageSize/3`;
  return `<h1>${title}</h1>${productId ? `<p>선택한 상품 ID: <code>${productId}</code></p>` : ''}
<p>현재 입력: <strong>${text || '(비어 있음)'}</strong></p>
<p>아직 상품·매장·재고를 조회하지 않았습니다. 아래 실제 링크 ID로 이동하세요. URL을 직접 조립하지 마세요. 한글은 초성, 중성, 완성 글자를 차례로 선택하고 영문·숫자는 바로 선택합니다. 최대32자이며 개인정보는 입력하지 마세요.</p>
${text.trim() ? `<p><a href="${target}">입력한 검색어로 실제 조회</a></p>` : ''}
<ul>${options.map((option) => `<li>${option}</li>`).join('')}</ul>
<p>${link('현재 입력으로 돌아가기', text)} · ${link('한 글자 지우기', text.slice(0, -1))} · ${link('처음부터', '')}</p>`;
}
