// Run: node scripts/test-virtual-browser.mjs. No Playwright install, .env access, or production API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromiumCandidates = [
  process.env.KUKE_TEST_CHROMIUM,
  path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge Dev/Application/msedge.exe',
].filter(Boolean);
let chromium;
for (const candidate of chromiumCandidates) { try { await access(candidate); chromium = candidate; break; } catch {} }
if (!chromium) throw new Error('Missing local Chromium or Edge; set KUKE_TEST_CHROMIUM to an installed browser executable (no downloads).');

// Bundle only the two real source components and their local imports, never the app/API entry point.
const fixture = `import React, {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {VirtualConversationList} from './src/components/chat/VirtualConversationList';
import {useVirtualMessageRows} from './src/components/chat/useVirtualMessageRows';
const seed=Array.from({length:1000},(_,i)=>({id:i+1}));
function App(){
 const [rows,setRows]=useState(seed), [image,setImage]=useState(false);
 const sideRef=useRef(null), msgScroll=useRef(null), msgList=useRef(null), bottom=useRef(false);
 const ids=React.useMemo(()=>Array.from({length:2000},(_,i)=>i+1),[]);
 const virtual=useVirtualMessageRows(ids,msgScroll,msgList,1,12,bottom,108);
 window.fixture={reorder:()=>setRows(current=>[current[900],...current.filter(row=>row.id!==901)]),
   grow:()=>setImage(true), scrollConversation:y=>{sideRef.current.scrollTop=y;sideRef.current.dispatchEvent(new Event('scroll'))},
   scrollMessage:y=>{msgScroll.current.scrollTop=y;virtual.syncScroll()},
   messageIndex:i=>virtual.scrollToIndex(i,'start')};
 return <><div id="side" ref={sideRef} style={{height:460,width:320,overflow:'auto',scrollBehavior:'auto',overflowAnchor:'none'}}>
 <VirtualConversationList items={rows} scrollRef={sideRef} activeId={null} searchKey="" estimatedRowHeight={52} renderRow={row=><div data-conversation-id={row.id} style={{height:52,boxSizing:'border-box',borderBottom:'1px solid #eee'}}>conversation {row.id}</div>}/>
 </div><div id="messages" ref={msgScroll} onScroll={virtual.syncScroll} style={{height:460,width:320,overflow:'auto',position:'relative',overflowAnchor:'none'}}>
 <div id="message-list" ref={msgList} style={{height:virtual.totalHeight,position:'relative'}}>
 {ids.slice(virtual.start,virtual.end).map((id,k)=><div key={id} data-virtual-message-id={id} ref={virtual.measureRow} style={{position:'absolute',left:0,right:0,top:virtual.offsets[virtual.start+k],boxSizing:'border-box',height:id===1150&&image?220:108,background:id===1150?'#ddd':'#fff'}}>message {id}{id===1150?' async image':''}</div>)}
 </div></div></>;
}
flushSync(()=>createRoot(document.getElementById('root')).render(<App/>));`;
const bundled = await build({stdin:{contents:fixture,resolveDir:project,sourcefile:'virtual-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',target:'chrome115',logLevel:'silent'});
const html='<!doctype html><meta charset="utf-8"><title>Local virtual-list fixture</title><div id="root"></div><script src="/fixture.js"></script>';
let requests = 0;
const server=createServer((req,res)=>{
  requests++;
  if(req.url==='/') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
  else if(req.url==='/fixture.js') {res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(bundled.outputFiles[0].contents);}
  else {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const appPort=server.address().port;
const reserve=createServer(); await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const debugPort=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
const profile=await mkdtemp(path.join(os.tmpdir(),'kuke-virtual-browser-'));
const child=spawn(chromium,[`--remote-debugging-port=${debugPort}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--no-default-browser-check','--disable-gpu','about:blank'],{stdio:'ignore'});
let ws; let serial=0; const pending=new Map(); let externalRequests=0; const browserErrors=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  let pageTarget;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error(`Chromium exited early: ${child.exitCode}`);
    try { const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); pageTarget=targets.find(t=>t.type==='page'); if(pageTarget) break; } catch {}
    await delay(100);
  }
  assert(pageTarget,'Browser CDP endpoint did not start');
  ws=new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Runtime.exceptionThrown'||msg.method==='Log.entryAdded') browserErrors.push(msg.params);
    if(msg.method==='Fetch.requestPaused') {
      const url=new URL(msg.params.request.url);
      const allowed=url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)===appPort;
      if(!allowed) externalRequests++;
      send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:msg.params.requestId,...(!allowed?{errorReason:'BlockedByClient'}:{})}).catch(()=>{});
      return;
    }
    if(msg.id&&pending.has(msg.id)){ const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result); }
  });
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/`});
  for(let i=0;i<60;i++){ if(await evaluate('Boolean(window.fixture && document.querySelector("[data-conversation-id]") && document.querySelector("[data-virtual-message-id]"))'))break;await delay(100); }
  const sample=async()=>evaluate(`(()=>{const side=document.querySelector('#side'),msg=document.querySelector('#messages'),convs=[...document.querySelectorAll('[data-conversation-id]')],messages=[...document.querySelectorAll('[data-virtual-message-id]')];const first=convs.find(e=>e.getBoundingClientRect().bottom>side.getBoundingClientRect().top);const firstMessage=messages.find(e=>e.getBoundingClientRect().bottom>msg.getBoundingClientRect().top);return {conversationRows:convs.length,messageRows:messages.length,scrollConversation:side.scrollTop,scrollMessage:msg.scrollTop,firstConversation:first?Number(first.dataset.conversationId):null,firstConversationOffset:first?Math.round(first.getBoundingClientRect().top-side.getBoundingClientRect().top):null,firstMessage:Number(firstMessage?.dataset.virtualMessageId),firstMessageOffset:firstMessage?Math.round(firstMessage.getBoundingClientRect().top-msg.getBoundingClientRect().top):null,documentRows:convs.length+messages.length,debug:{sideHeight:side.clientHeight,sideScrollHeight:side.scrollHeight,sideChildren:side.firstElementChild?.children.length,spacerHeight:side.firstElementChild?.firstElementChild?.getBoundingClientRect().height,listTop:side.firstElementChild?.getBoundingClientRect().top,firstRowTop:convs[0]?.getBoundingClientRect().top,firstRowId:convs[0]?.dataset.conversationId}}})()`);
  const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await settle();await delay(150);const initial=await sample();
  await evaluate('window.fixture.scrollConversation(20000); window.fixture.messageIndex(1150)');await settle();await delay(200);await settle();
  let scrolled=await sample();
  for (let i=0;scrolled.firstConversation===null && i<15;i++){await delay(100);await settle();scrolled=await sample();}
  await evaluate('window.fixture.scrollMessage(138070)');await settle();await delay(100);
  const frameStats=await evaluate(`new Promise(resolve=>{let previous=performance.now(),deltas=[];function tick(now){deltas.push(now-previous);previous=now;if(deltas.length<30)requestAnimationFrame(tick);else resolve({samples:deltas.length,medianMs:deltas.slice().sort((a,b)=>a-b)[15],maxMs:Math.max(...deltas)})}requestAnimationFrame(tick)})`);
  const beforeReorder=await sample();await evaluate('window.fixture.reorder()');await settle();const reordered=await sample();
  const beforeImage=await sample();await evaluate('window.fixture.grow()');await delay(250);await settle();const afterImage=await sample();
  assert(initial.conversationRows>0 && initial.conversationRows<100 && initial.messageRows>0 && initial.messageRows<100, 'Initial rows not virtualized');
  assert(scrolled.conversationRows>0 && scrolled.conversationRows<100 && scrolled.messageRows>0 && scrolled.messageRows<100, 'Scroll rows not virtualized');
  assert.notEqual(scrolled.firstConversation,null,'Conversation scroll left a blank viewport');
  assert.equal(reordered.firstConversation,beforeReorder.firstConversation,'Conversation reorder lost first visible anchor');
  assert(Math.abs(reordered.firstConversationOffset-beforeReorder.firstConversationOffset)<=2,'Conversation reorder shifted anchor pixels');
  assert(afterImage.messageRows<100,'Async media produced too many message nodes');
  assert.equal(afterImage.firstMessage,beforeImage.firstMessage,'Async media lost first message anchor');
  assert.equal(afterImage.firstMessageOffset,beforeImage.firstMessageOffset,'Async media shifted first message anchor pixels');
  assert.equal(afterImage.scrollMessage-beforeImage.scrollMessage,112,'Async image height increase was not offset in scrollTop');
  assert.equal(externalRequests,0,'Fixture attempted an external request');
  assert.equal(browserErrors.length,0,'Browser emitted runtime errors');
  console.log(JSON.stringify({browser:chromium,network:{localRequests:requests,blockedExternalRequests:externalRequests,browserErrors},initial,scrolled,frameStats,reorder:{before:beforeReorder,after:reordered},asyncImage:{before:beforeImage,after:afterImage},passed:true},null,2));
} finally {
  if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
  child.kill();
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});
  await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150});
}
