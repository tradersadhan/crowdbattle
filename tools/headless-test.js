#!/usr/bin/env node
/* Headless logic test for Crowd Battle 3D (no browser / WebGL needed).
 * A tiny THREE + DOM mock lets the real game code run, so this catches runtime errors
 * and gives a rough balance report: an "auto-pilot" steers to the best gate on every level.
 *   node tools/headless-test.js [maxLevel]
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '..');

/* ---------- THREE mock ---------- */
function V3() { this.x = 0; this.y = 0; this.z = 0; }
V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
V3.prototype.project = function () { this.x = 0; this.y = 0; this.z = 0.5; return this; };
V3.prototype.setScalar = function (s) { return this.set(s, s, s); };
V3.prototype.copy = function () { return this; };
function Col(c) { this.r = 1; this.g = 1; this.b = 1; }
Col.prototype = { set: function () { return this; }, setHex: function () { return this; }, getHexString: function () { return 'ffffff'; },
  clone: function () { return new Col(); }, multiplyScalar: function () { return this; }, offsetHSL: function () { return this; } };
function Geo() {
  var self = this;
  this.attributes = { position: { count: 3, array: new Float32Array(9) }, normal: { array: new Float32Array(9) } };
  this.index = null;
}
Geo.prototype = { clone: function () { return new Geo(); }, applyMatrix4: function () { return this; }, toNonIndexed: function () { return this; },
  dispose: function () {}, setAttribute: function () {} };
function Obj() { this.position = new V3(); this.rotation = new V3(); this.scale = new V3().set(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.matrix = {}; }
Obj.prototype = { add: function (c) { this.children.push(c); }, updateMatrix: function () {}, clone: function () { return new Obj(); },
  lookAt: function () {}, updateProjectionMatrix: function () {} };
function Mesh(g, m) { Obj.call(this); this.geometry = g; this.material = m; }
Mesh.prototype = Object.create(Obj.prototype);
function Inst(g, m, n) { Mesh.call(this, g, m); this.count = n; this.instanceMatrix = {}; this.instanceColor = {}; }
Inst.prototype = Object.create(Mesh.prototype);
Inst.prototype.setMatrixAt = function () {}; Inst.prototype.setColorAt = function () {};
function Group() { Obj.call(this); }
Group.prototype = Object.create(Obj.prototype);
function Scene() { Obj.call(this); this.remove = function () {}; }
Scene.prototype = Object.create(Obj.prototype);
var THREE = {
  Vector3: V3, Color: Col, Object3D: Obj, Mesh: Mesh, InstancedMesh: Inst, Group: Group, Scene: Scene,
  Quaternion: function () { this.setFromEuler = function () { return this; }; }, Euler: function () {},
  Matrix4: function () { this.compose = function () { return this; }; },
  BufferGeometry: Geo, BufferAttribute: function () {},
  BoxGeometry: Geo, SphereGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, PlaneGeometry: Geo, RingGeometry: Geo, CircleGeometry: Geo,
  MeshLambertMaterial: function () {}, MeshBasicMaterial: function () {},
  CanvasTexture: function () { this.repeat = new V3(); }, Fog: function () {}, HemisphereLight: Obj, DirectionalLight: Obj,
  PerspectiveCamera: function () { Obj.call(this); this.updateProjectionMatrix = function () {}; this.lookAt = function () {}; },
  WebGLRenderer: function () { this.setPixelRatio = function () {}; this.setSize = function () {}; this.render = function () {}; },
  RepeatWrapping: 1, NearestFilter: 1, DoubleSide: 2
};

/* ---------- DOM / window mock ---------- */
function El() { var s = this; this.style = {}; this.className = ''; this.textContent = ''; this.innerHTML = ''; this.children = [];
  this.classList = { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } };
  this.appendChild = function (c) { s.children.push(c); }; this.parentNode = null; this.addEventListener = function () {};
  this.getContext = function () { return new Proxy({}, { get: function (t, k) { return k === 'measureText' ? function () { return { width: 10 }; } : function () {}; }, set: function () { return true; } }); };
  this.width = 0; this.height = 0; }
var els = {};
var doc = { getElementById: function (id) { return els[id] || (els[id] = new El()); }, createElement: function () { return new El(); },
  addEventListener: function () {}, hidden: false, readyState: 'complete', querySelectorAll: function () { return []; } };
