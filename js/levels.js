/* Crowd Battle 3D - level definitions | TK Sadhan
 *
 * 1000 levels, all generated from the level number (same level = same layout every time).
 * Every level has a BOSS at the end of the road.
 *
 * Each level is a list of "rows" along the track (z goes forward). Every row has a `gap` = distance to the next row.
 *  gates : two gates side by side  [leftValue, rightValue]  ('+' add, 'x' multiply, '-' subtract, '/' divide)
 *  enemy : red horde that fills the whole road
 *  coins : line of coins
 *  barrel: explosive barrel (shoot to blow up nearby enemies)
 *
 * Road layout:  [gate] -> 3 red hordes close behind each other -> (coins) -> [gate] -> ...  -> boss
 */
(function (global) {
  'use strict';

  var COUNT = 1000;

  function G(l, r) { return { t: 'gates', l: l, r: r, gap: 11 }; }
  function E(n, gap) { return { t: 'enemy', n: n, x: 0, w: 7, gap: gap || 8 }; }
  function C(x, n, gap) { return { t: 'coins', x: x, n: n, gap: gap || 12 }; }
  function B(x, gap) { return { t: 'barrel', x: x, gap: gap || 0 }; }

  // Dark roads + cool backgrounds so the gold coins and blue/red armies stand out.
  var T = {
    meadow: { sky: 0x2f6fd0, fog: 0x4a88e0, floor: 0x3a4150, wall: 0x1f3a6a, accent: 0x2a7bff },
    dusk:   { sky: 0x4b2a78, fog: 0x6e4a98, floor: 0x40384e, wall: 0x2e1f52, accent: 0xb06aff },
    night:  { sky: 0x0a1230, fog: 0x14214a, floor: 0x262d40, wall: 0x142048, accent: 0x38e0ff },
    lava:   { sky: 0x1a1030, fog: 0x2e1a3a, floor: 0x3b3034, wall: 0x3a1420, accent: 0xff4a1c },
    ice:    { sky: 0x2a6aa8, fog: 0x5a9ad0, floor: 0x40586f, wall: 0x2a5a8a, accent: 0x36e0ff }
  };
  var THEME_NAMES = ['meadow', 'dusk', 'night', 'lava', 'ice'];

  function gateValue(label, cr) {
    var op = label.charAt(0), v = parseInt(label.replace(/[^0-9]/g, ''), 10);
    return op === '+' ? cr + v : op === 'x' ? cr * v : op === '/' ? Math.max(1, Math.floor(cr / v)) : Math.max(0, cr - v);
  }

  // ---- tuning knobs (measured on the real game by running an auto-pilot, see tools/headless-test.js) ----
  // enemies shot down per second by a crowd of `cr` (same rules as game.js: bullets per volley x damage per bullet / fire interval)
  function firepower(cr) {
    var nb = Math.min(8, 2 + Math.floor(Math.sqrt(cr) / 3)), bd = 1 + cr / 60;
    return nb * bd / 0.2;
  }
  // reference horde size for a crowd of `cr`: firepower x time spent in range of one horde (hordes beyond ~0.78 of this start to hurt)
  function share(cr) { return firepower(cr) * 1.5; }
  // fraction of the crowd lost against 3 hordes of size e (measured curve)
  function lossFrac(x) {
    if (x <= 0.5) return 0;
    if (x <= 0.78) return 0.3 * (x - 0.5) / 0.28;
    return Math.min(1, 0.3 + (x - 0.78) * 1.9);
  }
  function hard(n) { return 1 - Math.exp(-n / 250); }                    // 0 (level 1) -> ~1 (level 1000)

  function build(n) {
    var seed = n * 9301 + 49297;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }

    var d = Math.min(1, n / 500), hd = hard(n);
    var segs = 11 + Math.floor(n / 250);                    // 11 .. 15 sections -> a long road
    var minE = 8 + Math.floor(n / 100);
    var mults = ['x2', 'x2', 'x3'];                         // multiplier gates only appear every 3rd section: numbers stay sensible
    if (n >= 60) mults.push('x4');
    if (n >= 200) mults.push('x5', 'x3');
    var adds = ['+10', '+10', '+99'];
    var traps = n >= 15 ? ['-10', '/2', '-5', '/2'] : ['-5', '-10'];
    var rows = [], cr = 5, s, h, a, b, segEst = [];

    for (s = 0; s < segs; s++) {
      // ----- gate pair -----
      var isMult = (s % 3 === 2), trapP = (n <= 3 || s === 0) ? 0 : 0.2 + 0.35 * d;   // no trap gate on the very first gate / on the first levels
      if (isMult) { a = pick(mults); b = (rnd() < trapP) ? pick(traps) : pick(mults.concat(['+99', '+10'])); }
      else if (n <= 3) { a = pick(adds); b = pick(adds.concat(['x2'])); }               // levels 1-3: every gate is a good one
      else { a = pick(adds); b = (rnd() < trapP) ? pick(traps) : pick((s === 0) ? ['+10', '+99'] : ['+1', '+10', '+99']); }
      if (rnd() < 0.5) { var t = a; a = b; b = t; }
      rows.push(G(a, b));
      // levels 1-3: size the hordes for the WORSE gate so any choice can be won; later levels: for the better gate
      cr = Math.min(99999, (n <= 3 ? Math.min : Math.max)(gateValue(a, cr), gateValue(b, cr)));

      // ----- three hordes right behind each other: the road is full of red -----
      // the hordes get stronger as the level number and the distance along the road grow
      var x = (0.36 + 0.26 * hd) * (0.85 + 0.3 * s / (segs - 1)), sh = share(cr), sizes = [], nextCoins = (s % 2 === 1);
      for (h = 0; h < 3; h++) {
        var e = Math.max(minE, Math.round(x * sh * (0.92 + 0.08 * h)));
        sizes.push(e);
        rows.push(E(e, h === 2 ? (nextCoins ? 14 : 8) : 8));
      }
      var eAvg = (sizes[0] + sizes[1] + sizes[2]) / 3;
      cr = Math.max(4, Math.round(cr * (1 - lossFrac(eAvg / sh))));
      segEst.push(cr);
      // ----- coins (+ barrel on some) -----
      if (nextCoins) {
        var side = (s % 4 === 1) ? -1 : 1;
        rows.push(C(side, 8, 12));
        if (s % 3 === 1) rows.push(B(-side, 8));
      }
    }
    rows[rows.length - 1].gap = 14;

    // boss hp = N seconds of the crowd's fire (a bigger crowd can afford a longer fight)
    // (from level ~200 on, the real crowd ends up bigger than the estimate, so the estimate is scaled up for the boss)
    var crB = cr * (1 + 2.0 * Math.max(0, Math.min(1, (n - 200) / 800)));
    var secs = (6.5 + 1.2 * Math.log(Math.max(5, crB)) / Math.LN10) * (0.85 + 0.3 * hd) * (n % 10 === 0 ? 1.1 : 1);
    var hp = Math.max(120, Math.round(firepower(crB) * 1.2 * secs));
    return {
      id: n, theme: THEME_NAMES[Math.floor((n - 1) / 2) % THEME_NAMES.length], rows: rows,
      boss: { hp: hp, dmg: 3 + Math.round(n / 80), variant: n % 6 },
      finalEnemy: 0, estCrowd: cr, segEst: segEst
    };
  }

  global.GameLevels = {
    count: COUNT,
    themes: T,
    get: function (n) { return build(Math.max(1, Math.min(COUNT, n))); }
  };
})(window);
