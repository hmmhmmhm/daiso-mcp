/** 컬렉션별 검색 페이지의 합계와 상품 진행 상태를 검증합니다. */
interface SearchCollection {
  CollectionId?: string;
  Documentset?: { totalCount?: number; Document?: unknown[] };
}
interface CollectionProgress {
  total: number;
  received: number;
  identities: Set<string>;
}
const incomplete = () => new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다');
function documentIdentity(document: unknown): string {
  const record = (document || {}) as Record<string, unknown>;
  const field = (record.field || record) as Record<string, unknown>;
  return String(field.itemCd || field.prdNo || field.itemOnm || JSON.stringify(document));
}
export class SevenElevenSearchPagination {
  readonly documents: unknown[] = [];
  readonly collectionIds = new Set<string>();
  private readonly collections = new Map<string, CollectionProgress>();
  private initialized = false;

  append(collections: SearchCollection[]): boolean {
    const present = new Set<string>();
    for (const collection of collections) {
      const id = collection.CollectionId || '';
      if (present.has(id)) throw incomplete();
      present.add(id);
      if (!collection.Documentset || !Array.isArray(collection.Documentset.Document))
        throw incomplete();
      const total = collection.Documentset.totalCount;
      if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) throw incomplete();
      let progress = this.collections.get(id);
      if (!progress) {
        if (this.initialized) throw incomplete();
        progress = { total, received: 0, identities: new Set() };
        this.collections.set(id, progress);
        if (id) this.collectionIds.add(id);
      }
      if (progress.total !== total) throw incomplete();
      const documents = collection.Documentset.Document;
      const identities = documents.map(documentIdentity);
      if (new Set(identities).size !== identities.length) throw incomplete();
      // 컬렉션 사이의 중복은 허용하되 이전 원본 페이지 상품의 반복은 거절합니다.
      if (identities.some((identity) => progress.identities.has(identity))) throw incomplete();
      if (progress.received + documents.length > total) throw incomplete();
      progress.received += documents.length;
      for (const identity of identities) progress.identities.add(identity);
      this.documents.push(...documents);
    }
    this.initialized = true;
    if ([...this.collections.values()].reduce((sum, progress) => sum + progress.total, 0) > 500) {
      throw new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다: 최대 500개 제한');
    }
    for (const [id, progress] of this.collections) {
      if (
        progress.received < progress.total &&
        (!present.has(id) ||
          !collections.find((c) => (c.CollectionId || '') === id)?.Documentset?.Document?.length)
      )
        throw incomplete();
    }
    return [...this.collections.values()].every((progress) => progress.received === progress.total);
  }
}
