import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const {build} = createRequire(require.resolve('vite'))('esbuild');
const state=globalThis.__wxImageTest={written:[],commands:[]};
const mocks={
 '@tauri-apps/api':`export const path={tempDir:async()=>'/tmp',join:(...x)=>x.join('/'),extname:async p=>{if(!p.includes('.'))throw new Error('path does not have an extension');return '.'+p.split('.').at(-1)}};`,
 '@tauri-apps/api/core':`export class Channel{} export const invoke=async(name,args)=>{globalThis.__wxImageTest.commands.push({name,args});return 'test-hash'};`,
 '@tauri-apps/plugin-fs':`export const writeFile=async p=>{globalThis.__wxImageTest.written.push(p)};export const readFile=async()=>new Uint8Array();`,
 '@tauri-apps/plugin-http':`export const fetch=async()=>new Response(new Blob(['image bytes'],{type:'image/png'}));`,
};
const dir=await mkdtemp(join(tmpdir(),'emmm-image-path-'));
try{
 await build({entryPoints:['src/lib/RustAPI.ts'],outfile:join(dir,'image.mjs'),bundle:true,format:'esm',platform:'node',alias:{$lib:resolve('src/lib')},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:resolve('.')}))}}]});
 const {RustAPI}=await import(pathToFileURL(join(dir,'image.mjs')));
 await RustAPI.hashFile(new URL('https://mmbiz.qpic.cn/image/0?wx_fmt=png'));
 assert.match(state.written[0],/\.png$/);assert.equal(state.commands[0].args.path,state.written[0]);
 console.log('Passed: Weixin URLs without file extensions use the response image type.');
}finally{delete globalThis.__wxImageTest;await rm(dir,{recursive:true,force:true});}
