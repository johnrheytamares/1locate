import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),remote:vi.fn(),client:{}}));
vi.mock('../../shared/route-drafts',()=>({readRouteDraft:mocks.read,writeRouteDraft:mocks.write}));
vi.mock('@/services/supabase',()=>({get supabase(){return mocks.client;}}));
const graph = {version:1,verified:true,nodes:[{id:'s',name:'Start',latitude:0,longitude:0,entrance:false},{id:'e',name:'Entrance',latitude:0,longitude:0.001,entrance:true}],edges:[{from:'s',to:'e',meters:120,open:true,oneWay:false,accessible:false}]};
const pkg=(revision=1)=>({schemaVersion:1,revision,publishedAt:'2026-11-10T01:00:00Z',graph});
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();mocks.read.mockResolvedValue(null);mocks.write.mockResolvedValue(undefined);mocks.client={from:()=>({select:()=>({order:()=>({limit:()=>({abortSignal:()=>({maybeSingle:mocks.remote})})})})})};mocks.remote.mockResolvedValue({data:null,error:null});vi.stubGlobal('navigator',{onLine:true});});
afterEach(()=>vi.unstubAllGlobals());
test('downloads only a published package, caches it, and loads the same network after a process restart offline',async()=>{
 mocks.remote.mockResolvedValueOnce({data:{revision:2,published_at:pkg(2).publishedAt,graph},error:null});
 const {loadOutdoorNetwork}=await import('@/services/route-package-cache');expect(await loadOutdoorNetwork(new AbortController().signal)).toEqual(graph);expect(mocks.write).toHaveBeenCalledWith('public-outdoor-network-package',pkg(2));
 vi.resetModules();mocks.read.mockResolvedValueOnce(pkg(2));vi.stubGlobal('navigator',{onLine:false});const offline=await import('@/services/route-package-cache');expect(await offline.loadOutdoorNetwork(new AbortController().signal)).toEqual(graph);expect(mocks.remote).toHaveBeenCalledTimes(1);
});
test('malformed remote data and older revisions cannot replace a valid cached network',async()=>{
 mocks.read.mockResolvedValue(pkg(3));mocks.remote.mockResolvedValueOnce({data:{revision:4,published_at:pkg().publishedAt,graph:{...graph,verified:false}},error:null});
 const service=await import('@/services/route-package-cache');expect(await service.loadOutdoorNetwork(new AbortController().signal)).toEqual(graph);expect(mocks.write).not.toHaveBeenCalled();
});
test('offline first launch with no downloaded package uses bundled data rather than a draft',async()=>{
 vi.stubGlobal('navigator',{onLine:false});const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>graph});vi.stubGlobal('fetch',fetch);
 const service=await import('@/services/route-package-cache');expect(await service.loadOutdoorNetwork(new AbortController().signal)).toEqual(graph);expect(fetch).toHaveBeenCalledWith('/campus-walking-network.json',expect.anything());expect(mocks.remote).not.toHaveBeenCalled();
});
test('cancelled sessions never use a cached route',async()=>{
 mocks.read.mockResolvedValue(pkg());const controller=new AbortController();controller.abort();const service=await import('@/services/route-package-cache');await expect(service.loadOutdoorNetwork(controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
test('corrupt cache and failed bundled reads fail clearly when there is no verified package',async()=>{
 mocks.read.mockResolvedValue({schemaVersion:1,revision:0});vi.stubGlobal('navigator',{onLine:false});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));const service=await import('@/services/route-package-cache');await expect(service.loadOutdoorNetwork(new AbortController().signal)).rejects.toThrow('could not load');
});
