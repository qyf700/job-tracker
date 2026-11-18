import {z} from 'zod';
export const SITE_ORIGIN='https://job-tracker.example.invalid';
export {SCOPES,ACTIVE_STATES,CANCELLABLE_STATES,stateLabels} from './state.mjs';
export const leaseInput=z.object({taskId:z.string().uuid(),leaseId:z.string().uuid(),leaseSecret:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const eventInput=leaseInput.extend({version:z.number().int().positive(),eventId:z.string().uuid(),type:z.enum(['page_verified','needs_login','needs_verification','needs_consent','page_mismatch']),pageUrl:z.string().max(300).optional()}).strict();
export const targets={origin:'https://app.mokahr.com',path:'/campus_apply/zhihu/3818'};
export function targetPage(url:string,externalJobId:string){
 try{const parsed=new URL(url);if(parsed.origin!==targets.origin||parsed.pathname!==targets.path||parsed.username||parsed.password)return null;const path=parsed.hash.slice(1).split('?')[0];if(path!==`/job/${externalJobId}/apply`)return null;return `${targets.origin}${targets.path}#/job/${externalJobId}/apply`;}catch{return null;}
}
export function eventState(type:z.infer<typeof eventInput>['type']){return type==='page_verified'?'ready_for_adapter':type==='page_mismatch'?'needs_review':type;}
export function randomSecret(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
