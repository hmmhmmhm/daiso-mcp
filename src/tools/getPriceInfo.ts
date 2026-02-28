// 가격 정보 조회 도구
export async function getPriceInfo(args: any) {
  const { productId } = args;

  // TODO: 실제 가격 데이터베이스와 연동
  // 현재는 목업 데이터를 반환합니다
  const mockPrices: Record<string, any> = {
    P001: {
      productId: 'P001',
      productName: '다용도 수납박스',
      currentPrice: 5000,
      originalPrice: 5000,
      discount: 0,
      currency: 'KRW',
      priceHistory: [
        { date: '2025-01-01', price: 5000 },
        { date: '2025-02-01', price: 5000 },
      ],
      lastUpdated: '2025-02-28T10:00:00Z',
    },
    P002: {
      productId: 'P002',
      productName: '볼펜 10입',
      currentPrice: 3000,
      originalPrice: 4000,
      discount: 25,
      currency: 'KRW',
      priceHistory: [
        { date: '2025-01-01', price: 4000 },
        { date: '2025-02-01', price: 3000 },
      ],
      lastUpdated: '2025-02-28T10:00:00Z',
    },
    P003: {
      productId: 'P003',
      productName: '주방 행주 5매',
      currentPrice: 2000,
      originalPrice: 2000,
      discount: 0,
      currency: 'KRW',
      priceHistory: [
        { date: '2025-01-01', price: 2000 },
        { date: '2025-02-01', price: 2000 },
      ],
      lastUpdated: '2025-02-28T10:00:00Z',
    },
  };

  const priceInfo = mockPrices[productId];
  if (!priceInfo) {
    throw new Error(`Product not found: ${productId}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(priceInfo, null, 2),
      },
    ],
  };
}
