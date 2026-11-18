import { getChatGPTUser } from '../../../../chatgpt-auth';
import { bucket, ownedAsset } from '../../../../../lib/m1/storage';
import { M1Error, m1Failure, parseRange } from '../../../../../lib/m1/files';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  const user = await getChatGPTUser(); if(!user) return Response.json({error:'请先登录'},{status:401});
  let size=0;
  try {
    const row=await ownedAsset(user.userId,(await context.params).id); size=row.sizeBytes;
    if(row.uploadStatus!=='ready') throw new M1Error(409,'此文件尚未上传完成');
    const range=parseRange(request.headers.get('range'),row.sizeBytes);
    const object=await bucket().get(row.objectKey,range?{range:{offset:range.offset,length:range.length}}:{});
    if(!object) throw new M1Error(503,'原件暂时不可用，请稍后重试');
    const disposition=new URL(request.url).searchParams.get('disposition')==='inline'?'inline':'attachment';
    const headers=new Headers({'Content-Type':'application/pdf','Content-Disposition':`${disposition}; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','X-Content-SHA256':row.sha256,'Content-Length':String(range?.length??row.sizeBytes)});
    if(range) headers.set('Content-Range',`bytes ${range.offset}-${range.end}/${row.sizeBytes}`);
    return new Response(object.body,{status:range?206:200,headers});
  } catch(e){if(e instanceof M1Error&&e.status===416)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`,'Cache-Control':'no-store'}});return m1Failure(e);}
}
