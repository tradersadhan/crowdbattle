#!/usr/bin/env node
/* Browser smoke test: real Chromium + real Web Audio, stubbed Three.js (no WebGL needed).
 *   node tools/browser-test.js          -> prints results, saves screenshots to ./test-shots
 * Checks: page loads, 28 audio files decode, audio unlocks on first tap, independent music/SFX mute + volume,
 * settings persist after reload, sounds fire during play, pause/result screens, no console errors.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var playwright = require('playwright');
var root = path.join(__dirname, '..'), shots = path.join(root, 'test-shots');
fs.mkdirSync(shots, { recursive: true });
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png' };
var server = http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  var f = path.join(root, p);
  if (f.indexOf(root) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
var fails = 0;
function check(name, ok, extra) { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : '')); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

server.listen(0, async function () {
  var url = 'http://localhost:' + server.address().port + '/';
  var browser = await playwright.chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  var useStub = !fs.existsSync(path.join(root, 'lib', 'three.min.js'));
  if (useStub) await ctx.route('**/lib/three.min.js', function (r) { r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'three-stub.js'), 'utf8') }); });
  console.log(useStub ? '(lib/three.min.js not present -> using stub THREE: 3D is not rendered in this test)' : '(real Three.js found)');
  var page = await ctx.newPage(), errors = [];
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.goto(url); await page.waitForSelector('#menu:not(.hidden)', { timeout: 15000 });
  check('menu visible after loading', true);
  await page.screenshot({ path: path.join(shots, '1-menu.png') });

  var n = await page.evaluate(function () { return Object.keys(GameAudio.buffers).length; });
  check('all 28 audio files decoded', n === 28, n + '/28');
  var allNames = await page.evaluate(function () { return Object.keys(GameAudio.buffers); });

  await page.tap('#mSettings'); await sleep(300);
  var st = await page.evaluate(function () { return { unlocked: GameAudio.unlocked, state: GameAudio.ctx.state, music: !!GameAudio._music }; });
  check('audio unlocked + running after first tap', st.unlocked && st.state === 'running', JSON.stringify(st));
  check('menu music playing', st.music);
  await page.screenshot({ path: path.join(shots, '2-settings.png') });

  // independent controls
  await page.evaluate(function () { var m = document.getElementById('musicVol'); m.value = 30; m.dispatchEvent(new Event('input')); var s = document.getElementById('sfxVol'); s.value = 70; s.dispatchEvent(new Event('input')); });
  await page.tap('#musicMute'); await sleep(400);
  var g = await page.evaluate(function () { return { m: GameAudio.musicGain.gain.value, s: GameAudio.sfxGain.gain.value, st: GameAudio.settings }; });
  check('music muted -> music bus 0, SFX bus unchanged', g.m < 0.01 && Math.abs(g.s - 0.7) < 0.02, 'music=' + g.m.toFixed(2) + ' sfx=' + g.s.toFixed(2));
  await page.tap('#musicMute'); await page.tap('#sfxMute'); await sleep(400);
  g = await page.evaluate(function () { return { m: GameAudio.musicGain.gain.value, s: GameAudio.sfxGain.gain.value }; });
  check('sfx muted -> sfx bus 0, music bus back at 0.30', g.s < 0.01 && Math.abs(g.m - 0.3) < 0.02, 'music=' + g.m.toFixed(2) + ' sfx=' + g.s.toFixed(2));
  var played = await page.evaluate(function () { return GameAudio.play('coin'); });
  check('muted SFX do not play', played === null);
  await page.tap('#sfxMute'); await sleep(200);
  played = await page.evaluate(function () { return !!GameAudio.play('coin'); });
  check('unmuted SFX play', played);
  await page.screenshot({ path: path.join(shots, '3-settings-changed.png') });

  await page.reload(); await page.waitForSelector('#menu:not(.hidden)');
  var saved = await page.evaluate(function () { return GameAudio.settings; });
  check('audio settings persisted after reload', Math.abs(saved.music - 0.3) < 0.001 && Math.abs(saved.sfx - 0.7) < 0.001 && !saved.musicMuted && !saved.sfxMuted, JSON.stringify(saved));

  // levels / shop screens
  await page.tap('#mLevels'); await sleep(200); await page.screenshot({ path: path.join(shots, '4-levels.png') });
  await page.tap('#levels [data-back]'); await sleep(100);
  await page.evaluate(function () { GameSave.data.coins = 500; GameSave.save(); });
  await page.tap('#mShop'); await sleep(200); await page.screenshot({ path: path.join(shots, '5-shop.png') });
  await page.tap('#shopList .up button >> nth=0'); await sleep(200);
  var up = await page.evaluate(function () { return { coins: GameSave.data.coins, fr: GameSave.data.upgrades.fireRate }; });
  check('shop purchase works (coins spent, upgrade level up)', up.fr === 1 && up.coins < 500, JSON.stringify(up));
  await page.tap('#shop [data-back]'); await sleep(100);

  // gameplay: record every sound the game asks for
  await page.evaluate(function () { window.__sfx = {}; var o = GameAudio.play; GameAudio.play = function (n) { __sfx[n] = (__sfx[n] || 0) + 1; return o.apply(this, arguments); }; var om = GameAudio.playMusic; window.__mus = []; GameAudio.playMusic = function (n) { __mus.push(n); return om.apply(this, arguments); }; });
  await page.tap('#mPlay'); await sleep(2500);
  await page.screenshot({ path: path.join(shots, '6-game-hud.png') });
  // steer with a real touch-drag and auto-play for a while, always taking the better gate
  for (var i = 0; i < 40; i++) {
    await page.evaluate(function () {
      var S = Game._debug(); if (!S) return;
      for (var k = 0; k < S.gates.length; k += 2) { var a = S.gates[k], b = S.gates[k + 1]; if (!a.done && a.z < S.crowd.z) { S.crowd.tx = (parseInt(a.label.replace(/\D/g, '')) * (a.label[0] === 'x' ? S.crowd.n : 1) >= parseInt(b.label.replace(/\D/g, '')) * (b.label[0] === 'x' ? S.crowd.n : 1) ? a.side : b.side) * 2; break; } }
    });
    await sleep(500);
    var ended = await page.evaluate(function () { return Game.state === 'ended'; }); if (ended) break;
  }
  var sfx = await page.evaluate(function () { return window.__sfx; });
  console.log('   sounds triggered during play:', JSON.stringify(sfx));
  ['footstep', 'shoot', 'hit', 'enemy_attack', 'gate', 'coin'].forEach(function (k) { check('gameplay triggers "' + k + '"', (sfx[k] || 0) > 0, sfx[k] || 0); });
  check('gate join sounds triggered', (sfx.join_small || 0) + (sfx.join_medium || 0) + (sfx.join_large || 0) > 0);
  check('explosion/destroy sounds triggered', (sfx.explosion || 0) + (sfx.destroy || 0) > 0);

  await page.tap('#btnPause'); await sleep(300); await page.screenshot({ path: path.join(shots, '7-pause.png') });
  var paused = await page.evaluate(function () { return Game.state; }); check('pause works', paused === 'paused');
  await page.tap('#pResume'); await sleep(200);
  check('resume works', (await page.evaluate(function () { return Game.state; })) === 'playing');
  await page.tap('#btnPause'); await sleep(200); await page.tap('#pRestart'); await sleep(300);
  check('restart works', (await page.evaluate(function () { return Game.state + ':' + Game._debug().t.toFixed(0); })).indexOf('playing') === 0);

  // force win and lose to check result screens + stingers
  await page.evaluate(function () { Game._debug().crowd.n = 0; }); await sleep(2200);
  await page.screenshot({ path: path.join(shots, '8-gameover.png') });
  sfx = await page.evaluate(function () { return window.__sfx; });
  check('game over sound triggered', (sfx.gameover || 0) > 0);
  check('result screen shown', await page.isVisible('#result'));
  await page.tap('#rRetry'); await sleep(500);
  await page.evaluate(function () { var S = Game._debug(); S.crowd.z = S.finishZ + 3; S.groups.forEach(function (g) { g.n = 0; }); }); await sleep(2600);
  await page.screenshot({ path: path.join(shots, '9-victory.png') });
  sfx = await page.evaluate(function () { return window.__sfx; });
  check('victory sound triggered', (sfx.victory || 0) > 0);
  var prog = await page.evaluate(function () { return GameSave.data; });
  check('progress saved (level 2 unlocked, coins awarded)', prog.unlocked >= 2 && prog.coins > 0, 'unlocked=' + prog.unlocked + ' coins=' + prog.coins);

  // ---- road containment + boss hammer (level 4 has a boss): jump the crowd next to the boss and watch the swings
  await page.evaluate(function () { Game.start(4); });
  await sleep(2600);
  await page.evaluate(function () { var S = Game._debug(); S.crowd.n = 400; S.boss.hp = S.boss.max = 1e9; S.crowd.z = S.finishZ + 14; window.__boss = { maxFly: 0, smashes: 0, maxBossX: 0, minAng: 9, maxAng: 0, offRoad: 0, lastPhase: '' };
    window.__bt = setInterval(function () { var S = Game._debug(), b = S.boss, B = window.__boss; if (!b) return;
      B.maxFly = Math.max(B.maxFly, S.flyers.length); B.maxBossX = Math.max(B.maxBossX, Math.abs(b.m.position.x)); B.minAng = Math.min(B.minAng, b.ang); B.maxAng = Math.max(B.maxAng, b.ang);
      if (b.phase === 'recover' && B.lastPhase !== 'recover') B.smashes++; B.lastPhase = b.phase;
      S.groups.forEach(function (g) { g.offs.forEach(function (o) { if (Math.abs(o[0]) > 3.5) B.offRoad++; }); });
      S.flyers.forEach(function (f) { if (Math.abs(f.x) > 3.76) B.offRoad++; });
      var half = 0.17 * Math.sqrt(Math.min(S.crowd.n, 150)); if (Math.abs(S.crowd.x) + half > 4) B.offRoad++; }, 40); });
  await page.mouse.move(100, 400); await sleep(9000);
  var bs = await page.evaluate(function () { clearInterval(window.__bt); var S = Game._debug(); window.__boss.crowd = S.crowd.n; window.__boss.bossHp = Math.round(S.boss.hp); window.__boss.dbg = { phase: S.boss.phase, cool: S.boss.cool, d: S.crowd.z - S.boss.m.position.z, bossZ: S.boss.m.position.z, cz: S.crowd.z, fz: S.finishZ, active: S.bossActive, started: S.started, state: Game.state, t: S.t }; return window.__boss; });
  console.log('   boss fight:', JSON.stringify(bs));
  await page.screenshot({ path: path.join(shots, '10-boss.png') });
  check('boss swings the hammer repeatedly', bs.smashes >= 2, bs.smashes + ' smashes');
  check('hammer arm sweeps from raised to ground', bs.maxAng > 3.3 && bs.minAng < 1.1, bs.minAng.toFixed(2) + '..' + bs.maxAng.toFixed(2));
  check('hammer launches soldiers into the air', bs.maxFly >= 10, bs.maxFly + ' flying');
  check('boss stays on the road', bs.maxBossX <= 1.31, bs.maxBossX.toFixed(2));
  check('nobody (enemies, crowd, flying soldiers) leaves the road', bs.offRoad === 0, bs.offRoad);

  check('no console / page errors', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
});
