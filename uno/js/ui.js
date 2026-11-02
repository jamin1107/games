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
  var unoShoutTimer = null;   // AI 自动喊话
  var unoCatchTimer = null;   // AI 抓 UNO
  var skillPickOpen = false;  // 技能选择弹层状态
  var swapPick = -1;          // 偷天换日：等待点选要送出的手牌
  var eyeShownFor = -1;       // 天眼弹层当前展示的目标
  var twinArm = false;        // 双子星：等待点选主数字牌
  var refreshPick = false;    // 淘旧换新：等待点选要弃掉的牌
  var pendingHexTarget = -1;  // 赌西瓜：等待押颜色的目标
  var oracleShown = false;    // 占卜师弹层已展示
  var AVATAR_COLORS = ['#e0533f', '#3f7fe0', '#43a86b', '#b07d14'];
  var AVATAR_IMGS = ['assets/avatar-r.jpg', 'assets/avatar-b.jpg', 'assets/avatar-g.jpg', 'assets/avatar-y.jpg'];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 联机视图下对手手牌被隐藏，张数走 handCount */
  function handN(p) { return p.handCount != null ? p.handCount : p.hand.length; }

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

  /* 联机大厅读取主菜单选的桌子大小 */
  UI.getStartCount = function () { return startCfg.count; };

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

    /* 对手区（联机视图下对手手牌被隐藏，张数走 handCount） */
    var ops = '';
    g.players.forEach(function (p) {
      if (p.id === me) return;
      var isTurn = g.turn === p.id && !g.over;
      var uno = handN(p) === 1 ? '<span class="uno-badge">UNO!</span>' : '';
      var think = (isTurn && thinkingId === p.id) ? '<span class="think-dot"></span>' : '';
      var skChip = (g.skillMode && p.skill)
        ? '<span class="opp-skill">' + E.SKILLS[p.skill.id].icon + (p.skill.uses > 0 ? '×' + p.skill.uses : '') + '</span>'
        : '';
      var marks = '';
      if (g.hex && g.hex.target === p.id) marks += '<span class="opp-skill">🎯</span>';
      if (g.delayed && g.delayed.length && g.delayed.indexOf(p.id) >= 0) marks += '<span class="opp-skill">⏳</span>';
      if (g.sleepy && g.sleepy.length && g.sleepy.indexOf(p.id) >= 0) marks += '<span class="opp-skill">😴</span>';
      if (g.bomb && g.bomb.seat === p.id) marks += '<span class="opp-skill">💨</span>';
      if (g.portalTarget && g.portalTarget.target === p.id) marks += '<span class="opp-skill">🌀</span>';
      if (p.skill && p.skill.armed) marks += '<span class="opp-skill">⚡</span>';
      var backs = '';
      var shown = Math.min(handN(p), 6);
      for (var i = 0; i < shown; i++) backs += '<i class="mini-back" style="transform:rotate(' + ((i - shown / 2) * 4) + 'deg)"></i>';
      if (handN(p) > 6) backs += '<i class="mini-more">+' + (handN(p) - 6) + '</i>';
      ops += '<div class="opp' + (isTurn ? ' turn' : '') + '">' +
        '<div class="opp-top">' +
          '<div class="opp-avwrap">' +
            '<span class="opp-avatar" style="border-color:' + AVATAR_COLORS[p.id % AVATAR_COLORS.length] + '"><img src="' + AVATAR_IMGS[p.id % AVATAR_IMGS.length] + '" alt=""></span>' +
            uno +
          '</div>' +
          '<div class="opp-id"><div class="opp-name">' + esc(p.name) + skChip + marks + think + '</div>' +
          '<div class="opp-count">' + handN(p) + ' 张</div></div>' +
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
    var wf9 = canPlay && E.luckyReady(g, me);
    var luckyNum = g.luckyNum != null ? String(g.luckyNum) : null;
    var wfUids = (g.awaiting && g.awaiting.type === 'windfall' && g.windfallUids) || [];
    var h = '';
    hand.forEach(function (c) {
      var natural = E.playable(g, c);
      var playable = canPlay && natural;
      var skill9 = false;
      if (!playable && wf9 && luckyNum && c.k === luckyNum) { playable = true; skill9 = true; }
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
      (my.skill && my.skill.armed ? ' · ⚡' + E.SKILLS[my.skill.id].name + '待命中' : '') +
      (swapPick >= 0 ? ' · 🔄 点一张要送出的牌' : '') +
      (twinArm ? ' · 👯 点一张能出的数字牌' : '') +
      (refreshPick ? ' · ♻️ 点一张要弃掉的牌' : '');

    /* UNO 按钮：有人剩 1 张时对所有人出现（本人先按=安全，对手先按=抓罚），无倒计时提示 */
    var ub = $('uno-btn');
    if (ub) {
      if (!g.over && g.unoPending >= 0) ub.classList.remove('hidden');
      else ub.classList.add('hidden');
    }

    /* 技能按钮 */
    var skb = $('skill-btn');
    if (skb) {
      if (g.skillMode && my.skill) {
        var sinfo = E.SKILLS[my.skill.id];
        skb.classList.remove('hidden');
        skb.textContent = swapPick >= 0 ? '🔄 点手牌取消' : sinfo.icon + ' ' + sinfo.name +
          (my.skill.armed ? ' ⚡待命' : '') + ' ×' + my.skill.uses;
        skb.classList.toggle('empty', my.skill.uses <= 0 && !my.skill.armed && swapPick < 0);
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
        E.unoPress(g, g.unoPending);
        UI.render();
        if (mode === 'net') Net.sync();
      }, 600 + Math.random() * 600);
    }

    /* AI 抓 UNO：人类剩 1 张没喊时，AI 随机时机抢按（未必每次都注意） */
    if (!g.over && g.unoPending >= 0 && !g.players[g.unoPending].isHuman &&
        (mode !== 'net' || (UI.net && UI.net.role === 'host'))) {
      clearTimeout(unoCatchTimer);
      unoCatchTimer = setTimeout(function () {
        if (!g || g.over || g.unoPending < 0 || g.players[g.unoPending].isHuman) return;
        if (Math.random() < 0.75) {
          var catchers = g.players.filter(function (p) { return !p.isHuman && p.id !== g.unoPending; });
          if (catchers.length && E.unoPress(g, catchers[Math.floor(Math.random() * catchers.length)].id).ok) {
            UI.render();
            if (mode === 'net') Net.sync();
          }
        }
      }, 1000 + Math.random() * 2200);
    }

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
    } else if (isMyTurn && g.penalty) {
      hint = '⚠️ ' + g.players[g.penalty.by].name + ' 把罚牌叠到 ' + g.penalty.n + ' 张：出匹配罚牌（' +
        (g.penalty.kind === 'w4' ? '仅能 +4' : '+2 或 +4') + '）续上，或认罚';
      ab += '<button class="btn primary" data-act="draw">认罚：摸 ' + g.penalty.n + ' 张</button>';
    } else if (isMyTurn) {
      hint = '轮到你了：点一张能跟上的牌，或摸一张';
      if (g.portalTarget && g.portalTarget.by === me) {
        hint = '🌀 传送门已锁定：出牌后由 ' + g.players[g.portalTarget.target].name + ' 接替 · ' + hint;
      }
      ab += '<button class="btn primary" data-act="draw">摸一张牌</button>';
    } else {
      var cur = g.players[g.turn];
      if (g.penalty) hint = '⚠️ 罚牌叠加中：' + cur.name + ' 决定接不接（共 ' + g.penalty.n + ' 张）';
      else hint = '等待 ' + cur.name + (cur.isHuman ? '' : ' 思考中…');
    }
    $('hint-line').textContent = hint;
    $('actionbar').innerHTML = ab;

    /* 天眼：偷看弹层（本地/联机统一由 g.peek 驱动） */
    if (g.peek && g.peek.by === me && !g.over && eyeShownFor !== g.peek.target) {
      eyeShownFor = g.peek.target;
      openEyeSheet(g.peek.target);
    }
    if ((!g.peek || g.peek.by !== me) && eyeShownFor >= 0) eyeShownFor = -1;

    /* 占卜师：看牌弹层 */
    if (g.oracleShow && g.oracleShow.by === me && !g.over && !oracleShown) {
      oracleShown = true;
      openOracleSheet();
    }
    if ((!g.oracleShow || g.oracleShow.by !== me) && oracleShown) oracleShown = false;

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
          E.playCard(g, pick.uid, pick.color, pick.twinUid);
        } else if (g.turn === cur2.id && !g.awaiting) {
          var rfUid = AI.wantRefresh ? AI.wantRefresh(g, cur2) : null;
          var r = rfUid != null ? E.useRefresh(g, cur2.id, rfUid)
                                : E.drawCard(g, AI.wantWindfall(g, cur2));
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

  function doPlay(uid, color, twinUid) {
    /* 客户端兜底：联机视图可能滞后于房主，发送前按当前视图再拦一道，
       避免「看着灰、其实已能出」的滞后窗口里把牌意外打出 */
    if (!twinUid && g && g.players[me]) {
      var card0 = g.players[me].hand.filter(function (c) { return c.uid === uid; })[0];
      if (card0 && !E.playable(g, card0)) {
        var luckyOk = g.skillMode && g.players[me].skill &&
          g.players[me].skill.id === 'lucky' && g.players[me].skill.uses > 0 &&
          g.luckyNum != null && card0.k === String(g.luckyNum) && color;
        if (!luckyOk) {
          UI.toastMsg('这张牌跟不上（需颜色或数字/功能相同）');
          UI.render();
          return;
        }
      }
    }
    if (isGuest()) {
      Net.sendAction({ a: 'play', uid: uid, color: color, twinUid: twinUid });
      return;
    }
    var r = E.playCard(g, uid, color, twinUid);
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

  function doReversal() {
    doSkill({ a: 'skill', s: 'reversal' }, function () {
      return E.useReversal(g, me);
    });
  }

  /* 待命型技能：先手动挂上，触发时自动生效 */
  function doArm(id) {
    var ok = doSkill({ a: 'skill', s: 'arm', id: id }, function () {
      return E.armSkill(g, me, id);
    });
    if (ok) UI.toastMsg(E.SKILLS[id].icon + ' ' + E.SKILLS[id].name + ' 已待命：条件达成时自动生效');
  }

  function doPortal(target) {
    doSkill({ a: 'skill', s: 'portal', target: target }, function () {
      return E.armPortal(g, me, target);
    });
  }

  function doRefresh(uid) {
    doSkill({ a: 'skill', s: 'refresh', uid: uid }, function () {
      return E.useRefresh(g, me, uid);
    });
  }

  function doDraw2() {
    doSkill({ a: 'skill', s: 'draw2' }, function () {
      return E.useDraw2(g, me);
    });
  }

  function doMSwap(target) {
    doSkill({ a: 'skill', s: 'mswap', target: target }, function () {
      return E.useMSwap(g, me, target);
    });
  }

  function doSteal(target) {
    doSkill({ a: 'skill', s: 'steal', target: target }, function () {
      return E.useSteal(g, me, target);
    });
  }

  function doWreck(target) {
    doSkill({ a: 'skill', s: 'wreck', target: target }, function () {
      return E.useWreck(g, me, target);
    });
  }

  function doDelay(target) {
    doSkill({ a: 'skill', s: 'delay', target: target }, function () {
      return E.useDelay(g, me, target);
    });
  }

  function doHex(target, color) {
    doSkill({ a: 'skill', s: 'hex', target: target, color: color }, function () {
      return E.useHex(g, me, target, color);
    });
  }

  function doOracle() {
    doSkill({ a: 'skill', s: 'oracle' }, function () {
      return E.useOracle(g, me);
    });
  }

  function doOracleMove(uid) {
    doSkill({ a: 'skill', s: 'oracleMove', uid: uid }, function () {
      return E.oracleMove(g, me, uid);
    });
  }

  function doOracleSkip() {
    doSkill({ a: 'skill', s: 'oracleSkip' }, function () {
      return E.oracleSkip(g, me);
    });
  }

  function doBalance(uids) {
    doSkill({ a: 'skill', s: 'balance', uids: uids }, function () {
      return E.useBalance(g, me, uids);
    });
  }

  function doHotSpring() {
    doSkill({ a: 'skill', s: 'hotspring' }, function () {
      return E.useHotSpring(g, me);
    });
  }

  function doSplash() {
    doSkill({ a: 'skill', s: 'splash' }, function () {
      return E.useSplash(g, me);
    });
  }

  function doSleep(target) {
    doSkill({ a: 'skill', s: 'sleep', target: target }, function () {
      return E.useSleep(g, me, target);
    });
  }

  function doBomb(target) {
    doSkill({ a: 'skill', s: 'bomb', target: target }, function () {
      return E.useBomb(g, me, target);
    });
  }

  function doLeaf(from, to) {
    doSkill({ a: 'skill', s: 'leaf', from: from, to: to }, function () {
      return E.useLeaf(g, me, from, to);
    });
  }

  function doGrape() {
    doSkill({ a: 'skill', s: 'grape' }, function () {
      return E.useGrape(g, me);
    });
  }

  function doSnack(uids, target) {
    doSkill({ a: 'skill', s: 'snack', uids: uids, target: target }, function () {
      return E.useSnack(g, me, uids, target);
    });
  }

  /* 手牌多选弹层：exact = 0 表示任意张（≥1），2 表示恰好 2 张 */
  function openPickSheet(title, sub, exact, cb) {
    var my = g.players[me];
    var items = my.hand.map(function (c) {
      return '<div class="pick-cand" data-uid="' + c.uid + '">' + cardHTML(c) + '</div>';
    }).join('');
    openSheet(
      '<div class="sheet-head"><h2>' + title + '</h2><p>' + sub + '</p></div>' +
      '<div class="eye-hand">' + (items || '<p class="net-tip">你没有手牌。</p>') + '</div>' +
      '<div class="sheet-foot"><button class="btn primary" id="pick-ok" disabled>确认（0）</button>' +
      '<button class="btn" id="pick-cancel">取消</button></div>'
    );
    var sel = [];
    var ok = $('pick-ok');
    function refresh() {
      ok.textContent = '确认（' + sel.length + (exact ? '/' + exact : '') + '）';
      ok.disabled = exact ? sel.length !== exact : sel.length < 1;
    }
    refresh();
    Array.prototype.forEach.call(document.querySelectorAll('.pick-cand'), function (el) {
      el.addEventListener('click', function () {
        var u = Number(el.getAttribute('data-uid'));
        var i = sel.indexOf(u);
        if (i >= 0) { sel.splice(i, 1); el.classList.remove('sel'); }
        else if (!exact || sel.length < exact) { sel.push(u); el.classList.add('sel'); }
        else UI.toastMsg('最多选 ' + exact + ' 张');
        refresh();
      });
    });
    $('pick-cancel').addEventListener('click', closeSheet);
    ok.addEventListener('click', function () {
      closeSheet();
      cb(sel.slice());
    });
  }

  /* 按 UNO：本人先按 = 喊话安全；对手先按 = 抓罚。先按先得，由房主裁决 */
  function doShout() {
    if (!g || g.over || g.unoPending == null || g.unoPending < 0) return;
    if (mode === 'net' && UI.net && UI.net.role === 'guest') {
      Net.sendAction({ a: 'uno' });
      var ub = $('uno-btn');
      if (ub) ub.disabled = true;
      setTimeout(function () { if (ub) ub.disabled = false; }, 1200);
      return;
    }
    var r = E.unoPress(g, me);
    if (!r.ok) { UI.toastMsg(r.err || '现在不能按'); return; }
    UI.render();
    if (mode === 'net') Net.sync();
  }

  /* ---------------- 弹层 ---------------- */

  /* 颜色选择弹层：mode = 'wild' 万能牌 | 'lucky' 幸运数字 | 'hex' 赌西瓜押色 */
  function openColorSheet(uid, mode) {
    pendingWild = uid;
    var head;
    if (mode === 'lucky') {
      head = '<div class="sheet-head"><h2>🎲 幸运数字</h2><p>这张 ' + esc(String(g.luckyNum)) +
        ' 跟不上牌面，消耗 1 次技能，指定任意颜色打出。</p></div>';
    } else if (mode === 'hex') {
      head = '<div class="sheet-head"><h2>' + E.SKILLS.hex.icon + ' ' + E.SKILLS.hex.name + ' · 押颜色</h2><p>押中目标下次打出的颜色：他摸 2 张；押不中你摸 1 张。</p></div>';
    } else {
      head = '<div class="sheet-head"><h2>选一个颜色</h2><p>这张是万能牌，出完后由你指定后续颜色。</p></div>';
    }
    var btns = E.COLORS.map(function (c) {
      return '<button class="color-btn dot-' + c + '" data-color="' + c + '">' + E.COLOR_NAME[c] + '</button>';
    }).join('');
    openSheet(head + '<div class="color-grid">' + btns + '</div>');
    Array.prototype.forEach.call(document.querySelectorAll('.color-btn'), function (b) {
      b.addEventListener('click', function () {
        var color = b.getAttribute('data-color');
        if (mode === 'hex') {
          var t = pendingHexTarget;
          pendingHexTarget = -1;
          closeSheet();
          doHex(t, color);
          return;
        }
        var uid2 = pendingWild;
        pendingWild = -1;
        closeSheet();
        doPlay(uid2, color);
      });
    });
  }

  /* 双子星：选要附带打出的同数字手牌 */
  function openTwinSheet(main, cands) {
    var items = cands.map(function (c) {
      return '<div class="twin-cand" data-uid="' + c.uid + '">' + cardHTML(c) + '</div>';
    }).join('');
    openSheet(
      '<div class="sheet-head"><h2>👯 双子星</h2><p>主牌 ' + esc(E.cardLabel(main)) +
      '，再选一张同数字的一并打出（颜色不限）。</p></div>' +
      '<div class="eye-hand">' + items + '</div>'
    );
    Array.prototype.forEach.call(document.querySelectorAll('.twin-cand'), function (el) {
      el.addEventListener('click', function () {
        var tu = Number(el.getAttribute('data-uid'));
        twinArm = false;
        closeSheet();
        doPlay(main.uid, null, tu);
      });
    });
  }

  /* 占卜师：看牌堆顶 3 张，可压 1 张到堆底 */
  function openOracleSheet() {
    var cards = (g.oracleShow && g.oracleShow.cards) || [];
    var items = cards.map(function (c) { return '<div class="oracle-cand">' + cardHTML(c) + '</div>'; }).join('');
    openSheet(
      '<div class="sheet-head"><h2>🔮 占卜师</h2><p>牌堆顶的牌。点一张压到牌堆底，或保持原样。</p></div>' +
      '<div class="eye-hand">' + (items || '<p class="net-tip">牌堆没有牌。</p>') + '</div>' +
      '<div class="sheet-foot"><button class="btn" id="oracle-skip">保持原样</button></div>'
    );
    $('oracle-skip').addEventListener('click', function () {
      closeSheet();
      doOracleSkip();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.oracle-cand'), function (el) {
      el.addEventListener('click', function () {
        var u = Number(el.querySelector('.ucard').getAttribute('data-uid'));
        closeSheet();
        doOracleMove(u);
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

  /* 通用目标选择（excludeSeat：额外排除的座位，如叶子快递的被抽方） */
  function openTargetSheet(title, sub, cb, excludeSeat) {
    var items = '';
    g.players.forEach(function (p) {
      if (p.id === me) return;
      if (excludeSeat != null && p.id === excludeSeat) return;
      items += '<button class="tgt-btn" data-seat="' + p.id + '">' +
        '<b>' + esc(p.name) + '</b><span>' + handN(p) + ' 张手牌</span></button>';
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

  /* 技能按钮点击：打开技能详情弹层 */
  function onSkillBtn() {
    if (!g || g.over || !g.skillMode || !g.players[me].skill) return;
    /* 选牌模式中：再点一次取消 */
    if (swapPick >= 0) { swapPick = -1; UI.render(); return; }
    if (twinArm) { twinArm = false; UI.render(); return; }
    if (refreshPick) { refreshPick = false; UI.render(); return; }
    var sk = g.players[me].skill;
    var info = E.SKILLS[sk.id];
    if (sk.uses <= 0 && !sk.armed) { UI.toastMsg(info.name + ' 的次数已用完'); return; }
    var myTurn = g.turn === me && !g.over;
    var active = ['windfall', 'swap', 'eye', 'reversal', 'portal', 'refresh',
      'draw3', 'mswap', 'steal', 'wreck', 'delay', 'hex', 'oracle', 'twin',
      'shield', 'thorn', 'brake', 'cloak',
      'jh', 'wq', 'sh', 'ks', 'cp', 'yz', 'wd', 'bz', 'ls']
      .indexOf(sk.id) >= 0;
    var body = '<div class="sheet-head"><h2>' + info.icon + ' ' + info.name + '</h2><p>' + esc(info.desc) + '</p>' +
      (sk.armed
        ? '<p class="net-tip">⚡ 已待命中：条件达成时自动生效。</p>'
        : '<p class="net-tip">剩余 ' + sk.uses + ' 次。</p>') + '</div>';
    if (!active || sk.armed) {
      openSheet(body + '<div class="sheet-foot"><button class="btn primary" id="sk-ok">知道了</button></div>');
      $('sk-ok').addEventListener('click', closeSheet);
      return;
    }
    openSheet(body + '<div class="sheet-foot"><button class="btn primary" id="sk-go">发动</button>' +
      '<button class="btn" id="sk-cancel">取消</button></div>');
    $('sk-cancel').addEventListener('click', closeSheet);
    $('sk-go').addEventListener('click', function () {
      if (!myTurn) { UI.toastMsg('只能在自己回合使用'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      if (g.comboSeat === me) { UI.toastMsg('连击期间不能使用技能'); return; }
      closeSheet();
      activateSkill(sk.id, sk.uses);
    });
  }

  /* 按技能 id 分流发动流程 */
  function activateSkill(id, uses) {
    var sub = '剩余 ' + uses + ' 次。';
    if (id === 'shield' || id === 'thorn' || id === 'brake' || id === 'cloak' || id === 'wd') { doArm(id); return; }
    if (id === 'windfall') { doDraw(true); return; }
    if (id === 'reversal') { doReversal(); return; }
    if (id === 'draw3') { doDraw2(); return; }
    if (id === 'oracle') { doOracle(); return; }
    if (id === 'wq') { doHotSpring(); return; }
    if (id === 'sh') { doSplash(); return; }
    if (id === 'bz') { doGrape(); return; }
    if (id === 'jh') {
      openPickSheet('⚖️ 换换果子', '点手牌选中要弃掉的（可多选），弃几张摸几张，不消耗回合。' + sub, 0, function (uids) { doBalance(uids); });
      return;
    }
    if (id === 'ls') {
      openPickSheet('🍪 零食分享', '选 2 张手牌送给一位对手，然后你摸 1 张。' + sub, 2, function (uids) {
        openTargetSheet('🍪 送给谁？', '这两张零食将送给他。', function (seat) { doSnack(uids, seat); });
      });
      return;
    }
    if (id === 'twin') {
      twinArm = true;
      UI.toastMsg('👯 点一张能打出的数字牌，将同时带出另一张同数字的牌');
      UI.render();
      return;
    }
    if (id === 'refresh') {
      refreshPick = true;
      UI.toastMsg('♻️ 点一张要弃掉的手牌，弃掉后重新摸 1 张');
      UI.render();
      return;
    }
    if (id === 'swap') {
      openTargetSheet('🔄 偷天换日', '选一位对手盲换：你送出 1 张手牌，随机抽他 1 张。' + sub, function (seat) {
        swapPick = seat;
        UI.toastMsg('点一张要送出的手牌（再点技能按钮取消）');
        UI.render();
      });
    } else if (id === 'eye') {
      openTargetSheet('👁️ 天眼', '选一位对手偷看全部手牌，直到你的回合结束。' + sub, function (seat) { doEye(seat); });
    } else if (id === 'mswap') {
      openTargetSheet('🔃 乾坤挪移', '与一位手牌数差不超过 2 的对手整手互换。' + sub, function (seat) { doMSwap(seat); });
    } else if (id === 'steal') {
      openTargetSheet('🐟 叼走小鱼', '随机抽一位对手的 1 张手牌加入你的手牌。' + sub, function (seat) { doSteal(seat); });
    } else if (id === 'wreck') {
      openTargetSheet('🦫 拆水坝', '随机弃掉一位对手的 1 张手牌进弃牌堆。' + sub, function (seat) { doWreck(seat); });
    } else if (id === 'delay') {
      openTargetSheet('⏳ 拖延', '其下回合开始前先罚摸 1 张。' + sub, function (seat) { doDelay(seat); });
    } else if (id === 'ks') {
      openTargetSheet('😴 瞌睡虫', '指定一位对手，跳过他的下个回合。' + sub, function (seat) { doSleep(seat); });
    } else if (id === 'cp') {
      openTargetSheet('💨 臭屁炸弹', '指定一位对手，其下下个回合开始时罚摸 3 张。' + sub, function (seat) { doBomb(seat); });
    } else if (id === 'hex') {
      openTargetSheet(E.SKILLS.hex.icon + ' ' + E.SKILLS.hex.name, '选一位对手，然后押一个颜色。' + sub, function (seat) {
        pendingHexTarget = seat;
        openColorSheet(-1, 'hex');
      });
    } else if (id === 'portal') {
      openTargetSheet('🌀 传送门', '出牌后由他接替出牌，无视顺序。' + sub, function (seat) { doPortal(seat); });
    } else if (id === 'yz') {
      openTargetSheet('🍃 叶子快递 · 抽谁', '先选一位被抽牌的对手。' + sub, function (from) {
        openTargetSheet('🍃 叶子快递 · 寄给谁', '抽到的牌将塞给这位对手（不含刚才那位）。', function (to) { doLeaf(from, to); }, from);
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
      '<p><b>功能牌</b>：⊘ 跳过下家；⇄ 反转方向（双人局等同跳过）；+2 / +4 让下家罚摸——但下家可以接着出 +2 / +4 叠加（+4 头上只能接 +4），累计张数由最后接不住的人一口气吃完并被跳过。</p>' +
      '<p><b>万能牌</b>：★ 换色自由出；+4 出完后由你指定颜色，下家摸 4 张。</p>' +
      '<p><b>摸牌</b>：无牌可出就摸一张；摸到的牌如果能出，可以立刻打出或保留。</p>' +
      '<p><b>喊 UNO</b>：打到只剩 1 张时，所有人界面都会出现一个 UNO 按钮——本人先按=安全；4 秒内没按被对手抢先按住，罚摸 2 张。按钮不带倒计时，全凭反应，先按先得。AI 也会喊、也会抓。</p>' +
      '<p><b>技能模式</b>：开局每人从 3 个候选技能中选 1 个（共 30 种技能池），每局限定次数。' +
      '🛡️护身符 / 🌵荆棘 / 🚨急刹车 / 🫥隐形斗篷 / 🧘稳如水豚为待命型：需在自己回合点技能按钮先发动，条件达成时自动生效一次——</p>' +
      '<p>🎲幸运数字（幸运数字当万能出）· ⚡连击（追加出牌）· 👯双子星（带出同数字）· 🔀迷魂阵（强转方向）· 🌀传送门（指定接替出牌者）</p>' +
      '<p>🍀顺风手（摸2选1）· ♻️淘旧换新（弃1摸1）· 🎣摸鱼（白摸2张）· 🔄偷天换日（盲换1张）· 🔃乾坤挪移（整手互换，差值≤2）</p>' +
      '<p>🐟叼走小鱼（抽1张）· 🦫拆水坝（弃1张）· 🚨急刹车（UNO拦截）· ⏳拖延（下回合罚摸）· 🌵荆棘（+2/+4反弹一半）</p>' +
      '<p>🛡️护身符（反弹+2/+4）· 👁️天眼（看手牌）· 🍉赌西瓜（押颜色）· 🔮占卜师（看牌堆顶3张）· 🫥隐形斗篷（免喊UNO）</p>' +
      '<p>⚖️换换果子（弃任意张摸等量）· ♨️温泉派对（全场各摸1张自己继续）· 💦水花四溅（其他人各罚摸1张）</p>' +
      '<p>😴瞌睡虫（跳过目标下回合）· 💨臭屁炸弹（下下回合罚摸3张）· 🍃叶子快递（抽A的牌塞给B）</p>' +
      '<p>🧘稳如水豚（挡下一次针对自己的技能）· 🍊暴走柚子（下一张+2翻倍）· 🌿细嚼慢咽（被罚只摸一半，被动）· 🍪零食分享（送2张给对手自己摸1张）</p>' +
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

  function resetRoundState() {
    resultsShown = false;
    skillPickOpen = false;
    swapPick = -1;
    eyeShownFor = -1;
    twinArm = false;
    refreshPick = false;
    pendingHexTarget = -1;
    oracleShown = false;
  }

  function restartGame() {
    if (mode === 'net' && UI.net && UI.net.role === 'host') {
      var humanIds = g.players.filter(function (p) { return p.isHuman; }).map(function (p) { return p.id; });
      var names = g.players.map(function (p) { return p.name; });
      g = E.createGame({ playerCount: g.players.length, humanIds: humanIds, names: names, skillMode: UI.skillMode });
      UI.g = g;
      me = 0;
      resetRoundState();
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
    resetRoundState();
    var s = $('start'); if (s) s.classList.add('hidden');
    UI.render();
    UI.pump();
  }

  /* ---------------- 联机钩子 ---------------- */

  UI.netMode = function () { mode = 'net'; };

  /* 房主开局：把 UI 模块内部 g/me 切到这局游戏（render/pump 都读内部状态） */
  UI.netStart = function (game, seat, netInfo) {
    g = game;
    me = seat;
    mode = 'net';
    UI.g = game;
    UI.me = seat;
    UI.net = netInfo;
    resetRoundState();
    var s = $('start'); if (s) s.classList.add('hidden');
    if (Net.closeRoom) Net.closeRoom();
    UI.render();
  };

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
    /* 收到游戏状态即离开房间页，进入牌桌 */
    if (Net.closeRoom) Net.closeRoom();
    var s = $('start'); if (s) s.classList.add('hidden');
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
          ? '开局 3 选 1 技能（30 种技能池），每局限定次数。'
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
      /* 淘旧换新：选要弃掉的手牌 */
      if (refreshPick) { refreshPick = false; doRefresh(uid); return; }
      /* 双子星：选主数字牌，再选附带牌 */
      if (twinArm) {
        if (!/^[0-9]$/.test(card.k)) { UI.toastMsg('双子星要点一张数字牌'); return; }
        if (!E.playable(g, card)) { UI.toastMsg('先选一张能正常打出的数字牌'); return; }
        var cands = my.hand.filter(function (x) { return x.uid !== uid && x.k === card.k; });
        if (!cands.length) { UI.toastMsg('手里没有另一张 ' + card.k); return; }
        openTwinSheet(card, cands);
        return;
      }
      if (g.turn !== me) { UI.toastMsg('还没轮到你'); return; }
      if (g.awaiting) { UI.toastMsg('请先处理刚摸的牌'); return; }
      if (E.playable(g, card)) {
        if (card.c === 'w') { openColorSheet(uid, 'wild'); return; }
        doPlay(uid, null);
        return;
      }
      /* 幸运数字：跟不上的公示数字可以声明颜色 */
      if (g.skillMode && my.skill && my.skill.id === 'lucky' && my.skill.uses > 0 &&
          g.luckyNum != null && card.k === String(g.luckyNum)) {
        openColorSheet(uid, 'lucky');
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
        if (card.c === 'w') openColorSheet(card.uid, 'wild');
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
