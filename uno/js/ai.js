/* UNO · AI（有节奏、有留痕） */
(function () {
  var E = window.UNO.Engine;
  var AI = (window.UNO.AI = {});

  /* 选颜色：选手里最多的颜色 */
  AI.chooseColor = function (g, p) {
    var cnt = { r: 0, y: 0, g: 0, b: 0 };
    p.hand.forEach(function (c) { if (c.c !== 'w') cnt[c.c]++; });
    var best = 'r', bestN = -1;
    E.COLORS.forEach(function (c) {
      if (cnt[c] > bestN || (cnt[c] === bestN && Math.random() < 0.5)) { best = c; bestN = cnt[c]; }
    });
    return best;
  };

  /* 决策：返回 {uid, color?} 或 null（摸牌） */
  AI.pick = function (g, p) {
    var N = g.players.length;
    var playable = p.hand.filter(function (c) { return E.playable(g, c); });
    if (!playable.length) return null;

    var next = g.players[((g.turn + g.dir) % N + N) % N];
    var nextLow = next.hand.length <= 2;

    function score(c) {
      if (c.k === 'd2') return nextLow ? 60 : 30;
      if (c.k === 'skip') return nextLow ? 55 : 28;
      if (c.k === 'rev') return nextLow ? 50 : 26;
      if (c.k === 'w4') return nextLow ? 40 : 4;
      if (c.k === 'wild') return 6;
      var n = parseInt(c.k, 10);
      return 10 + (isNaN(n) ? 0 : n * 0.5);
    }
    playable.sort(function (a, b) { return score(b) - score(a); });
    return { uid: playable[0].uid, color: playable[0].c === 'w' ? AI.chooseColor(g, p) : null };
  };
})();
