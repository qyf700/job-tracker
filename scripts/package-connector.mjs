import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../extensions/connector/',import.meta.url));
const output=fileURLToPath(new URL('../public/downloads/jobtracker-connector.zip',import.meta.url));
await mkdir(new URL('../public/downloads/',import.meta.url),{recursive:true});await rm(output,{force:true});const result=spawnSync('zip',['-q','-r',output,'.'],{cwd:directory,stdio:'inherit'});if(result.status!==0)throw new Error('Connector packaging failed');
