// Game Shelf server: serves the static site and a small JSON API for Lantern Lake friends features.
// Needs a D1 database bound with the variable name DB.
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:H});
const weekKey=()=>String(Math.floor((Date.now()/864e5+3)/7));
const NAME_RE=/^[A-Za-z0-9 _.'-]{2,16}$/;
const LAKE_RE=/^[A-Za-z0-9 _.'!&-]{2,24}$/;
const WORDS=['PERCH','BASS','PIKE','TROUT','CARP','SMELT','EEL','GAR','SHAD','CHUB','DACE','BREAM','ROACH','TENCH','WALLEYE','MUSKIE','BOBBER','LURE','REEL','DOCK','COVE','REED','LILY','LOON','OTTER','HERON','CANOE','PADDLE','LANTERN','MOON'];
const MAX_SAVE=150000,XFER_MS=30*60*1000,XABC='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_MEMBERS=50,MAX_LAKES=10,TEXT_DAYS=7,PHOTOS_PER_DAY=2,TEXTS_PER_DAY=400;
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
  ready=true;
}
const rid=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
const rnd=n=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n};
const xcode=()=>Array.from({length:6},()=>XABC[rnd(XABC.length)]).join('');
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
  return JSON.stringify({f:clean(p.f,24),w:+w.toFixed(2),v:clean(p.v,10),wx:clean(p.wx,10),ph:clean(p.ph,6),water:clean(p.water,10),coat:clean(p.coat,10)});
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
  const [top,mine]=await Promise.all([db.prepare('SELECT e.pid,e.name,e.w,COALESCE(p.pub,1) AS pub FROM evbest e LEFT JOIN players p ON p.id=e.pid WHERE e.ev=? ORDER BY e.w DESC,e.ts ASC LIMIT 10').bind(HW_EV).all(),
    db.prepare('SELECT w,ts FROM evbest WHERE ev=? AND pid=?').bind(HW_EV,me.id).first()]);
  let rank=0;if(mine){const r=await db.prepare('SELECT COUNT(*) AS c FROM evbest WHERE ev=? AND (w>? OR (w=? AND ts<?))').bind(HW_EV,mine.w,mine.w,mine.ts).first();rank=(r.c|0)+1}
  return {id:HW_EV,ended:now>=HW_END,top:top.results.map(x=>({name:x.pid===me.id||x.pub?x.name:'Hidden angler',w:x.w,me:x.pid===me.id})),me:mine?{w:mine.w,rank}:null}}
