/* Crowd Battle 3D - service worker: caches everything so the game works offline after the first load. */
var CACHE = 'cb3d-v6';
var ASSETS = ['./', 'index.html', 'manifest.json', 'css/style.css', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
  'js/storage.js', 'js/audio.js', 'js/levels.js', 'js/gfx.js', 'js/game.js', 'js/ui.js', 'lib/three.min.js'];
var AUDIO = ['click', 'menu', 'back', 'footstep', 'shoot', 'shoot_heavy', 'hit', 'enemy_attack', 'enemy_hit', 'join_small',
  'join_medium', 'join_large', 'gate', 'gate_bad', 'explosion', 'explosion_big', 'destroy', 'coin', 'boss_roar', 'victory',
  'gameover', 'upgrade', 'error', 'countdown', 'go', 'bgm_game', 'bgm_menu', 'bgm_boss'];

self.addEventListener('install', function (e) {
  var urls = ASSETS.concat(AUDIO.map(function (n) { return 'assets/audio/' + n + '.wav'; }));
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // add one by one so a missing optional file (e.g. lib/three.min.js on a CDN setup) never blocks install
    return Promise.all(urls.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
