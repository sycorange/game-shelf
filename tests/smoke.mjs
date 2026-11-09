// Lantern Lake smoke tests. Starts the local harness (in-memory database, nothing real is touched),
// plays through the main features in a headless browser on desktop and phone sizes, and prints PASS/FAIL.
// Run from the repo root:  node tests/smoke.mjs      (needs Node 22+ and Playwright, see tests/README.md)
import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PORT=+process.env.PORT||8799,URL0=`http://127.0.0.1:${PORT}/lantern-lake/?season=off`;
const pw=await import(process.env.PW||'playwright');const chromium=pw.chromium||pw.default.chromium;
const srv=spawn(process.execPath,[path.join(HERE,'harness.mjs')],{env:{...process.env,PORT:String(PORT),EXPOSE:'1'},stdio:['ignore','pipe','pipe']});
await new Promise((ok,bad)=>{const t=setTimeout(()=>bad(new Error('harness did not start')),15000);srv.stdout.on('data',d=>{if(String(d).includes('harness on')){clearTimeout(t);ok()}});srv.on('exit',c=>bad(new Error('harness exited '+c)))});

const results=[];let fails=0;
// Checks are queued, then run two at a time (CONC, default 2). Checks that use the harness's shared push log
// (__pushes, __cron, __seen) run one at a time after the rest. Pass words to run only matching checks:
//   node tests/smoke.mjs harvest save      (any check whose name contains "harvest" or "save")
// Checks that play real-time minigames or walk characters around get flaky when the CPU is shared, so they run alone too.
const SOLO=['horseshoes','yard games','open house','case 5','hangouts','pet','mirror match','town','harvest basket','harvest fair','phone controls'];
const ONLY=process.argv.slice(2).map(s=>s.toLowerCase()),CONC=Math.max(1,+process.env.CONC||2),JOBS=[];
function check(name,fn){if(ONLY.length&&!ONLY.some(w=>name.toLowerCase().includes(w)))return Promise.resolve();JOBS.push({name,fn,solo:/__pushes|__cron|__seen/.test(fn.toString())||SOLO.some(w=>name.toLowerCase().includes(w))});return Promise.resolve()}
async function runCheck({name,fn}){const t0=Date.now();try{const r=await Promise.race([fn(),new Promise((_,bad)=>setTimeout(()=>bad(new Error('timed out after 150s')),150000))]);if(r===false)throw new Error('returned false');results.push(['PASS',name]);console.log('✔ PASS  '+name+` (${((Date.now()-t0)/1000).toFixed(1)}s)`)}catch(e){fails++;const m=name+' — '+String(e.message||e).split('\n').slice(0,3).join(' | ');results.push(['FAIL',m]);console.log('✘ FAIL  '+m)}}
async function runAll(){const par=JOBS.filter(j=>!j.solo),solo=JOBS.filter(j=>j.solo);let k=0;
  await Promise.all(Array.from({length:Math.min(CONC,par.length)},async()=>{while(k<par.length)await runCheck(par[k++])}));
  for(const j of solo)await runCheck(j)}
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
    await p.mouse.move(...r.f);await p.mouse.down();await p.mouse.move(r.f[0]+40,r.f[1]+30,{steps:4});await p.mouse.up();ok(await p.evaluate(a=>{const g=yardList().find(b=>b[0]==='gnome');return g[1]===a[1]&&g[2]===a[2]},r.a),'gnome moved before it was selected');
    Object.assign(r,await p.evaluate(()=>{const a=yardList().find(a=>a[0]==='gnome'),bb=yBoxM(a),T=getCAMT(),cv=document.querySelector('#cv'),R=cv.getBoundingClientRect(),sx=(wx,wy)=>[R.left+((wx*T.z+T.ox)*BASE.s+BASE.ox)/cv.width*R.width,R.top+((wy*T.z+T.oy)*BASE.s+BASE.oy)/cv.height*R.height];return {f:sx(bb[0]+bb[2]/2,bb[1]+bb[3]*.6),t:sx(a[1]-20,a[2]+20),a:[...a],bb}}));
    await p.mouse.click(...r.f);await p.waitForTimeout(200);ok(await p.evaluate(()=>yardList()[YED.sel]&&yardList()[YED.sel][0]==='gnome'),'tap selects the gnome '+JSON.stringify(r.bb));
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
    ok(await p.evaluate(()=>{const f=FIDS.find(x=>x!==nativeOf());S.rate=9e6;S.rateL=9e6;const cap=fruitPrice(f);S.rateL=3000;const steady=fruitPrice(f);return cap===30000&&steady===1000&&fruitPrice(nativeOf())===200}),'fruit price: long-term income, capped at $30,000');
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
  await p.evaluate(()=>{WALK.x=60;WALK.y=340;WALK.tx=WALK.ty=null;WALK.face=1});await p.waitForTimeout(300);await p.click('#vbFetch');
  const f=await p.evaluate(()=>PET_RT.fetch&&[Math.round(PET_RT.fetch.hx),Math.round(PET_RT.fetch.hy),Math.abs(PET_RT.fetch.tx-60)>=40]);ok(f&&f[0]===60&&f[1]===340&&f[2],'ball thrown from where you stand '+f);
  done=false;for(let i=0;i<30&&!done;i++){await p.waitForTimeout(500);done=await p.evaluate(()=>!PET_RT.fetch)}ok(done&&await p.evaluate(()=>Math.hypot(PET_RT.x-WALK.x,PET_RT.y-WALK.y)<30),'pet brings it back to you');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close();
  const q=await page(VPS[1][1],save({coins:3000,total:200}));await q.waitForTimeout(600);let t='';for(let i=0;i<3&&!t.includes('Adopt a pet');i++){if(i)await q.click('#glNext');t=await q.evaluate(()=>{const e=document.getElementById('goals');return e.hidden?'':e.textContent})}ok(t.includes('Adopt a pet'),'goals: '+t);
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
  ok(await p.evaluate(()=>{WALK.tx=WALK.x>60?20:120;WALK.ty=330;return new Promise(r=>setTimeout(()=>r(document.getElementById('scene').classList.contains('ytuck')),400))}),'bar tucks while walking');
  await p.waitForFunction(()=>!document.getElementById('scene').classList.contains('ytuck'),null,{timeout:20000});await p.click('#vbView');ok(await p.isVisible('[data-yf="dock"]'),'camera views behind View');await p.click('[data-yf="dock"]');ok(await p.evaluate(()=>!document.getElementById('scene').classList.contains('vpop')),'views close');
  await p.evaluate(()=>document.getElementById('vbIn').click());await p.waitForTimeout(7000);ok(await p.evaluate(()=>S.sleep.ph!=='yard'),'never went inside');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('yard games: buy from the Games tab, cornhole scoring, hoop swish, tickets, tire swing',async()=>{const p=await page(VPS[0][1],save({coins:50000,sleep:{ph:'yard',t:0,visit:true}}));
  await p.evaluate(()=>yedEnter());await p.click('[data-yt="games"]');for(const g of ['cornhole','hoop','tireswing'])await p.click(`[data-yb="${g}"]`);
  await p.evaluate(()=>{const L=S.yard.it,set=(id,x,y)=>{const a=L.find(a=>a[0]===id);a[1]=x;a[2]=y};set('cornhole',40,330);set('hoop',60,370);set('tireswing',110,290)});await p.click('#yedDone');ok(await p.evaluate(()=>S.coins===40000),'prices');
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='cornhole')));let on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}ok(on,'never started cornhole');
  {const ends=[];for(const ms of [250,700]){const bb=await p.locator('#ygAct').boundingBox();await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await p.mouse.down();await p.waitForTimeout(ms);await p.mouse.up();ends.push(await p.evaluate(()=>YG.on.proj&&YG.on.proj.ex));await p.waitForTimeout(1000)}
    ok(ends[0]!=null&&ends[1]!=null&&ends[1]-ends[0]>20,'longer hold throws farther '+ends);await p.evaluate(()=>Object.assign(YG.on,{score:0,shots:0,streak:0,bags:[],done:false}))}
  const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));for(const v of [.79,.72,.2,.79,.74]){YG.on.pow=v;ygThrow();await w(950)}return [YG.on.score,YG.on.done]});ok(r[0]===8&&r[1],'cornhole '+r);
  ok(await p.evaluate(async()=>{const had=YG.on.bags.length;await new Promise(r=>setTimeout(r,1900));return had>0&&YG.on.bags.length===0}),'bags clear after the last throw');
  {const w0=await p.evaluate(()=>[WALK.x,WALK.y]);await p.keyboard.down('d');await p.waitForTimeout(300);await p.keyboard.up('d');const w1=await p.evaluate(()=>[WALK.x,WALK.y]);ok(w0[0]===w1[0]&&w0[1]===w1[1],'walked while playing')}
  const t0=await p.evaluate(()=>ARC().t);await p.evaluate(()=>ygEnd());ok(await p.evaluate(t0=>ARC().t-t0===16,t0),'tickets');
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='hoop')));on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}
  const h=await p.evaluate(async()=>{YG.on.t0=performance.now()-714;ygThrow();await new Promise(r=>setTimeout(r,1100));return YG.on.score});ok(h===1,'hoop make');await p.evaluate(()=>ygEnd());
  await p.evaluate(()=>ygStart(S.yard.it.findIndex(a=>a[0]==='tireswing')));on=false;for(let i=0;i<20&&!on;i++){await p.waitForTimeout(400);on=await p.evaluate(()=>!!YG.on)}ok(on,'swing');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('open house: host and guests see each other walk, chat, pets, invite card, phone More menu, remove, block, report, close',async()=>{
  const mk=async(vp,st,name)=>{const p=await page(vp,save(st));p.me=await p.evaluate(async(name)=>{const r=await api('hello',{name});S.mp=S.mp||{};mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});await mpSync(true);return r},name);return p};
  const R=Math.floor(Math.random()*9e4);
  const A=await mk(VPS[0][1],{pets:{own:{dog:{name:'Biscuit',coat:0,acc:'collar'}},out:'dog',day:today,gift:today,acc:{}},sleep:{ph:'yard',t:0,visit:true}},'Oh'+R);
  const B=await mk(VPS[0][1],{pets:{own:{cat:{name:'Miso',coat:1,acc:'bow'}},out:'cat',day:today,gift:today,acc:{}}},'Og'+R);
  const C=await mk(VPS[1][1],{},'Op'+R);
  await A.evaluate(()=>houseOpen());await A.waitForFunction(()=>HOUSE.st==='on',null,{timeout:10000});
  const L=await B.evaluate(async()=>{const m=mpS();return (await api('house/list',{id:m.id,key:m.key})).houses.map(h=>h.name)});ok(L.includes(A.me.name),'list '+L);
  await A.evaluate(async(id)=>{const m=mpS();return api('house/invite',{id:m.id,key:m.key,to:[id]})},C.me.id);await C.evaluate(()=>mpSync(true));ok(await C.evaluate(()=>!document.getElementById('invCard').hidden),'invite card');
  await B.evaluate(id=>houseJoin(id),A.me.id);await C.click('#invGo');
  for(const P of [B,C])await P.waitForFunction(()=>houseHere()&&WALK.ctx==='friend',null,{timeout:25000});
  await A.waitForFunction(()=>HOUSE.peers.size===2,null,{timeout:5000});ok(await A.evaluate(()=>[...HOUSE.peers.values()].some(p=>p.pet&&p.pet.name==='Miso')),'guest pet');
  await B.evaluate(()=>{WALK.tx=150;WALK.ty=330;houseSay(1)});await C.evaluate(()=>houseEmo(1));await A.waitForTimeout(3500);
  const seen=await A.evaluate(()=>[...HOUSE.peers.values()].map(p=>[p.name,Math.round(p.tx),Math.round(p.ty),p.bub&&p.bub.s]));const gb=seen.find(x=>x[0].startsWith('Og'));ok(gb&&gb[1]===150&&gb[2]===330&&gb[3]==='Nice yard!','guest walk/say '+JSON.stringify(seen));
  ok(await B.evaluate(()=>[...HOUSE.peers.values()].some(p=>p.host)),'guest sees host');
  ok(await C.isVisible('#vbLeave')&&(await C.locator('#visitBar').boundingBox()).height<90,'phone bar is one slim row');
  await A.evaluate(()=>{const p=[...HOUSE.peers.values()].find(p=>p.name.startsWith('Op'));hsend({t:'kick',cid:p.cid})});await C.waitForTimeout(1500);ok(await C.evaluate(()=>HOUSE.st==='off'),'kicked');
  await C.evaluate(id=>{HOUSE.host=null;houseConnect(id,false)},A.me.id);await C.waitForTimeout(1500);ok(await C.evaluate(()=>HOUSE.st!=='on'),'ban holds');
  const bl=await B.evaluate(async(id)=>{const m=mpS();await api('block/add',{id:m.id,key:m.key,pid:id});const l=await api('house/list',{id:m.id,key:m.key});const t=await api('texts/send',{id:m.id,key:m.key,to:id,body:'hi'}).then(()=>'sent',e=>e.message);const r=await api('report',{id:m.id,key:m.key,pid:id,reason:'Spamming or annoying',where:'test'});return [l.houses.some(h=>h.pid===id),t,r.ok]},A.me.id);
  ok(!bl[0]&&bl[1]!=='sent'&&bl[2],'block/report '+bl);
  await A.evaluate(()=>houseClose());ok(!(await A.evaluate(async()=>{const m=mpS();return (await api('house/list',{id:m.id,key:m.key})).houses.length})),'closed');
  for(const P of [A,B,C]){ok(!P.errs.length,P.errs.join('; '));await P.context().close()}});

