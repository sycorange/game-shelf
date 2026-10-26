// Lantern Lake smoke tests. Starts the local harness (in-memory database, nothing real is touched),
// plays through the main features in a headless browser on desktop and phone sizes, and prints PASS/FAIL.
// Run from the repo root:  node tests/smoke.mjs      (needs Node 22+ and Playwright, see tests/README.md)
import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PORT=+process.env.PORT||8799,URL0=`http://127.0.0.1:${PORT}/lantern-lake/?season=off`;
const pw=await import(process.env.PW||'playwright');const chromium=pw.chromium||pw.default.chromium;
const srv=spawn(process.execPath,[path.join(HERE,'harness.mjs')],{env:{...process.env,PORT:String(PORT),EXPOSE:'1'},stdio:['ignore','pipe','pipe']});
await new Promise((ok,bad)=>{const t=setTimeout(()=>bad(new Error('harness did not start')),15000);srv.stdout.on('data',d=>{if(String(d).includes('harness on')){clearTimeout(t);ok()}});srv.on('exit',c=>bad(new Error('harness exited '+c)))});

const results=[];let fails=0;
async function check(name,fn){const t0=Date.now();try{const r=await Promise.race([fn(),new Promise((_,bad)=>setTimeout(()=>bad(new Error('timed out after 90s')),90000))]);if(r===false)throw new Error('returned false');results.push(['PASS',name]);console.log('✔ PASS  '+name+` (${((Date.now()-t0)/1000).toFixed(1)}s)`)}catch(e){fails++;const m=name+' — '+String(e.message||e).split('\n').slice(0,3).join(' | ');results.push(['FAIL',m]);console.log('✘ FAIL  '+m)}}
const ok=(c,msg)=>{if(!c)throw new Error(msg)};
const today=new Date().toLocaleDateString('en-CA');
const save=(o)=>Object.assign({coins:500000,shack:3,boat:2,water:'lake',min:720,day:30,total:900,log:{},recent:[],q:{step:7},streak:{last:today,count:1,claimed:true},last:Date.now(),set:{cut:'off'}},o);
const b=await chromium.launch();
async function page(vp,state,keepAway){const c=await b.newContext({viewport:vp,acceptDownloads:true});await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},state);
  const p=await c.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(URL0);await p.waitForTimeout(700);await p.click('#tGo');await p.waitForTimeout(700);
  if(!keepAway)await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));return p}
const VPS=[['desktop',{width:1100,height:860}],['phone',{width:390,height:760}]];
await check('game page loads with no script errors',async()=>{const c=await b.newContext();const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0);await p.waitForTimeout(1500);
  ok(!errs.length,errs.join('; '));ok(await p.isVisible('#tGo'),'Play button missing');await c.close()});