async function monPart(db,me,b,now,wk){
  let m=await db.prepare('SELECT maxhp,dead FROM mon WHERE week=?').bind(wk).first();
  if(!m){const n=await db.prepare('SELECT COUNT(*) AS c FROM players WHERE seen>?').bind(now-7*864e5).first();const maxhp=Math.max(3000,2500*(n.c|0));
    await db.prepare('INSERT OR IGNORE INTO mon(week,maxhp,dead) VALUES(?,?,0)').bind(wk,maxhp).run();m=await db.prepare('SELECT maxhp,dead FROM mon WHERE week=?').bind(wk).first()}
  const dmg=Math.min(5000,Math.max(0,+b.mdmg||0));
  if(dmg>0&&!m.dead)await db.prepare('INSERT INTO monhit(week,pid,dmg) VALUES(?,?,?) ON CONFLICT(week,pid) DO UPDATE SET dmg=monhit.dmg+excluded.dmg').bind(wk,me.id,dmg).run();
  const [tot,mine]=await Promise.all([db.prepare('SELECT COALESCE(SUM(dmg),0) AS s,COUNT(*) AS n FROM monhit WHERE week=?').bind(wk).first(),db.prepare('SELECT dmg FROM monhit WHERE week=? AND pid=?').bind(wk,me.id).first()]);
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
  fw.searchParams.set('boat',String(Math.max(0,Math.min(7,q.get('boat')|0))));fw.searchParams.set('wear',clean(q.get('wear'),8));fw.searchParams.set('cid',clean(q.get('cid'),12));
  return stub.fetch(new Request(fw.toString(),{headers:req.headers}));
}
export class LakeRoom{
  constructor(ctx,env){this.ctx=ctx;this.env=env;try{ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))}catch(e){}}
  peers(except){return this.ctx.getWebSockets().filter(w=>w!==except).map(w=>{try{return w.deserializeAttachment()}catch(e){return null}}).filter(Boolean)}
  bcast(o,except){const m=JSON.stringify(o);for(const w of this.ctx.getWebSockets())if(w!==except){try{w.send(m)}catch(e){}}}
  async fetch(req){const q=new URL(req.url).searchParams;
    const me={pid:q.get('pid'),name:q.get('name'),boat:q.get('boat')|0,wear:q.get('wear')||'',cid:q.get('cid')||Math.random().toString(36).slice(2,8),at:Date.now()};
    for(const w of this.ctx.getWebSockets()){let a=null;try{a=w.deserializeAttachment()}catch(e){}if(a&&a.pid===me.pid){try{w.close(4000,'replaced')}catch(e){}}}
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment(me);
    const water=q.get('water');if(water)await this.ctx.storage.put('water',water);
    server.send(JSON.stringify({t:'hello',me:me.cid,peers:this.peers(server).filter(p=>p.pid!==me.pid),raid:await this.raidView()}));
    this.bcast({t:'join',p:me},server);await this.maybeRaid();
    return new Response(null,{status:101,webSocket:client})}
  async webSocketMessage(ws,msg){if(typeof msg!=='string'||msg.length>600)return;if(msg==='ping'){try{ws.send('pong')}catch(e){}return}
    let o;try{o=JSON.parse(msg)}catch(e){return}let a;try{a=ws.deserializeAttachment()}catch(e){}if(!a)return;
    if(o.t==='st'){a.boat=Math.max(0,Math.min(7,o.boat|0));a.wear=String(o.wear||'').slice(0,8);ws.serializeAttachment(a);this.bcast({t:'st',pid:a.pid,cid:a.cid,boat:a.boat,wear:a.wear},ws)}
    else if(o.t==='catch'){const w=+o.w;if(!(w>0&&w<5000)||typeof o.f!=='string')return;const c={t:'catch',pid:a.pid,cid:a.cid,f:o.f.slice(0,24),w:+w.toFixed(2),v:String(o.v||'').slice(0,8),r:String(o.r||'').slice(0,1)};
      const R=await this.ctx.storage.get('raid');if(R&&!R.done&&Date.now()<R.ends){R.hp=Math.max(0,R.hp-w);R.hits[a.pid]=(R.hits[a.pid]||0)+w;R.names[a.pid]=a.name;c.raid={hp:Math.round(R.hp),max:R.max};
        if(R.hp<=0){R.done=true;await this.ctx.storage.put('raid',R);this.bcast(c);await this.raidEnd(true);return}await this.ctx.storage.put('raid',R)}
      this.bcast(c)}
    else if(o.t==='emo'){const e=o.e|0;if(e>=0&&e<12)this.bcast({t:'emo',pid:a.pid,cid:a.cid,e},ws)}}
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
  const me=await auth(db,b);
  {const xr=await extraRoutes(p,db,me,b,now);if(xr)return xr}
  // Cloud save: the latest copy of this player's game, so their devices stay in sync.
  if(p==='cloud/put'){
    const d=String(b.data||'');if(d.length<20||d.length>MAX_SAVE)return json({error:'bad-save'},400);
    const ts=Math.min(now+60000,Number(b.ts)||now);
    await db.prepare('INSERT INTO cloud(pid,data,ts,dev,kind,day,coins,up) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET data=excluded.data,ts=excluded.ts,dev=excluded.dev,kind=excluded.kind,day=excluded.day,coins=excluded.coins,up=excluded.up')
      .bind(me.id,d,ts,clean(b.dev,16),clean(b.kind,12),Number(b.day)|0,Number(b.coins)||0,now).run();
    return json({ok:true,ts});
  }
  if(p==='cloud/get'){
    const r=await db.prepare('SELECT data,ts,dev,kind,day,coins FROM cloud WHERE pid=?').bind(me.id).first();
    if(!r)return json({none:true});
    if(b.meta)return json({ts:r.ts,dev:r.dev,kind:r.kind,day:r.day,coins:r.coins});
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
    const wk=weekKey(),st=[];
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
    }
    const wb=+b.wkBest;if(String(b.wk)===wk&&wb>0&&wb<5000)st.push(db.prepare('INSERT INTO weekly(week,pid,name,w,ts) VALUES(?,?,?,?,?) ON CONFLICT(week,pid) DO UPDATE SET w=excluded.w,name=excluded.name,ts=excluded.ts WHERE excluded.w>weekly.w').bind(wk,me.id,me.name,wb,now));
    if(Math.random()<.02){st.push(db.prepare('DELETE FROM catches WHERE ts<?').bind(now-14*864e5));st.push(db.prepare('DELETE FROM mail WHERE claimed=1 AND ts<?').bind(now-30*864e5))}
    await db.batch(st);
    const X=await syncExtras(db,me,b,now,wk);
    let sc;try{sc=await scopeOf(db,me,b.lake)}catch(e){sc=await scopeOf(db,me,'all')}
    const lw=String(+wk-1);
    const [mail,records,comm,top,ltop,lakes]=await Promise.all([
      db.prepare('SELECT id,from_name,kind,item,n,msg,ts FROM mail WHERE to_pid=? AND claimed=0 ORDER BY id LIMIT 30').bind(me.id).all(),
      db.prepare(`SELECT fish,pid,name,w FROM (SELECT b.fish,b.pid,p.name,b.w,ROW_NUMBER() OVER (PARTITION BY b.fish ORDER BY b.w DESC,b.ts ASC) AS rn FROM pbest b JOIN players p ON p.id=b.pid WHERE b.pid IN ${sc.sql}) WHERE rn=1`).bind(...sc.args).all(),
      db.prepare(`SELECT COALESCE(SUM(wkn),0) AS total,COUNT(*) AS players FROM players WHERE wk=? AND wkn>0 AND id IN ${sc.sql}`).bind(wk,...sc.args).first(),
      weeklyTop(db,wk,sc),weeklyTop(db,lw,sc),myLakes(db,me)]);
    const players=Math.max(1,comm.players|0);
    return json({...X,week:wk,lake:sc.code,lakes,pub:(me.pub??1)!==0,mail:mail.results,records:records.results,
      community:{week:wk,lake:sc.code,total:comm.total|0,players,goal:2000+1500*players},
      weekly:{week:wk,top},lastWeekly:{week:lw,lake:sc.code,top:ltop},next:((+wk+1)*7-3)*864e5});
  }
  if(p==='players'){
    const sc=await scopeOf(db,me,b.lake);
    const r=await db.prepare(`SELECT id,name,stats,seen FROM players WHERE stats IS NOT NULL AND id IN ${sc.sql} ORDER BY seen DESC LIMIT 300`).bind(...sc.args).all();
    return json({players:r.results.map(x=>({id:x.id,name:x.name,seen:x.seen,stats:(()=>{try{return JSON.parse(x.stats)}catch(e){return {}}})()}))});
  }
  if(p==='news'){
    const sc=await scopeOf(db,me,b.lake);
    const r=await db.prepare(`SELECT pid,name,fish,w,v,water,ts FROM catches WHERE ts>? AND pid IN ${sc.sql} ORDER BY ts DESC LIMIT 60`).bind(now-36*36e5,...sc.args).all();
    return json({catches:r.results});
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
      return json({unread:un.c|0,fresh:fresh.results.reverse(),top:top.m|0});
    }
    if(p==='texts/dir'){
      const r=await db.prepare(`SELECT id,name,seen FROM players WHERE id<>? AND stats IS NOT NULL AND (COALESCE(pub,1)=1 OR id IN (SELECT m2.pid FROM members m1 JOIN members m2 ON m1.code=m2.code WHERE m1.pid=?)) ORDER BY lname LIMIT 500`).bind(me.id,me.id).all();
      return json({people:r.results});
    }
    if(p==='texts/inbox'){
      const r=await db.prepare(`SELECT x.o,x.mid,x.un,t.a,t.body,t.photo,t.ts,p.name FROM (SELECT CASE WHEN a=? THEN b ELSE a END AS o,MAX(id) AS mid,SUM(CASE WHEN b=? AND seen=0 THEN 1 ELSE 0 END) AS un FROM texts WHERE (a=? OR b=?) AND ts>? GROUP BY o) x JOIN texts t ON t.id=x.mid JOIN players p ON p.id=x.o ORDER BY x.mid DESC LIMIT 60`).bind(me.id,me.id,me.id,me.id,cutoff).all();
      return json({threads:r.results.map(x=>({id:x.o,name:x.name,un:x.un|0,mine:x.a===me.id,body:x.body,photo:!!x.photo,ts:x.ts}))});
    }
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
      if(photo&&(cnt.ph|0)>=PHOTOS_PER_DAY)return json({error:'photo-limit',photos:cnt.ph|0},429);
      const st=[db.prepare('INSERT INTO texts(a,b,body,photo,ts) VALUES(?,?,?,?,?)').bind(me.id,to.id,text,photo,now)];
      if(Math.random()<.05)st.push(db.prepare('DELETE FROM texts WHERE ts<?').bind(cutoff));
      await db.batch(st);
      const row=await db.prepare('SELECT MAX(id) AS id FROM texts WHERE a=? AND b=?').bind(me.id,to.id).first();
      return json({ok:true,id:row.id|0,ts:now,photos:(cnt.ph|0)+(photo?1:0)});
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
