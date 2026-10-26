// Lantern Lake service worker: lets the game install as an app and shows alerts.
// Pages always load fresh from the network (so updates arrive as usual); the last copy is only used when offline.
const SHELL='ll-shell-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(SHELL).then(c=>c.addAll(['icon-192.png'])).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==SHELL)await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||r.mode!=='navigate')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(SHELL).then(c=>c.put('./',cp)).catch(()=>{})}return res}).catch(async()=>(await caches.match('./'))||Response.error()))});
self.addEventListener('push',e=>{let m={};try{m=e.data?e.data.json():{}}catch(_){m={body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(m.title||'Lantern Lake',{body:m.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:m.tag||undefined,renotify:!!m.tag,data:{url:'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const c of all)if(c.url.includes('/lantern-lake/')&&'focus' in c)return c.focus();return self.clients.openWindow('./')})())});
