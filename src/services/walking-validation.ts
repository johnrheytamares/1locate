import {calibrateStride,parseStrideProfile,type StrideProfile,type IndoorMeasurement} from '../../shared/indoor-tracking';
export const WALKING_VALIDATION_KEY='1locate.walking-validation.v1';
export interface WalkingValidation {version:1;profile:StrideProfile;independentSteps:number;checks:{activity:'standing'|'rotating'|'shaking';durationMs:number;steps:number}[]}
export function validateWalkingCheck(value:WalkingValidation):WalkingValidation {
 if(!value||value.version!==1)throw new Error('Repeat the walking check.');
 const p=parseStrideProfile(value.profile);
 if(!Number.isInteger(value.independentSteps)||value.independentSteps<8||p.steps<8||p.distance<5||Math.abs(p.steps-value.independentSteps)>Math.max(1,value.independentSteps*0.1))throw new Error('Detected steps do not match the independently counted walk. Use manual steps or repeat the check.');
 for(const activity of ['standing','rotating','shaking']){
  const check=value.checks.find(c=>c.activity===activity);
  if(!check||!Number.isFinite(check.durationMs)||check.durationMs<15000||check.steps!==0)throw new Error('The phone credited steps while stationary, or the stationary check is incomplete. Use manual steps.');
 }
 return {...value,profile:calibrateStride(p.distance,p.steps,p.method,p.calibratedAt)};
}
export function readWalkingValidation(method:IndoorMeasurement):WalkingValidation|null {
 try{const raw=localStorage.getItem(WALKING_VALIDATION_KEY);if(!raw)return null;const v=validateWalkingCheck(JSON.parse(raw));return v.profile.method===method?v:null;}catch{return null;}
}
export function readSavedWalkingStride():number|null {
 try{const raw=localStorage.getItem(WALKING_VALIDATION_KEY);if(!raw)return null;return validateWalkingCheck(JSON.parse(raw)).profile.stride;}catch{return null;}
}
export function clearWalkingValidation(){try{localStorage.removeItem(WALKING_VALIDATION_KEY);}catch{/* Manual step controls remain available. */}}
