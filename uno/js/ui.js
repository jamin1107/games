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
  var startCfg = { mode: 'solo', count: 4, play: 'classic' };
  var unoTimer = null;        // UNO 倒计时/超时惩罚
  var unoShoutTimer = null;   // AI 自动喊话
  var skillPickOpen = false;  // 技能选择弹层状态
  var swapPick = -1;          // 偷天换日：等待点选要送出的手牌
  var eyeShownFor = -1;       // 天眼弹层当前展示的目标
  var AVATAR_COLORS = ['#e0533f', '#3f7fe0', '#43a86b', '#b07d14'];
  var AVATAR_IMGS = ['assets/avatar-r.jpg', 'assets/avatar-b.jpg', 'assets/avatar-g.jpg', 'assets/avatar-y.jpg'];

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

  function faceImg(c) {
    if (/^[0-9]$/.test(c.k)) return 'assets/face-' + c.c + c.k + '.jpg';
    return 'assets/face-' + c.c + '.jpg';
  }

  function cardHTML(c, extraCls) {
    var cls = 'ucard c-' + c.c + (extraCls ? ' ' + extraCls : '');
    if (c.c === 'w') cls += ' c-w';
    var v = esc(valText(c));
    var oval;
    if (c.c === 'w') {
      oval = '<b class="uc-val">' + v + '</b>';
    } else {
      oval = '<img class="uc-art" src="' + faceImg(c) + '" alt="">';
    }
    return '<div class="' + cls + '" data-uid="' + c.uid + '">' +
      '<i class="uc-corner tl">' + v + '</i>' +
      '<span class="uc-oval">' + oval + '</span>' +
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
      var skChip = (g.skillMode && p.skill)
        ? '<span class="opp-skill">' + E.SKILLS[p.skill.id].icon + (p.skill.uses > 0 ? '×' + p.skill.uses : '') + '</span>'
        : '';
      var backs = '';
      var shown = Math.min(p.hand.length, 6);
      for (var i = 0; i < shown; i++) backs += '<i class="mini-back" style="transform:rotate(' + ((i - shown / 2) * 4) + 'deg)"></i>';
      if (p.hand.length > 6) backs += '<i class="mini-more">+' + (p.hand.length - 6) + '</i>';
      ops += '<div class="opp' + (isTurn ? ' turn' : '') + '">' +
        '<div class="opp-top">' +
          '<div class="opp-avwrap">' +
            '<span class="opp-avatar" style="border-color:' + AVATAR_COLORS[p.id % AVATAR_COLORS.length] + '"><img src="' + AVATAR_IMGS[p.id % AVATAR_IMGS.length] + '" alt=""></span>' +
            uno +
          '</div>' +
          '<div class="opp-id"><div class="opp-name">' + esc(p.name) + skChip + think + '</div>' +
          '<div class="opp-count">' + p.hand.length + ' 张</div></div>' +
        '</div>' +
        '<div class="opp-cards">' + backs + '</div>' +
        '</div>';
    });
    $('opponents').innerHTML = ops;

    /* 牌桌 */
    var dc = E.deckCount(g);
    $('draw-count').textContent = dc;
    var tail = g.discardTail || (g.discard ? g.discard.slice(-3) : [g.top]);
    var dhtml = '';
    tail.forEach(function (c, i) {
      if (c.uid === g.top.uid) return;
      dhtml += '<div class="dp-under" style="transform:translate(-50%,-50%) rotate(' + ((i - tail.length) * 9) + 'deg)">' + cardHTML(c) + '</div>';
    });
    dhtml += cardHTML(g.top);
    $('discard').innerHTML = dhtml;
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
    var wf9 = canPlay && E.wild9Ready(g, me);
    var wfUids = (g.awaiting && g.awaiting.type === 'windfall' && g.windfallUids) || [];
    var h = '';
    hand.forEach(function (c) {
      var natural = E.playable(g, c);
      var playable = canPlay && natural;
      var skill9 = false;
      if (!playable && wf9 && c.k === '9') { playable = true; skill9 = true; }
      var isWf = wfUids.indexOf(c.uid) >= 0;
      var isDrawn = c.uid === g.drawnUid;
      var cls = '';
      if (playable) cls += skill9 ? ' playable skill9' : ' playable';
      else cls += ' dim';
      if (isDrawn || isWf) cls += ' drawn';
      h += cardHTML(c, cls);
    });
    var handEl = $('hand');
    handEl.classList.toggle('tight', my.hand.length > 8);
    handEl.innerHTML = h;
    $('hand-meta').textContent = my.hand.length + ' 张手牌' +
      (swapPick >= 0 ? ' · 🔄 点一张要送出的牌' : '');

    /* UNO 喊话按钮 */
    var ub = $('uno-btn');
    if (ub) {
      if (!g.over && g.unoPending === me) ub.classList.remove('hidden');
      else ub.classList.add('hidden');
    }

    /* 技能按钮 */
    var skb = $('skill-btn');
    if (skb) {
      if (g.skillMode && my.skill) {
        var sinfo = E.SKILLS[my.skill.id];
        skb.classList.remove('hidden');
        skb.textContent = swapPick >= 0 ? '🔄 点手牌取消' : sinfo.icon + ' ' + sinfo.name + ' ×' + my.skill.uses;
        skb.classList.toggle('empty', my.skill.uses <= 0 && swapPick < 0);
      } else {
        skb.classList.add('hidden');
      }
    }

    /* AI 剩 1 张自动喊话（单机/房主驱动） */
    if (!g.over && g.unoPending >= 0 && !g.players[g.unoPending].isHuman &&
        (mode !== 'net' || (UI.net && UI.net.role === 'host'))) {
      clearTimeout(unoShoutTimer);
      unoShoutTimer = setTimeout(function () {
        if (!g || g.over || g.unoPending < 0 || g.players[g.unoPending].isHuman) return;
        E.shoutUno(g, g.unoPending);
        UI.render();
      }, 600 + Math.random() * 600);
    }

    ensureUnoTimer();

    /* 提示与操作条 */
    var hint = '';
    var ab = '';
    if (g.over) {
      hint = '对局结束';
    } else if (isMyTurn && g.awaiting && g.awaiting.type === 'windfall') {
      hint = '🍀 顺风手：点一张刚摸的牌保留，另一张塞回牌堆底';
    } else if (isMyTurn && g.awaiting && g.awaiting.type === 'drawn') {
      hint = '摸到的牌可以出，出还是留着？';
      ab += '<button class="btn primary" data-act="play-drawn">出这张</button>';
      ab += '<button class="btn" data-act="keep">保留并过牌</button>';
    } else if (isMyTurn && g.comboSeat === me) {
      hint = '⚡ 连击！可以立刻追加出一张';
      ab += '<button class="btn" data-act="combopass">跳过连击</button>';
    } else if (isMyTurn) {
      hint = '轮到你了：点一张能跟上的牌，或摸一张';
      ab += '<button class="btn primary" data-act="draw">摸一张牌</button>';
    } else {
      var cur = g.players[g.turn];
      hint = '等待 ' + cur.name + (cur.isHuman ? '' : ' 思考中…');
    }
    $('hint-line').textContent = hint;
    $('actionbar').innerHTML = ab;

    /* 天眼：偷看弹层（本地/联机统一由 g.peek 驱动） */
    if (g.peek && g.peek.by === me && !g.over && eyeShownFor !== g.peek.target) {
      eyeShownFor = g.peek.target;
      openEyeSheet(g.peek.target);
    }
    if ((!g.peek || g.peek.by !== me) && eyeShownFor >= 0) eyeShownFor = -1;

    /* 开局选技能弹层（每人一次） */
    if (g.skillMode && !g.over && my.skill == null && g.skillChoices && g.skillChoices[me] && !skillPickOpen) {
      skillPickOpen = true;
      openSkillPick();
    }

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
      /* 连击中：能出就追加，否则放弃 */
      if (g.comboSeat === cur2.id) {
        var pk = AI.pick(g, cur2);
        if (pk) E.playCard(g, pk.uid, pk.color);
        else E.passCombo(g);
      } else {
        AI.maybeUtility(g, cur2);
        var pick = AI.pick(g, cur2);
        if (pick) {
          E.playCard(g, pick.uid, pick.color);
        } else if (g.turn === cur2.id && !g.awaiting) {
          var r = E.drawCard(g, AI.wantWindfall(g, cur2));
          if (r && r.windfall) {
            AI.windfallKeep(g, cur2);
            if (g.awaiting && g.awaiting.type === 'drawn') {
              var dc2 = cur2.hand.filter(function (c) { return c.uid === g.drawnUid; })[0];
              if (dc2) E.playCard(g, dc2.uid, dc2.c === 'w' ? AI.chooseColor(g, cur2) : null);
            }
          } else if (r && r.playable) {
            var card = cur2.hand.filter(function (c) { return c.uid === r.uid; })[0];
            E.playCard(g, r.uid, card && card.c === 'w' ? AI.chooseColor(g, cur2) : null);
          }
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

  function isGuest() {
    return mode === 'net' && UI.net && UI.net.role === 'guest';
  }

  function doPlay(uid, color) {
    if (isGuest()) {
      Net.sendAction({ a: 'play', uid: uid, color: color });
      return;
    }
    var r = E.playCard(g, uid, color);
    if (!r.ok) { UI.toastMsg(r.err || '不能出这张牌'); UI.render(); return; }
    commit();
  }

  function doDraw(wf) {
    if (isGuest()) {
      Net.sendAction({ a: 'draw', wf: wf ? 1 : undefined });
      return;
    }
    var r = E.drawCard(g, wf);
    if (!r.ok) { UI.toastMsg(r.err || '不能摸牌'); return; }
    commit();
  }

  function doKeep() {
    if (isGuest()) {
      Net.sendAction({ a: 'keep' });
      return;
    }
    var r = E.passDrawn(g);
    if (!r.ok) { UI.toastMsg(r.err || '无法过牌'); return; }
    commit();
  }

  /* 技能动作（本地直调 / 联机发 action） */
  function doSkill(msg, localFn) {
    if (isGuest()) { Net.sendAction(msg); return true; }
    var r = localFn();
    if (!r.ok) { UI.toastMsg(r.err || '技能使用失败'); UI.render(); return false; }
    commit();
    return true;
  }

  function doSwap(uid, target) {
    swapPick = -1;
    doSkill({ a: 'skill', s: 'swap', uid: uid, target: target }, function () {
      return E.useSwap(g, me, uid, target);
    });
  }

  function doEye(target) {
    doSkill({ a: 'skill', s: 'eye', target: target }, function () {
      return E.useEye(g, me, target);
    });
  }

  function doWfKeep(uid) {
    doSkill({ a: 'skill', s: 'wfkeep', uid: uid }, function () {
      return E.windfallKeep(g, me, uid);
    });
  }

  function doPassCombo() {
    doSkill({ a: 'skill', s: 'combopass' }, function () {
      return E.passCombo(g);
    });
  }

  /* 喊 UNO */
  function doShout() {
    if (!g || g.over || g.unoPending !== me) return;
    if (mode === 'net' && UI.net && UI.net.role === 'guest') {
      Net.sendAction({ a: 'uno' });
      var ub = $('uno-btn');
      if (ub) ub.disabled = true;
      setTimeout(function () { if (ub) ub.disabled = false; }, 1500);
      return;
    }
    var r = E.shoutUno(g, me);
    if (!r.ok) { UI.toastMsg(r.err || '现在不能喊'); return; }
    UI.render();
  }

  /* UNO 倒计时：显示剩余时间，超时（单机/房主）执行罚摸 */
  function ensureUnoTimer() {
    clearInterval(unoTimer);
    unoTimer = setInterval(function () {
      if (!g || g.over || g.unoPending == null || g.unoPending < 0) return;
      var ub = $('uno-btn');
      if (g.unoPending === me && ub) {
        var left = Math.max(0, (g.unoDeadline - Date.now()) / 1000);
        ub.textContent = 'UNO! ' + left.toFixed(1) + 's';
      }
      if (Date.now() > g.unoDeadline + 1500 &&
          (mode !== 'net' || (UI.net && UI.net.role === 'host'))) {
        if (E.unoExpired(g)) { UI.render(); UI.pump(); }
      }
    }, 250);
  }

  /* ---------------- 弹层 ---------------- */

  function openColorSheet(uid, isSkill9) {
    pendingWild = uid;
    var head = isSkill9
      ? '<div class="sheet-head"><h2>🌈 变色九</h2><p>这张 9 跟不上牌面，消耗 1 次技能，指定任意颜色打出。</p></div>'
      : '<div class="sheet-head"><h2>选一个颜色</h2><p>这张是万能牌，出完后由你指定后续颜色。</p></div>';
    var btns = E.COLORS.map(function (c) {
      return '<button class="color-btn dot-' + c + '" data-color="' + c + '">' + E.COLOR_NAME[c] + '</button>';
    }).join('');
    openSheet(head + '<div class="color-grid">' + btns + '</div>');
    Array.prototype.forEach.call(document.querySelectorAll('.color-btn'), function (b) {
      b.addEventListener('click', function () {
        var uid2 = pendingWild;
        pendingWild = -1;
        closeSheet();
        doPlay(uid2, b.getAttribute('data-color'));
      });
    });
  }

  /* 开局选技能（3 选 1） */
  function openSkillPick() {
    var ch = (g.skillChoices && g.skillChoices[me]) || [];
    var cards = ch.map(function (id) {
      var s = E.SKILLS[id];
      return '<button class="skill-card" data-sid="' + id + '">' +
        '<span class="sc-icon">' + s.icon + '</span>' +
        '<b class="sc-name">' + s.name + '</b>' +
        '<span class="sc-desc">' + esc(s.desc) + '</span>' +
        '<span class="sc-uses">每局 ' + s.uses + ' 次</span>' +
        '</button>';
    }).join('');
    openSheet(
      '<div class="sheet-head"><h2>选择你的技能</h2><p>本局专属技能，选定为后不可更换。</p></div>' +
      '<div class="skill-grid">' + cards + '</div>'
    );
    Array.prototype.forEach.call(document.querySelectorAll('.skill-card'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-sid');
        closeSheet();
        if (isGuest()) {
          /* 客人：发送选票，等待房主视图确认（保持 skillPickOpen 防止重复弹层） */
          Net.sendAction({ a: 'skill', s: 'pick', id: id });
          return;
        }
        skillPickOpen = false;
        var r = E.assignSkill(g, me, id);
        if (!r.ok) { UI.toastMsg(r.err || '选择失败'); return; }
        commit();
      });
    });
  }

  /* 天眼：查看对手手牌 */
  function openEyeSheet(target) {
    var t = g.players[target];
    if (!t) return;
    var cards = t.hand.map(function (c) { return cardHTML(c); }).join('');
    openSheet(
      '<div class="sheet-head"><h2>👁️ 天眼 · ' + esc(t.name) + ' 的手牌</h2><p>共 ' + t.hand.length +
      ' 张，视野持续到你的回合结束。</p></div>' +
      '<div class="eye-hand">' + (cards || '<p class="net-tip">对方没有手牌。</p>') + '</div>' +
      '<div class="sheet-foot"><button class="btn primary" id="eye-ok">知道了</button></div>'
    );
    var ok = $('eye-ok');
    if (ok) ok.addEventListener('click', closeSheet);
  }

  /* 通用目标选择 */
  function openTargetSheet(title, sub, cb) {
    var items = '';
    g.players.forEach(function (p) {
      if (p.id === me) return;
      items += '<button class="tgt-btn" data-seat="' + p.id + '">' +
        '<b>' + esc(p.name) + '</b><span>' + p.hand.length + ' 张手牌</span></button>';
    });
    openSheet(
      '<div class="sheet-head"><h2>' + title + '</h2><p>' + sub + '</p></div>' +
      '<div class="tgt-list">' + items + '</div>'
    );
    Array.prototype.forEach.call(document.querySelectorAll('.tgt-btn'), function (b) {
      b.addEventListener('click', function () {
        var seat = Number(b.getAttribute('data-seat'));
        closeSheet();
        cb(seat);
      });
    });
  }

  /* 技能按钮点击 */
  function onSkillBtn() {
    if (!g || g.over || !g.skillMode || !g.players[me].skill) return;
    /* 偷天换日选牌中：再点一次取消 */
    if (swapPick >= 0) { swapPick = -1; UI.render(); return; }
    var sk = g.players[me].skill;
    var info = E.SKILLS[sk.id];
    if (sk.uses <= 0) { UI.toastMsg(info.name + ' 的次数已用完'); return; }
    var myTurn = g.turn === me && !g.over;
    if (sk.id === 'wild9') { UI.toastMsg('🌈 出数字 9 时点那张 9，即可声明任意颜色'); return; }
    if (sk.id === 'shield') { UI.toastMsg('🛡️ 被动技能：被 +2 / +4 罚牌时自动反弹'); return; }
    if (!myTurn) { UI.toastMsg('只能在自己回合使用'); return; }
    if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
    if (g.comboSeat === me) { UI.toastMsg('连击期间不能使用技能'); return; }
    if (sk.id === 'windfall') {
      openSheet(
        '<div class="sheet-head"><h2>🍀 顺风手</h2><p>放弃普通摸牌，改为摸 2 张并选 1 张保留，另 1 张塞回牌堆底。剩余 ' + sk.uses + ' 次。</p></div>' +
        '<div class="sheet-foot"><button class="btn primary" id="wf-go">发动</button>' +
        '<button class="btn" id="wf-cancel">取消</button></div>'
      );
      $('wf-go').addEventListener('click', function () { closeSheet(); doDraw(true); });
      $('wf-cancel').addEventListener('click', closeSheet);
      return;
    }
    if (sk.id === 'swap') {
      openTargetSheet('🔄 偷天换日', '选一位对手盲换：你送出 1 张手牌，随机抽他 1 张。剩余 ' + sk.uses + ' 次。', function (seat) {
        swapPick = seat;
        UI.toastMsg('点一张要送出的手牌（再点技能按钮取消）');
        UI.render();
      });
      return;
    }
    if (sk.id === 'eye') {
      openTargetSheet('👁️ 天眼', '选一位对手偷看全部手牌，直到你的回合结束。剩余 ' + sk.uses + ' 次。', function (seat) {
        doEye(seat);
      });
    }
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
      '<p><b>喊 UNO</b>：打到只剩 1 张时，4 秒内点手牌旁的 UNO！按钮；忘记喊被抓到要罚摸 1 张。AI 也会喊。</p>' +
      '<p><b>技能模式</b>：开局每人从 3 个候选技能中选 1 个，每局限定使用次数——' +
      '🌈变色九（9 当万能出）、🛡️护身符（反弹 +2/+4）、🍀顺风手（摸2选1）、🔄偷天换日（盲换手牌）、⚡连击（追加出一张）、👁️天眼（看对手手牌）。</p>' +
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
      g = E.createGame({ playerCount: g.players.length, humanIds: humanIds, names: names, skillMode: UI.skillMode });
      UI.g = g;
      me = 0;
      resultsShown = false;
      skillPickOpen = false;
      swapPick = -1;
      eyeShownFor = -1;
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
      if (humanFlags ? humanFlags[i] : i === 0) humanIds.push(i);
      nm.push(names && names[i] ? names[i] : (i === 0 ? '你' : 'AI·' + i));
    }
    UI.skillMode = startCfg.play === 'skill';
    g = E.createGame({ playerCount: count, humanIds: humanIds, names: nm, skillMode: UI.skillMode });
    mode = 'solo';
    me = 0;
    UI.g = g;
    UI.me = 0;
    UI.net = null;
    resultsShown = false;
    skillPickOpen = false;
    swapPick = -1;
    eyeShownFor = -1;
    var s = $('start'); if (s) s.classList.add('hidden');
    UI.render();
    UI.pump();
  }

  /* ---------------- 联机钩子 ---------------- */

  UI.netMode = function () { mode = 'net'; };

  UI.netWelcome = function (seat) {
    mode = 'net';
    me = seat;
    UI.me = seat;
    UI.toastMsg('你已入座（座位 ' + (seat + 1) + '）');
  };

  UI.netState = function (view) {
    mode = 'net';
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
    Array.prototype.forEach.call(document.querySelectorAll('#skill-seg button'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#skill-seg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        startCfg.play = b.getAttribute('data-play');
        $('skill-note').textContent = startCfg.play === 'skill'
          ? '开局 3 选 1 技能，每局限定次数。'
          : '经典规则，原汁原味。';
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
    var btnUno = $('uno-btn');
    if (btnUno) btnUno.addEventListener('click', doShout);
    var btnSkill = $('skill-btn');
    if (btnSkill) btnSkill.addEventListener('click', onSkillBtn);

    /* 手牌点击（事件委托） */
    $('hand').addEventListener('click', function (ev) {
      var el = ev.target.closest('.ucard');
      if (!el) return;
      if (!g || g.over) return;
      var uid = Number(el.getAttribute('data-uid'));
      var my = g.players[me];
      var card = my.hand.filter(function (c) { return c.uid === uid; })[0];
      if (!card) return;
      /* 顺风手：从摸到的 2 张里选保留 */
      if (g.turn === me && g.awaiting && g.awaiting.type === 'windfall') {
        if ((g.windfallUids || []).indexOf(uid) < 0) { UI.toastMsg('请选择刚摸到的牌'); return; }
        doWfKeep(uid);
        return;
      }
      /* 偷天换日：选要送出的手牌 */
      if (swapPick >= 0) { doSwap(uid, swapPick); return; }
      if (g.turn !== me) { UI.toastMsg('还没轮到你'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      if (E.playable(g, card)) {
        if (card.c === 'w') { openColorSheet(uid, false); return; }
        doPlay(uid, null);
        return;
      }
      /* 变色九：跟不上的 9 可以声明颜色 */
      if (card.k === '9' && g.skillMode && my.skill && my.skill.id === 'wild9' && my.skill.uses > 0) {
        openColorSheet(uid, true);
        return;
      }
      UI.toastMsg('这张牌跟不上（需颜色或数字/功能相同）');
    });

    /* 摸牌堆点击 = 摸牌 */
    $('draw-pile').addEventListener('click', function () {
      if (!g || g.over) return;
      if (g.turn !== me) { UI.toastMsg('还没轮到你'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      if (g.comboSeat === me) { UI.toastMsg('连击中只能出牌或跳过'); return; }
      doDraw(false);
    });

    /* 操作条（事件委托） */
    $('actionbar').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'draw') doDraw(false);
      else if (act === 'keep') doKeep();
      else if (act === 'combopass') doPassCombo();
      else if (act === 'play-drawn') {
        var card = g.players[me].hand.filter(function (c) { return c.uid === g.drawnUid; })[0];
        if (!card) return;
        if (card.c === 'w') openColorSheet(card.uid, false);
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
