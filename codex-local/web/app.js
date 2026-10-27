'use strict';
const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get('token');
let sessions = [], chat = null, selected = new Set(), rendering = false, errors = 0;
const md = window.markdownit({html:false,linkify:true,breaks:false});
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',flowchart:{htmlLabels:false},suppressErrorRendering:true});
function mathRule(state, silent) {
  const src = state.src.slice(state.pos);
  let open, close, display = false;
  for (const pair of [['\\[','\\]',true],['\\(','\\)',false],['$$','$$',true],['$','$',false]]) {
    if (src.startsWith(pair[0])) { [open,close,display] = pair; break; }
  }
  if (!open || (open === '$' && /\s/.test(src[1] || ''))) return false;
  let end = src.indexOf(close,open.length);
  while (end > 0 && src[end-1] === '\\') end = src.indexOf(close,end+close.length);
  if (end < 0 || (open === '$' && /\s/.test(src[end-1]))) return false;
  if (!silent) { const t=state.push('codex_math','',0); t.content=src.slice(open.length,end); t.meta={display}; }
  state.pos += end + close.length; return true;
}
md.inline.ruler.before('escape','codex_math',mathRule);
md.renderer.rules.codex_math = (tokens,i) => {
  try {return katex.renderToString(tokens[i].content,{displayMode:tokens[i].meta.display,throwOnError:true,trust:false});}
  catch (_) {errors++;return '<span class="render-error">數學式未能排版：'+md.utils.escapeHtml(tokens[i].content)+'</span>';}
};
const oldImage = md.renderer.rules.image;
md.renderer.rules.image=(tokens,i,opts,env,self)=>{
  const t=tokens[i], src=t.attrGet('src') || '';
  if(src.startsWith('codex-media:')) t.attrSet('src','/media/'+src.slice(12)+'?token='+encodeURIComponent(token));
  else {errors++;return '<span class="warning">圖片未能載入</span>';}
  return oldImage(tokens,i,opts,env,self);
};
md.validateLink = url => url.startsWith('codex-media:') || /^(https?:|mailto:|#)/i.test(url);
const oldFence = md.renderer.rules.fence;
md.renderer.rules.fence=(tokens,i,opts,env,self)=>{
  if(tokens[i].info.trim()==='mermaid') return '<div class="mermaid">'+md.utils.escapeHtml(tokens[i].content)+'</div>';
  return oldFence(tokens,i,opts,env,self);
};
async function api(path){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(path,{headers:{'X-Codex-Token':token || ''},signal:controller.signal});if(!r.ok)throw new Error('讀取失敗（'+r.status+'）');return await r.json();}catch(e){if(e.name==='AbortError')throw new Error('讀取逾時。請重新選擇對話或重新啟動匯出工具');throw e;}finally{clearTimeout(timer);}}
function say(text){$('status').textContent=text;}
function visible(){return chat ? chat.messages.filter(m=>$('progress').checked || m.phase!=='commentary') : [];}
function picked(){return visible().filter(m=>selected.has(m.id));}
function update(){
  $('count').textContent='已選 '+picked().length+' / '+visible().length+' 則';
  ['md','json'].forEach(id=>$(id).disabled=!picked().length || rendering);
  $('print').disabled=!picked().length || rendering;
  document.querySelectorAll('.message').forEach(el=>el.classList.toggle('excluded',!selected.has(Number(el.dataset.id))));
}
function head(){
  const title=$('title').value.trim() || chat?.title || 'Codex 對話';
  document.title=title;
  $('document-head').replaceChildren();
  const h=document.createElement('h2');h.textContent=title;
  const s=document.createElement('small');s.textContent='Codex 本機對話 · 匯出於 '+new Date().toLocaleString('zh-TW');
  $('document-head').append(h,s);
}
async function render(){
  rendering=true;errors=0;update();head();$('messages').replaceChildren();
  for(const [index,m] of visible().entries()){
    const article=document.createElement('article');article.className='message';article.dataset.id=m.id;
    const label=document.createElement('label');label.className='message-head';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(m.id);cb.className='controls';
    cb.addEventListener('change',()=>{cb.checked?selected.add(m.id):selected.delete(m.id);update();});
    label.append(cb,document.createTextNode((index+1)+'. '+(m.role==='user'?'你':'Codex')+(m.phase==='commentary'?' · 工作進度':'')));
    const body=document.createElement('div');body.className='body';body.innerHTML=md.render(m.text);
    for(const key of m.images){const img=document.createElement('img');img.src='/media/'+key+'?token='+encodeURIComponent(token);img.alt='對話附圖';body.append(img);}
    for(const warning of m.warnings){const el=document.createElement('p');el.className='warning';el.textContent=warning;body.append(el);}
    article.append(label,body);$('messages').append(article);
  }
  // Render locally; no remote fonts or diagram service is used.
  for(const el of document.querySelectorAll('.mermaid')){
    try {const result=await mermaid.render('diagram-'+crypto.randomUUID(),el.textContent);el.innerHTML=result.svg;}
    catch(e){errors++;el.className='render-error';el.textContent='流程圖無法排版，請下載 Markdown 查看原始碼。\n'+el.textContent;}
  }
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll('.body img')].map(img=>img.decode().catch(()=>{})));
  rendering=false;update();say('已載入 '+visible().length+' 則訊息。請勾選後列印或下載。');
}
function drawSessions(){
  const term=$('search').value.toLowerCase();$('sessions').replaceChildren();
  for(const item of sessions.filter(x=>(x.title+' '+x.cwd).toLowerCase().includes(term))){
    const b=document.createElement('button');b.className='session'+(chat?.id===item.id?' active':'');b.textContent=item.title;
    const small=document.createElement('small');small.textContent=item.cwd || '本機對話';b.append(small);
    b.addEventListener('click',async()=>{if(rendering)return;say('正在讀取對話與附圖…');try{chat=await api('/api/session/'+item.id);selected=new Set(chat.messages.filter(m=>m.phase!=='commentary').map(m=>m.id));$('title').value=chat.title;$('chat-title').textContent=chat.title;$('empty').hidden=true;drawSessions();await render();}catch(e){say(e.message);rendering=false;update();}});
    $('sessions').append(b);
  }
}
async function refresh(){try{sessions=await api('/api/sessions');drawSessions();say('找到 '+sessions.length+' 個本機對話。請從左側選擇。');}catch(e){say(e.message+'。請用啟動工具重新開啟本頁。');}}
function download(ext,data,mime){const blob=new Blob([data],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(($('title').value || 'Codex 對話').replace(/[\\/:*?"<>|]/g,'_').slice(0,100))+'.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('md').onclick=()=>{const ms=picked();let text='# '+($('title').value || chat.title)+'\n\n';for(const m of ms){text+='## '+(m.role==='user'?'你':'Codex')+'\n\n'+m.text+'\n\n';for(const key of m.images){text+='[對話附圖：請使用 JSON 保存內嵌圖片]\n\n';}for(const w of m.warnings)text+='> '+w+'\n\n';}text=text.replace(/!\[([^\]]*)\]\(codex-media:[^)]+\)/g,'[附圖：$1；請使用 JSON 保存圖片]');download('md',text,'text/markdown;charset=utf-8');};
$('json').onclick=async()=>{try{const ms=JSON.parse(JSON.stringify(picked()));const keys=new Set(ms.flatMap(m=>m.images));for(const m of ms)for(const match of m.text.matchAll(/codex-media:([a-f0-9]{64})/g))keys.add(match[1]);const assets={};for(const k of keys){const r=await fetch('/media/'+k,{headers:{'X-Codex-Token':token}});if(!r.ok)throw Error('圖片讀取失敗');const b=await r.blob();assets[k]=await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.readAsDataURL(b);});}download('json',JSON.stringify({schema:'codex-local-export/v1',title:$('title').value,sessionId:chat.id,exportedAt:new Date().toISOString(),messages:ms,assets},null,2),'application/json');say('已下載 JSON（包含可取得的圖片）。');}catch(e){say(e.message);}};
$('print').onclick=async()=>{
  const articles=[...document.querySelectorAll('.message:not(.excluded)')];
  if(articles.some(el=>el.querySelector('.render-error'))){say('選取內容有公式或流程圖排版失敗。請取消該則訊息或下載 Markdown 查看原始碼。');return;}
  const broken=articles.some(el=>el.querySelector('.warning') || [...el.querySelectorAll('img')].some(i=>!i.complete || !i.naturalWidth));
  if(broken && !$('allow-missing').checked){say('選取內容有圖片或公式無法載入。請檢查警示，或勾選「允許略過無法載入的圖片」。');return;}
  await document.fonts.ready;head();window.print();
};
$('all').onclick=()=>{visible().forEach(m=>selected.add(m.id));document.querySelectorAll('.message input').forEach(c=>c.checked=true);update();};
$('none').onclick=()=>{selected.clear();document.querySelectorAll('.message input').forEach(c=>c.checked=false);update();};
$('answers').onclick=()=>{selected=new Set(visible().filter(m=>m.role==='assistant').map(m=>m.id));document.querySelectorAll('.message').forEach(el=>el.querySelector('input').checked=selected.has(Number(el.dataset.id)));update();};
$('progress').onchange=()=>{if(chat)render();};$('title').oninput=head;$('font').onchange=()=>document.documentElement.style.setProperty('--font',$('font').value+'pt');$('search').oninput=drawSessions;$('refresh').onclick=refresh;
refresh();
