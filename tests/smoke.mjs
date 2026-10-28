// Lantern Lake smoke tests. Starts the local harness (in-memory database, nothing real is touched),
// plays through the main features in a headless browser on desktop and phone sizes, and prints PASS/FAIL.
// Run from the repo root:  node tests/smoke.mjs      (needs Node 22+ and Playwright, see tests/README.md)
import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PORT=+process.env.PORT||8799,URL0=`http://127.0.0.1:${PORT}/lantern-lake/?season=off`;
const pw=await import(process.env.PW||'playwright');const chromium=pw.chromium||pw.default.chromium;
const srv=spawn(process.execPath,[path.join(HERE,'harness.mjs')],{env:{...process.env,PORT:String(PORT),EXPOSE:'1'},stdio:['ignore','pipe','pipe']});
await new Promise((ok,bad)=>{const t=setTimeout(()=>bad(new Error('harness did not start')),15000);srv.stdout.on('data',d=>{if(String(d).includes('harness on')){clearTimeout(t);ok()}});srv.on('exit',c=>bad(new Error('harness exited '+c)))});

const results=[];let fails=0;
// Checks are queued, then run two at a time (CONC, default 2). Checks that use the harness's shared push log
// (__pushes, __cron, __seen) run one at a time after the rest. Pass words to run only matching checks:
//   node tests/smoke.mjs harvest save      (any check whose name contains "harvest" or "save")
// Checks that play real-time minigames or walk characters around get flaky when the CPU is shared, so they run alone too.
const SOLO=['horseshoes','yard games','open house','case 5','hangouts','pet','mirror match','town','harvest basket','harvest fair'];
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
  await p.waitForFunction(()=>!document.getElementById('scene').classList.contains('ytuck'),null,{timeout:6000});await p.click('#vbView');ok(await p.isVisible('[data-yf="dock"]'),'camera views behind View');await p.click('[data-yf="dock"]');ok(await p.evaluate(()=>!document.getElementById('scene').classList.contains('vpop')),'views close');
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
  ok(await p.evaluate(()=>document.querySelectorAll('.cr-box').length===4&&document.querySelectorAll('.cr-look').length===3),'landing page with four crates and your look');
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
  await p.evaluate(()=>{S.min=200;S.sleep={ph:'awake',t:0,visit:true};openTV()});await p.click('#q5Tune');await p.evaluate(()=>{window.__t=setInterval(()=>{Q5T.f=Q5T.target},30)});await p.waitForTimeout(13000);
  ok(await p.evaluate(()=>Q5().step===7&&!!PNT().own.deadch&&!!PNT().own.b_antenna&&S.trophies[0].name==='Signal Found'),'solved with rewards');
  ok(await p.evaluate(()=>{const L=[];for(let i=0;i<4000;i++){const x=rollPull({wx:'clear'},'lake',600);if(x&&x.tape)L.push(x.tape)}return !L.includes('signal')}),'quest tape never drops randomly');ok(!p.errs.length,p.errs.join('; '));await p.context().close()});

await check('casefile: opens on a shelf of case folders; a folder opens its case and All cases goes back',async()=>{const p=await page(VPS[1][1],save({q:{step:7,everSolved:true,seen:7},q2:{step:3,startDay:30,seen:2}}));
  await p.evaluate(()=>{document.querySelectorAll('.away').forEach(m=>m.hidden=true);openPhone();phShow('case')});
  ok(await p.evaluate(()=>document.querySelectorAll('.cf-folder').length===5&&document.querySelectorAll('.cf-folder.sealed').length===3&&!!document.querySelector('.cf-new')),'folders, sealed cases and a new-lead tag');
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
  await p.evaluate(()=>shoeOpen());for(let k=0;k<4;k++){await p.click('#hsGo');await p.waitForTimeout(1300)}ok(await p.evaluate(()=>SHOE.throws.length===4&&/points/.test(document.getElementById('hsMsg').textContent)),'a round of horseshoes');
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
  await p.click('#hvBody [data-hvg="bluegill"][data-n="1"]');ok(await p.evaluate(()=>S.cooler.bluegill.n===4&&HV().pts===1&&mpS().hvb===1),'give one');
  await p.click('#hvAll');await p.click('#hvAll');ok(await p.evaluate(()=>!Object.keys(S.cooler).some(k=>S.cooler[k].n>0)&&HV().pts>=10),'give all');
  await p.evaluate(()=>mpSync(true));await p.waitForTimeout(800);ok(await p.evaluate(()=>!mpS().hvb&&MPV.hvb&&MPV.hvb.mine>=40),'sent to the lake '+await p.evaluate(()=>JSON.stringify([mpS().hvb,MPV.hvb])));
  const c0=await p.evaluate(()=>S.coins);await p.evaluate(()=>{MPV.hvb={goal:100,total:60,n:1,mine:40,top:[]};hvClaim()});ok(await p.evaluate(c0=>S.coins===c0+25000&&(S.pots.gold|0)>=3&&HV().tiers[0]&&HV().tiers[1]&&!HV().tiers[2],c0),'tier rewards');
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
  ok(await p.evaluate(()=>HITS.some(h=>h.kind==='thv')||TOWN.cam>200),'no fair stall hit area');await p.evaluate(()=>hvFair());ok(await p.isVisible('#hvfBob')&&await p.isVisible('#hvfPie'),'fair panel');
  await p.click('#hvfBob');await p.click('#bobGo');await p.evaluate(()=>{ABOB.a[0].p=Math.PI/2;ABOB.a[0].ps=0});const pos=await p.evaluate(()=>{const a=ABOB.a[0],c=document.getElementById('bobCv').getBoundingClientRect();return [c.left+(180+Math.cos(a.a)*a.r)*c.width/360,c.top+(170+Math.sin(a.a)*a.r*.42)*c.height/300]});
  await p.evaluate(()=>{ABOB.a.forEach((a,i)=>{if(i){a.r=200}a.s=0})});await p.mouse.click(pos[0],pos[1]);ok(await p.evaluate(()=>ABOB.n===1),'grab an apple');await p.evaluate(()=>{ABOB.left=.01});await p.waitForTimeout(300);ok(await p.evaluate(()=>ARC().t>=6&&HV().bob===1),'bobbing tickets');
  await p.click('#bobBack');await p.click('#hvfPie');await p.click('#pieGo');await p.evaluate(()=>{PIE.t=.5/.32});await p.click('#pieOut');
  ok(await p.evaluate(()=>HV().pie&&HV().pie.score>0&&S.cooler.walleye.n===2&&S.pantry.peach===1&&(HV().rib.b+HV().rib.r+HV().rib.w)===1),'pie judged');await p.evaluate(()=>hvFair());ok(!(await p.isVisible('#hvfPie')),'one pie a day');ok(!errs.length,errs.join('; '));await c.close()});

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

const T0=Date.now();await runAll();
await b.close();srv.kill();
console.log(`\n${results.length-fails}/${results.length} passed in ${((Date.now()-T0)/1000).toFixed(0)}s`);process.exit(fails?1:0);