for(const [tag,vp] of VPS){
  await check(`${tag}: yard converts old decor, editor drag, land, dock fishing`,async()=>{const p=await page(vp,save({decor:{flowers:1,mailbox:1,gnome:1,fence:1,jacks:1},sleep:{ph:'yard',t:0,visit:true},coins:50000}));await p.waitForTimeout(1500);
    const it=await p.evaluate(()=>yardList().map(a=>a[0]));ok(it.filter(x=>x==='flowers').length===5&&it.includes('jacks')&&it.filter(x=>x.startsWith('tree_')).length===2,'conversion '+it.join());
    await p.evaluate(()=>yedEnter());await p.waitForTimeout(800);
    const r=await p.evaluate(()=>{const a=yardList().find(a=>a[0]==='gnome'),T=getCAMT(),cv=document.querySelector('#cv'),R=cv.getBoundingClientRect(),sx=(wx,wy)=>[R.left+((wx*T.z+T.ox)*BASE.s+BASE.ox)/cv.width*R.width,R.top+((wy*T.z+T.oy)*BASE.s+BASE.oy)/cv.height*R.height];return {f:sx(a[1],a[2]-10),t:sx(a[1]-20,a[2]+20),a:[...a]}});
    await p.mouse.move(...r.f);await p.mouse.down();await p.mouse.move(r.f[0]+6,r.f[1]+6,{steps:2});await p.mouse.move(...r.t,{steps:6});await p.mouse.up();
    const g=await p.evaluate(()=>yardList().find(a=>a[0]==='gnome'));ok(g[1]!==r.a[1]||g[2]!==r.a[2],'gnome did not move');
    await p.evaluate(()=>{yedExit();openLand(1)});await p.click('#landBuy');ok(await p.evaluate(()=>S.yard.land===1&&S.coins===47500),'land purchase');
    await p.evaluate(()=>dockFishToggle());await p.waitForTimeout(1500);ok(await p.evaluate(()=>dockFishing()&&getCast().el>.5),'dock fishing not casting');
    ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

  await check(`${tag}: paths, fences, house paint and the visitor snapshot`,async()=>{const p=await page(vp,save({shack:6,sleep:{ph:'yard',t:0,visit:true}}));await p.waitForTimeout(800);
    await p.evaluate(()=>yedEnter());await p.click('[data-yt="build"]');for(let i=0;i<3;i++)await p.click('[data-yb="hedge"]');
    ok(await p.evaluate(()=>{const h=yardList().filter(a=>a[0]==='hedge');return h.length===3&&new Set(h.map(a=>a[1])).size===3}),'hedges stacked');
    await p.evaluate(()=>{S.yard.gu.brick=1;YED.brush='brick';for(let i=-3;i<12;i++)for(let j=0;j<16;j++)paintAt(i*10+5,244+j*10+5);YED.brush='dirt';paintAt(5,300)});
    await p.click('[data-yt="house"]');await p.click('[data-yc="1"]');await p.click('#yedDone');
    const rt=await p.evaluate(()=>{const e=mpCabin().ext,y=yardParse(JSON.parse(JSON.stringify(e.yard)));return [Object.keys(S.yard.g).length,Object.keys(y.g).length,e.yard.g.length,y.hc.wall]});
    ok(rt[0]>50&&rt[0]===rt[1],'ground round trip '+rt);ok(rt[2]<rt[0]*4,'ground not packed: '+rt[2]+' chars');ok(rt[3]===1,'paint lost');
    ok(await p.evaluate(()=>{const g={};yardParse({it:[],g:'2,6,brick;3,6,stones'}).g;return Object.keys(yardParse({it:[],g:'2,6,brick;3,6,stones'}).g).length===2}),'old ground format unreadable');
    ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

  await check(`${tag}: fruit trees, garden plot, pantry`,async()=>{const p=await page(vp,save({hunger:50,sleep:{ph:'yard',t:0,visit:true},rate:2000}));await p.waitForTimeout(800);
    await p.evaluate(()=>{for(const a of S.yard.it)if(a[0].startsWith('tree_'))a[4]=Date.now()-5*36e5;const i=S.yard.it.findIndex(a=>a[0].startsWith('tree_'));treeTap({i,id:S.yard.it[i][0],t:S.yard.it[i][4]})});
    ok(await p.evaluate(()=>Object.values(S.pantry).reduce((a,b)=>a+b,0)===3),'pick');
    await p.evaluate(()=>yedEnter());await p.click('[data-yt="build"]');await p.click('[data-yb="plot"]');await p.click('#yedDone');
    await p.evaluate(()=>openPlot(S.yard.it.findIndex(a=>a[0]==='plot')));await p.click('[data-crop="carrot"]');await p.evaluate(()=>{const a=S.yard.it.find(a=>a[0]==='plot');a[4]=Date.now()-36e5;openPlot(S.yard.it.indexOf(a))});await p.click('#plotGo');
    ok(await p.evaluate(()=>S.pantry.carrot===3),'harvest');const c0=await p.evaluate(()=>S.coins);await p.evaluate(()=>pantryAct('s','carrot'));ok(await p.evaluate(c0=>S.coins-c0===105,c0),'sell');
    ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

  await check(`${tag}: cabin keeps old wall spots, crafts and arranges furniture, themes`,async()=>{const p=await page(vp,save({mats:{fabric:50,drift:50},cab:{col:{},own:{fern:1,pennant:1,wheel:1},bed:'cot',rug:'round',lamp:null,wall:['pennant',null,'wheel'],ex:{fern:1}},sleep:{ph:'awake',t:0,visit:true}}));await p.waitForTimeout(800);
    ok(await p.evaluate(()=>JSON.stringify(CAB().wd)==='[["pennant",58,108],["wheel",946,128]]'&&CAB().fp[0][0]==='fern'),'conversion');
    await p.evaluate(()=>{craftCos('armchair');document.querySelectorAll('.away').forEach(m=>m.hidden=true)});ok(await p.evaluate(()=>CAB().fp.some(a=>a[0]==='armchair')),'armchair not placed');
    await p.click('#arrBtn');ok(await p.evaluate(()=>CED.on),'arrange mode');await p.click('#cedDone');
    await p.evaluate(()=>openDeco());await p.click('[data-th="naut"]');ok(await p.evaluate(()=>CAB().pat.w==='stripes'&&CAB().col.walls===4),'theme');
    ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

  await check(`${tag}: away summary stays compact`,async()=>{const p=await page(vp,save({shack:6,boat:7,rod:8,lure:8,water:'ocean',day:90,last:Date.now()-8*36e5}),true);
    const r=await p.evaluate(()=>[document.getElementById('away').hidden,document.querySelector('#away .box').getBoundingClientRect().height,innerHeight,document.querySelectorAll('#away details').length]);
    ok(!r[0],'summary did not open');ok(r[1]>100&&r[1]<=r[2],'height '+r[1]+' vs screen '+r[2]);ok(r[3]>=2,'sections missing');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

  await check(`${tag}: photo mode hides the UI`,async()=>{const p=await page(vp,save({sleep:{ph:'yard',t:0,visit:true}}));await p.click('#photoBtn');
    ok(await p.evaluate(()=>getComputedStyle(document.getElementById('ynav')).display==='none'&&!document.getElementById('photoBar').hidden),'still showing');await p.click('#photoDone');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});
}

await check('Mirror Match: every round is mirrored, misses replay the same arrows, winnable',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(async()=>{const M={L:'R',A:'A',R:'L'},w=ms=>new Promise(r=>setTimeout(r,ms));mmOpen();const out={mir:true,same:null,won:false};
    for(let round=0;round<5;round++){let t=0;while(MM.ph!=='input'&&t++<200)await w(50);const want=MM.seq.map(d=>M[d]);if(JSON.stringify(want)!==JSON.stringify(MM.want))out.mir=false;
      if(round===2){const before=MM.seq.join('');mmInput(MM.want[0]==='L'?'R':'L');t=0;while(MM.ph!=='input'&&t++<200)await w(50);out.same=MM.seq.join('')===before}
      for(const d of MM.want)mmInput(d);await w(30)}
    out.won=MM.done&&MM.round>=5;MM.on=false;return out});
  ok(r.mir,'a round was not a plain mirror');ok(r.same===true,'retry showed new arrows');ok(r.won,'could not win');await p.context().close()});

await check('pets: adopt, dress up, daily pet bonus, shows in boat, yard, cabin and for visitors',async()=>{const p=await page(VPS[1][1],save({stamina:50}));
  await p.evaluate(()=>{openPhone();phShow('shop')});await p.click('text=🐾 Pets');await p.fill('[data-pn="cat"]','Miso');await p.click('[data-padopt="cat"]');await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));
  await p.click('[data-pacc="cat:bow"]');ok(await p.evaluate(()=>{const c=curPet();return c&&c.name==='Miso'&&c.acc==='bow'&&S.coins===500000-5000-500}),'adopt/dress');
  await p.evaluate(()=>closePhone());await p.waitForTimeout(600);ok(await p.evaluate(()=>getHits().some(h=>h.kind==='fpet')),'not in the boat');
  await p.evaluate(()=>{petTap();petTap()});ok(await p.evaluate(()=>S.stamina>=59&&S.stamina<61),'daily bonus not exactly once');
  ok(await p.evaluate(()=>mpCabin().pet.name==='Miso'),'not sent to visitors');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('app: installable (manifest, icons, service worker) and Settings shows App and alerts',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(async()=>{const m=await (await fetch('manifest.webmanifest')).json();const ic=await fetch('icon-512.png');let sw=false;for(let i=0;i<40&&!sw;i++){sw=!!(await navigator.serviceWorker.getRegistration());await new Promise(r=>setTimeout(r,100))}
    openPhone();phShow('settings');return {name:m.name,disp:m.display,icons:m.icons.length,ic:ic.ok,sw,txt:document.getElementById('setBody').textContent.includes('App and alerts')}});
  ok(r.name==='Lantern Lake'&&r.disp==='standalone'&&r.icons>=3&&r.ic,'manifest '+JSON.stringify(r));ok(r.sw,'service worker not registered');ok(r.txt,'settings section missing');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('alerts: likes, guestbook, visits, texts and timed garden alerts arrive encrypted; none while playing; per-kind opt-out',async()=>{const crypto=await import('node:crypto');
  const ua=crypto.createECDH('prime256v1');ua.generateKeys();const auth=crypto.randomBytes(16),b64=x=>Buffer.from(x).toString('base64url');
  const keys={p256dh:b64(ua.getPublicKey()),auth:b64(auth)},H=`http://127.0.0.1:${PORT}`;await fetch(H+'/__pushes?clear=1');
  const p=await page(VPS[0][1],save({}));
  const ids=await p.evaluate(async(keys)=>{const R=Math.floor(Math.random()*1e5),A=await api('hello',{name:'Pa'+R}),B=await api('hello',{name:'Pb'+R});
    await api('sync',{id:A.id,key:A.key,stats:{},cabin:JSON.stringify({cab:{col:{}},ext:{shack:2}})});await api('push/sub',{id:A.id,key:A.key,sub:{endpoint:'https://push.test/'+A.id,keys},prefs:{garden:true,yard:true,texts:true}});return {A,B}},keys);
  const seenOld=()=>fetch(`${H}/__seen?pid=${ids.A.id}&ago=900000`);
  // playing right now: nothing is sent
  await p.evaluate(async({A,B})=>{await api('guest/like',{id:B.id,key:B.key,to:A.id})},ids);let got=await (await fetch(H+'/__pushes')).json();ok(got.length===0,'sent while playing');
  await seenOld();
  await p.evaluate(async({A,B})=>{await api('guest/sign',{id:B.id,key:B.key,to:A.id,st:1,note:'hi'});await api('cabin',{id:B.id,key:B.key,target:A.id});await api('cabin',{id:B.id,key:B.key,target:A.id});await api('texts/send',{id:B.id,key:B.key,to:A.id,body:'nice yard!'})},ids);
  await new Promise(r=>setTimeout(r,400));
  await p.evaluate(async({A})=>{await api('sync',{id:A.id,key:A.key,stats:{},alerts:[{k:'crop',due:Date.now()+300},{k:'fruit',due:0}]})},ids);await seenOld();await new Promise(r=>setTimeout(r,500));await fetch(H+'/__cron');
  got=await (await fetch(H+'/__pushes?clear=1')).json();
  const dec=g=>{const body=Buffer.from(g.b,'base64'),salt=body.subarray(0,16),n=body[20],asPub=body.subarray(21,21+n),ct=body.subarray(21+n),sh=ua.computeSecret(asPub),hk=(s,i,f,l)=>Buffer.from(crypto.hkdfSync('sha256',i,s,f,l));
    const ikm=hk(auth,sh,Buffer.concat([Buffer.from('WebPush: info\0'),ua.getPublicKey(),asPub]),32),cek=hk(salt,ikm,Buffer.from('Content-Encoding: aes128gcm\0'),16),iv=hk(salt,ikm,Buffer.from('Content-Encoding: nonce\0'),12);
    const d=crypto.createDecipheriv('aes-128-gcm',cek,iv);d.setAuthTag(ct.subarray(-16));const pt=Buffer.concat([d.update(ct.subarray(0,-16)),d.final()]);return JSON.parse(pt.subarray(0,-1).toString())};
  const titles=got.map(dec).map(m=>m.tag);ok(JSON.stringify(titles.sort())===JSON.stringify(['crop','guest','text-'+ids.B.id,'visit'].sort()),'got '+titles.join(','));
  ok(got.every(g=>String(g.h.Authorization||'').startsWith('vapid t=')),'missing VAPID header');
  // opting out of yard alerts stops them
  await p.evaluate(async({A,keys})=>{await api('push/sub',{id:A.id,key:A.key,sub:{endpoint:'https://push.test/'+A.id,keys},prefs:{garden:true,yard:false,texts:true}})},{A:ids.A,keys});await seenOld();
  const C=await p.evaluate(async()=>api('hello',{name:'Pc'+Math.floor(Math.random()*1e5)}));await p.evaluate(async({A,C})=>{await api('guest/like',{id:C.id,key:C.key,to:A.id})},{A:ids.A,C});
  got=await (await fetch(H+'/__pushes?clear=1')).json();ok(got.length===0,'yard alert sent after opting out');await p.context().close()});

await check('pet fun: one gift a day, fetch round trip, pet house; next goals card shows, links and hides',async()=>{const p=await page(VPS[0][1],save({pets:{own:{dog:{name:'Biscuit',coat:0,acc:'none'}},out:'dog',day:'',acc:{}},sleep:{ph:'yard',t:0,visit:true}}));
  ok(await p.evaluate(()=>petGiftReady()),'no gift waiting');await p.evaluate(()=>{petTap();petTap()});ok(await p.evaluate(()=>!petGiftReady()),'gift not taken');
  await p.evaluate(()=>yedEnter());await p.click('[data-yt="build"]');await p.click('[data-yb="pethouse"]');await p.click('#yedDone');ok(await p.evaluate(()=>yardList().some(a=>a[0]==='pethouse')),'pet house');
  await p.click('#vbFetch');let done=false;for(let i=0;i<30&&!done;i++){await p.waitForTimeout(500);done=await p.evaluate(()=>!PET_RT.fetch)}ok(done,'fetch never finished');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close();
  const q=await page(VPS[1][1],save({coins:3000,total:200}));await q.waitForTimeout(600);const t=await q.evaluate(()=>{const e=document.getElementById('goals');return e.hidden?'':e.textContent});ok(t.includes('Adopt a pet'),'goals: '+t);
  await q.click('[data-gl="pet"]');ok(await q.evaluate(()=>document.getElementById('shopBody').textContent.includes('Lakeside Rescue')),'pet button');await q.evaluate(()=>closePhone());
  await q.click('#glHide');ok(await q.evaluate(()=>document.getElementById('goals').hidden),'hide');ok(!q.errs.length,q.errs.join('; '));await q.context().close()});

await check('weather: charm lets weather-only fish bite in any weather; weather alerts land on the right block and get sent',async()=>{const p=await page(VPS[0][1],save({water:'pond',min:1300}));
  await p.evaluate(()=>{openPhone();phShow('shop')});await p.click('text=Supplies');await p.click('#buyCharm');ok(await p.evaluate(()=>S.pots.charm===1),'charm not bought');await p.evaluate(()=>closePhone());
  const r=await p.evaluate(()=>{S.wx={id:'clear',left:60};const f=FISH.find(x=>x.id==='stormkoi'),before=bitingNow(f);usePotion('charm');return {before,after:bitingNow(f),buff:S.buffs.charm}});
  ok(r.before===false&&r.after===true&&r.buff===600,'charm '+JSON.stringify(r));
  const al=await p.evaluate(()=>{SETS().push=true;const a=alertsDue(),w=a.find(x=>x.k==='wx:storm');return {due:w.due,blk:w.due?wxOfBlock(w.due/WXB_MS):null,prev:w.due?wxOfBlock(w.due/WXB_MS-1):null,fog:a.find(x=>x.k==='wx:fog').due}});
  ok(al.due>Date.now()&&al.blk==='storm'&&al.prev!=='storm','storm alert at '+JSON.stringify(al));ok(al.fog===0,'fog alert should be off by default');
  const crypto=await import('node:crypto');const ua=crypto.createECDH('prime256v1');ua.generateKeys();const keys={p256dh:Buffer.from(ua.getPublicKey()).toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')},H=`http://127.0.0.1:${PORT}`;await fetch(H+'/__pushes?clear=1');
  const A=await p.evaluate(async(keys)=>{const A=await api('hello',{name:'Wx'+Math.floor(Math.random()*1e5)});await api('push/sub',{id:A.id,key:A.key,sub:{endpoint:'https://push.test/wx'+A.id,keys}});await api('sync',{id:A.id,key:A.key,stats:{},alerts:[{k:'wx:storm',due:Date.now()+120000},{k:'bogus',due:Date.now()}]});return A},keys);
  await fetch(`${H}/__seen?pid=${A.id}&ago=900000`);await fetch(H+'/__cron');const got=await (await fetch(H+'/__pushes?clear=1')).json();ok(got.length===1,'weather alert count '+got.length);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('walking: tap to walk, WASD, onto the dock, stays on land, pet follows, Go inside walks to the door',async()=>{const p=await page(VPS[0][1],save({pets:{own:{dog:{name:'B',coat:0,acc:'none'}},out:'dog',day:'x',gift:'x',acc:{}},sleep:{ph:'yard',t:0,visit:true}}));await p.waitForTimeout(1200);
  ok(await p.evaluate(()=>walkCtx()==='home'),'not walking in the yard');await p.evaluate(()=>{WALK.tx=20;WALK.ty=300});await p.waitForTimeout(3200);
  let r=await p.evaluate(()=>[WALK.x,WALK.y,PET_RT.x,PET_RT.y]);ok(Math.abs(r[0]-20)<1&&Math.abs(r[1]-300)<1,'tap-walk '+r);ok(Math.hypot(r[2]-r[0],r[3]-r[1])<60,'pet did not follow '+r);
  await p.keyboard.down('d');await p.waitForTimeout(5000);await p.keyboard.up('d');r=await p.evaluate(()=>[WALK.x,WALK.y,yShoreX(WALK.y)]);ok(r[0]<=r[2],'walked into the lake '+r);
  await p.evaluate(()=>{WALK.tx=999;WALK.ty=246});await p.waitForTimeout(6000);r=await p.evaluate(()=>[WALK.x,WALK.y]);ok(r[0]>200&&r[1]===246,'not on the dock '+r);
  await p.evaluate(()=>document.getElementById('vbIn').click());await p.waitForTimeout(7000);ok(await p.evaluate(()=>S.sleep.ph!=='yard'),'never went inside');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('yard games: buy from the Games tab, cornhole scoring, hoop swish, tickets, tire swing',async()=>{const p=await page(VPS[0][1],save({coins:50000,sleep:{ph:'yard',t:0,visit:true}}));
  await p.evaluate(()=>yedEnter());await p.click('[data-yt="games"]');for(const g of ['cornhole','hoop','tireswing'])await p.click(`[data-yb="${g}"]`);
  await p.evaluate(()=>{const L=S.yard.it,set=(id,x,y)=>{const a=L.find(a=>a[0]===id);a[1]=x;a[2]=y};set('cornhole',40,330);set('hoop',60,370);set('tireswing',110,290)});await p.click('#yedDone');ok(await p.evaluate(()=>S.coins===40000),'prices');
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='cornhole')));let on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}ok(on,'never started cornhole');
  const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));for(const v of [.79,.72,.2,.79,.74]){YG.on.pow=v;ygThrow();await w(950)}return [YG.on.score,YG.on.done]});ok(r[0]===8&&r[1],'cornhole '+r);
  const t0=await p.evaluate(()=>ARC().t);await p.evaluate(()=>ygEnd());ok(await p.evaluate(t0=>ARC().t-t0===16,t0),'tickets');
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='hoop')));on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}
  const h=await p.evaluate(async()=>{YG.on.t0=performance.now()-714;ygThrow();await new Promise(r=>setTimeout(r,1100));return YG.on.score});ok(h===1,'hoop make');await p.evaluate(()=>ygEnd());
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='tireswing')));on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}ok(on,'swing');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('after Halloween: keepsakes only for owners, costumes in Settings',async()=>{for(const own of [true,false]){const p=await page(VPS[0][1],save({decor:own?{jacks:1}:{},hw:own?{pk:20,candy:0,wear:'vamp',gg:0,fish:{}}:undefined}));
    await p.evaluate(()=>{openPhone();phShow('shop')});await p.waitForTimeout(300);const t=await p.evaluate(()=>[...document.querySelectorAll('.shop-h h3')].map(h=>h.textContent).join('|'));
    ok(own?t.includes('Halloween keepsakes'):!t.includes('Halloween'),'shop: '+t);
    await p.evaluate(()=>phShow('settings'));const cos=await p.evaluate(()=>document.querySelectorAll('[data-cos]').length);ok(own?cos===3:cos===0,'costume buttons '+cos);await p.context().close()}});

await check('visiting: broken friend data is ignored, cabin and yard draw',async()=>{const p=await page(VPS[0][1],save({}));
  await p.evaluate(()=>{const cab={col:{walls:4},own:{armchair:1,wheel:1},wall:[null,null,null],ex:{},wd:[['wheel',500,150],['bogus',1,1]],fp:[['armchair',300,470,1],['evil',1,1]],pat:{w:'fish',f:'zzz'}};
    setVT({id:'x',name:'Pal',c:{cab,trophies:[],coll:[]},ext:{shack:3,decor:{},off:{},boxes:[],trophies:[],yard:yardParse({land:9,it:[['tree_plum',0,300,0,1],['nope',1,1,0]],g:'3=0.4.b,9.2.q'})}});S.sleep={ph:'door',at:'friend',t:0,visit:true}});
  await p.waitForTimeout(1500);await p.evaluate(()=>enterFriend());await p.waitForTimeout(1500);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('server: likes, Yard of the Week board, random yard, champion flag',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(async()=>{const R=Math.floor(Math.random()*1e5),A=await api('hello',{name:'Ta'+R}),B=await api('hello',{name:'Tb'+R});const cab=JSON.stringify({cab:{col:{}},ext:{shack:2}});
    for(const P of [A,B])await api('sync',{id:P.id,key:P.key,stats:{},cabin:cab});await api('guest/like',{id:B.id,key:B.key,to:A.id});
    const top=await api('yard/top',{id:B.id,key:B.key}),rnd=await api('yard/random',{id:B.id,key:B.key}),c=await api('cabin',{id:B.id,key:B.key,target:A.id});return {top:top.top.map(x=>x.name+':'+x.n),rnd:rnd.name,champ:c.champ,A:A.name,B:B.name}});
  ok(r.top.includes(r.A+':1'),'board '+r.top);ok(r.rnd&&r.rnd!==r.B,'random '+r.rnd);ok(r.champ===false,'champ flag');await p.context().close()});

await b.close();srv.kill();
console.log(`\n${results.length-fails}/${results.length} passed`);process.exit(fails?1:0);
