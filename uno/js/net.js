/* UNO · 无服务器联机（WebRTC 手动交换邀请码，改编自富饶之城） */
(function () {
  var U = (window.UNO = window.UNO || {});
  var E = U.Engine;
  var Net = (U.Net = {});

  var RESP_PREFIX = 'uno_resp_';
  var ICE = { iceServers: [
    { urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'] },
    { urls: 'stun:stun.l.google.com:19302' }
  ] };
  var respChan = null;
  try { respChan = new BroadcastChannel('uno_resp'); } catch (e) {}
  var sm = {
    role: null,
    room: '',
    count: 4,
    peers: {},
    openSeat: null,
    guestPc: null,
    guestDc: null,
    guestSeat: null,
    answerCode: '',
    connectedSeats: [],
    syncSig: '',
    syncTimer: null,
    err: ''
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function randRoom() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 4; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    var s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  async function pack(obj) {
    var json = JSON.stringify(obj);
    if (typeof CompressionStream !== 'undefined') {
      try {
        var stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        var buf = await new Response(stream).arrayBuffer();
        return 'z' + b64url(new Uint8Array(buf));
      } catch (e) {}
    }
    return 'j' + b64url(new TextEncoder().encode(json));
  }
  async function unpack(code) {
    code = String(code || '').trim();
    if (!code) throw new Error('邀请码为空');
    var kind = code.charAt(0);
    var bytes = fromB64url(code.slice(1));
    var json;
    if (kind === 'z') {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    } else if (kind === 'j') {
      json = new TextDecoder().decode(bytes);
    } else {
      throw new Error('邀请码格式无法识别');
    }
    return JSON.parse(json);
  }
  function waitIce(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve();
      var done = false;
      function check() {
        if (done) return;
        if (pc.iceGatheringState === 'complete') {
          done = true;
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      }
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(function () { if (!done) { done = true; resolve(); } }, 5000);
    });
  }
  function makeUrl(hash) {
    return location.origin + location.pathname + location.search + hash;
  }
  function qrSVG(text) {
    try {
      if (typeof qrcode !== 'function') return '';
      var qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    } catch (e) {
      return '';
    }
  }
  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------------- 页面内扫码（房主录入应答码，不离开房间页） ---------------- */

  var scan = { stream: null, raf: 0, video: null, canvas: null, ctx: null, cb: null };

  function extractRespCode(text) {
    text = String(text || '').trim();
    var i = text.indexOf('#resp=');
    if (i >= 0) return text.slice(i + 6);
    if (/^[zj][A-Za-z0-9_-]{12,}$/.test(text)) return text; /* 直接是应答码 */
    return '';
  }

  function closeScanner() {
    if (scan.raf) { cancelAnimationFrame(scan.raf); scan.raf = 0; }
    if (scan.stream) {
      scan.stream.getTracks().forEach(function (t) { t.stop(); });
      scan.stream = null;
    }
    scan.video = null;
    scan.cb = null;
    var el = $('qr-scan');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  }

  function finishScan(code) {
    var cb = scan.cb;
    closeScanner();
    if (cb) cb(code);
  }

  function decodeVideoFrame() {
    if (!scan.video || !scan.canvas) return null;
    var w = scan.video.videoWidth, h = scan.video.videoHeight;
    if (!w || !h) return null;
    scan.canvas.width = w;
    scan.canvas.height = h;
    scan.ctx.drawImage(scan.video, 0, 0, w, h);
    try {
      var img = scan.ctx.getImageData(0, 0, w, h);
      var res = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      return res && res.data ? res.data : null;
    } catch (e) { return null; }
  }

  function scanTick() {
    if (!scan.stream) return;
    var code = extractRespCode(decodeVideoFrame() || '');
    if (code) { finishScan(code); return; }
    scan.raf = requestAnimationFrame(scanTick);
  }

  function scanFromFile(file) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      var code = '';
      try {
        var ctx2 = c.getContext('2d', { willReadFrequently: true });
        ctx2.drawImage(img, 0, 0);
        var d = ctx2.getImageData(0, 0, c.width, c.height);
        var res = window.jsQR(d.data, c.width, c.height);
        code = res && res.data ? extractRespCode(res.data) : '';
      } catch (e) {}
      URL.revokeObjectURL(url);
      if (code) finishScan(code);
      else U.UI.toastMsg('照片里没识别到应答码，请对准二维码重拍');
    };
    img.onerror = function () { URL.revokeObjectURL(url); U.UI.toastMsg('照片读取失败'); };
    img.src = url;
  }

  function openScanner(cb) {
    closeScanner();
    var el = $('qr-scan');
    if (!el) return;
    scan.cb = cb;
    el.innerHTML =
      '<div class="scan-card">' +
      '<div class="scan-head"><span>扫一扫 · 客人的应答码</span>' +
      '<button class="net-close" id="scan-close">关闭</button></div>' +
      '<div class="scan-view"><video id="scan-video" playsinline muted></video><i class="scan-frame"></i></div>' +
      '<p class="net-tip" id="scan-tip">正在启动相机…</p>' +
      '<button class="btn" id="scan-file">从相册选照片 / 拍照识别</button>' +
      '<input type="file" id="scan-input" accept="image/*" class="hidden">' +
      '</div>';
    el.classList.remove('hidden');
    $('scan-close').addEventListener('click', closeScanner);
    $('scan-file').addEventListener('click', function () { $('scan-input').click(); });
    $('scan-input').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) scanFromFile(f);
    });
    scan.video = $('scan-video');
    scan.canvas = document.createElement('canvas');
    scan.ctx = scan.canvas.getContext('2d', { willReadFrequently: true });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof window.jsQR !== 'function') {
      $('scan-tip').textContent = '当前浏览器不支持相机：点下方按钮选照片识别，或让客人复制应答码给你粘贴。';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      if (!scan.cb) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      scan.stream = stream;
      scan.video.srcObject = stream;
      scan.video.setAttribute('playsinline', 'true');
      var p = scan.video.play();
      if (p && p.catch) p.catch(function () {});
      $('scan-tip').textContent = '把客人屏幕上的应答二维码对准取景框，识别成功会自动连接。';
      scan.raf = requestAnimationFrame(scanTick);
    }).catch(function () {
      $('scan-tip').textContent = '无法打开相机（可能权限被拒）：点下方按钮选照片识别，或让客人复制应答码给你粘贴。';
    });
  }

  /* ---------------- 房间界面 ---------------- */

  function showRoom(html) {
    var el = $('netroom');
    if (!el) return;
    el.innerHTML = '<div class="net-card">' + html + '</div>';
    el.classList.remove('hidden');
    var start = $('start');
    if (start) start.classList.add('hidden');
  }
  function hideRoom() {
    closeScanner();
    var el = $('netroom');
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
  }
  function netErr(msg) {
    sm.err = msg || '';
    var box = $('net-room-err');
    if (box) { box.textContent = sm.err; box.classList.toggle('hidden', !sm.err); }
  }

  Net.openLobby = function () {
    sm.role = null;
    sm.err = '';
    showRoom(
      '<div class="net-head"><span class="net-kicker">局域网联机</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>同一 WiFi，开一桌</h2>' +
      '<p class="net-sub">无需服务器。流程：房主出示邀请二维码 → 客人扫码生成应答码 → 房主点「📷 扫客人的应答码」在本页扫码即自动连接。' +
      '也可以全程复制/粘贴。2 人即可开局，真人 1–3 位，剩余座位由 AI 补全。</p>' +
      '<div class="net-choice">' +
      '<button class="btn primary" id="net-host">创建房间（我是房主）</button>' +
      '<button class="btn" id="net-join">加入房间（我是客人）</button>' +
      '</div>' +
      '<p class="net-tip">建议在 Safari / Chrome 中打开；手机需与房主处于同一 WiFi。</p>'
    );
    $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    $('net-host').addEventListener('click', function () { Net.createRoom(); });
    $('net-join').addEventListener('click', function () { Net.showJoin(); });
  };

  Net.showJoin = function () {
    showRoom(
      '<div class="net-head"><span class="net-kicker">加入房间</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>粘贴房主的邀请码</h2>' +
      '<p class="net-sub">如果房主给你看了二维码，直接用系统相机扫码即可自动进入此步骤。</p>' +
      '<textarea class="net-textarea" id="net-offer" placeholder="粘贴邀请码"></textarea>' +
      '<div class="net-error hidden" id="net-room-err"></div>' +
      '<button class="btn primary" id="net-gen">生成应答码</button>' +
      '<p class="net-tip">生成后把应答码发给房主（截图扫码或复制粘贴）。</p>'
    );
    $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    $('net-gen').addEventListener('click', function () {
      var code = $('net-offer').value.trim();
      if (!code) return netErr('请先粘贴邀请码');
      netErr('');
      Net.joinWithOffer(code, false);
    });
  };

  Net.createRoom = async function () {
    sm.role = 'host';
    sm.room = randRoom();
    sm.peers = {};
    sm.connectedSeats = [];
    sm.count = sm.count || 4;
    showRoom('<h2>创建中…</h2><p class="net-sub">正在生成本机邀请码</p>');
    try {
      await openSlot(1);
    } catch (e) {
      showRoom('<h2>创建失败</h2><p class="net-sub">' + esc(e.message) + '</p>');
    }
  };

  async function openSlot(seat) {
    if (sm.openSeat && sm.peers[sm.openSeat] && !sm.peers[sm.openSeat].connected) {
      try { sm.peers[sm.openSeat].pc.close(); } catch (e) {}
      delete sm.peers[sm.openSeat];
    }
    var pc = new RTCPeerConnection(ICE);
    var dc = pc.createDataChannel('game', { ordered: true });
    var peer = { pc: pc, dc: dc, connected: false, seat: seat, code: '' };
    sm.peers[seat] = peer;
    sm.openSeat = seat;
    bindPeer(peer);
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    var code = await pack({
      v: 1, room: sm.room, seat: seat, type: 'offer',
      sdp: pc.localDescription.sdp
    });
    peer.code = code;
    renderHostRoom();
  }

  function bindPeer(peer) {
    var seat = peer.seat;
    peer.pc.onconnectionstatechange = function () {
      if (peer.pc.connectionState === 'failed' && !peer.connected) {
        netErr('座位 ' + (seat + 1) + ' 连接失败：请确认两台设备在同一 WiFi（且路由器未隔离设备），然后点「重新生成邀请码」重试。');
      }
    };
    peer.dc.onopen = function () {
      peer.connected = true;
      sm.connectedSeats = Object.keys(sm.peers).filter(function (k) {
        return sm.peers[k].connected;
      }).map(Number).sort();
      if (sm.openSeat === seat) sm.openSeat = null;
      try {
        peer.dc.send(JSON.stringify({ t: 'welcome', seat: seat, room: sm.room }));
      } catch (e) {}
      var g = U.UI && U.UI.g;
      if (g && U.UI.net && U.UI.net.role === 'host' && !g.over) {
        try { peer.dc.send(JSON.stringify({ t: 'state', view: buildView(g, seat) })); } catch (e) {}
      }
      renderHostRoom();
    };
    peer.dc.onclose = function () {
      peer.connected = false;
      sm.connectedSeats = sm.connectedSeats.filter(function (s) { return s !== seat; });
      var g = U.UI && U.UI.g;
      if (g && !g.over && U.UI.net && U.UI.net.role === 'host') takeover(seat, g);
      renderHostRoom();
    };
    peer.dc.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || msg.t !== 'action') return;
      Net.applyAction(seat, msg);
    };
  }

  /* 掉线后自动托管该座位 */
  function takeover(seat, g) {
    var p = g.players[seat];
    if (!p) return;
    p.isHuman = false;
    U.UI.toastMsg(p.name + ' 掉线，已改由 AI 接管');
    U.UI.render();
    U.UI.pump();
  }

  function renderHostRoom() {
    if (sm.role !== 'host') return;
    var seats = Object.keys(sm.peers).map(Number).sort();
    var connected = seats.filter(function (s) { return sm.peers[s].connected; });
    var open = seats.filter(function (s) { return !sm.peers[s].connected; })[0];
    var peer = open != null ? sm.peers[open] : null;
    var nextSeat = 1;
    connected.forEach(function (s) { if (s >= nextSeat) nextSeat = s + 1; });
    if (open != null && nextSeat <= open) nextSeat = open + 1;
    var canAdd = nextSeat <= sm.count - 1 && connected.length < sm.count - 1;

    var html = '<div class="net-head"><span class="net-kicker">房主 · 房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">关闭</button></div>' +
      '<h2>' + sm.count + ' 人桌 · ' + (connected.length + 1) + ' 位真人</h2>';

    if (peer) {
      var url = makeUrl('#offer=' + peer.code);
      var qr = qrSVG(url);
      html += '<p class="net-sub">让客人用系统相机扫描，或把邀请码发给他。</p>' +
        (qr ? '<div class="net-qr">' + qr + '</div>' : '<p class="net-tip">二维码过长，请复制邀请码。</p>') +
        '<div class="net-label">邀请码（座位 ' + (peer.seat + 1) + '）</div>' +
        '<textarea class="net-code" id="net-code" readonly>' + esc(peer.code) + '</textarea>' +
        '<button class="btn mini" id="net-copy-offer">复制邀请码</button>' +
        '<button class="btn mini" id="net-regen">重新生成邀请码</button>' +
        '<div class="net-label">客人回传的应答码</div>' +
        '<p class="net-tip">让客人出示他的应答二维码，点下方按钮<b>在本页扫码</b>（不会离开房间页）；也可让客人复制应答码发给你粘贴。</p>' +
        '<button class="btn primary" id="net-scan">📷 扫客人的应答码</button>' +
        '<textarea class="net-textarea" id="net-answer" placeholder="或在此粘贴客人发来的应答码"></textarea>' +
        '<button class="btn" id="net-connect">连接粘贴的应答码</button>';
    } else {
      html += '<p class="net-sub">' + (connected.length
        ? '已连接 ' + connected.length + ' 位客人。可以继续添加，或直接开始（其余座位由 AI 补位）。'
        : '') + '</p>';
    }

    html += '<div class="net-connected"><b>已入座</b><span>房主</span>' +
      connected.map(function (s) { return '<span>玩家' + (s + 1) + '</span>'; }).join('') +
      '</div>';

    if (canAdd && !peer) html += '<button class="btn" id="net-add">添加下一位玩家</button>';
    if (canAdd && peer) html += '<p class="net-tip">当前邀请码是座位 ' + (peer.seat + 1) + ' 的；连接后可继续添加。</p>';
    html += '<div class="net-error hidden" id="net-room-err">' + esc(sm.err) + '</div>';
    html += '<div class="net-actions">' +
      '<button class="btn primary" id="net-start">开始游戏</button>' +
      '</div>' +
      '<p class="net-tip">至少 1 位客人连接后即可开始（2 人局），剩余座位由 AI 补全。开始后不能再加入。</p>';

    showRoom(html);
    if ($('net-room-err') && sm.err) $('net-room-err').classList.remove('hidden');

    $('net-back').addEventListener('click', function () {
      Object.keys(sm.peers).forEach(function (k) { try { sm.peers[k].pc.close(); } catch (e) {} });
      sm.peers = {};
      sm.role = null;
      hideRoom();
      var s = $('start'); if (s) s.classList.remove('hidden');
    });
    if ($('net-copy-offer')) {
      $('net-copy-offer').addEventListener('click', function () {
        copyText(peer.code);
        U.UI.toastMsg('邀请码已复制');
      });
    }
    if ($('net-regen')) {
      $('net-regen').addEventListener('click', function () {
        openSlot(peer.seat).catch(function (e) { netErr(e.message); });
      });
    }
    if ($('net-scan')) {
      $('net-scan').addEventListener('click', function () {
        openScanner(function (code) {
          netErr('');
          Net.applyAnswer(code).catch(function (e) { netErr(e.message); });
        });
      });
    }
    if ($('net-connect')) {
      $('net-connect').addEventListener('click', function () {
        var code = $('net-answer').value.trim();
        if (!code) return netErr('请先粘贴应答码');
        netErr('');
        Net.applyAnswer(code, peer.seat).catch(function (e) { netErr(e.message); });
      });
    }
    if ($('net-add')) {
      $('net-add').addEventListener('click', function () {
        openSlot(nextSeat).catch(function (e) { netErr(e.message); });
      });
    }
    $('net-start').addEventListener('click', function () {
      if (!connected.length) return netErr('至少需要一位客人连接后才能开始（2 人局）');
      Net.startGame();
    });
  }

  Net.applyAnswer = async function (codeText, expectSeat) {
    var ans = await unpack(codeText);
    if (!ans || ans.type !== 'answer') throw new Error('这不是应答码');
    if (ans.room !== sm.room) throw new Error('应答码不属于本房间');
    if (expectSeat != null && ans.seat !== expectSeat) throw new Error('应答码座位不匹配');
    var peer = sm.peers[ans.seat];
    if (!peer) throw new Error('该座位的邀请已失效，请重新生成');
    if (peer.connected) {
      if (expectSeat != null) throw new Error('该座位已连接');
      return;
    }
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  };

  /* ---------------- 客人 ---------------- */

  Net.joinWithOffer = async function (offerCode, auto) {
    sm.role = 'guest';
    showRoom('<h2>生成应答码…</h2><p class="net-sub">正在与本机建立连接</p>');
    try {
      var off = await unpack(offerCode);
      if (!off || off.type !== 'offer') throw new Error('邀请码无效');
      sm.room = off.room;
      sm.guestSeat = off.seat;
      var pc = new RTCPeerConnection(ICE);
      sm.guestPc = pc;
      pc.ondatachannel = function (ev) {
        sm.guestDc = ev.channel;
        bindGuestDc(ev.channel);
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: off.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      var code = await pack({
        v: 1, room: off.room, seat: off.seat, type: 'answer',
        sdp: pc.localDescription.sdp
      });
      sm.answerCode = code;
      renderGuestAnswer(auto);
    } catch (e) {
      showRoom('<div class="net-head"><button class="net-close" id="net-back">返回</button></div>' +
        '<h2>加入失败</h2><p class="net-sub">' + esc(e.message) + '</p>');
      $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    }
  };

  function bindGuestDc(dc) {
    dc.onopen = function () {
      var st = $('net-guest-status');
      if (st) st.innerHTML = '<b style="color:#7fc98d">已连接房主！</b>等待房主开始游戏…';
      U.UI.toastMsg('已连接房主');
    };
    dc.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'welcome') {
        U.UI.netWelcome(msg.seat);
      } else if (msg.t === 'state') {
        U.UI.netState(msg.view);
      }
    };
    dc.onclose = function () {
      var st = $('net-guest-status');
      if (st) st.textContent = '连接已断开';
      U.UI.toastMsg('与房主的连接已断开');
    };
  }

  function renderGuestAnswer(auto) {
    var url = makeUrl('#resp=' + sm.answerCode);
    var qr = qrSVG(url);
    showRoom(
      '<div class="net-head"><span class="net-kicker">客人 · 房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">退出</button></div>' +
      '<h2>把应答码交给房主</h2>' +
      '<p class="net-sub">让房主在他的房间页点「📷 扫客人的应答码」扫描下面的二维码；或复制应答码发给房主粘贴。</p>' +
      (qr ? '<div class="net-qr">' + qr + '</div>' : '<p class="net-tip">二维码过长，请复制应答码。</p>') +
      '<textarea class="net-code" id="net-ans-code" readonly>' + esc(sm.answerCode) + '</textarea>' +
      '<button class="btn primary" id="net-ans-copy">复制应答码</button>' +
      '<p class="net-tip" id="net-guest-status">等待房主连接…</p>'
    );
    $('net-back').addEventListener('click', function () {
      try { if (sm.guestPc) sm.guestPc.close(); } catch (e) {}
      sm.role = null;
      hideRoom();
      var s = $('start'); if (s) s.classList.remove('hidden');
    });
    $('net-ans-copy').addEventListener('click', function () {
      copyText(sm.answerCode);
      U.UI.toastMsg('应答码已复制，请发给房主');
    });
    watchGuestConnection();
  }

  function watchGuestConnection() {
    var st = $('net-guest-status');
    if (!st) return;
    var cleared = false;
    function stop() { cleared = true; }
    sm.guestWatch = stop;
    var poll = setInterval(function () {
      var pc = sm.guestPc;
      var el = $('net-guest-status');
      if (!pc || !el || cleared || sm.role !== 'guest') { clearInterval(poll); return; }
      if (sm.guestDc && sm.guestDc.readyState === 'open') { clearInterval(poll); return; }
      var cs = pc.connectionState;
      if (cs === 'new') el.textContent = '等待房主扫应答码…';
      else if (cs === 'connecting') el.textContent = '正在与房主建立连接…';
      else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
        clearInterval(poll);
        el.innerHTML = '<b style="color:#e08a7f">连接失败。</b>请检查：<br>' +
          '① 两台手机连的是<b>同一个 WiFi</b>（部分 WiFi 禁止设备互访）；<br>' +
          '② 房主扫完码后停留在房间页面；<br>' +
          '③ 仍不行就点右上角「退出」，房主点「重新生成邀请码」再试一次。';
      }
    }, 800);
    pcOnState();
    function pcOnState() {
      var pc = sm.guestPc;
      if (!pc) return;
      pc.onconnectionstatechange = function () {
        if (cleared) return;
        var el = $('net-guest-status');
        if (!el || (sm.guestDc && sm.guestDc.readyState === 'open')) return;
        var cs = pc.connectionState;
        if (cs === 'connecting') el.textContent = '正在与房主建立连接…';
        else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
          el.innerHTML = '<b style="color:#e08a7f">连接失败。</b>请检查两台手机是否同一个 WiFi，房主是否已扫码；可退出后重新扫码。';
        }
      };
    }
  }

  /* ---------------- 开局与同步 ---------------- */

  Net.startGame = function () {
    var seats = sm.connectedSeats.slice(0).sort(function (a, b) { return a - b; });
    if (!seats.length) { netErr('至少需要一位客人'); return; }
    Object.keys(sm.peers).forEach(function (k) {
      var p = sm.peers[Number(k)];
      if (!p.connected) { try { p.pc.close(); } catch (e) {} delete sm.peers[Number(k)]; }
    });
    sm.openSeat = null;
    var count = sm.count;
    var humanIds = [0].concat(seats);
    var names = ['房主', '玩家2', '玩家3', '玩家4'];
    var g = E.createGame({ playerCount: count, humanIds: humanIds, names: names, skillMode: U.UI.skillMode });
    var UI = U.UI;
    /* 关键：让 UI 模块把内部 g/me 切到这局游戏（render/pump 都读 UI 模块内部状态） */
    if (UI.netStart) UI.netStart(g, 0, { role: 'host', seat: 0, room: sm.room });
    else { UI.g = g; UI.me = 0; UI.net = { role: 'host', seat: 0, room: sm.room }; }
    sm.syncSig = '';
    hideRoom();
    var s = $('start'); if (s) s.classList.add('hidden');
    broadcast();
    UI.pump();
  };

  Net.applyAction = function (seat, msg) {
    var UI = U.UI;
    var g = UI.g;
    if (!g || g.over || !UI.net || UI.net.role !== 'host') return;
    if (g.turn !== seat && msg.a !== 'uno' && msg.a !== 'skill') return;
    E.unoExpired(g);
    var ok = false;
    if (msg.a === 'play') {
      var r = E.playCard(g, msg.uid, msg.color, msg.twinUid);
      ok = !!(r && r.ok);
      if (ok && g.over) UI.showResults();
    } else if (msg.a === 'draw') {
      ok = E.drawCard(g, msg.wf).ok;
    } else if (msg.a === 'keep') {
      ok = E.passDrawn(g).ok;
    } else if (msg.a === 'uno') {
      ok = E.shoutUno(g, seat).ok;
    } else if (msg.a === 'skill') {
      if (msg.s === 'pick') ok = E.assignSkill(g, seat, msg.id).ok;
      else if (msg.s === 'swap') ok = E.useSwap(g, seat, msg.uid, msg.target).ok;
      else if (msg.s === 'eye') ok = E.useEye(g, seat, msg.target).ok;
      else if (msg.s === 'wfkeep') ok = E.windfallKeep(g, seat, msg.uid).ok;
      else if (msg.s === 'combopass') ok = E.passCombo(g).ok;
      else if (msg.s === 'reversal') ok = E.useReversal(g, seat).ok;
      else if (msg.s === 'portal') ok = E.armPortal(g, seat, msg.target).ok;
      else if (msg.s === 'refresh') ok = E.useRefresh(g, seat, msg.uid).ok;
      else if (msg.s === 'draw2') ok = E.useDraw2(g, seat).ok;
      else if (msg.s === 'mswap') ok = E.useMSwap(g, seat, msg.target).ok;
      else if (msg.s === 'steal') ok = E.useSteal(g, seat, msg.target).ok;
      else if (msg.s === 'wreck') ok = E.useWreck(g, seat, msg.target).ok;
      else if (msg.s === 'delay') ok = E.useDelay(g, seat, msg.target).ok;
      else if (msg.s === 'hex') ok = E.useHex(g, seat, msg.target, msg.color).ok;
      else if (msg.s === 'oracle') ok = E.useOracle(g, seat).ok;
      else if (msg.s === 'oracleMove') ok = E.oracleMove(g, seat, msg.uid).ok;
      else if (msg.s === 'oracleSkip') ok = E.oracleSkip(g, seat).ok;
      else if (msg.s === 'arm') ok = E.armSkill(g, seat, msg.id).ok;
      else if (msg.s === 'balance') ok = E.useBalance(g, seat, msg.uids || []).ok;
      else if (msg.s === 'hotspring') ok = E.useHotSpring(g, seat).ok;
      else if (msg.s === 'splash') ok = E.useSplash(g, seat).ok;
      else if (msg.s === 'sleep') ok = E.useSleep(g, seat, msg.target).ok;
      else if (msg.s === 'bomb') ok = E.useBomb(g, seat, msg.target).ok;
      else if (msg.s === 'leaf') ok = E.useLeaf(g, seat, msg.from, msg.to).ok;
      else if (msg.s === 'grape') ok = E.useGrape(g, seat).ok;
      else if (msg.s === 'snack') ok = E.useSnack(g, seat, msg.uids || [], msg.target).ok;
    }
    UI.render();
    broadcast();
    if (ok) UI.pump();
  };

  Net.sendAction = function (msg) {
    if (sm.role !== 'guest' || !sm.guestDc || sm.guestDc.readyState !== 'open') return false;
    msg.t = 'action';
    try { sm.guestDc.send(JSON.stringify(msg)); } catch (e) {}
    return true;
  };

  Net.isGuest = function () { return sm.role === 'guest'; };
  /* 供 UI 在收到游戏状态后关掉房间弹层 */
  Net.closeRoom = hideRoom;
  Net.isConnected = function () {
    if (sm.role === 'host') return true;
    return sm.role === 'guest' && sm.guestDc && sm.guestDc.readyState === 'open';
  };

  Net.sync = function () {
    var UI = U.UI;
    var g = UI.g;
    if (!g || !UI.net || UI.net.role !== 'host') return;
    var sig = [
      g.turn, g.dir, g.color, g.top.uid, g.log.length, g.over, g.deck.length,
      g.awaiting ? g.awaiting.type : '', g.unoPending,
      g.players.map(function (p) { return p.hand.length + '@' + (p.skill ? p.skill.id + p.skill.uses + (p.skill.armed ? 'A' : '') : '-'); }).join(','),
      g.comboSeat == null ? '' : g.comboSeat,
      g.peek ? g.peek.target : '',
      g.windfallUids ? g.windfallUids.join('.') : '',
      g.luckyNum || '',
      g.hex ? g.hex.by + '.' + g.hex.target + '.' + g.hex.color : '',
      (g.delayed || []).join('.'),
      (g.sleepy || []).join('.'),
      g.bomb ? g.bomb.seat + '.' + g.bomb.count : '',
      g.grapeSeat == null ? '' : g.grapeSeat,
      g.portalTarget ? g.portalTarget.by + '.' + g.portalTarget.target : '',
      g.oracleShow ? 'o' : ''
    ].join('|');
    if (sig === sm.syncSig) return;
    sm.syncSig = sig;
    clearTimeout(sm.syncTimer);
    sm.syncTimer = setTimeout(broadcast, 60);
  };

  function broadcast() {
    var UI = U.UI;
    var g = UI.g;
    if (!g || !UI.net || UI.net.role !== 'host') return;
    Object.keys(sm.peers).forEach(function (k) {
      var peer = sm.peers[Number(k)];
      if (!peer || !peer.connected || !peer.dc || peer.dc.readyState !== 'open') return;
      try {
        peer.dc.send(JSON.stringify({ t: 'state', view: buildView(g, Number(k)) }));
      } catch (e) {}
    });
  }
  Net.broadcast = broadcast;

  function buildView(g, seat) {
    var v = JSON.parse(JSON.stringify(g));
    v.deckCount = g.deck.length;
    v.deck = [];
    v.discard = [];
    v.discardTail = g.discard.slice(-3);
    v.mySeat = seat;
    /* 天眼生效中：把被偷看对象的手牌一并发给使用者 */
    var peeking = g.peek && g.peek.by === seat ? g.peek.target : -1;
    v.players.forEach(function (p) {
      if (p.id !== seat && p.id !== peeking) p.hand = [];
    });
    /* 蛊惑押注颜色：只给蛊惑者与目标看 */
    if (v.hex && seat !== v.hex.by && seat !== v.hex.target) v.hex.color = '';
    /* 占卜师看到的牌：只给使用者看 */
    if (v.oracleShow && v.oracleShow.by !== seat) v.oracleShow = null;
    if (v.turn !== seat) { v.awaiting = null; v.drawnUid = -1; }
    return v;
  }

  /* ---------------- 扫码/哈希入口 ---------------- */

  Net.handleHash = function () {
    var h = location.hash.replace(/^#/, '');
    var i = h.indexOf('=');
    if (i < 0) return false;
    var key = h.slice(0, i);
    var val = h.slice(i + 1);
    if (!val) return false;
    if (key === 'offer') {
      if (sm.role) {
        /* 房主/客人状态进行中，忽略误扫的邀请码 */
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
        return true;
      }
      Net.joinWithOffer(val, true);
      return true;
    }
    if (key === 'resp') {
      handleResp(val);
      return true;
    }
    return false;
  };

  async function handleResp(code) {
    var ans = null;
    try { ans = await unpack(code); } catch (e) {}
    var room = ans ? (ans.room || '') : '';
    if (room) {
      try { localStorage.setItem(RESP_PREFIX + room, code); } catch (e) {}
      if (respChan) {
        try { respChan.postMessage({ room: room, code: code }); } catch (e) {}
      }
    }
    var applied = false;
    if (sm.role === 'host' && ans && ans.seat != null && sm.peers[ans.seat]) {
      try { await Net.applyAnswer(code, ans.seat); applied = true; } catch (e) {}
    }
    /* 房间状态还在本页时清掉 hash，避免刷新后再次误入本页 */
    if (sm.role) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
    var backBtn = '';
    if (sm.role === 'host') backBtn = '<button class="btn primary" id="net-resp-back">返回房间</button>';
    else if (sm.role === 'guest') backBtn = '<button class="btn" id="net-resp-back">返回我的应答页</button>';
    var sub;
    if (applied) {
      sub = '应答码已生效，点下方按钮回到房间查看座位状态。';
    } else if (sm.role === 'host') {
      sub = '没能自动连接（应答码可能不属于当前房间的待连座位）。可让客人重新出示应答码再扫一次，或在本页粘贴应答码。';
    } else if (sm.role === 'guest') {
      sub = '本页只处理房主扫码，你不需要扫这个码。点下方按钮回到你的应答页等待房主连接。';
    } else {
      sub = '请切回房主的房间页面查看是否已连接。如果没反应，说明扫码打开了另一个浏览器 App（两个 App 的页面不互通），请复制下面的应答码，回到<b>原来开房间页面的那个浏览器</b>里粘贴。';
    }
    showRoom(
      '<div class="net-head"><span class="net-kicker">应答码</span></div>' +
      '<h2>' + (applied ? '已连接！' : '已提交给房主页面') + '</h2>' +
      '<p class="net-sub">' + sub + '</p>' +
      '<textarea class="net-code" id="net-resp-code" readonly>' + esc(code) + '</textarea>' +
      '<button class="btn" id="net-resp-copy">复制应答码</button>' +
      backBtn +
      '<p class="net-tip">完成后可以关闭本页。</p>'
    );
    $('net-resp-copy').addEventListener('click', function () {
      copyText(code);
      U.UI.toastMsg('应答码已复制');
    });
    var back = $('net-resp-back');
    if (back) back.addEventListener('click', function () {
      if (sm.role === 'guest') renderGuestAnswer(false);
      else renderHostRoom();
    });
  }

  function onRespCode(code) {
    if (sm.role !== 'host') return;
    Net.applyAnswer(code).catch(function (err) { netErr(err.message); });
  }

  if (respChan) {
    respChan.onmessage = function (ev) {
      var d = ev.data || {};
      if (!d.code) return;
      onRespCode(d.code);
    };
  }

  window.addEventListener('hashchange', function () {
    UNO.Net.handleHash();
  });

  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(RESP_PREFIX) !== 0) return;
    var code = e.newValue;
    try { localStorage.removeItem(e.key); } catch (err) {}
    if (!code) return;
    onRespCode(code);
  });
})();