await check('slots: cash uses steady income (bursts don’t count) and stops at the daily limit',async()=>{const p=await page(VPS[0][1],save({coins:90000,cc:5000,rate:1000000,rateL:20000}));
  const r=await p.evaluate(()=>{const c0=S.coins;payout(['anchor','anchor','anchor'],5);const a=S.coins-c0;const c1=S.coins,cc=S.cc;payout(['crown','crown','crown'],5);return [a,S.coins-c1,S.cc-cc,slotRate()]});
  ok(r[3]===20000,'steady rate '+r[3]);ok(r[0]===2400000,'anchors capped at 2h of steady income '+r[0]);ok(r[1]===0&&r[2]===100,'over the limit pays casino coins '+r);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('basement: own colors and theme, shared furniture moves downstairs, visitors can go down',async()=>{const p=await page(VPS[0][1],save({sleep:{ph:'awake',t:0,visit:true},cab:{col:{},own:{armchair:1,wheel:1},bed:'cot',rug:'round',lamp:null,wall:[null,null,'wheel'],ex:{}}}));await p.waitForTimeout(600);
  await p.evaluate(()=>{cabSync();const cb=CAB();cb.fp=[['armchair',300,460,0]];goRoom('basement')});await p.waitForTimeout(300);
  await p.evaluate(()=>openDeco());ok((await p.textContent('#decoWhere'))==='Your basement','basement decorate');await p.click('[data-bth="naut"]');
  ok(await p.evaluate(()=>BSD().pat.w==='stripes'&&BSD().col.walls===4&&!CAB().pat.w),'basement theme kept separate from upstairs');
  await p.click('#decoArr');ok(await p.evaluate(()=>CED.on&&cedStore().f.length===0),'armchair is upstairs, so not in the tray');
  await p.evaluate(()=>{goRoom('cabin');cedEnter();CED.sel={k:'f',i:CAB().fp.findIndex(a=>a[0]==='armchair')};renderCed()});await p.click('#cedAway');await p.click('#cedDone');
  await p.evaluate(()=>{goRoom('basement');cedEnter();cedPlace('f','armchair')});ok(await p.evaluate(()=>BSD().fp.some(a=>a[0]==='armchair')&&!CAB().fp.some(a=>a[0]==='armchair')&&CED.on),'armchair placed downstairs');await p.click('#cedDone');
  const snap=await p.evaluate(()=>JSON.parse(JSON.stringify(mpCabin())));
  await p.evaluate(c=>{goRoom('cabin');setVT({id:'x',name:'Pal',c,ext:c.ext});S.sleep={ph:'door',at:'friend',t:0,visit:true}},snap);await p.waitForTimeout(1200);await p.evaluate(()=>enterFriend());await p.waitForTimeout(2500);
  const hs=await p.evaluate(()=>getHits().find(h=>h.kind==='stairs'));const sb=await p.locator('#scene').boundingBox(),k=sb.width/800;await p.mouse.click(sb.x+(hs.x+hs.w/2)*k,sb.y+(hs.y+hs.h/2)*k);await p.waitForTimeout(800);
  ok(await p.evaluate(()=>ROOM==='basement'&&!!VISIT&&VISIT.S.cab.bs.fp.length===1),'visitor went downstairs');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('smokehouse: cheapest unlocked fish cooked into a meal with hunger and a boost, then a cooldown',async()=>{const p=await page(VPS[0][1],save({hunger:30,sleep:{ph:'awake',t:0,visit:true}}));
  const r=await p.evaluate(()=>{const cs=FISH.filter(f=>f.r==='C').slice(0,3);S.cooler={};S.cooler[cs[0].id]={n:2,lbs:2,val:20};S.cooler[cs[1].id]={n:2,lbs:2,val:200};S.cooler[cs[2].id]={n:5,lbs:5,val:5};S.locked={[cs[2].id]:1};goRoom('basement');return cs.map(f=>f.id)});
  await p.waitForTimeout(600);await p.evaluate(()=>smokeUI());ok((await p.textContent('#plotEye'))==='Your basement','smokehouse window');await p.click('[data-smk="fry"]');await p.waitForTimeout(5200);
  const o=await p.evaluate(ids=>[S.hunger,S.buffs.haste||0,S.cooler[ids[0]]?S.cooler[ids[0]].n:0,S.cooler[ids[1]].n,S.cooler[ids[2]].n,(S.smk||0)>Date.now()],r);
  ok(o[0]>50&&o[1]>100,'meal effects '+o);ok(o[2]===0&&o[3]===1&&o[4]===5,'cheapest unlocked fish used '+o);ok(o[5],'cooldown');
  await p.evaluate(()=>smokeUI());ok(await p.evaluate(()=>[...document.querySelectorAll('[data-smk]')].every(b=>b.disabled)),'cooking blocked during cooldown');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('basketball league: every playoff series ends, so long-time saves load (team 0 winning used to freeze the game)',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(()=>{for(let s=1;s<=60;s++){const P=sbPlayoffs(s);if(P.champ==null||P.endDay>200)return 'season '+s+' end '+P.endDay}return 'ok'});ok(r==='ok',r);
  const p2=await page(VPS[1][1],save({day:316,sb:{start:316,season:4,seed:20261022,bets:[],champs:[],nid:1}}));ok(await p2.evaluate(()=>S.day===316&&S.sb.season===4),'day 316 save loads');
  ok(!p.errs.length&&!p2.errs.length,p.errs.concat(p2.errs).join('; '));await p.context().close();await p2.context().close()});

await check('owner gift: only the owner can send, it arrives in the mailbox and gives income-based coins, potions and the plaque',async()=>{const p=await page(VPS[0][1],save({rate:5000,rateL:3000,pots:{}}));
  const r=await p.evaluate(async()=>{const R=Math.floor(Math.random()*1e5),O=await api('hello',{name:'sycorange'}).catch(()=>null),G=await api('hello',{name:'Gf'+R}),X=await api('hello',{name:'Gx'+R});
    const no=await api('owner/gift',{id:X.id,key:X.key,name:G.name,cc:5}).then(()=>'sent',e=>e.message);if(!O||!O.id)return {skip:true,no};
    await api('owner/gift',{id:O.id,key:O.key,name:G.name,hrs:2,cc:1000,pots:['luck','gold','bogus'],plaque:true,msg:'hi'});
    const s=await api('sync',{id:G.id,key:G.key,stats:{}}),m=s.mail.find(x=>x.kind==='gift');const cl=await api('claim',{id:G.id,key:G.key,mail:m.id});const c0=S.coins,cc0=S.cc;giveItem(cl.mail.kind,cl.mail.item,cl.mail.n);
    return {no,coins:S.coins-c0,cc:S.cc-cc0,pots:S.pots.luck===1&&S.pots.gold===1&&!S.pots.bogus,plaque:!!CAB().own.thanks}});
  ok(r.no!=='sent','non-owner blocked');if(!r.skip){ok(r.coins===360000&&r.cc===1000&&r.pots&&r.plaque,'gift contents '+JSON.stringify(r))}ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('Crates: landing page, locker, and the Deep Sea crate opens Series 2 items of every kind, equips them, and they survive a reload',async()=>{const p=await page(VPS[1][1],save({coins:5e6}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openPhone();phShow('crate')});
  ok(await p.evaluate(()=>document.querySelectorAll('.cr-box').length===5&&document.querySelectorAll('.cr-look').length===3),'landing page with five crates and your look');
  await p.click('[data-crt="locker"]');ok(await p.evaluate(()=>CR.tab==='locker'&&!!document.querySelector('.cr-grid')),'locker from the landing page');await p.click('[data-crt="home"]');
  await p.click('[data-crgo-open="deep"]');ok(await p.evaluate(()=>CR.tab==='open'&&CR.kind==='deep'&&!!document.getElementById('crBuy')),'a crate opens its page');
  const kinds=await p.evaluate(()=>{const seen=new Set();for(let i=0;i<300;i++){const it=itemRoll('deep');if(!it.ds)return 'old item '+it.id;seen.add(kindOf(it.id))}return [...seen].sort().join(',')});ok(kinds==='bob,paint,rod','kinds '+kinds);
  await p.click('#crBuy');await p.waitForTimeout(6500);ok(await p.evaluate(()=>!!(CR.last&&CR.last.win.ds&&PNT().own[CR.last.win.id])),'opened a Series 2 item');
  await p.evaluate(()=>{const P=PNT();P.own.kraken=1;P.own.r_chrome=1;P.own.b_crown=1;P.eq='kraken';P.eqR='r_chrome';P.eqB='b_crown';save()});await p.reload();await p.waitForTimeout(900);
  ok(await p.evaluate(()=>{const P=PNT();return P.eq==='kraken'&&P.eqR==='r_chrome'&&P.eqB==='b_crown'&&!!skinEq()}),'equipped Series 2 items kept after reload');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('workbench: trade up uses biggest piles and caps legendary trades; decor upgrades cost materials and reach visitors',async()=>{const p=await page(VPS[0][1],save({coins:2e6,mats:{drift:40,scrap:60,rope:3,moon:30,carbon:10,brass:40,paint:20,glass:20},decor:{campfire:1},
    cab:{col:{},own:{armchair:1},bed:'cot',rug:'round',lamp:null,wall:[null,null,null],ex:{},wd:[],fp:[['armchair',300,460,0]],gotP:{armchair:1}},sleep:{ph:'awake',t:0,visit:true}}));
  const r=await p.evaluate(()=>{const b={...S.mats};S.mats.amber=0;S.mats.feather=0;tradeUp('feather',1);const t1=[S.mats.feather,b.scrap-S.mats.scrap];tradeUp('amber',5);const t2=[S.mats.amber,S.tu.n];
    const nope=(()=>{const m0=S.mats.glass;tradeUp('abyss',1);return S.mats.abyss===undefined&&S.mats.glass===m0})();
    const c0=S.coins;upgDo('armchair');upgDo('armchair');upgDo('campfire');return {t1,t2,nope,arm:upgOf('armchair'),camp:upgOf('campfire'),spent:c0-S.coins,clean:(()=>{const cb=JSON.parse(JSON.stringify(CAB()));cb.upg.bogus=2;cb.upg.armchair=9;cabClean(cb);return JSON.stringify(cb.upg)})()}});
  ok(r.t1[0]===1&&r.t1[1]===5,'feather from 5 scrap '+r.t1);ok(r.t2[0]===2&&r.t2[1]===2,'two legendary trades a day '+r.t2);ok(r.nope,'cannot make a material never found');
  ok(r.arm===2&&r.camp===1&&r.spent>0,'upgrades '+JSON.stringify(r));ok(r.clean==='{"campfire":1}','visitor copy sanitized '+r.clean);
  await p.evaluate(()=>openCraft('upg'));ok(await p.evaluate(()=>document.querySelectorAll('#craftPane .rcard').length>=2),'upgrade tab lists pieces');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('yard depth: pets and the walker are depth-sorted with yard items, with no errors behind or in front',async()=>{const p=await page(VPS[0][1],save({decor:{woodpile:1},pets:{own:{dog:{name:'B',coat:0,acc:'none'}},out:'dog',day:today,gift:today,acc:{}},sleep:{ph:'yard',t:0,visit:true}}));
  await p.evaluate(()=>{const w=S.yard.it.find(a=>a[0]==='woodpile');w[1]=100;w[2]=330});
  for(const y of [318,345]){await p.evaluate(y=>{const R=PET_RT;R.x=R.tx=100;R.y=R.ty=y;R.st='sit';R.t=99;WALK.x=128;WALK.y=y;WALK.tx=WALK.ty=null},y);await p.waitForTimeout(400)}
  ok(await p.evaluate(()=>String(drawYard).includes('YACT')&&WALK.drawnT>0),'actors drawn in the yard pass');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('moon: air keeps running out while away, then you come home and keep fishing (Moon Base still unlimited)',async()=>{for(const [gear,want] of [[{tank:1},'deep'],[{tank:1,moonbase:1},'moon']]){const p=await page(VPS[0][1],save({shack:5,boat:5,water:'deep',realm:{gates:{moon:1},gear}}));
    const r=await p.evaluate(()=>{realmSwap('deep','moon');S.water='moon';S.o2=120;const t0=S.total;offline(3*3600);return [S.water,S.total-t0>100]});ok(r[0]===want&&r[1],'after away '+r+' want '+want);ok(!p.errs.length,p.errs.join('; '));await p.context().close()}});

await check('casefile: an old tournament card or invite no longer blocks the Emerald Wake ghost; only a live tournament does',async()=>{const p=await page(VPS[0][1],save({boat:4,water:'bay',min:22*60,q:{step:7,everSolved:true},q2:{step:6,lantern:true,bell:true,pages:3}}));
  const r=await p.evaluate(()=>{const roll=()=>{let n=0;for(let i=0;i<300;i++){const x=q2Roll({wx:'fog'},'bay',22*60);if(x&&x.ghost)n++}return n};const o={};
    S.tour={phase:'done',name:'x',me:1,rivals:[]};o.done=roll();S.tour={phase:'invite',left:40,name:'x',rivals:[]};o.inv=roll();S.tour={phase:'live',left:200,name:'x',rivals:[]};o.live=roll();S.tour=null;o.next=nextWxText(['fog']);return o});
  ok(r.done>0&&r.inv>0&&r.live===0,'ghost blocking '+JSON.stringify(r));ok(/now|min|at /.test(r.next),'fog forecast '+r.next);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('case 5, The 3:33 Broadcast: opens after case 4 and plays through to the rewards',async()=>{const p=await page(VPS[0][1],save({coins:5e5,boat:4,min:190,day:40,mats:{scrap:20,glass:10},q:{step:7,everSolved:true},q2:{step:7,everSolved:true},q3:{step:7,everSolved:true},q4:{step:7,everSolved:true,msgs:[],lies:{}},sleep:{ph:'awake',t:0,visit:true},tapes:{}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);qStart()});ok(await p.evaluate(()=>Q5().step===1&&Q5().clues.length===3),'case opens');
  await p.evaluate(()=>{const q=Q5();for(let n=0;n<3;n++){S.day=40+n;q.rec=n;q.recDay=null;openTV();document.getElementById('tvModal').hidden=true}});
  ok(await p.evaluate(()=>{S.day=50;S.min=190;openTV();return document.querySelector('.q5dead')!==null}),'dead channel shows 3–5 AM at home');await p.waitForTimeout(7600);
  ok(await p.evaluate(()=>{document.getElementById('tvModal').hidden=true;return Q5().rec>=1}),'broadcast recorded');
  const r=await p.evaluate(()=>{const q=Q5();q.rec=3;q.step=2;for(const c of q.clues){S.water=c.w;S.min={dawn:330,day:600,dusk:1150,night:1300}[c.ph];q5OnCatch(FI(c.f))}return Object.keys(q.got).length});ok(r===3,'all three fish decode');await p.waitForTimeout(3000);
  ok(await p.evaluate(()=>Q5().step===3&&!!S.tapes.signal),'tape appears');
  await p.evaluate(()=>{Q5().step=4;q5Item('tube',false);q5Item('coil',false);q5Item('rod',false);craftReceiver()});ok(await p.evaluate(()=>Q5().step===6&&Q5().radio),'receiver built');
  await p.evaluate(()=>{S.min=200;S.sleep={ph:'awake',t:0,visit:true};openTV()});await p.click('#q5Tune');await p.evaluate(()=>{window.__t=setInterval(()=>{Q5T.f=Q5T.target},30)});await p.waitForFunction(()=>Q5().step===7,null,{timeout:40000}).catch(()=>{});
  ok(await p.evaluate(()=>Q5().step===7&&!!PNT().own.deadch&&!!PNT().own.b_antenna&&S.trophies[0].name==='Signal Found'),'solved with rewards');
  ok(await p.evaluate(()=>{const L=[];for(let i=0;i<4000;i++){const x=rollPull({wx:'clear'},'lake',600);if(x&&x.tape)L.push(x.tape)}return !L.includes('signal')}),'quest tape never drops randomly');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('case 6, The Night Shift: tin, statements after dark, ledger, cipher, lamp, a wrong accusation locks the board, the right one closes it',async()=>{const p=await page(VPS[1][1],save({coins:5e5,boat:4,min:600,day:40,mats:{rope:20,brass:10,scrap:10},q:{step:7,everSolved:true},q2:{step:7,everSolved:true},q3:{step:7,everSolved:true},q4:{step:7,everSolved:true,msgs:[],lies:{}},q5:{step:7,everSolved:true},tapes:{}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);qStart()});ok(await p.evaluate(()=>Q6().step===1&&Q6().key>=3),'case opens');
  ok(await p.evaluate(()=>{let n=0;for(let i=0;i<3000;i++){const x=rollPull({wx:'clear'},'lake',600);if(x&&x.q6==='tin')n++}return n>20}),'tins wash up while fishing');
  await p.evaluate(()=>q6Item('tin',true));ok(await p.evaluate(()=>Q6().step===2),'tin found');
  ok(await p.evaluate(()=>q6Talk('Old Pete').startsWith('Not in daylight')&&!Object.keys(Q6().heard).length),'nobody talks in daylight');
  await p.evaluate(()=>{S.min=1200;for(const n of ['Old Pete','Harbormaster Hollis','Marge','Murphy'])q6Talk(n)});await p.waitForTimeout(3000);ok(await p.evaluate(()=>Q6().step===3&&Q6().clues.length===3),'four statements, ledger lead');
  ok(await p.evaluate(()=>{const q=Q6(),c=q.clues[0];let n=0;for(let i=0;i<2000;i++){const x=rollPull({wx:'clear'},c.w,{dawn:330,day:600,dusk:1150,night:1300}[c.ph]);if(x&&x.q6==='page0')n++}return n>40}),'pages turn up at the right water and time');
  await p.evaluate(()=>{q6Item('page0',false);q6Item('page1',false);q6Item('page2',false)});ok(await p.evaluate(()=>Q6().step===4),'all three pages');
  await p.evaluate(()=>{openPhone();phShow('case')});await p.waitForTimeout(300);await p.click('[data-case="6"]');await p.waitForTimeout(200);ok(await p.isVisible('.q6ciph'),'cipher shows');
  const key=await p.evaluate(()=>Q6().key);for(let i=1;i<key;i++)await p.click('#q6Up');await p.click('#q6Try');ok(await p.evaluate(()=>Q6().step===5),'cipher cracked');
  await p.click('#q6Lamp');ok(await p.evaluate(()=>Q6().step===6&&Q6().lamp&&S.coins===3e5),'lamp restored');
  await p.selectOption('[data-q6="who"]','gus');await p.selectOption('[data-q6="how"]','set');await p.selectOption('[data-q6="where"]','skiff');await p.click('#q6Acc');ok(await p.evaluate(()=>Q6().step===6&&Q6().lockDay===S.day&&document.getElementById('q6Acc').disabled),'wrong answer locks the board');
  await p.evaluate(()=>{S.day++;renderCase()});await p.selectOption('[data-q6="who"]','eli');await p.selectOption('[data-q6="how"]','set');await p.selectOption('[data-q6="where"]','skiff');await p.click('#q6Acc');
  ok(await p.evaluate(()=>Q6().step===7&&!!PNT().own.b_tin&&!!S.tapes.newsreel&&S.trophies[0].name==='The Night Shift'),'solved with rewards');
  ok(await p.evaluate(()=>{S.q6={step:2,heard:{},pages:{},key:5,tin:true};delete S.mp.id;S.min=1300;S.day=99;renderCase();document.getElementById('q6Txt').click();return Object.keys(Q6().heard).length===1&&document.getElementById('q6Txt').disabled}),'no angler name: text one a night');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('case 7, The Town Under the Lake: steeple, keepsakes, the bell code, letters, diving bell and the sonar dive',async()=>{const p=await page(VPS[1][1],save({coins:1e6,boat:4,min:600,day:40,water:'lake',mats:{rope:20,scrap:20,titan:6,glass:10},q:{step:7,everSolved:true},q2:{step:7,everSolved:true},q3:{step:7,everSolved:true},q4:{step:7,everSolved:true,msgs:[],lies:{}},q5:{step:7,everSolved:true},q6:{step:7,everSolved:true},tapes:{}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);qStart()});ok(await p.evaluate(()=>Q7().step===1),'case opens');
  await p.evaluate(()=>{S.water='deep';q7OnCatch(FI('walleye')||FISH[0])});await p.waitForTimeout(1200);ok(await p.evaluate(()=>Q7().step===2),'saw the steeple');
  ok(await p.evaluate(()=>{let n=0;for(let i=0;i<2000;i++){const x=rollPull({wx:'clear'},'deep',600);if(x&&x.q7)n++}return n>40}),'keepsakes turn up in Deepwater Basin');
  await p.evaluate(()=>{q7Item('locket',false);q7Item('slate',false);q7Item('sign',false)});ok(await p.evaluate(()=>Q7().step===3&&!!Q7().code),'three keepsakes, bell lead');
  await p.evaluate(()=>{S.water='lake';S.min=1300;q7OnCatch(FISH[0])});await p.waitForTimeout(2800);ok(await p.evaluate(()=>Q7().heard&&Q7().ringDay===S.day),'the bell rings on a night catch');
  await p.evaluate(()=>{const c=Q7().code;S.water=['pond','lake','river','deep','bay'][c.w-1];S.min={dawn:330,day:600,dusk:1150,night:1300}[['dawn','day','dusk','night'][c.ph-1]];q7OnCatch(FISH[0])});await p.waitForTimeout(1300);ok(await p.evaluate(()=>Q7().step===4&&Q7().jar),'followed the bell to the letters');
  await p.evaluate(()=>{openPhone();phShow('case')});await p.waitForTimeout(300);await p.click('[data-case="7"]');await p.click('#q7Read');ok(await p.evaluate(()=>Q7().step===5),'letters read');
  await p.click('#q7Bell');ok(await p.evaluate(()=>Q7().step===6&&Q7().bell&&S.coins===6e5),'diving bell built');
  await p.evaluate(()=>{S.water='deep';renderCase()});await p.click('#q7Dive');await p.waitForTimeout(400);ok(await p.isVisible('#dvCv'),'dive opens');
  await p.click('#dvPing');await p.evaluate(()=>{window.__dv=0;for(const g of [[500,452],[884,455],[1384,455]])setTimeout(()=>{DV.x=g[0];DV.y=g[1];DV.vx=DV.vy=0},(window.__dv++)*300)});await p.waitForTimeout(3600);
  ok(await p.evaluate(()=>Q7().step===7&&!!PNT().own.b_dbell&&!!S.decor.steeple&&!!S.tapes.hollow&&S.trophies[0].name==='Hollow Pines'),'solved with rewards');
  ok(await p.evaluate(()=>S.yard&&S.yard.it.some(a=>a[0]==='steeple')),'steeple stands in the yard');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('casefile: opens on a shelf of case folders; a folder opens its case and All cases goes back',async()=>{const p=await page(VPS[1][1],save({q:{step:7,everSolved:true,seen:7},q2:{step:3,startDay:30,seen:2},q9:{step:1,startDay:30,seen:1}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openPhone();phShow('case')});
  ok(await p.evaluate(()=>document.querySelectorAll('.cf-folder').length===caseList().length&&document.querySelectorAll('.cf-folder.sealed').length===caseList().filter(c=>!c.open).length&&caseList().filter(c=>c.open).length===3&&!!document.querySelector('.cf-new')),'folders, sealed cases and a new-lead tag');
  await p.click('[data-case="2"]');ok(await p.evaluate(()=>/EMERALD WAKE/.test(document.getElementById('caseBody').textContent)),'folder opens the case');
  await p.click('[data-case="0"]');ok(await p.evaluate(()=>!!document.querySelector('.cf-grid')&&!document.querySelector('.cf-new')),'back to the shelf, lead marked seen');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('town: two anglers see each other in Lantern Harbor and inside its shops, Marge’s Counter, darts, Lake 7 requests, parcels, the fountain, the paper and trivia work, Leave goes home',async()=>{const ps=[];
  for(const vp of [VPS[0][1],VPS[1][1]]){const p=await page(vp,save({sleep:{ph:'yard',t:0,visit:true}}));await p.evaluate(async()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);const r=await api('hello',{name:'Tn'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true})});ps.push(p)}
  const [A,B]=ps;await A.waitForTimeout(300);ok(await A.evaluate(()=>!!document.getElementById('vbTown')),'town button in the yard bar');
  await A.evaluate(()=>document.getElementById('vbTown').click());await B.evaluate(()=>openTown());
  await A.waitForFunction(()=>TOWN.st==='on'&&TOWN.peers.size===1,null,{timeout:8000});await B.waitForFunction(()=>TOWN.peers.size===1,null,{timeout:8000});
  await A.evaluate(()=>{TOWN.tx=700;TOWN.ty=450});await B.waitForFunction(()=>[...TOWN.peers.values()].some(p=>p.tx===700),null,{timeout:10000});ok(true,'B sees A walk');
  await B.evaluate(()=>{const b=TBLD.find(x=>x.id==='museum');TOWN.x=b.x;TOWN.cam=Math.max(0,b.x-300)});await B.waitForTimeout(250);
  const h=await B.evaluate(()=>{const h=HITS.find(h=>h.kind==='tbld'&&h.data==='museum');return h&&[h.x+h.w/2,h.y+h.h*.8]});ok(!!h,'museum is tappable');
  await B.evaluate(([x,y])=>townClick(x,y,{clientX:0,clientY:0}),h);await B.waitForFunction(()=>!document.getElementById('musModal').hidden,null,{timeout:6000});ok(true,'museum door opens the museum');
  await B.evaluate(()=>{document.getElementById('musModal').hidden=true;townEnter('tackle')});await A.waitForFunction(()=>[...TOWN.peers.values()].some(p=>p.z==='tackle'),null,{timeout:8000});ok(true,'A sees B go into Bait & Tackle');
  await A.evaluate(()=>townEnter('tackle'));await A.waitForTimeout(400);ok(await A.evaluate(()=>!!HITS.find(h=>h.kind==='tin'&&h.data==='keeper')&&[...TOWN.peers.values()].filter(p=>p.z===TOWN.z).length===1),'inside together, Marge is there');
  await A.evaluate(()=>{S.coins=1e7;margeUI()});const c0=await A.evaluate(()=>S.coins);await A.click('#mgBobB');await A.click('#mgPot');
  ok(await A.evaluate(c0=>{const M=margeStock();return PNT().own[M.bob.id]===1&&S.coins<c0&&townDay().pot===1&&!!ITEM_BY[M.bob.id]},c0),'Marge sells the town bobber and a potion');
  await A.evaluate(()=>{document.getElementById('plotModal').hidden=true;townExit();townEnter('bar');dartsOpen()});for(let i=0;i<3;i++)await A.click('#dtCv');
  ok(await A.evaluate(()=>DART.darts.length===3&&townDay().dr===1&&!document.getElementById('dtAgain').hidden),'a round of darts');await A.evaluate(()=>{document.getElementById('plotModal').hidden=true;townExit()});
  await A.evaluate(()=>{townEnter('station')});await B.evaluate(()=>{townExit();townEnter('station')});await A.waitForFunction(()=>[...TOWN.peers.values()].some(p=>p.z==='station'),null,{timeout:8000});
  await A.evaluate(()=>l7UI());await A.selectOption('#l7T',{index:1});await A.click('#l7Go');await B.waitForFunction(()=>TOWN.radio&&TOWN.radio.to&&TOWN.radio.by,null,{timeout:8000});ok(true,'a Lake 7 request reaches everyone, with the dedication');
  await A.evaluate(()=>{PNT().own.b_duck=2;townExit();townEnter('post')});await A.evaluate(()=>parcelUI());await A.waitForSelector('#pcGo',{timeout:8000});await A.selectOption('#pcIt','b_duck');
  const bn=await B.evaluate(()=>mpS().name);await A.selectOption('#pcTo',{label:bn});await A.click('#pcGo');await A.waitForFunction(()=>PNT().own.b_duck===1,null,{timeout:8000});
  ok(await B.evaluate(async()=>{const m=mpS();await mpSync(true);const x=MPV.mail.find(x=>x.kind==='cos'&&x.item==='b_duck');if(!x)return false;const r=await api('claim',{id:m.id,key:m.key,mail:x.id});giveItem(r.mail.kind,r.mail.item,r.mail.n);return PNT().own.b_duck>=1}),'a parcel from the Post Office arrives and can be claimed');
  await A.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);townExit()});await B.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);townExit()});
  ok(await A.evaluate(()=>{S.coins=1e7;fountToss();ledgerUI();document.getElementById('lgBuy').click();const k=ledgerToday().L.k;return townDay().wish===1&&townDay().paper===1&&S.buffs[k]>0}),'fountain wish and the daily paper boost');
  await A.evaluate(()=>{document.getElementById('plotModal').hidden=true;S.min=1200;townEnter('bar');triviaUI()});for(let i=0;i<5;i++){await A.click('[data-tq="0"]');await A.waitForTimeout(1250)}
  ok(await A.evaluate(()=>townDay().tv!=null&&triviaQs().length===5&&/\/5 tonight/.test(document.getElementById('plotBody').textContent)),'a round of trivia');await A.evaluate(()=>{document.getElementById('plotModal').hidden=true;townExit()});
  await A.evaluate(()=>document.getElementById('tbLeave').click());await B.waitForFunction(()=>TOWN.peers.size===0,null,{timeout:6000});
  ok(await A.evaluate(()=>!TOWN.on&&S.sleep.ph==='yard'&&!!document.getElementById('vbTown')),'leave returns to the yard');
  for(const p of ps){ok(!p.errs.length,p.errs.join('; '));await p.context().close()}});

await check('supporters get the Mythic Lantern Keeper kit once; it shows in the locker and can’t be mailed',async()=>{const p=await page(VPS[0][1],save({}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);mpSyncDone({},{sup:1})});
  {const r=await p.evaluate(()=>{const P=PNT();return [P.own.leviathan,P.own.r_starforged,P.own.b_sun,CAB().own.eternal,S.supKit,JSON.stringify(CAB().wd)]});ok(r[0]===1&&r[1]===1&&r[2]===1&&r[3]===1&&r[4]===1&&/eternal/.test(r[5]),'kit granted and the lantern hung '+JSON.stringify(r))}
  ok(await p.evaluate(()=>{mpSyncDone({},{sup:1});return PNT().own.leviathan===1&&!parcelItems().some(o=>ITEM_BY[o.id].t==='M')}),'granted once, never mailable');
  await p.evaluate(()=>{const P=PNT();P.eq='leviathan';P.eqR='r_starforged';P.eqB='b_sun';S.min=1320});await p.waitForTimeout(800);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('owner: the Game Warden boat draws, its light bar toggles, and the live lake hears about it',async()=>{const p=await page(VPS[0][1],save({boat:3,min:1320}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);mpSyncDone({},{owner:1});wardenToggle(true)});await p.waitForTimeout(400);
  ok(await p.evaluate(()=>S.wdOwn===1&&wardenOn()&&HITS.some(h=>h.kind==='wlight')),'warden boat on with a tappable light bar');
  ok(await p.evaluate(()=>{wardenLights();return WDB().lit===1&&liveSig().startsWith('2|')}),'lights on and shared with the live lake');
  await p.evaluate(()=>{wardenToggle(false)});ok(await p.evaluate(()=>!wardenOn()&&WDB().lit===0),'put away');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('homestead: greenhouse, beehive, coop and drying rack produce, and greenhouse bait gives a boost',async()=>{const p=await page(VPS[0][1],save({sleep:{ph:'yard',t:0,visit:true},decor:{flowers:1},cooler:{bluegill:{n:7,lbs:3,val:70}}}));
  const r=await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);const Y=S.yard,ago=h=>Date.now()-h*36e5;Y.inv=Y.inv||{};for(const k of ['greenhouse','beehive','coop','dryrack'])Y.inv[k]=1;
    Y.it.push(['greenhouse',150,300,0,ago(3),'grub'],['beehive',200,290,0,ago(2)],['coop',60,286,0,ago(2)],['dryrack',110,325,0,ago(3),'bluegill|5|50']);const L=yardList(),ix=id=>L.findIndex(a=>a[0]===id);
    farmTap(ix('beehive'));farmTap(ix('coop'));openGreenhouse(ix('greenhouse'));document.getElementById('ghGo').click();const c0=S.coins;openRack(ix('dryrack'));document.getElementById('rkGo').click();const jerky=S.coins-c0;
    openRack(ix('dryrack'));const opts=document.querySelectorAll('[data-rk]').length;document.getElementById('plotModal').hidden=true;pantryAct('b','grub');const P=pantry();return [P.honey>0,P.egg>0,P.grub===1,jerky===90,opts===1,S.buffs.giant>0]});
  ok(r.every(Boolean),'homestead loop '+JSON.stringify(r));await p.waitForTimeout(600);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('hangouts: sit by the fire and roast, log a constellation, climb the treehouse, change the film',async()=>{const p=await page(VPS[0][1],save({sleep:{ph:'yard',t:0,visit:true},min:1320}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);const Y=S.yard;Y.inv=Y.inv||{};for(const k of ['firepit','gazebo','treehouse','screen'])Y.inv[k]=1;Y.it.push(['firepit',70,300,0],['gazebo',190,300,0],['treehouse',-10,290,0],['screen',130,272,0]);hangTap(yardList().findIndex(a=>a[0]==='firepit'))});
  await p.waitForFunction(()=>!!WALK.sit,null,{timeout:10000});ok(true,'sat by the fire');
  await p.evaluate(()=>{hangTap(yardList().findIndex(a=>a[0]==='firepit'));ROAST.heat=.65;roastDone()});ok(await p.evaluate(()=>/golden/.test(document.getElementById('rsMsg').textContent)&&YH().mm===1),'perfect marshmallow');
  await p.evaluate(()=>{document.getElementById('plotModal').hidden=true;scopeOpen();SCOPE.vx=CON_POS[2][0]-160;SCOPE.vy=CON_POS[2][1]-120});await p.waitForFunction(()=>Object.keys(YH().stars).length===1,null,{timeout:8000});ok(true,'logged a constellation');
  ok(await p.evaluate(()=>{document.getElementById('plotModal').hidden=true;WALK.sit=null;const L=yardList(),i=L.findIndex(a=>a[0]==='treehouse');treeUp(i,L[i]);const up=!!WALK.up&&S.buffs.magnet>0;const s=L.findIndex(a=>a[0]==='screen');hangTap(s);return up&&filmOf(L[s])===1}),'treehouse lookout and film change');
  await p.waitForTimeout(500);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('yard batch 3: horseshoes, putting, koi pond, statue, seasonal items',async()=>{const p=await page(VPS[0][1],save({sleep:{ph:'yard',t:0,visit:true}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);const Y=S.yard;Y.inv=Y.inv||{};for(const k of ['horseshoes','putting','pond','statue','vane','leaves','snowman'])Y.inv[k]=1;
    Y.it.push(['horseshoes',90,330,0],['putting',200,320,0],['pond',60,300,0,Date.now(),JSON.stringify([{k:'koi',g:3,fd:''},{k:'gold',g:1,fd:''}])],['statue',150,290,0],['vane',-20,300,0],['leaves',170,345,0],['snowman',230,300,0])});
  await p.evaluate(()=>shoeOpen());for(let k=0;k<4;k++){await p.waitForFunction(k=>SHOE.throws.length===k,k,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300);await p.click('#hsGo')}await p.waitForFunction(()=>SHOE.throws.length===4&&/points/.test(document.getElementById('hsMsg').textContent),null,{timeout:15000}).catch(()=>{});ok(await p.evaluate(()=>SHOE.throws.length===4&&/points/.test(document.getElementById('hsMsg').textContent)),'a round of horseshoes');
  ok(await p.evaluate(()=>{document.getElementById('plotModal').hidden=true;puttOpen();const H=HOLES[0];PUTT.ball=[H.h[0]-3,H.h[1]];PUTT.v=[20,0];PUTT.moving=true;PUTT.strokes=1;for(let k=0;k<30;k++)puttTick(.03);return PUTT.hole===1&&PUTT.total===1}),'sinks a putt');
  ok(await p.evaluate(()=>{document.getElementById('plotModal').hidden=true;const L=yardList(),i=L.findIndex(a=>a[0]==='pond');openPond(i);const c0=S.coins;document.querySelector('[data-psell]').click();const sold=S.coins-c0;document.getElementById('pdFeed').click();const P=pondOf(L[i]);return sold>0&&P.length===1&&P[0].g===2}),'pond sell and feed');
  ok(await p.evaluate(()=>{document.getElementById('plotModal').hidden=true;const L=yardList(),s=L.findIndex(a=>a[0]==='snowman');showTap(s);showTap(s);showTap(s);return +L[s][5]===3&&typeof seasonOk('leaves')==='boolean'}),'snowman built');
  await p.waitForTimeout(500);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('menus: Map/Gear/Catch/Stuff, phone sheet, lake map travel, quick sell, hide phone',async()=>{
  const p=await page(VPS[0][1],save({cooler:{bluegill:{n:3,val:90,w:3}}}));ok(await p.evaluate(()=>!document.getElementById('pane-waters').hidden&&!!document.querySelector('.lmap')),'map is not the first tab');
  await p.click('#mnav [data-mt="catch"]');ok(await p.isVisible('#t-log')&&!(await p.isVisible('#t-gear')),'catch sub tabs');await p.click('#t-log');ok(await p.evaluate(()=>!document.getElementById('pane-log').hidden&&document.body.dataset.mt==='catch'),'logbook');
  await p.click('#mnav [data-mt="stuff"]');ok(await p.evaluate(()=>!document.getElementById('pane-storage').hidden),'stuff');
  await p.click('#sellQ');ok(await p.evaluate(()=>!S.cooler.bluegill&&S.coins===500090),'quick sell');
  await p.click('#phHideBtn');ok(await p.evaluate(()=>S.set.phHide===true&&document.getElementById('phoneDock').classList.contains('hid')),'hide phone');await p.click('#phHideBtn');ok(await p.evaluate(()=>!S.set.phHide),'show phone');
  await p.click('#mnav [data-mt="map"]');await p.click('.lm-pin[data-lm="pond"]');await p.waitForTimeout(300);ok(await p.evaluate(()=>TRV.on||S.water==='pond'),'map pin travel');ok(!p.errs.length,p.errs.join('; '));await p.context().close();
  const q=await page(VPS[1][1],save({}));ok(await q.evaluate(()=>!document.body.classList.contains('sheet-on')),'sheet starts closed');await q.click('#mnav [data-mt="gear"]');await q.waitForTimeout(400);
  ok(await q.evaluate(()=>document.body.classList.contains('sheet-on')&&!document.getElementById('pane-gear').hidden),'gear sheet');await q.click('#mnav [data-mt="gear"]');ok(await q.evaluate(()=>!document.body.classList.contains('sheet-on')),'tap again closes');
  await q.evaluate(()=>openTab('cooler'));ok(await q.evaluate(()=>document.body.classList.contains('sheet-on')),'openTab opens the sheet');await q.click('#shClose');ok(!q.errs.length,q.errs.join('; '));await q.context().close()});

await check('Harvest Festival: season switch, flannel gift, fall scene, harvest decor in the Shop',async()=>{const c=await b.newContext({viewport:VPS[0][1]});await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0.replace('season=off','season=hv'));await p.waitForTimeout(900);
  ok(await p.evaluate(()=>document.getElementById('titleScreen').classList.contains('harvest')&&!document.getElementById('titleScreen').classList.contains('spooky')),'harvest title');await p.click('#tGo');await p.waitForTimeout(1200);
  ok(await p.evaluate(()=>hvOn()&&!hwOn()&&S.hv.flannel===1&&hwWear()==='flannel'),'flannel gift');
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openPhone();phShow('home')});ok(await p.evaluate(()=>!!document.querySelector('#appGrid [data-app="hv"]')&&!document.querySelector('#appGrid [data-app="hw"]')),'Harvest app on the home screen');await p.evaluate(()=>closePhone());
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);SCN.cur={id:'geese',lay:'sky',dur:18,t:5,loc:S.water,data:{dir:1,y:60}};for(const w of ['pond','river','deep','bay','lake']){S.water=w;renderAll()}});await p.waitForTimeout(500);
  await p.evaluate(()=>{openPhone();phShow('shop')});await p.click('#shopBody .chips2 button:has-text("Harvest")');ok(await p.evaluate(()=>document.getElementById('shopBody').textContent.includes('Corn Stalk Bundles')),'harvest shop');
  await p.evaluate(()=>orderItem(DECOR.find(x=>x.id==='cornstalks')));ok(await p.evaluate(()=>S.boxes.some(b=>b.id==='cornstalks')),'order harvest decor');ok(!errs.length,errs.join('; '));await c.close()});

await check('Harvest Basket: festival fish, giving fish, lake-wide total, tier rewards',async()=>{const c=await b.newContext({viewport:VPS[1][1]});
  const cx=await b.newContext(),p0=await cx.newPage();await p0.goto(URL0);const A=await p0.evaluate(async()=>api('hello',{name:'Hv'+Math.floor(Math.random()*1e5)}));
  const r1=await p0.evaluate(async A=>api('sync',{id:A.id,key:A.key,stats:{},hvq:1,hvb:30}),A);ok(r1.hvb&&r1.hvb.mine===30&&r1.hvb.total>=30&&r1.hvb.goal>=10000,'server basket '+JSON.stringify(r1.hvb));await cx.close();
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({mp:{id:A.id,key:A.key,name:A.name},cooler:{bluegill:{n:5,val:40},walleye:{n:4,val:600}}}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0.replace('season=off','season=hv'));await p.waitForTimeout(800);await p.click('#tGo');await p.waitForTimeout(1500);
  await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));
  ok(await p.evaluate(()=>{let n=0;for(let i=0;i<4000;i++){const e=hwFishRoll('deep',23*60,null);if(e&&e.f.id==='mooncarp')n++}return n>0}),'Harvest Moon Carp never bites');
  await p.evaluate(()=>{openPhone();phShow('hv')});await p.waitForTimeout(300);ok(await p.isVisible('#hvBody [data-hvg="bluegill"]'),'give list');
  await p.evaluate(()=>document.querySelector('#hvBody [data-hvg="bluegill"][data-n="1"]').click());ok(await p.evaluate(()=>S.cooler.bluegill.n===4&&HV().pts===1&&mpS().hvb===1),'give one');
  for(let k=0;k<4;k++){await p.evaluate(()=>{const b=document.getElementById('hvAll');if(b){b.click();b.click()}});await p.waitForTimeout(150);if(await p.evaluate(()=>!Object.keys(S.cooler).some(k=>S.cooler[k].n>0)))break}ok(await p.evaluate(()=>!Object.keys(S.cooler).some(k=>S.cooler[k].n>0)&&HV().pts>=10),'give all '+await p.evaluate(()=>JSON.stringify([S.cooler,HV().pts,S.water])));
  await p.evaluate(()=>mpSync(true));await p.waitForTimeout(800);ok(await p.evaluate(()=>!mpS().hvb&&MPV.hvb&&MPV.hvb.mine>=40),'sent to the lake '+await p.evaluate(()=>JSON.stringify([mpS().hvb,MPV.hvb])));
  const tr=await p.evaluate(()=>{HV().tiers={};S.pots.gold=0;const c0=S.coins;MPV.hvb={goal:100,total:60,n:1,mine:40,top:[]};hvClaim();return [S.coins-c0,S.pots.gold|0,HV().tiers]});ok(tr[0]===25000&&tr[1]>=3&&tr[2][0]&&tr[2][1]&&!tr[2][2],'tier rewards '+JSON.stringify(tr));
  await p.evaluate(()=>{MPV.hvb.total=100;hvClaim()});ok(await p.evaluate(()=>S.boxes.some(b=>b.id==='cornucopia')&&S.trophies.some(t=>t.name==='Harvest Basket 2026')),'top tiers');ok(!errs.length,errs.join('; '));await c.close()});

await check('save safety: downgrade guard, save history, restore, owner restore code',async()=>{const c=await b.newContext();const p=await c.newPage();await p.goto(URL0);
  const r=await p.evaluate(async()=>{const call=async(path,body)=>{const x=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {s:x.status,j:await x.json()}};
    const A=(await call('hello',{name:'Sv'+Math.floor(Math.random()*1e5)})).j,big='BIG'.repeat(20),small='SMALL'.repeat(10),o={id:A.id,key:A.key};
    const p1=await call('cloud/put',{...o,data:big,dev:'devA',kind:'computer',day:200,coins:5e5,fish:15000,sp:60,base:0});
    const p2=await call('cloud/put',{...o,data:small,dev:'devB',kind:'phone',day:12,coins:900,fish:400,sp:9,base:p1.j.up});
    const g1=await call('cloud/get',{...o});
    const p3=await call('cloud/put',{...o,data:small,dev:'devB',kind:'phone',day:12,coins:900,fish:400,sp:9,base:p1.j.up,force:1});
    const h=await call('cloud/hist',{...o});const hg=h.j.list[0]?await call('cloud/histget',{...o,hid:h.j.list[0].id}):null;
    const own=(await call('hello',{name:'sycorange'})).j;let oc=null;if(own&&own.id){const sv=await call('owner/saves',{id:own.id,key:own.key,name:A.name});const rc=sv.j.found?await call('owner/restorecode',{id:own.id,key:own.key,pid:sv.j.pid,hid:sv.j.list[0].id}):null;const xg=rc&&rc.j.code?await call('xfer/get',{code:rc.j.code}):null;oc={n:sv.j.list.length,data:xg&&xg.j.data}}
    return {p2:p2.s,p2e:p2.j.error,g1:g1.j.data===big,p3:p3.s,hist:h.j.list.length,hg:hg&&hg.j.data===big,oc,big}});
  ok(r.p2===409&&r.p2e==='downgrade','downgrade not refused '+r.p2);ok(r.g1,'cloud save changed');ok(r.p3===200,'force failed');ok(r.hist>=1&&r.hg,'history missing');
  ok(!r.oc||(r.oc.n>=1&&r.oc.data===r.big),'owner restore code '+JSON.stringify(r.oc));await c.close()});

await check('Harvest Fair: festival stall in town, apple bobbing tickets, the daily pie contest and ribbons',async()=>{const c=await b.newContext({viewport:VPS[0][1]});
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({sleep:{ph:'yard',t:0,visit:true},cooler:{walleye:{n:3,val:300}},pantry:{peach:2}}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0.replace('season=off','season=hv'));await p.waitForTimeout(800);await p.evaluate(()=>{if(!document.getElementById('titleScreen').hidden)document.getElementById('tGo').click()});await p.waitForTimeout(800);
  await p.evaluate(async()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);const r=await api('hello',{name:'Fa'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});openTown()});await p.waitForTimeout(1500);
  await p.evaluate(()=>{TOWN.x=2745;TOWN.cam=2400});await p.waitForTimeout(800);ok(await p.evaluate(()=>HITS.some(h=>h.kind==='thv')),'no fair stall hit area');await p.evaluate(()=>hvFair());ok(await p.isVisible('#hvfBob')&&await p.isVisible('#hvfPie'),'fair panel');
  await p.click('#hvfBob');await p.click('#bobGo');await p.evaluate(()=>{ABOB.a[0].p=Math.PI/2;ABOB.a[0].ps=0});const pos=await p.evaluate(()=>{const a=ABOB.a[0],c=document.getElementById('bobCv').getBoundingClientRect();return [c.left+(180+Math.cos(a.a)*a.r)*c.width/360,c.top+(170+Math.sin(a.a)*a.r*.42)*c.height/300]});
  await p.evaluate(()=>{ABOB.a.forEach((a,i)=>{if(i){a.r=200}a.s=0})});await p.mouse.click(pos[0],pos[1]);ok(await p.evaluate(()=>ABOB.n===1),'grab an apple');await p.evaluate(()=>{ABOB.left=.01});await p.waitForTimeout(300);ok(await p.evaluate(()=>ARC().t>=6&&HV().bob===1),'bobbing tickets');
  await p.click('#bobBack');await p.click('#hvfPie');await p.click('#pieGo');await p.evaluate(()=>{PIE.t=.5/.32});await p.click('#pieOut');
  ok(await p.evaluate(()=>HV().pie&&HV().pie.score>0&&S.cooler.walleye.n===2&&S.pantry.peach===1&&(HV().rib.b+HV().rib.r+HV().rib.w)===1),'pie judged');await p.evaluate(()=>hvFair());ok(!(await p.isVisible('#hvfPie')),'one pie a day');ok(!errs.length,errs.join('; '));await c.close()});

await check('town jobs and Fish Market: Notice Board jobs hand in for pay and reputation, market buys wanted fish at double up to a cap',async()=>{const p=await page(VPS[1][1],save({log:{bluegill:{n:5,big:1}},cooler:{bluegill:{n:9,val:90}},rep:95}));
  await p.evaluate(()=>{const q=TQ();q.jobs[0]={k:'fish',f:'bluegill',n:5,m:10,rp:10,who:'Old Pete'};boardUI()});const c0=await p.evaluate(()=>S.coins);await p.click('[data-tq="0"]');
  ok(await p.evaluate(c0=>S.cooler.bluegill.n===4&&S.rep===105&&repLv()===1&&S.coins>c0&&TQ().jobs[0].done,c0),'hand in');ok(await p.evaluate(()=>TQ().jobs.length>=3),'three jobs a day');
  const id=await p.evaluate(()=>{const f=marketWants()[0];S.cooler[f.id]={n:40,val:400};return f.id});await p.evaluate(()=>marketUI());const c1=await p.evaluate(()=>S.coins);
  await p.click(`[data-mk="${id}"].jig`);ok(await p.evaluate(({id,c1})=>{const sold=townDay().mk[id],left=S.cooler[id].n;return sold>0&&left===40-sold&&S.coins===c1+Math.round(10*sold*2)},{id,c1}),'market double price');
  await p.evaluate(()=>marketUI());ok(await p.evaluate(id=>document.querySelector(`[data-mk="${id}"].jig`).disabled,id),'daily cap');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('town projects: rebuild the bandstand and reopen the cannery together, builder rewards, evening concert, canning fish',async()=>{const p=await page(VPS[0][1],save({coins:3000000,min:1140,mats:{drift:12},cooler:{walleye:{n:30,val:3000}}}));
  const me=await p.evaluate(async()=>{const r=await api('hello',{name:'Tp'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});await tpLoad();return r});
  ok(await p.evaluate(()=>tpState().cur==='band'&&tpState().band.goal>=10000),'bandstand project first');await p.evaluate(()=>tpPanel('band'));await p.click('[data-tpc="1000000"]');await p.waitForTimeout(600);
  ok(await p.evaluate(()=>S.coins===2000000&&tpState().band.mine===1000&&S.rep===60),'give money: points and capped reputation');
  await p.evaluate(async me=>{const g=(await api('tp',{id:me.id,key:me.key})).band.goal;for(let left=g;left>0;left-=5000)await api('tp',{id:me.id,key:me.key,give:{p:'band',pts:5000}});await tpLoad()},me);
  ok(await p.evaluate(()=>tpState().band.done>0&&tpState().cur==='cannery'&&S.trophies.some(t=>t.name==='Bandstand Builder')&&concertOn()),'bandstand rebuilt, builder trophy, concert tonight');
  await p.evaluate(async me=>{const g=(await api('tp',{id:me.id,key:me.key})).cannery.goal;for(let left=g;left>0;left-=5000)await api('tp',{id:me.id,key:me.key,give:{p:'cannery',pts:5000}});await tpLoad()},me);
  ok(await p.evaluate(()=>tpState().cannery.done>0&&S.trophies.some(t=>t.name==='Cannery Builder')),'cannery reopened');
  await p.evaluate(()=>canneryUI());await p.click('[data-can="walleye"][data-n="20"]');ok(await p.evaluate(()=>CANS().n===20&&Math.round(CANS().v)===3000&&S.cooler.walleye.n===10),'canning: 20 a day, 50% more');
  const c0=await p.evaluate(()=>S.coins);await p.click('#canSell');ok(await p.evaluate(c0=>S.coins===c0+3000&&CANS().n===0,c0),'sell cans');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('ferry and Pine Island: the third town project, boarding for the fare, the crossing, walking the island, the islanders, the Cove, digging, the campfire, Nils’s key and the ride home',async()=>{const p=await page(VPS[1][1],save({coins:3e6,min:1300,stamina:40,q7:{step:7,everSolved:true}}));
  const me=await p.evaluate(async()=>{const r=await api('hello',{name:'Fy'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});return r});
  await p.evaluate(async me=>{for(const k of ['band','cannery','ferry']){for(let i=0;i<40;i++){const r=await api('tp',{id:me.id,key:me.key});if(r[k].done)break;await api('tp',{id:me.id,key:me.key,give:{p:k,pts:5000}})}}await tpLoad()},me);
  ok(await p.evaluate(()=>tpDone('ferry')&&tpState().cur===null&&S.trophies.some(t=>t.name==='Ferry Builder')),'ferry fixed, builder trophy');
  ok(await p.evaluate(()=>lakeMapHTML().includes('Pine Island')),'island pin on the map');
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openTown()});await p.waitForTimeout(1200);await p.evaluate(()=>ferryUI());await p.click('#frBoard');
  ok(await p.evaluate(()=>!!TOWN.cross&&S.coins===3e6-5000),'boarded for the fare');await p.waitForFunction(()=>TOWN.z==='isle'&&!TOWN.cross,null,{timeout:20000}).catch(()=>{});ok(await p.evaluate(()=>TOWN.z==='isle'&&!TOWN.cross),'arrived on Pine Island');
  await p.evaluate(()=>{TOWN.x=1240;TOWN.y=430});await p.waitForTimeout(800);ok(await p.evaluate(()=>{isleTalk(0);return !!INPC[0].bub}),'islanders talk');
  ok(await p.evaluate(()=>{TOWN.x=1400;return true}),'walks the island');await p.waitForTimeout(400);
  await p.evaluate(()=>coveUI());await p.waitForTimeout(200);await p.click('#cvBtn');ok(await p.evaluate(()=>COVE.st==='wait'),'cast in the Cove');await p.evaluate(()=>{COVE.bite=0});await p.waitForTimeout(250);
  ok(await p.evaluate(()=>COVE.st==='bite'),'bobber dips');await p.click('#cvBtn');ok(await p.evaluate(()=>['pineperch','covechub','steeplebass','isleshiner','mayorpike','hollowchar'].some(id=>S.log[id]&&S.cooler[id])),'Cove fish caught '+await p.evaluate(()=>document.getElementById('cvMsg').textContent));
  await p.click('#cvDone');ok(await p.evaluate(()=>{const I=ISLS();I.relics=['clapper','token','tinboat'];I.digs=3;const o=digNow(),o2=digNow();return o.includes('Hymnal')&&o2===''&&I.relics.length===4&&S.decor.hpsign===1}),'dig: relic, once a day, town sign');
  ok(await p.evaluate(()=>{const s0=S.stamina;fireUI();const a=S.stamina;window._st=[s0,a];fireUI();return a===Math.min(100,s0+30)&&S.stamina===a&&!!document.getElementById('frStory').textContent&&!!ISLS().fire}),'campfire story and stamina once '+await p.evaluate(()=>JSON.stringify(window._st)));await p.evaluate(()=>document.getElementById('plotModal').hidden=true);
  ok(await p.evaluate(()=>{const n=S.trophies.length,a=isleKey(),b=isleKey();return a&&!b&&S.trophies.length===n+1&&S.trophies[0].name==='Key to Hollow Pines'}),'Nils’s key, once');await p.waitForTimeout(300);await p.evaluate(()=>document.querySelectorAll('.away,#celebrate').forEach(m=>m.hidden=true));
  const c1=await p.evaluate(()=>S.coins);await p.evaluate(()=>ferryCross('town'));await p.waitForFunction(()=>TOWN.z===''&&!TOWN.cross,null,{timeout:20000}).catch(()=>{});ok(await p.evaluate(c1=>TOWN.on&&TOWN.z===''&&S.coins===c1,c1),'free ride home '+await p.evaluate(()=>JSON.stringify({on:TOWN.on,z:TOWN.z,c:S.coins,cr:TOWN.cross})));ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('fleet voyage report: unloading opens the report, lists the haul, sends her back, and the last report reopens from port',async()=>{const p=await page(VPS[1][1],save({coins:2e8,boat:4}));
  await p.evaluate(()=>{fleetBuy('trawler');fleetSail(0,'kelp');FLEET().ships[0].v.end=Date.now()-1;openPhone();phShow('fleet')});await p.waitForTimeout(400);await p.click('[data-flu="0"]');await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{const L=FLEET().ships[0].last,rows=[...document.querySelectorAll('.flr-row')].length,sum=Object.values(L.sp).reduce((a,t)=>a+t.n,0);return {rows,sp:Object.keys(L.sp).length,sum,n:L.n,got:L.got,again:!!document.getElementById('flAgain')}});
  ok(r.rows===r.sp&&r.sum===r.n&&r.n===await p.evaluate(()=>FARW[0].cnt)&&r.got>0&&r.again,'report '+JSON.stringify(r));
  await p.click('#flAgain');ok(await p.evaluate(()=>FLEET().ships[0].v&&FLEET().ships[0].v.d==='kelp'&&!document.querySelector('.fl-rep')),'send her back');
  await p.evaluate(()=>{FLEET().ships[0].v=null;renderFleet()});await p.click('[data-fll="0"]');ok(await p.evaluate(()=>!!document.querySelector('.fl-rep.old')&&!document.getElementById('flAgain')),'last report reopens without a resend button');
  await p.click('#flBack');ok(await p.evaluate(()=>!document.querySelector('.fl-rep')&&!!document.querySelector('[data-fls]')),'back to port');ok(!p.errs.length,p.errs.join('; '))});
await check('Critter Club (Series 3): the case is first on the shelf, opens, rolls only its own items, every item draws, rods fire their critter effects',async()=>{const p=await page(VPS[1][1],save({coins:5e6}));
  await p.evaluate(()=>{openPhone();phShow('crate');CR.tab='home';renderCrate()});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>{const f=document.querySelector('.cr-shelf [data-crgo-open]');return f&&f.dataset.crgoOpen==='critter'}),'Critter Club is the first crate');
  await p.click('[data-crgo-open="critter"]');ok(await p.evaluate(()=>CR.kind==='critter'&&/Critter Club crate/.test(document.getElementById('crBuy').textContent)),'open page');
  const r=await p.evaluate(()=>{const ids=new Set(CRATES.critter.items.map(s=>s.id));let bad=0;for(let i=0;i<300;i++)if(!ids.has(itemRoll('critter').id))bad++;
    const tiers=new Set(CRATES.critter.items.map(s=>s.t));let thumbs=0;for(const s of CRATES.critter.items){if(itemThumb(s.id,96,44).startsWith('data:image'))thumbs++}
    const inLists=['paint','rod','bob'].every(k=>crItems(k).some(s=>s.cc));return {n:ids.size,bad,tiers:[...tiers].sort().join(''),thumbs,inLists}});
  ok(r.n===31&&r.bad===0&&r.tiers==='CELRU'&&r.thumbs===31&&r.inLists,'rolls and thumbnails '+JSON.stringify(r));
  await p.evaluate(()=>crateOpen(false));await p.waitForTimeout(6600);ok(await p.evaluate(()=>!!CR.last&&!!CR.last.win.cc&&!!document.getElementById('crPrev')),'a crate lands on a Critter Club item');
  await p.evaluate(()=>{const P=PNT();for(const id of ['swan','r_songbird','b_beast'])P.own[id]=1;P.eq='swan';P.eqR='r_songbird';P.eqB='b_beast';closePhone()});await p.waitForTimeout(600);
  for(const id of ['r_firefly','r_monarch','r_songbird']){await p.evaluate(id=>{const P=PNT();P.own[id]=1;P.eqR=id;rodFx(500,260)},id);await p.waitForTimeout(500)}
  await p.evaluate(()=>{for(const id of ['kitty','frog','bee','swan']){PNT().eq=id}});await p.waitForTimeout(500);ok(!p.errs.length,p.errs.join('; '))});
await check('home comfort: furniture, bed, house and yard add comfort; sleeping in your own bed gives Well Rested (faster casts, longer when cozier); visiting a friend does not; the coffee maker brews one a day and holds three',async()=>{
  const st=save({shack:3,sleep:{ph:'awake',t:0},stamina:40,cab:{col:{},own:{quilt:1,braided:1,lakemap:1,armchair:1,stove:1},bed:'quilt',rug:'braided',lamp:null,wall:['lakemap',null,null],ex:{}},decor:{flowers:1,campfire:1}});
  const p=await page(VPS[0][1],st);
  const cp=await p.evaluate(()=>comfortParts());ok(cp.house===6&&cp.bed===2&&cp.furn===5&&cp.yard===3&&cp.total===16,'comfort parts '+JSON.stringify(cp));
  ok(await p.evaluate(()=>restMins()===26&&!PALL.includes('rested')&&!PKEYS.includes('rested')),'rest minutes and rested is not a potion');
  const c0=await p.evaluate(()=>castDur());await p.evaluate(()=>sleepInBed());let ok2=false;for(let i=0;i<40&&!ok2;i++){await p.waitForTimeout(500);ok2=await p.evaluate(()=>S.sleep&&S.sleep.ph==='awake')}
  const r=await p.evaluate(()=>({b:S.buffs.rested||0,cd:castDur(),chip:document.getElementById('buffs').textContent}));ok(r.b>25*60&&r.b<=26*60&&Math.abs(r.cd/c0-.85)<.01&&/Rested 26m/.test(r.chip),'Well Rested after your own bed '+JSON.stringify(r));
  ok(await p.evaluate(()=>{const cb=CAB();for(const z of COS)cb.own[z.id]=1;cb.bed='canopy';S.shack=6;for(const id of ['flowers','mailbox','gnome','woodpile','campfire','birch','torches','garden','fence','hammock','hottub'])S.decor[id]=1;const P=comfortParts();return P.yard===12&&P.total>55&&restMins()===60}),'yard capped, and Well Rested capped at an hour');
  const b=await p.evaluate(()=>{S.brew={d:S.day};const a=brewReady();S.day+=1;const b1=brewReady();S.day+=9;const b2=brewReady();const c=S.pots.coffee||0;const got=brewCollect();return [a,b1,b2,got,(S.pots.coffee||0)-c,brewReady()]});
  ok(JSON.stringify(b)==='[0,1,3,3,3,0]','coffee pot '+JSON.stringify(b));
  await p.evaluate(()=>{S.day+=1;goRoom('basement')});await p.waitForTimeout(800);const c1=await p.evaluate(()=>S.pots.coffee);await p.evaluate(()=>bAct('coffee'));await p.waitForTimeout(4900);
  ok(await p.evaluate(c1=>S.pots.coffee===c1+1&&!BS.act&&brewReady()===0,c1),'brewing in the basement fills a thermos');ok(!p.errs.length,p.errs.join('; '))});
await check('phone controls: thumbstick walks, action button enters places, Go to walks you there, off in Settings',async()=>{const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({sleep:{ph:'yard',t:0,visit:true}}));const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL0);await p.waitForTimeout(800);await p.evaluate(()=>{if(!document.getElementById('titleScreen').hidden)document.getElementById('tGo').click()});await p.waitForTimeout(900);await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));await p.waitForTimeout(400);
  ok(await p.isVisible('#joy'),'thumbstick in the yard');const jb=await p.locator('#joy').boundingBox(),x0=await p.evaluate(()=>WALK.x);await p.mouse.move(jb.x+56,jb.y+56);await p.mouse.down();await p.mouse.move(jb.x+106,jb.y+56,{steps:4});await p.waitForTimeout(800);await p.mouse.up();
  ok(await p.evaluate(x0=>WALK.x-x0>20,x0),'thumbstick walks');await p.evaluate(()=>{WALK.x=WALK.door[0];WALK.y=WALK.door[1]+4});await p.waitForTimeout(500);ok((await p.textContent('#actBtn'))==='Go inside','action: Go inside');
  await p.evaluate(async()=>{const r=await api('hello',{name:'Jy'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});openTown()});await p.waitForTimeout(1200);
  await p.evaluate(()=>{TOWN.x=395;TOWN.y=420});await p.waitForTimeout(500);ok((await p.textContent('#actBtn'))==='Enter Bait & Tackle','action: Enter');await p.click('#actBtn');await p.waitForTimeout(2500);ok(await p.evaluate(()=>TOWN.z==='tackle'),'entered the shop');
  await p.evaluate(()=>townGoUI());await p.click('[data-go="1240"]');await p.waitForFunction(()=>!TOWN.z&&Math.abs(TOWN.x-1240)<4,null,{timeout:20000}).catch(()=>{});ok(await p.evaluate(()=>!TOWN.z&&Math.abs(TOWN.x-1240)<4),'Go to walks there');
  await p.evaluate(()=>{SETS().joy=false});await p.waitForTimeout(400);ok(!(await p.isVisible('#joy')),'thumbstick off in Settings');ok(!errs.length,errs.join('; '));await c.close()});

await check('prestige: preview, reset keeps house and pets, income starts fresh, star, flag, Legacy rod, costume, old retirees convert',async()=>{const p=await page(VPS[0][1],save({coins:1e7+5,rod:5,boat:3,shack:6,rate:900000,rateL:800000,cooler:{walleye:{n:3,val:300}}}));
  await p.evaluate(()=>prPreview());ok(await p.isVisible('.pr-prev #prGo:not([disabled])'),'preview with Prestige button');await p.click('#prGo');ok(await p.evaluate(()=>prLv()===0),'two taps needed');await p.click('#prGo');await p.waitForTimeout(500);
  ok(await p.evaluate(()=>prLv()===1&&S.coins===1000&&S.boat===0&&S.rod===0&&S.shack===6&&!Object.keys(S.cooler).length),'reset gear, kept house');
  ok(await p.evaluate(()=>S.rate===0&&S.rateL==null&&slotRate()<20000),'income starts fresh, so slots can’t pay out the old income '+await p.evaluate(()=>slotRate()));
  ok(await p.evaluate(()=>(PNT().own.r_legacy|0)===1&&HW().wear==='pcap'&&S.trophies[0].name==='Prestige I'),'Legacy rod, cap, trophy');ok(await p.isVisible('.pr-show'),'big moment');await p.click('#prOk');
  ok(await p.evaluate(()=>prCost(2)===2e7&&mpStats().pr===1),'next costs double, star shared');ok(!p.errs.length,p.errs.join('; '));await p.context().close();
  const q=await page(VPS[0][1],save({ret:5}));ok(await q.evaluate(()=>prLv()===5&&(PNT().own.r_legacy|0)===1&&(PNT().own.r_legacylit|0)===1),'retiree converts with rods');ok(!q.errs.length,q.errs.join('; '));await q.context().close()});

await check('Phoenix Collection: Mythic set in Crate Expectations, two-tap buy, unveil, equips, set bonus firebird',async()=>{const p=await page(VPS[1][1],save({coins:1e8+5}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openPhone();phShow('crate')});await p.waitForTimeout(400);ok(await p.isVisible('.phx-card'),'collection shown');
  await p.click('[data-phx="phoenix"]');ok(await p.evaluate(()=>!PNT().own.phoenix),'two taps needed');await p.click('[data-phx="phoenix"]');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>PNT().own.phoenix===1&&PNT().eq==='phoenix'&&S.coins===5e7+5),'bought and wearing the boat');ok(await p.isVisible('.phx-show'),'unveil');await p.click('#phxOk');
  ok(await p.evaluate(()=>phxBuy('r_phoenix')&&phxBuy('b_phoenix')&&!phxBuy('b_phoenix')&&phxSet()&&S.coins===5),'whole set, no double buy');await p.evaluate(()=>document.querySelectorAll('.phx-show').forEach(e=>e.remove()));
  await p.evaluate(()=>phxBird());await p.waitForTimeout(800);ok(await p.evaluate(()=>performance.now()/1000-PHXB.t0<3.4),'firebird flying');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('big yards: visitors get every placed thing and the ground, even past the old size limit',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(async()=>{const r=await api('hello',{name:'Yd'+Math.floor(Math.random()*1e5)});mpS();Object.assign(S.mp,{id:r.id,key:r.key,name:r.name,pinAsked:true});
    yardSync();const ids=['hedge','picket'];S.yard.it=[];for(let i=0;i<600;i++)S.yard.it.push([ids[i%2],-800+i*1.7,240+(i%15)*10,i%2,100+i%90]);S.yard.g={};const gt=Object.keys(YGT);for(let i=0;i<700;i++)S.yard.g[(i%44)+','+Math.floor(i/44)]=gt[(i*7)%gt.length];
    for(let i=0;i<80;i++)S.trophies.push({name:'Trophy number '+i,water:'pond',type:'count',score:'$1,000,000',day:i});
    const len=JSON.stringify(mpCabin()).length;MPV.last=0;await mpSync(true);const c=await api('cabin',{id:r.id,key:r.key,target:r.id}),y=yardParse(JSON.parse(c.cabin).ext.yard);return {len,n:y.it.length,g:Object.keys(y.g).length}});
  ok(r.len>19500,'snapshot is past the old limit ('+r.len+')');ok(r.n===600,'all 600 things shared ('+r.n+')');ok(r.g>0,'ground shared');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('big games move: transfer codes and cloud saves take big saves, and a failed move offers the save code',async()=>{const p=await page(VPS[1][1],save({}));
  ok(await p.evaluate(async()=>{const r=await api('xfer/put',{data:'LL2.'+'A'.repeat(400000)});return /^[A-Z0-9]{6}$/.test(r.code)}),'400 KB transfer code');
  await p.evaluate(()=>{const f=window.fetch;window.fetch=(u,o)=>String(u).includes('xfer/put')?Promise.resolve(new Response('{"error":"bad-save"}',{status:400})):String(u).includes('lanternlake.app')?Promise.resolve(new Response('{}')):f(u,o);const b=document.createElement('button');b.id='mvGo';document.body.append(b);return moveGame('mvGo')});
  await p.waitForTimeout(800);ok(await p.evaluate(()=>{const g=i=>document.getElementById(i);return !g('saveModal').hidden&&g('xfOff').open&&g('saveTxt').value.length>50}),'save code offered instead');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('moon: the boat lands on thrusters, and takes off when the air runs out',async()=>{const c=await b.newContext({viewport:VPS[0][1]});
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({boat:5,water:'deep',realm:{gates:{moon:1},gear:{}},set:{}}));const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL0);await p.waitForTimeout(800);await p.evaluate(()=>{if(!document.getElementById('titleScreen').hidden)document.getElementById('tGo').click()});await p.waitForTimeout(900);await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);travelTo('moon')});
  let landed=false;for(let i=0;i<60&&!landed;i++){await p.waitForTimeout(200);landed=await p.evaluate(()=>MFX.ph==='land')}ok(landed&&await p.evaluate(()=>!TRV.on),'floats straight down on thrusters (no sailing in from the side)');await p.waitForTimeout(3200);ok(await p.evaluate(()=>S.water==='moon'&&MFX.ph===''),'touched down');
  await p.evaluate(()=>{S.o2=.1});await p.waitForTimeout(700);ok(await p.evaluate(()=>MFX.ph==='lift'),'out of air: lift-off');await p.waitForTimeout(3200);ok(await p.evaluate(()=>S.water!=='moon'&&!TRV.on),'flew straight up and home');
  await p.evaluate(()=>{travelTo('moon')});await p.waitForTimeout(3400);await p.evaluate(()=>travelTo('deep'));ok(await p.evaluate(()=>MFX.ph==='lift'&&S.water==='moon'),'leaving on purpose lifts off too');await p.waitForTimeout(3200);ok(await p.evaluate(()=>S.water==='deep'&&!TRV.on),'arrives home');ok(!errs.length,errs.join('; '));await c.close()});

await check('prestige: built gates still need the right boat again before you can go through',async()=>{const p=await page(VPS[0][1],save({ret:1,boat:0,water:'pond',realm:{gates:{moon:1,hell:1},gear:{}}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);travelTo('moon')});ok(await p.evaluate(()=>S.water==='pond'),'starter boat can’t go to the Moon');
  await p.evaluate(()=>openTab('waters'));await p.waitForTimeout(300);ok(await p.evaluate(()=>{const b=document.querySelector('[data-realm="moon"]');return !!b&&b.disabled}),'gate button disabled');
  await p.evaluate(()=>{S.boat=5;travelTo('moon')});await p.waitForTimeout(400);ok(await p.evaluate(()=>S.water==='moon'),'with the boat back, the gate works');
  await p.evaluate(()=>{S.boat=5;travelTo('hell',{instant:true})});ok(await p.evaluate(()=>S.water!=='hell'),'the Ember Lake still needs its own boat');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('phone dive: holding an arrow moves the diving bell and never selects the button text',async()=>{const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({water:'deep',boat:4,q:{step:7,everSolved:true},q2:{step:7,everSolved:true},q3:{step:7,everSolved:true},q4:{step:7,everSolved:true,msgs:[],lies:{}},q5:{step:7,everSolved:true},q6:{step:7,everSolved:true},q7:{step:6,startDay:1,keep:{locket:1,slate:1,sign:1},bell:true,read:true}}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0);await p.waitForTimeout(800);await p.evaluate(()=>{if(!document.getElementById('titleScreen').hidden)document.getElementById('tGo').click()});await p.waitForTimeout(900);
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);dvOpen()});await p.waitForTimeout(400);
  const bx=await p.locator('[data-dv="r"]').boundingBox(),x0=await p.evaluate(()=>DV.x),cdp=await c.newCDPSession(p),pt=[{x:bx.x+bx.width/2,y:bx.y+bx.height/2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pt});await p.waitForTimeout(1200);
  ok(await p.evaluate(x0=>DV.x>x0+30,x0),'holding ▶ moves the bell');ok(await p.evaluate(()=>!String(getSelection())&&document.querySelector('[data-dv="r"]').classList.contains('on')),'no text selected, button lit');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);ok(await p.evaluate(()=>!DV.keys.r),'letting go stops it');ok(!errs.length,errs.join('; '));await c.close()});

await check('realms: reopening the game keeps you on the Moon with the Moon Base, and in the other realms',async()=>{
  for(const [nm,extra,want] of [['moon base',{water:'moon',realm:{gates:{moon:1},gear:{tank:1,moonbase:1}},o2:null},'moon'],['air left',{water:'moon',realm:{gates:{moon:1},gear:{}},o2:200},'moon'],['no air',{water:'moon',realm:{gates:{moon:1},gear:{}},o2:0},'deep'],['cloud sea',{water:'sky',boat:7,realm:{gates:{sky:1},gear:{}}},'sky'],['boat too small',{water:'sky',boat:3,realm:{gates:{sky:1},gear:{}}},'deep']]){
    const p=await page(VPS[0][1],save(Object.assign({boat:5,realmFrom:'deep',last:Date.now()},extra)));ok(await p.evaluate(w=>S.water===w,want),nm+': '+(await p.evaluate(()=>S.water)));ok(!p.errs.length,p.errs.join('; '));await p.context().close()}});

await check('harvest shop 2: new decor draws, dock items slide and clamp, friends see the dock',async()=>{const c=await b.newContext({viewport:VPS[0][1]});
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({decor:{pumpkinpatch:1,wheelbarrow:1,ciderpress:1,maple:1,hayride:1,garland:1,porchrocker:1,lanterns:1,turkey:1,pettrim:1,hay:1,bench:1,kayak:1},sleep:{ph:'yard',t:0,visit:true}}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0.replace('season=off','season=hv'));await p.waitForTimeout(800);await p.click('#tGo');await p.waitForTimeout(1500);
  await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));
  ok(await p.evaluate(()=>['pumpkinpatch','wheelbarrow','ciderpress','maple','hayride'].every(id=>yardList().some(a=>a[0]===id))),'land pieces placed');
  await p.evaluate(()=>{yedEnter();document.querySelector('[data-yt="dock"]').click()});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>['turkey','hay','bench','kayak'].every(id=>document.querySelector(`[data-yk="${id}"]`))&&!document.querySelector('[data-yk="crabs"]')),'dock tab lists owned pieces');
  await p.evaluate(()=>document.querySelector('[data-yk="bench"]').click());for(let i=0;i<20;i++)await p.click('[data-yn="16"]');
  const bx=await p.evaluate(()=>S.dockX.bench);ok(bx>0&&bx<=70,'bench clamps at the dock end '+bx);
  await p.evaluate(()=>document.querySelector('[data-yk="kayak"]').click());for(let i=0;i<5;i++)await p.click('[data-yn="16"]');ok(await p.evaluate(()=>S.dockX.kayak===80),'kayak floats past the dock');
  await p.click('[data-yn="0"]');ok(await p.evaluate(()=>!('kayak' in S.dockX)),'reset');
  ok(await p.evaluate(()=>{const h=HITS.find(h=>h.kind==='ydeco'&&h.data==='bench');return !!h}),'bench still tappable');
  ok(await p.evaluate(()=>mpCabin().ext.dockX.bench===S.dockX.bench),'shared with friends');
  await p.waitForTimeout(400);ok(!errs.length,errs.join('; '));await c.close()});
