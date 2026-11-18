// Isolated world only. No window messages, DOM credential storage, external
// messaging, arbitrary URLs or generic proxy capabilities are exposed.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||message?.type!=='JT_CONNECTOR_API')return;
 const site='https://job-tracker.example.invalid';
 const allowed=(message.method==='GET'&&message.path==='device/tasks')||(message.method==='POST'&&/^(pairings\/(request|status)|device\/(heartbeat|claim|materials|file|events|release|revoke|adapter-plan|adapter-start|adapter-result|adapter-review))$/.test(message.path));
 if(location.origin!==site||location.pathname!=='/'||!allowed){respond({ok:false,status:403,error:'桥接请求不在允许范围'});return;}
 void(async()=>{try{
  const response=await fetch('/api/browser-connector/'+message.path,{method:message.method,credentials:'include',redirect:'error',headers:{...(message.method==='POST'?{'Content-Type':'application/json'}:{}),...(message.authorization?{Authorization:message.authorization}:{})},body:message.method==='POST'?JSON.stringify(message.body||{}):undefined,cache:'no-store'});
  if(message.binary&&response.ok){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>5*1024*1024)throw new Error('原件超过读取上限');let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));respond({ok:true,status:response.status,binary:btoa(text),sha256:response.headers.get('X-Content-SHA256')});return;}
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('请在本浏览器登录工作台并刷新标签页');const data=await response.json();respond({ok:response.ok,status:response.status,data,error:response.ok?undefined:data.error||'请求失败'});
 }catch{respond({ok:false,status:0,error:'工作台连接失败，请确认已登录并保持工具标签页打开'});}})();return true;
});
