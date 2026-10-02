import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from '../../../packages/libemmm/node_modules/happy-dom/lib/index.js';
import * as emmm from '../../../packages/libemmm/dist/index.js';
import { inlineCss } from '@the_dissidents/dom-css-inliner';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const window = new Window();
// Match the browser CSSStyleDeclaration iterator missing in this happy-dom version.
if (!window.CSSStyleDeclaration.prototype[Symbol.iterator])
  window.CSSStyleDeclaration.prototype[Symbol.iterator]=function*(){for(let i=0;i<this.length;i++)yield this.item(i)};
globalThis.window=window;
for (const key of ['document','DOMParser','Node','NodeFilter','HTMLAnchorElement','HTMLImageElement'])globalThis[key]=window[key];
const state = globalThis.__wxPluginTest = { requests: [], commands: [], files: {}, stores: new Map(), saves: 0 };
const mocks = {
  '@tauri-apps/plugin-http': `export async function fetch(input, init) {
    const s=globalThis.__wxPluginTest; s.requests.push({url:String(input),init});
    if(s.failure)throw new Error(s.failure);
    const url=String(input);
    if(s.draftError&&url.includes('draft/'))return new Response(JSON.stringify(s.draftError));
    if(s.articleRedirect&&url.startsWith('https://mp.weixin.qq.com/'))return new Response('',{status:302});
    return new Response(JSON.stringify(url.includes('stable_token')?{access_token:'test-token',expires_in:7200}
      :url.includes('add_material')?{media_id:'cover-id'}:url.includes('draft/add')?{media_id:'draft-id'}
      :url.includes('uploadimg')?{url:'https://mmbiz.qpic.cn/mmbiz_png/test/0'}:{}));
  }`,
  '@tauri-apps/api/core': `export class Channel {} export const invoke=async(command,args)=>{globalThis.__wxPluginTest.commands.push({command,args});if(command==='read_weixin_history_article')return globalThis.__wxPluginTest.articleHTML;};`,
  '@tauri-apps/api/path': `export const appLocalDataDir=async()=>'/tmp'; export const appConfigDir=async()=>'/tmp'; export const join=(...x)=>x.join('/');`,
  '@tauri-apps/plugin-fs': `export const BaseDirectory={}; export async function mkdir(){} export const exists=async()=>false;
    export const readTextFile=async p=>globalThis.__wxPluginTest.files[p]; export const writeTextFile=async(p,v)=>{globalThis.__wxPluginTest.files[p]=v;}; export async function writeFile(){} export async function readFile(){return new Uint8Array()}`,
  'svelte-i18n': `import{writable}from'svelte/store'; export const _=writable(x=>x);`,
  '$lib/RustAPI': `export const RustAPI={hashFile:async u=>'hash:'+u.href,compressImage:async()=>({blob:new Blob(['test image']),ext:'png'})};`,
  'images-mock': `export const imageDimensions=async()=>({width:3350,height:1000});`,
  '$lib/config/Memorized.svelte': `import{writable}from'svelte/store';
    function store(key,v){const stores=globalThis.__wxPluginTest.stores;if(stores.has(key))return stores.get(key);
      const w=writable(v);const s={...w,get:()=>v,set:x=>{v=x;w.set(x)},getItem:k=>v.get(k),setItem:(k,x)=>{v.set(k,x);w.set(v)}}; stores.set(key,s);return s;}
    export const Memorized={$:(key,type,v)=>store(key,v),$dict:(key)=>store(key,new Map()),onInitialize:()=>{},save:async()=>{globalThis.__wxPluginTest.saves++}};`,
};
const temp=await mkdtemp(join(tmpdir(),'emmm-plugins-'));
try{
  await build({stdin:{contents:`export * from './src/lib/plugins/Settings.ts';export * from './src/lib/plugins/weixin/Fields.ts';
    export * from './src/lib/plugins/weixin/History.ts';export * from './src/lib/plugins/weixin/Preview.ts';
    export * from './src/lib/plugins/weixin/Drafts.ts';export {WeixinClient} from './src/lib/integration/weixin/API.svelte.ts';
    export * from './src/lib/plugins/weixin/Digest.ts';export {initHeader,basicFieldSystems} from './src/lib/emmm/Header.tsx';
    export * from './src/lib/plugins/weixin/Network.ts';export * from './src/lib/plugins/weixin/Servers.ts';`,resolveDir:resolve('.'),loader:'ts'},
    bundle:true,format:'esm',platform:'node',outfile:join(temp,'plugin.mjs'),alias:{$lib:resolve('src/lib')},loader:{'.html':'text'},
    plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:
      args.path==='./Images'?{path:'images-mock',namespace:'mock'}:undefined);
      b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:resolve('.')}));}}]});
  const api=await import(pathToFileURL(join(temp,'plugin.mjs')));
  const {plugins,setField,field,historyEnabled,defaultCrops,publicationHeadlines,renderHistory,extractLinkedHistory,sanitizeFooter,extendWeixinPreview,WeixinClient,saveArticleDraft,uploadDraftImages,weixinFetch,weixinNetwork,weixinServers,finalizeWeixinFooterColors,syncWeixinFooterHeadingColors,getHistory,getArticleDigest,initHeader,basicFieldSystems}=api;
  const headerConfig=emmm.Configuration.from(emmm.DefaultConfiguration,false);
  headerConfig.initializers.push(initHeader);headerConfig.systemModifiers.add(...basicFieldSystems);
  headerConfig.kernel.collapseWhitespaces=true;
  const digestParsed=new emmm.ParseContext(headerConfig).parse(new emmm.SimpleScanner('[-digest] 原有摘要\n第二行。\n\n正文。'));
  assert.equal(await getArticleDigest(digestParsed),'原有摘要第二行。','Reuse original parsed multiline digest metadata');
  const original='正文第一段。\n\n正文第二段。';
  let source=original;
  const values={'wx-history':'api:3','wx-author':'A [B] | $(undefined) \\','wx-digest':'[;] 简介','wx-cover':'file:/tmp/封面 图.png'};
  for(const[k,v]of Object.entries(values))source=setField(source,k,v);
  for(const[k,v]of Object.entries(values))assert.equal(field(source,k),v);
  const config=emmm.Configuration.from(emmm.DefaultConfiguration,false);
  const parsed=new emmm.ParseContext(config).parse(new emmm.SimpleScanner(source));
  assert.deepEqual(parsed.messages.map(m=>m.info),[],'Original parser accepts every plugin variable');
  for(const[k,v]of Object.entries(values))assert.equal(parsed.context.variables.get(k),v);
  const onlyText=d=>{const out=[];d.toStripped().walk(n=>{if(n.type===emmm.NodeType.Text)out.push(n.content);return'continue'});return out.join('')};
  assert.equal(onlyText(parsed),onlyText(new emmm.ParseContext(emmm.Configuration.from(emmm.DefaultConfiguration,false)).parse(new emmm.SimpleScanner(original))));
  assert.equal((setField(source,'wx-history','api:5').match(/wx-history=/g)||[]).length,1);
  const crops=defaultCrops(3350,1000);
  assert.deepEqual(crops.wide,[0,0,2.35/3.35,1]);assert.deepEqual(crops.square,[1-1/3.35,0,1,1]);
  const all=[{content:{news_item:[{article_type:'newspic',title:'图片',url:'https://mp.weixin.qq.com/s/no',thumb_url:'https://mmbiz.qpic.cn/no'},
    {article_type:'news',title:'次条',url:'https://mp.weixin.qq.com/s/no2',thumb_url:'https://mmbiz.qpic.cn/no2'}]}},
    ...[1,2,3].map(i=>({content:{news_item:[{title:`第${i}期`,url:`http://mp.weixin.qq.com/s/${i}`,thumb_url:`http://mmbiz.qpic.cn/${i}`},
    {title:'忽略次条',url:`https://mp.weixin.qq.com/s/extra${i}`,thumb_url:'https://mmbiz.qpic.cn/x'}]}}))];
  const cards=publicationHeadlines(all);assert.deepEqual(cards.map(x=>x.title),['第1期','第2期','第3期']);
  const footer=renderHistory({cards});
  assert.equal(footer.querySelectorAll('a').length,3);assert.equal(footer.querySelectorAll('img').length,6);
  for(const c of cards){assert.ok(footer.textContent.includes(c.title));assert.ok(footer.innerHTML.includes(c.url));}
  const linked=`<meta property="og:title" content="最新一期"><meta property="og:image" content="https://mmbiz.qpic.cn/latest"><section id="js_content">${footer.outerHTML}</section>`;
  const history=extractLinkedHistory(linked,'https://mp.weixin.qq.com/s/latest');
  assert.deepEqual(history.cards.map(x=>x.title),['最新一期','第1期','第2期']);
  state.articleRedirect=true;state.articleHTML=linked;
  assert.deepEqual((await getHistory('https://mp.weixin.qq.com/s/latest')).cards.map(x=>x.title),['最新一期','第1期','第2期']);
  assert.equal(state.commands.at(-1).command,'read_weixin_history_article','Weixin redirect opens the article in its isolated reader');
  assert.equal(state.commands.at(-1).args.visible,false,'Link reads stay in the background by default');
  delete state.articleRedirect;delete state.articleHTML;state.requests=[];state.commands=[];
  const colored=renderHistory({cards},'#cc3311','#246824');
  assert.equal(colored.querySelector('strong').style.color,'#cc3311');
  assert.equal(colored.style.color,'#246824');
  assert.ok([...colored.querySelectorAll('[style]')].some(n=>['rgb(255, 255, 255)','#ffffff'].includes(n.style.color)),'Overlay captions remain legible');
  const safe=sanitizeFooter('<script>throw 1</script><img onerror="alert(1)" src="https://evil.test/a"><a href="javascript:alert(1)">x</a>');
  assert.equal(safe.querySelector('script,img'),null);assert.equal(safe.querySelector('a').getAttribute('href'),null);
  const doc=document.implementation.createHTMLDocument();doc.body.innerHTML='<header><h1><div class="title">测试文章</div></h1></header><p>正文</p>';
  const unchanged=doc.documentElement.outerHTML;
  await extendWeixinPreview(doc,source);assert.equal(doc.documentElement.outerHTML,unchanged);assert.equal(state.requests.length,0);
  plugins.set({forwarding:false,history:false,metadata:true,drafts:false});
  await extendWeixinPreview(doc,source);assert.equal(doc.documentElement.outerHTML,unchanged,'Metadata adds no article preview UI');
  plugins.set({forwarding:false,history:true,metadata:true,drafts:false});
  const disabledHistory=setField(source,'wx-history-enabled','false');
  await extendWeixinPreview(doc,disabledHistory);
  assert.equal(doc.documentElement.outerHTML,unchanged,'Turning history off keeps the article unchanged');
  assert.equal(state.requests.length,0,'Turning history off keeps its saved settings without reading links');
  assert.equal(historyEnabled(setField('', 'wx-history-enabled','true')),true,'Enable without configuration does not need a popup');
  doc.body.innerHTML='<section class="article-container"><section class="article-body"><header><h1><span class="title" style="color:#cc3311">标题</span></h1></header><p>正文</p></section></section>';
  state.files['/tmp/footer.html']=footer.innerHTML;
  let historySource=setField('', 'wx-history-html','file:/tmp/footer.html');
  historySource=setField(historySource,'wx-history-color','#cc3311');
  await extendWeixinPreview(doc,historySource);
  assert.equal(doc.querySelector('[data-weixin-history]').parentElement.className,'article-body','Footer shares the body margins and background');
  syncWeixinFooterHeadingColors(doc,window);
  const titleColor=window.getComputedStyle(doc.querySelector('header .title')).color;
  assert.equal(doc.querySelector('[data-weixin-history] strong').style.color,titleColor,'Imported footer follows the actual title color');
  const previewHeading=doc.querySelector('[data-weixin-history] strong');
  const themeStyle=doc.createElement('style');themeStyle.textContent='strong { color: #28428c; }';doc.head.append(themeStyle);
  inlineCss(doc,{removeStyleTags:true,removeClasses:true});
  assert.equal(previewHeading.style.color,'#28428c','Reproduce original inliner overriding inline footer colors');
  finalizeWeixinFooterColors(doc);
  assert.equal(previewHeading.style.color,titleColor,'Title color survives Weixin CSS inlining');
  doc.body.innerHTML='<p>正文</p>';
  weixinNetwork.set({mode:'ssh',sshServer:'missing',localPort:18781});
  await weixinFetch('https://api.weixin.qq.com/test');assert.equal(state.commands.length,0,'Disabled forwarding never starts SSH');assert.equal(state.requests.at(-1).init.proxy,undefined);
  plugins.set({forwarding:true,history:false,metadata:true,drafts:true});
  weixinServers.set([{id:'server',name:'Server',host:'127.0.0.1',username:'user',sshPort:22,identityFile:'/tmp/key',hostKeys:['key']}]);
  weixinNetwork.set({mode:'ssh',sshServer:'server',localPort:18781});state.requests=[];
  const client=new WeixinClient('test');client.appid='test-id';client.secret='test-secret';
  const draftSource=setField(setField(setField('', 'wx-title','测试文章'),'wx-cover','file:/tmp/cover.png'),'wx-digest','简介');
  await client.fetchToken();
  await uploadDraftImages(client,doc,'');
  const options={client,source:draftSource,doc,key:'test-file',content:'<p>正文</p>'+footer.innerHTML,notCached:0,digest:await getArticleDigest(digestParsed)};
  const saved=await saveArticleDraft(options);assert.equal(saved.id,'draft-id');
  const added=state.requests.find(r=>r.url.includes('draft/add'));
  const article=JSON.parse(added.init.body).articles[0];
  assert.equal(article.thumb_media_id,'cover-id');assert.equal(article.digest,'原有摘要第二行。','Original digest wins over obsolete wx-digest');assert.equal(article.author,'');
  assert.equal(article.cover_info.crop_percent_list[0].ratio,'2.35_1');assert.equal(article.cover_info.crop_percent_list[1].ratio,'1_1');
  assert.equal(article.content,options.content);
  for(const request of state.requests)assert.equal(request.init.proxy.all,'socks5h://127.0.0.1:18781');
  const before=state.requests.filter(r=>r.url.includes('draft/')).length;
  assert.equal((await saveArticleDraft(options)).unchanged,true);assert.equal(state.requests.filter(r=>r.url.includes('draft/')).length,before);
  assert.equal((await saveArticleDraft({...options,content:'<p>修改后的正文</p>'})).updated,true);
  assert.ok(state.requests.some(r=>r.url.includes('draft/update')));
  assert.equal(state.requests.filter(r=>r.url.includes('add_material')).length,1,'Cover material is reused');
  const currentTitle='尘埃中的心 · 翻译｜阴性单数的历史：电影手册论《德国，苍白的母亲》';
  const titledOptions={...options,source:setField(draftSource,'wx-title',currentTitle)};
  await saveArticleDraft(titledOptions);
  assert.equal(JSON.parse(state.requests.filter(r=>r.url.includes('draft/update')).at(-1).init.body).articles.title,currentTitle,
    'Preserve the full real-world title, including punctuation and spaces, when updating a draft');
  await saveArticleDraft({...titledOptions,key:'new-title-file'});
  assert.equal(JSON.parse(state.requests.filter(r=>r.url.includes('draft/add')).at(-1).init.body).articles[0].title,currentTitle,
    'Preserve the full title when creating a draft');
  const requestsBeforeBlank=state.requests.length;
  await assert.rejects(()=>saveArticleDraft({...options,source:setField(draftSource,'wx-title','   ')}),/标题不能为空/);
  assert.equal(state.requests.length,requestsBeforeBlank,'Reject blank titles without making API requests');
  const signatureBeforeError=state.stores.get('plugin-weixin-drafts').getItem('test-id:test-file').signature;
  state.draftError={errcode:45003,errmsg:'title size out of limit'};
  await assert.rejects(()=>saveArticleDraft({...options,source:setField(draftSource,'wx-title','长'.repeat(100))}),
    error=>error.name==='WeixinAPIError'&&error.code===45003,'Let Weixin enforce its actual title limit and report its error');
  assert.equal(state.stores.get('plugin-weixin-drafts').getItem('test-id:test-file').signature,signatureBeforeError,
    'A rejected title must not be marked as successfully saved');
  delete state.draftError;
  assert.equal((await saveArticleDraft(titledOptions)).unchanged,true,'A rejected title does not corrupt the previous saved draft');
  await assert.rejects(()=>saveArticleDraft({...options,notCached:1}),/未准备完成/);
  state.failure='upload failed';
  doc.body.innerHTML='<img src="file:/tmp/body.png">';
  await assert.rejects(()=>uploadDraftImages(client,doc,''),/upload failed/);delete state.failure;
  console.log('Passed: vanilla parser compatibility, unchanged body and disabled UI, headline filtering, old footer formatting, link extraction, sanitization, proxy route, cover crops, draft add/update/deduplication, image failure.');
}finally{delete globalThis.__wxPluginTest;await rm(temp,{recursive:true,force:true});await window.happyDOM.close();}
