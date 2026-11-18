import {getChatGPTUser} from '../../../chatgpt-auth';
import {jsonBody,submissionFailure} from '../../../../lib/submissions/service';
import {bucket} from '../../../../lib/m1/storage';
import {M1Error} from '../../../../lib/m1/files';
import * as adapter from '../../../../lib/browser-connector/adapter';
import * as connector from '../../../../lib/browser-connector/service';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先在此浏览器登录工作台'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{
  if(request.method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw new M1Error(403,'只接受工作台同源连接请求');
  const parts=(await context.params).path,path=parts.join('/'),post=request.method==='POST';let result:unknown;
  const body=async()=>jsonBody(request);
  if(!post&&path==='manage')result=await connector.manage(user.userId);
  else if(post&&path==='pairings/start')result=await connector.startPairing(user.userId,await body());
  else if(post&&path==='pairings/request')result=await connector.requestPairing(user.userId,await body());
  else if(post&&path==='pairings/status')result=await connector.pairStatus(user.userId,await body());
  else if(post&&parts[0]==='pairings'&&parts.length===3&&parts[2]==='approve')result=await connector.approvePairing(user.userId,parts[1],await body());
  else if(post&&parts[0]==='pairings'&&parts.length===3&&parts[2]==='cancel')result=await connector.cancelPairing(user.userId,parts[1],await body());
  else if(post&&parts[0]==='devices'&&parts.length===3&&parts[2]==='revoke')result=await connector.revokeDevice(user.userId,parts[1],await body());
  else if(post&&parts[0]==='tasks'&&parts.length===3&&parts[2]==='resume')result=await connector.resumeTask(user.userId,parts[1],await body());
  else if(parts[0]==='device'&&parts.length===2){
   const device=await connector.authenticateDevice(user.userId,request.headers.get('authorization'));
   if(!post&&path==='device/tasks')result=await connector.availableTasks(device);
   else if(post&&path==='device/revoke'){const input=await body();if(Object.keys(input||{}).length)throw new M1Error(422,'撤销不接收额外参数');result=await connector.revokeDevice(user.userId,device.id,{version:device.version});}
   else if(post&&path==='device/heartbeat')result=await connector.heartbeat(device,await body());
   else if(post&&path==='device/claim')result=await connector.claimTask(device,await body());
   else if(post&&path==='device/adapter-plan')result=await adapter.adapterPlan(device,await body());
   else if(post&&path==='device/adapter-start')throw new M1Error(409,'v1 暂停官网填表与上传，请在投递台账记录实际进度');
   else if(post&&path==='device/adapter-result')result=await adapter.finishAction(device,await body());
   else if(post&&path==='device/adapter-review')result=await adapter.reviewAction(device,await body());
   else if(post&&path==='device/materials')result=await connector.readMaterials(device,await body());
   else if(post&&path==='device/events')result=await connector.reportEvent(device,await body());
   else if(post&&path==='device/release')result=await connector.releaseTask(device,await body());
   else if(post&&path==='device/file'){
    const file=await connector.readFile(device,await body()),object=await bucket().get(file.objectKey);if(!object||object.size!==file.sizeBytes||object.customMetadata?.sha256!==file.sha256)throw new M1Error(503,'冻结原件暂时不可用');return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Length':String(file.sizeBytes),'X-Content-SHA256':file.sha256,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="resume.pdf"'}});
   }else return Response.json({error:'连接命令不存在'},{status:404});
  }else return Response.json({error:'连接命令不存在'},{status:404});
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return submissionFailure(error);}
}
export const GET=handle;export const POST=handle;
