/** 확인된 재고 성공만 짧게 저장하고 오류·미확인 수량은 캐시하지 않습니다. */
export async function shouldCacheSevenElevenInventory(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  try {
    const payload = await response.json() as {
      data?: { stockAvailable?: boolean; stockError?: unknown };
    } | null;
    return payload?.data?.stockAvailable === true && payload.data.stockError === null;
  } catch {
    return false;
  }
}
