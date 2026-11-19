/* Crowd Battle 3D - menus, shop, settings, flow | TK Sadhan */
(function (global) {
  'use strict';
  var A = global.GameAudio, Save = global.GameSave, Lv = global.GameLevels, doc = document;
  function $(id) { return doc.getElementById(id); }
  var screens = ['loading', 'menu', 'levels', 'shop', 'settings', 'pause', 'result'];
  var current = 'loading', shopReturn = 'menu';

  var UPGRADES = [
    { id: 'fireRate', icon: '🔫', name: 'Fire Rate', desc: 'Shoot faster (+14% per level)' },
    { id: 'damage', icon: '💥', name: 'Bullet Damage', desc: 'Each bullet hits harder (+22%)' },
    { id: 'startCrowd', icon: '👥', name: 'Start Crowd', desc: 'Begin every level with +3 soldiers' },
    { id: 'range', icon: '🎯', name: 'Multishot', desc: '+1 bullet in every volley' },
    { id: 'income', icon: '💰', name: 'Coin Bonus', desc: '+15% coins from every level' }
  ];
  var MAX_UP = 10;
  function upCost(lvl) { return Math.round(40 * Math.pow(lvl + 1, 1.7)); }

  function show(name) {
    screens.forEach(function (s) { $(s).classList.toggle('hidden', s !== name); });
    current = name;
    var inGame = name === 'pause' || name === 'result';
    $('hud').classList.toggle('hidden', !(inGame || name === 'game'));
    if (name === 'menu') { $('mPlayLvl').textContent = 'Level ' + Math.min(Lv.count, Save.data.unlocked); refreshCoins(); }
    if (name === 'levels') buildLevels();
    if (name === 'shop') buildShop();
    if (name === 'settings') syncSettings();
    if (name === 'menu' || name === 'levels' || name === 'shop' || name === 'settings') A.playMusic('bgm_menu');
  }
  function showGame() {
    screens.forEach(function (s) { $(s).classList.add('hidden'); });
    current = 'game'; $('hud').classList.remove('hidden');
  }
  function refreshCoins() {
    var els = doc.querySelectorAll('.coinsVal');
    for (var i = 0; i < els.length; i++) els[i].textContent = Save.data.coins;
  }

  /* ------------------------------------------------ levels */
  function buildLevels() {
    var g = $('levelGrid'), cur = null; g.innerHTML = ''; refreshCoins();
    var frag = doc.createDocumentFragment ? doc.createDocumentFragment() : g;
    for (var n = 1; n <= Lv.count; n++) {
      var b = doc.createElement('button'), locked = n > Save.data.unlocked, st = Save.data.stars[n] || 0;
      b.className = 'lvl' + (locked ? ' locked' : '') + (n % 10 === 0 ? ' boss' : '');
      if (n === Math.min(Lv.count, Save.data.unlocked)) cur = b;
      b.innerHTML = (locked ? '🔒' : n) + '<span class="st">' + (locked ? '' : '★'.repeat(st) + '☆'.repeat(3 - st)) + '</span>';
      if (!locked) (function (num) { b.onclick = function () { startLevel(num); }; })(n);
      else b.onclick = function () { A.play('error'); };
      frag.appendChild(b);
    }
    if (frag !== g) g.appendChild(frag);
    if (cur && cur.scrollIntoView) setTimeout(function () { cur.scrollIntoView({ block: 'center' }); }, 30);   // jump to your current level
  }
  function startLevel(n) {
    showGame();
    global.Game.start(n);
  }

  /* ------------------------------------------------ shop */
  function buildShop() {
    var l = $('shopList'); l.innerHTML = ''; refreshCoins();
    UPGRADES.forEach(function (u) {
      var lvl = Save.data.upgrades[u.id] || 0, max = lvl >= MAX_UP, cost = upCost(lvl);
      var d = doc.createElement('div'); d.className = 'card up';
      var pips = ''; for (var i = 0; i < MAX_UP; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      d.innerHTML = '<div class="ico">' + u.icon + '</div><div class="info"><div class="nm">' + u.name + ' <small>Lv ' + lvl + '</small></div><div class="ds">' + u.desc + '</div><div class="lv">' + pips + '</div></div>';
      var b = doc.createElement('button'); b.className = 'small ' + (max ? 'gray' : 'yellow');
      b.style.color = max ? '#fff' : '#3a2600';
      b.innerHTML = max ? 'MAX' : '<span class="coinIcon"></span> ' + cost;
      b.disabled = max || Save.data.coins < cost;
      b.onclick = function () {
        if (Save.data.coins < cost || lvl >= MAX_UP) { A.play('error'); return; }
        Save.data.coins -= cost; Save.data.upgrades[u.id] = lvl + 1; Save.save(); A.play('upgrade'); buildShop();
      };
      d.appendChild(b); l.appendChild(d);
    });
  }

  /* ------------------------------------------------ settings */
  function syncSettings() {
    var s = A.settings;
    $('musicVol').value = Math.round(s.music * 100); $('sfxVol').value = Math.round(s.sfx * 100);
    $('pMusic').value = $('musicVol').value; $('pSfx').value = $('sfxVol').value;
    var mm = $('musicMute'), sm = $('sfxMute');
    mm.textContent = s.musicMuted ? '🔇' : '🔊'; mm.classList.toggle('off', s.musicMuted);
    sm.textContent = s.sfxMuted ? '🔇' : '🔊'; sm.classList.toggle('off', s.sfxMuted);
    $('fpsToggle').classList.toggle('on', !!Save.data.fps30);
  }
  function bindSettings() {
    var testT = null;
    function sfxTest() { clearTimeout(testT); testT = setTimeout(function () { A.play('coin'); }, 120); }
    $('musicVol').addEventListener('input', function () { A.setMusicVolume(this.value / 100); if (A.settings.musicMuted && this.value > 0) A.setMusicMuted(false); syncSettings(); });
    $('sfxVol').addEventListener('input', function () { A.setSfxVolume(this.value / 100); if (A.settings.sfxMuted && this.value > 0) A.setSfxMuted(false); syncSettings(); sfxTest(); });
    $('pMusic').addEventListener('input', function () { A.setMusicVolume(this.value / 100); syncSettings(); });
    $('pSfx').addEventListener('input', function () { A.setSfxVolume(this.value / 100); syncSettings(); sfxTest(); });
    $('musicMute').onclick = function () { A.setMusicMuted(!A.settings.musicMuted); syncSettings(); };
    $('sfxMute').onclick = function () { A.setSfxMuted(!A.settings.sfxMuted); syncSettings(); if (!A.settings.sfxMuted) A.play('click'); };
    $('fpsToggle').onclick = function () { Save.data.fps30 = !Save.data.fps30; Save.save(); syncSettings(); };
    $('resetBtn').onclick = function () {
      if (global.confirm('Reset all progress, coins and upgrades?')) { Save.reset(); A.play('back'); refreshCoins(); show('menu'); }
    };
  }

  /* ------------------------------------------------ flow */
  function onResult(r) {
    $('rTitle').textContent = r.win ? 'LEVEL ' + r.level + ' COMPLETE!' : 'GAME OVER';
    $('rTitle').style.color = r.win ? '#7dff9a' : '#ff7a6a';
    var s = ''; for (var i = 0; i < 3; i++) s += '<span class="' + (i < r.stars ? '' : 'off') + '">★</span>';
    $('rStars').innerHTML = r.win ? s : '💀';
    $('rScore').textContent = r.score; $('rBest').textContent = r.best; $('rKills').textContent = r.kills;
    $('rCrowd').textContent = r.crowd; $('rCoins').textContent = r.coins;
    $('rNext').style.display = r.win && r.level < Lv.count ? '' : 'none';
    $('rRetry').firstChild.nodeValue = '↻ RETRY';
    screens.forEach(function (n) { $(n).classList.toggle('hidden', n !== 'result'); });
    current = 'result';
  }

  function bind() {
    $('mPlay').onclick = function () { startLevel(Math.min(Lv.count, Save.data.unlocked)); };
    $('mLevels').onclick = function () { show('levels'); };
    $('mShop').onclick = function () { shopReturn = 'menu'; show('shop'); };
    $('mSettings').onclick = function () { show('settings'); };
    var backs = doc.querySelectorAll('[data-back]');
    for (var i = 0; i < backs.length; i++) backs[i].onclick = function () { A.play('back'); show(shopReturn === 'result' && current === 'shop' ? 'menu' : 'menu'); shopReturn = 'menu'; };

    $('btnPause').onclick = function () { global.Game.pause(); };
    global.Game.onPause = function () { syncSettings(); screens.forEach(function (n) { $(n).classList.toggle('hidden', n !== 'pause'); }); current = 'pause'; };
    $('pResume').onclick = function () { showGame(); global.Game.resume(); };
    $('pRestart').onclick = function () { showGame(); global.Game.state = 'playing'; global.Game.restart(); };
    $('pMenu').onclick = function () { global.Game.quit(); show('menu'); };

    global.Game.onEnd = onResult;
    $('rNext').onclick = function () { startLevel(Math.min(Lv.count, global.Game.currentLevel() + 1)); };
    $('rRetry').onclick = function () { showGame(); global.Game.restart(); };
    $('rShop').onclick = function () { global.Game.quit(); shopReturn = 'result'; show('shop'); };
    $('rMenu').onclick = function () { global.Game.quit(); show('menu'); };

    // button sounds (one delegated listener = works for every button, incl. dynamically built ones)
    doc.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || b.disabled) return;
      if (b.classList.contains('lvl') && b.classList.contains('locked')) return;
      if (b.hasAttribute('data-back') || b.id === 'resetBtn' || b.classList.contains('up')) return;
      if (b.parentNode && b.parentNode.classList.contains('up')) return;
      if (b.id === 'btnPause' || b.id === 'pResume') { A.play('menu'); return; }
      A.play(b.classList.contains('big') || b.classList.contains('lvl') ? 'menu' : 'click');
    }, true);
    bindSettings();
  }

  /* ------------------------------------------------ boot */
  function boot() {
    Save.load(); A.init();
    if (!global.THREE) {
      $('loadText').textContent = 'Could not load Three.js. Put three.min.js into the lib/ folder (see README).';
      return;
    }
    global.Game.init($('gl'));
    bind();
    A.load(function (p) { $('loadFill').style.width = Math.round(p * 100) + '%'; $('loadText').textContent = 'Loading audio ' + Math.round(p * 100) + '%'; })
      .then(function () {
        $('loadFill').style.width = '100%';
        setTimeout(function () { show('menu'); }, 250);
      });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
