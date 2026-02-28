// 매장 찾기 도구
export async function findStores(args: any) {
  const { latitude, longitude, radius = 5, limit = 10 } = args;

  // TODO: 실제 다이소 매장 데이터베이스와 연동
  // 현재는 목업 데이터를 반환합니다
  const mockStores = [
    {
      id: 'S001',
      name: '다이소 강남점',
      address: '서울시 강남구 테헤란로 123',
      latitude: 37.4979,
      longitude: 127.0276,
      phone: '02-1234-5678',
      hours: '10:00 - 22:00',
      distance: 1.2, // km
    },
    {
      id: 'S002',
      name: '다이소 홍대점',
      address: '서울시 마포구 양화로 456',
      latitude: 37.5563,
      longitude: 126.9236,
      phone: '02-2345-6789',
      hours: '10:00 - 23:00',
      distance: 3.4, // km
    },
    {
      id: 'S003',
      name: '다이소 신촌점',
      address: '서울시 서대문구 신촌로 789',
      latitude: 37.5559,
      longitude: 126.9363,
      phone: '02-3456-7890',
      hours: '10:00 - 22:00',
      distance: 4.8, // km
    },
  ];

  // 거리 계산 (간단한 유클리드 거리, 실제로는 Haversine 공식 사용 권장)
  const storesWithDistance = mockStores.map((store) => {
    const distance = Math.sqrt(
      Math.pow((store.latitude - latitude) * 111, 2) +
        Math.pow((store.longitude - longitude) * 88, 2)
    );
    return { ...store, distance: parseFloat(distance.toFixed(2)) };
  });

  // 반경 내 매장 필터링 및 정렬
  const nearbyStores = storesWithDistance
    .filter((store) => store.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            location: { latitude, longitude },
            radius,
            count: nearbyStores.length,
            stores: nearbyStores,
          },
          null,
          2
        ),
      },
    ],
  };
}
