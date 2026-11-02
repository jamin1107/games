/* UNO · 规则引擎（纯逻辑，无 DOM） */
(function () {
  window.UNO = window.UNO || {};
  var E = (window.UNO.Engine = {});
  var COLORS = ['r', 'y', 'g', 'b'];
  E.COLORS = COLORS;
  E.COLOR_NAME = { r: '红色', y: '黄色', g: '绿色', b: '蓝色' };
  E.KIND_NAME = { skip: '跳过', rev: '反转', d2: '+2', wild: '换色', w4: '+4' };

  E.cardLabel = function (c) {
    if (c.c === 'w') return E.KIND_NAME[c.k];
    if (c.k === 'skip' || c.k === 'rev' || c.k === 'd2') return E.COLOR_NAME[c.c] + ' ' + E.KIND_NAME[c.k];
    return E.COLOR_NAME[c.c] + ' ' + c.k;
  };

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }
  E.shuffle = shuffle;

  function glog(g, text) {
    g.log.push({ t: text, n: g.log.length + 1 });
    if (g.log.length > 240) g.log.shift();
  }

  E.createGame = function (opts) {
    var deck = [], uid = 1;
    COLORS.forEach(function (c) {
      deck.push({ uid: uid++, c: c, k: '0' });
      for (var n = 1; n <= 9; n++) {
        deck.push({ uid: uid++, c: c, k: String(n) });
        deck.push({ uid: uid++, c: c, k: String(n) });
      }
      ['skip', 'rev', 'd2'].forEach(function (k) {
        deck.push({ uid: uid++, c: c, k: k });
        deck.push({ uid: uid++, c: c, k: k });
      });
    });
    for (var i = 0; i < 4; i++) {
      deck.push({ uid: uid++, c: 'w', k: 'wild' });
      deck.push({ uid: uid++, c: 'w', k: 'w4' });
    }
    shuffle(deck);

    var players = [];
    for (i = 0; i < opts.playerCount; i++) {
      players.push({
        id: i,
        name: opts.names && opts.names[i] ? opts.names[i] : '玩家' + (i + 1),
        isHuman: (opts.humanIds || [0]).indexOf(i) >= 0,
        hand: []
      });
    }
    for (var r = 0; r < 7; r++) players.forEach(function (p) { p.hand.push(deck.pop()); });

    /* 起始牌必须是数字牌，功能牌塞回重洗 */
    var first = null, guard = 0;
    while (guard++ < 500) {
      var c = deck.pop();
      if (/^[0-9]$/.test(c.k)) { first = c; break; }
      deck.unshift(c);
      shuffle(deck);
    }

    var g = {
      players: players,
      deck: deck,
      discard: [first],
      top: first,
      color: first.c,
      dir: 1,
      turn: 0,
      over: false,
      winner: -1,
      round: 1,
      awaiting: null,   // { type:'drawn' } 摸到牌可出时等待决定
      drawnUid: -1,
      log: []
    };
    glog(g, '游戏开始，起始牌 ' + E.cardLabel(first) + '，由 ' + players[0].name + ' 先出');
    return g;
  };

  E.current = function (g) { return g.players[g.turn]; };
  E.deckCount = function (g) { return g.deckCount != null ? g.deckCount : g.deck.length; };

  function step(g, n) {
    var N = g.players.length;
    g.turn = ((g.turn + g.dir * n) % N + N) % N;
  }

  /* 摸一张：牌堆空了就把弃牌堆（保留顶牌）重洗 */
  function drawOne(g, p) {
    if (!g.deck.length) {
      if (g.discard.length <= 1) return false;
      var top = g.discard.pop();
      g.deck = g.discard;
      g.discard = [top];
      shuffle(g.deck);
      glog(g, '牌堆已空，重洗弃牌堆（' + g.deck.length + ' 张）');
    }
    if (!g.deck.length) return false;
    p.hand.push(g.deck.pop());
    return true;
  }

  function applyDrawPenalty(g, n) {
    var victim = g.players[g.turn];
    var got = 0;
    for (var i = 0; i < n; i++) { if (drawOne(g, victim)) got++; }
    if (got) glog(g, victim.name + ' 被 ' + E.KIND_NAME[n === 2 ? 'd2' : 'w4'] + ' 罚摸 ' + got + ' 张并被跳过');
    else glog(g, victim.name + ' 无牌可摸，被跳过');
  }

  E.playable = function (g, c) {
    if (g.over) return false;
    if (c.c === 'w') return true;
    return c.c === g.color || c.k === g.top.k;
  };

  /* 出牌。wild/w4 必须带 color（r/y/g/b） */
  E.playCard = function (g, uid, color) {
    if (g.over) return { ok: false, err: '对局已结束' };
    var p = g.players[g.turn];
    var idx = -1;
    p.hand.forEach(function (c, i) { if (c.uid === uid) idx = i; });
    if (idx < 0) return { ok: false, err: '这张牌不在你手里' };
    var c = p.hand[idx];
    if (!E.playable(g, c)) return { ok: false, err: '这张牌跟不上' };
    if (c.c === 'w' && !color) return { ok: false, err: '请先选颜色' };

    p.hand.splice(idx, 1);
    g.discard.push(c);
    g.top = c;
    g.awaiting = null;
    g.drawnUid = -1;
    if (c.c === 'w') g.color = color; else g.color = c.c;

    var extra = c.c === 'w' ? '，指定 ' + E.COLOR_NAME[color] : '';
    glog(g, p.name + ' 打出 ' + E.cardLabel(c) + extra);

    if (!p.hand.length) {
      g.over = true;
      g.winner = p.id;
      glog(g, p.name + ' 出完了所有手牌，获胜！');
      return { ok: true };
    }
    if (p.hand.length === 1) glog(g, p.name + ' 只剩 1 张牌，UNO！');

    var N = g.players.length;
    switch (c.k) {
      case 'skip':
        step(g, 1);
        glog(g, g.players[g.turn].name + ' 被跳过');
        step(g, 1);
        break;
      case 'rev':
        g.dir *= -1;
        if (N === 2) { step(g, 1); glog(g, '双人局反转等同跳过，' + g.players[g.turn].name + ' 被跳过'); step(g, 1); }
        else { step(g, 1); glog(g, '方向反转，轮到 ' + g.players[g.turn].name); }
        break;
      case 'd2':
        step(g, 1); applyDrawPenalty(g, 2); step(g, 1);
        break;
      case 'w4':
        step(g, 1); applyDrawPenalty(g, 4); step(g, 1);
        break;
      default:
        step(g, 1);
    }
    return { ok: true };
  };

  /* 摸一张：能出则等待玩家决定，不能出自动过 */
  E.drawCard = function (g) {
    if (g.over) return { ok: false, err: '对局已结束' };
    var p = g.players[g.turn];
    if (g.awaiting) return { ok: false, err: '请先处理摸到的牌' };
    var c = drawOne(g, p);
    if (!c) {
      glog(g, p.name + ' 无牌可摸，跳过回合');
      step(g, 1);
      return { ok: true, passed: true };
    }
    var card = p.hand[p.hand.length - 1];
    glog(g, p.name + ' 摸了一张牌');
    if (E.playable(g, card)) {
      g.awaiting = { type: 'drawn' };
      g.drawnUid = card.uid;
      return { ok: true, playable: true, uid: card.uid };
    }
    step(g, 1);
    return { ok: true, playable: false };
  };

  /* 摸到能出的牌但选择保留 */
  E.passDrawn = function (g) {
    if (!g.awaiting || g.awaiting.type !== 'drawn') return { ok: false, err: '没有待决定的牌' };
    var p = g.players[g.turn];
    glog(g, p.name + ' 保留了刚摸的牌');
    g.awaiting = null;
    g.drawnUid = -1;
    step(g, 1);
    return { ok: true };
  };

  /* 结算：按剩牌数排名 */
  E.standings = function (g) {
    return g.players.slice().sort(function (a, b) {
      if (a.id === g.winner) return -1;
      if (b.id === g.winner) return 1;
      return a.hand.length - b.hand.length;
    }).map(function (p, i) {
      return { rank: i + 1, name: p.name, left: p.hand.length, winner: p.id === g.winner };
    });
  };
})();
