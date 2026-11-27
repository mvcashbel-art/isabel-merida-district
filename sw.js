/* Isabel–Merida District: keeps the page available with weak or no signal. Church sites in /churches/ have their own. */
const V = 'district-v30';
const CORE = ['./', './index.html', './bible.html', './manifest.json', './sharebox.js', './totop.js', './fanmenu.js', './updatebar.js', './installtip.js', './offline.js', './icon-192.png', './icon-512.png', './logo.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V && !x.startsWith('bible-')).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.pathname.indexOf('/bible/') !== -1) return; if (u.origin !== location.origin || u.pathname.includes('/churches/')) return;
  e.respondWith(fetch(r, {cache: 'no-cache'}).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(x => x || caches.match('./index.html'))));
});
