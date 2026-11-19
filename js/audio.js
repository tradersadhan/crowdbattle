/* Crowd Battle 3D - Audio manager (Web Audio API)  |  TK Sadhan
 *
 * - Separate Music and SFX buses with independent volume + mute.
 * - Settings persisted in localStorage.
 * - Android-safe: AudioContext is created/resumed on the first user gesture,
 *   resumed again when the tab returns to the foreground, and music pauses when hidden.
 * - Rate-limits spammy sounds (shooting, footsteps, joins) to protect low-end phones.
 */
(function (global) {
  'use strict';

  var FILES = [
    'click', 'menu', 'back', 'footstep', 'shoot', 'shoot_heavy', 'hit', 'enemy_attack',
    'enemy_hit', 'join_small', 'join_medium', 'join_large', 'gate', 'gate_bad',
    'explosion', 'explosion_big', 'destroy', 'coin', 'boss_roar', 'victory', 'gameover',
    'upgrade', 'error', 'countdown', 'go', 'bgm_game', 'bgm_menu', 'bgm_boss'
  ];
  var SETTINGS_KEY = 'cb3d_audio_v1';

  // min seconds between plays of the same sound
  var COOLDOWN = {
    shoot: 0.07, footstep: 0.18, hit: 0.05, enemy_hit: 0.06, enemy_attack: 0.25,
    join_small: 0.06, join_medium: 0.1, join_large: 0.2, explosion: 0.1, destroy: 0.15,
    coin: 0.04, click: 0.03
  };

  var Audio = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    buffers: {},
    loading: null,
    unlocked: false,
    settings: { music: 0.6, sfx: 0.9, musicMuted: false, sfxMuted: false },
    _lastPlayed: {},
    _music: null,       // { name, src, gain }
    _wantMusic: null,   // name that should be playing
    _basePath: 'assets/audio/',
    _ext: '.wav',

    /* ---------- settings ---------- */
    loadSettings: function () {
      try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          var s = JSON.parse(raw);
          for (var k in this.settings) if (typeof s[k] === typeof this.settings[k]) this.settings[k] = s[k];
        }
      } catch (e) { /* storage may be blocked; ignore */ }
    },
    saveSettings: function () {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) {}
    },
    _applyGains: function () {
      if (!this.ctx) return;
      var t = this.ctx.currentTime;
      var m = this.settings.musicMuted ? 0 : this.settings.music;
      var s = this.settings.sfxMuted ? 0 : this.settings.sfx;
      this.musicGain.gain.cancelScheduledValues(t);
      this.sfxGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(m, t, 0.03);
      this.sfxGain.gain.setTargetAtTime(s, t, 0.03);
    },
    setMusicVolume: function (v) { this.settings.music = clamp01(v); this._applyGains(); this.saveSettings(); },
    setSfxVolume: function (v) { this.settings.sfx = clamp01(v); this._applyGains(); this.saveSettings(); },
    setMusicMuted: function (b) { this.settings.musicMuted = !!b; this._applyGains(); this.saveSettings(); },
    setSfxMuted: function (b) { this.settings.sfxMuted = !!b; this._applyGains(); this.saveSettings(); },

    /* ---------- init / unlock ---------- */
    init: function () {
      this.loadSettings();
      var self = this;
      var unlock = function () { self.unlock(); };
      ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click', 'keydown'].forEach(function (ev) {
        window.addEventListener(ev, unlock, { passive: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (!self.ctx) return;
        if (document.hidden) {
          if (self.ctx.state === 'running') self.ctx.suspend();
        } else if (self.unlocked) {
          self.ctx.resume();
        }
      });
    },

    _create: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      // gentle limiter so big explosions + crowd never clip on phone speakers
      var comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this._applyGains();
    },

    unlock: function () {
      if (this.unlocked && this.ctx && this.ctx.state === 'running') return;
      this._create();
      if (!this.ctx) return;
      var self = this;
      var done = function () {
        if (self.ctx.state !== 'running') return;
        if (!self.unlocked) {
          self.unlocked = true;
          // silent buffer trick for iOS / old Android WebView
          try {
            var b = self.ctx.createBuffer(1, 1, 22050), s = self.ctx.createBufferSource();
            s.buffer = b; s.connect(self.ctx.destination); s.start(0);
          } catch (e) {}
          self.load().then(function () { if (self._wantMusic) self._startMusic(self._wantMusic); });
        }
      };
      var p = this.ctx.resume();
      if (p && p.then) p.then(done, function () {}); else done();
      done();
    },

    /* ---------- loading ---------- */
    load: function (onProgress) {
      if (this.loading) return this.loading;
      this._create();
      var self = this, loaded = 0;
      var jobs = FILES.map(function (name) {
        return fetch(self._basePath + name + self._ext)
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (ab) { return decode(self.ctx, ab); })
          .then(function (buf) { self.buffers[name] = buf; })
          .catch(function () { /* missing file = silent, game keeps running */ })
          .then(function () { loaded++; if (onProgress) onProgress(loaded / FILES.length); });
      });
      this.loading = Promise.all(jobs);
      return this.loading;
    },

    /* ---------- SFX ---------- */
    play: function (name, opts) {
      if (!this.ctx || !this.unlocked || this.settings.sfxMuted || this.settings.sfx <= 0) return null;
      var buf = this.buffers[name];
      if (!buf) return null;
      opts = opts || {};
      var now = this.ctx.currentTime;
      var cd = COOLDOWN[name];
      if (cd && now - (this._lastPlayed[name] || -9) < cd) return null;
      this._lastPlayed[name] = now;
      var src = this.ctx.createBufferSource();
      src.buffer = buf;
      var rate = (opts.rate || 1) * (opts.jitter ? 1 + (Math.random() - 0.5) * opts.jitter : 1);
      src.playbackRate.value = rate;
      var g = this.ctx.createGain();
      g.gain.value = opts.volume == null ? 1 : opts.volume;
      src.connect(g); g.connect(this.sfxGain);
      src.start(opts.delay ? now + opts.delay : 0);
      return src;
    },

    /* crowd-gate helper: picks the +1 / +10 / +99 join sound */
    gate: function (value) {
      this.play('gate', { volume: 0.6 });
      var n = value >= 50 ? 'join_large' : value >= 5 ? 'join_medium' : 'join_small';
      this.play(n, { volume: 0.9, jitter: 0.06 });
    },

    /* ---------- music ---------- */
    playMusic: function (name) {
      this._wantMusic = name;
      if (this._music && this._music.name === name) return;
      if (!this.unlocked || !this.buffers[name]) return;
      this._startMusic(name);
    },
    _startMusic: function (name) {
      if (!this.ctx || !this.buffers[name]) return;
      if (this._music && this._music.name === name) return;
      this._fadeOutMusic(0.6);
      var src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.loop = true;
      var g = this.ctx.createGain();
      var t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.8);
      src.connect(g); g.connect(this.musicGain);
      src.start(0);
      this._music = { name: name, src: src, gain: g };
    },
    _fadeOutMusic: function (sec) {
      var m = this._music;
      if (!m) return;
      this._music = null;
      var t = this.ctx.currentTime;
      try {
        m.gain.gain.cancelScheduledValues(t);
        m.gain.gain.setValueAtTime(m.gain.gain.value, t);
        m.gain.gain.linearRampToValueAtTime(0, t + sec);
        m.src.stop(t + sec + 0.05);
      } catch (e) {}
    },
    stopMusic: function (sec) {
      this._wantMusic = null;
      if (this.ctx) this._fadeOutMusic(sec == null ? 0.5 : sec);
    },
    /* duck music briefly (for victory / game over stingers) */
    duckMusic: function (sec) {
      if (!this.ctx) return;
      var t = this.ctx.currentTime, g = this.musicGain.gain;
      var base = this.settings.musicMuted ? 0 : this.settings.music;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(base * 0.15, t + 0.15);
      g.linearRampToValueAtTime(base, t + (sec || 2));
    }
  };

  function clamp01(v) { v = +v; return v < 0 ? 0 : v > 1 ? 1 : (isNaN(v) ? 0 : v); }

  // decodeAudioData with both promise and legacy callback support (old Android WebView)
  function decode(ctx, ab) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(ab, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  global.GameAudio = Audio;
})(window);
