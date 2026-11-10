import {expect,test} from 'vitest';
import {validateWalkingCheck,type WalkingValidation} from '../../src/services/walking-validation';
const valid=():WalkingValidation=>({version:1,profile:{version:1,method:'hardware-detector',distance:10,steps:20,stride:0.5,calibratedAt:new Date().toISOString()},independentSteps:20,checks:[{activity:'standing',durationMs:15000,steps:0},{activity:'rotating',durationMs:15000,steps:0},{activity:'shaking',durationMs:15000,steps:0}]});
test('requires independent walking counts and all three stationary checks',()=>{
 expect(validateWalkingCheck(valid()).profile.stride).toBe(0.5);
 for(const activity of ['standing','rotating','shaking']){const value=valid();value.checks.find(c=>c.activity===activity)!.steps=1;expect(()=>validateWalkingCheck(value)).toThrow('stationary');}
 expect(()=>validateWalkingCheck({...valid(),independentSteps:40})).toThrow('independently');
 const short=valid();short.checks[2].durationMs=100;expect(()=>validateWalkingCheck(short)).toThrow('stationary');
});
