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
    const top=await api('yard/top',{id:B.id,key:B.key}),rnd=await api('yard/random',{id:B.id,key:B.key}),c=await api('cabin',{id:B.id,key:B.key,target:A.id});return {top:top.top.map(x=>x.name+':'+x.n),rnd:rnd.name,champ:c.champ,A:A.name}});
  ok(r.top.includes(r.A+':1'),'board '+r.top);ok(r.rnd===r.A,'random '+r.rnd);ok(r.champ===false,'champ flag');await p.context().close()});

await b.close();srv.kill();
console.log(`\n${results.length-fails}/${results.length} passed`);process.exit(fails?1:0);