await check('decorate: tap the item itself to select, tap again for the one behind, nudge, layers, tap ground to let go',async()=>{const p=await page(VPS[0][1],save({decor:{gnome:1,mailbox:1},sleep:{ph:'yard',t:0,visit:true},yard:{land:0,it:[['gnome',60,330,0],['mailbox',62,326,0]]}}));await p.waitForTimeout(1200);
  await p.evaluate(()=>yedEnter());{let prev='';for(let k=0;k<40;k++){const cur=await p.evaluate(()=>{const T=getCAMT();return [T.z,T.ox,T.oy].map(v=>v.toFixed(2)).join()});if(cur===prev)break;prev=cur;await p.waitForTimeout(150)}}await p.waitForTimeout(300);
  const at=async(wx,wy)=>p.evaluate(([wx,wy])=>{const T=getCAMT(),cv=document.querySelector('#cv'),R=cv.getBoundingClientRect();return [R.left+((wx*T.z+T.ox)*BASE.s+BASE.ox)/cv.width*R.width,R.top+((wy*T.z+T.oy)*BASE.s+BASE.oy)/cv.height*R.height]},[wx,wy]);
  const both=await p.evaluate(()=>{const L=yardList();for(let y=300;y<332;y++)for(let x=40;x<84;x++){const c=yardCands(x,y);if(c.length===2)return [x,y,c.map(i=>L[i][0])]}return null});ok(both,'no spot where both overlap');
  await p.mouse.click(...await at(both[0],both[1]));await p.waitForTimeout(150);const first=await p.evaluate(()=>yardList()[YED.sel][0]);ok(first===both[2][0],'front item first '+first);
  await p.mouse.click(...await at(both[0],both[1]));await p.waitForTimeout(150);ok(await p.evaluate(()=>yardList()[YED.sel][0])===both[2][1],'second tap reaches the one behind');
  const before=await p.evaluate(()=>[...yardList()[YED.sel]]);await p.click('[data-ym="2,0"]');await p.click('[data-ym="0,2"]');
  ok(await p.evaluate(b=>{const a=yardList()[YED.sel];return a[1]===b[1]+2&&a[2]===b[2]+2},before),'nudge buttons');
  await p.click('[data-yz="1"]');const lay=await p.evaluate(b=>{const L=yardList(),i=YED.sel,c=yardCands(b[0],b[1]),pk=mpCabin().ext.yard.it.find(a=>a[0]===L[i][0]),vp=yardParse({land:0,it:[pk]}).it[0];return {front:L[c[0]][0],me:L[i][0],z:L[i][6],pk,vp}},both);
  ok(lay.front===lay.me&&lay.z>0,'To front puts it in front '+JSON.stringify(lay));ok(lay.pk[6]===lay.z&&lay.vp[6]===lay.z,'friends get the layer');
  await p.click('[data-yz="-1"]');ok(await p.evaluate(b=>{const L=yardList(),c=yardCands(b[0],b[1]);return c[c.length-1]===YED.sel},both),'To back');
  const empty=await p.evaluate(()=>{for(let x=150;x>-200;x-=4)if(!yardCands(x,360).length)return x;return null});await p.mouse.click(...await at(empty,360));await p.waitForTimeout(150);ok(await p.evaluate(()=>YED.sel)===-1,'tapping ground lets go');
  ok(!p.errs.length,p.errs.join('; '))});
