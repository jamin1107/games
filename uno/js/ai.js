/* UNO · AI（有节奏、有留痕，技能模式会主动用技能） */
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

  function skillOf(g, p, id) {
    return g.skillMode && p.skill && p.skill.id === id && p.skill.uses > 0;
  }

  /* 牌的"重量"：越重越想送走 */
  function burden(c) {
    if (c.c === 'w') return c.k === 'w4' ? 9 : 6;
    if (c.k === 'd2') return 7;
    if (c.k === 'skip' || c.k === 'rev') return 5;
    return parseInt(c.k, 10) || 0;
  }

  /* 决策：返回 {uid, color?} 或 null（摸牌） */
  AI.pick = function (g, p) {
    var N = g.players.length;
    var playable = p.hand.filter(function (c) { return E.playable(g, c); });

    /* 变色九：没牌可跟时，用 9 强行续命 */
    if (!playable.length && skillOf(g, p, 'wild9')) {
      var nine = p.hand.filter(function (c) { return c.k === '9'; })[0];
      if (nine) return { uid: nine.uid, color: AI.chooseColor(g, p), wild9: true };
    }
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

  /* 顺风手：手牌多时主动触发 */
  AI.wantWindfall = function (g, p) {
    return skillOf(g, p, 'windfall') && p.hand.length >= 6 && Math.random() < 0.55;
  };

  /* 顺风手选保留：优先能出的，否则随机 */
  AI.windfallKeep = function (g, p) {
    var uids = g.windfallUids || [];
    var cards = uids.map(function (u) {
      return p.hand.filter(function (c) { return c.uid === u; })[0];
    }).filter(Boolean);
    if (!cards.length) return;
    var playable = cards.filter(function (c) { return E.playable(g, c); });
    var keep = playable.length ? playable[0] : cards[Math.floor(Math.random() * cards.length)];
    E.windfallKeep(g, p.id, keep.uid);
  };

  /* 偷天换日 / 天眼：自己回合开始时的主动技能 */
  AI.maybeUtility = function (g, p) {
    /* 偷天换日：手牌明显比最少的对手多时，送走最重的牌 */
    if (skillOf(g, p, 'swap')) {
      var t1 = null;
      g.players.forEach(function (o) {
        if (o.id !== p.id && (!t1 || o.hand.length < t1.hand.length)) t1 = o;
      });
      if (t1 && t1.hand.length && p.hand.length - t1.hand.length >= 3 && p.hand.length >= 5) {
        var worst = p.hand[0], wb = -1;
        p.hand.forEach(function (c) {
          var b = burden(c);
          if (b > wb) { wb = b; worst = c; }
        });
        if (E.useSwap(g, p.id, worst.uid, t1.id).ok) return;
      }
    }
    /* 天眼：落后时看一眼最强对手（对手手牌最少的人） */
    if (skillOf(g, p, 'eye')) {
      var t2 = null;
      g.players.forEach(function (o) {
        if (o.id !== p.id && (!t2 || o.hand.length < t2.hand.length)) t2 = o;
      });
      if (t2 && p.hand.length - t2.hand.length >= 2 && p.hand.length >= 5 && Math.random() < 0.5) {
        E.useEye(g, p.id, t2.id);
      }
    }
  };
})();
