import { afterEach, expect, it, vi } from 'vitest';
import { buildActionQueryTargetUrl } from '../../src/api/actionsProxy.js';
import { generateOpenApiSpec } from '../../src/pages/openapiSpec.js';
import app from '../../src/index.js';
afterEach(()=>vi.unstubAllGlobals());
const mappings=[['daisoJpSearchProducts','/api/daiso-jp/products'],['daisoJpGetProduct','/api/daiso-jp/products/4550746075917'],['daisoJpFindStores','/api/daiso-jp/stores'],['opinetGetAveragePrices','/api/opinet/average'],['opinetGetLowestPriceStations','/api/opinet/lowest'],['opinetSearchStationsAround','/api/opinet/stations/around'],['opinetGetStationDetail','/api/opinet/station']];
it.each(mappings)('%s는 기존 조회 경로에 안전하게 연결된다',(action,path)=>{
 const url=buildActionQueryTargetUrl('https://example.com/api/actions/query?'+new URLSearchParams({action,productId:'4550746075917',q:'ボウル',stationId:'A1',fuelCode:'B027',count:'3',radiusMeters:'1000',x:'314681.8',y:'544837'}));
 expect(url.pathname).toBe(path);expect(url.origin).toBe('https://example.com');expect(url.searchParams.get('action')).toBeNull();expect(url.searchParams.get('fuelCode')).toBe('B027');
});
it('GPT Actions는 한 개 operation과 신규 조회에 필요한 스키마를 유지한다',()=>{
 const spec=generateOpenApiSpec('https://example.com');expect(Object.keys(spec.paths)).toEqual(['/api/actions/query']);
 const op=spec.paths['/api/actions/query'].get;expect(op.operationId).toBe('queryAction');
 const fields=op.parameters.map(p=>p.name);for(const key of ['fuelCode','stationId','count','radiusMeters','x','y','productId','q','keyword','lat','lng','location'])expect(fields).toContain(key);
 const actions=op.parameters.find(p=>p.name==='action')!.schema.enum!;for(const [action] of mappings)expect(actions).toContain(action);expect(actions.some((name:string)=>name.startsWith('lottemart'))).toBe(false);
});
it('일본 상세 Actions는 실제 기존 상세 핸들러와 중계를 사용한다',async()=>{
 const fetcher=vi.fn(async()=>Response.json({handle:'4550746075917',title:'ボウル',price:22000,available:true}));vi.stubGlobal('fetch',fetcher);
 const r=await app.request('/api/actions/query?action=daisoJpGetProduct&productId=4550746075917',undefined,{DAISO_JP_PRODUCT_RELAY_ENABLED:'true',DTRYX_RELAY_URL:'https://relay.example',DTRYX_RELAY_TOKEN:'fixture-token'});
 expect(r.status).toBe(200);expect((await r.json()).data).toMatchObject({country:'JP',id:'4550746075917',currency:'JPY',price:220,onlineAvailable:true,storeInventorySupported:false});
 expect(fetcher.mock.calls[0][0]).toBe('https://relay.example/v1/dtryx/daiso-jp-product');
});
it('유가 Actions는 기존 평균 유가 핸들러를 실행한다',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({RESULT:{OIL:[{PRODCD:'B027',PRODNM:'휘발유',PRICE:'1667'}]}})));
 const r=await app.request('/api/actions/query?action=opinetGetAveragePrices',undefined,{OPINET_API_KEY:'fixture-key'});expect(r.status).toBe(200);expect((await r.json()).data.prices[0].productName).toBe('휘발유');
});
