/* Minimal THREE stand-in used ONLY by tools/browser-test.js (UI + audio smoke test without WebGL). Not shipped to players. */
(function () {
  function V3() { this.x = 0; this.y = 0; this.z = 0; }
  V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
  V3.prototype.project = function () { this.x = 0; this.y = 0; this.z = 0.5; return this; };
  V3.prototype.setScalar = function (s) { return this.set(s, s, s); };
  function Col() { this.r = 1; this.g = 1; this.b = 1; }
  Col.prototype = { set: function () { return this; }, setHex: function () { return this; }, getHexString: function () { return 'ffffff'; }, clone: function () { return new Col(); }, multiplyScalar: function () { return this; }, offsetHSL: function () { return this; } };
  function Geo() { this.attributes = { position: { count: 3, array: new Float32Array(9) }, normal: { array: new Float32Array(9) } }; this.index = null; }
  Geo.prototype = { clone: function () { return new Geo(); }, applyMatrix4: function () { return this; }, toNonIndexed: function () { return this; }, dispose: function () {}, setAttribute: function () {} };
  function Obj() { this.position = new V3(); this.rotation = new V3(); this.scale = new V3().set(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.matrix = {}; }
  Obj.prototype = { add: function (c) { this.children.push(c); }, updateMatrix: function () {}, clone: function () { return new Obj(); }, lookAt: function () {}, updateProjectionMatrix: function () {} };
  function Mesh(g, m) { Obj.call(this); this.geometry = g; this.material = m; } Mesh.prototype = Object.create(Obj.prototype);
  function Inst(g, m, n) { Mesh.call(this, g, m); this.count = n; this.instanceMatrix = {}; this.instanceColor = {}; } Inst.prototype = Object.create(Mesh.prototype);
  Inst.prototype.setMatrixAt = function () {}; Inst.prototype.setColorAt = function () {};
  function Group() { Obj.call(this); } Group.prototype = Object.create(Obj.prototype);
  function Scene() { Obj.call(this); this.remove = function () {}; } Scene.prototype = Object.create(Obj.prototype);
  window.THREE = { Vector3: V3, Color: Col, Object3D: Obj, Mesh: Mesh, InstancedMesh: Inst, Group: Group, Scene: Scene,
    Quaternion: function () { this.setFromEuler = function () { return this; }; }, Euler: function () {}, Matrix4: function () { this.compose = function () { return this; }; },
    BufferGeometry: Geo, BufferAttribute: function () {}, BoxGeometry: Geo, SphereGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, PlaneGeometry: Geo, RingGeometry: Geo, CircleGeometry: Geo,
    MeshLambertMaterial: function () {}, MeshBasicMaterial: function () {}, CanvasTexture: function () { this.repeat = new V3(); }, Fog: function () {},
    HemisphereLight: Obj, DirectionalLight: Obj, PerspectiveCamera: function () { Obj.call(this); this.updateProjectionMatrix = function () {}; this.lookAt = function () {}; },
    WebGLRenderer: function () { this.setPixelRatio = function () {}; this.setSize = function () {}; this.render = function () {}; }, RepeatWrapping: 1, NearestFilter: 1, DoubleSide: 2 };
})();
