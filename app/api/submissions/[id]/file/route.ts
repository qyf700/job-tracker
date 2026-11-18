import {getChatGPTUser} from '../../../../chatgpt-auth';
import {frozenFile,submissionFailure} from '../../../../../lib/submissions/service';
import {bucket} from '../../../../../lib/m1/storage';
import {M1Error,parseRange} from '../../../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});let size=0;
 try{const file=await frozenFile(user.userId,(await context.params).id);size=file.sizeBytes;const range=parseRange(request.headers.get('range'),size);const object=await bucket().get(file.objectKey,range?{range:{offset:range.offset,length:range.length}}:{});if(!object||object.customMetadata?.sha256!==file.sha256)throw new M1Error(503,'快照原件暂时不可用');const headers=new Headers({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(file.originalName).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','X-Content-SHA256':file.sha256,'Content-Length':String(range?.length??size)});if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.end}/${size}`);return new Response(object.body,{status:range?206:200,headers});
 }catch(e){if(e instanceof M1Error&&e.status===416)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});return submissionFailure(e);}
}
