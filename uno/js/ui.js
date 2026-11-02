/* UNO · 界面与主循环 */
(function () {
  var E = window.UNO.Engine;
  var AI = window.UNO.AI;
  var Net = window.UNO.Net;
  var UI = (window.UNO.UI = {});

  var g = null;
  var mode = 'solo';          // solo | net
  var me = 0;
  var pumpTimer = null;
  var thinkingId = -1;        // 正在思考的 AI
  var resultsShown = false;
  var pendingWild = -1;       // 等待选颜色的牌
  var startCfg = { mode: 'solo', count: 4 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 基础组件 ---------------- */

  var toastTimer = null;
  UI.toastMsg = function (text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  };

  function openSheet(html) {
    var el = $('sheet');
    if (!el) return;
    el.innerHTML = '<div class="sheet-mask"></div><div class="sheet">' + html + '</div>';
    el.classList.remove('hidden');
    el.querySelector('.sheet-mask').addEventListener('click', closeSheet);
  }
  function closeSheet() {
    var el = $('sheet');
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  /* ---------------- 牌面 ---------------- */

  function valText(c) {
    if (c.k === 'skip') return '⊘';
    if (c.k === 'rev') return '⇄';
    if (c.k === 'd2') return '+2';
    if (c.k === 'w4') return '+4';
    if (c.k === 'wild') return '★';
    return c.k;
  }

  function cardHTML(c, extraCls) {
    var cls = 'ucard c-' + c.c + (extraCls ? ' ' + extraCls : '');
    if (c.c === 'w') cls += ' c-w';
    var v = esc(valText(c));
    return '<div class="' + cls + '" data-uid="' + c.uid + '">' +
      '<i class="uc-corner tl">' + v + '</i>' +
      '<i class="uc-oval"></i>' +
      '<b class="uc-val">' + v + '</b>' +
      '<i class="uc-corner br">' + v + '</i>' +
      '</div>';
  }

  /* ---------------- 渲染 ---------------- */

  UI.render = function () {
    if (!g) return;
    var my = g.players[me];
    var isMyTurn = g.turn === me && !g.over;

    /* 对手区 */
    var ops = '';
    g.players.forEach(function (p) {
      if (p.id === me) return;
      var isTurn = g.turn === p.id && !g.over;
      var uno = p.hand.length === 1 ? '<span class="uno-badge">UNO!</span>' : '';
      var think = (isTurn && thinkingId === p.id) ? '<span class="think-dot"></span>' : '';
      var backs = '';
      var shown = Math.min(p.hand.length, 6);
      for (var i = 0; i < shown; i++) backs += '<i class="mini-back"></i>';
      if (p.hand.length > 6) backs += '<i class="mini-more">+' + (p.hand.length - 6) + '</i>';
      ops += '<div class="opp' + (isTurn ? ' turn' : '') + '">' +
        '<div class="opp-cards">' + backs + '</div>' +
        '<div class="opp-name">' + esc(p.name) + uno + think + '</div>' +
        '<div class="opp-count">' + p.hand.length + ' 张</div>' +
        '</div>';
    });
    $('opponents').innerHTML = ops;

    /* 牌桌 */
    var dc = E.deckCount(g);
    $('draw-count').textContent = dc;
    $('discard').innerHTML = cardHTML(g.top);
    $('dir-arrow').textContent = g.dir === 1 ? '⟳' : '⟲';
    var ac = $('active-color');
    ac.className = 'active-color dot-' + g.color;
    $('active-color').title = E.COLOR_NAME[g.color];

    /* 动态条 */
    var last = g.log[g.log.length - 1];
    $('ticker-text').textContent = last ? last.t : '';
    if (g.over) $('ticker-text').textContent = g.players[g.winner].name + ' 获胜！';

    /* 手牌（排序：颜色→数字/功能） */
    var order = { r: 0, y: 1, g: 2, b: 3, w: 4 };
    var kindOrder = function (k) { return /^[0-9]$/.test(k) ? '0' + k : k; };
    var hand = my.hand.slice().sort(function (a, b) {
      return order[a.c] - order[b.c] || (kindOrder(a.k) < kindOrder(b.k) ? -1 : 1);
    });
    var canPlay = isMyTurn && !g.awaiting;
    var h = '';
    hand.forEach(function (c) {
      var playable = canPlay && E.playable(g, c);
      var isDrawn = c.uid === g.drawnUid;
      h += cardHTML(c, (playable ? ' playable' : ' dim') + (isDrawn ? ' drawn' : ''));
    });
    $('hand').innerHTML = h;
    $('hand-meta').textContent = my.hand.length + ' 张手牌';

    /* 提示与操作条 */
    var hint = '';
    var ab = '';
    if (g.over) {
      hint = '对局结束';
    } else if (isMyTurn && g.awaiting && g.awaiting.type === 'drawn') {
      hint = '摸到的牌可以出，出还是留着？';
      var drawn = my.hand.filter(function (c) { return c.uid === g.drawnUid; })[0];
      ab += '<button class="btn primary" data-act="play-drawn">出这张</button>';
      ab += '<button class="btn" data-act="keep">保留并过牌</button>';
    } else if (isMyTurn) {
      hint = '轮到你了：点一张能跟上的牌，或摸一张';
      ab += '<button class="btn primary" data-act="draw">摸一张牌</button>';
    } else {
      var cur = g.players[g.turn];
      hint = '等待 ' + cur.name + (cur.isHuman ? '' : ' 思考中…');
    }
    $('hint-line').textContent = hint;
    $('actionbar').innerHTML = ab;

    /* HUD 房间号 */
    var roomChip = $('hud-room');
    if (roomChip) roomChip.textContent = (UI.net && UI.net.room) ? '房间 ' + UI.net.room : '';

    if (mode === 'net') Net.sync();
  };

  /* ---------------- 主循环 ---------------- */

  UI.pump = function () {
    clearTimeout(pumpTimer);
    thinkingId = -1;
    if (!g || g.over) return;
    if (mode === 'net' && UI.net && UI.net.role !== 'host') return; // 客人等状态
    var cur = g.players[g.turn];
    if (cur.isHuman) return;
    thinkingId = cur.id;
    UI.render();
    pumpTimer = setTimeout(function () {
      if (!g || g.over) return;
      var cur2 = g.players[g.turn];
      if (cur2.isHuman) return;
      var pick = AI.pick(g, cur2);
      if (pick) {
        E.playCard(g, pick.uid, pick.color);
      } else {
        var r = E.drawCard(g);
        if (r && r.playable) {
          var card = cur2.hand.filter(function (c) { return c.uid === r.uid; })[0];
          E.playCard(g, r.uid, card && card.c === 'w' ? AI.chooseColor(g, cur2) : null);
        }
      }
      thinkingId = -1;
      UI.render();
      if (g.over) UI.showResults();
      else UI.pump();
    }, 950 + Math.random() * 650);
  };

  /* ---------------- 动作 ---------------- */

  function commit() {
    UI.render();
    if (g.over) { UI.showResults(); clearTimeout(pumpTimer); return; }
    UI.pump();
  }

  function doPlay(uid, color) {
    if (mode === 'net' && UI.net && UI.net.role === 'guest') {
      Net.sendAction({ a: 'play', uid: uid, color: color });
      return;
    }
    var r = E.playCard(g, uid, color);
    if (!r.ok) { UI.toastMsg(r.err || '不能出这张牌'); UI.render(); return; }
    commit();
  }

  function doDraw() {
    if (mode === 'net' && UI.net && UI.net.role === 'guest') {
      Net.sendAction({ a: 'draw' });
      return;
    }
    var r = E.drawCard(g);
    if (!r.ok) { UI.toastMsg(r.err || '不能摸牌'); return; }
    commit();
  }

  function doKeep() {
    if (mode === 'net' && UI.net && UI.net.role === 'guest') {
      Net.sendAction({ a: 'keep' });
      return;
    }
    var r = E.passDrawn(g);
    if (!r.ok) { UI.toastMsg(r.err || '无法过牌'); return; }
    commit();
  }

  /* ---------------- 弹层 ---------------- */

  function openColorSheet(uid) {
    pendingWild = uid;
    var btns = E.COLORS.map(function (c) {
      return '<button class="color-btn dot-' + c + '" data-color="' + c + '">' + E.COLOR_NAME[c] + '</button>';
    }).join('');
    openSheet(
      '<div class="sheet-head"><h2>选一个颜色</h2><p>这张是万能牌，出完后由你指定后续颜色。</p></div>' +
      '<div class="color-grid">' + btns + '</div>'
    );
    Array.prototype.forEach.call(document.querySelectorAll('.color-btn'), function (b) {
      b.addEventListener('click', function () {
        var uid2 = pendingWild;
        pendingWild = -1;
        closeSheet();
        doPlay(uid2, b.getAttribute('data-color'));
      });
    });
  }

  function openLogSheet() {
    if (!g) return;
    var items = g.log.slice().reverse().map(function (l) {
      return '<li><span class="log-n">#' + l.n + '</span>' + esc(l.t) + '</li>';
    }).join('');
    openSheet(
      '<div class="sheet-head"><h2>出牌记录</h2><p>本局全部动态，最新的在最上面。</p></div>' +
      '<ul class="log-list">' + (items || '<li class="log-empty">还没有动态</li>') + '</ul>'
    );
  }

  function openRulesSheet() {
    openSheet(
      '<div class="sheet-head"><h2>UNO 规则速览</h2></div>' +
      '<div class="sheet-body rules">' +
      '<p><b>目标</b>：最先出完手牌的人获胜。</p>' +
      '<p><b>出牌</b>：跟上牌堆顶的牌 —— <b>颜色相同</b>或<b>数字/功能相同</b>均可；万能牌随时可出。</p>' +
      '<p><b>功能牌</b>：⊘ 跳过下家；⇄ 反转方向（双人局等同跳过）；+2 / +4 让下家罚摸并跳过。</p>' +
      '<p><b>万能牌</b>：★ 换色自由出；+4 出完后由你指定颜色，下家摸 4 张。</p>' +
      '<p><b>摸牌</b>：无牌可出就摸一张；摸到的牌如果能出，可以立刻打出或保留。</p>' +
      '<p><b>UNO</b>：手上只剩 1 张牌时自动为你喊 UNO。</p>' +
      '</div>' +
      '<div class="sheet-foot"><button class="btn primary" id="sheet-ok">明白了</button></div>'
    );
    var ok = $('sheet-ok');
    if (ok) ok.addEventListener('click', closeSheet);
  }

  /* ---------------- 结算 ---------------- */

  UI.showResults = function () {
    if (resultsShown || !g || !g.over) return;
    resultsShown = true;
    clearTimeout(pumpTimer);
    var list = E.standings(g).map(function (s) {
      var medal = ['🥇', '🥈', '🥉'][s.rank - 1] || ('#' + s.rank);
      return '<div class="res-row' + (s.winner ? ' win' : '') + '">' +
        '<span class="res-rank">' + medal + '</span>' +
        '<span class="res-name">' + esc(s.name) + '</span>' +
        '<span class="res-left">' + (s.winner ? '出完全部手牌' : '剩 ' + s.left + ' 张') + '</span>' +
        '</div>';
    }).join('');
    var again = '';
    if (mode !== 'net' || (UI.net && UI.net.role === 'host')) {
      again = '<button class="btn primary big" id="res-again">再来一局</button>';
    }
    openSheet(
      '<div class="sheet-head"><h2>' + esc(g.players[g.winner].name) + ' 获胜！</h2><p>本局排名（按剩牌数）</p></div>' +
      '<div class="res-list">' + list + '</div>' +
      '<div class="sheet-foot col">' + again +
      '<button class="btn ghost small" id="res-home">回到首页</button></div>'
    );
    var ag = $('res-again');
    if (ag) ag.addEventListener('click', function () {
      closeSheet();
      resultsShown = false;
      restartGame();
    });
    $('res-home').addEventListener('click', function () { location.reload(); });
  };

  function restartGame() {
    if (mode === 'net' && UI.net && UI.net.role === 'host') {
      var humanIds = g.players.filter(function (p) { return p.isHuman; }).map(function (p) { return p.id; });
      var names = g.players.map(function (p) { return p.name; });
      g = E.createGame({ playerCount: g.players.length, humanIds: humanIds, names: names });
      UI.g = g;
      me = 0;
      resultsShown = false;
      UI.render();
      Net.broadcast();
      UI.pump();
      return;
    }
    startSolo(g.players.length, g.players.map(function (p) { return p.name; }),
      g.players.map(function (p) { return p.isHuman; }));
  }

  /* ---------------- 开局 ---------------- */

  function startSolo(count, names, humanFlags) {
    var humanIds = [], nm = [];
    for (var i = 0; i < count; i++) {
      if (!humanFlags || humanFlags[i]) humanIds.push(i);
      nm.push(names && names[i] ? names[i] : (i === 0 ? '你' : 'AI·' + i));
    }
    g = E.createGame({ playerCount: count, humanIds: humanIds, names: nm });
    mode = 'solo';
    me = 0;
    UI.g = g;
    UI.me = 0;
    UI.net = null;
    resultsShown = false;
    var s = $('start'); if (s) s.classList.add('hidden');
    UI.render();
    UI.pump();
  }

  /* ---------------- 联机钩子 ---------------- */

  UI.netWelcome = function (seat) {
    me = seat;
    UI.me = seat;
    UI.toastMsg('你已入座（座位 ' + (seat + 1) + '）');
  };

  UI.netState = function (view) {
    var wasOver = g && g.over;
    g = view;
    UI.g = view;
    if (view.mySeat != null) { me = view.mySeat; UI.me = view.mySeat; }
    thinkingId = -1;
    UI.render();
    if (view.over && !wasOver) UI.showResults();
    if (!view.over) resultsShown = false;
  };

  /* ---------------- 事件绑定 ---------------- */

  function bindOnce() {
    /* 开场 */
    Array.prototype.forEach.call(document.querySelectorAll('#mode-seg button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#mode-seg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        startCfg.mode = b.getAttribute('data-mode');
        $('mode-note').textContent = startCfg.mode === 'solo'
          ? '你 + ' + (startCfg.count - 1) + ' 位 AI 对手。'
          : '创建房间或扫码加入，真人 2–4 位，空位由 AI 补全。';
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#count-seg button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#count-seg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        startCfg.count = Number(b.getAttribute('data-count'));
        if (startCfg.mode === 'solo') $('mode-note').textContent = '你 + ' + (startCfg.count - 1) + ' 位 AI 对手。';
      });
    });
    var btnStart = $('btn-start');
    if (btnStart) btnStart.addEventListener('click', function () {
      if (startCfg.mode === 'solo') startSolo(startCfg.count);
      else UNO.Net.openLobby();
    });
    var btnRules = $('btn-rules');
    if (btnRules) btnRules.addEventListener('click', openRulesSheet);

    /* HUD */
    var btnHome = $('btn-home');
    if (btnHome) btnHome.addEventListener('click', function () { location.reload(); });
    var btnLog = $('btn-log');
    if (btnLog) btnLog.addEventListener('click', openLogSheet);
    var btnHelp = $('btn-help');
    if (btnHelp) btnHelp.addEventListener('click', openRulesSheet);

    /* 手牌点击（事件委托） */
    $('hand').addEventListener('click', function (ev) {
      var el = ev.target.closest('.ucard');
      if (!el) return;
      if (!g || g.over) return;
      if (g.turn !== me) { UI.toastMsg('还没轮到你'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      var uid = Number(el.getAttribute('data-uid'));
      var card = g.players[me].hand.filter(function (c) { return c.uid === uid; })[0];
      if (!card) return;
      if (!E.playable(g, card)) { UI.toastMsg('这张牌跟不上（需颜色或数字/功能相同）'); return; }
      if (card.c === 'w') { openColorSheet(uid); return; }
      doPlay(uid, null);
    });

    /* 摸牌堆点击 = 摸牌 */
    $('draw-pile').addEventListener('click', function () {
      if (!g || g.over) return;
      if (g.turn !== me) { UI.toastMsg('还没轮到你'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      doDraw();
    });

    /* 操作条（事件委托） */
    $('actionbar').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'draw') doDraw();
      else if (act === 'keep') doKeep();
      else if (act === 'play-drawn') {
        var card = g.players[me].hand.filter(function (c) { return c.uid === g.drawnUid; })[0];
        if (!card) return;
        if (card.c === 'w') openColorSheet(card.uid);
        else doPlay(card.uid, null);
      }
    });
  }

  function init() {
    bindOnce();
    if (!UNO.Net.handleHash()) {
      /* 无扫码入口，正常展示开场 */
    }
  }

  UI.closeSheet = closeSheet;
  UI.openRulesSheet = openRulesSheet;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
