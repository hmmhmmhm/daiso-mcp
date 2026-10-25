const stores = [{ storeCode: 's1', storeName: '강남점' }];
export const inventoryPayloads: Record<string, Record<string, unknown>> = {
  gs25_check_inventory: {
    keyword: '콜라',
    itemCode: 'p1',
    inventory: { count: 1, stores: [{ ...stores[0], realStockQuantity: 0 }] },
  },
  seveneleven_check_inventory: {
    keyword: '커피',
    product: { itemCode: 'p1', itemName: '커피' },
    stockAvailable: true,
    inventory: { count: 1, stores: [{ ...stores[0], stockQuantity: 0 }] },
  },
  emart24_check_inventory: {
    keyword: '커피',
    pluCd: 'p1',
    inventory: { count: 1, stores: [{ bizNo: 's1', storeName: '강남점', bizQty: 0 }] },
  },
  cu_check_inventory: {
    keyword: '커피',
    inventory: { available: true, items: [{ itemCode: 'p1', itemName: '커피' }] },
    nearbyStores: {
      available: true,
      stockItemCode: 'p1',
      stockItemName: '커피',
      count: 1,
      stores: [{ ...stores[0], stock: 0 }],
    },
  },
  oliveyoung_check_inventory: {
    keyword: '선크림',
    inventory: {
      stockCheckedCount: 1,
      products: [
        {
          goodsNumber: 'p1',
          goodsName: '선크림',
          stockSource: 'nearby_store',
          stockStatus: 'out_of_stock',
          storeInventory: {
            stores: [{ ...stores[0], remainQuantity: 0, stockStatus: 'out_of_stock' }],
          },
        },
      ],
    },
  },
};
