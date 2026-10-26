const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function app(fetch){
 const elements=new Map();
 const element=selector=>{
  if(!elements.has(selector))elements.set(selector,{style:{},value:'',dataset:{},addEventListener(){}});
  return elements.get(selector);
 };
 const context=vm.createContext({
  document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},
  localStorage:{getItem:()=>JSON.stringify({deviceCode:'test-private-code-123456'}),setItem(){}},
  navigator:{},crypto:{randomUUID:()=> 'stable-command-id'},fetch,
  AbortController,setInterval:fn=>{context.healthTick=fn;},setTimeout:(fn,ms)=>ms===10000?setTimeout(fn,ms):setTimeout(fn,0),clearTimeout,
 });
 vm.runInContext(source,context);
 return {context,elements};
}
test('lost response retries the same command and maps sound correctly',async()=>{
 const writes=[];let lost=true;
 const {context}=app(async(url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='health')return {ok:true,json:async()=>({ok:true,online:false})};
  if(body.action==='status')return {ok:true,json:async()=>({ok:true,status:'ACKNOWLEDGED'})};
  writes.push(body);
  if(lost){lost=false;throw new TypeError('response lost');}
  return {ok:true,json:async()=>({ok:true,id:'server-command-id',status:'SENT'})};
 });
 assert.equal(await context.send('/sound',{sound:'beep'},''),true);
 assert.equal(writes.length,2);
 assert.equal(writes[0].kind,'sound');
 assert.deepEqual(writes[0],writes[1]);
 assert.equal(writes[0].commandId,'stable-command-id');
});
test('unknown paths never enqueue a deletion and offline heartbeat stays offline',async()=>{
 let writes=0;
 const {context,elements}=app(async()=>{
  writes++;return {ok:true,json:async()=>({ok:true,online:false})};
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await context.send('/unknown',{},''),false);
 assert.equal(writes,1);
 assert.equal(elements.get('#connection').textContent,'TV sem conexão recente');
});
test('a rejected command is not retried',async()=>{
 let writes=0;
 const {context}=app(async(url,options)=>{
  if(JSON.parse(options.body).action==='health')return {ok:true,json:async()=>({ok:true,online:true})};
  writes++;return {ok:false,status:400,json:async()=>({ok:false})};
 });
 assert.equal(await context.send('/message',{message:'test'},''),false);
 assert.equal(writes,1);
});
test('the connection indicator refreshes after the receiver goes offline',async()=>{
 let online=true;
 const {context,elements}=app(async()=>({ok:true,json:async()=>({ok:true,online})}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.get('#connection').textContent,'TV conectada (heartbeat)');
 online=false;
 context.healthTick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.get('#connection').textContent,'TV sem conexão recente');
});
