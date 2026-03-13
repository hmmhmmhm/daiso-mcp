# GS25 New Blutter Signal Summary

- 입력 디렉터리: `tmp/gs25-static/blutter-out-gs25`
- 생성 시각(로컬): `2026-03-13T11:21:15.810Z`

## 1) 핵심 신호

- `ApiResponseEncryptionUtility::createEncrypter`: yes
- `Encrypter::decrypt64`: yes
- `Encrypter::encryptBytes`: yes
- `b2c_api_interface.dart` 존재: yes
- `getWoodongsUserInfo` 흔적: yes

## 2) 환경/상수 후보

- `B2C_API_URL`
- `B2C_REFRIGERATOR_API_URL`
- `B2C_SUPERMARKET_API_URL`
- `B2C_THEPOP_API_URL`
- `M_WOODONGS_WEB_URL`

## 3) 키 후보(길이>=32)

- `gs25ReserveSpecialSellItemDetail`
- `NUE97O2A2KxIANauwqJ6m8MXiz7KY7FN`
- `TNldfnGlVWAsvE4VmZnw0jSK8+m/0eCT`

- 총 3개 (문서에는 최대 20개만 표시)

## 4) 엔드포인트 후보

### refrigerator

- `/api/bff/v1/ads/banners/refrigerator`
- `/api/bff/v1/myRefrigerator`
- `/api/bff/v1/myRefrigerator/service`
- `/refrigerator/v1/delivery/address/`
- `/refrigerator/v1/delivery/address/0`
- `/refrigerator/v1/delivery/order/`
- `/refrigerator/v1/disability/stores/`
- `/refrigerator/v1/disability/stores/help-bell`
- `/refrigerator/v1/giftbox/gift/group`
- `/refrigerator/v1/giftbox/gift/receive/valid`
- `/refrigerator/v1/giftbox/gifts/received/thank/message`
- `/refrigerator/v1/giftbox/storage/box/coupon/`
- `/refrigerator/v1/giftbox/storage/box/gift/card`
- `/refrigerator/v1/giftbox/storage/box/gift/contents`
- `/refrigerator/v1/giftbox/storage/box/send`
- `/refrigerator/v1/grm/shopping/cancle/refund/amount`
- `/refrigerator/v1/grm/shopping/payment/finish/delivery/`
- `/refrigerator/v1/reservation/special/sell/event/items`
- `/refrigerator/v1/review/template/STORE`
- `/refrigerator/v1/search/storage/item`
- `/refrigerator/v1/shopping/basket`
- `/refrigerator/v1/shopping/basket/`
- `/refrigerator/v1/shopping/basket/order`
- `/refrigerator/v1/shopping/basket/re_registration`
- `/refrigerator/v1/shopping/basket/registration`
- `/refrigerator/v1/shopping/lunchbox/`
- `/refrigerator/v1/shopping/lunchbox/basket`
- `/refrigerator/v1/shopping/lunchbox/order`
- `/refrigerator/v1/shopping/lunchbox/pickup/day`
- `/refrigerator/v1/shopping/lunchbox/purchase`
- `/refrigerator/v1/shopping/lunchbox/reservation`
- `/refrigerator/v1/shopping/lunchbox/reservation/orders`
- `/refrigerator/v1/shopping/lunchbox/tender/possible/datetime`
- `/refrigerator/v1/shopping/mobile/coupon/item`
- `/refrigerator/v1/shopping/mobile/coupon/spec/item`
- `/refrigerator/v1/shopping/mobile/coupon/spec/period`
- `/refrigerator/v1/shopping/order/number`
- `/refrigerator/v1/shopping/payment/finish/delivery`
- `/refrigerator/v1/shopping/pickup/completed/convenience-store/items`
- `/refrigerator/v1/shopping/pickup/convenience-store/items`
- `/refrigerator/v1/shopping/purchase/restr`
- `/refrigerator/v1/shopping/reservation/basket`
- `/refrigerator/v1/shopping/reservation/basket/delivery`
- `/refrigerator/v1/shopping/reservation/delivery/basket`
- `/refrigerator/v1/shopping/reservation/delivery/item`
- `/refrigerator/v1/shopping/reservation/delivery/purchase`
- `/refrigerator/v1/shopping/reservation/special/basket`
- `/refrigerator/v1/shopping/retrieveBuyLrResvInfo`
- `/refrigerator/v1/shopping/special/main/sell/items`
- `/refrigerator/v1/shopping/special/sell/items/detail`

### woodongs/bff

- `/api/bff/v4/auth/getWoodongsUserInfo`

- 전체 URL 후보: 197개
