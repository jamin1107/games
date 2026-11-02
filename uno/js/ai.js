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

  /* 待命型技能可用判定：有次数且未在待命中 */
  function canArm(g, p, id) {
    return g.skillMode && p.skill && p.skill.id === id &&
      p.skill.uses > 0 && !p.skill.armed;
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

    /* 幸运数字：没牌可跟时，出公示的幸运数字续命 */
    if (!playable.length && skillOf(g, p, 'lucky') && g.luckyNum != null) {
      var ln = p.hand.filter(function (c) { return c.k === g.luckyNum; })[0];
      if (ln) return { uid: ln.uid, color: AI.chooseColor(g, p) };
    }
    if (!playable.length) return null;

    /* 双子星：有能出的数字牌且手里还有同数字的牌时，优先一并带出 */
    if (skillOf(g, p, 'twin')) {
      for (var ti = 0; ti < playable.length; ti++) {
        var mc = playable[ti];
        if (!/^[0-9]$/.test(mc.k)) continue;
        var partner = null, pb = -1;
        p.hand.forEach(function (x) {
          if (x.uid !== mc.uid && x.k === mc.k) {
            var b = burden(x);
            if (b > pb) { pb = b; partner = x; }
          }
        });
        if (partner) return { uid: mc.uid, color: null, twinUid: partner.uid };
      }
    }

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

  /* 淘旧换新：手里有很重的牌时换掉最重的，返回要弃的 uid 或 null */
  AI.wantRefresh = function (g, p) {
    if (!skillOf(g, p, 'refresh')) return null;
    var worst = null, wb = 6;
    p.hand.forEach(function (c) {
      var b = burden(c);
      if (b > wb) { wb = b; worst = c; }
    });
    return worst && Math.random() < 0.7 ? worst.uid : null;
  };

  /* 偷天换日 / 天眼 等：自己回合开始时的主动技能 */
  AI.maybeUtility = function (g, p) {
    var N = g.players.length;
    function nextOf() { return g.players[((g.turn + g.dir) % N + N) % N]; }
    function minOpp() {
      var t = null;
      g.players.forEach(function (o) {
        if (o.id !== p.id && (!t || o.hand.length < t.hand.length)) t = o;
      });
      return t;
    }
    /* 待命型技能：挑时机手动挂上，触发时自动生效 */
    if (canArm(g, p, 'cloak') && p.hand.length === 2) E.armSkill(g, p.id, 'cloak');
    if (canArm(g, p, 'shield') && p.hand.length <= 3 && Math.random() < 0.85) E.armSkill(g, p.id, 'shield');
    if (canArm(g, p, 'thorn') && p.hand.length <= 3 && Math.random() < 0.8) E.armSkill(g, p.id, 'thorn');
    if (canArm(g, p, 'brake')) {
      var weak = minOpp();
      if (weak && weak.hand.length <= 2 && Math.random() < 0.9) E.armSkill(g, p.id, 'brake');
    }
    /* 偷天换日：手牌明显比最少的对手多时，送走最重的牌 */
    if (skillOf(g, p, 'swap')) {
      var t1 = minOpp();
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
      var t2 = minOpp();
      if (t2 && p.hand.length - t2.hand.length >= 2 && p.hand.length >= 5 && Math.random() < 0.5) {
        E.useEye(g, p.id, t2.id);
      }
    }
    /* 迷魂阵：反转后轮到的对手手牌更少时使用 */
    if (skillOf(g, p, 'reversal')) {
      var nat = nextOf();
      var flip = g.players[((g.turn - g.dir) % N + N) % N];
      if (flip.hand.length < nat.hand.length && Math.random() < 0.8) E.useReversal(g, p.id);
    }
    /* 无中生有：手牌不少于 3 张就白摸 */
    if (skillOf(g, p, 'draw3') && p.hand.length >= 3) E.useDraw2(g, p.id);
    /* 顺手牵羊 / 过河拆桥：针对手牌最少的对手 */
    if (skillOf(g, p, 'steal')) {
      var t3 = minOpp();
      if (t3 && t3.hand.length && t3.hand.length <= 2) E.useSteal(g, p.id, t3.id);
    }
    if (skillOf(g, p, 'wreck')) {
      var t4 = minOpp();
      if (t4 && t4.hand.length && t4.hand.length <= 2) E.useWreck(g, p.id, t4.id);
    }
    /* 拖延：拖住即将出牌的下家 */
    if (skillOf(g, p, 'delay')) {
      var nx = nextOf();
      if (nx.hand.length <= 3 && (g.delayed || []).indexOf(nx.id) < 0) E.useDelay(g, p.id, nx.id);
    }
    /* 乾坤挪移：比手牌最少的对手多 1–2 张时整手互换 */
    if (skillOf(g, p, 'mswap')) {
      var t5 = minOpp();
      if (t5 && t5.hand.length && p.hand.length > t5.hand.length &&
          p.hand.length - t5.hand.length <= 2) E.useMSwap(g, p.id, t5.id);
    }
    /* 蛊惑：对下家押他手里最多的颜色 */
    if (skillOf(g, p, 'hex') && !g.hex) {
      var t6 = nextOf();
      if (t6.hand.length) {
        var cnt = { r: 0, y: 0, g: 0, b: 0 };
        t6.hand.forEach(function (c) { if (c.c !== 'w') cnt[c.c]++; });
        var best = 'r', bestN = -1;
        E.COLORS.forEach(function (c) { if (cnt[c] > bestN) { best = c; bestN = cnt[c]; } });
        E.useHex(g, p.id, t6.id, best);
      }
    }
    /* 传送门：下家快赢时把出牌权交给手牌最多的人 */
    if (skillOf(g, p, 'portal')) {
      var nat2 = nextOf();
      if (nat2.hand.length <= 1) {
        var most = null;
        g.players.forEach(function (o) {
          if (o.id !== p.id && (!most || o.hand.length > most.hand.length)) most = o;
        });
        if (most && most.hand.length > 1) E.armPortal(g, p.id, most.id);
      }
    }
    /* 占卜师：看顶 3 张，随机埋 1 张回堆底 */
    if (skillOf(g, p, 'oracle') && E.deckCount(g) >= 3 && Math.random() < 0.5) {
      if (E.useOracle(g, p.id).ok) {
        var cards = g.oracleShow && g.oracleShow.cards;
        if (cards && cards.length && Math.random() < 0.5) {
          E.oracleMove(g, p.id, cards[Math.floor(Math.random() * cards.length)].uid);
        } else E.oracleSkip(g, p.id);
      }
    }
    /* 换换果子：手牌多且有重牌时换掉最重的一张 */
    if (skillOf(g, p, 'jh') && p.hand.length >= 6) {
      var worstJ = null, wbj = 7;
      p.hand.forEach(function (c) { var b = burden(c); if (b >= wbj) { wbj = b; worstJ = c; } });
      if (worstJ) E.useBalance(g, p.id, [worstJ.uid]);
    }
    /* 温泉派对：手牌不少于 3 张时全场泡温泉，自己继续出 */
    if (skillOf(g, p, 'wq') && p.hand.length >= 3 && Math.random() < 0.7) E.useHotSpring(g, p.id);
    /* 水花四溅：有人快赢时泼一身水 */
    if (skillOf(g, p, 'sh')) {
      var damp = false;
      g.players.forEach(function (o) { if (o.id !== p.id && o.hand.length <= 2) damp = true; });
      if (damp) E.useSplash(g, p.id);
    }
    /* 瞌睡虫：催眠手牌最少的对手 */
    if (skillOf(g, p, 'ks')) {
      var t7 = minOpp();
      if (t7 && t7.hand.length <= 2 && (g.sleepy || []).indexOf(t7.id) < 0) E.useSleep(g, p.id, t7.id);
    }
    /* 臭屁炸弹：塞给下家 */
    if (skillOf(g, p, 'cp') && !g.bomb) {
      var nx2 = nextOf();
      if (nx2.hand.length <= 4) E.useBomb(g, p.id, nx2.id);
    }
    /* 叶子快递：从快赢的对手抽 1 张，寄给手牌最多的人 */
    if (skillOf(g, p, 'yz')) {
      var t8 = minOpp();
      var mostY = null;
      g.players.forEach(function (o) {
        if (o.id !== p.id && (!mostY || o.hand.length > mostY.hand.length)) mostY = o;
      });
      if (t8 && mostY && t8.id !== mostY.id && t8.hand.length && t8.hand.length <= 2) {
        E.useLeaf(g, p.id, t8.id, mostY.id);
      }
    }
    /* 稳如水豚：有人快赢时挂上护体 */
    if (canArm(g, p, 'wd')) {
      var guard = false;
      g.players.forEach(function (o) { if (o.id !== p.id && o.hand.length <= 2) guard = true; });
      if (guard) E.armSkill(g, p.id, 'wd');
    }
    /* 暴走柚子：手里有 +2 且下家快赢时先嗑一颗 */
    if (skillOf(g, p, 'bz') && g.grapeSeat !== p.id) {
      var hasD2 = p.hand.some(function (c) { return c.k === 'd2'; });
      if (hasD2 && nextOf().hand.length <= 3) E.useGrape(g, p.id);
    }
    /* 零食分享：把 2 张重牌塞给手牌最少的对手，自己摸 1 */
    if (skillOf(g, p, 'ls') && p.hand.length >= 4) {
      var t9 = minOpp();
      if (t9) {
        var heavy = p.hand.slice().sort(function (a, b) { return burden(b) - burden(a); }).slice(0, 2);
        if (heavy.length === 2) E.useSnack(g, p.id, [heavy[0].uid, heavy[1].uid], t9.id);
      }
    }
  };
})();
