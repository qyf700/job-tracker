"use client";
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist';
import {Button} from '@/components/ui/button';

// Loaded only in the browser; all library/worker/font assets are served by this Site.
export function PdfPreview({id}:{id:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true),[rendering,setRendering]=useState(false),[error,setError]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(480);
 useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(200,Math.floor(entries[0].contentRect.width)-24)));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let cancelled=false,task:PDFDocumentLoadingTask|undefined;setPdf(null);setPage(1);setZoom(1);setLoading(true);setError('');
  void(async()=>{try{
   const moduleUrl='/pdfjs/pdf.mjs';const library:typeof import('pdfjs-dist')=await import(/* @vite-ignore */ moduleUrl);
   if(cancelled)return;
   library.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
   task=library.getDocument({url:`/api/resumes/${encodeURIComponent(id)}/file?disposition=inline`,withCredentials:true,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',enableXfa:false,disableWorkerRendering:true});
   const document=await task.promise;if(!cancelled)setPdf(document);
  }catch{if(!cancelled)setError('无法预览此 PDF，文件可能加密或损坏。可以重试或下载原件。');}finally{if(!cancelled)setLoading(false);}})();
  return()=>{cancelled=true;if(task)void task.destroy().catch(()=>{});};
 },[id,retry]);
 useEffect(()=>{
  if(!pdf||!canvas.current)return;let cancelled=false,render:RenderTask|undefined;setRendering(true);setError('');
  const element=canvas.current;
  void(async()=>{try{const current=await pdf.getPage(page);if(cancelled)return;const base=current.getViewport({scale:1});const viewport=current.getViewport({scale:Math.min(width/base.width,2)*zoom});
   // Bound memory for large pages and HiDPI screens.
   const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8_000_000/(viewport.width*viewport.height)));
   element.width=Math.max(1,Math.floor(viewport.width*ratio));element.height=Math.max(1,Math.floor(viewport.height*ratio));element.style.width=`${viewport.width}px`;element.style.height=`${viewport.height}px`;
   const context=element.getContext('2d');if(!context)throw new Error('Canvas unavailable');
   render=current.render({canvas:element,canvasContext:context,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;
  }catch(e){if(!cancelled&&!(e instanceof Error&&e.name==='RenderingCancelledException'))setError('此页渲染失败，请重试或下载原件。');}finally{if(!cancelled)setRendering(false);}})();
  return()=>{cancelled=true;render?.cancel();};
 },[pdf,page,zoom,width]);
 return <div className="pdf-viewer" ref={container}>
  <div className="pdf-controls"><Button size="xs" variant="outline" disabled={!pdf||page<=1||rendering} onClick={()=>setPage(v=>v-1)}>上一页</Button><span aria-live="polite">{pdf?`${page} / ${pdf.numPages} 页`:'PDF 预览'}</span><Button size="xs" variant="outline" disabled={!pdf||page>=pdf.numPages||rendering} onClick={()=>setPage(v=>v+1)}>下一页</Button><label>缩放<select aria-label="PDF 缩放" disabled={!pdf||rendering} value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={.75}>75%</option><option value={1}>适合宽度</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label></div>
  {loading&&<p role="status">正在加载 PDF…</p>}{error&&<div className="error-banner" role="alert">{error}<Button size="xs" variant="outline" onClick={()=>setRetry(v=>v+1)}>重试预览</Button></div>}
  <div className="pdf-canvas-scroll" aria-busy={loading||rendering}>{pdf&&<canvas ref={canvas} aria-label={`简历 PDF 第 ${page} 页`} role="img"/>}</div>
  {rendering&&<p role="status">正在绘制第 {page} 页…</p>}
  <a className="small-link" href={`/api/resumes/${id}/file`} download>下载 PDF 原件</a>
 </div>;
}
