import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from '../../../packages/libemmm/node_modules/happy-dom/lib/index.js';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const win=new Window();
globalThis.document=win.document;globalThis.XMLSerializer=win.XMLSerializer;
// A background WebView can suspend every animation frame.
globalThis.requestAnimationFrame=()=>0;
let failDecode=false;
globalThis.Image=class {
  set src(value){this.url=value;queueMicrotask(()=>this.onload?.());}
  decode(){return failDecode?Promise.reject(new Error('decode failed')):Promise.resolve();}
};
const dir=await mkdtemp(join(tmpdir(),'emmm-prerender-'));
try {
  await build({entryPoints:['src/lib/details/ElementToCanvas.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'image.mjs'),
    plugins:[{name:'native-boundary',setup(b){b.onResolve({filter:/^\$lib\//},a=>({path:a.path,namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='$lib/RustAPI'
        ?'export const RustAPI={packFonts:async()=>[]}'
        :'export const Debug={assert(x){if(!x)throw Error("assert")}}',loader:'js'}));}}]});
  const {elementToImage}=await import(pathToFileURL(join(dir,'image.mjs')));
  const node=document.createElement('section');node.textContent='标题';
  let timer;
  const bounded=p=>Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('background render hung')),500)})]).finally(()=>clearTimeout(timer));
  assert.ok((await bounded(elementToImage(node,100,40,true))).url.startsWith('data:image/svg+xml'));
  failDecode=true;
  await assert.rejects(()=>bounded(elementToImage(node,100,40,true)),/decode failed/);
  failDecode=false;
  let frame;
  globalThis.requestAnimationFrame=callback=>{frame=callback;return 1;};
  let done=false;
  const legacy=elementToImage(node,100,40).then(()=>{done=true;});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(done,false,'Original path still waits for an animation frame');
  frame();await legacy;assert.equal(done,true);
  console.log('Passed: draft rendering works without frames and propagates decode errors; original rendering behavior is preserved.');
} finally {await rm(dir,{recursive:true,force:true});await win.happyDOM.close();}
