/* Crowd Battle 3D - graphics builders (geometry, textures, scenery) | TK Sadhan
 * Everything is generated in code: no external model/texture files needed.
 * Soldiers are merged into ONE vertex-coloured geometry so a whole crowd is a single draw call.
 */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  var Gfx = {};

  /* ---------- geometry merge helper ---------- */
  function part(list, geo, color, x, y, z, sx, sy, sz, rx) {
    var q = new THREE.Quaternion();
    if (rx) q.setFromEuler(new THREE.Euler(rx, 0, 0));
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    var g = geo.clone();
    g.applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    list.push({ g: g, c: new THREE.Color(color) });
  }
  function merge(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].g.attributes.position.count;
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), o = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i].g, p = g.attributes.position.array, n = g.attributes.normal.array, c = list[i].c;
      for (var k = 0; k < p.length / 3; k++) {
        pos[(o + k) * 3] = p[k * 3]; pos[(o + k) * 3 + 1] = p[k * 3 + 1]; pos[(o + k) * 3 + 2] = p[k * 3 + 2];
        nor[(o + k) * 3] = n[k * 3]; nor[(o + k) * 3 + 1] = n[k * 3 + 1]; nor[(o + k) * 3 + 2] = n[k * 3 + 2];
        col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
      }
      o += g.attributes.position.count;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  /* ---------- soldier (blue player / red enemy) ---------- */
  Gfx.soldierGeometry = function (team) {
    var blue = team === 'blue', L = [];
    var body = blue ? 0x2f6fe0 : 0x8a1f1f, helmet = blue ? 0x2f8bff : 0xe5322d, skin = 0xf0c8a0, dark = 0x23283a;
    var box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 8, 6);
    part(L, box, dark, -0.11, 0.2, 0, 0.14, 0.4, 0.15);   // left leg
    part(L, box, dark, 0.11, 0.2, 0, 0.14, 0.4, 0.15);    // right leg
    part(L, box, body, 0, 0.6, 0, 0.44, 0.42, 0.28);      // torso
    part(L, box, body, -0.28, 0.6, -0.04, 0.12, 0.34, 0.14); // arms
    part(L, box, body, 0.28, 0.6, -0.06, 0.12, 0.34, 0.14);
    part(L, sph, skin, 0, 0.98, 0, 0.19, 0.19, 0.19);     // head
    part(L, sph, helmet, 0, 1.04, 0, 0.235, 0.2, 0.235);  // helmet
    part(L, box, dark, 0.2, 0.66, -0.26, 0.07, 0.08, 0.5);   // gun
    box.dispose(); sph.dispose();
    return merge(L);
  };
  Gfx.soldierMaterial = function () { return new THREE.MeshLambertMaterial({ vertexColors: true }); };

  /* ---------- boss: giant red-jacket brute ---------- */
  var BOSS_JACKETS = [0xa72c2c, 0x7a1f6e, 0x23232f, 0xb34a12, 0x5a1010, 0x8a2c5a];
  var BOSS_HAIR = [0xff8a1f, 0xffd21f, 0xe5322d, 0x38e0ff, 0xff6a9a, 0xf2f2f2];
  Gfx.buildBoss = function (variant) {
    var v = (variant || 0) % 6;
    var root = new THREE.Group(), mat = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    var jacket = mat(BOSS_JACKETS[v]), skin = mat(0xe3a77a), dark = mat(0x2a1a1a), hair = mat(BOSS_HAIR[v]), pants = mat(0x3a2a2a);
    function box(w, h, d, m, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; }
    var torso = box(2.6, 2.4, 1.6, jacket, 0, 3.0, 0); root.add(torso);
    root.add(box(1.0, 0.5, 0.2, mat(0xf2f2f2), 0, 3.5, -0.82)); // shirt
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), skin); head.position.set(0, 4.7, -0.1); root.add(head);
    var mo = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 6), hair); mo.position.set(0, 5.6, -0.1); root.add(mo);
    var eyeL = box(0.22, 0.14, 0.1, dark, -0.3, 4.8, -0.85), eyeR = box(0.22, 0.14, 0.1, dark, 0.3, 4.8, -0.85);
    root.add(eyeL); root.add(eyeR);
    root.add(box(0.7, 0.12, 0.1, dark, 0, 4.4, -0.88)); // mouth
    root.armL = new THREE.Group(); root.armR = new THREE.Group();
    root.armL.position.set(-1.7, 4.0, 0); root.armR.position.set(1.7, 4.0, 0);
    root.armL.add(box(0.9, 2.3, 0.9, jacket, 0, -1.0, 0)); root.armL.add(box(1.1, 1.0, 1.1, skin, 0, -2.4, 0));
    root.armR.add(box(0.9, 2.3, 0.9, jacket, 0, -1.0, 0)); root.armR.add(box(1.1, 1.0, 1.1, skin, 0, -2.4, 0));
    // giant hammer held in the right hand (swings with armR)
    var wood = mat(0x6b4423), steel = mat(0x8d97a6), steelDark = mat(0x4a5362), gold = mat(0xd9a520);
    var hammer = new THREE.Group();
    hammer.add(box(0.34, 3.2, 0.34, wood, 0, -3.7, 0));          // handle
    hammer.add(box(2.7, 1.6, 1.6, steel, 0, -5.4, 0));           // head
    hammer.add(box(2.9, 0.25, 1.75, steelDark, 0, -4.75, 0));    // top band
    hammer.add(box(2.9, 0.25, 1.75, steelDark, 0, -6.05, 0));    // bottom band
    hammer.add(box(0.5, 0.5, 1.8, gold, -1.45, -5.4, 0)); hammer.add(box(0.5, 0.5, 1.8, gold, 1.45, -5.4, 0)); // end caps
    root.armR.add(hammer); root.hammer = hammer;
    root.add(root.armL); root.add(root.armR);
    root.legL = new THREE.Group(); root.legR = new THREE.Group();
    root.legL.position.set(-0.7, 1.8, 0); root.legR.position.set(0.7, 1.8, 0);
    root.legL.add(box(1.0, 1.8, 1.0, pants, 0, -0.9, 0)); root.legR.add(box(1.0, 1.8, 1.0, pants, 0, -0.9, 0));
    root.add(root.legL); root.add(root.legR);
    root.head = head;
    return root;
  };

  /* ---------- gate textures ---------- */
  var gateTexCache = {};
  Gfx.gateStyle = function (label) {
    var c = label.charAt(0);
    if (c === '-' || c === '/') return { bg: '#e0443a', edge: '#ff9a8f' };
    if (c === 'x') return { bg: '#27c46b', edge: '#9bf0c0' };
    if (label === '+99') return { bg: '#ffd21f', edge: '#fff2a8', dark: true };
    if (label === '+10') return { bg: '#2b9bff', edge: '#a8d8ff' };
    return { bg: '#2f6fe0', edge: '#9ec0ff' };
  };
  Gfx.gateTexture = function (label) {
    if (gateTexCache[label]) return gateTexCache[label];
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    var g = cv.getContext('2d'), st = Gfx.gateStyle(label);
    g.fillStyle = st.bg; g.globalAlpha = 0.88; roundRect(g, 6, 6, 244, 148, 22); g.fill();
    g.globalAlpha = 1; g.lineWidth = 8; g.strokeStyle = st.edge; roundRect(g, 6, 6, 244, 148, 22); g.stroke();
    g.font = '96px "Lilita One", "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = st.dark ? '#7a5c00' : '#0b1b3a'; g.lineJoin = 'round';
    var txt = label.charAt(0) === 'x' ? '×' + label.slice(1) : label.charAt(0) === '/' ? '÷' + label.slice(1) : label;
    g.strokeText(txt, 128, 84); g.fillStyle = '#fff'; g.fillText(txt, 128, 84);
    var tex = new THREE.CanvasTexture(cv);
    gateTexCache[label] = tex;
    return tex;
  };
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ---------- track floor texture ---------- */
  Gfx.floorTexture = function (hex) {
    var cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    var g = cv.getContext('2d'), c = new THREE.Color(hex);
    g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, 64, 128);
    var d = c.clone().multiplyScalar(0.8);
    g.fillStyle = '#' + d.getHexString(); g.fillRect(0, 64, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(30, 0, 4, 40); g.fillRect(30, 64, 4, 40);   // lane dashes
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 0, 3, 128); g.fillRect(61, 0, 3, 128);   // edge lines
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  /* ---------- scenery ---------- */
  Gfx.buildScenery = function (scene, theme, length, trackW) {
    var out = [];
    // far ground
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(220, length + 200), new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(0.55) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -2.2, -length / 2); scene.add(ground); out.push(ground);
    // track
    var tex = Gfx.floorTexture(theme.floor); tex.repeat.set(1, length / 8);
    var track = new THREE.Mesh(new THREE.PlaneGeometry(trackW, length + 40), new THREE.MeshLambertMaterial({ map: tex }));
    track.rotation.x = -Math.PI / 2; track.position.set(0, 0, -length / 2 + 10); scene.add(track); out.push(track);
    // side rails
    var railMat = new THREE.MeshLambertMaterial({ color: theme.wall }), glow = new THREE.MeshBasicMaterial({ color: theme.accent });
    [-1, 1].forEach(function (s) {
      var r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, length + 40), railMat); r.position.set(s * (trackW / 2 + 0.25), 0.35, -length / 2 + 10); scene.add(r); out.push(r);
      var gl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, length + 40), glow); gl.position.set(s * (trackW / 2 + 0.25), 0.74, -length / 2 + 10); scene.add(gl); out.push(gl);
    });
    // pillars / buildings (single instanced mesh)
    var N = Math.min(240, Math.max(70, Math.round(length / 7))), geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var inst = new THREE.InstancedMesh(geo, mat, N), d = new THREE.Object3D(), col = new THREE.Color();
    var seed = 12345; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < N; i++) {
      var side = i % 2 ? 1 : -1, h = 2 + rnd() * 12, w = 2 + rnd() * 3;
      d.position.set(side * (trackW / 2 + 4 + rnd() * 14), h / 2 - 2.2, -rnd() * (length + 60) + 20);
      d.scale.set(w, h, w); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      col.set(theme.wall).offsetHSL(0, 0, (rnd() - 0.5) * 0.12); inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst); out.push(inst);
    return out;
  };

  /* ---------- finish line (flat on the ground only: nothing hangs over the road so the boss entrance is clear) ---------- */
  Gfx.buildFinish = function (scene, z, trackW, theme) {
    var g = new THREE.Group();
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
    var c = cv.getContext('2d');
    for (var i = 0; i < 16; i++) for (var j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 8, j * 8, 8, 8); }
    var tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(trackW, 1.6), new THREE.MeshBasicMaterial({ map: tex }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.02, 0); g.add(strip);
    g.position.set(0, 0, z); scene.add(g);
    return g;
  };

  /* ---------- misc meshes ---------- */
  Gfx.barrel = function () {
    var g = new THREE.Group();
    var b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), new THREE.MeshLambertMaterial({ color: 0xd8332b }));
    b.position.y = 0.55; g.add(b);
    var s = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.25, 12), new THREE.MeshLambertMaterial({ color: 0xffd21f }));
    s.position.y = 0.55; g.add(s);
    var t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    t.position.y = 1.15; g.add(t);
    return g;
  };
  // Shiny gold coin: bright textured faces + gold rim. No halo / shadow ring under it.
  Gfx.coinAssets = function () {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    var g = cv.getContext('2d'), i, a, r;
    g.fillStyle = '#b87400'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();      // dark outer edge
    g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();      // gold rim
    g.fillStyle = '#fff09a'; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fill();      // bright face
    g.fillStyle = '#ffc21a'; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.fill();      // inner disc
    g.fillStyle = '#fff6c4'; g.beginPath();                                                      // 8-point star (looks right at any rotation)
    for (i = 0; i < 16; i++) { a = i * Math.PI / 8; r = i % 2 ? 11 : 30; if (i) g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); else g.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.55; g.beginPath(); g.arc(46, 44, 9, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;   // shine
    var tex = new THREE.CanvasTexture(cv);
    var face = new THREE.MeshBasicMaterial({ map: tex }), side = new THREE.MeshBasicMaterial({ color: 0xe6a000 });
    return { geo: new THREE.CylinderGeometry(0.48, 0.48, 0.12, 24), mats: [side, face, face] };
  };
  Gfx.coin = function (assets) {
    var m = new THREE.Mesh(assets.geo, assets.mats); m.rotation.x = Math.PI / 2; m.position.y = 0.9;
    var h = new THREE.Group(); h.add(m); h.inner = m;
    return h;
  };

  global.Gfx = Gfx;
})(window);
