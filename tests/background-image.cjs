const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const listeners=[];let calls=0,mode='ok';
const mockFetch=async(url,options)=>{
 calls++;assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 return {ok:true,headers:new Map([['content-type',mode==='type'?'text/html':'image/png'],['content-length',mode==='size'?String(21*1024*1024):'3']]),body:{getReader(){let done=false;return {async read(){if(done)return {done:true};done=true;return {done:false,value:new Uint8Array([1,2,3])}}}}}};
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),{chrome:{runtime:{onMessage:{addListener:f=>listeners.push(f)}},action:{onClicked:{addListener(){}}}},URL,fetch:mockFetch,AbortSignal,btoa,String,console});
const handle=listeners.at(-1);
function call(url,page='https://chatgpt.com/c/test'){return new Promise(resolve=>handle({type:'READ_CHATGPT_IMAGE',url},{tab:{url:page}},resolve));}
(async()=>{
 for(const url of ['http://images.openai.com/a','https://example.com/a','https://images.openai.com.evil.test/a','https://user:pass@images.openai.com/a'])assert.equal((await call(url)).ok,false);
 assert.equal((await call('https://images.openai.com/a','https://example.com')).ok,false);assert.equal(calls,0);
 const good=await call('https://images.openai.com/a');assert.equal(good.data,'data:image/png;base64,AQID');
 mode='type';assert.equal((await call('https://images.openai.com/a')).ok,false);
 mode='size';assert.equal((await call('https://images.openai.com/a')).ok,false);
 console.log('PASS: host/sender/scheme/credential gates, image data, type and size limits');
})().catch(e=>{console.error(e);process.exitCode=1});
