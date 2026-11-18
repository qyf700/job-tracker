import {cp,mkdir,copyFile} from 'node:fs/promises';
const source=new URL('../node_modules/pdfjs-dist/',import.meta.url),target=new URL('../public/pdfjs/',import.meta.url);
await mkdir(target,{recursive:true});
for(const file of ['pdf.mjs','pdf.worker.mjs'])await copyFile(new URL('build/'+file,source),new URL(file,target));
for(const dir of ['cmaps','standard_fonts','wasm'])await cp(new URL(dir,source),new URL(dir,target),{recursive:true});
await copyFile(new URL('LICENSE',source),new URL('LICENSE',target));