await check('big harvest pieces sit on their base and reach the house; old placements stay put',async()=>{const p=await page(VPS[0][1],save({decor:{maple:1,hayride:1},sleep:{ph:'yard',t:0,visit:true},yard:{land:0,it:[['maple',-12,222,0],['hayride',48,332,1]]}}));await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{const L=yardList(),m=L.find(a=>a[0]==='maple'),h=L.find(a=>a[0]==='hayride'),bm=yBoxM(m);return {m:[m[1],m[2]],h:[h[1],h[2]],foot:bm[1]+bm[3]-m[2],up:yardClamp('maple',60,250)[1],flag:S.yard.re157}});
  ok(r.m[0]===14&&r.m[1]===296&&r.h[0]>=2&&r.h[0]<=8&&r.h[1]===396&&r.flag,'migrated '+JSON.stringify(r));ok(Math.abs(r.foot)<=2,'maple base at its anchor '+r.foot);ok(r.up===250,'maple can come up to the house');
  ok(!p.errs.length,p.errs.join('; '))});
await check('time away in a realm: realm prices for the first hour only, then the home water; you stay in the realm',async()=>{const p=await page(VPS[0][1],save({boat:7,rod:9,lure:9,shack:6,water:'sky',realmFrom:'pond'}));
  const r=await p.evaluate(()=>{RS().gates={sky:1};S.water='sky';S.realmFrom='pond';S.log={};S.cooler={};offline(3*3600);const ids=Object.keys(S.log),fi=id=>FI(id);return {w:S.water,sky:ids.filter(id=>fi(id)&&fi(id).at==='sky').length,pond:ids.filter(id=>fi(id)&&fi(id).at==='pond').length,txt:document.querySelector('.aw-sub')?document.querySelector('.aw-sub').textContent:''}});
  ok(r.w==='sky','still in the realm');ok(r.sky>0&&r.pond>0,'realm fish then home fish '+JSON.stringify(r));ok(/first hour/.test(r.txt),'away note');ok(!p.errs.length,p.errs.join('; '))});
