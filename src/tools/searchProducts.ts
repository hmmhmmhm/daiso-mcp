// 제품 검색 도구
export async function searchProducts(args: any) {
  const { query, category, maxPrice } = args;

  // TODO: 실제 다이소 API 또는 데이터베이스와 연동
  // 현재는 목업 데이터를 반환합니다
  const mockProducts = [
    {
      id: 'P001',
      name: '다용도 수납박스',
      category: '주방/생활',
      price: 5000,
      description: '투명 플라스틱 수납박스',
      inStock: true,
    },
    {
      id: 'P002',
      name: '볼펜 10입',
      category: '문구',
      price: 3000,
      description: '0.5mm 흑색 볼펜 세트',
      inStock: true,
    },
    {
      id: 'P003',
      name: '주방 행주 5매',
      category: '주방/생활',
      price: 2000,
      description: '극세사 주방 행주',
      inStock: false,
    },
  ];

  // 검색 필터링
  let results = mockProducts.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase())
  );

  if (category) {
    results = results.filter((product) => product.category === category);
  }

  if (maxPrice) {
    results = results.filter((product) => product.price <= maxPrice);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            query,
            filters: { category, maxPrice },
            count: results.length,
            products: results,
          },
          null,
          2
        ),
      },
    ],
  };
}
