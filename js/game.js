/* Crowd Battle 3D - core game logic | TK Sadhan */
(function (global) {
  'use strict';
  var THREE = global.THREE, Gfx = global.Gfx, A = global.GameAudio, Save = global.GameSave, Lv = global.GameLevels;

  var TRACK_W = 8, HALF = TRACK_W / 2, ROW_GAP = 17, START_Z = -22;
  var MAXB = 10, MAXE = 10, BULLET_CAP = 80, PART_CAP = 140, FLY_CAP = 20;   // only 10 soldiers are drawn per crowd (the number label still shows the real count)
  var UNIT_S = 0.5, C_P = 0.3, C_E = 0.2;
  // enemies shot from further away than KILL_RANGE can be hurt but never killed: a horde keeps FAR_KEEP of its size until it is close
  var KILL_RANGE = 13, FAR_KEEP = 0.3, LANES = 5, LANE_W = (TRACK_W - 1.0) / LANES;
  // boss hammer swing (arm angle in radians; 0 = arm hanging down, PI = straight up)
  var HAMMER_REST = 2.7, HAMMER_BACK = 3.5, HAMMER_HIT = 0.9, BOSS_STOP = 6.1, BOSS_REACH = 4.8, BOSS_SPEED = 1.6, ENEMY_SPEED = 3.8;

  var Game = { state: 'idle', onEnd: null };
  var renderer, scene, camera, canvas, ready = false;
  var S = null;              // per-level state
  var shared = {};           // geometries/materials reused between levels
  var dummy, vec3, lastT = 0, frameAcc = 0, slowTime = 0, perfDowngraded = false;
  var hud = {};

  /* =============================================================== init */
  Game.init = function (cv) {
    canvas = cv;
    try { if (global.document.fonts && global.document.fonts.load) global.document.fonts.load('96px "Lilita One"'); } catch (e) {}   // game font for the gate numbers
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance', alpha: false });
    camera = new THREE.PerspectiveCamera(58, 1, 0.1, 140);
    Game.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
    dummy = new THREE.Object3D(); vec3 = new THREE.Vector3();
    shared.blueGeo = Gfx.soldierGeometry('blue'); shared.redGeo = Gfx.soldierGeometry('red');
    shared.soldierMat = Gfx.soldierMaterial();
    shared.bulletGeo = new THREE.BoxGeometry(0.09, 0.09, 0.8);
    shared.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    shared.partGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    shared.partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    shared.coin = Gfx.coinAssets();   // shiny gold coin, no shadow / halo under it
    hud.count = document.getElementById('crowdCount'); hud.coins = document.getElementById('hudCoins');
    hud.level = document.getElementById('hudLevel'); hud.bar = document.getElementById('progFill');
    hud.float = document.getElementById('floaters'); hud.elabels = [];
    for (var i = 0; i < 4; i++) hud.elabels.push(document.getElementById('el' + i));
    Game.resize();
    global.addEventListener('resize', Game.resize);
    global.addEventListener('orientationchange', function () { setTimeout(Game.resize, 250); });
    bindInput();
    ready = true;
    requestAnimationFrame(loop);
  };
  Game.setPixelRatio = function (r) { renderer.setPixelRatio(r); Game.resize(); };
  Game.resize = function () {
    if (!renderer) return;
    var w = global.innerWidth, h = global.innerHeight;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.fov = h / w > 1.2 ? 62 : 52; camera.updateProjectionMatrix();
  };

  /* =============================================================== input */
  var drag = { on: false, x: 0 }, keys = { l: false, r: false };
  function bindInput() {
    var el = global.document;
    function down(x) { drag.on = true; drag.x = x; }
    function move(x) {
      if (!drag.on || !S) return;
      var dx = x - drag.x; drag.x = x;
      S.crowd.tx += dx * (TRACK_W / global.innerWidth) * 1.9;
    }
    function up() { drag.on = false; }
    el.addEventListener('touchstart', function (e) { if (e.target.closest && e.target.closest('.ui')) return; down(e.touches[0].clientX); }, { passive: true });
    el.addEventListener('touchmove', function (e) { move(e.touches[0].clientX); }, { passive: true });
    el.addEventListener('touchend', up, { passive: true }); el.addEventListener('touchcancel', up, { passive: true });
    el.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('.ui')) return; down(e.clientX); });
    el.addEventListener('mousemove', function (e) { move(e.clientX); });
    el.addEventListener('mouseup', up);
    el.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = true; if (e.key === 'ArrowRight' || e.key === 'd') keys.r = true; });
    el.addEventListener('keyup', function (e) { if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = false; if (e.key === 'ArrowRight' || e.key === 'd') keys.r = false; });
    el.addEventListener('visibilitychange', function () { if (document.hidden && Game.state === 'playing') Game.pause(); });
  }

  /* =============================================================== level build */
  function disposeLevel() {
    if (!S) return;
    S.objects.forEach(function (o) { scene.remove(o); if (o.geometry && o.userData.own) o.geometry.dispose(); });
    S = null;
  }
  function formation(count, c, stretch) {
    var o = new Array(count), i;
    for (i = 0; i < count; i++) {
      var r = c * Math.sqrt(i + 0.5), a = i * 2.39996;
      o[i] = [Math.cos(a) * r * (stretch || 1), Math.sin(a) * r];
    }
    return o;
  }
  function makeCrowdMesh(geo, cap) {
    var m = new THREE.InstancedMesh(geo, shared.soldierMat, cap);
    m.frustumCulled = false; m.count = 0; return m;
  }

  Game.start = function (levelNum) {
    if (!ready) return;
    disposeLevel();
    var lv = Lv.get(levelNum), theme = Lv.themes[lv.theme], save = Save.data, up = save.upgrades;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 38, 105);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.95));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(-5, 14, 8); scene.add(sun);

    var rows = lv.rows, total = 0, zi;
    for (zi = 0; zi < rows.length; zi++) total += (rows[zi].gap === undefined ? ROW_GAP : rows[zi].gap);
    var finishZ = START_Z - total - 24;
    var objects = [];
    S = {
      lv: lv, num: levelNum, theme: theme, t: 0, intro: 1.8, objects: objects, finishZ: finishZ,
      crowd: { x: 0, tx: 0, z: 0, n: 5 + up.startCrowd * 3, v: 0, offs: formation(MAXB, C_P) },
      groups: [], gates: [], coins: [], barrels: [], bullets: [], parts: [], floaters: 0,
      stats: { kills: 0, coins: 0, gateBest: 0 }, fireT: 0, stepT: 0, volley: 0, melee: 0, recoil: 0, shock: 0, ringT: 0, flyers: [],
      boss: null, bossActive: false, endT: 0, result: null, shake: 0, camOrbit: 0, started: false,
      tutorial: levelNum === 1
    };
    S.startN = S.crowd.n;
    objects.push.apply(objects, Gfx.buildScenery(scene, theme, -finishZ + 60, TRACK_W));
    objects.push(Gfx.buildFinish(scene, finishZ, TRACK_W, theme));

    // player crowd mesh
    S.blue = makeCrowdMesh(shared.blueGeo, MAXB); scene.add(S.blue); objects.push(S.blue);
    // bullets
    S.bulletMesh = new THREE.InstancedMesh(shared.bulletGeo, shared.bulletMat, BULLET_CAP); S.bulletMesh.frustumCulled = false; S.bulletMesh.count = 0;
    scene.add(S.bulletMesh); objects.push(S.bulletMesh);
    for (var b = 0; b < BULLET_CAP; b++) S.bullets.push({ on: false, x: 0, y: 0, z: 0, life: 0 });
    // particles
    S.partMesh = new THREE.InstancedMesh(shared.partGeo, shared.partMat, PART_CAP); S.partMesh.frustumCulled = false; S.partMesh.count = 0;
    S.partMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(S.partMesh); objects.push(S.partMesh);
    // soldiers launched into the air by the boss hammer
    S.flyMesh = new THREE.InstancedMesh(shared.blueGeo, shared.soldierMat, FLY_CAP); S.flyMesh.frustumCulled = false; S.flyMesh.count = 0;
    scene.add(S.flyMesh); objects.push(S.flyMesh);
    // hammer shockwave ring
    S.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffe0a8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    S.ring.rotation.x = -Math.PI / 2; S.ring.visible = false; scene.add(S.ring); objects.push(S.ring);

    // rows
    var gateW = TRACK_W / 2 - 0.25, accZ = START_Z;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], z = accZ;
      accZ -= (r.gap === undefined ? ROW_GAP : r.gap);
      if (r.t === 'gates') {
        [[r.l, -1], [r.r, 1]].forEach(function (p) {
          var label = p[0], side = p[1], gx = side * (TRACK_W / 4);
          var mesh = new THREE.Mesh(new THREE.PlaneGeometry(gateW - 0.2, 2.1), new THREE.MeshBasicMaterial({ map: Gfx.gateTexture(label), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          mesh.position.set(gx, 1.7, z); scene.add(mesh); objects.push(mesh);
          var post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.9, 0.2), new THREE.MeshLambertMaterial({ color: 0xdfe6ee }));
          post.position.set(gx - side * 0 + side * (gateW / 2 - 0.05), 1.45, z); scene.add(post); objects.push(post);
          var post2 = post.clone(); post2.position.x = gx - side * (gateW / 2 - 0.05); scene.add(post2); objects.push(post2);
          var strip = new THREE.Mesh(new THREE.BoxGeometry(gateW, 0.18, 0.2), new THREE.MeshLambertMaterial({ color: 0xdfe6ee }));
          strip.position.set(gx, 2.9, z); scene.add(strip); objects.push(strip);
          S.gates.push({ label: label, side: side, z: z, x: gx, done: false, mesh: mesh });
        });
        S.gates[S.gates.length - 1].pairEnd = true;
      } else if (r.t === 'enemy') {
        addGroup(r.n, r.x, z, r.w, objects);
      } else if (r.t === 'coins') {
        for (var c = 0; c < r.n; c++) {
          var cn = Gfx.coin(shared.coin); cn.position.set(r.x * 1.4, 0, z + (r.n - 1) * 0.7 - c * 1.4);
          scene.add(cn); objects.push(cn); S.coins.push({ m: cn, got: false, ph: c });
        }
      } else if (r.t === 'barrel') {
        var bm = Gfx.barrel(); bm.position.set(r.x * 1.2, 0, z); scene.add(bm); objects.push(bm);
        S.barrels.push({ m: bm, z: z, x: bm.position.x, alive: true });
      }
    }
    // final enemies / boss
    if (lv.boss) {
      var boss = Gfx.buildBoss(lv.boss.variant || 0); boss.scale.set(1.15, 1.15, 1.15); boss.position.set(0, 0, finishZ - 26); boss.rotation.y = Math.PI;   // face the crowd
      scene.add(boss); objects.push(boss);
      S.boss = { m: boss, hp: lv.boss.hp, max: lv.boss.hp, dmg: lv.boss.dmg, z: finishZ - 26, x: 0, phase: 'walk', pt: 0, cool: 0.6, dead: false, walk: 0, ang: HAMMER_REST };
    } else if (lv.finalEnemy) {
      addGroup(lv.finalEnemy, 0, finishZ - 6, 3.6, objects);
    }

    S.crowd.z = 0; S.crowd.x = 0; S.crowd.tx = 0;
    camera.position.set(0, 11, 18); camera.lookAt(0, 0, -12);
    hud.level.textContent = 'LEVEL ' + levelNum; hud.coins.textContent = '0';
    hud.elabels.forEach(function (e) { e.className = 'elabel'; e.style.display = 'none'; });
    hud.count.style.display = 'none'; hud.float.innerHTML = '';
    Game.state = 'playing'; S.paused = false; lastT = performance.now();
    document.getElementById('tutorial').style.display = S.tutorial ? 'flex' : 'none';
    A.playMusic('bgm_game'); A.play('countdown');
  };

  // An enemy group is a horde that fills the WHOLE road width (never wider: nobody leaves the road).
  // offs are ordered front row -> back row, so shots eat the horde from the front.
  function addGroup(n, x, z, w, objects) {
    var vis = Math.min(n, MAXE), usable = TRACK_W - 1.0, offs = [], r, j;
    var cols = Math.max(8, Math.min(14, Math.ceil(Math.sqrt(vis * 3.2)))), rowsN = Math.ceil(vis / cols);
    var base = Math.floor(vis / rowsN), extra = vis - base * rowsN;
    for (r = 0; r < rowsN; r++) {
      var cnt = base + (r < extra ? 1 : 0);
      for (j = 0; j < cnt; j++) {
        var px = -usable / 2 + (j + 0.5) * usable / cnt + (Math.random() - 0.5) * 0.14;
        offs.push([Math.max(-usable / 2, Math.min(usable / 2, px)), -r * 0.62 + (Math.random() - 0.5) * 0.18]);
      }
    }
    // the horde is split into LANES (left ... right). A bullet only hurts the lane it flies into.
    var lk = [], ln0 = [], ln = [], l, rem;
    for (l = 0; l < LANES; l++) { lk.push(0); ln0.push(0); }
    for (j = 0; j < offs.length; j++) { l = Math.min(LANES - 1, Math.max(0, Math.floor((offs[j][0] + usable / 2) / usable * LANES))); offs[j][2] = l; offs[j][3] = lk[l]++; }
    for (l = 0; l < LANES; l++) ln0[l] = Math.floor(n * lk[l] / vis);
    rem = n; for (l = 0; l < LANES; l++) rem -= ln0[l];
    for (l = 0; rem > 0; l = (l + 1) % LANES) if (lk[l] > 0) { ln0[l]++; rem--; }
    for (l = 0; l < LANES; l++) ln.push(ln0[l]);
    var mesh = makeCrowdMesh(shared.redGeo, vis); scene.add(mesh); objects.push(mesh);
    S.groups.push({ n: n, n0: n, x: 0, z: z, vis0: vis, offs: offs, mesh: mesh, active: false, hpf: 0, ph: Math.random() * 6, lk: lk, ln0: ln0, ln: ln });
  }

  /* =============================================================== helpers */
  function visCount(n) { return Math.min(n, MAXB); }
  function radiusP() { return C_P * Math.sqrt(visCount(S.crowd.n)) + 0.35; }
  // z of the front row of a horde (largest z = closest to the player). Front rows disappear first.
  function laneVis(g, l) { return g.ln[l] <= 0 ? 0 : Math.min(g.lk[l], Math.ceil(g.lk[l] * g.ln[l] / g.ln0[l])); }   // drawn soldiers of a lane shrink with that lane's health
  function laneOf(g, x) { return Math.max(0, Math.min(LANES - 1, Math.floor((x - g.x + (TRACK_W - 1.0) / 2) / LANE_W))); }
  function laneX(l) { return -(TRACK_W - 1.0) / 2 + (l + 0.5) * LANE_W; }
  function laneFront(g, l) {   // z of the front-most visible soldier in a lane
    var best = -1e9, v = laneVis(g, l), k;
    for (k = 0; k < g.offs.length; k++) { var o = g.offs[k]; if (o[2] === l && o[3] < v) best = Math.max(best, g.z + o[1]); }
    return best;
  }
  function frontZ(g) { var best = -1e9, l; for (l = 0; l < LANES; l++) if (g.ln[l] > 0) best = Math.max(best, laneFront(g, l)); return best < -1e8 ? g.z : best; }
  // soldiers lost by contact / explosions / leaving the road: spread over the lanes in proportion
  function takeLanes(g, loss) {
    var n0 = g.n, l, rem = loss, kl;
    for (l = 0; l < LANES && rem > 0; l++) { kl = Math.min(g.ln[l], rem, Math.ceil(loss * g.ln[l] / Math.max(1, n0))); g.ln[l] -= kl; rem -= kl; }
    for (l = 0; l < LANES && rem > 0; l++) { kl = Math.min(g.ln[l], rem); g.ln[l] -= kl; rem -= kl; }
    g.n -= (loss - rem);
  }
  function bulletDamage() { return (1 + S.crowd.n / 60) * (1 + 0.22 * Save.data.upgrades.damage); }
  function fireInterval() { return 0.2 / (1 + 0.14 * Save.data.upgrades.fireRate); }
  function addCoins(n) { S.stats.coins += n; hud.coins.textContent = S.stats.coins; }

  function burst(x, y, z, n, color, spd, up) {
    for (var i = 0; i < n; i++) {
      var p = S.parts;
      if (p.length >= PART_CAP) return;
      p.push({ x: x, y: y, z: z, vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.8 + (up || 1), vz: (Math.random() - 0.5) * spd, life: 0.5 + Math.random() * 0.4, s: 0.5 + Math.random() * 0.9, c: color });
    }
  }
  function floatText(text, cls) {
    if (S.floaters > 6) return;
    S.floaters++;
    var p = project(S.crowd.x, 2.4, S.crowd.z);
    if (!p) return;
    var d = document.createElement('div'); d.className = 'floater ' + (cls || ''); d.textContent = text;
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; hud.float.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); if (S) S.floaters--; }, 900);
  }
  function project(x, y, z) {
    vec3.set(x, y, z).project(camera);
    if (vec3.z > 1 || vec3.z < -1) return null;
    return { x: (vec3.x + 1) / 2 * global.innerWidth, y: (1 - vec3.y) / 2 * global.innerHeight };
  }

  function applyGate(g) {
    var lab = g.label, op = lab.charAt(0), v = parseInt(lab.replace(/[^0-9]/g, ''), 10), c = S.crowd, before = c.n;
    if (op === '+') c.n += v; else if (op === 'x') c.n *= v; else if (op === '/') c.n = Math.max(1, Math.floor(c.n / v)); else c.n = Math.max(0, c.n - v);
    c.n = Math.min(c.n, 99999);
    var diff = c.n - before;
    if (diff > 0) {
      A.gate(op === 'x' ? Math.min(99, diff) : Math.min(99, v));
      burst(c.x, 1, c.z, 14, 0x6ad0ff, 6, 3); floatText('+' + diff, 'good');
    } else {
      A.play('gate_bad'); A.play('enemy_hit', { volume: 0.8 });
      burst(c.x, 1, c.z, 12, 0xff5a4a, 6, 3); floatText(String(diff), 'bad');
      S.shake = Math.max(S.shake, 0.3);
    }
    g.mesh.visible = false;
  }

  function explode(x, z, big) {
    A.play(big ? 'explosion_big' : 'explosion', { volume: big ? 1 : 0.9 });
    burst(x, 0.8, z, big ? 34 : 22, 0xffa526, big ? 12 : 9, 4); burst(x, 0.8, z, 12, 0x555555, 6, 2);
    S.shake = Math.max(S.shake, big ? 0.9 : 0.55);
  }

  // damage to ONE lane (a bullet) - or, with lane < 0, spread over the lanes near bx (an explosion)
  function damageGroup(g, k, lane, bx) {
    var l;
    if (lane < 0) {
      var W = 0; for (l = 0; l < LANES; l++) if (Math.abs(laneX(l) - bx) < 2.6) W += g.ln[l];
      if (W <= 0) return;
      for (l = 0; l < LANES; l++) if (Math.abs(laneX(l) - bx) < 2.6 && g.ln[l] > 0) damageGroup(g, Math.ceil(k * g.ln[l] / W), l);
      return;
    }
    if (S.crowd.z - laneFront(g, lane) > KILL_RANGE) k = Math.min(k, g.ln[lane] - Math.max(1, Math.ceil(g.ln0[lane] * FAR_KEEP)));   // far away: hurts, never kills
    k = Math.min(k, g.ln[lane]); if (k <= 0) return;
    g.ln[lane] -= k; g.n -= k; S.stats.kills += k; S.stats.bonusAcc = (S.stats.bonusAcc || 0) + k;
    if (S.stats.bonusAcc >= 8) { var c = Math.floor(S.stats.bonusAcc / 8); S.stats.bonusAcc -= c * 8; addCoins(c); }
    burst(laneX(lane) + (Math.random() - 0.5) * 0.8, 0.9, laneFront(g, lane) + 0.3, Math.min(6, k), 0xe5322d, 5, 2);
  }

  /* =============================================================== update */
  function update(dt) {
    var c = S.crowd, i, j;
    S.t += dt;
    var introDone = S.t > S.intro;
    if (S.result) { endUpdate(dt); return; }
    if (!introDone) { c.z -= dt * 3; }
    else {
      if (!S.started) { S.started = true; A.play('go'); }
      if (S.tutorial && S.t > S.intro + 3) { S.tutorial = false; document.getElementById('tutorial').style.display = 'none'; }
      var speed = 7.2, hold = S.finishZ + 3;
      if (S.boss && !S.boss.dead) hold = Math.max(hold, S.boss.m.position.z + BOSS_STOP + 1);   // never walk into the boss
      c.z = Math.max(c.z - speed * dt, Math.min(c.z, hold));   // the road scrolls towards the crowd; it stops at the hold line (never dragged backwards)
      if (keys.l) c.tx -= 7 * dt; if (keys.r) c.tx += 7 * dt;
    }
    var R = radiusP(), lim = Math.max(0.3, HALF - 0.45 - C_P * Math.sqrt(visCount(c.n)));   // whole crowd stays on the road
    c.tx = Math.max(-lim, Math.min(lim, c.tx));
    c.x += (c.tx - c.x) * Math.min(1, dt * 10);

    // the crowd stands still; the only footsteps are the enemy horde / boss marching at you
    S.stepT -= dt; S.recoil = Math.max(0, S.recoil - dt * 8); S.shock = Math.max(0, S.shock - dt);
    if (S.stepT <= 0 && introDone && !S.result) {
      var near = nearestEnemyDist();
      if (near < 40) { S.stepT = 0.3; A.play('footstep', { volume: 0.2 + 0.45 * (1 - near / 40), jitter: 0.25, rate: 0.7 }); }
    }

    // auto fire
    S.fireT -= dt;
    var hasTarget = hasTargetAhead();
    if (S.fireT <= 0 && introDone && c.n > 0) {
      S.fireT = fireInterval();
      var nb = Math.min(8, 2 + Math.floor(Math.sqrt(c.n) / 3) + Save.data.upgrades.range);
      var spread = Math.min(TRACK_W - 1.2, 2.0 + 0.3 * Math.sqrt(c.n));   // a bigger crowd sprays a wider fan of bullets (covers more lanes)
      for (var k = 0; k < nb; k++) spawnBullet(Math.max(-(HALF - 0.4), Math.min(HALF - 0.4, c.x + (Math.random() - 0.5) * spread)), c.z - 0.4);
      S.volley++; S.recoil = 1;
      if (hasTarget) A.play(c.n > 150 && S.volley % 3 === 0 ? 'shoot_heavy' : 'shoot', { volume: 0.55, jitter: 0.15 });
    }
    updateBullets(dt);

    // gates
    for (i = 0; i < S.gates.length; i++) {
      var g = S.gates[i];
      if (!g.done && c.z <= g.z) {
        // the gate on the side where the crowd centre is gets applied; the pair is resolved once
        var mate = S.gates[i + (g.pairEnd ? -1 : 1)];
        var chosen = (c.x < 0) ? (g.side < 0 ? g : mate) : (g.side > 0 ? g : mate);
        g.done = true; if (mate) mate.done = true;
        if (chosen) { applyGate(chosen); if (mate && mate !== chosen) mate.mesh.visible = false; }
      }
    }
    // coins
    for (i = 0; i < S.coins.length; i++) {
      var cn = S.coins[i]; if (cn.got) continue;
      cn.m.rotation.y += dt * 4; cn.m.position.y = Math.sin(S.t * 4 + cn.ph) * 0.08;
      if (Math.abs(cn.m.position.z - c.z) < 0.9 && Math.abs(cn.m.position.x - c.x) < R + 0.6) {
        cn.got = true; cn.m.visible = false; addCoins(1);
        A.play('coin', { rate: 1 + Math.min(0.5, S.stats.coins * 0.01) });
        burst(cn.m.position.x, 0.8, cn.m.position.z, 4, 0xffd21f, 3, 2);
      }
    }
    // barrels touched by the crowd
    for (i = 0; i < S.barrels.length; i++) {
      var bar = S.barrels[i]; if (!bar.alive) continue;
      if (Math.abs(bar.z - c.z) < 0.9 && Math.abs(bar.x - c.x) < R + 0.5) blowBarrel(bar, true);
    }

    updateGroups(dt, R);
    updateBoss(dt, R);

    // defeat / victory checks
    if (c.n <= 0 && !S.result) return finish(false);
    if (!S.result && c.z <= S.finishZ + 3) {
      var alive = S.groups.some(function (g) { return g.n > 0; }) || (S.boss && !S.boss.dead);
      if (!alive) finish(true);
    }
    // progress
    hud.bar.style.width = Math.max(0, Math.min(100, (-c.z) / (-S.finishZ) * 100)) + '%';
  }

  function nearestEnemyDist() {
    var c = S.crowd, best = 999, i;
    for (i = 0; i < S.groups.length; i++) { var g = S.groups[i]; if (g.n > 0 && g.active) best = Math.min(best, c.z - frontZ(g)); }
    if (S.boss && !S.boss.dead && S.bossActive) best = Math.min(best, c.z - S.boss.m.position.z);
    return best;
  }
  function hasTargetAhead() {
    var c = S.crowd, i;
    for (i = 0; i < S.groups.length; i++) { var g = S.groups[i]; if (g.n > 0 && g.z < c.z && c.z - g.z < 36) return true; }
    if (S.boss && !S.boss.dead && c.z - S.boss.z < 40) return true;
    return false;
  }

  function spawnBullet(x, z) {
    for (var i = 0; i < S.bullets.length; i++) {
      var b = S.bullets[i];
      if (!b.on) { b.on = true; b.x = x; b.y = 0.7; b.z = z; b.life = 1.1; return; }
    }
  }
  function blowBarrel(bar, byPlayer) {
    bar.alive = false; bar.m.visible = false; explode(bar.x, bar.z, false);
    var c = S.crowd;
    S.groups.forEach(function (g) {
      if (g.n <= 0) return;
      if (Math.abs(g.z - bar.z) < 7 && Math.abs(g.x - bar.x) < 5) damageGroup(g, Math.ceil(g.n * 0.45 + 12), -1, bar.x);
    });
    if (Math.hypot(c.x - bar.x, c.z - bar.z) < 3.8) {
      var loss = Math.ceil(c.n * 0.1); c.n = Math.max(0, c.n - loss); floatText('-' + loss, 'bad');
    }
  }

  function updateBullets(dt) {
    var m = S.bulletMesh, cnt = 0, bd = bulletDamage(), i, j;
    for (i = 0; i < S.bullets.length; i++) {
      var b = S.bullets[i]; if (!b.on) continue;
      var prevZ = b.z; b.z -= 46 * dt; b.life -= dt;
      var hit = false;
      for (j = 0; j < S.groups.length && !hit; j++) {
        var g = S.groups[j]; if (g.n <= 0) continue;
        var ln = laneOf(g, b.x); if (g.ln[ln] <= 0) continue;   // that lane is empty: the bullet flies on to the next horde
        var fz = laneFront(g, ln);
        if (b.z <= fz + 0.4 && prevZ >= fz - 2.5) {   // only the lane the bullet flies into is hurt, and only when it reaches that lane's front soldier
          g.hpf += bd; var k = Math.floor(g.hpf); g.hpf -= k;
          if (k > 0) damageGroup(g, k, ln);
          A.play('hit', { volume: 0.5, jitter: 0.3 }); if (g.n <= 0) { A.play('enemy_hit', { volume: 0.9 }); }
          burst(b.x, 0.8, b.z, 2, 0xffe27a, 3, 1); hit = true;
        }
      }
      if (!hit) for (j = 0; j < S.barrels.length; j++) {
        var bar = S.barrels[j];
        if (bar.alive && Math.abs(b.z - bar.z) < 0.7 && Math.abs(b.x - bar.x) < 0.8) { blowBarrel(bar, false); hit = true; break; }
      }
      if (!hit && S.boss && !S.boss.dead) {
        var bo = S.boss;
        if (Math.abs(b.z - bo.m.position.z) < 2.0 && Math.abs(b.x - bo.m.position.x) < 4.2) {
          bo.hp -= bd * 1.2; hit = true; bo.flash = 0.08;
          A.play('hit', { volume: 0.55, jitter: 0.3 }); burst(b.x, 2 + Math.random() * 2, b.z, 2, 0xffe27a, 3, 1);
          if (bo.hp <= 0) killBoss();
        }
      }
      if (hit || b.life <= 0) { b.on = false; continue; }
      dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      m.setMatrixAt(cnt++, dummy.matrix);
    }
    m.count = cnt; m.instanceMatrix.needsUpdate = true;
  }

  function updateGroups(dt, R) {
    var c = S.crowd, i, k, labelIdx = 0;
    for (i = 0; i < S.groups.length; i++) {
      var g = S.groups[i], m = g.mesh;
      if (g.n <= 0) { if (g.mesh.visible) { g.mesh.visible = false; A.play('destroy', { volume: 0.7 }); } continue; }
      var fz = frontZ(g), dz = c.z - fz; // positive while the horde is ahead of the crowd
      if (dz < -8) { g.n = 0; g.ln = g.ln.map(function () { return 0; }); m.visible = false; continue; }
      if (dz > 80) { m.visible = false; continue; }
      m.visible = true;
      if (!g.active && dz < 26 && S.started) { g.active = true; if (S.t - (S.lastAtk || -9) > 0.9) { S.lastAtk = S.t; A.play('enemy_attack', { volume: 0.8 }); } }
      if (g.active) {
        if (fz < c.z - R * 0.9) g.z += ENEMY_SPEED * dt;   // the whole horde marches down the road towards the crowd
        else {                                       // contact: melee
          S.melee -= dt;
          if (S.melee <= 0) {
            S.melee = 0.11;
            var loss = Math.max(1, Math.ceil(Math.min(g.n, c.n) * 0.25));
            loss = Math.min(loss, g.n, c.n);
            takeLanes(g, loss); c.n -= loss; S.stats.kills += loss;
            A.play('enemy_attack', { volume: 0.7, jitter: 0.2 }); A.play('hit', { volume: 0.7, jitter: 0.3 });
            burst(c.x + (Math.random() - 0.5) * 3, 0.9, c.z - R * 0.8, 5, 0xe5322d, 5, 2); burst(c.x, 0.9, c.z - 0.4, 3, 0x2f8bff, 4, 2);
            S.shake = Math.max(S.shake, 0.18);
            if (g.n <= 0) { explode(c.x, c.z - R, false); }
          }
        }
      }
      // write instances (front rows are removed first as the horde is shot)
      var cntV = 0;
      for (k = 0; k < g.offs.length; k++) {
        var o = g.offs[k]; if (o[3] >= laneVis(g, o[2])) continue;
        var ph = g.ph + k * 1.7, bob = g.active ? Math.abs(Math.sin(S.t * 11 + ph)) * 0.12 : Math.sin(S.t * 2 + ph) * 0.02;
        dummy.position.set(o[0], bob, g.z + o[1]);
        dummy.rotation.set(0, Math.PI, g.active ? Math.sin(S.t * 11 + ph) * 0.1 : 0);
        dummy.scale.set(UNIT_S * 1.08, UNIT_S * 1.08, UNIT_S * 1.08); dummy.updateMatrix(); m.setMatrixAt(cntV++, dummy.matrix);
      }
      m.count = cntV;
      m.instanceMatrix.needsUpdate = true;
      if (labelIdx < 3 && dz > 0 && dz < 45) { setLabel(labelIdx++, g.n, 0, fz - 1); }
    }
    for (; labelIdx < 3; labelIdx++) hud.elabels[labelIdx].style.display = 'none';
  }
  function setLabel(idx, n, x, z, re) {
    var el = hud.elabels[idx], p = project(x, 2.0, z + 0.2);
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    var t = String(n); if (el.textContent !== t) el.textContent = t;
  }

  function easeIn(k) { return k * k; }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function updateBoss(dt, R) {
    var bo = S.boss; if (!bo) return;
    var c = S.crowd, m = bo.m, k;
    if (bo.dead) { return; }
    var d = c.z - m.position.z, ang = HAMMER_REST;
    if (!S.bossActive && d < 66) {
      S.bossActive = true; scene.fog.near = 60; scene.fog.far = 140; A.playMusic('bgm_boss'); A.play('boss_roar', { volume: 1 }); S.shake = 0.9; floatText('BOSS!', 'bad');
    }
    if (S.bossActive && S.started) {
      if (bo.phase === 'walk') {                      // marches at the crowd with the hammer raised
        ang = HAMMER_REST + Math.sin(bo.walk) * 0.1;
        if (d > BOSS_STOP) { m.position.z += BOSS_SPEED * dt; bo.walk += dt * (BOSS_SPEED * 5 / 3); }
        else { bo.cool -= dt; if (bo.cool <= 0) { bo.phase = 'wind'; bo.pt = 0; A.play('boss_roar', { volume: 0.55 }); } }
      } else if (bo.phase === 'wind') {               // lifts the hammer back over his head
        bo.pt += dt; k = Math.min(1, bo.pt / 0.6); ang = HAMMER_REST + (HAMMER_BACK - HAMMER_REST) * easeOut(k);
        if (k >= 1) { bo.phase = 'smash'; bo.pt = 0; }
      } else if (bo.phase === 'smash') {              // fast downward swing
        bo.pt += dt; k = Math.min(1, bo.pt / 0.16); ang = HAMMER_BACK + (HAMMER_HIT - HAMMER_BACK) * easeIn(k);
        if (k >= 1) { bossSmash(); bo.phase = 'recover'; bo.pt = 0; }
      } else {                                        // recover
        bo.pt += dt; k = Math.min(1, bo.pt / 0.9); ang = HAMMER_HIT + (HAMMER_REST - HAMMER_HIT) * k;
        if (k >= 1) { bo.phase = 'walk'; bo.cool = 0.5; }
      }
      m.position.x += (c.x - m.position.x) * Math.min(1, dt * 0.8);
      m.position.x = Math.max(-1.3, Math.min(1.3, m.position.x));   // boss + hammer stay on the road
    }
    bo.ang = ang;
    m.armR.rotation.x = ang; m.armL.rotation.x = Math.min(2.2, ang * 0.7);
    m.legL.rotation.x = Math.sin(bo.walk) * 0.5; m.legR.rotation.x = -Math.sin(bo.walk) * 0.5;
    m.position.y = Math.abs(Math.sin(bo.walk)) * 0.12;
    if (bo.phase === 'recover' && bo.pt < 0.15) m.position.y = -0.08;
    if (bo.flash > 0) { bo.flash -= dt; m.scale.setScalar(1.15 + 0.02); } else m.scale.setScalar(1.15);
    // boss label
    var el = hud.elabels[3], p = project(m.position.x, 9.2, m.position.z);
    if (p && S.bossActive) { el.style.display = 'block'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.textContent = 'BOSS ' + Math.max(0, Math.ceil(bo.hp)); el.className = 'elabel boss'; }
  }
  // the hammer lands: shockwave + soldiers are flung into the air
  function bossSmash() {
    var bo = S.boss, m = bo.m, c = S.crowd, ix = m.position.x, iz = m.position.z + BOSS_REACH;
    var loss = c.n;   // one smash wipes out the WHOLE crowd: the boss has to be killed before his hammer lands
    launchSoldiers(Math.min(MAXB, loss), ix, iz);
    c.n -= loss;
    S.shock = 0.65; S.shake = 1.2;
    S.ringT = 0.6; S.ring.visible = true; S.ring.position.set(ix, 0.08, iz);
    A.play('explosion_big', { volume: 1 }); A.play('enemy_attack', { volume: 1 }); A.play('enemy_hit', { volume: 0.9 });
    burst(ix, 0.6, iz, 32, 0xffb04a, 10, 4); burst(ix, 0.3, iz, 26, 0x9aa0aa, 7, 2.5);
    if (loss > 0) floatText('-' + loss, 'bad');
  }
  function launchSoldiers(count, ix, iz) {
    var c = S.crowd, vis = Math.max(1, visCount(c.n)), i;
    for (i = 0; i < count && S.flyers.length < FLY_CAP; i++) {
      var o = c.offs[Math.floor(Math.random() * vis)], px = c.x + o[0], pz = c.z + o[1];
      var dx = px - ix, dz = pz - iz, dl = Math.max(0.6, Math.hypot(dx, dz));
      S.flyers.push({ x: px, y: 0.4, z: pz, vx: dx / dl * 3 + (Math.random() - 0.5) * 2, vy: 10 + Math.random() * 8, vz: dz / dl * 3 + 2 + Math.random() * 3,
        rx: 0, ry: 0, rz: 0, sx: (Math.random() - 0.5) * 16, sy: (Math.random() - 0.5) * 10, sz: (Math.random() - 0.5) * 16, life: 1.4 + Math.random() * 0.4 });
    }
  }
  function updateFlyers(dt) {
    var f = S.flyers, m = S.flyMesh, n = 0, i;
    for (i = 0; i < f.length; i++) {
      var q = f[i]; q.life -= dt;
      if (q.life <= 0) { f[i] = f[f.length - 1]; f.pop(); i--; continue; }
      q.vy -= 24 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.2 && q.vy < 0) { q.y = 0.2; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      q.x = Math.max(-(HALF - 0.25), Math.min(HALF - 0.25, q.x));   // even flying soldiers stay above the road
      q.rx += q.sx * dt; q.ry += q.sy * dt; q.rz += q.sz * dt;
      var s = UNIT_S * Math.min(1, q.life * 3);
      dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(q.rx, q.ry, q.rz); dummy.scale.set(s, s, s); dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n; m.instanceMatrix.needsUpdate = true;
    if (S.ringT > 0) {
      S.ringT -= dt; var k = 1 - Math.max(0, S.ringT) / 0.6;
      S.ring.scale.set(1 + k * 8, 1 + k * 8, 1); S.ring.material.opacity = (1 - k) * 0.8;
      if (S.ringT <= 0) S.ring.visible = false;
    }
  }
  function killBoss() {
    var bo = S.boss; bo.dead = true; bo.hp = 0; explode(bo.m.position.x, bo.m.position.z, true);
    A.play('destroy'); A.play('explosion_big', { volume: 1, delay: 0.25 }); burst(bo.m.position.x, 3, bo.m.position.z, 40, 0xff7a2a, 14, 5);
    bo.m.visible = false; hud.elabels[3].style.display = 'none'; hud.elabels[3].className = 'elabel';
    addCoins(25 + S.num * 3);
  }

  /* =============================================================== crowd + fx rendering */
  function renderCrowd(dt) {
    var c = S.crowd, v = visCount(c.n), m = S.blue, k, ending = S.result;
    var nVis = v;
    m.count = nVis;
    var scale = UNIT_S * (ending === 'lose' ? Math.max(0, 1 - S.endT * 1.3) : 1);
    var edge = HALF - 0.25;
    for (k = 0; k < nVis; k++) {
      var o = c.offs[k], ph = k * 1.3, bob = 0, sway = 0, yaw = 0, kick = 0;
      if (ending === 'win') { bob = 0; yaw = 0; }   // victory: no jumping, the crowd just stands
      else if (ending === 'lose') { bob = -S.endT * 0.2; sway = S.endT * 1.2; }
      else {
        // standing and firing: tiny breathing + gun recoil, no running
        sway = Math.sin(S.t * 3 + ph) * 0.02; kick = S.recoil * 0.1;
        if (S.shock > 0) bob = Math.sin(Math.min(1, S.shock / 0.65) * Math.PI) * 0.45 * (0.6 + 0.4 * ((k * 7) % 5) / 5);   // hop when the hammer lands
      }
      dummy.position.set(Math.max(-edge, Math.min(edge, c.x + o[0])), Math.max(0, bob), c.z + o[1] + 0.3 + kick);
      dummy.rotation.set(0, yaw, sway); dummy.scale.set(scale, scale, scale); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    // count label
    var lab = project(c.x, 1.9 + radiusP() * 0.25, c.z);
    if (lab && !ending) { hud.count.style.display = 'block'; hud.count.style.left = lab.x + 'px'; hud.count.style.top = lab.y + 'px'; var t = String(c.n); if (hud.count.textContent !== t) hud.count.textContent = t; }
    else if (ending === 'win' && lab) { hud.count.style.display = 'block'; hud.count.style.left = lab.x + 'px'; hud.count.style.top = lab.y + 'px'; }
    else hud.count.style.display = 'none';
  }
  function updateParts(dt) {
    var p = S.parts, m = S.partMesh, col = new THREE.Color(), n = 0, i;
    for (i = 0; i < p.length; i++) {
      var q = p[i]; q.life -= dt; if (q.life <= 0) { p[i] = p[p.length - 1]; p.pop(); i--; continue; }
      q.vy -= 18 * dt; q.x += q.vx * dt; q.y = Math.max(0.02, q.y + q.vy * dt); q.z += q.vz * dt;
      dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(q.life * 6, q.life * 4, 0);
      var s = q.s * Math.min(1, q.life * 3); dummy.scale.set(s, s, s); dummy.updateMatrix();
      m.setMatrixAt(n, dummy.matrix); col.setHex(q.c); m.setColorAt(n, col); n++;
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /* =============================================================== camera */
  function updateCamera(dt) {
    var c = S.crowd, R = radiusP(), t = S.t, shakeX = 0, shakeY = 0;
    if (S.shake > 0) { shakeX = (Math.random() - 0.5) * S.shake * 0.6; shakeY = (Math.random() - 0.5) * S.shake * 0.4; S.shake = Math.max(0, S.shake - dt * 2.2); }
    var tx, ty, tz, lx, ly, lz;
    if (S.result === 'win') {
      S.camOrbit += dt * 0.7;
      tx = c.x + Math.sin(S.camOrbit) * (7 + R); tz = c.z + Math.cos(S.camOrbit) * (7 + R); ty = 3.6 + R * 0.4;
      lx = c.x; ly = 1.0; lz = c.z;
    } else if (S.result === 'lose') {
      tx = c.x; ty = 7 + S.endT; tz = c.z + 9; lx = c.x; ly = 0.5; lz = c.z - 2;
    } else if (S.t < S.intro) {
      var k = S.t / S.intro; k = k * k * (3 - 2 * k);
      tx = c.x + (1 - k) * -6; ty = 4 + (1 - k) * 10 + k * (6.5 + R * 0.5); tz = c.z - 14 * (1 - k) + k * (9.5 + R * 0.6);
      lx = c.x; ly = 0.5; lz = c.z - 12 - (1 - k) * 8;
    } else {
      tx = c.x * 0.55; ty = 6.8 + R * 0.55; tz = c.z + 10 + R * 0.7; lx = c.x * 0.45; ly = 0.6; lz = c.z - 9;
      if (S.bossActive && S.boss && !S.boss.dead) { ty += 2.6; tz += 3.5; lz -= 5; ly = 1.6; }
    }
    var f = S.result === 'win' ? 1 : Math.min(1, dt * 6);
    camera.position.x += (tx - camera.position.x) * f; camera.position.y += (ty - camera.position.y) * f; camera.position.z += (tz - camera.position.z) * f;
    camera.position.x += shakeX; camera.position.y += shakeY;
    camera.lookAt(lx, ly, lz);
  }

  /* =============================================================== end of level */
  function finish(win) {
    S.result = win ? 'win' : 'lose'; S.endT = 0;
    var c = S.crowd, save = Save.data;
    A.stopMusic(0.4);
    if (win) {
      A.play('victory', { volume: 1 });
      var ratio = c.n / Math.max(1, S.startN);
      var stars = ratio >= 6 ? 3 : ratio >= 2 ? 2 : 1;
      var score = S.stats.kills * 10 + S.stats.coins * 5 + c.n * 3 + (S.boss ? 500 : 0);
      var bonus = Math.round((25 + S.num * 6) * (1 + 0.15 * save.upgrades.income));
      var coins = Math.round(S.stats.coins * (1 + 0.15 * save.upgrades.income)) + bonus;
      save.coins += coins; save.totalKills += S.stats.kills;
      save.unlocked = Math.max(save.unlocked, Math.min(Lv.count, S.num + 1));
      save.stars[S.num] = Math.max(save.stars[S.num] || 0, stars);
      save.best[S.num] = Math.max(save.best[S.num] || 0, score);
      Save.save();
      S.summary = { win: true, level: S.num, stars: stars, score: score, coins: coins, kills: S.stats.kills, crowd: c.n, best: save.best[S.num] };
      burst(c.x, 2, c.z, 40, 0xffd21f, 10, 6);
    } else {
      A.play('gameover', { volume: 1 }); A.play('explosion', { volume: 0.6 });
      var cons = Math.round(S.stats.coins * 0.5); save.coins += cons; save.totalKills += S.stats.kills; Save.save();
      S.summary = { win: false, level: S.num, stars: 0, score: S.stats.kills * 10, coins: cons, kills: S.stats.kills, crowd: 0, best: save.best[S.num] || 0 };
    }
  }
  function endUpdate(dt) {
    S.endT += dt;
    if (S.result === 'win' && S.endT > 0.3 && Math.random() < 0.15) burst(S.crowd.x + (Math.random() - 0.5) * 5, 3, S.crowd.z + (Math.random() - 0.5) * 5, 6, [0xffd21f, 0x6ad0ff, 0xff6a9a][Math.floor(Math.random() * 3)], 7, 6);
    if (!S.shown && S.endT > (S.result === 'win' ? 1.8 : 1.4)) {
      S.shown = true; Game.state = 'ended'; hud.count.style.display = 'none';
      if (Game.onEnd) Game.onEnd(S.summary);
    }
  }

  /* =============================================================== control */
  Game.pause = function () { if (Game.state !== 'playing' || !S || S.result) return; Game.state = 'paused'; if (Game.onPause) Game.onPause(true); };
  Game.resume = function () { if (Game.state !== 'paused') return; Game.state = 'playing'; lastT = performance.now(); };
  Game.restart = function () { if (S) Game.start(S.num); };
  Game.quit = function () { A.stopMusic(0.3); Game.state = 'idle'; if (S) { hud.count.style.display = 'none'; hud.elabels.forEach(function (e) { e.style.display = 'none'; }); } };
  Game.currentLevel = function () { return S ? S.num : 1; };
  Game.hasLevel = function () { return !!S; };
  Game._debug = function () { return S; };   // used by tools/headless-test.js

  /* =============================================================== main loop */
  function loop(now) {
    requestAnimationFrame(loop);
    if (!S || !scene) return;
    var dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
    if (Save.data.fps30) { frameAcc += dt; if (frameAcc < 1 / 31) return; dt = frameAcc; frameAcc = 0; }
    if (Game.state === 'playing' || Game.state === 'ended') {
      update(dt);
      renderCrowd(dt); updateParts(dt); updateFlyers(dt); updateCamera(dt);
    }
    renderer.render(scene, camera);
    // adaptive quality for slow devices
    if (!perfDowngraded && Game.state === 'playing') {
      slowTime = dt > 0.034 ? slowTime + dt : Math.max(0, slowTime - dt * 0.5);
      if (slowTime > 2.5) { perfDowngraded = true; Game.setPixelRatio(0.75); }
    }
  }

  global.Game = Game;
})(window);
