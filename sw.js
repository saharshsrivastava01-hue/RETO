const CACHE="reto-static-v2";
const SHELL=["/","/index.html","/account.html","/admin.html","/manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("reto-static-")&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  // Never cache API responses: accounts, enquiries and catalogue state must be fresh.
  if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&response.type==="basic"){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
    return response;
  }).catch(()=>caches.match("/index.html"))));
});