await check('greenhouse and farm prices follow steady income and stop at their caps',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(()=>{const o={};S.rate=5e6;S.rateL=4e6;o.hi=[GHC.sunfruit.sell,GHC.moonflower.sell,GHC.glowberry.sell,GHC.grub.sell,FARMF.honey.sell,FARMF.egg.sell];S.rate=3e6;S.rateL=1000;o.slow=GHC.sunfruit.sell;S.rate=0;S.rateL=null;o.lo=[GHC.sunfruit.sell,FARMF.egg.sell];return o});
  ok(JSON.stringify(r.hi)==='[90000,50000,20000,12000,25000,8000]','caps '+JSON.stringify(r));ok(r.slow===4500,'a spike doesn’t lift prices '+r.slow);ok(r.lo[0]===4500&&r.lo[1]===120,'floors');ok(!p.errs.length,p.errs.join('; '))});
await check('the Great Gobble: feast goal on the server, the ledger, the Great Gobbler, the prize turkey show and pardon, Master Baker, the Golden Gobbler set',async()=>{const c=await b.newContext({viewport:VPS[0][1]});
  const cx=await b.newContext(),p0=await cx.newPage();await p0.goto(URL0);const A=await p0.evaluate(async()=>api('hello',{name:'Gb'+Math.floor(Math.random()*1e5)}));
  const r1=await p0.evaluate(async A=>api('sync',{id:A.id,key:A.key,stats:{},hvq:1,hvb:20000,hvtq:1,hvt:33.4}),A);
  ok(r1.hvb&&r1.hvb.goal2>=r1.hvb.goal*10,'feast goal set once the basket is full '+JSON.stringify(r1.hvb&&[r1.hvb.goal,r1.hvb.goal2,r1.hvb.total]));
  ok(r1.hvt&&r1.hvt.me&&r1.hvt.me.w===33.4&&r1.hvt.me.rank>=1,'turkey score on the show board '+JSON.stringify(r1.hvt));
  const r2=await p0.evaluate(async A=>api('sync',{id:A.id,key:A.key,stats:{},hvtq:1,hvt:20}),A);ok(r2.hvt.me.w===33.4,'show keeps your best score');await cx.close();
  await c.addInitScript(s=>{if(!localStorage.getItem('lantern-lake-v1'))localStorage.setItem('lantern-lake-v1',JSON.stringify(s))},save({mp:{id:A.id,key:A.key,name:A.name},cooler:{acornsun:{n:3,val:120}},pantry:{apple:6}}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0.replace('season=off','season=hv'));await p.waitForTimeout(800);await p.click('#tGo');await p.waitForTimeout(1500);
  await p.evaluate(()=>document.querySelectorAll('.away').forEach(m=>m.hidden=true));
  ok(await p.evaluate(()=>{const f=FI('greatgobbler');return !evLive(f)}),'Great Gobbler locked at first');
  const L=await p.evaluate(()=>{HV().pts=650000;hvLedgerClaim();const P=PNT().own;return {led:Object.keys(HV().led).length,rod:!!P.r_gobbler,boat:!!P.gobbler,bob:!!P.b_gobbler,suit:hvHasCos('turkeysuit'),pil:hvHasCos('pilgrim')}});
  ok(L.led===10&&L.rod&&L.boat&&!L.bob&&L.suit&&L.pil,'ledger pays out up to the points given '+JSON.stringify(L));
  ok(await p.evaluate(()=>{MPV.hvb={goal:10000,goal2:200000,total:95000,n:2,mine:20000,top:[]};hvFeastClaim();const h=HV();return h.feast[0]&&h.feast[1]&&h.feast[2]&&!h.feast[3]&&!!PNT().own.b_turkey&&evLive(FI('greatgobbler'))}),'feast rewards and the Great Gobbler unlock');
  ok(await p.evaluate(()=>{const P=PNT();P.own.b_gobbler=1;P.eq='gobbler';P.eqR='r_gobbler';P.eqB='b_gobbler';return gobSet()}),'Golden Gobbler set bonus');
  await p.evaluate(()=>{tkClaim()});ok(await p.evaluate(()=>TKY()&&TKY().w===8),'adopt a turkey poult');
  const w=await p.evaluate(()=>{tkFeed('fish');const a=TKY().w;tkFeed('corn');tkGroom();tkGroom();return [a,TKY().w,TKY().pl,!S.cooler.acornsun||S.cooler.acornsun.n===2]});ok(w[0]>8&&w[1]===w[0]&&w[2]===1&&w[3],'feed and groom once a day '+JSON.stringify(w));
  ok(await p.evaluate(()=>{MPV.hvt={ended:true,top:[],me:{w:40,rank:1}};const real=Date.now;Date.now=()=>HVT_END_T+1000;try{tkSettle()}finally{Date.now=real}return HV().tkDone&&!!petsS().own.turkey&&S.trophies[0].name==='Prize Turkey Show 1st place'}),'show day: 1st place trophy and the turkey is pardoned as a pet');
  ok(await p.evaluate(()=>{const h=HV();h.rib={b:11,r:0,w:0};h.rib.b++;hvBakerCheck();return hvHasCos('apron')}),'Master Baker apron');
  await p.evaluate(()=>{openPhone();phShow('hv')});await p.waitForTimeout(400);ok(await p.evaluate(()=>/Gobbler’s Ledger/.test(document.getElementById('hvBody').textContent)&&/Thanksgiving Feast/.test(document.getElementById('hvBody').textContent)),'Harvest app shows the feast and the ledger');
  ok(!errs.length,errs.join('; '));await c.close()});
await check('every fish can go to the museum: the server knows every species in the game',async()=>{const p=await page(VPS[0][1],save({}));
  const src=fs.readFileSync(path.join(HERE,'..','src','worker.js'),'utf8'),M=JSON.parse(src.match(/const MUS_W=(\{.*?\});/)[1]);
  const ids=await p.evaluate(()=>FISH.filter(f=>!f.quest).map(f=>f.id));const miss=ids.filter(id=>!M[id]);ok(!miss.length,'missing from the museum list: '+miss.join(', '));
  const r=await p.evaluate(async()=>{const A=await api('hello',{name:'Mu'+Math.floor(Math.random()*1e5)});try{return await api('museum/donate',{id:A.id,key:A.key,fish:'greatgobbler',v:'',w:250+Math.random(),name:'Great Gobbler'})}catch(e){return {err:String(e)}}});ok(r&&!r.error&&!r.err,'a Great Gobbler is accepted '+JSON.stringify(r));await p.context().close()});
await check('the Fleet and Species Mastery: buying ships, voyages by real time, unloading the haul, upgrades, survives prestige, mastery stars and rewards, the server board',async()=>{
  const cx=await b.newContext(),p0=await cx.newPage();await p0.goto(URL0);const A=await p0.evaluate(async()=>api('hello',{name:'Fl'+Math.floor(Math.random()*1e5)}));
  const r1=await p0.evaluate(async A=>api('sync',{id:A.id,key:A.key,stats:{},msq:1,ms:37}),A);ok(r1.mst&&r1.mst.me&&r1.mst.me.w===37&&r1.mst.me.rank>=1,'mastery board '+JSON.stringify(r1.mst));await cx.close();
  const p=await page(VPS[0][1],save({coins:2e8,boat:4,ret:1,log:{bluegill:{n:499,big:1}}}));await p.waitForTimeout(1000);
  ok(await p.evaluate(()=>fleetOpen()&&!!document.querySelector('[data-app="fleet"],#app-fleet')),'Fleet app is there');
  const s1=await p.evaluate(()=>{fleetBuy('trawler');fleetBuy('trawler');fleetBuy('schooner');fleetBuy('research');const F=FLEET();return [F.ships.map(s=>s.t).join(),S.coins]});ok(s1[0]==='trawler,schooner'&&s1[1]===2e8-5e6-5e7,'buy ships, one of each, if you can afford it '+JSON.stringify(s1));
  ok(await p.evaluate(()=>{fleetSail(0,'coral');const a=FLEET().ships[0].v;fleetSail(0,'kelp');return !a&&!!FLEET().ships[0].v&&FLEET().ships[0].v.d==='kelp'}),'a Trawler can’t reach the Coral Atoll');
  ok(await p.evaluate(()=>{const n=Object.keys(S.cooler).length;fleetUnload(0);return Object.keys(S.cooler).length===n&&!!FLEET().ships[0].v}),'can’t unload before she’s home');
  const u=await p.evaluate(()=>{const s=FLEET().ships[0];s.v.end=Date.now()-1;const c0=Object.values(S.cooler).reduce((a,e)=>a+e.val,0);fleetUnload(0);const c1=Object.values(S.cooler).reduce((a,e)=>a+e.val,0);return [c1-c0,FARW[0].cnt,FISH.filter(f=>f.at==='kelp').some(f=>S.log[f.id]),!s.v,s.xp,FLEET().trips]});
  ok(u[0]>200000&&u[0]<400000&&u[2]&&u[3]&&u[4]===2&&u[5]===1,'unload: fish worth about $300k in the cooler, logged, captain xp '+JSON.stringify(u));
  ok(await p.evaluate(()=>{const c=S.coins;fleetUp(1);const s=FLEET().ships[1];return s.lv===2&&S.coins===c-25e6}),'upgrade a ship');
  ok(await p.evaluate(()=>{S.coins=5e8;const st=S.mst;prestigeNow();return S.ret===2&&FLEET().ships.length===2&&FLEET().ships[1].lv===2}),'the fleet survives a prestige');
  const m=await p.evaluate(()=>{const f=FI('bluegill');const a=mstStars(f),v0=saleValue(f,1000);S.log.bluegill.n=500;const b=mstStars(f),v1=saleValue(f,1000);S.log.perch={n:600,big:1};S.log.walleye={n:300,big:1};S.log.koi={n:30,big:1};S.log.carp={n:2000,big:1};S.log.lmb={n:300,big:1};mstClaim();return [a,b,v1/v0,mstTotal(),S.coins>=250000&&!!(S.mst&&S.mst.got[0])]});
  ok(m[0]===1&&m[1]===2&&Math.abs(m[2]-1.08/1.04)<.02&&m[3]>=10&&m[4],'mastery stars, sale bonus and the first reward '+JSON.stringify(m));
  await p.evaluate(()=>{openPhone();phShow('fleet')});await p.waitForTimeout(400);ok(await p.evaluate(()=>/Your fleet/.test(document.getElementById('flBody').textContent)),'Fleet app renders');
  ok(!p.errs.length,p.errs.join('; '))});
await check('chickens walk to where they’re going instead of shaking in place',async()=>{const p=await page(VPS[0][1],save({sleep:{ph:'yard',t:0,visit:true},yard:{land:0,it:[['coop',60,300,0]],inv:{coop:1}}}));await p.waitForTimeout(1500);
  const r=await p.evaluate(async()=>{const L=yardList(),i=L.findIndex(a=>a[0]==='coop');const C=chickList(i);let changes=0,moved=0;const seen=C.map(c=>c.tx);const x0=C.map(c=>c.x);
    for(let k=0;k<40;k++){await new Promise(r=>requestAnimationFrame(r));C.forEach((c,j)=>{if(c.tx!=null&&seen[j]!=null&&c.tx!==seen[j])changes++;seen[j]=c.tx})}
    await new Promise(r=>setTimeout(r,4000));C.forEach((c,j)=>{if(Math.abs(c.x-x0[j])>2)moved++});return {changes,moved,n:C.length}});
  ok(r.n===3&&r.changes<=3,'targets hold steady while walking '+JSON.stringify(r));ok(r.moved>=1,'chickens get somewhere '+JSON.stringify(r));ok(!p.errs.length,p.errs.join('; '))});
await check('the Farm Update: care and quality, crows, hybrids, the kitchen, compost and the Farmers’ Market',async()=>{const ago=m=>Date.now()-m*6e4;
  const p=await page(VPS[0][1],save({coins:1e6,pantry:{egg:4,honey:2},cooler:{bluegill:{n:6,lbs:3,val:120}},junk:{boot:6},yard:{land:0,inv:{plot:3},it:[['plot',40,330,0,ago(300),'tomato'],['plot',80,330,0,ago(10),'carrot'],['plot',120,330,0]]}}));await p.waitForTimeout(1000);
  const r1=await p.evaluate(()=>{const it=S.yard.it,a=it[0];a[7]={w:1,c:1};FARM().comp=0;const n0=pantry().tomato|0;let hy=0;for(let k=0;k<40&&!hy;k++){a[4]=Date.now()-3e6*2;a[5]='tomato';a[7]={w:1,c:1};plotHarvest(a);hy=FARM().seeds.emberpepper|0}
    return {t:pantry().tomato,q:pqOf('tomato'),hy,cat:FARM().cat.tomato,len:a.length}});
  ok(r1.t>=5&&(r1.q.g+r1.q.p)>=5&&r1.cat&&r1.len===4,'a cared-for harvest is Gold or Prize, with compost’s extra yield '+JSON.stringify(r1));ok(r1.hy>=1,'a tomato next to carrots gives an Ember Pepper seed');
  const r2=await p.evaluate(()=>{const a=S.yard.it[0];a[4]=Date.now()-3e6*2;a[5]='tomato';a[7]={pe:Date.now()-3*36e5};farmCareTick.__t=0;window.__ft=0;return null});
  ok(await p.evaluate(()=>{const a=S.yard.it[0];a[7]={pe:Date.now()-3*36e5};a[4]=Date.now()-6e4;a[5]='tomato';const real=Date.now;Date.now=()=>real()+7e4;try{farmCareTick()}finally{Date.now=real}return a[7].ate===1&&!a[7].pe}),'a crow left alone eats some of the crop');
  ok(await p.evaluate(()=>{const a=S.yard.it[0];a[7]={ate:1};a[4]=Date.now()-6e6;a[5]='tomato';const n0=pantry().tomato|0,q0=JSON.stringify(pqOf('tomato'));plotHarvest(a);return (pantry().tomato|0)-n0===3&&JSON.stringify(pqOf('tomato'))===q0}),'an uncared-for harvest is Normal and smaller');
  ok(await p.evaluate(()=>{const P=pantry();P.carrot=4;P.corn=2;const ok1=canCook(RECIPES[0]);cookDish('chowder');const F=FARM();const had=F.dish.chowder===1&&(P.carrot|0)===2&&(S.cooler.bluegill.n===4);dishUse('chowder');return ok1&&had&&S.buffs.haste>=599&&!F.dish.chowder}),'cook Lakeside Chowder from crops and fish, eat it for a buff');
  ok(await p.evaluate(()=>{const c0=FARM().comp;compostNow('junk');return FARM().comp===c0+1&&!S.junk.boot||S.junk.boot===1}),'5 junk makes compost');
  const r3=await p.evaluate(()=>{const o=mkOrders();o[0]={t:'c',k:'tomato',n:2,q:2,min:10,rep:3};const c0=S.coins,r0=FARM().rep,g0=pqCount('tomato',2);mkFill(0);return {paid:S.coins-c0,rep:FARM().rep-r0,used:g0-pqCount('tomato',2),done:o[0].done,again:(mkFill(0),FARM().rep-r0)}});
  ok(r3.paid>=2500&&r3.rep===3&&r3.used===2&&r3.done&&r3.again===3,'fill a market order with Gold tomatoes, once '+JSON.stringify(r3));
  ok(await p.evaluate(()=>{FARM().rep=199;const o=mkOrders();o[1]={t:'c',k:'tomato',n:1,q:0,min:5,rep:1};pantry().tomato=(pantry().tomato|0)+1;mkFill(1);return farmLv()===5&&!!S.farm.cos&&S.trophies.some(t=>t.name==='Blue Ribbon Farmer')}),'reputation 5: Blue Ribbon Farmer prizes');
  ok(await p.evaluate(()=>{const v0=pantryAct;const P=pantry();P.goldcorn=2;const q=pqOf('goldcorn');q.p=1;const c0=S.coins;pantryAct('s','goldcorn');return S.coins-c0===2000*1+2000*5&&!P.goldcorn}),'Prize crops sell for 5×');
  await p.evaluate(()=>{openPhone();closePhone()});ok(!p.errs.length,p.errs.join('; '))});
await check('case 8, The Marigold: opens with a ship, the log, the sea chart, the wreck, Old Pete and the lantern in the fog',async()=>{const p=await page(VPS[1][1],save({coins:1e8,boat:4,min:600,day:40,water:'lake'}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);qStart()});ok(await p.evaluate(()=>Q8().step===0&&!caseList().find(c=>c.id===8).open),'sealed without a ship');
  await p.evaluate(()=>{fleetBuy('trawler');qStart()});ok(await p.evaluate(()=>Q8().step===1&&caseList().length===9),'opens once you own a ship');
  await p.evaluate(()=>{fleetSail(0,'kelp');FLEET().ships[0].v.end=Date.now()-1;fleetUnload(0)});await p.waitForFunction(()=>Q8().step===2,null,{timeout:8000});
  const dest=await p.evaluate(()=>Q8().dest);ok(['kelp','mangrove'].includes(dest),'wreck is somewhere a trawler can reach: '+dest);
  await p.evaluate(()=>{openPhone();phShow('case')});await p.waitForTimeout(300);await p.click('[data-case="8"]');ok(await p.isVisible('.q8chart'),'sea chart shows');
  const wrong=dest==='kelp'?'mangrove':'kelp';await p.click(`[data-q8="${wrong}"]`);ok(await p.evaluate(()=>Q8().step===2&&Q8().tries===1),'a wrong spot on the chart');
  await p.click(`[data-q8="${dest}"]`);ok(await p.evaluate(()=>Q8().step===3),'course plotted');
  await p.evaluate(d=>{fleetSail(0,d==='kelp'?'mangrove':'kelp');FLEET().ships[0].v.end=Date.now()-1;fleetUnload(0)},dest);await p.waitForTimeout(1500);ok(await p.evaluate(()=>Q8().step===3),'another water finds nothing');
  await p.evaluate(d=>{fleetSail(0,d);FLEET().ships[0].v.end=Date.now()-1;fleetUnload(0)},dest);await p.waitForFunction(()=>Q8().step===4&&Q8().fig,null,{timeout:8000});
  ok(await p.evaluate(()=>q8Talk('Dot')===null&&/1911/.test(q8Talk('Old Pete'))),'Old Pete tells the story');await p.waitForFunction(()=>Q8().step===5,null,{timeout:8000});
  await p.evaluate(()=>{S.water='bay';S.min=600;q8OnCatch()});await p.waitForTimeout(1200);ok(await p.evaluate(()=>Q8().step===5),'no lantern by day');
  await p.evaluate(()=>{S.min=1300;q8OnCatch()});await p.waitForFunction(()=>Q8().step===6,null,{timeout:8000});
  await p.evaluate(()=>{openPhone();phShow('case')});await p.click('[data-case="8"]');await p.click('#q8Fog');await p.waitForFunction(()=>FG.on&&!!document.querySelector('#fgCv'),null,{timeout:8000});
  const x0=await p.evaluate(()=>FG.x);await p.keyboard.down('ArrowRight');await p.waitForTimeout(400);await p.keyboard.up('ArrowRight');ok(await p.evaluate(x=>FG.x>x+40,x0),'the boat steers');
  await p.evaluate(()=>{FG.lost=.999;FG.x=60;FG.t=0});await p.waitForFunction(()=>FG.done&&!document.querySelector('#fgAgain').hidden,null,{timeout:8000});ok(await p.evaluate(()=>Q8().step===6),'lost in the fog, try again');
  await p.click('#fgAgain');await p.waitForFunction(()=>FG.on&&!FG.done,null,{timeout:8000});  await p.evaluate(()=>{FG.prog=1.2});await p.waitForFunction(()=>Q8().step===7,null,{timeout:10000});
  ok(await p.evaluate(()=>!!PNT().own.marigold&&S.boxes.some(b=>b.id==='mgbell')&&S.boxes.some(b=>b.id==='figurehead')&&S.trophies[0].name==='The Marigold'),'solved with the paint, bell, figurehead and trophy');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close()});
