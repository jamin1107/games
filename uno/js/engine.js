/* UNO · 规则引擎（纯逻辑，无 DOM） */
(function () {
  window.UNO = window.UNO || {};
  var E = (window.UNO.Engine = {});
  var COLORS = ['r', 'y', 'g', 'b'];
  E.COLORS = COLORS;
  E.COLOR_NAME = { r: '红色', y: '黄色', g: '绿色', b: '蓝色' };
  E.KIND_NAME = { skip: '跳过', rev: '反转', d2: '+2', wild: '换色', w4: '+4' };

  /* ---------------- 技能模式（30 种技能池） ---------------- */
  var SKILL_IDS = [
    'lucky', 'combo', 'twin', 'reversal', 'portal',
    'windfall', 'refresh', 'draw3', 'swap', 'mswap',
    'steal', 'wreck', 'brake', 'delay', 'thorn',
    'shield', 'eye', 'hex', 'oracle', 'cloak',
    'jh', 'wq', 'sh', 'ks', 'cp',
    'yz', 'wd', 'bz', 'xj', 'ls'
  ];
  E.SKILL_IDS = SKILL_IDS;
  E.SKILLS = {
    lucky:    { icon: '🎲', name: '幸运数字', uses: 2, desc: '开局随机公示一个幸运数字，你出该数字时可声明为任意颜色' },
    combo:    { icon: '⚡', name: '连击',     uses: 1, desc: '出牌后若手里还有能跟的牌，可立刻追加打出 1 张' },
    twin:     { icon: '👯', name: '双子星',   uses: 1, desc: '出数字牌时，可同时附带打出另一张相同数字的牌（颜色不限，算一次出牌）' },
    reversal: { icon: '🔀', name: '迷魂阵',   uses: 2, desc: '强行反转出牌方向，且不消耗你的回合' },
    portal:   { icon: '🌀', name: '传送门',   uses: 1, desc: '先指定一位玩家，你出完牌后由他接替出牌，无视顺序' },
    windfall: { icon: '🍀', name: '顺风手',   uses: 2, desc: '摸牌时改为摸 2 张，选 1 张保留，另 1 张塞回牌堆底' },
    refresh:  { icon: '♻️', name: '淘旧换新', uses: 3, desc: '弃掉 1 张手牌并重新摸 1 张，摸到能出的可立刻打出或保留' },
    draw3:    { icon: '🎣', name: '摸鱼',     uses: 1, desc: '不消耗回合，直接摸 2 张牌' },
    swap:     { icon: '🔄', name: '偷天换日', uses: 1, desc: '送出 1 张手牌，与任一对手随机盲换' },
    mswap:    { icon: '🔃', name: '乾坤挪移', uses: 1, desc: '与一位手牌数差不超过 2 的对手整手互换' },
    steal:    { icon: '🐟', name: '叼走小鱼', uses: 1, desc: '随机抽一位对手的 1 张手牌加入你的手牌' },
    wreck:    { icon: '🦫', name: '拆水坝',   uses: 1, desc: '随机弃掉一位对手的 1 张手牌进弃牌堆' },
    brake:    { icon: '🚨', name: '急刹车',   uses: 1, desc: '先手动待命：任一对手打到剩 1 张时，塞给他 1 张并取消其 UNO（待命一次生效一次）' },
    delay:    { icon: '⏳', name: '拖延',     uses: 1, desc: '指定一位对手，其下回合开始前先罚摸 1 张' },
    thorn:    { icon: '🌵', name: '荆棘',     uses: 2, desc: '先手动待命：被 +2 / +4 罚牌时，攻击者也罚摸一半数量（向上取整）' },
    shield:   { icon: '🛡️', name: '护身符',   uses: 1, desc: '先手动待命：被 +2 / +4 罚牌时全部反弹给出牌者，自己不摸' },
    eye:      { icon: '👁️', name: '天眼',     uses: 2, desc: '偷看任一对手的全部手牌，直到你的回合结束' },
    hex:      { icon: '🍉', name: '赌西瓜',   uses: 1, desc: '指定一位对手并押一个颜色：他下次打出的颜色与押注一致则摸 2 张，否则你摸 1 张' },
    oracle:   { icon: '🔮', name: '占卜师',   uses: 2, desc: '查看牌堆顶 3 张，可将其中 1 张压到牌堆底' },
    cloak:    { icon: '🫥', name: '隐形斗篷', uses: 1, desc: '先手动待命：下一次打到只剩 1 张时无需喊 UNO，不会被罚' },
    jh:       { icon: '⚖️', name: '换换果子', uses: 1, desc: '弃掉任意张手牌，再摸等量的牌（不消耗回合）' },
    wq:       { icon: '♨️', name: '温泉派对', uses: 1, desc: '所有玩家各摸 1 张，然后你继续出牌（不消耗回合）' },
    sh:       { icon: '💦', name: '水花四溅', uses: 1, desc: '除你外所有玩家各罚摸 1 张（不消耗回合）' },
    ks:       { icon: '😴', name: '瞌睡虫',   uses: 1, desc: '指定一位对手，跳过他的下个回合' },
    cp:       { icon: '💨', name: '臭屁炸弹', uses: 1, desc: '指定一位对手，其下下个回合开始时罚摸 3 张' },
    yz:       { icon: '🍃', name: '叶子快递', uses: 1, desc: '从一位对手手里随机抽 1 张牌，塞给另一位对手' },
    wd:       { icon: '🧘', name: '稳如水豚', uses: 1, desc: '先手动待命：下一次针对你的技能（叼走小鱼/拆水坝/天眼/偷天换日/乾坤挪移/赌西瓜）无效' },
    bz:       { icon: '🍊', name: '暴走柚子', uses: 1, desc: '本回合你打出的下一张 +2，罚牌翻倍成 +4' },
    xj:       { icon: '🌿', name: '细嚼慢咽', uses: 1, desc: '被动：被 +2 / +4 罚牌时，只摸一半数量（向上取整）' },
    ls:       { icon: '🍪', name: '零食分享', uses: 1, desc: '把 2 张手牌交给一位对手，然后自己摸 1 张' }
  };

  /* 待命型技能：需在自己回合先手动发动，条件达成时自动生效一次 */
  var ARM_SKILLS = ['shield', 'thorn', 'brake', 'cloak', 'wd'];

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

  /* 发技能候选：每人 3 选 1，AI 立即随机选定 */
  function dealSkills(g) {
    g.skillChoices = [];
    g.players.forEach(function (p) {
      var pool = SKILL_IDS.slice();
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      var picks = pool.slice(0, 3);
      g.skillChoices.push(picks);
      if (!p.isHuman) {
        var id = picks[Math.floor(Math.random() * picks.length)];
        p.skill = { id: id, uses: E.SKILLS[id].uses, armed: false };
        glog(g, p.name + ' 的技能：' + E.SKILLS[id].icon + E.SKILLS[id].name);
      }
    });
    /* 幸运数字：每局随机公示 */
    g.luckyNum = String(Math.floor(Math.random() * 10));
    glog(g, '本局幸运数字：' + g.luckyNum + '（持有者出它可声明任意颜色）');
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
        hand: [],
        skill: null
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
      awaiting: null,   // { type:'drawn' | 'windfall' } 摸牌后等待决定
      drawnUid: -1,
      unoPending: -1,   // 剩 1 张待喊 UNO 的座位
      unoDeadline: 0,   // 喊话截止时间戳
      skillMode: !!opts.skillMode,
      skillChoices: null, // {座位: [3 个技能 id]}
      luckyNum: null,     // 幸运数字（'0'-'9'）
      comboSeat: null,    // 有连击机会的座位（可追加出一张）
      windfallUids: null, // 顺风手摸到的 2 张牌 uid
      peek: null,         // 天眼 { by, target }
      hex: null,          // 赌西瓜 { by, target, color }
      delayed: [],        // 被拖延的座位列表
      sleepy: [],         // 被瞌睡虫催眠的座位（跳过下个回合）
      bomb: null,         // 臭屁炸弹 { seat, count }（count 剩余回合数）
      grapeSeat: null,    // 暴走柚子生效中的座位（本回合 +2 翻倍）
      portalTarget: null, // 传送门 { by, target }
      oracleShow: null,   // 占卜师 { by, cards }
      log: []
    };
    glog(g, '游戏开始，起始牌 ' + E.cardLabel(first) + '，由 ' + players[0].name + ' 先出');
    if (g.skillMode) {
      dealSkills(g);
      glog(g, '技能模式：每人在候选技能中选 1 个，本局限定次数');
    }
    return g;
  };

  E.current = function (g) { return g.players[g.turn]; };
  E.deckCount = function (g) { return g.deckCount != null ? g.deckCount : g.deck.length; };

  function step(g, n) {
    var N = g.players.length;
    g.turn = ((g.turn + g.dir * n) % N + N) % N;
    /* 天眼：离开使用者的回合即失效；连击机会随回合结束作废 */
    if (g.peek && g.peek.by !== g.turn) g.peek = null;
    if (g.comboSeat != null && g.turn !== g.comboSeat) g.comboSeat = null;
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

  /* 回合开始结算：拖延罚牌 + 臭屁炸弹引信（按座位幂等） */
  function settleTurnStart(g) {
    var i = (g.delayed || []).indexOf(g.turn);
    if (i >= 0) {
      g.delayed.splice(i, 1);
      var pd = g.players[g.turn];
      var gotD = drawOne(g, pd) ? 1 : 0;
      glog(g, pd.name + ' 被【拖延】缠住，先罚摸 ' + gotD + ' 张');
    }
    var b = g.bomb;
    if (b && b.seat === g.turn && !g.over) {
      b.count--;
      var bp = g.players[b.seat];
      if (b.count <= 0) {
        var gotB = 0;
        for (var bi = 0; bi < 3; bi++) { if (drawOne(g, bp)) gotB++; }
        glog(g, '💨【臭屁炸弹】在 ' + bp.name + ' 头上炸开，罚摸 ' + gotB + ' 张！');
        g.bomb = null;
      } else {
        glog(g, '💨【臭屁炸弹】的引信在 ' + bp.name + ' 那边又烧掉一截…');
      }
    }
  }

  /* 回合结束收尾：瞌睡虫跳过、暴走柚子过期、视野/连击清理 */
  function endTurn(g) {
    var guard = 0;
    while (!g.over && g.sleepy && g.sleepy.length && g.sleepy.indexOf(g.turn) >= 0 && guard++ < 8) {
      var sp = g.players[g.turn];
      g.sleepy.splice(g.sleepy.indexOf(g.turn), 1);
      var N = g.players.length;
      g.turn = ((g.turn + g.dir) % N + N) % N;
      glog(g, sp.name + ' 被【瞌睡虫】催眠，跳过了回合');
    }
    if (g.grapeSeat != null && g.grapeSeat !== g.turn) g.grapeSeat = null;
    if (g.peek && g.peek.by !== g.turn) g.peek = null;
    if (g.comboSeat != null && g.turn !== g.comboSeat) g.comboSeat = null;
  }

  /* 回合以摸/过结束：传送门作废 */
  function clearPortalWaste(g) {
    if (g.portalTarget && g.portalTarget.by === g.turn) {
      g.portalTarget = null;
      glog(g, '【传送门】未生效，已作废');
    }
  }

  function applyDrawPenalty(g, n, attackerId) {
    var victim = g.players[g.turn];
    /* 护身符：待命中则反弹罚牌给出牌者，受害者不摸牌但仍被跳过 */
    var sk = g.skillMode && victim.skill;
    if (sk && sk.id === 'shield' && sk.armed && attackerId != null && attackerId !== victim.id) {
      sk.armed = false;
      var atk = g.players[attackerId];
      var got2 = 0;
      for (var j = 0; j < n; j++) { if (drawOne(g, atk)) got2++; }
      glog(g, victim.name + ' 发动【护身符】！罚牌反弹，' + atk.name + ' 罚摸 ' + got2 + ' 张');
      return;
    }
    var got = 0;
    var xj = g.skillMode && victim.skill && victim.skill.id === 'xj' && victim.skill.uses > 0;
    var cnt = xj ? Math.ceil(n / 2) : n;
    if (xj) victim.skill.uses--;
    for (var i = 0; i < cnt; i++) { if (drawOne(g, victim)) got++; }
    if (xj) glog(g, victim.name + ' 发动【细嚼慢咽】，罚 ' + n + ' 张只摸了 ' + got + ' 张并被跳过');
    else if (got) glog(g, victim.name + ' 被 ' + E.KIND_NAME[n === 2 ? 'd2' : 'w4'] + ' 罚摸 ' + got + ' 张并被跳过');
    else glog(g, victim.name + ' 无牌可摸，被跳过');
    /* 荆棘：待命中则攻击者也罚摸一半 */
    var th = g.skillMode && victim.skill;
    if (th && th.id === 'thorn' && th.armed && attackerId != null && attackerId !== victim.id) {
      th.armed = false;
      var half = Math.ceil(n / 2);
      var atk2 = g.players[attackerId];
      var gotT = 0;
      for (var t = 0; t < half; t++) { if (drawOne(g, atk2)) gotT++; }
      glog(g, victim.name + ' 发动【荆棘】！' + atk2.name + ' 也被扎到，罚摸 ' + gotT + ' 张');
    }
  }

  E.playable = function (g, c) {
    if (g.over) return false;
    if (c.c === 'w') return true;
    return c.c === g.color || c.k === g.top.k;
  };

  /* 出牌。wild/w4 必须带 color（r/y/g/b）。
     幸运数字：出公示数字跟不上时带 color 出，消耗 1 次技能，改为声明颜色。
     双子星：twinUid 为要附带打出的同数字手牌。 */
  E.playCard = function (g, uid, color, twinUid) {
    if (g.over) return { ok: false, err: '对局已结束' };
    var p = g.players[g.turn];
    settleTurnStart(g);
    var idx = -1;
    p.hand.forEach(function (c, i) { if (c.uid === uid) idx = i; });
    if (idx < 0) return { ok: false, err: '这张牌不在你手里' };
    var c = p.hand[idx];

    /* 双子星：先校验附带牌 */
    var twinCard = null;
    if (twinUid != null) {
      var skT = g.skillMode && p.skill;
      if (!skT || skT.id !== 'twin' || skT.uses <= 0) return { ok: false, err: '双子星不可用' };
      if (!/^[0-9]$/.test(c.k)) return { ok: false, err: '双子星只能配合数字牌' };
      p.hand.forEach(function (x) { if (x.uid === twinUid && x.uid !== uid) twinCard = x; });
      if (!twinCard) return { ok: false, err: '没有找到可附带的同数字手牌' };
    }

    var lucky = false;
    if (!E.playable(g, c)) {
      var sk0 = g.skillMode && p.skill;
      if (sk0 && sk0.id === 'lucky' && sk0.uses > 0 && c.k === g.luckyNum && color) lucky = true;
      else return { ok: false, err: '这张牌跟不上' };
    }
    if (c.c === 'w' && !color) return { ok: false, err: '请先选颜色' };

    p.hand.splice(idx, 1);
    if (twinCard) {
      p.hand.splice(p.hand.indexOf(twinCard), 1);
      g.discard.push(twinCard);
      p.skill.uses--;
    }
    g.discard.push(c);
    g.top = c;
    g.awaiting = null;
    g.drawnUid = -1;
    g.windfallUids = null;
    if (c.c === 'w') g.color = color; else g.color = c.c;

    /* 连击追加出牌：消耗技能次数 */
    if (g.comboSeat === p.id) {
      g.comboSeat = null;
      if (p.skill) p.skill.uses--;
      glog(g, p.name + ' 发动【连击】，追加出牌！');
    }
    var extra = c.c === 'w' ? '，指定 ' + E.COLOR_NAME[color] : '';
    glog(g, p.name + ' 打出 ' + E.cardLabel(c) +
      (twinCard ? ' ＋ ' + E.cardLabel(twinCard) + '（双子星）' : '') + extra);
    if (lucky) {
      g.color = color;
      p.skill.uses--;
      glog(g, p.name + ' 发动【幸运数字】，' + c.k + ' 指定为 ' + E.COLOR_NAME[color]);
    }

    if (!p.hand.length) {
      g.over = true;
      g.winner = p.id;
      g.peek = null;
      glog(g, p.name + ' 出完了所有手牌，获胜！');
      return { ok: true };
    }
    if (p.hand.length === 1) {
      var skC = g.skillMode && p.skill;
      if (skC && skC.id === 'cloak' && skC.armed) {
        skC.armed = false;
        glog(g, p.name + ' 发动【隐形斗篷】，无需喊 UNO');
      } else {
        g.unoPending = p.id;
        g.unoDeadline = Date.now() + 4000;
        glog(g, p.name + ' 只剩 1 张牌！');
      }
      /* 急刹车：对手自动塞 1 张并取消 UNO */
      for (var bi = 0; bi < g.players.length; bi++) {
        var bp = g.players[bi];
        var bs = g.skillMode && bp.skill;
        if (bp.id !== p.id && bs && bs.id === 'brake' && bs.armed) {
          bs.armed = false;
          var gotB = drawOne(g, p) ? 1 : 0;
          g.unoPending = -1;
          glog(g, bp.name + ' 发动【急刹车】，塞给 ' + p.name + ' ' + gotB + ' 张牌！');
          break;
        }
      }
    }

    /* 赌西瓜结算：目标出牌后按最终颜色判定 */
    if (g.hex && g.hex.target === p.id && !g.over) {
      var hx = g.hex;
      g.hex = null;
      var byP = g.players[hx.by], tgP = g.players[hx.target];
      if (g.color === hx.color) {
        var gotH = 0;
        for (var hi = 0; hi < 2; hi++) { if (drawOne(g, tgP)) gotH++; }
        glog(g, '【赌西瓜】命中！' + tgP.name + ' 押中颜色，罚摸 ' + gotH + ' 张');
      } else {
        var gotH2 = drawOne(g, byP) ? 1 : 0;
        glog(g, '【赌西瓜】未中，' + byP.name + ' 摸 ' + gotH2 + ' 张');
      }
    }

    /* 连击触发检查：还有同色/同数字/万能牌可出 */
    var comboHold = false;
    if (g.skillMode && p.skill && p.skill.id === 'combo' && p.skill.uses > 0 && g.comboSeat == null) {
      var canFollow = p.hand.some(function (x) {
        return x.c === 'w' || x.c === g.color || x.k === g.top.k;
      });
      if (canFollow) comboHold = true;
    }

    if (comboHold) {
      /* 不轮转：罚牌照常结算给下家，然后回合回到自己手上 */
      if (c.k === 'd2') {
        step(g, 1);
        if (g.grapeSeat === p.id) { g.grapeSeat = null; glog(g, p.name + ' 的【暴走柚子】发力，+2 翻倍成 +4！'); applyDrawPenalty(g, 4, p.id); }
        else applyDrawPenalty(g, 2, p.id);
        step(g, -1);
      }
      else if (c.k === 'w4') { step(g, 1); applyDrawPenalty(g, 4, p.id); step(g, -1); }
      else if (c.k === 'rev') { g.dir *= -1; glog(g, '方向反转'); }
      g.comboSeat = p.id;
      glog(g, p.name + ' 触发【连击】，可追加一张');
      return { ok: true, combo: true };
    }

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
        step(g, 1);
        if (g.grapeSeat === p.id) {
          g.grapeSeat = null;
          glog(g, p.name + ' 的【暴走柚子】发力，+2 翻倍成 +4！');
          applyDrawPenalty(g, 4, p.id);
        } else applyDrawPenalty(g, 2, p.id);
        step(g, 1);
        break;
      case 'w4':
        step(g, 1); applyDrawPenalty(g, 4, p.id); step(g, 1);
        break;
      default:
        step(g, 1);
    }

    /* 传送门：出完牌后由指定玩家接替出牌 */
    if (g.portalTarget && g.portalTarget.by === p.id && !g.over) {
      var pt = g.portalTarget;
      g.portalTarget = null;
      if (g.players[pt.target]) {
        g.turn = pt.target;
        glog(g, '【传送门】生效，轮到 ' + g.players[pt.target].name + ' 出牌');
      }
    }
    endTurn(g);
    return { ok: true };
  };

  /* 摸一张：能出则等待玩家决定，不能出自动过。
     useWindfall：顺风手——摸 2 张选 1 张保留。 */
  E.drawCard = function (g, useWindfall) {
    if (g.over) return { ok: false, err: '对局已结束' };
    var p = g.players[g.turn];
    if (g.awaiting) return { ok: false, err: '请先处理摸到的牌' };
    settleTurnStart(g);
    var sk = g.skillMode && p.skill;
    var wf = !!(useWindfall && sk && sk.id === 'windfall' && sk.uses > 0 &&
      g.deck.length + Math.max(0, g.discard.length - 1) >= 2);
    if (wf) {
      sk.uses--;
      var uids = [];
      for (var i = 0; i < 2; i++) {
        if (drawOne(g, p)) uids.push(p.hand[p.hand.length - 1].uid);
      }
      glog(g, p.name + ' 发动【顺风手】，摸 2 张选 1 张');
      if (uids.length === 2) {
        g.awaiting = { type: 'windfall' };
        g.windfallUids = uids;
        return { ok: true, windfall: true, uids: uids };
      }
      /* 牌堆不够 2 张：退回普通摸牌流程 */
      sk.uses++;
      glog(g, '牌堆不足，【顺风手】未消耗次数');
    }
    var c = drawOne(g, p);
    if (!c) {
      glog(g, p.name + ' 无牌可摸，跳过回合');
      clearPortalWaste(g);
      step(g, 1);
      endTurn(g);
      return { ok: true, passed: true };
    }
    var card = p.hand[p.hand.length - 1];
    glog(g, p.name + ' 摸了一张牌');
    if (E.playable(g, card)) {
      g.awaiting = { type: 'drawn' };
      g.drawnUid = card.uid;
      return { ok: true, playable: true, uid: card.uid };
    }
    clearPortalWaste(g);
    step(g, 1);
    endTurn(g);
    return { ok: true, playable: false };
  };

  /* 顺风手：从摸到的 2 张里保留 1 张，另 1 张塞回牌堆底 */
  E.windfallKeep = function (g, seat, keepUid) {
    if (g.over) return { ok: false, err: '对局已结束' };
    if (!g.awaiting || g.awaiting.type !== 'windfall') return { ok: false, err: '没有待选的牌' };
    if (g.turn !== seat) return { ok: false, err: '还没轮到你' };
    var uids = g.windfallUids || [];
    if (uids.indexOf(keepUid) < 0) return { ok: false, err: '请选择刚摸到的牌' };
    var p = g.players[seat];
    var other = uids.filter(function (u) { return u !== keepUid; })[0];
    for (var i = 0; i < p.hand.length; i++) {
      if (p.hand[i].uid === other) { g.deck.unshift(p.hand.splice(i, 1)[0]); break; }
    }
    glog(g, p.name + ' 保留了 1 张，另 1 张塞回牌堆底');
    g.awaiting = null;
    g.windfallUids = null;
    var kept = null;
    p.hand.forEach(function (c) { if (c.uid === keepUid) kept = c; });
    if (kept && E.playable(g, kept)) {
      g.awaiting = { type: 'drawn' };
      g.drawnUid = keepUid;
      return { ok: true, playable: true, uid: keepUid };
    }
    clearPortalWaste(g);
    step(g, 1);
    endTurn(g);
    return { ok: true };
  };

  /* 偷天换日：送出 1 张手牌，与目标随机盲换（不消耗回合） */
  E.useSwap = function (g, seat, uid, target) {
    if (g.over) return { ok: false, err: '对局已结束' };
    if (g.turn !== seat) return { ok: false, err: '只能在自己回合使用' };
    if (g.awaiting) return { ok: false, err: '请先处理摸到的牌' };
    var p = g.players[seat];
    var sk = g.skillMode && p.skill;
    if (!sk || sk.id !== 'swap' || sk.uses <= 0) return { ok: false, err: '技能不可用' };
    if (target == null || target === seat || !g.players[target]) return { ok: false, err: '请选择交换对手' };
    var t = g.players[target];
    if (guardBlock(g, target, '偷天换日')) { sk.uses--; return { ok: true, blocked: true }; }
    if (!t.hand.length) return { ok: false, err: '对方没有手牌' };
    var idx = -1;
    p.hand.forEach(function (c, i) { if (c.uid === uid) idx = i; });
    if (idx < 0) return { ok: false, err: '这张牌不在你手里' };
    var mine = p.hand.splice(idx, 1)[0];
    var theirs = t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0];
    p.hand.push(theirs);
    t.hand.push(mine);
    sk.uses--;
    glog(g, p.name + ' 对 ' + t.name + ' 使用【偷天换日】，盲换了一张手牌');
    return { ok: true };
  };

  /* 天眼：偷看目标手牌直到回合结束 */
  E.useEye = function (g, seat, target) {
    if (g.over) return { ok: false, err: '对局已结束' };
    if (g.turn !== seat) return { ok: false, err: '只能在自己回合使用' };
    var p = g.players[seat];
    var sk = g.skillMode && p.skill;
    if (!sk || sk.id !== 'eye' || sk.uses <= 0) return { ok: false, err: '技能不可用' };
    if (target == null || target === seat || !g.players[target]) return { ok: false, err: '请选择查看对象' };
    if (guardBlock(g, target, '天眼')) { sk.uses--; return { ok: true, blocked: true }; }
    sk.uses--;
    g.peek = { by: seat, target: target };
    glog(g, p.name + ' 使用【天眼】，偷看了 ' + g.players[target].name + ' 的手牌');
    return { ok: true };
  };

  /* 主动技能通用校验 */
  function activeCheck(g, seat, skillId) {
    if (g.over) return { err: '对局已结束' };
    if (g.turn !== seat) return { err: '只能在自己回合使用' };
    if (g.awaiting) return { err: '请先处理摸到的牌' };
    var p = g.players[seat];
    var sk = g.skillMode && p.skill;
    if (!sk || sk.id !== skillId || sk.uses <= 0) return { err: '技能不可用' };
    return { p: p, sk: sk };
  }
  function targetCheck(g, seat, target, needCards) {
    if (target == null || target === seat || !g.players[target]) return { err: '请选择目标对手' };
    if (needCards && !g.players[target].hand.length) return { err: '对方没有手牌' };
    return { t: g.players[target] };
  }

  /* 稳如水豚：目标待命中则挡下这次技能（攻击者的次数照样消耗） */
  function guardBlock(g, targetSeat, byName) {
    var t = g.players[targetSeat];
    var s = g.skillMode && t.skill;
    if (s && s.id === 'wd' && s.armed) {
      s.armed = false;
      glog(g, t.name + ' 发动【稳如水豚】，稳稳挡住了 ' + byName + ' 的技能！');
      return true;
    }
    return false;
  }

  /* 待命：护身符/荆棘/急刹车/隐形斗篷需在自己回合先手动发动，触发时生效一次 */
  E.armSkill = function (g, seat, id) {
    if (ARM_SKILLS.indexOf(id) < 0) return { ok: false, err: '该技能无需待命' };
    var ck = activeCheck(g, seat, id);
    if (ck.err) return { ok: false, err: ck.err };
    if (ck.sk.armed) return { ok: false, err: '已经在待命中' };
    ck.sk.uses--;
    ck.sk.armed = true;
    glog(g, ck.p.name + ' 发动【' + E.SKILLS[id].name + '】，进入待命');
    return { ok: true };
  };

  /* 迷魂阵：强行反转方向，不消耗回合 */
  E.useReversal = function (g, seat) {
    var ck = activeCheck(g, seat, 'reversal');
    if (ck.err) return { ok: false, err: ck.err };
    ck.sk.uses--;
    g.dir *= -1;
    glog(g, ck.p.name + ' 发动【迷魂阵】，出牌方向反转！');
    return { ok: true };
  };

  /* 传送门：先锁定接替出牌者，出牌后生效 */
  E.armPortal = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'portal');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    ck.sk.uses--;
    g.portalTarget = { by: seat, target: target };
    glog(g, ck.p.name + ' 发动【传送门】，出牌后由 ' + tc.t.name + ' 接替出牌');
    return { ok: true };
  };

  /* 淘旧换新：弃 1 摸 1 */
  E.useRefresh = function (g, seat, uid) {
    var ck = activeCheck(g, seat, 'refresh');
    if (ck.err) return { ok: false, err: ck.err };
    var p = ck.p;
    var idx = -1;
    p.hand.forEach(function (c, i) { if (c.uid === uid) idx = i; });
    if (idx < 0) return { ok: false, err: '这张牌不在你手里' };
    var old = p.hand.splice(idx, 1)[0];
    g.discard.push(old);
    ck.sk.uses--;
    glog(g, p.name + ' 发动【淘旧换新】，弃掉 ' + E.cardLabel(old));
    var c = drawOne(g, p);
    if (!c) { glog(g, p.name + ' 无牌可摸，跳过回合'); clearPortalWaste(g); step(g, 1); endTurn(g); return { ok: true }; }
    var card = p.hand[p.hand.length - 1];
    glog(g, p.name + ' 重新摸了 1 张');
    if (E.playable(g, card)) {
      g.awaiting = { type: 'drawn' };
      g.drawnUid = card.uid;
      return { ok: true, playable: true, uid: card.uid };
    }
    clearPortalWaste(g);
    step(g, 1);
    endTurn(g);
    return { ok: true };
  };

  /* 摸鱼：不消耗回合摸 2 张 */
  E.useDraw2 = function (g, seat) {
    var ck = activeCheck(g, seat, 'draw3');
    if (ck.err) return { ok: false, err: ck.err };
    var got = 0;
    for (var i = 0; i < 2; i++) { if (drawOne(g, ck.p)) got++; }
    ck.sk.uses--;
    glog(g, ck.p.name + ' 发动【摸鱼】，不耗回合摸了 ' + got + ' 张');
    return { ok: true };
  };

  /* 乾坤挪移：整手互换（差值 ≤ 2） */
  E.useMSwap = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'mswap');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, true);
    if (tc.err) return { ok: false, err: tc.err };
    if (Math.abs(ck.p.hand.length - tc.t.hand.length) > 2) return { ok: false, err: '双方手牌数差不能超过 2' };
    if (guardBlock(g, target, '乾坤挪移')) { ck.sk.uses--; return { ok: true, blocked: true }; }
    var tmp = ck.p.hand;
    ck.p.hand = tc.t.hand;
    tc.t.hand = tmp;
    ck.sk.uses--;
    glog(g, ck.p.name + ' 与 ' + tc.t.name + ' 发动【乾坤挪移】，整手互换！' +
      ck.p.name + ' 现有 ' + ck.p.hand.length + ' 张');
    return { ok: true };
  };

  /* 叼走小鱼：随机抽对手 1 张入手 */
  E.useSteal = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'steal');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, true);
    if (tc.err) return { ok: false, err: tc.err };
    if (guardBlock(g, target, '叼走小鱼')) { ck.sk.uses--; return { ok: true, blocked: true }; }
    var card = tc.t.hand.splice(Math.floor(Math.random() * tc.t.hand.length), 1)[0];
    ck.p.hand.push(card);
    ck.sk.uses--;
    glog(g, ck.p.name + ' 对 ' + tc.t.name + ' 使用【叼走小鱼】，抽走 1 张手牌');
    return { ok: true };
  };

  /* 拆水坝：随机弃对手 1 张进弃牌堆 */
  E.useWreck = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'wreck');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, true);
    if (tc.err) return { ok: false, err: tc.err };
    if (guardBlock(g, target, '拆水坝')) { ck.sk.uses--; return { ok: true, blocked: true }; }
    var card = tc.t.hand.splice(Math.floor(Math.random() * tc.t.hand.length), 1)[0];
    g.discard.push(card);
    ck.sk.uses--;
    glog(g, ck.p.name + ' 对 ' + tc.t.name + ' 使用【拆水坝】，弃掉 1 张手牌');
    return { ok: true };
  };

  /* 拖延：目标下回合开始前罚摸 1 张 */
  E.useDelay = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'delay');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    ck.sk.uses--;
    g.delayed.push(target);
    glog(g, ck.p.name + ' 对 ' + tc.t.name + ' 使用【拖延】，其下回合先罚摸 1 张');
    return { ok: true };
  };

  /* 赌西瓜：押目标下次出牌的颜色 */
  E.useHex = function (g, seat, target, color) {
    var ck = activeCheck(g, seat, 'hex');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    if (E.COLORS.indexOf(color) < 0) return { ok: false, err: '请选择押注颜色' };
    if (guardBlock(g, target, '赌西瓜')) { ck.sk.uses--; return { ok: true, blocked: true }; }
    ck.sk.uses--;
    g.hex = { by: seat, target: target, color: color };
    glog(g, ck.p.name + ' 对 ' + tc.t.name + ' 使用【赌西瓜】，押下了一个颜色');
    return { ok: true };
  };

  /* 占卜师：看牌堆顶 3 张，可移 1 张到堆底 */
  E.useOracle = function (g, seat) {
    var ck = activeCheck(g, seat, 'oracle');
    if (ck.err) return { ok: false, err: ck.err };
    if (!g.deck.length) return { ok: false, err: '牌堆没有牌' };
    var n = Math.min(3, g.deck.length);
    ck.sk.uses--;
    g.oracleShow = { by: seat, cards: g.deck.slice(g.deck.length - n) };
    glog(g, ck.p.name + ' 使用【占卜师】，查看了牌堆顶 ' + n + ' 张');
    return { ok: true, cards: g.oracleShow.cards };
  };
  E.oracleMove = function (g, seat, uid) {
    if (g.over) return { ok: false, err: '对局已结束' };
    if (!g.oracleShow || g.oracleShow.by !== seat) return { ok: false, err: '没有待处理的占卜' };
    var card = null;
    g.oracleShow.cards.forEach(function (c) { if (c.uid === uid) card = c; });
    if (!card) return { ok: false, err: '请选择看过的牌' };
    var i = g.deck.indexOf(card);
    if (i >= 0) { g.deck.splice(i, 1); g.deck.unshift(card); }
    glog(g, g.players[seat].name + ' 把 1 张牌压到了牌堆底');
    g.oracleShow = null;
    return { ok: true };
  };
  E.oracleSkip = function (g, seat) {
    if (!g.oracleShow || g.oracleShow.by !== seat) return { ok: false, err: '没有待处理的占卜' };
    g.oracleShow = null;
    return { ok: true };
  };

  /* 换换果子：弃任意张手牌，摸等量（不消耗回合） */
  E.useBalance = function (g, seat, uids) {
    var ck = activeCheck(g, seat, 'jh');
    if (ck.err) return { ok: false, err: ck.err };
    if (!uids || !uids.length) return { ok: false, err: '至少选 1 张要弃的牌' };
    var p = ck.p;
    var cards = [];
    for (var i = 0; i < uids.length; i++) {
      var found = null;
      p.hand.forEach(function (c) { if (c.uid === uids[i]) found = c; });
      if (!found) return { ok: false, err: '有牌不在你手里' };
      if (cards.indexOf(found) >= 0) return { ok: false, err: '不要重复选牌' };
      cards.push(found);
    }
    cards.forEach(function (c) {
      p.hand.splice(p.hand.indexOf(c), 1);
      g.discard.push(c);
    });
    ck.sk.uses--;
    var got = 0;
    for (i = 0; i < cards.length; i++) { if (drawOne(g, p)) got++; }
    glog(g, p.name + ' 发动【换换果子】，弃 ' + cards.length + ' 张换新 ' + got + ' 张');
    return { ok: true };
  };

  /* 温泉派对：所有玩家各摸 1 张，自己继续出牌 */
  E.useHotSpring = function (g, seat) {
    var ck = activeCheck(g, seat, 'wq');
    if (ck.err) return { ok: false, err: ck.err };
    ck.sk.uses--;
    var got = 0;
    g.players.forEach(function (p) { if (drawOne(g, p)) got++; });
    glog(g, ck.p.name + ' 发动【温泉派对】，大家泡着温泉各摸了 1 张（共 ' + got + ' 张）');
    return { ok: true };
  };

  /* 水花四溅：除自己外所有玩家各罚摸 1 张 */
  E.useSplash = function (g, seat) {
    var ck = activeCheck(g, seat, 'sh');
    if (ck.err) return { ok: false, err: ck.err };
    ck.sk.uses--;
    var got = 0;
    g.players.forEach(function (p) {
      if (p.id !== seat && drawOne(g, p)) got++;
    });
    glog(g, ck.p.name + ' 发动【水花四溅】，溅了大家一身，其他玩家共罚摸 ' + got + ' 张');
    return { ok: true };
  };

  /* 瞌睡虫：目标跳过下个回合 */
  E.useSleep = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'ks');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    if ((g.sleepy || []).indexOf(target) >= 0) return { ok: false, err: '他已经在打瞌睡了' };
    ck.sk.uses--;
    g.sleepy.push(target);
    glog(g, ck.p.name + ' 对 ' + tc.t.name + ' 使用【瞌睡虫】，其下个回合要睡过去了');
    return { ok: true };
  };

  /* 臭屁炸弹：目标下下个回合开始时罚摸 3 张 */
  E.useBomb = function (g, seat, target) {
    var ck = activeCheck(g, seat, 'cp');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    if (g.bomb) return { ok: false, err: '场上有炸弹还没炸' };
    ck.sk.uses--;
    g.bomb = { seat: target, count: 2 };
    glog(g, ck.p.name + ' 悄悄在 ' + tc.t.name + ' 身边放了颗【臭屁炸弹】…');
    return { ok: true };
  };

  /* 叶子快递：从对手 A 随机抽 1 张塞给对手 B */
  E.useLeaf = function (g, seat, from, to) {
    var ck = activeCheck(g, seat, 'yz');
    if (ck.err) return { ok: false, err: ck.err };
    var fc = targetCheck(g, seat, from, true);
    if (fc.err) return { ok: false, err: '请选择被抽牌的对手' };
    if (to == null || to === seat || to === from || !g.players[to]) return { ok: false, err: '请选择收件的对手' };
    var card = fc.t.hand.splice(Math.floor(Math.random() * fc.t.hand.length), 1)[0];
    g.players[to].hand.push(card);
    ck.sk.uses--;
    glog(g, ck.p.name + ' 使用【叶子快递】，从 ' + fc.t.name + ' 那里抽 1 张寄给了 ' + g.players[to].name);
    return { ok: true };
  };

  /* 暴走柚子：本回合下一张 +2 翻倍成 +4 */
  E.useGrape = function (g, seat) {
    var ck = activeCheck(g, seat, 'bz');
    if (ck.err) return { ok: false, err: ck.err };
    ck.sk.uses--;
    g.grapeSeat = seat;
    glog(g, ck.p.name + ' 嗑了颗【暴走柚子】，本回合下一张 +2 翻倍！');
    return { ok: true };
  };

  /* 零食分享：给一位对手 2 张手牌，自己摸 1 张 */
  E.useSnack = function (g, seat, uids, target) {
    var ck = activeCheck(g, seat, 'ls');
    if (ck.err) return { ok: false, err: ck.err };
    var tc = targetCheck(g, seat, target, false);
    if (tc.err) return { ok: false, err: tc.err };
    if (!uids || uids.length !== 2) return { ok: false, err: '请选 2 张手牌送出' };
    var p = ck.p;
    var cards = [];
    for (var i = 0; i < uids.length; i++) {
      var found = null;
      p.hand.forEach(function (c) { if (c.uid === uids[i]) found = c; });
      if (!found) return { ok: false, err: '有牌不在你手里' };
      if (cards.indexOf(found) >= 0) return { ok: false, err: '不要重复选牌' };
      cards.push(found);
    }
    cards.forEach(function (c) {
      p.hand.splice(p.hand.indexOf(c), 1);
      tc.t.hand.push(c);
    });
    ck.sk.uses--;
    var got = drawOne(g, p) ? 1 : 0;
    glog(g, ck.p.name + ' 把 2 张【零食分享】给了 ' + tc.t.name + '，自己摸了 ' + got + ' 张');
    return { ok: true };
  };

  /* 连击：放弃追加，正常轮转 */
  E.passCombo = function (g) {
    if (g.comboSeat == null) return { ok: false, err: '没有连击机会' };
    var p = g.players[g.turn];
    g.comboSeat = null;
    clearPortalWaste(g);
    glog(g, p.name + ' 放弃了连击');
    step(g, 1);
    endTurn(g);
    return { ok: true };
  };

  /* 选技能（开局 3 选 1） */
  E.assignSkill = function (g, seat, id) {
    if (!g.skillMode) return { ok: false, err: '不是技能模式' };
    var p = g.players[seat];
    if (!p || p.skill) return { ok: false, err: '已经选过技能了' };
    var ch = g.skillChoices && g.skillChoices[seat] || [];
    if (ch.indexOf(id) < 0) return { ok: false, err: '不是候选技能' };
    p.skill = { id: id, uses: E.SKILLS[id].uses, armed: false };
    glog(g, p.name + ' 选择技能：' + E.SKILLS[id].icon + E.SKILLS[id].name);
    return { ok: true };
  };

  /* 幸运数字可用判定（供 UI 高亮） */
  E.luckyReady = function (g, seat) {
    if (!g.skillMode) return false;
    var p = g.players[seat];
    return !!(p && p.skill && p.skill.id === 'lucky' && p.skill.uses > 0);
  };

  /* 摸到能出的牌但选择保留 */
  E.passDrawn = function (g) {
    if (!g.awaiting || g.awaiting.type !== 'drawn') return { ok: false, err: '没有待决定的牌' };
    var p = g.players[g.turn];
    glog(g, p.name + ' 保留了刚摸的牌');
    g.awaiting = null;
    g.drawnUid = -1;
    clearPortalWaste(g);
    step(g, 1);
    endTurn(g);
    return { ok: true };
  };

  /* 按 UNO 按钮：本人先按 = 喊话安全；对手先按 = 抓罚 +2。先按先得 */
  E.unoPress = function (g, seat) {
    if (g.over || g.unoPending == null || g.unoPending < 0) return { ok: false, err: '现在没有 UNO 可喊' };
    if (Date.now() > g.unoDeadline + 1500) return { ok: false, err: '太慢了' };
    if (g.unoPending === seat) {
      glog(g, g.players[seat].name + '：UNO！');
      g.unoPending = -1;
      return { ok: true };
    }
    var victim = g.players[g.unoPending];
    var got = 0;
    for (var i = 0; i < 2; i++) { if (drawOne(g, victim)) got++; }
    g.unoPending = -1;
    glog(g, g.players[seat].name + ' 抓住 ' + victim.name + ' 没喊 UNO，罚摸 ' + got + ' 张！');
    return { ok: true, caught: true };
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
