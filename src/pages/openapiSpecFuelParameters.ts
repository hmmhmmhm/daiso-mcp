/** GPT Actions의 유가 조회 매개변수입니다. */
export const ACTION_FUEL_PARAMETERS = [
 {name:'fuelCode',in:'query',required:false,description:'유종 코드. B027=휘발유, D047=경유, B034=고급휘발유, C004=실내등유, K015=자동차부탄',schema:{type:'string'}},
 {name:'stationId',in:'query',required:false,description:'opinetGetStationDetail에 필요한 실제 주유소 ID. 검색 결과에서 얻습니다.',schema:{type:'string'}},
 {name:'count',in:'query',required:false,description:'최저가 주유소 반환 개수',schema:{type:'integer'}},
 {name:'radiusMeters',in:'query',required:false,description:'주변 주유소 검색 반경(m)',schema:{type:'integer'}},
 {name:'x',in:'query',required:false,description:'오피넷 KATEC X좌표. 보통은 location 또는 lat/lng를 사용하세요.',schema:{type:'number'}},
 {name:'y',in:'query',required:false,description:'오피넷 KATEC Y좌표. 보통은 location 또는 lat/lng를 사용하세요.',schema:{type:'number'}},
];
