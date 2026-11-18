// shared/web/netplay.js
// 像素街机馆 · WebRTC + WebSocket 双擎跨端联机模块 (Remote Play 远程同乐模式)
// 适配 PC 端房主 (1P) 与 手机端访客 (2P) 扫码极速同屏对战。
// 1. 优先尝试 WebRTC 原生音视频流 + 有序可靠 DataChannel；
// 2. 当遇到 Clash 代理 / 4G-5G 对称 NAT / 微信容器阻断 UDP 导致 ICE 卡 checking 时，
//    毫秒级无感启用 PeerJS 信令 WebSocket 保底中继通道（同步推送实时画面帧 + 按键 + 心跳对账），
//    彻底根治手机扫码后黑屏、连不上或按键无响应。
(function (root) {
  'use strict';

  var locSearch = (typeof window !== 'undefined' && window.location && window.location.search) || '';
  var qs = new URLSearchParams(locSearch);
  var roomParam = qs.get('room');
  var urlGameParam = qs.get('game') || '';

  var DEFAULT_PAD = {
    layout: 'two-button',
    stick: false,
    actions: [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' }
    ],
    capsules: [
      { id: 'select', label: '选择' },
      { id: 'start', label: '开始' }
    ],
    shoulders: []
  };

  var DIAMOND_BY_KEY = { B: 'bottom', A: 'right', X: 'top', Y: 'left' };
  var DIAMOND_ORDER = ['bottom', 'right', 'top', 'left'];
  var DPAD_SECTORS = [
    ['right'],
    ['down', 'right'],
    ['down'],
    ['down', 'left'],
    ['left'],
    ['up', 'left'],
    ['up'],
    ['up', 'right']
  ];

  var ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.qq.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' }
  ];

  var Netplay = {
    peer: null,
    conn: null,
    call: null,
    roomId: null,
    activeClientPeerId: null,
    gameId: urlGameParam || 'tank-nes',
    isHost: false,
    isClient: false,
    latencyMs: 0,
    mediaStream: null,
    pingTimer: null,
    helloRetryTimer: null,
    streamRetryTimer: null,
    frameStreamTimer: null,
    onInputCallback: null,
    onStatusCallback: null
  };

  // 1. 工具函数：随机生成易记的 4 位房间号（通用前缀）
  function generateRoomId() {
    var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var res = '';
    for (var i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'PLAY-' + res;
  }

  // 清洗用户手工输入的局域网 host（剥离误粘贴的 http://、https:// 及路径）
  function cleanHostInput(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    s = s.replace(/^https?:\/\//i, '');
    var slashIdx = s.indexOf('/');
    if (slashIdx >= 0) s = s.slice(0, slashIdx);
    return s.trim();
  }

  // 清洗 pad 配置为纯 JSON 可传输对象，剔除函数与关注弹窗等附加字段
  function sanitizePad(pad) {
    var src = pad && typeof pad === 'object' ? pad : DEFAULT_PAD;
    function pickList(list, fields) {
      if (!Array.isArray(list)) return [];
      return list.filter(function (item) {
        return item && item.id;
      }).map(function (item) {
        var out = { id: String(item.id), label: String(item.label || item.id) };
        for (var i = 0; i < fields.length; i++) {
          var k = fields[i];
          if (item[k] !== undefined && item[k] !== null && typeof item[k] !== 'function' && typeof item[k] !== 'object') {
            out[k] = item[k];
          }
        }
        return out;
      });
    }
    return {
      layout: src.layout ? String(src.layout) : '',
      stick: !!src.stick,
      actions: pickList(src.actions, ['key', 'sub', 'row', 'col']),
      capsules: pickList(src.capsules, []),
      shoulders: pickList(src.shoulders, [])
    };
  }

  function formatCapsuleLabel(id, rawLabel) {
    var norm = String(id || '').toLowerCase();
    var text = String(rawLabel || id || '').trim();
    if (norm === 'coin') return '投币';
    if (norm === 'start') return '开始';
    if (norm === 'select') return '选择';
    return text.replace(/\s*25¢/g, '').replace(/^1P\s*/i, '') || norm;
  }

  // 2. 手机端 D-Pad 8 方向滑动解算（输入为中心归一化坐标 nx, ny in [-1, 1]）
  function resolveDpadDirections(nx, ny, deadzone) {
    var dz = typeof deadzone === 'number' ? deadzone : 0.24;
    var mag = Math.sqrt(nx * nx + ny * ny);
    if (!isFinite(mag) || mag < dz) return [];
    var sector = (Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) % 8 + 8) % 8;
    return DPAD_SECTORS[sector].slice();
  }

  // 3. 根据游戏 pad 动态生成手机端 2P 按钮布局规格
  function buildClientButtonSpecs(pad) {
    var clean = sanitizePad(pad);
    var actions = clean.actions.length ? clean.actions : sanitizePad(DEFAULT_PAD).actions;
    var capsules = clean.capsules.length ? clean.capsules : sanitizePad(DEFAULT_PAD).capsules;
    var shoulders = clean.shoulders || [];

    var layoutMode = 'two';
    if (clean.layout === 'six' || actions.length >= 6) {
      layoutMode = 'six';
    } else if (clean.layout === 'diamond' || clean.layout === 'four-button' || actions.length === 4) {
      layoutMode = 'diamond';
    } else if (actions.length === 3) {
      layoutMode = 'three';
    }

    var actionSpecs = [];
    if (layoutMode === 'six') {
      actionSpecs = actions.slice(0, 6).map(function (a, idx) {
        var r = typeof a.row === 'number' ? a.row : Math.floor(idx / 3);
        var c = typeof a.col === 'number' ? a.col : (idx % 3);
        return {
          id: a.id,
          label: a.label,
          sub: a.sub || '',
          row: r,
          col: c,
          slot: 'grid-' + r + '-' + c
        };
      });
    } else if (layoutMode === 'diamond') {
      var usedSlots = {};
      var temp = actions.slice(0, 4).map(function (a) {
        var keyUpper = String(a.key || '').toUpperCase();
        var idUpper = String(a.id || '').toUpperCase();
        var slot = DIAMOND_BY_KEY[keyUpper] || DIAMOND_BY_KEY[idUpper] || null;
        if (slot && !usedSlots[slot]) {
          usedSlots[slot] = true;
        } else {
          slot = null;
        }
        return { a: a, slot: slot };
      });
      for (var i = 0; i < temp.length; i++) {
        if (!temp[i].slot) {
          for (var j = 0; j < DIAMOND_ORDER.length; j++) {
            if (!usedSlots[DIAMOND_ORDER[j]]) {
              temp[i].slot = DIAMOND_ORDER[j];
              usedSlots[DIAMOND_ORDER[j]] = true;
              break;
            }
          }
        }
        actionSpecs.push({
          id: temp[i].a.id,
          label: temp[i].a.label,
          sub: temp[i].a.sub || (temp[i].a.key ? String(temp[i].a.key) : ''),
          slot: temp[i].slot
        });
      }
    } else if (layoutMode === 'three') {
      var threeUsed = {};
      var threeSlots = ['bottom', 'right', 'top'];
      var threeTmp = actions.slice(0, 3).map(function (a) {
        var idLower = String(a.id || '').toLowerCase();
        var slot = idLower === 'b' ? 'bottom' : (idLower === 'a' ? 'right' : (idLower === 'x' ? 'top' : null));
        if (slot && !threeUsed[slot]) threeUsed[slot] = true;
        else slot = null;
        return { a: a, slot: slot };
      });
      for (var t = 0; t < threeTmp.length; t++) {
        if (!threeTmp[t].slot) {
          for (var ts = 0; ts < threeSlots.length; ts++) {
            if (!threeUsed[threeSlots[ts]]) {
              threeTmp[t].slot = threeSlots[ts];
              threeUsed[threeSlots[ts]] = true;
              break;
            }
          }
        }
        actionSpecs.push({
          id: threeTmp[t].a.id,
          label: threeTmp[t].a.label,
          sub: threeTmp[t].a.sub || '',
          slot: threeTmp[t].slot
        });
      }
    } else {
      var two = actions.slice(0, 2);
      if (two.length === 2 && String(two[0].id).toLowerCase() === 'a' && String(two[1].id).toLowerCase() === 'b') {
        two = [two[1], two[0]];
      }
      var twoSlots = ['left', 'right'];
      actionSpecs = two.map(function (a, idx) {
        return {
          id: a.id,
          label: a.label,
          sub: a.sub || '',
          slot: twoSlots[idx] || 'right'
        };
      });
    }

    return {
      layoutMode: layoutMode,
      actions: actionSpecs,
      capsules: capsules.map(function (c) {
        return { id: c.id, label: formatCapsuleLabel(c.id, c.label) };
      }),
      shoulders: shoulders.map(function (s) {
        return { id: s.id, label: String(s.label || s.id).toUpperCase() };
      })
    };
  }

  // 4. 手机端多指与 D-Pad 滑动状态追踪器（纯内存去重发包，支持生成完整按住快照供心跳对账）
  function createClientInputSender(sendFn) {
    var pointers = {}; // pointerId -> btnId
    var counts = {};   // btnId -> active pointer count
    var dpadHeld = {}; // dir -> true

    function setDpadDirs(nextDirs) {
      var nextMap = {};
      if (Array.isArray(nextDirs)) {
        for (var i = 0; i < nextDirs.length; i++) {
          if (nextDirs[i]) nextMap[nextDirs[i]] = true;
        }
      }
      var prevKeys = Object.keys(dpadHeld);
      for (var p = 0; p < prevKeys.length; p++) {
        var dir = prevKeys[p];
        if (!nextMap[dir]) {
          delete dpadHeld[dir];
          sendFn(dir, false);
        }
      }
      var nextKeys = Object.keys(nextMap);
      for (var n = 0; n < nextKeys.length; n++) {
        var nd = nextKeys[n];
        if (!dpadHeld[nd]) {
          dpadHeld[nd] = true;
          sendFn(nd, true);
        }
      }
    }

    function pressButton(pointerId, btnId) {
      if (!btnId) return false;
      var pid = String(pointerId);
      var prev = pointers[pid];
      if (prev === btnId) return false;
      if (prev != null) releaseButton(pid);
      pointers[pid] = btnId;
      counts[btnId] = (counts[btnId] || 0) + 1;
      if (counts[btnId] === 1) sendFn(btnId, true);
      return true;
    }

    function releaseButton(pointerId) {
      var pid = String(pointerId);
      var btnId = pointers[pid];
      if (btnId == null) return false;
      delete pointers[pid];
      counts[btnId] = Math.max(0, (counts[btnId] || 1) - 1);
      if (counts[btnId] === 0) {
        delete counts[btnId];
        sendFn(btnId, false);
      }
      return true;
    }

    function releaseAll() {
      setDpadDirs([]);
      var held = Object.keys(counts);
      pointers = {};
      counts = {};
      for (var i = 0; i < held.length; i++) {
        sendFn(held[i], false);
      }
    }

    function snapshotHeld() {
      return Object.keys(dpadHeld).concat(Object.keys(counts));
    }

    return {
      setDpadDirs: setDpadDirs,
      pressButton: pressButton,
      releaseButton: releaseButton,
      releaseAll: releaseAll,
      snapshotHeld: snapshotHeld,
      getActiveDpad: function () { return Object.keys(dpadHeld); },
      getHeldButtons: function () { return Object.keys(counts); }
    };
  }

  // 5. 信令 WebSocket 保底中继层（当 WebRTC UDP 被 Clash 代理 / 对称 NAT 拦截时毫秒级接管）
  function sendWsRelay(peer, dstPeerId, data) {
    if (!peer || !dstPeerId || !data) return false;
    var sock = peer.socket || peer._socket;
    if (!sock || typeof sock.send !== 'function') return false;
    try {
      sock.send({
        type: 'CANDIDATE',
        dst: dstPeerId,
        payload: {
          candidate: {
            candidate: 'relay:' + JSON.stringify(data),
            sdpMid: '0',
            sdpMLineIndex: 0
          },
          type: 'data',
          connectionId: 'dc_relay'
        }
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function installWsRelay(peer, onRelayMessage) {
    if (!peer || peer._wsRelayInstalled) return;
    peer._wsRelayInstalled = true;

    function extractAndDispatch(msg) {
      if (!msg || msg.type !== 'CANDIDATE' || !msg.payload || msg.payload.connectionId !== 'dc_relay') {
        return false;
      }
      var candObj = msg.payload.candidate;
      var raw = candObj && typeof candObj.candidate === 'string' ? candObj.candidate : '';
      if (raw.indexOf('relay:') !== 0) return false;
      try {
        var parsed = JSON.parse(raw.slice(6));
        onRelayMessage(parsed, msg.src);
      } catch (_) {}
      return true;
    }

    if (typeof peer._handleMessage === 'function') {
      var origHandle = peer._handleMessage.bind(peer);
      peer._handleMessage = function (msg) {
        if (extractAndDispatch(msg)) return;
        return origHandle(msg);
      };
    } else {
      var sock = peer.socket || peer._socket;
      if (sock && typeof sock.on === 'function') {
        sock.on('message', function (msg) {
          extractAndDispatch(msg);
        });
      }
    }
  }

  // 检测当前是否处于访客客户端模式
  Netplay.isClientMode = function () {
    return !!roomParam;
  };

  function clearTimers() {
    if (Netplay.pingTimer) {
      clearInterval(Netplay.pingTimer);
      Netplay.pingTimer = null;
    }
    if (Netplay.helloRetryTimer) {
      clearInterval(Netplay.helloRetryTimer);
      Netplay.helloRetryTimer = null;
    }
    if (Netplay.streamRetryTimer) {
      clearTimeout(Netplay.streamRetryTimer);
      Netplay.streamRetryTimer = null;
    }
    if (Netplay.frameStreamTimer) {
      clearInterval(Netplay.frameStreamTimer);
      Netplay.frameStreamTimer = null;
    }
  }

  // 6. 房主模式 (Host)：初始化 Peer、等待 2P 连接，同时支持 WebRTC 推流与 WebSocket 实时帧保底推送
  Netplay.startHost = function (opts) {
    opts = opts || {};
    var onReady = opts.onReady || function () {};
    var onClientJoin = opts.onClientJoin || function () {};
    var onClientLeave = opts.onClientLeave || function () {};
    var onInput = opts.onInput || function () {};
    var onSyncHeld = opts.onSyncHeld || function () {};
    var getStream = opts.getStream || null;
    var getSourceCanvas = opts.getSourceCanvas || null;

    if (opts.gameId) Netplay.gameId = String(opts.gameId);

    var getWelcomeData = opts.getWelcomeData || function () {
      return {
        type: 'welcome',
        game: Netplay.gameId,
        title: opts.gameTitle || '',
        pad: sanitizePad(opts.pad),
        hostTime: Date.now()
      };
    };

    Netplay.isHost = true;
    Netplay.isClient = false;
    Netplay.roomId = generateRoomId();
    Netplay.activeClientPeerId = null;

    var clientWebrtcVideoOk = false;
    var relayCanvas = null;
    var relayCtx = null;
    var useWebp = true;

    if (typeof Peer === 'undefined') {
      console.error('PeerJS 库未加载，无法启动联机');
      return;
    }

    try {
      Netplay.peer = new Peer(Netplay.roomId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS }
      });
    } catch (e) {
      console.error('Peer 初始化异常:', e);
      return;
    }

    function sendToClient(peerId, payload) {
      var targetId = peerId || Netplay.activeClientPeerId || (Netplay.conn && Netplay.conn.peer);
      var sentDc = false;
      if (Netplay.conn && Netplay.conn.open && (!targetId || Netplay.conn.peer === targetId)) {
        try {
          Netplay.conn.send(payload);
          sentDc = true;
        } catch (_) {}
      }
      if (!sentDc && targetId) {
        sendWsRelay(Netplay.peer, targetId, payload);
      }
    }

    function startFrameStreamLoop() {
      if (Netplay.frameStreamTimer) clearInterval(Netplay.frameStreamTimer);
      if (!getSourceCanvas || typeof document === 'undefined') return;

      Netplay.frameStreamTimer = setInterval(function () {
        if (!Netplay.activeClientPeerId || clientWebrtcVideoOk) return;
        // 检查底层 WebSocket 发送缓冲区，避免弱网积压延迟
        try {
          var rawWs = Netplay.peer && Netplay.peer.socket && Netplay.peer.socket._socket;
          if (rawWs && rawWs.bufferedAmount > 49152) return;
        } catch (_) {}

        var src = null;
        try { src = getSourceCanvas(); } catch (_) { src = null; }
        if (!src || !src.width || !src.height) return;

        try {
          var w = Math.min(256, src.width);
          var h = Math.min(240, src.height);
          if (!relayCanvas) {
            relayCanvas = document.createElement('canvas');
            relayCtx = relayCanvas.getContext('2d', { alpha: false });
          }
          if (relayCanvas.width !== w || relayCanvas.height !== h) {
            relayCanvas.width = w;
            relayCanvas.height = h;
            if (relayCtx) relayCtx.imageSmoothingEnabled = false;
          }
          relayCtx.drawImage(src, 0, 0, w, h);
          var dataUrl = '';
          if (useWebp) {
            dataUrl = relayCanvas.toDataURL('image/webp', 0.52);
            if (dataUrl.indexOf('data:image/webp') !== 0) {
              useWebp = false;
              dataUrl = relayCanvas.toDataURL('image/jpeg', 0.55);
            }
          } else {
            dataUrl = relayCanvas.toDataURL('image/jpeg', 0.55);
          }
          if (dataUrl) {
            sendToClient(Netplay.activeClientPeerId, {
              type: 'frame',
              d: dataUrl,
              w: src.width,
              h: src.height,
              t: Date.now()
            });
          }
        } catch (_) {}
      }, 72);
    }

    function pushStreamToClient(clientPeerId, isAudioUpgrade) {
      if (!Netplay.peer || !clientPeerId || !getStream) return;
      // 若当前已有正在握手或已连通的通话且不是音频升级，不重复关闭重建，避免打断 ICE
      if (Netplay.call && Netplay.call.peer === clientPeerId && !isAudioUpgrade) {
        var pc = Netplay.call.peerConnection;
        var ice = pc && pc.iceConnectionState;
        if (ice === 'checking' || ice === 'connected' || ice === 'completed') {
          return;
        }
      }
      var stream = getStream();
      if (!stream) return;

      if (Netplay.call) {
        try { Netplay.call.close(); } catch (_) {}
        Netplay.call = null;
      }

      var call = Netplay.peer.call(clientPeerId, stream);
      Netplay.call = call;
      if (call) {
        call.on('close', function () {
          if (Netplay.call === call) Netplay.call = null;
        });
        call.on('error', function (err) {
          console.warn('房主推流通话异常:', err);
        });
      }
    }

    function handleClientJoinSession(clientPeerId) {
      if (!clientPeerId) return;
      var isNewClient = Netplay.activeClientPeerId !== clientPeerId;
      Netplay.activeClientPeerId = clientPeerId;
      if (isNewClient) {
        clientWebrtcVideoOk = false;
        onClientJoin(clientPeerId);
        pushStreamToClient(clientPeerId, false);
        startFrameStreamLoop();
      }
      sendToClient(clientPeerId, getWelcomeData());
    }

    function handleClientPacket(data, srcPeerId) {
      if (!data || typeof data !== 'object') return;
      var peerId = srcPeerId || Netplay.activeClientPeerId || (Netplay.conn && Netplay.conn.peer);
      if (peerId && Netplay.activeClientPeerId !== peerId) {
        handleClientJoinSession(peerId);
      }
      if (data.type === 'input') {
        onInput(data.btn, data.pressed, 2);
      } else if (data.type === 'ping') {
        if (Array.isArray(data.held)) {
          onSyncHeld(data.held);
        }
        sendToClient(peerId, { type: 'pong', clientTime: data.clientTime });
      } else if (data.type === 'hello') {
        handleClientJoinSession(peerId);
      } else if (data.type === 'request-stream') {
        pushStreamToClient(peerId, false);
        startFrameStreamLoop();
      } else if (data.type === 'webrtc-video-ok') {
        clientWebrtcVideoOk = true;
      }
    }

    installWsRelay(Netplay.peer, function (data, srcPeerId) {
      handleClientPacket(data, srcPeerId);
    });

    Netplay.peer.on('open', function (id) {
      Netplay.roomId = id;
      installWsRelay(Netplay.peer, function (data, srcPeerId) {
        handleClientPacket(data, srcPeerId);
      });
      onReady(id);
    });

    var detachPrevConn = null;

    Netplay.peer.on('connection', function (conn) {
      // 若旧 2P 刷新网页重连，先静默剥离旧连接，避免旧连接晚到的 close 把新 2P 状态刷成断开
      if (detachPrevConn) {
        detachPrevConn();
        detachPrevConn = null;
      }

      var clientActive = false;
      var detached = false;
      Netplay.conn = conn;

      detachPrevConn = function () {
        detached = true;
        clientActive = false;
        try { conn.close(); } catch (_) {}
      };

      // 当信令收到客户端连接请求时立即登记并启动保底帧流，无需死等 WebRTC ICE 完成
      if (conn && conn.peer) {
        clientActive = true;
        handleClientJoinSession(conn.peer);
      }

      function notifyLeave() {
        if (detached || !clientActive) return;
        clientActive = false;
        if (Netplay.conn === conn) Netplay.conn = null;
        if (Netplay.activeClientPeerId === conn.peer) {
          Netplay.activeClientPeerId = null;
        }
        onClientLeave();
      }

      conn.on('open', function () {
        if (detached) return;
        clientActive = true;
        handleClientJoinSession(conn.peer);
      });

      conn.on('data', function (data) {
        if (detached) return;
        handleClientPacket(data, conn.peer);
      });

      conn.on('close', notifyLeave);
      conn.on('error', function (err) {
        console.warn('DataChannel 异常:', err);
        notifyLeave();
      });
    });

    // 兼容旧版访客主动发起 call 的回退分支
    Netplay.peer.on('call', function (call) {
      Netplay.call = call;
      var stream = getStream ? getStream() : null;
      if (stream) call.answer(stream);
      else call.answer();
      call.on('close', function () {
        if (Netplay.call === call) Netplay.call = null;
      });
    });

    Netplay.peer.on('error', function (err) {
      console.warn('Peer 错误:', err);
    });
  };

  // 7. 访客客户端模式 (Client / 手机端)
  Netplay.startClient = function (opts) {
    opts = opts || {};
    var onConnected = opts.onConnected || function () {};
    var onWelcome = opts.onWelcome || function () {};
    var onStream = opts.onStream || function () {};
    var onFrame = opts.onFrame || function () {};
    var onDisconnected = opts.onDisconnected || function () {};
    var getHeldSnapshot = opts.getHeldSnapshot || function () { return []; };
    var targetRoom = roomParam;
    var notifiedDisconnect = false;
    var isConnected = false;
    var gotWelcome = false;
    var gotStream = false;

    Netplay.isHost = false;
    Netplay.isClient = true;
    Netplay.roomId = targetRoom;

    if (typeof Peer === 'undefined') {
      if (typeof alert === 'function') alert('联机组件载入中，请稍候重试');
      return;
    }

    function sendPacket(pkt) {
      if (Netplay.conn && Netplay.conn.open) {
        try {
          Netplay.conn.send(pkt);
          return true;
        } catch (_) {}
      }
      return sendWsRelay(Netplay.peer, targetRoom, pkt);
    }

    function markConnected() {
      if (isConnected) return;
      isConnected = true;
      onConnected(targetRoom);
      if (Netplay.pingTimer) clearInterval(Netplay.pingTimer);
      Netplay.pingTimer = setInterval(function () {
        sendPacket({
          type: 'ping',
          clientTime: Date.now(),
          held: getHeldSnapshot()
        });
      }, 1200);
    }

    function handleHostPacket(data) {
      if (!data || typeof data !== 'object') return;
      markConnected();
      if (data.type === 'welcome') {
        gotWelcome = true;
        if (Netplay.helloRetryTimer) {
          clearInterval(Netplay.helloRetryTimer);
          Netplay.helloRetryTimer = null;
        }
        onWelcome(data);
      } else if (data.type === 'pong') {
        var rtt = Date.now() - data.clientTime;
        Netplay.latencyMs = Math.max(1, Math.round(rtt / 2));
        if (typeof document !== 'undefined') {
          var latEl = document.getElementById('netplay-ping');
          if (latEl) latEl.textContent = Netplay.latencyMs + 'ms';
        }
      } else if (data.type === 'frame' && data.d) {
        onFrame(data);
      }
    }

    function notifyDisconnect() {
      if (notifiedDisconnect) return;
      notifiedDisconnect = true;
      clearTimers();
      onDisconnected();
    }

    try {
      Netplay.peer = new Peer({
        debug: 1,
        config: { iceServers: ICE_SERVERS }
      });
    } catch (e) {
      console.error('Peer Client 初始化异常:', e);
      return;
    }

    installWsRelay(Netplay.peer, function (data) {
      handleHostPacket(data);
    });

    // 接听来自房主的主动推流呼叫
    Netplay.peer.on('call', function (call) {
      if (Netplay.call && Netplay.call !== call) {
        try { Netplay.call.close(); } catch (_) {}
      }
      Netplay.call = call;
      call.answer();
      call.on('stream', function (remoteStream) {
        gotStream = true;
        markConnected();
        onStream(remoteStream);
      });
      call.on('error', function (err) {
        console.warn('接收媒体流异常:', err);
      });
    });

    Netplay.peer.on('open', function () {
      installWsRelay(Netplay.peer, function (data) {
        handleHostPacket(data);
      });

      // 1) 发起标准 WebRTC DataChannel 连接
      var conn = Netplay.peer.connect(targetRoom, { reliable: true });
      Netplay.conn = conn;

      // 2) 同时通过信令 WebSocket 立即发送 hello 握手，即使 WebRTC ICE 卡在 checking 也能秒连并出画面
      sendWsRelay(Netplay.peer, targetRoom, { type: 'hello', clientTime: Date.now() });
      if (Netplay.helloRetryTimer) clearInterval(Netplay.helloRetryTimer);
      Netplay.helloRetryTimer = setInterval(function () {
        if (gotWelcome) {
          clearInterval(Netplay.helloRetryTimer);
          Netplay.helloRetryTimer = null;
          return;
        }
        sendWsRelay(Netplay.peer, targetRoom, { type: 'hello', clientTime: Date.now() });
      }, 650);

      conn.on('open', function () {
        markConnected();
        sendPacket({ type: 'hello', clientTime: Date.now() });

        if (Netplay.streamRetryTimer) clearTimeout(Netplay.streamRetryTimer);
        Netplay.streamRetryTimer = setTimeout(function () {
          Netplay.streamRetryTimer = null;
          if (!gotStream) {
            sendPacket({ type: 'request-stream' });
          }
        }, 2500);
      });

      conn.on('data', function (data) {
        handleHostPacket(data);
      });

      conn.on('close', notifyDisconnect);
      conn.on('error', function (err) {
        console.warn('连接房主失败:', err);
      });
    });

    Netplay.peer.on('error', function (err) {
      console.warn('Peer 错误:', err);
    });
  };

  // 通知房主手机端已成功解码渲染 WebRTC 原生视频流，可停止保底 WebSocket 帧推送
  Netplay.notifyWebrtcVideoReady = function () {
    if (!Netplay.isClient) return;
    if (Netplay.conn && Netplay.conn.open) {
      try { Netplay.conn.send({ type: 'webrtc-video-ok' }); return; } catch (_) {}
    }
    if (Netplay.peer && Netplay.roomId) {
      sendWsRelay(Netplay.peer, Netplay.roomId, { type: 'webrtc-video-ok' });
    }
  };

  // 8. 访客发送按键至房主（优先走 DataChannel，未就绪时自动走信令 WebSocket 保底中继）
  Netplay.sendInput = function (btn, pressed) {
    var pkt = {
      type: 'input',
      btn: btn,
      pressed: !!pressed,
      player: 2,
      t: Date.now()
    };
    if (Netplay.conn && Netplay.conn.open) {
      try {
        Netplay.conn.send(pkt);
        return;
      } catch (_) {}
    }
    if (Netplay.peer && Netplay.roomId) {
      sendWsRelay(Netplay.peer, Netplay.roomId, pkt);
    }
  };

  // 9. 房主生成联机分享链接 (自动清洗手工填写的协议头/斜杠，并使用当前真实游戏 ID)
  Netplay.getJoinUrl = function (overrideHost) {
    var loc = window.location;
    var cleaned = cleanHostInput(overrideHost);
    var host = cleaned || loc.host;
    var path = loc.pathname;
    var proto = loc.protocol;
    var gid = Netplay.gameId || urlGameParam || 'tank-nes';
    return proto + '//' + host + path + '?game=' + encodeURIComponent(gid) + '&room=' + encodeURIComponent(Netplay.roomId);
  };

  Netplay.disconnect = function () {
    clearTimers();
    try { if (Netplay.call) Netplay.call.close(); } catch (_) {}
    try { if (Netplay.conn) Netplay.conn.close(); } catch (_) {}
    try { if (Netplay.peer) Netplay.peer.destroy(); } catch (_) {}
    Netplay.call = null;
    Netplay.conn = null;
    Netplay.peer = null;
    Netplay.activeClientPeerId = null;
  };

  Netplay.generateRoomId = generateRoomId;
  Netplay.cleanHostInput = cleanHostInput;
  Netplay.sanitizePad = sanitizePad;
  Netplay.resolveDpadDirections = resolveDpadDirections;
  Netplay.buildClientButtonSpecs = buildClientButtonSpecs;
  Netplay.createClientInputSender = createClientInputSender;
  Netplay.sendWsRelay = sendWsRelay;
  Netplay.installWsRelay = installWsRelay;

  root.ArcadeNetplay = Netplay;
  if (typeof module !== 'undefined' && module.exports) module.exports = Netplay;
})(typeof window !== 'undefined' ? window : globalThis);