await check('case 9, The Weigh-In Scandal: Marge, the fish, five interviews, the records, the dawn stakeout and the accusation',async()=>{const p=await page(VPS[1][1],save({coins:1e6,boat:4,min:600,day:40,water:'lake'}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);qStart()});ok(await p.evaluate(()=>Q9().step===1&&!!Q9().who),'opens after The Lake Beast');
  const w=await p.evaluate(()=>Q9().who);ok(new Set([w.cul,w.dec,w.inA,w.inB]).size===4&&w.wear[w.cul]===w.wear[w.dec]&&w.wear[w.inA]!==w.wear[w.cul]&&w.wear[w.inB]!==w.wear[w.cul],'culprit and decoy share a look '+JSON.stringify(w));
  await p.evaluate(()=>q9Visit('bar'));await p.waitForTimeout(900);ok(await p.evaluate(()=>Q9().step===1),'interviews wait until Marge');
  await p.evaluate(()=>q9Visit('tackle'));await p.waitForFunction(()=>Q9().step===2,null,{timeout:8000});
  await p.evaluate(()=>{openPhone();phShow('case')});await p.waitForTimeout(300);await p.click('[data-case="9"]');await p.click('#q9Weigh');ok(await p.evaluate(()=>Q9().step===3&&S.coins===95e4),'bought and weighed the fish');
  for(const id of ['bar','post','news','museum'])await p.evaluate(i=>q9Visit(i),id);await p.waitForTimeout(3000);ok(await p.evaluate(()=>Q9().step===3),'four of five');
  ok(await p.evaluate(()=>{const q=Q9(),w=q.who;return q9Says(q,'bar').includes(Q9SUS[w.dec].n)&&q9Says(q,'arcade').includes(Q9SUS[w.inA].n)&&q9Says(q,'post').includes(Q9TR[w.wear[w.cul]][0])}),'statements point the right way');
  await p.evaluate(()=>q9Visit('arcade'));await p.waitForFunction(()=>Q9().step===4,null,{timeout:8000});
  await p.evaluate(()=>{openPhone();phShow('case')});await p.click('[data-case="9"]');ok(await p.evaluate(()=>document.querySelectorAll('.q9sus>div').length===4),'suspect cards');await p.click('#q9Rec');ok(await p.evaluate(()=>Q9().step===5),'records filed');
  ok(await p.evaluate(()=>{S.min=600;renderCase();return document.querySelector('#q9Stake').disabled}),'stakeout waits for dawn');
  await p.evaluate(()=>{S.min=330;renderCase()});await p.click('#q9Stake');await p.waitForFunction(()=>SKO.on&&!!document.querySelector('#skCv'),null,{timeout:8000});
  await p.evaluate(()=>{const w=Q9().who,o=[0,1,2,3].find(k=>k!==w.wear[w.cul]);SKO.spawn=99;SKO.boats=[{x:640,y:510,dir:1,sp:0,tgt:false,wr:o,col:'#333'}];skTap(640,480)});ok(await p.evaluate(()=>SKO.done&&!document.querySelector('#skAgain').hidden&&Q9().step===5),'wrong boat spoils it');
  await p.click('#skAgain');await p.waitForFunction(()=>SKO.on&&!SKO.done,null,{timeout:8000});
  await p.evaluate(()=>{const w=Q9().who;SKO.spawn=99;SKO.boats=[{x:400,y:510,dir:1,sp:0,tgt:true,wr:w.wear[w.cul],col:'#333'}];skTap(400,470)});await p.waitForFunction(()=>Q9().step===6&&Q9().photo,null,{timeout:8000});
  const wrongI=await p.evaluate(()=>[0,1,2,3].find(k=>k!==Q9().who.cul));await p.evaluate(()=>{openPhone();phShow('case')});await p.click('[data-case="9"]');await p.click(`[data-q9acc="${wrongI}"]`);
  ok(await p.evaluate(()=>Q9().step===6&&Q9().lockDay===S.day&&Q9().startDay===39&&document.querySelector('[data-q9acc]').disabled),'a wrong accusation costs a day');
  await p.evaluate(()=>{S.day++;renderCase()});const cul=await p.evaluate(()=>Q9().who.cul);await p.click(`[data-q9acc="${cul}"]`);
  ok(await p.evaluate(()=>Q9().step===7&&!!PNT().own.b_sinker&&COSTUMES.find(c=>c.k==='detective').own()&&S.boxes.some(b=>b.id==='wscale')&&S.trophies[0].name==='Fair Catch'),'solved with the coat, bobber, scale and plaque');
  await p.evaluate(()=>caseRestart(9));ok(await p.evaluate(()=>Q9().step===2&&Q9().replay&&!!Q9().who),'replay deals a new case');
  ok(!p.errs.length,p.errs.join('; '));await p.context().close()});
