/** 검색 조건의 실제 링크입니다. 상품·매장이나 재고 응답을 미리 만들지 않습니다. */
const PRODUCTS = [
  '수납박스',
  '물티슈',
  '건전지',
  '지갑',
  '충전기',
  '보조배터리',
  '케이블',
  '이어폰',
  '우산',
  '양말',
  '슬리퍼',
  '텀블러',
  '머그컵',
  '도시락',
  '지퍼백',
  '종이컵',
  '마스크',
  '핸드크림',
  '선크림',
  '화장솜',
  '면봉',
  '노트',
  '볼펜',
  '연필',
  '테이프',
  '스티커',
  '파우치',
  '쇼핑백',
  '휴지',
  '청소포',
  '세제',
  '핫식스',
];
const AREAS = [
  '강남역',
  '홍대입구역',
  '서울역',
  '잠실역',
  '건대입구역',
  '신촌역',
  '신림역',
  '사당역',
  '왕십리역',
  '합정역',
  '안산 중앙역',
  '상록수역',
  '수원역',
  '성남',
  '분당',
  '판교역',
  '인천',
  '부평역',
  '일산',
  '대전',
  '천안',
  '청주',
  '광주',
  '전주',
  '대구',
  '동대구역',
  '울산',
  '부산',
  '서면역',
  '창원',
  '춘천',
  '제주',
];
type Target = { mode: 'products' | 'stores' } | { mode: 'inventory'; productId: string };

export function renderQuickBrowseLinks(target: Target): string {
  const products = target.mode === 'products';
  const terms = products ? PRODUCTS : AREAS;
  const links = terms.map((term) => {
    const encoded = encodeURIComponent(term);
    const path =
      target.mode === 'inventory'
        ? `/browse/daiso/inventory/${target.productId}/${encoded}/pageSize/3`
        : products
          ? `/browse/daiso/products/${encoded}/pageSize/3`
          : `/browse/daiso/stores/${encoded}/limit/3`;
    return `<li><a href="${path}">${term}</a></li>`;
  });
  return `<section><h2>${products ? '빠른 상품 검색' : '빠른 지역 선택'}</h2><p>요청한 검색어·지역과 일치하는 항목을 통째로 선택하세요. 비슷한 다른 검색어로 바꾸지 마세요. 원하는 항목이 없으면 글자 입력을 사용하세요.</p><ul>${links.join('')}</ul></section>`;
}
