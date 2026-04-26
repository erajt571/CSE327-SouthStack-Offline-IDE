const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = p => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clientId = localStorage.clientId || (localStorage.clientId = uid('peer'));
let peerName = localStorage.peerName || (location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? 'Host Laptop' : 'LAN Peer');
let state = null;
let selectedId = null;
let dragging = null;
let resizing = null;
let referenceData = '';
let showReference = true;
let lastServerVersion = 0;
let sending = false;
let scale = 1;

$('#peerName').value = peerName;
$('#peerName').addEventListener('input', e => { peerName = e.target.value || 'Peer'; localStorage.peerName = peerName; });

function baseState(){
  const id = uid('screen');
  return {version:1,screens:[{id,name:'Mobile Home',width:390,height:844,bg:'#f7f8fb',elements:[]}],activeScreenId:id,resources:[],chat:[],agentLog:['Local design agent ready.'],cursors:{}};
}
function activeScreen(){ return state.screens.find(s => s.id === state.activeScreenId) || state.screens[0]; }
function activeElements(){ return activeScreen().elements; }
function markDirty(msg='Updated'){ state.version = (state.version||0)+1; render(); sendState(); toast(msg); }
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1600); }

async function fetchState(){
  try{
    const r = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}&name=${encodeURIComponent(peerName)}`);
    const remote = await r.json();
    $('#syncPill').textContent = 'online'; $('#syncPill').classList.add('good');
    if(!state || remote.version > lastServerVersion){
      const peers = remote.peers || [];
      delete remote.peers; delete remote.serverTime;
      state = remote; state._peers = peers; lastServerVersion = remote.version || 0;
      render();
    } else if (state) { state._peers = remote.peers || []; renderPeers(); }
  }catch(e){ $('#syncPill').textContent='offline'; $('#syncPill').classList.remove('good'); if(!state){state=baseState();render();} }
}
async function sendState(){
  if(sending) return; sending = true;
  try{
    const clean = JSON.parse(JSON.stringify(state)); delete clean._peers;
    const r = await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,name:peerName,state:clean})});
    const ans = await r.json(); if(ans.version) lastServerVersion = ans.version; state._peers = ans.peers || state._peers || [];
  }catch(e){ console.warn(e); }
  sending = false;
}
setInterval(fetchState, 900);
fetchState();

function render(){ if(!state) return; renderScreens(); renderCanvas(); renderInspector(); renderPeers(); renderResources(); renderAgentLog(); }
function renderScreens(){
  const list=$('#screensList'); list.innerHTML='';
  state.screens.forEach(s=>{
    const div=document.createElement('div'); div.className='screen-item '+(s.id===state.activeScreenId?'active':'');
    div.innerHTML=`<span>${escapeHtml(s.name)}</span><small>${s.width}×${s.height}</small>`;
    div.onclick=()=>{state.activeScreenId=s.id; selectedId=null; markDirty('Screen opened');}; list.appendChild(div);
  });
}
function renderCanvas(){
  const s=activeScreen(); if(!s) return;
  $('#screenTitle').textContent=s.name; $('#screenSize').textContent=`${s.width} × ${s.height}`;
  const c=$('#deviceCanvas'); c.style.width=s.width+'px'; c.style.height=s.height+'px'; c.style.background=s.bg; c.classList.toggle('web',s.width>600);
  c.style.transform=`scale(${scale})`;
  const ref=$('#referenceImage'); ref.src=referenceData||''; ref.classList.toggle('hidden',!referenceData||!showReference);
  const layer=$('#elementsLayer'); layer.innerHTML='';
  s.elements.forEach(el=>layer.appendChild(drawElement(el)));
}
function drawElement(el){
  const d=document.createElement('div'); d.className=`el ${el.type} ${el.id===selectedId?'selected':''}`; d.dataset.id=el.id;
  Object.assign(d.style,{left:el.x+'px',top:el.y+'px',width:el.w+'px',height:el.h+'px',background:el.bg,color:el.color,borderRadius:(el.radius||0)+'px',fontSize:(el.fontSize||14)+'px',fontWeight:el.weight||'600',border:el.border||'1px solid transparent',padding:el.padding||'0 10px'});
  if(el.type==='navbar') d.innerHTML = `<span>Home</span><span>Build</span><span>Share</span>`; else d.textContent = el.text || labelFor(el.type);
  d.onpointerdown = ev => startDrag(ev, el.id);
  d.ondblclick = ev => { ev.stopPropagation(); runAction(el.action); };
  if(el.id===selectedId){ const h=document.createElement('div'); h.className='resize-handle'; h.onpointerdown=ev=>startResize(ev,el.id); d.appendChild(h); }
  return d;
}
function startDrag(ev,id){ if(ev.target.className==='resize-handle') return; selectedId=id; const el=findEl(id); dragging={id,startX:ev.clientX,startY:ev.clientY,ox:el.x,oy:el.y}; ev.currentTarget.setPointerCapture(ev.pointerId); render(); }
function startResize(ev,id){ ev.stopPropagation(); const el=findEl(id); resizing={id,startX:ev.clientX,startY:ev.clientY,ow:el.w,oh:el.h}; ev.currentTarget.setPointerCapture(ev.pointerId); }
window.addEventListener('pointermove',ev=>{
  if(dragging){ const el=findEl(dragging.id); el.x=Math.round(dragging.ox+(ev.clientX-dragging.startX)/scale); el.y=Math.round(dragging.oy+(ev.clientY-dragging.startY)/scale); renderCanvas(); renderInspector(); }
  if(resizing){ const el=findEl(resizing.id); el.w=Math.max(30,Math.round(resizing.ow+(ev.clientX-resizing.startX)/scale)); el.h=Math.max(24,Math.round(resizing.oh+(ev.clientY-resizing.startY)/scale)); renderCanvas(); renderInspector(); }
});
window.addEventListener('pointerup',()=>{ if(dragging||resizing) markDirty('Layer edited'); dragging=null; resizing=null; });
$('#deviceCanvas').addEventListener('pointerdown',ev=>{ if(ev.target.id==='deviceCanvas'||ev.target.id==='elementsLayer'){selectedId=null;render();} });

function findEl(id){ return activeElements().find(e=>e.id===id); }
function defaultEl(type){
  const common={id:uid('el'),type,x:45,y:80,w:170,h:48,bg:'#ffffff',color:'#111827',radius:14,fontSize:14,weight:'700',action:''};
  const map={text:{w:210,h:38,bg:'transparent',text:'Headline text',fontSize:24},button:{text:'Get Started',bg:'#2563eb',color:'#fff'},input:{text:'Enter text...',bg:'#ffffff',color:'#64748b',border:'1px solid #d8dee9'},card:{w:260,h:135,text:'Feature card',bg:'#ffffff',radius:22},image:{w:160,h:120,text:'Image',bg:'#dbeafe'},navbar:{x:0,y:0,w:activeScreen().width,h:62,text:'Navbar',bg:'#111827',color:'#fff',radius:0}};
  return {...common,...(map[type]||{})};
}
$$('[data-add]').forEach(b=>b.onclick=()=>{ const el=defaultEl(b.dataset.add); activeElements().push(el); selectedId=el.id; markDirty(`${b.dataset.add} added`); });

function renderInspector(){
  const el=selectedId?findEl(selectedId):null; $('#inspector').classList.toggle('hidden',!el); $('#emptyInspector').classList.toggle('hidden',!!el); if(!el) return;
  $('#propText').value=el.text||''; $('#propX').value=el.x; $('#propY').value=el.y; $('#propW').value=el.w; $('#propH').value=el.h; $('#propBg').value=colorToHex(el.bg||'#ffffff'); $('#propColor').value=colorToHex(el.color||'#111827'); $('#propRadius').value=el.radius||0; $('#propAction').value=el.action||'';
}
['Text','X','Y','W','H','Bg','Color','Radius','Action'].forEach(k=>{
  const input=$('#prop'+k); if(!input) return; input.oninput=()=>{ const el=findEl(selectedId); if(!el) return; const key={Text:'text',X:'x',Y:'y',W:'w',H:'h',Bg:'bg',Color:'color',Radius:'radius',Action:'action'}[k]; el[key]=['x','y','w','h','radius'].includes(key)?Number(input.value):input.value; renderCanvas(); };
  input.onchange=()=>markDirty('Property changed');
});
$('#deleteBtn').onclick=()=>{ const s=activeScreen(); s.elements=s.elements.filter(e=>e.id!==selectedId); selectedId=null; markDirty('Layer deleted'); };
$('#duplicateBtn').onclick=()=>{ const el=findEl(selectedId); if(el){ const copy={...el,id:uid('el'),x:el.x+18,y:el.y+18}; activeElements().push(copy); selectedId=copy.id; markDirty('Layer duplicated'); } };

$('#addMobile').onclick=()=>addScreen('Mobile Screen',390,844);
$('#addWeb').onclick=()=>addScreen('Web Screen',1200,760);
function addScreen(name,w,h){ const id=uid('screen'); state.screens.push({id,name:name+' '+state.screens.length,width:w,height:h,bg:'#f7f8fb',elements:[]}); state.activeScreenId=id; selectedId=null; markDirty('Screen added'); }
$('#fitBtn').onclick=()=>{ const s=activeScreen(); const wrap=$('#canvasWrap').getBoundingClientRect(); scale=Math.min(1,(wrap.width-80)/s.width,(wrap.height-80)/s.height); renderCanvas(); };
$('#toggleReference').onclick=()=>{ showReference=!showReference; renderCanvas(); };

$('#imageInput').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ referenceData=reader.result; $('#referenceImage').src=referenceData; toast('Photo loaded'); }; reader.readAsDataURL(f); };
$('#generateFromPhoto').onclick=async()=>{ if(!referenceData){ toast('Upload a UI photo first'); return; } await generateFromImage(referenceData); };
async function generateFromImage(dataUrl){
  const meta=await imageMeta(dataUrl); const dark=meta.avg<118; const isMobile=meta.h>=meta.w; const w=isMobile?390:1200, h=isMobile?844:760;
  const screen={id:uid('screen'),name:isMobile?'Generated Mobile UI':'Generated Web UI',width:w,height:h,bg:dark?'#0f172a':'#f6f7fb',elements:[]};
  if(isMobile){
    screen.elements.push({id:uid('el'),type:'navbar',x:0,y:0,w,h:72,text:'App Header',bg:dark?'#111827':'#ffffff',color:dark?'#fff':'#111827',radius:0,fontSize:16,weight:'800'});
    screen.elements.push({id:uid('el'),type:'text',x:28,y:96,w:290,h:44,text:dark?'Dark UI Title':'Beautiful App UI',bg:'transparent',color:dark?'#f8fafc':'#111827',radius:0,fontSize:28,weight:'900'});
    screen.elements.push({id:uid('el'),type:'input',x:28,y:155,w:334,h:46,text:'Search or type here',bg:dark?'#1e293b':'#ffffff',color:'#64748b',radius:18,fontSize:14,border:dark?'1px solid #334155':'1px solid #e5e7eb'});
    for(let i=0;i<3;i++) screen.elements.push({id:uid('el'),type:'card',x:28,y:230+i*150,w:334,h:124,text:`Editable section ${i+1}`,bg:dark?'#1e293b':'#ffffff',color:dark?'#e2e8f0':'#111827',radius:24,fontSize:16,weight:'800'});
    screen.elements.push({id:uid('el'),type:'button',x:88,y:715,w:214,h:54,text:'Continue',bg:'#2563eb',color:'#fff',radius:22,fontSize:16,weight:'800'});
  }else{
    screen.elements.push({id:uid('el'),type:'navbar',x:0,y:0,w,h:72,text:'Navigation',bg:dark?'#111827':'#ffffff',color:dark?'#fff':'#111827',radius:0,fontSize:15,weight:'800'});
    screen.elements.push({id:uid('el'),type:'card',x:36,y:98,w:236,h:610,text:'Sidebar\n\nDashboard\nProjects\nPeers\nSettings',bg:dark?'#111827':'#ffffff',color:dark?'#e2e8f0':'#111827',radius:26,fontSize:16,weight:'800'});
    screen.elements.push({id:uid('el'),type:'text',x:315,y:110,w:530,h:58,text:'Generated Dashboard UI',bg:'transparent',color:dark?'#f8fafc':'#111827',radius:0,fontSize:36,weight:'900'});
    for(let i=0;i<4;i++) screen.elements.push({id:uid('el'),type:'card',x:315+(i%2)*280,y:205+Math.floor(i/2)*165,w:250,h:130,text:`Metric card ${i+1}`,bg:dark?'#1e293b':'#ffffff',color:dark?'#e2e8f0':'#111827',radius:24,fontSize:18,weight:'900'});
    screen.elements.push({id:uid('el'),type:'button',x:890,y:115,w:180,h:50,text:'New Project',bg:'#10b981',color:'#052e1c',radius:18,fontSize:15,weight:'900'});
  }
  state.screens.push(screen); state.activeScreenId=screen.id; selectedId=null; logAgent('Vision helper generated editable layers from the uploaded photo.'); markDirty('Photo converted to UI');
}
function imageMeta(src){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); c.width=24;c.height=24; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,24,24); const data=ctx.getImageData(0,0,24,24).data; let sum=0; for(let i=0;i<data.length;i+=4) sum+=(data[i]+data[i+1]+data[i+2])/3; res({w:img.width,h:img.height,avg:sum/(data.length/4)}); }; img.src=src; }); }

$('#agentRun').onclick=()=>agent($('#agentCommand').value);
$$('[data-prompt]').forEach(b=>b.onclick=()=>{ $('#agentCommand').value=b.dataset.prompt; agent(b.dataset.prompt); });
function agent(cmd){
  cmd=(cmd||'').toLowerCase(); if(!cmd) return;
  if(cmd.includes('login')) makeLogin(); else if(cmd.includes('dashboard')) makeDashboard(); else if(cmd.includes('shop')||cmd.includes('shopping')) makeShop(); else { activeElements().push({...defaultEl('card'),text:'Agent generated block: '+cmd,x:60,y:120}); }
  logAgent(`Command executed: ${cmd}`); markDirty('Agent updated UI');
}
function makeLogin(){ const s=activeScreen(); s.name='Agent Login Screen'; s.width=390;s.height=844;s.bg='#eef2ff'; s.elements=[
  {id:uid('el'),type:'text',x:34,y:120,w:300,h:56,text:'Welcome Back',bg:'transparent',color:'#111827',radius:0,fontSize:32,weight:'900'},
  {id:uid('el'),type:'text',x:36,y:178,w:280,h:30,text:'Login to continue building.',bg:'transparent',color:'#64748b',radius:0,fontSize:15,weight:'600'},
  {id:uid('el'),type:'input',x:34,y:270,w:322,h:54,text:'Email address',bg:'#fff',color:'#64748b',radius:18,border:'1px solid #dbe1ef'},
  {id:uid('el'),type:'input',x:34,y:340,w:322,h:54,text:'Password',bg:'#fff',color:'#64748b',radius:18,border:'1px solid #dbe1ef'},
  {id:uid('el'),type:'button',x:34,y:425,w:322,h:56,text:'Sign In',bg:'#4f46e5',color:'#fff',radius:20,fontSize:16,weight:'900'},
  {id:uid('el'),type:'card',x:34,y:530,w:322,h:120,text:'Peer collaboration enabled',bg:'#ffffff',color:'#111827',radius:26,fontSize:18,weight:'900'}]; }
function makeDashboard(){ const s=activeScreen(); s.name='Agent Dashboard'; s.width=1200;s.height=760;s.bg='#f8fafc'; s.elements=[]; s.elements.push({id:uid('el'),type:'card',x:28,y:28,w:240,h:704,text:'SouthStack\n\nOverview\nUI Builder\nResources\nAgents',bg:'#111827',color:'#fff',radius:28,fontSize:18,weight:'900'}); s.elements.push({id:uid('el'),type:'text',x:310,y:60,w:450,h:54,text:'Collaborative Dashboard',bg:'transparent',color:'#111827',radius:0,fontSize:34,weight:'900'}); for(let i=0;i<6;i++)s.elements.push({id:uid('el'),type:'card',x:310+(i%3)*275,y:150+Math.floor(i/3)*175,w:245,h:135,text:['Peers online','Screens','Resources','Agent tasks','Exports','Sync status'][i],bg:'#fff',color:'#111827',radius:24,fontSize:20,weight:'900'}); }
function makeShop(){ const s=activeScreen(); s.name='Agent Shopping App'; s.width=390;s.height=844;s.bg='#fff7ed'; s.elements=[{id:uid('el'),type:'text',x:24,y:70,w:300,h:48,text:'Find your style',bg:'transparent',color:'#111827',radius:0,fontSize:30,weight:'900'},{id:uid('el'),type:'input',x:24,y:130,w:342,h:48,text:'Search products',bg:'#fff',color:'#78716c',radius:20,border:'1px solid #fed7aa'},{id:uid('el'),type:'card',x:24,y:205,w:342,h:170,text:'Featured product image',bg:'#fed7aa',color:'#7c2d12',radius:30,fontSize:20,weight:'900'},{id:uid('el'),type:'button',x:92,y:700,w:210,h:54,text:'Add to Cart',bg:'#f97316',color:'#fff',radius:22,fontSize:16,weight:'900'}]; }
function logAgent(t){ state.agentLog = state.agentLog || []; state.agentLog.unshift(new Date().toLocaleTimeString()+ ' — '+t); state.agentLog = state.agentLog.slice(0,20); }
function renderAgentLog(){ $('#agentLog').innerHTML=(state.agentLog||[]).map(x=>`<div>${escapeHtml(x)}</div>`).join(''); }

let mediaRecorder, audioChunks=[];
$('#recordAudio').onclick=async()=>{
  if(mediaRecorder && mediaRecorder.state==='recording'){ mediaRecorder.stop(); $('#recordAudio').textContent='Record voice note'; return; }
  try{ const stream=await navigator.mediaDevices.getUserMedia({audio:true}); audioChunks=[]; mediaRecorder=new MediaRecorder(stream); mediaRecorder.ondataavailable=e=>audioChunks.push(e.data); mediaRecorder.onstop=()=>{ const blob=new Blob(audioChunks,{type:'audio/webm'}); const reader=new FileReader(); reader.onload=()=>{ state.resources.unshift({id:uid('res'),type:'audio',name:'Voice instruction '+new Date().toLocaleTimeString(),data:reader.result}); markDirty('Voice note shared'); }; reader.readAsDataURL(blob); stream.getTracks().forEach(t=>t.stop()); }; mediaRecorder.start(); $('#recordAudio').textContent='Stop recording'; toast('Recording started'); }catch(e){ toast('Microphone not available'); }
};
function renderResources(){ $('#resourcesList').innerHTML=(state.resources||[]).map(r=>`<div class="resource"><strong>${escapeHtml(r.name)}</strong>${r.type==='audio'?`<audio src="${r.data}" controls></audio>`:''}</div>`).join(''); }
function renderPeers(){ const peers=state?state._peers||[]:[]; $('#peerCount').textContent=`${peers.length||1} peer${peers.length===1?'':'s'}`; $('#peersList').innerHTML=peers.map(p=>`<div class="peer">🟢 ${escapeHtml(p.name)} <small>${p.id===clientId?'(you)':''}</small></div>`).join('') || '<div class="peer">Waiting for LAN peers...</div>'; }

$('#exportBtn').onclick=()=>{ const s=activeScreen(); const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#e5e7eb;font-family:Arial}.screen{position:relative;width:${s.width}px;height:${s.height}px;background:${s.bg};overflow:hidden}.el{position:absolute;display:flex;align-items:center;justify-content:center;white-space:pre-wrap}</style></head><body><div class="screen">${s.elements.map(e=>`<div class="el" style="left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;background:${e.bg};color:${e.color};border-radius:${e.radius||0}px;font-size:${e.fontSize||14}px;font-weight:${e.weight||600};border:${e.border||'0'}">${escapeHtml(e.text||labelFor(e.type))}</div>`).join('')}</div></body></html>`; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=s.name.replace(/\W+/g,'_')+'.html'; a.click(); };
$('#resetBtn').onclick=async()=>{ if(confirm('Reset shared project for all peers?')){ await fetch('/api/reset',{method:'POST'}); state=null; fetchState(); } };
function runAction(action){ if(!action) return; if(action.startsWith('alert:')) alert(action.slice(6)); if(action.startsWith('go:')){ const target=state.screens.find(s=>s.name.toLowerCase().includes(action.slice(3).toLowerCase())); if(target){state.activeScreenId=target.id;render();} } }
function labelFor(t){ return ({text:'Text',button:'Button',input:'Input',card:'Card',image:'Image',navbar:'Navbar'})[t]||'Layer'; }
function escapeHtml(x){ return String(x||'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function colorToHex(c){ if(!c||c==='transparent') return '#ffffff'; if(c.startsWith('#')) return c.slice(0,7); return '#ffffff'; }