await check('after Halloween: keepsakes only for owners, costumes in Settings',async()=>{for(const own of [true,false]){const p=await page(VPS[0][1],save({decor:own?{jacks:1}:{},hw:own?{pk:20,candy:0,wear:'vamp',gg:0,fish:{}}:undefined}));
    await p.evaluate(()=>{openPhone();phShow('shop')});await p.waitForTimeout(300);const t=await p.evaluate(()=>[...document.querySelectorAll('.shop-h h3')].map(h=>h.textContent).join('|'));
    ok(own?t.includes('Halloween keepsakes'):!t.includes('Halloween'),'shop: '+t);
    await p.evaluate(()=>phShow('settings'));const cos=await p.evaluate(()=>document.querySelectorAll('#cosSel option').length);ok(own?cos===3:cos===0,'costume choices '+cos);if(own){await p.selectOption('#cosSel','witch');ok(await p.evaluate(()=>HW().wear==='witch'),'choose a costume from the list')}await p.context().close()}});

await check('visiting: broken friend data is ignored, cabin and yard draw',async()=>{const p=await page(VPS[0][1],save({}));
  await p.evaluate(()=>{const cab={col:{walls:4},own:{armchair:1,wheel:1},wall:[null,null,null],ex:{},wd:[['wheel',500,150],['bogus',1,1]],fp:[['armchair',300,470,1],['evil',1,1]],pat:{w:'fish',f:'zzz'}};
    setVT({id:'x',name:'Pal',c:{cab,trophies:[],coll:[]},ext:{shack:3,decor:{},off:{},boxes:[],trophies:[],yard:yardParse({land:9,it:[['tree_plum',0,300,0,1],['nope',1,1,0]],g:'3=0.4.b,9.2.q'})}});S.sleep={ph:'door',at:'friend',t:0,visit:true}});
  await p.waitForTimeout(1500);await p.evaluate(()=>enterFriend());await p.waitForTimeout(1500);ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('server: likes, Yard of the Week board, random yard, champion flag',async()=>{const p=await page(VPS[0][1],save({}));
  const r=await p.evaluate(async()=>{const R=Math.floor(Math.random()*1e5),A=await api('hello',{name:'Ta'+R}),B=await api('hello',{name:'Tb'+R});const cab=JSON.stringify({cab:{col:{}},ext:{shack:2}});
    for(const P of [A,B])await api('sync',{id:P.id,key:P.key,stats:{},cabin:cab});await api('guest/like',{id:B.id,key:B.key,to:A.id});
    const top=await api('yard/top',{id:B.id,key:B.key}),rnd=await api('yard/random',{id:B.id,key:B.key}),c=await api('cabin',{id:B.id,key:B.key,target:A.id});return {top:top.top.map(x=>x.name+':'+x.n),rnd:rnd.name,champ:c.champ,A:A.name,B:B.name}});
  ok(r.top.includes(r.A+':1'),'board '+r.top);ok(r.rnd&&r.rnd!==r.B,'random '+r.rnd);ok(r.champ===false,'champ flag');await p.context().close()});

const T0=Date.now();await runAll();
await b.close();srv.kill();
console.log(`\n${results.length-fails}/${results.length} passed in ${((Date.now()-T0)/1000).toFixed(0)}s`);process.exit(fails?1:0);
