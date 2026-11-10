import {beforeEach,expect,test,vi} from 'vitest';
import {createRecording} from '../../shared/gps-recording';
const mocks=vi.hoisted(()=>({upsert:vi.fn(),rpc:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({requireClient:()=>({from:()=>({upsert:mocks.upsert}),rpc:mocks.rpc})}));
import {saveRecording,publishRecording} from '../src/services/outdoor-recordings';
beforeEach(()=>{vi.clearAllMocks();mocks.upsert.mockResolvedValue({error:null});});
test('a private recording is saved with matching row and JSON status and never published by saving',async()=>{
 const r=createRecording('r','b','IT',{latitude:0,longitude:0});await saveRecording(r,'user');expect(mocks.upsert.mock.calls[0][0]).toMatchObject({owner_id:'user',status:'saved',recording:{status:'saved'}});expect(mocks.rpc).not.toHaveBeenCalled();expect(r.status).toBe('draft');
});
test('a failed synchronization throws and leaves the local recording untouched',async()=>{
 const r=createRecording('r','b','IT',{latitude:0,longitude:0});mocks.upsert.mockResolvedValueOnce({error:new Error('offline')});await expect(saveRecording(r,'user')).rejects.toThrow('offline');expect(r.status).toBe('draft');
});
test('draft geometry cannot reach the publication RPC',async()=>{
 const r=createRecording('r','b','IT',{latitude:0,longitude:0});const nodes=[{id:'a',name:'a',latitude:0,longitude:0,entrance:false},{id:'b',name:'b',latitude:0,longitude:0.001,entrance:true}];await expect(publishRecording(r,{version:1,verified:false,nodes,edges:[{from:'a',to:'b',meters:120,open:true,accessible:false,oneWay:false,validation:'draft'}]})).rejects.toThrow('validated');expect(mocks.rpc).not.toHaveBeenCalled();
});