var rafCb = null, fakeNow = 0;
var win = { THREE: THREE, document: doc, innerWidth: 400, innerHeight: 800, devicePixelRatio: 1, addEventListener: function () {},
  requestAnimationFrame: function (cb) { rafCb = cb; }, localStorage: (function () { var m = {}; return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = v; } }; })(),
  confirm: function () { return true; }, navigator: {}, location: { protocol: 'file:' }, setTimeout: setTimeout, clearTimeout: clearTimeout };
win.window = win;
var ctx = vm.createContext(Object.assign(win, { console: console, performance: { now: function () { return fakeNow; } }, Promise: Promise, fetch: function () { return Promise.reject(new Error('no net')); },
  setTimeout: setTimeout, clearTimeout: clearTimeout, Math: Math, JSON: JSON, requestAnimationFrame: win.requestAnimationFrame, localStorage: win.localStorage, document: doc, navigator: win.navigator, location: win.location }));
['storage', 'audio', 'levels', 'gfx', 'game'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }); });

var Game = ctx.Game, Save = ctx.GameSave, Lv = ctx.GameLevels;
Save.load(); Game.init(new El());
var results = [], maxLevel = +process.argv[2] || 1000, errors = 0;

function step() { fakeNow += 1000 / 60; rafCb(fakeNow); }
// LEVELS=1,2,50,1000 node tools/headless-test.js   -> test only these levels (default: a spread of 1..1000)
var list = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500, 650, 800, 900, 999, 1000].filter(function (x) { return x <= maxLevel; });
for (var li = 0; li < list.length; li++) {
  var n = list[li];
  Save.data.unlocked = 99; Game.state = 'idle';
  try {
    Game.start(n);
    var S = Game._debug(), frames = 0, summary = null;
    Game.onEnd = function (r) { summary = r; };
    while (!summary && frames < 60 * 300) {
      // auto-pilot: steer to the better upcoming gate
      var best = null;
      for (var i = 0; i < S.gates.length; i += 2) {
        var a = S.gates[i], b = S.gates[i + 1];
        if (!a.done && a.z < S.crowd.z) { if (S.crowd.z - a.z > 14) break; var va = val(a.label, S.crowd.n), vb = val(b.label, S.crowd.n); best = process.env.WORST ? (va >= vb ? b.side : a.side) : (va >= vb ? a.side : b.side); break; }
      }
      if (best !== null) S.crowd.tx = best * 2;
      else {
        // otherwise aim at the fullest lane of the nearest horde (like a player would swipe), else centre
        S.crowd.tx = 0;
        var near = null;
        S.groups.forEach(function (g) { if (g.n > 0 && g.z < S.crowd.z && (!near || g.z > near.z)) near = g; });
        if (near && S.crowd.z - near.z < 40) { var bl = 0; for (var q = 1; q < near.ln.length; q++) if (near.ln[q] > near.ln[bl]) bl = q; S.crowd.tx = -3.5 + (bl + 0.5) * 7 / near.ln.length; }
      }
      step(); frames++;
      if (process.env.TRACE && frames % 60 === 0) console.log('  t=' + frames / 60 + 's z=' + S.crowd.z.toFixed(0) + ' crowd=' + S.crowd.n + (S.boss ? ' bossHp=' + Math.ceil(S.boss.hp) : '') + ' enemiesAlive=' + S.groups.filter(function (g) { return g.n > 0; }).length);
    }
    results.push({ level: n, win: summary ? summary.win : null, crowd: summary ? summary.crowd : S.crowd.n, startN: S.startN, kills: S.stats.kills, coins: S.stats.coins, t: (frames / 60).toFixed(0) + 's', boss: !!S.boss, bossHp: S.boss ? Math.ceil(S.boss.hp) + '/' + S.boss.max : '-', est: Lv.get(n).estCrowd });
  } catch (e) { errors++; console.log('ERROR level', n, e.stack); }
}
function val(l, n) { var o = l.charAt(0), v = parseInt(l.replace(/[^0-9]/g, ''), 10); return o === '+' ? v : o === 'x' ? n * (v - 1) : o === '/' ? -Math.floor(n - n / v) : -v; }
console.table(results);
var wins = results.filter(function (r) { return r.win; }).length;
console.log('levels simulated:', results.length, ' auto-pilot wins:', wins, ' runtime errors:', errors);
process.exit(errors ? 1 : 0);
