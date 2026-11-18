import {and,eq,isNull,lt,ne,or} from 'drizzle-orm';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {getDb} from '../../../../../db';
import {resumeAssets} from '../../../../../db/schema';
import {ownedAsset,bucket,publicAsset} from '../../../../../lib/m1/storage';
import {M1Error,m1Failure} from '../../../../../lib/m1/files';
export const dynamic='force-dynamic';
function timeout<T>(promise:Promise<T>,milliseconds:number){let timer:ReturnType<typeof setTimeout>;return Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF 文字提取超时，请手动填写资料')),milliseconds);})]).finally(()=>clearTimeout(timer));}
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 try{
  const row=await ownedAsset(user.userId,(await context.params).id);if(row.uploadStatus!=='ready')throw new M1Error(409,'原件尚未上传完成');
  if(row.extractionStatus==='extracted')return Response.json({item:publicAsset(row,true)});
  const db=getDb(),started=new Date().toISOString(),stale=new Date(Date.now()-120000).toISOString();
  const lease=await db.update(resumeAssets).set({extractionStatus:'extracting',extractionStartedAt:started,extractionError:''}).where(and(eq(resumeAssets.id,row.id),eq(resumeAssets.ownerId,user.userId),or(ne(resumeAssets.extractionStatus,'extracting'),lt(resumeAssets.extractionStartedAt,stale),isNull(resumeAssets.extractionStartedAt)))).returning();
  if(!lease.length)throw new M1Error(409,'此原件正在提取文字，请稍后刷新');
  let text='',pages:number|null=null,extractionError='';
  let pdf:Awaited<ReturnType<typeof import('unpdf')['getDocumentProxy']>>|undefined;
  try{
   const object=await bucket().get(row.objectKey);if(!object)throw new Error('原件暂时不可用');
   const {getDocumentProxy}=await import('unpdf');
   pdf=await timeout(getDocumentProxy(new Uint8Array(await object.arrayBuffer()),{useSystemFonts:false,useWorkerFetch:false,disableFontFace:true,maxImageSize:1000000}),10000);
   pages=pdf.numPages;if(pages>20)throw new Error('超过 20 页，仅保留原件，请手动填写资料');
   for(let page=1;page<=pages;page++){const content=await timeout(pdf.getPage(page).then(p=>p.getTextContent()),10000);text+=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('')+'\n';if(text.length>100000)throw new Error('文字超过提取上限，请手动填写资料');}
   text=text.trim();if(text.length<10)throw new Error('未提取到足够文字，扫描件或特殊字体请手动填写');
  }catch(e){text='';const message=String(e instanceof Error?e.message:e);extractionError=/超过|上限|未提取|超时|原件暂时/.test(message)?message:'无法提取文字，文件可能加密、损坏或字体不支持；原件已保留，可手动填写';}
  finally{if(pdf)try{await pdf.loadingTask.destroy();}catch{/* Original remains available regardless of extraction cleanup. */}}
  await db.update(resumeAssets).set({extractionStatus:extractionError?'manual_required':'extracted',extractionText:text,extractionError,pageCount:pages}).where(and(eq(resumeAssets.id,row.id),eq(resumeAssets.ownerId,user.userId),eq(resumeAssets.extractionStartedAt,started)));
  return Response.json({item:publicAsset(await ownedAsset(user.userId,row.id),true)});
 }catch(e){return m1Failure(e);}
}
