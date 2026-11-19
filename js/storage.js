/* Crowd Battle 3D - local save system | TK Sadhan */
(function (global) {
  'use strict';
  var KEY = 'cb3d_save_v1';

  var DEFAULTS = {
    coins: 0,
    unlocked: 1,          // highest unlocked level number
    stars: {},            // level -> 0..3
    best: {},             // level -> best score
    upgrades: { fireRate: 0, damage: 0, startCrowd: 0, income: 0, range: 0 },
    totalKills: 0,
    fps30: false          // low-power mode toggle
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var Save = {
    data: clone(DEFAULTS),
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var s = JSON.parse(raw);
          for (var k in DEFAULTS) if (s[k] !== undefined) this.data[k] = s[k];
          for (var u in DEFAULTS.upgrades) if (typeof this.data.upgrades[u] !== 'number') this.data.upgrades[u] = 0;
        }
      } catch (e) {}
      return this.data;
    },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    reset: function () {
      this.data = clone(DEFAULTS);
      this.save();
    }
  };

  global.GameSave = Save;
})(window);
