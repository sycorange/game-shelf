// Game Shelf server: serves the static site and a small JSON API for Lantern Lake friends features.
// Needs a D1 database bound with the variable name DB.
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:H});
const weekKey=()=>String(Math.floor((Date.now()/864e5+3)/7));
const NAME_RE=/^[A-Za-z0-9 _.'-]{2,16}$/;
const LAKE_RE=/^[A-Za-z0-9 _.'!&-]{2,24}$/;
const WORDS=['PERCH','BASS','PIKE','TROUT','CARP','SMELT','EEL','GAR','SHAD','CHUB','DACE','BREAM','ROACH','TENCH','WALLEYE','MUSKIE','BOBBER','LURE','REEL','DOCK','COVE','REED','LILY','LOON','OTTER','HERON','CANOE','PADDLE','LANTERN','MOON'];
const MAX_SAVE=150000,XFER_MS=30*60*1000,XABC='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP_MAX=10,GROUPS_PER_DAY=10,MAX_MEMBERS=50,MAX_LAKES=10,TEXT_DAYS=7,PHOTOS_PER_DAY=5,TEXTS_PER_DAY=400;
let ready=false;
async function init(db){
  if(ready)return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,key TEXT NOT NULL,name TEXT NOT NULL,lname TEXT UNIQUE,stats TEXT,cabin TEXT,wk TEXT,wkn INTEGER DEFAULT 0,seen INTEGER,created INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS catches(id INTEGER PRIMARY KEY AUTOINCREMENT,pid TEXT,name TEXT,fish TEXT,w REAL,v TEXT,water TEXT,ts INTEGER)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS catches_ts ON catches(ts)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS records(fish TEXT PRIMARY KEY,pid TEXT,name TEXT,w REAL,ts INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pbest(pid TEXT,fish TEXT,w REAL,ts INTEGER,PRIMARY KEY(pid,fish))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly(week TEXT,pid TEXT,name TEXT,w REAL,ts INTEGER,PRIMARY KEY(week,pid))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail(id INTEGER PRIMARY KEY AUTOINCREMENT,to_pid TEXT,from_pid TEXT,from_name TEXT,kind TEXT,item TEXT,n INTEGER,msg TEXT,ts INTEGER,claimed INTEGER DEFAULT 0)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS mail_to ON mail(to_pid,claimed)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lakes(code TEXT PRIMARY KEY,name TEXT,owner TEXT,created INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS members(code TEXT,pid TEXT,joined INTEGER,PRIMARY KEY(code,pid))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS members_pid ON members(pid)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS texts(id INTEGER PRIMARY KEY AUTOINCREMENT,a TEXT,b TEXT,body TEXT,photo TEXT,ts INTEGER,seen INTEGER DEFAULT 0)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS texts_b ON texts(b,seen)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS texts_ab ON texts(a,b,id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS texts_ts ON texts(ts)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pinday(day TEXT,pid TEXT,score INTEGER,ts INTEGER,PRIMARY KEY(day,pid))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS pinday_top ON pinday(day,score)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pinwin(day TEXT PRIMARY KEY,pid TEXT,name TEXT,score INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS xfer(code TEXT PRIMARY KEY,data TEXT,exp INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evbest(ev TEXT,pid TEXT,name TEXT,w REAL,ts INTEGER,PRIMARY KEY(ev,pid))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evwin(ev TEXT PRIMARY KEY,ts INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mon(week TEXT PRIMARY KEY,maxhp REAL,dead INTEGER DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monhit(week TEXT,pid TEXT,dmg REAL,PRIMARY KEY(week,pid))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guest(id INTEGER PRIMARY KEY AUTOINCREMENT,to_pid TEXT,from_pid TEXT,from_name TEXT,st INTEGER,note TEXT,day TEXT,ts INTEGER,UNIQUE(to_pid,from_pid,day))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS guest_to ON guest(to_pid,id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS likes(week TEXT,to_pid TEXT,from_pid TEXT,PRIMARY KEY(week,to_pid,from_pid))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS yardwin(week TEXT PRIMARY KEY,pid TEXT,n INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chal(id INTEGER PRIMARY KEY AUTOINCREMENT,a TEXT,an TEXT,b TEXT,bn TEXT,fish TEXT,stake INTEGER,ts INTEGER,acc INTEGER,ends INTEGER,aw REAL DEFAULT 0,bw REAL DEFAULT 0,st TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS chal_a ON chal(a,st)`),db.prepare(`CREATE INDEX IF NOT EXISTS chal_b ON chal(b,st)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bugs(id INTEGER PRIMARY KEY AUTOINCREMENT,pid TEXT,name TEXT,msg TEXT,errs TEXT,ua TEXT,ver TEXT,scr TEXT,ts INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cloud(pid TEXT PRIMARY KEY,data TEXT,ts INTEGER,dev TEXT,kind TEXT,day INTEGER,coins REAL,up INTEGER)`),
  ]);
  try{await db.prepare('ALTER TABLE players ADD COLUMN pub INTEGER DEFAULT 1').run()}catch(e){/* already there */}
  try{await db.prepare('ALTER TABLE players ADD COLUMN pin TEXT').run()}catch(e){/* already there */}
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS gchat(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,owner TEXT,created INTEGER,last INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS gmem(gid INTEGER,pid TEXT,seen INTEGER DEFAULT 0,joined INTEGER,PRIMARY KEY(gid,pid))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS gmem_pid ON gmem(pid)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS gmsg(id INTEGER PRIMARY KEY AUTOINCREMENT,gid INTEGER,a TEXT,body TEXT,photo TEXT,ts INTEGER,sys INTEGER DEFAULT 0)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS gmsg_g ON gmsg(gid,id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS gmsg_a ON gmsg(a,ts)`)]);
  try{await db.prepare('CREATE TABLE IF NOT EXISTS pinfail(k TEXT PRIMARY KEY,n INTEGER,ts INTEGER)').run()}catch(e){}
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS kvc(k TEXT PRIMARY KEY,v TEXT,ts INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS grec(fish TEXT PRIMARY KEY,pid TEXT,w REAL,ts INTEGER)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS evbest_w ON evbest(ev,w)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS weekly_w ON weekly(week,w)`)]);
  // One-time fill of the global record table from everyone's personal bests (a single full read, ever).
  if(!(await db.prepare("SELECT 1 FROM kvc WHERE k='grec:v1'").first())){
    await db.prepare(`INSERT OR REPLACE INTO grec(fish,pid,w,ts) SELECT fish,pid,w,ts FROM (SELECT b.fish,b.pid,b.w,b.ts,ROW_NUMBER() OVER (PARTITION BY b.fish ORDER BY b.w DESC,b.ts ASC) AS rn FROM pbest b JOIN players p ON p.id=b.pid WHERE COALESCE(p.pub,1)=1) WHERE rn=1`).run();
    await db.prepare("INSERT OR REPLACE INTO kvc(k,v,ts) VALUES('grec:v1','1',?)").bind(Date.now()).run()}
  ready=true;
}
const rid=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
const rnd=n=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n};
const xcode=()=>Array.from({length:6},()=>XABC[rnd(XABC.length)]).join('');
// ==LOGIN PIN== a 6-digit PIN lets a player sign in on a new device with their angler name.
// Stored as a salted PBKDF2 hash. Wrong guesses are limited per name and network (5 per 15 minutes)
// and per name per day (30), so a stranger can't lock someone out and can't guess a PIN in any useful time.
const PIN_RE=/^[0-9]{6}$/,PIN_TRIES=5,PIN_WIN=15*60000,PIN_DAY=30;
const hex=a=>[...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function pinHash(pin,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:4000},k,256))}
async function pinMake(pin){const salt=rid(8);return salt+':'+await pinHash(pin,salt)}
async function pinCheck(pin,stored){if(!stored||!stored.includes(':'))return false;const [salt,h]=stored.split(':');const g=await pinHash(pin,salt);let d=0;for(let i=0;i<Math.max(g.length,h.length);i++)d|=(g.charCodeAt(i)||0)^(h.charCodeAt(i)||0);return d===0}
async function pinRoute(req,db,b,now){
  const name=clean(b.name,16).toLowerCase(),pin=String(b.pin||'');if(!name||!PIN_RE.test(pin))return json({error:'bad-login'},400);
  const ip=(req.headers.get('CF-Connecting-IP')||'x').slice(0,64),kN=`n:${name}|${ip}`,kD=`d:${name}|${Math.floor(now/864e5)}`;
  const [fn,fd]=await Promise.all([db.prepare('SELECT n,ts FROM pinfail WHERE k=?').bind(kN).first(),db.prepare('SELECT n FROM pinfail WHERE k=?').bind(kD).first()]);
  const nN=fn&&now-fn.ts<PIN_WIN?fn.n:0;
  if(nN>=PIN_TRIES)return json({error:'locked:'+Math.ceil((fn.ts+PIN_WIN-now)/60000)},429);
  if(fd&&fd.n>=PIN_DAY)return json({error:'locked-day'},429);
  const p=await db.prepare('SELECT id,key,name,pin FROM players WHERE lname=?').bind(name).first();
  if(p&&!p.pin)return json({error:'no-pin'},404);
  if(p&&await pinCheck(pin,p.pin)){await db.prepare('DELETE FROM pinfail WHERE k=?').bind(kN).run();return json({id:p.id,key:p.key,name:p.name})}
  await db.batch([db.prepare('INSERT INTO pinfail(k,n,ts) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN ?-pinfail.ts<? THEN pinfail.n+1 ELSE 1 END,ts=CASE WHEN ?-pinfail.ts<? THEN pinfail.ts ELSE excluded.ts END').bind(kN,now,now,PIN_WIN,now,PIN_WIN),
    db.prepare('INSERT INTO pinfail(k,n,ts) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=pinfail.n+1').bind(kD,now)]);
  if(Math.random()<.05)await db.prepare('DELETE FROM pinfail WHERE ts<?').bind(now-2*864e5).run();
  return json({error:'bad-pin:'+Math.max(0,PIN_TRIES-nN-1)},401)}
const clean=(s,max)=>String(s||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,max);
async function auth(db,b){
  if(!b||typeof b.id!=='string'||typeof b.key!=='string')throw new Error('auth');
  const p=await db.prepare('SELECT * FROM players WHERE id=?').bind(b.id).first();
  if(!p||p.key!==b.key)throw new Error('auth');
  return p;
}
async function body(req){try{const t=await req.text();if(t.length>MAX_SAVE+5000)throw 0;return JSON.parse(t)}catch(e){throw new Error('bad-request')}}
// A "scope" is either the public Everyone lake ('all') or a private lake code the player belongs to.
async function scopeOf(db,me,lake){
  const code=String(lake||'all').toUpperCase();
  if(code==='ALL')return {code:'all',sql:'(SELECT id FROM players WHERE COALESCE(pub,1)=1 OR id=?)',args:[me.id]};
  const m=await db.prepare('SELECT 1 FROM members WHERE code=? AND pid=?').bind(code,me.id).first();
  if(!m)throw new Error('not-member');
  return {code,sql:'(SELECT pid FROM members WHERE code=?)',args:[code]};
}
// Shared results cache. Leaderboards are the same for everyone in a lake, so they're built at most once per
// few minutes and then served to every player from one cached row instead of re-reading whole tables per sync.
async function cached(db,key,ttl,fn){const now=Date.now();
  try{const r=await db.prepare('SELECT v,ts FROM kvc WHERE k=?').bind(key).first();if(r&&now-r.ts<ttl)return JSON.parse(r.v)}catch(e){}
  const v=await fn();try{await db.prepare('INSERT INTO kvc(k,v,ts) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,ts=excluded.ts').bind(key,JSON.stringify(v),now).run()}catch(e){}return v}
const MIN=60000;
async function recordsFor(db,sc){
  if(sc.code==='all')return cached(db,'rec:all',10*MIN,async()=>(await db.prepare('SELECT g.fish,g.pid,p.name,g.w FROM grec g JOIN players p ON p.id=g.pid WHERE COALESCE(p.pub,1)=1').all()).results);
  return cached(db,'rec:'+sc.code,4*MIN,async()=>(await db.prepare(`SELECT fish,pid,name,w FROM (SELECT b.fish,b.pid,p.name,b.w,ROW_NUMBER() OVER (PARTITION BY b.fish ORDER BY b.w DESC,b.ts ASC) AS rn FROM pbest b JOIN players p ON p.id=b.pid WHERE b.pid IN ${sc.sql}) WHERE rn=1`).bind(...sc.args).all()).results)}
const scKey=sc=>sc.code==='all'?'all':sc.code;
const pubScope={code:'all',sql:'(SELECT id FROM players WHERE COALESCE(pub,1)=1)',args:[]};
async function weeklyTop(db,wk,sc){const r=await db.prepare(`SELECT pid,name,w FROM weekly WHERE week=? AND w>0 AND pid IN ${sc.sql} ORDER BY w DESC LIMIT 10`).bind(wk,...sc.args).all();return r.results}
async function myLakes(db,me){
  const r=await db.prepare('SELECT l.code,l.name,l.owner,(SELECT COUNT(*) FROM members m2 WHERE m2.code=l.code) AS n FROM members m JOIN lakes l ON l.code=m.code WHERE m.pid=? ORDER BY m.joined').bind(me.id).all();
  return r.results.map(x=>({code:x.code,name:x.name,n:x.n,own:x.owner===me.id}));
}
async function sharesLake(db,a,b){const r=await db.prepare('SELECT 1 FROM members m1 JOIN members m2 ON m1.code=m2.code WHERE m1.pid=? AND m2.pid=? LIMIT 1').bind(a,b).first();return !!r}

// Who can text whom: anyone on the public Everyone lake, plus people who share a private lake with you.
async function canSee(db,me,pid){
  const t=await db.prepare('SELECT id,name,COALESCE(pub,1) AS pub FROM players WHERE id=?').bind(String(pid||'')).first();
  if(!t||t.id===me.id)return null;
  if(t.pub||(await sharesLake(db,me.id,t.id)))return t;
  return null;
}
function cleanPhoto(p){
  if(!p||typeof p!=='object')return null;
  const w=+p.w;if(typeof p.f!=='string'||!(w>0&&w<5000))return null;
  return JSON.stringify({f:clean(p.f,24),w:+w.toFixed(2),v:clean(p.v,10),wx:clean(p.wx,10),ph:clean(p.ph,6),water:clean(p.water,10),coat:clean(p.coat,10),lk:clean(p.lk,32)});
}
const dayStart=(now,tz)=>{const o=Math.max(-840,Math.min(840,(+tz)|0))*6e4;return Math.floor((now-o)/864e5)*864e5+o};
// Daily pinball challenge. Days run midnight to midnight, US Eastern time.
const PIN_MAX=3000000;
function nyParts(ms){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const o={};for(const p of f)o[p.type]=p.value;return o}
const pinDay=ms=>{const o=nyParts(ms);return `${o.year}-${o.month}-${o.day}`};
const pinLeft=ms=>{const o=nyParts(ms);return (86400-((+o.hour)*3600+(+o.minute)*60+(+o.second)))*1000};
async function pinAward(db,now){const y=pinDay(now-(864e5-pinLeft(now))-60000);
  if(await db.prepare('SELECT 1 FROM pinwin WHERE day=?').bind(y).first())return;
  const top=await db.prepare('SELECT d.pid,p.name,d.score FROM pinday d JOIN players p ON p.id=d.pid WHERE d.day=? ORDER BY d.score DESC,d.ts ASC LIMIT 1').bind(y).first();
  if(!top)return;
  const ins=await db.prepare('INSERT OR IGNORE INTO pinwin(day,pid,name,score) VALUES(?,?,?,?)').bind(y,top.pid,top.name,top.score).run();
  if(ins.meta&&ins.meta.changes===1)await db.prepare('INSERT INTO mail(to_pid,from_pid,from_name,kind,item,n,msg,ts) VALUES(?,?,?,?,?,?,?,?)').bind(top.pid,'pinball','Big Catch Pinball','prize','pinball',1,`Top score yesterday: ${Number(top.score).toLocaleString('en-US')}`,now).run()}
async function pinBoard(db,me,now){await pinAward(db,now);const day=pinDay(now);
  const [top,mine,champ]=await Promise.all([
    db.prepare('SELECT d.pid,p.name,COALESCE(p.pub,1) AS pub,d.score FROM pinday d JOIN players p ON p.id=d.pid WHERE d.day=? ORDER BY d.score DESC,d.ts ASC LIMIT 10').bind(day).all(),
    db.prepare('SELECT score,ts FROM pinday WHERE day=? AND pid=?').bind(day,me.id).first(),
    db.prepare('SELECT pid,name,score,day FROM pinwin ORDER BY day DESC LIMIT 1').first()]);
  let rank=0;if(mine){const r=await db.prepare('SELECT COUNT(*) AS c FROM pinday WHERE day=? AND (score>? OR (score=? AND ts<?))').bind(day,mine.score,mine.score,mine.ts).first();rank=(r.c|0)+1}
  const players=await db.prepare('SELECT COUNT(*) AS c FROM pinday WHERE day=?').bind(day).first();
  return {day,left:pinLeft(now),players:players.c|0,top:top.results.map(x=>({name:x.pid===me.id||x.pub?x.name:'Hidden angler',score:x.score,me:x.pid===me.id})),me:mine?{score:mine.score,rank}:null,champ:champ?{name:champ.name,score:champ.score,day:champ.day,me:champ.pid===me.id}:null}}
// ==EXTRAS== Halloween contest, weekly lake monster, guestbooks and yard likes, 1v1 challenges, bug reports and owner tools.
const HW_EV='hw26',HW_END=Date.UTC(2026,10,2,5,0,0); // midnight Eastern, November 2 2026
const HW_PRIZE=[100000,50000,25000];
const MON_NAMES=['Old Gnasher','Big Bertha','The Reed Lake Ripper','Moss-Back Mike','Queen Muskellunge','The Midnight Snapper','Lord Whiskers','Sir Chomps-a-Lot'];
const monName=wk=>MON_NAMES[(+wk)%MON_NAMES.length];
const MON_REWARD=20000,YARD_REWARD=25000,CHAL_MS=24*36e5,CHAL_STAKES=[100,500,1000,5000,10000];
const dayKey=now=>new Date(now).toISOString().slice(0,10);
// Owner tools belong to the angler named OWNER_NAME (not case sensitive).
const OWNER_NAME='sycorange';
async function ownerId(db){const r=await db.prepare('SELECT id FROM players WHERE lname=?').bind(OWNER_NAME).first();return r?r.id:null}
const sysMail=(db,to,kind,item,msg,now)=>db.prepare('INSERT INTO mail(to_pid,from_pid,from_name,kind,item,n,msg,ts) VALUES(?,?,?,?,?,?,?,?)').bind(to,'lake','Lantern Lake',kind,item,1,msg,now);
async function evPart(db,me,b,now){
  if(b.ev&&b.ev.id===HW_EV&&now<HW_END){const w=+b.ev.w;if(w>0&&w<500)await db.prepare('INSERT INTO evbest(ev,pid,name,w,ts) VALUES(?,?,?,?,?) ON CONFLICT(ev,pid) DO UPDATE SET w=excluded.w,name=excluded.name,ts=excluded.ts WHERE excluded.w>evbest.w').bind(HW_EV,me.id,me.name,w,now).run()}
  if(now>=HW_END){const ins=await db.prepare('INSERT OR IGNORE INTO evwin(ev,ts) VALUES(?,?)').bind(HW_EV,now).run();
    if(ins.meta&&ins.meta.changes===1){const top=await db.prepare('SELECT pid,w FROM evbest WHERE ev=? ORDER BY w DESC,ts ASC LIMIT 3').bind(HW_EV).all();
      const st=top.results.map((x,i)=>sysMail(db,x.pid,'evprize',`${i+1}|${HW_PRIZE[i]}`,`Ghost Gar contest: you placed #${i+1} with ${(+x.w).toFixed(2)} lb`,now));if(st.length)await db.batch(st)}}
  if(now>HW_END+14*864e5)return null;
  const [top,mine]=await Promise.all([cached(db,'ev:'+HW_EV,2*MIN,async()=>({results:(await db.prepare('SELECT e.pid,e.name,e.w,COALESCE(p.pub,1) AS pub FROM evbest e LEFT JOIN players p ON p.id=e.pid WHERE e.ev=? ORDER BY e.w DESC,e.ts ASC LIMIT 10').bind(HW_EV).all()).results})),
    db.prepare('SELECT w,ts FROM evbest WHERE ev=? AND pid=?').bind(HW_EV,me.id).first()]);
  let rank=0;if(mine){const r=await db.prepare('SELECT COUNT(*) AS c FROM evbest WHERE ev=? AND (w>? OR (w=? AND ts<?))').bind(HW_EV,mine.w,mine.w,mine.ts).first();rank=(r.c|0)+1}
  return {id:HW_EV,ended:now>=HW_END,top:top.results.map(x=>({name:x.pid===me.id||x.pub?x.name:'Hidden angler',w:x.w,me:x.pid===me.id})),me:mine?{w:mine.w,rank}:null}}
async function monPart(db,me,b,now,wk){
  let m=await db.prepare('SELECT maxhp,dead FROM mon WHERE week=?').bind(wk).first();
  if(!m){const n=await db.prepare('SELECT COUNT(*) AS c FROM players WHERE seen>?').bind(now-7*864e5).first();const maxhp=Math.max(3000,2500*(n.c|0));
    await db.prepare('INSERT OR IGNORE INTO mon(week,maxhp,dead) VALUES(?,?,0)').bind(wk,maxhp).run();m=await db.prepare('SELECT maxhp,dead FROM mon WHERE week=?').bind(wk).first()}
  const dmg=Math.min(5000,Math.max(0,+b.mdmg||0));
  if(dmg>0&&!m.dead)await db.prepare('INSERT INTO monhit(week,pid,dmg) VALUES(?,?,?) ON CONFLICT(week,pid) DO UPDATE SET dmg=monhit.dmg+excluded.dmg').bind(wk,me.id,dmg).run();
  const [tot,mine]=await Promise.all([cached(db,'mon:'+wk,MIN,async()=>await db.prepare('SELECT COALESCE(SUM(dmg),0) AS s,COUNT(*) AS n FROM monhit WHERE week=?').bind(wk).first()),db.prepare('SELECT dmg FROM monhit WHERE week=? AND pid=?').bind(wk,me.id).first()]);
  let dead=m.dead;
  if(!dead&&tot.s>=m.maxhp){const up=await db.prepare('UPDATE mon SET dead=? WHERE week=? AND dead=0').bind(now,wk).run();
    if(up.meta&&up.meta.changes===1){dead=now;const who=await db.prepare('SELECT pid FROM monhit WHERE week=? AND dmg>0').bind(wk).all();const st=who.results.map(x=>sysMail(db,x.pid,'monster',`${MON_REWARD}|${monName(wk)}`,`${monName(wk)} is beaten! Your share of the bounty.`,now));if(st.length)await db.batch(st)}}
  return {name:monName(wk),max:m.maxhp,hp:Math.max(0,Math.round(m.maxhp-tot.s)),mine:Math.round(mine?mine.dmg:0),n:tot.n|0,dead:!!dead}}
async function yardPart(db,me,b,now,wk){const lw=String(+wk-1);
  if(!(await db.prepare('SELECT 1 FROM yardwin WHERE week=?').bind(lw).first())){const top=await db.prepare('SELECT to_pid,COUNT(*) AS n FROM likes WHERE week=? GROUP BY to_pid ORDER BY n DESC LIMIT 1').bind(lw).first();
    if(top){const ins=await db.prepare('INSERT OR IGNORE INTO yardwin(week,pid,n) VALUES(?,?,?)').bind(lw,top.to_pid,top.n).run();if(ins.meta&&ins.meta.changes===1)await sysMail(db,top.to_pid,'yard',`${YARD_REWARD}|${lw}`,`Your yard got the most likes last week (${top.n})!`,now).run()}}
  const [nw,likes]=await Promise.all([db.prepare('SELECT COUNT(*) AS c,MAX(id) AS last FROM guest WHERE to_pid=? AND id>?').bind(me.id,Math.max(0,+b.gbSeen||0)).first(),db.prepare('SELECT COUNT(*) AS c FROM likes WHERE week=? AND to_pid=?').bind(wk,me.id).first()]);
  let from='';if(nw.c){const r=await db.prepare('SELECT from_name FROM guest WHERE to_pid=? ORDER BY id DESC LIMIT 1').bind(me.id).first();from=r?r.from_name:''}
  return {n:nw.c|0,last:nw.last||0,from,likes:likes.c|0}}
async function chalPart(db,me,b,now){
  const rows=(await db.prepare("SELECT * FROM chal WHERE (a=? OR b=?) AND (st IN ('pend','live') OR ts>?) ORDER BY id DESC LIMIT 30").bind(me.id,me.id,now-4*864e5).all()).results;const st=[];
  const W=b.chw&&typeof b.chw==='object'?b.chw:{};
  for(const c of rows){
    if(c.st==='pend'&&c.ts<now-CHAL_MS){const up=await db.prepare("UPDATE chal SET st='exp' WHERE id=? AND st='pend'").bind(c.id).run();if(up.meta&&up.meta.changes===1)st.push(sysMail(db,c.a,'chal',`refund|${c.stake}|${c.bn}|${c.fish}`,`${c.bn} didn’t answer your challenge in time`,now));c.st='exp';continue}
    if(c.st==='live'){const w=+W[c.id];if(w>0&&w<5000&&now<=c.ends){const col=c.a===me.id?'aw':'bw';if(w>c[col]){st.push(db.prepare(`UPDATE chal SET ${col}=? WHERE id=? AND ${col}<?`).bind(w,c.id,w));c[col]=w}}
      if(c.ends<now){const up=await db.prepare("UPDATE chal SET st='done' WHERE id=? AND st='live'").bind(c.id).run();
        if(up.meta&&up.meta.changes===1){if(c.aw>c.bw)st.push(sysMail(db,c.a,'chal',`win|${c.stake*2}|${c.bn}|${c.fish}`,`You beat ${c.bn}: ${(+c.aw).toFixed(2)} lb vs ${(+c.bw).toFixed(2)} lb`,now));
          else if(c.bw>c.aw)st.push(sysMail(db,c.b,'chal',`win|${c.stake*2}|${c.an}|${c.fish}`,`You beat ${c.an}: ${(+c.bw).toFixed(2)} lb vs ${(+c.aw).toFixed(2)} lb`,now));
          else{st.push(sysMail(db,c.a,'chal',`tie|${c.stake}|${c.bn}|${c.fish}`,'Your challenge ended in a tie',now));st.push(sysMail(db,c.b,'chal',`tie|${c.stake}|${c.an}|${c.fish}`,'Your challenge ended in a tie',now))}}c.st='done'}}}
  if(st.length)await db.batch(st);
  return rows.map(c=>{const amA=c.a===me.id;return {id:c.id,mine:amA?'a':'b',other:amA?c.bn:c.an,fish:c.fish,stake:c.stake,st:c.st,ts:c.ts,ends:c.ends||0,me:amA?c.aw:c.bw,them:amA?c.bw:c.aw}})}
async function syncExtras(db,me,b,now,wk){const out={};
  try{out.ev=await evPart(db,me,b,now)}catch(e){}
  try{out.mon=await monPart(db,me,b,now,wk)}catch(e){}
  try{out.gb=await yardPart(db,me,b,now,wk)}catch(e){}
  try{out.chal=await chalPart(db,me,b,now)}catch(e){}
  try{out.owner=(await ownerId(db))===me.id}catch(e){}
  return out}
async function extraRoutes(p,db,me,b,now){
  if(p==='guest/sign'){const to=String(b.to||'');if(!to||to===me.id)return json({error:'bad-target'},400);
    const t=await db.prepare('SELECT id FROM players WHERE id=?').bind(to).first();if(!t)return json({error:'no-player'},404);
    const r=await db.prepare('INSERT OR IGNORE INTO guest(to_pid,from_pid,from_name,st,note,day,ts) VALUES(?,?,?,?,?,?,?)').bind(to,me.id,me.name,Math.max(0,Math.min(11,b.st|0)),clean(b.note,80),dayKey(now),now).run();
    if(!(r.meta&&r.meta.changes===1))return json({error:'already-signed'},409);
    if(Math.random()<.05)await db.prepare('DELETE FROM guest WHERE ts<?').bind(now-60*864e5).run();return json({ok:true})}
  if(p==='guest/like'){const to=String(b.to||'');if(!to||to===me.id)return json({error:'bad-target'},400);const wk=weekKey();
    await db.prepare('INSERT OR IGNORE INTO likes(week,to_pid,from_pid) VALUES(?,?,?)').bind(wk,to,me.id).run();
    const n=await db.prepare('SELECT COUNT(*) AS c FROM likes WHERE week=? AND to_pid=?').bind(wk,to).first();return json({ok:true,n:n.c|0})}
  if(p==='guest/list'){const wk=weekKey(),lw=String(+wk-1);
    const [rows,likes,win]=await Promise.all([db.prepare('SELECT id,from_pid,from_name,st,note,ts FROM guest WHERE to_pid=? ORDER BY id DESC LIMIT 40').bind(me.id).all(),db.prepare('SELECT COUNT(*) AS c FROM likes WHERE week=? AND to_pid=?').bind(wk,me.id).first(),
      db.prepare('SELECT y.pid,y.n,p.name FROM yardwin y LEFT JOIN players p ON p.id=y.pid WHERE y.week=?').bind(lw).first()]);
    let liked=false;if(b.to){liked=!!(await db.prepare('SELECT 1 FROM likes WHERE week=? AND to_pid=? AND from_pid=?').bind(wk,String(b.to),me.id).first())}
    return json({entries:rows.results,likes:likes.c|0,best:win?{name:win.name,n:win.n,me:win.pid===me.id}:null,liked})}
  if(p==='chal/new'){const to=String(b.to||''),stake=b.stake|0,fish=clean(b.fish,24);if(!to||to===me.id||!CHAL_STAKES.includes(stake)||!fish)return json({error:'bad-challenge'},400);
    const t=await db.prepare('SELECT id,name FROM players WHERE id=?').bind(to).first();if(!t)return json({error:'no-player'},404);
    const open=await db.prepare("SELECT COUNT(*) AS c FROM chal WHERE (a=? OR b=?) AND st IN ('pend','live')").bind(me.id,me.id).first();if((open.c|0)>=6)return json({error:'too-many'},429);
    const r=await db.prepare("INSERT INTO chal(a,an,b,bn,fish,stake,ts,acc,ends,aw,bw,st) VALUES(?,?,?,?,?,?,?,0,0,0,0,'pend')").bind(me.id,me.name,t.id,t.name,fish,stake,now).run();
    return json({ok:true,id:r.meta&&r.meta.last_row_id})}
  if(p==='chal/answer'){const c=await db.prepare("SELECT * FROM chal WHERE id=? AND b=? AND st='pend'").bind(b.cid|0,me.id).first();if(!c||c.ts<now-CHAL_MS)return json({error:'no-challenge'},404);
    if(b.accept){const up=await db.prepare("UPDATE chal SET st='live',acc=?,ends=? WHERE id=? AND st='pend'").bind(now,now+CHAL_MS,c.id).run();if(!(up.meta&&up.meta.changes===1))return json({error:'no-challenge'},404);return json({ok:true,stake:c.stake,ends:now+CHAL_MS})}
    const up=await db.prepare("UPDATE chal SET st='decl' WHERE id=? AND st='pend'").bind(c.id).run();if(up.meta&&up.meta.changes===1)await sysMail(db,c.a,'chal',`refund|${c.stake}|${c.bn}|${c.fish}`,`${c.bn} passed on your challenge`,now).run();return json({ok:true})}
  const own=p.startsWith('owner/')?(await ownerId(db))===me.id:false;
  if(p.startsWith('owner/')&&!own)return json({error:'not-owner'},403);
  if(p==='owner/stats'){const d=now-864e5,q=(sql,...a)=>db.prepare(sql).bind(...a).first();
    const r=await Promise.all([q('SELECT COUNT(*) AS c FROM players'),q('SELECT COUNT(*) AS c FROM players WHERE seen>?',d),q('SELECT COUNT(*) AS c FROM players WHERE seen>?',now-7*864e5),q('SELECT COUNT(*) AS c FROM catches WHERE ts>?',d),q('SELECT COUNT(*) AS c FROM texts WHERE ts>?',d),q('SELECT COUNT(*) AS c FROM cloud WHERE up>?',d),q('SELECT COUNT(*) AS c FROM bugs'),q('SELECT COUNT(*) AS c FROM guest WHERE ts>?',d),q("SELECT COUNT(*) AS c FROM chal WHERE st IN ('pend','live')"),q('SELECT COUNT(*) AS c FROM mail WHERE ts>?',d)]);
    const [players,a24,a7,c24,t24,cl24,bugs,g24,chal,m24]=r.map(x=>x?x.c|0:0);return json({players,a24,a7,c24,t24,cl24,bugs,g24,chal,m24})}
  if(p==='owner/bugs'){const r=await db.prepare('SELECT id,name,msg,errs,ua,ver,scr,ts FROM bugs ORDER BY id DESC LIMIT 60').all();return json({bugs:r.results})}
  if(p==='owner/pinreset'){const n=clean(b.name,16).toLowerCase();const r=await db.prepare('UPDATE players SET pin=NULL WHERE lname=?').bind(n).run();
    await db.prepare("DELETE FROM pinfail WHERE k LIKE ?").bind('%:'+n+'|%').run();return json({ok:true,found:!!(r.meta&&r.meta.changes)})}
  if(p==='owner/bugdel'){await db.prepare('DELETE FROM bugs WHERE id=?').bind(b.bid|0).run();return json({ok:true})}
  if(p==='owner/backup'){const [pl,cl]=await Promise.all([db.prepare('SELECT id,name,created,seen,COALESCE(pub,1) AS pub,stats FROM players ORDER BY created').all(),db.prepare('SELECT c.pid,p.name,c.ts,c.day,c.coins,c.data FROM cloud c LEFT JOIN players p ON p.id=c.pid').all()]);
    return json({made:now,players:pl.results,cloud:cl.results})}
  return null}
async function bugRoute(db,b,now){const n=await db.prepare('SELECT COUNT(*) AS c FROM bugs WHERE ts>?').bind(now-36e5).first();if((n.c|0)>40)return json({error:'busy'},429);
  let name='',pid='';if(typeof b.id==='string'&&typeof b.key==='string'){const p=await db.prepare('SELECT id,key,name FROM players WHERE id=?').bind(b.id).first();if(p&&p.key===b.key){pid=p.id;name=p.name}}
  await db.prepare('INSERT INTO bugs(pid,name,msg,errs,ua,ver,scr,ts) VALUES(?,?,?,?,?,?,?,?)').bind(pid,name||'Anonymous',clean(b.msg,1500),String(b.errs||'').slice(0,4000),clean(b.ua,300),clean(b.ver,20),clean(b.scr,40),now).run();return json({ok:true})}


// ==LIVE LAKE== one Durable Object room per lake scope and water. Players connect with a WebSocket while they fish;
// the room relays boats, catches and emotes, and now and then a raid monster surfaces for everyone in the room.
const LIVE_WATERS=['pond','lake','river','deep','bay'];
const RAID_PER={pond:60,lake:150,river:250,deep:500,bay:900};
const RAID_NAMES=['The Lake Leviathan','Old Ironjaw','Mother Muskie','The Bottom Dweller','Captain Whiskers','The Thing in the Reeds'];
const RAID_MS=180000,RAID_GAP=25*60000;
async function liveRoute(req,env,url,db){
  if((req.headers.get('Upgrade')||'').toLowerCase()!=='websocket')return json({error:'expected-websocket'},426);
  if(!env.LAKE)return json({error:'no-live'},503);
  const q=url.searchParams,water=q.get('water');if(!LIVE_WATERS.includes(water))return json({error:'bad-water'},400);
  const me=await auth(db,{id:q.get('id')||'',key:q.get('key')||''});
  let sc;try{sc=await scopeOf(db,me,q.get('lake'))}catch(e){sc=await scopeOf(db,me,'all')}
  const room=`${sc.code}:${water}`,stub=env.LAKE.get(env.LAKE.idFromName(room));
  const fw=new URL('https://lake/ws');fw.searchParams.set('pid',me.id);fw.searchParams.set('name',me.name);fw.searchParams.set('water',water);
  fw.searchParams.set('boat',String(Math.max(0,Math.min(7,q.get('boat')|0))));fw.searchParams.set('wear',clean(q.get('wear'),8));fw.searchParams.set('cid',clean(q.get('cid'),12));fw.searchParams.set('g',q.get('g')==='f'?'f':'m');fw.searchParams.set('pt',clean(q.get('pt'),12));fw.searchParams.set('rd',clean(q.get('rd'),14));fw.searchParams.set('bb',clean(q.get('bb'),14));fw.searchParams.set('room',room);
  return stub.fetch(new Request(fw.toString(),{headers:req.headers}));
}
export class LakeRoom{
  constructor(ctx,env){this.ctx=ctx;this.env=env;try{ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))}catch(e){}}
  peers(except){return this.ctx.getWebSockets().filter(w=>w!==except).map(w=>{try{return w.deserializeAttachment()}catch(e){return null}}).filter(Boolean)}
  bcast(o,except){const m=JSON.stringify(o);for(const w of this.ctx.getWebSockets())if(w!==except){try{w.send(m)}catch(e){}}}
  async fetch(req){const u=new URL(req.url),q=u.searchParams;
    // a call for help from a raid in another spot on the same lake: pass it to everyone fishing here
    if(u.pathname==='/help'){let o={};try{o=await req.json()}catch(e){}const n=this.ctx.getWebSockets().length;if(n)this.bcast({t:'help',...o});return new Response(JSON.stringify({n}))}
    const me={pid:q.get('pid'),name:q.get('name'),boat:q.get('boat')|0,wear:q.get('wear')||'',g:q.get('g')==='f'?'f':'m',pt:String(q.get('pt')||'').slice(0,12),rd:String(q.get('rd')||'').replace(/[^a-z0-9_]/g,'').slice(0,14),bb:String(q.get('bb')||'').replace(/[^a-z0-9_]/g,'').slice(0,14),cid:q.get('cid')||Math.random().toString(36).slice(2,8),at:Date.now()};
    for(const w of this.ctx.getWebSockets()){let a=null;try{a=w.deserializeAttachment()}catch(e){}if(a&&a.pid===me.pid){try{w.close(4000,'replaced')}catch(e){}}}
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment(me);
    const water=q.get('water');if(water)await this.ctx.storage.put('water',water);const room=q.get('room');if(room)await this.ctx.storage.put('room',room);
    server.send(JSON.stringify({t:'hello',me:me.cid,peers:this.peers(server).filter(p=>p.pid!==me.pid),raid:await this.raidView()}));
    this.bcast({t:'join',p:me},server);await this.maybeRaid();
    return new Response(null,{status:101,webSocket:client})}
  async webSocketMessage(ws,msg){if(typeof msg!=='string'||msg.length>600)return;if(msg==='ping'){try{ws.send('pong')}catch(e){}return}
    let o;try{o=JSON.parse(msg)}catch(e){return}let a;try{a=ws.deserializeAttachment()}catch(e){}if(!a)return;
    if(o.t==='st'){a.boat=Math.max(0,Math.min(7,o.boat|0));a.wear=String(o.wear||'').slice(0,8);if(o.g)a.g=o.g==='f'?'f':'m';a.pt=String(o.pt||'').replace(/[^a-z0-9]/g,'').slice(0,12);a.rd=String(o.rd||'').replace(/[^a-z0-9_]/g,'').slice(0,14);a.bb=String(o.bb||'').replace(/[^a-z0-9_]/g,'').slice(0,14);ws.serializeAttachment(a);this.bcast({t:'st',pid:a.pid,cid:a.cid,boat:a.boat,wear:a.wear,g:a.g||'m',pt:a.pt,rd:a.rd,bb:a.bb},ws)}
    else if(o.t==='catch'){const w=+o.w;if(!(w>0&&w<5000)||typeof o.f!=='string')return;const c={t:'catch',pid:a.pid,cid:a.cid,f:o.f.slice(0,24),w:+w.toFixed(2),v:String(o.v||'').slice(0,8),r:String(o.r||'').slice(0,1)};
      const R=await this.ctx.storage.get('raid');if(R&&!R.done&&Date.now()<R.ends){R.hp=Math.max(0,R.hp-w);R.hits[a.pid]=(R.hits[a.pid]||0)+w;R.names[a.pid]=a.name;c.raid={hp:Math.round(R.hp),max:R.max};
        if(R.hp<=0){R.done=true;await this.ctx.storage.put('raid',R);this.bcast(c);await this.raidEnd(true);return}await this.ctx.storage.put('raid',R)}
      this.bcast(c)}
    else if(o.t==='help'){await this.callHelp(ws,a)}
    else if(o.t==='emo'){const e=o.e|0;if(e>=0&&e<12)this.bcast({t:'emo',pid:a.pid,cid:a.cid,e},ws)}}
  // One call per player per raid, and at most one every 20 seconds per room, sent to the other spots on this lake.
  async callHelp(ws,a){const R=await this.ctx.storage.get('raid'),now=Date.now();if(!R||R.done||now>=R.ends||a.help===R.ends)return;
    const last=(await this.ctx.storage.get('helpAt'))||0;if(now-last<20000){try{ws.send(JSON.stringify({t:'helpsent',n:-1}))}catch(e){}return}
    a.help=R.ends;ws.serializeAttachment(a);await this.ctx.storage.put('helpAt',now);
    const room=(await this.ctx.storage.get('room'))||'',water=(await this.ctx.storage.get('water'))||'lake',scope=room.slice(0,room.lastIndexOf(':'));if(!scope)return;
    const msg={from:a.name,pid:a.pid,water,name:R.name,hp:Math.round(R.hp),max:R.max,ends:R.ends};let n=0;
    await Promise.all(LIVE_WATERS.filter(w=>w!==water).map(async w=>{try{const st=this.env.LAKE.get(this.env.LAKE.idFromName(`${scope}:${w}`));const r=await st.fetch(new Request('https://lake/help',{method:'POST',body:JSON.stringify(msg)}));const j=await r.json();n+=j.n|0}catch(e){}}));
    try{ws.send(JSON.stringify({t:'helpsent',n}))}catch(e){}this.bcast({t:'helpcalled',from:a.name},ws)}
  async webSocketClose(ws){this.left(ws)}
  async webSocketError(ws){this.left(ws)}
  left(ws){let a=null;try{a=ws.deserializeAttachment()}catch(e){}try{ws.close(1000,'bye')}catch(e){}if(a)this.bcast({t:'leave',pid:a.pid,cid:a.cid},ws)}
  async raidView(){const R=await this.ctx.storage.get('raid');if(!R||R.done||Date.now()>=R.ends)return null;return {name:R.name,hp:Math.round(R.hp),max:R.max,ends:R.ends}}
  async maybeRaid(){const n=this.peers().length,now=Date.now();if(n<2)return;const R=await this.ctx.storage.get('raid');if(R&&!R.done&&now<R.ends)return;
    const next=(await this.ctx.storage.get('raidNext'))||0,al=await this.ctx.storage.getAlarm();if(al)return;
    await this.ctx.storage.setAlarm(Math.max(now,next)+(3+Math.random()*5)*60000)}
  async alarm(){const now=Date.now(),R=await this.ctx.storage.get('raid');
    if(R&&!R.done){if(now>=R.ends-500){R.done=true;await this.ctx.storage.put('raid',R);await this.raidEnd(false)}else await this.ctx.storage.setAlarm(R.ends);return}
    const ps=this.peers();if(ps.length<2)return;const water=(await this.ctx.storage.get('water'))||'lake';
    const max=Math.round((RAID_PER[water]||150)*ps.length);const raid={name:RAID_NAMES[Math.floor(Math.random()*RAID_NAMES.length)],hp:max,max,ends:now+RAID_MS,hits:{},names:{},done:false};
    await this.ctx.storage.put('raid',raid);this.bcast({t:'raid',raid:{name:raid.name,hp:max,max,ends:raid.ends}});await this.ctx.storage.setAlarm(raid.ends)}
  async raidEnd(win){const R=await this.ctx.storage.get('raid');await this.ctx.storage.put('raidNext',Date.now()+RAID_GAP);try{await this.ctx.storage.deleteAlarm()}catch(e){}
    const top=Object.entries(R.hits).sort((x,y)=>y[1]-x[1]).slice(0,5).map(([pid,w])=>({name:R.names[pid]||'?',w:Math.round(w)}));
    this.bcast({t:'raidend',win,name:R.name,hits:Object.keys(R.hits),top,reward:win?Math.round(R.max*20):0});await this.maybeRaid()}
}

async function route(req,env,url){
  const db=env.DB,p=url.pathname.replace(/^\/api\//,''),now=Date.now();
  if(p==='ping')return json({ok:true,week:weekKey(),v:7,live:!!env.LAKE});
  if(p==='live')return liveRoute(req,env,url,db);
  // Radio app: look up a Spotify track's name (public oEmbed, no key), cached for 30 days.
  if(p==='spname'){const id=String(url.searchParams.get('id')||''),k=String(url.searchParams.get('k')||'track');
    if(!/^[A-Za-z0-9]{22}$/.test(id)||!['track','episode'].includes(k))return json({error:'bad-id'},400);
    const r=await cached(db,'sp:'+k+':'+id,30*864e5,async()=>{try{const x=await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${k}/${id}`,{headers:{'user-agent':'LanternLake/1.0'}});if(!x.ok)return {title:''};const j=await x.json();return {title:String(j.title||'').slice(0,120)}}catch(e){return {title:''}}});
    return json(r)}
  if(req.method!=='POST')return json({error:'not-found'},404);
  const b=await body(req);
  if(p==='hello'){
    const name=clean(b.name,16);
    if(!NAME_RE.test(name))return json({error:'bad-name'},400);
    const taken=await db.prepare('SELECT id FROM players WHERE lname=?').bind(name.toLowerCase()).first();
    if(taken)return json({error:'name-taken'},409);
    const id=rid(12),key=rid(16),pub=b.pub===false?0:1;
    await db.prepare('INSERT INTO players(id,key,name,lname,seen,created,pub) VALUES(?,?,?,?,?,?,?)').bind(id,key,name,name.toLowerCase(),now,now,pub).run();
    return json({id,key,name});
  }
  // Save transfer: a short one-time code that holds a save for 30 minutes. No account needed.
  if(p==='xfer/put'){
    const d=String(b.data||'');if(d.length<20||d.length>MAX_SAVE)return json({error:'bad-save'},400);
    await db.prepare('DELETE FROM xfer WHERE exp<?').bind(now).run();
    let code=xcode();for(let i=0;i<5&&await db.prepare('SELECT 1 FROM xfer WHERE code=?').bind(code).first();i++)code=xcode();
    await db.prepare('INSERT OR REPLACE INTO xfer(code,data,exp) VALUES(?,?,?)').bind(code,d,now+XFER_MS).run();
    return json({code,exp:now+XFER_MS});
  }
  if(p==='xfer/get'){
    const code=String(b.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6)return json({error:'bad-code'},400);
    const r=await db.prepare('SELECT data,exp FROM xfer WHERE code=?').bind(code).first();
    if(!r||r.exp<now)return json({error:'no-code'},404);
    await db.prepare('DELETE FROM xfer WHERE code=?').bind(code).run();
    return json({data:r.data});
  }
  if(p==='bug')return bugRoute(db,b,now);
  if(p==='login')return pinRoute(req,db,b,now);
  const me=await auth(db,b);
  // Being signed in on a device proves it's you, so setting a new PIN never needs the old one.
  if(p==='pin/set'){const pin=String(b.pin||'');if(!PIN_RE.test(pin))return json({error:'bad-pin-format'},400);
    if(/^(\d)\1{5}$/.test(pin)||'0123456789'.includes(pin)||'9876543210'.includes(pin))return json({error:'pin-too-easy'},400);
    await db.prepare('UPDATE players SET pin=? WHERE id=?').bind(await pinMake(pin),me.id).run();return json({ok:true})}
  if(p==='pin/clear'){await db.prepare('UPDATE players SET pin=NULL WHERE id=?').bind(me.id).run();return json({ok:true})}
  {const xr=await extraRoutes(p,db,me,b,now);if(xr)return xr}
  // Cloud save: the latest copy of this player's game, so their devices stay in sync.
  if(p==='cloud/put'){
    const d=String(b.data||'');if(d.length<20||d.length>MAX_SAVE)return json({error:'bad-save'},400);
    const ts=Math.min(now+60000,Number(b.ts)||now);
    // Safety net: never let a device overwrite a newer save from another device it hasn't seen yet.
    // 'base' is the cloud version (server 'up' time) this device last uploaded or loaded.
    if(b.base!=null){const cur=await db.prepare('SELECT ts,dev,kind,day,coins,up FROM cloud WHERE pid=?').bind(me.id).first();
      if(cur&&cur.dev!==clean(b.dev,16)&&(Number(cur.up)||0)>(Number(b.base)||0))return json({error:'stale',ts:cur.ts,dev:cur.dev,kind:cur.kind,day:cur.day,coins:cur.coins,up:cur.up},409)}
    await db.prepare('INSERT INTO cloud(pid,data,ts,dev,kind,day,coins,up) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET data=excluded.data,ts=excluded.ts,dev=excluded.dev,kind=excluded.kind,day=excluded.day,coins=excluded.coins,up=excluded.up')
      .bind(me.id,d,ts,clean(b.dev,16),clean(b.kind,12),Number(b.day)|0,Number(b.coins)||0,now).run();
    return json({ok:true,ts,up:now});
  }
  if(p==='cloud/get'){
    const r=await db.prepare('SELECT data,ts,dev,kind,day,coins,up FROM cloud WHERE pid=?').bind(me.id).first();
    if(!r)return json({none:true});
    if(b.meta)return json({ts:r.ts,dev:r.dev,kind:r.kind,day:r.day,coins:r.coins,up:r.up});
    return json(r);
  }
  if(p==='rename'){
    const name=clean(b.name,16);
    if(!NAME_RE.test(name))return json({error:'bad-name'},400);
    const taken=await db.prepare('SELECT id FROM players WHERE lname=? AND id<>?').bind(name.toLowerCase(),me.id).first();
    if(taken)return json({error:'name-taken'},409);
    await db.batch([db.prepare('UPDATE players SET name=?,lname=? WHERE id=?').bind(name,name.toLowerCase(),me.id),
      db.prepare('UPDATE weekly SET name=? WHERE pid=?').bind(name,me.id)]);
    return json({ok:true,name});
  }
  if(p==='privacy'){await db.prepare('UPDATE players SET pub=? WHERE id=?').bind(b.pub?1:0,me.id).run();return json({ok:true,pub:!!b.pub})}
  if(p==='lake/create'){
    const name=clean(b.name,24);if(!LAKE_RE.test(name))return json({error:'bad-lake-name'},400);
    const mine=await db.prepare('SELECT COUNT(*) AS c FROM members WHERE pid=?').bind(me.id).first();if((mine.c|0)>=MAX_LAKES)return json({error:'too-many-lakes'},400);
    let code='';for(let i=0;i<20;i++){const c=WORDS[rnd(WORDS.length)]+'-'+(10+rnd(90));if(!(await db.prepare('SELECT 1 FROM lakes WHERE code=?').bind(c).first())){code=c;break}}
    if(!code)return json({error:'try-again'},500);
    await db.batch([db.prepare('INSERT INTO lakes(code,name,owner,created) VALUES(?,?,?,?)').bind(code,name,me.id,now),db.prepare('INSERT INTO members(code,pid,joined) VALUES(?,?,?)').bind(code,me.id,now)]);
    return json({ok:true,code,name,lakes:await myLakes(db,me)});
  }
  if(p==='lake/join'){
    const code=clean(b.code,20).toUpperCase().replace(/\s+/g,'');
    const lake=await db.prepare('SELECT code,name FROM lakes WHERE code=?').bind(code).first();if(!lake)return json({error:'no-lake'},404);
    const already=await db.prepare('SELECT 1 FROM members WHERE code=? AND pid=?').bind(code,me.id).first();
    if(!already){
      const mine=await db.prepare('SELECT COUNT(*) AS c FROM members WHERE pid=?').bind(me.id).first();if((mine.c|0)>=MAX_LAKES)return json({error:'too-many-lakes'},400);
      const n=await db.prepare('SELECT COUNT(*) AS c FROM members WHERE code=?').bind(code).first();if((n.c|0)>=MAX_MEMBERS)return json({error:'lake-full'},400);
      await db.prepare('INSERT INTO members(code,pid,joined) VALUES(?,?,?)').bind(code,me.id,now).run();
    }
    return json({ok:true,code:lake.code,name:lake.name,lakes:await myLakes(db,me)});
  }
  if(p==='lake/leave'){
    const code=clean(b.code,20).toUpperCase();
    await db.prepare('DELETE FROM members WHERE code=? AND pid=?').bind(code,me.id).run();
    const left=await db.prepare('SELECT COUNT(*) AS c FROM members WHERE code=?').bind(code).first();
    if(!(left.c|0))await db.prepare('DELETE FROM lakes WHERE code=?').bind(code).run();
    else await db.prepare('UPDATE lakes SET owner=(SELECT pid FROM members WHERE code=? ORDER BY joined LIMIT 1) WHERE code=? AND owner=?').bind(code,code,me.id).run();
    return json({ok:true,lakes:await myLakes(db,me)});
  }
  if(p==='sync'){
    const wk=weekKey(),st=[],gi=[];
    const stats=b.stats&&typeof b.stats==='object'?JSON.stringify(b.stats).slice(0,4000):me.stats;
    const wkn=String(b.wk)===wk?Math.max(0,Math.min(1e6,b.wkn|0)):0;
    const hasCab=typeof b.cabin==='string'&&b.cabin.length<20000;
    st.push(db.prepare('UPDATE players SET stats=?,wk=?,wkn=?,seen=?'+(hasCab?',cabin=?':'')+' WHERE id=?').bind(...[stats,wk,wkn,now].concat(hasCab?[b.cabin]:[]),me.id));
    for(const c of (Array.isArray(b.catches)?b.catches:[]).slice(0,20)){
      const w=+c.w;if(!(w>0&&w<5000)||typeof c.fish!=='string')continue;
      st.push(db.prepare('INSERT INTO catches(pid,name,fish,w,v,water,ts) VALUES(?,?,?,?,?,?,?)').bind(me.id,me.name,clean(c.fish,24),w,clean(c.v,10),clean(c.water,10),Math.min(now,+c.ts||now)));
    }
    if(b.best&&typeof b.best==='object')for(const [fish,w0] of Object.entries(b.best).slice(0,120)){
      const w=+w0;if(!(w>0&&w<5000))continue;
      st.push(db.prepare('INSERT INTO pbest(pid,fish,w,ts) VALUES(?,?,?,?) ON CONFLICT(pid,fish) DO UPDATE SET w=excluded.w,ts=excluded.ts WHERE excluded.w>pbest.w').bind(me.id,clean(fish,24),w,now));
      if((me.pub??1)!==0)gi.push(st.length),st.push(db.prepare('INSERT INTO grec(fish,pid,w,ts) VALUES(?,?,?,?) ON CONFLICT(fish) DO UPDATE SET pid=excluded.pid,w=excluded.w,ts=excluded.ts WHERE excluded.w>grec.w').bind(clean(fish,24),me.id,w,now));
    }
    const wb=+b.wkBest;if(String(b.wk)===wk&&wb>0&&wb<5000)st.push(db.prepare('INSERT INTO weekly(week,pid,name,w,ts) VALUES(?,?,?,?,?) ON CONFLICT(week,pid) DO UPDATE SET w=excluded.w,name=excluded.name,ts=excluded.ts WHERE excluded.w>weekly.w').bind(wk,me.id,me.name,wb,now));
    if(Math.random()<.02){st.push(db.prepare('DELETE FROM kvc WHERE ts<? AND k NOT LIKE ?').bind(now-7*864e5,'grec:%'));st.push(db.prepare('DELETE FROM catches WHERE ts<?').bind(now-14*864e5));st.push(db.prepare('DELETE FROM mail WHERE claimed=1 AND ts<?').bind(now-30*864e5))}
    const res=await db.batch(st);
    // a new lake-wide record clears the cached record list so it shows up on the next sync
    if(gi.some(i=>res[i]&&res[i].meta&&res[i].meta.changes>0))try{await db.prepare("DELETE FROM kvc WHERE k='rec:all'").run()}catch(e){}
    const X=await syncExtras(db,me,b,now,wk);
    let sc;try{sc=await scopeOf(db,me,b.lake)}catch(e){sc=await scopeOf(db,me,'all')}
    const lw=String(+wk-1);
    const scc=sc.code==='all'?pubScope:sc,k=scKey(sc);
    const [mail,records,comm,top,ltop,lakes]=await Promise.all([
      db.prepare('SELECT id,from_name,kind,item,n,msg,ts FROM mail WHERE to_pid=? AND claimed=0 ORDER BY id LIMIT 30').bind(me.id).all(),
      recordsFor(db,scc),
      cached(db,`comm:${k}:${wk}`,3*MIN,async()=>await db.prepare(`SELECT COALESCE(SUM(wkn),0) AS total,COUNT(*) AS players FROM players WHERE wk=? AND wkn>0 AND id IN ${scc.sql}`).bind(wk,...scc.args).first()),
      cached(db,`wt:${k}:${wk}`,3*MIN,()=>weeklyTop(db,wk,scc)),cached(db,`wt:${k}:${lw}`,60*MIN,()=>weeklyTop(db,lw,scc)),myLakes(db,me)]);
    const players=Math.max(1,comm.players|0);
    return json({...X,week:wk,lake:sc.code,lakes,pub:(me.pub??1)!==0,hasPin:!!me.pin,mail:mail.results,records,
      community:{week:wk,lake:sc.code,total:comm.total|0,players,goal:2000+1500*players},
      weekly:{week:wk,top},lastWeekly:{week:lw,lake:sc.code,top:ltop},next:((+wk+1)*7-3)*864e5});
  }
  if(p==='players'){
    const sc=await scopeOf(db,me,b.lake),scc=sc.code==='all'?pubScope:sc;
    const rows=await cached(db,'pl:'+scKey(sc),2*MIN,async()=>(await db.prepare(`SELECT id,name,stats,seen FROM players WHERE stats IS NOT NULL AND id IN ${scc.sql} ORDER BY seen DESC LIMIT 300`).bind(...scc.args).all()).results);
    if(!rows.some(x=>x.id===me.id)&&me.stats)rows.unshift({id:me.id,name:me.name,stats:me.stats,seen:me.seen});
    return json({players:rows.map(x=>({id:x.id,name:x.name,seen:x.seen,stats:(()=>{try{return JSON.parse(x.stats)}catch(e){return {}}})()}))});
  }
  if(p==='news'){
    const sc=await scopeOf(db,me,b.lake);
    const rows=await cached(db,'news:'+scKey(sc),2*MIN,async()=>(await db.prepare(`SELECT pid,name,fish,w,v,water,ts FROM catches WHERE ts>? AND pid IN ${sc.sql} ORDER BY ts DESC LIMIT 60`).bind(now-36*36e5,...sc.args).all()).results);
    return json({catches:rows});
  }
  if(p==='cabin'){
    const t=await db.prepare('SELECT id,name,cabin,COALESCE(pub,1) AS pub FROM players WHERE id=?').bind(String(b.target||'')).first();
    if(!t||!t.cabin)return json({error:'no-cabin'},404);
    if(!t.pub&&t.id!==me.id&&!(await sharesLake(db,me.id,t.id)))return json({error:'private'},403);
    return json({name:t.name,cabin:t.cabin});
  }
  if(p==='mail'){
    if(!['pot','mat'].includes(b.kind))return json({error:'bad-kind'},400);
    const n=Math.max(1,Math.min(5,b.n|0)),item=clean(b.item,16),to=String(b.to||'');
    if(to===me.id)return json({error:'self'},400);
    const dest=await db.prepare('SELECT id,COALESCE(pub,1) AS pub FROM players WHERE id=?').bind(to).first();if(!dest)return json({error:'no-player'},404);
    if(!((dest.pub&&(me.pub??1))||(await sharesLake(db,me.id,to))))return json({error:'private'},403);
    const sent=await db.prepare('SELECT COUNT(*) AS c FROM mail WHERE from_pid=? AND ts>?').bind(me.id,now-864e5).first();
    if((sent.c|0)>=10)return json({error:'daily-limit'},429);
    await db.prepare('INSERT INTO mail(to_pid,from_pid,from_name,kind,item,n,msg,ts) VALUES(?,?,?,?,?,?,?,?)').bind(to,me.id,me.name,b.kind,item,n,clean(b.msg,80),now).run();
    return json({ok:true});
  }
  if(p==='claim'){
    const row=await db.prepare('SELECT id,from_name,kind,item,n FROM mail WHERE id=? AND to_pid=? AND claimed=0').bind(b.mail|0,me.id).first();
    if(!row)return json({error:'gone'},404);
    const u=await db.prepare('UPDATE mail SET claimed=1 WHERE id=? AND claimed=0').bind(row.id).run();
    if(!u.meta||u.meta.changes!==1)return json({error:'gone'},404);
    return json({ok:true,mail:row});
  }
  if(p==='pin/board')return json(await pinBoard(db,me,now));
  if(p==='pin/submit'){
    const sc=Math.floor(+b.score);if(!(sc>=0&&sc<=PIN_MAX))return json({error:'bad-score'},400);
    const day=pinDay(now),cur=await db.prepare('SELECT score,ts FROM pinday WHERE day=? AND pid=?').bind(day,me.id).first();
    if(cur&&now-cur.ts<15000)return json(await pinBoard(db,me,now));
    if(!cur)await db.prepare('INSERT INTO pinday(day,pid,score,ts) VALUES(?,?,?,?)').bind(day,me.id,sc,now).run();
    else if(sc>cur.score)await db.prepare('UPDATE pinday SET score=?,ts=? WHERE day=? AND pid=?').bind(sc,now,day,me.id).run();
    if(Math.random()<.05)await db.prepare('DELETE FROM pinday WHERE day<?').bind(pinDay(now-30*864e5)).run();
    return json(await pinBoard(db,me,now));
  }
  if(p.startsWith('texts/')){
    const cutoff=now-TEXT_DAYS*864e5;
    if(p==='texts/poll'){
      const after=Math.max(0,+b.after||0);
      const [un,fresh]=await Promise.all([
        db.prepare('SELECT COUNT(*) AS c FROM texts WHERE b=? AND seen=0 AND ts>?').bind(me.id,cutoff).first(),
        db.prepare('SELECT t.id,t.a,p.name,t.body,t.photo,t.ts FROM texts t JOIN players p ON p.id=t.a WHERE t.b=? AND t.id>? AND t.ts>? ORDER BY t.id DESC LIMIT 10').bind(me.id,after,cutoff).all()]);
      const top=await db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM texts').first();
      const gafter=Math.max(0,+b.gafter||0);
      const [gun,gfresh,gtop]=await Promise.all([
        db.prepare('SELECT COUNT(x.id) AS c FROM gmem m JOIN gmsg x ON x.gid=m.gid AND x.id>m.seen AND x.a<>m.pid AND x.ts>? WHERE m.pid=?').bind(cutoff,me.id).first(),
        db.prepare('SELECT x.id,x.gid,x.a,p.name,g.name AS gname,x.body,x.photo,x.ts,x.sys FROM gmem m JOIN gmsg x ON x.gid=m.gid AND x.id>? AND x.a<>m.pid JOIN gchat g ON g.id=x.gid LEFT JOIN players p ON p.id=x.a WHERE m.pid=? ORDER BY x.id DESC LIMIT 10').bind(gafter,me.id).all(),
        db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM gmsg').first()]);
      return json({unread:(un.c|0)+(gun.c|0),fresh:fresh.results.reverse(),top:top.m|0,gfresh:gfresh.results.reverse(),gtop:gtop.m|0});
    }
    if(p==='texts/dir'){
      const r=await db.prepare(`SELECT id,name,seen FROM players WHERE id<>? AND stats IS NOT NULL AND (COALESCE(pub,1)=1 OR id IN (SELECT m2.pid FROM members m1 JOIN members m2 ON m1.code=m2.code WHERE m1.pid=?)) ORDER BY lname LIMIT 500`).bind(me.id,me.id).all();
      return json({people:r.results});
    }
    if(p==='texts/inbox'){
      const r=await db.prepare(`SELECT x.o,x.mid,x.un,t.a,t.body,t.photo,t.ts,p.name FROM (SELECT CASE WHEN a=? THEN b ELSE a END AS o,MAX(id) AS mid,SUM(CASE WHEN b=? AND seen=0 THEN 1 ELSE 0 END) AS un FROM texts WHERE (a=? OR b=?) AND ts>? GROUP BY o) x JOIN texts t ON t.id=x.mid JOIN players p ON p.id=x.o ORDER BY x.mid DESC LIMIT 60`).bind(me.id,me.id,me.id,me.id,cutoff).all();
      const threads=r.results.map(x=>({id:x.o,name:x.name,un:x.un|0,mine:x.a===me.id,body:x.body,photo:!!x.photo,ts:x.ts}));
      const gs=(await db.prepare(`SELECT g.id,g.name,g.created,m.seen,(SELECT COUNT(*) FROM gmem m2 WHERE m2.gid=g.id) AS n,(SELECT MAX(id) FROM gmsg WHERE gid=g.id) AS mid FROM gmem m JOIN gchat g ON g.id=m.gid WHERE m.pid=? LIMIT 30`).bind(me.id).all()).results;
      if(gs.length){const ids=gs.map(g=>g.mid).filter(Boolean),last=ids.length?(await db.prepare(`SELECT x.id,x.gid,x.a,x.body,x.photo,x.ts,x.sys,p.name FROM gmsg x LEFT JOIN players p ON p.id=x.a WHERE x.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results:[];
        const un=(await db.prepare('SELECT m.gid,COUNT(x.id) AS c FROM gmem m JOIN gmsg x ON x.gid=m.gid AND x.id>m.seen AND x.a<>m.pid AND x.ts>? WHERE m.pid=? GROUP BY m.gid').bind(cutoff,me.id).all()).results;
        for(const g of gs){const l=last.find(x=>x.gid===g.id),u=un.find(x=>x.gid===g.id);
          threads.push({id:'g:'+g.id,group:true,n:g.n|0,name:g.name,un:u?u.c|0:0,mine:!!l&&l.a===me.id,from:l&&!l.sys&&l.a!==me.id?l.name:'',body:l?l.body:'Group created',photo:!!(l&&l.photo),ts:l?l.ts:g.created})}
        threads.sort((a,b)=>b.ts-a.ts)}
      return json({threads});
    }
    // ----- group texts: up to 10 anglers, made from people you can already text
    const gmember=async gid=>await db.prepare('SELECT g.id,g.name,g.owner,m.seen FROM gmem m JOIN gchat g ON g.id=m.gid WHERE m.gid=? AND m.pid=?').bind(gid|0,me.id).first();
    const gsys=(gid,body)=>db.prepare('INSERT INTO gmsg(gid,a,body,photo,ts,sys) VALUES(?,?,?,NULL,?,1)').bind(gid,me.id,body,now);
    if(p==='texts/gnew'){const name=clean(b.name,30)||'Group chat';const ids=[...new Set((Array.isArray(b.members)?b.members:[]).map(String))].filter(x=>x!==me.id).slice(0,GROUP_MAX-1);
      if(ids.length<2)return json({error:'need-two'},400);
      const made=await db.prepare('SELECT COUNT(*) AS c FROM gchat WHERE owner=? AND created>?').bind(me.id,now-864e5).first();if((made.c|0)>=GROUPS_PER_DAY)return json({error:'slow-down'},429);
      const ok=[];for(const id of ids){const s=await canSee(db,me,id);if(s)ok.push(s)}if(ok.length<2)return json({error:'need-two'},400);
      const r=await db.prepare('INSERT INTO gchat(name,owner,created,last) VALUES(?,?,?,?)').bind(name,me.id,now,now).run();const gid=r.meta.last_row_id||(await db.prepare('SELECT MAX(id) AS id FROM gchat WHERE owner=?').bind(me.id).first()).id;
      await db.batch([db.prepare('INSERT INTO gmem(gid,pid,seen,joined) VALUES(?,?,0,?)').bind(gid,me.id,now),...ok.map(s=>db.prepare('INSERT OR IGNORE INTO gmem(gid,pid,seen,joined) VALUES(?,?,0,?)').bind(gid,s.id,now)),gsys(gid,`${me.name} started the group`)]);
      return json({ok:true,gid,name})}
    if(p==='texts/gthread'){const g=await gmember(b.gid);if(!g)return json({error:'not-member'},404);const after=Math.max(0,+b.after||0);
      const [msgs,mem]=await Promise.all([db.prepare('SELECT x.id,x.a,x.body,x.photo,x.ts,x.sys,p.name FROM gmsg x LEFT JOIN players p ON p.id=x.a WHERE x.gid=? AND x.ts>? AND x.id>? ORDER BY x.id DESC LIMIT 150').bind(g.id,cutoff,after).all(),
        db.prepare('SELECT p.id,p.name,p.seen FROM gmem m JOIN players p ON p.id=m.pid WHERE m.gid=? ORDER BY p.lname').bind(g.id).all()]);
      const top=msgs.results.length?msgs.results[0].id:g.seen;if(top>g.seen)await db.prepare('UPDATE gmem SET seen=? WHERE gid=? AND pid=?').bind(top,g.id,me.id).run();
      return json({name:g.name,gid:g.id,owner:g.owner===me.id,members:mem.results.map(x=>({id:x.id,name:x.name,seen:x.seen,me:x.id===me.id})),msgs:msgs.results.reverse().map(x=>({id:x.id,mine:x.a===me.id&&!x.sys,from:x.name||'?',fromId:x.a,sys:!!x.sys,body:x.body,photo:x.photo?JSON.parse(x.photo):null,ts:x.ts}))})}
    if(p==='texts/gsend'){const g=await gmember(b.gid);if(!g)return json({error:'not-member'},404);
      const text=clean(b.body,280),photo=b.photo?cleanPhoto(b.photo):null;if(!text&&!photo)return json({error:'empty'},400);if(b.photo&&!photo)return json({error:'bad-photo'},400);
      const since=dayStart(now,b.tz);
      const [c1,c2]=await Promise.all([db.prepare('SELECT COUNT(*) AS c FROM texts WHERE a=? AND ts>=?').bind(me.id,since).first(),db.prepare('SELECT COUNT(*) AS c FROM gmsg WHERE a=? AND ts>=? AND sys=0').bind(me.id,since).first()]);
      if((c1.c|0)+(c2.c|0)>=TEXTS_PER_DAY)return json({error:'slow-down'},429);
      const pc=photo?await db.prepare('SELECT COUNT(*) AS c FROM gmsg WHERE a=? AND gid=? AND ts>=? AND photo IS NOT NULL').bind(me.id,g.id,since).first():{c:0};
      if(photo&&(pc.c|0)>=PHOTOS_PER_DAY)return json({error:'photo-limit',photos:pc.c|0},429);
      const r=await db.prepare('INSERT INTO gmsg(gid,a,body,photo,ts,sys) VALUES(?,?,?,?,?,0)').bind(g.id,me.id,text,photo,now).run();
      const id=r.meta.last_row_id||(await db.prepare('SELECT MAX(id) AS id FROM gmsg WHERE gid=? AND a=?').bind(g.id,me.id).first()).id;
      const st=[db.prepare('UPDATE gchat SET last=? WHERE id=?').bind(now,g.id),db.prepare('UPDATE gmem SET seen=? WHERE gid=? AND pid=?').bind(id,g.id,me.id)];
      if(Math.random()<.05)st.push(db.prepare('DELETE FROM gmsg WHERE ts<?').bind(cutoff));await db.batch(st);
      return json({ok:true,id,ts:now,photos:(pc.c|0)+(photo?1:0)})}
    if(p==='texts/gadd'){const g=await gmember(b.gid);if(!g)return json({error:'not-member'},404);
      const n=await db.prepare('SELECT COUNT(*) AS c FROM gmem WHERE gid=?').bind(g.id).first(),room=GROUP_MAX-(n.c|0);if(room<=0)return json({error:'group-full'},400);
      const add=[];for(const id of [...new Set((Array.isArray(b.members)?b.members:[]).map(String))].slice(0,room)){const s=await canSee(db,me,id);if(s&&!(await db.prepare('SELECT 1 FROM gmem WHERE gid=? AND pid=?').bind(g.id,s.id).first()))add.push(s)}
      if(!add.length)return json({ok:true,added:0});
      await db.batch([...add.map(s=>db.prepare('INSERT OR IGNORE INTO gmem(gid,pid,seen,joined) VALUES(?,?,0,?)').bind(g.id,s.id,now)),gsys(g.id,`${me.name} added ${add.map(s=>s.name).join(', ')}`)]);return json({ok:true,added:add.length})}
    if(p==='texts/grename'){const g=await gmember(b.gid);if(!g)return json({error:'not-member'},404);const name=clean(b.name,30);if(!name)return json({error:'bad-name'},400);
      await db.batch([db.prepare('UPDATE gchat SET name=? WHERE id=?').bind(name,g.id),gsys(g.id,`${me.name} renamed the group “${name}”`)]);return json({ok:true,name})}
    if(p==='texts/gleave'){const g=await gmember(b.gid);if(!g)return json({ok:true});
      await db.batch([db.prepare('DELETE FROM gmem WHERE gid=? AND pid=?').bind(g.id,me.id),gsys(g.id,`${me.name} left the group`)]);
      const n=await db.prepare('SELECT COUNT(*) AS c FROM gmem WHERE gid=?').bind(g.id).first();
      if(!(n.c|0))await db.batch([db.prepare('DELETE FROM gmsg WHERE gid=?').bind(g.id),db.prepare('DELETE FROM gchat WHERE id=?').bind(g.id)]);
      return json({ok:true})}
    if(p==='texts/thread'){
      const w=String(b.with||''),after=Math.max(0,+b.after||0);
      const who=await db.prepare('SELECT id,name,seen FROM players WHERE id=?').bind(w).first();if(!who)return json({error:'no-player'},404);
      const r=await db.prepare('SELECT id,a,body,photo,ts FROM texts WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND ts>? AND id>? ORDER BY id DESC LIMIT 120').bind(me.id,w,w,me.id,cutoff,after).all();
      await db.prepare('UPDATE texts SET seen=1 WHERE a=? AND b=? AND seen=0').bind(w,me.id).run();
      return json({name:who.name,seen:who.seen,msgs:r.results.reverse().map(x=>({id:x.id,mine:x.a===me.id,body:x.body,photo:x.photo?JSON.parse(x.photo):null,ts:x.ts}))});
    }
    if(p==='texts/send'){
      const to=await canSee(db,me,b.to);if(!to)return json({error:'no-player'},404);
      const text=clean(b.body,280),photo=b.photo?cleanPhoto(b.photo):null;
      if(!text&&!photo)return json({error:'empty'},400);
      if(b.photo&&!photo)return json({error:'bad-photo'},400);
      const since=dayStart(now,b.tz);
      const cnt=await db.prepare('SELECT COUNT(*) AS c,SUM(CASE WHEN photo IS NOT NULL THEN 1 ELSE 0 END) AS ph FROM texts WHERE a=? AND ts>=?').bind(me.id,since).first();
      if((cnt.c|0)>=TEXTS_PER_DAY)return json({error:'slow-down'},429);
      // Photos are limited per person: 5 a day to each friend you text.
      const pc=photo?await db.prepare('SELECT COUNT(*) AS c FROM texts WHERE a=? AND b=? AND ts>=? AND photo IS NOT NULL').bind(me.id,to.id,since).first():{c:0};
      if(photo&&(pc.c|0)>=PHOTOS_PER_DAY)return json({error:'photo-limit',photos:pc.c|0},429);
      const st=[db.prepare('INSERT INTO texts(a,b,body,photo,ts) VALUES(?,?,?,?,?)').bind(me.id,to.id,text,photo,now)];
      if(Math.random()<.05)st.push(db.prepare('DELETE FROM texts WHERE ts<?').bind(cutoff));
      await db.batch(st);
      const row=await db.prepare('SELECT MAX(id) AS id FROM texts WHERE a=? AND b=?').bind(me.id,to.id).first();
      return json({ok:true,id:row.id|0,ts:now,photos:(pc.c|0)+(photo?1:0)});
    }
  }
  return json({error:'not-found'},404);
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
    if(!env.DB)return json({error:'no-db'},503);
    try{await init(env.DB);return await route(req,env,url)}
    catch(e){const m=String(e&&e.message||e);return json({error:m},m==='auth'?401:m==='bad-request'?400:m==='not-member'?403:500)}
  }
};
