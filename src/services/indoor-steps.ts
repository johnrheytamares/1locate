import {Capacitor,registerPlugin} from '@capacitor/core';
import {IndoorStepSource as SharedStepSource,type StepApi} from '../../shared/indoor-step-source';
import {parseStrideProfile,type IndoorMeasurement,type StrideProfile} from '../../shared/indoor-tracking';
const native=registerPlugin<StepApi>('IndoorSteps');
export class IndoorStepSource extends SharedStepSource {constructor(){super({isNative:()=>Capacitor.isNativePlatform(),api:native});}}
export function readCalibration(user:string,method:IndoorMeasurement):StrideProfile|null{
  try{const raw=localStorage.getItem(`1locate:stride:${user}:${method}`);return raw?parseStrideProfile(JSON.parse(raw)):null;}catch{return null;}
}
export function saveCalibration(user:string,profile:StrideProfile){localStorage.setItem(`1locate:stride:${user}:${profile.method}`,JSON.stringify(parseStrideProfile(profile)));}
