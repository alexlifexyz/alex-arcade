// shared/web/netplay.js
// 像素街机馆 · WebRTC 双人跨端联机模块 (Remote Play 远程同乐模式)
// 适配 PC 端房主 (1P) 与 手机端访客 (2P) 扫码极速同屏对战。
// 由房主端主动发起音视频 Offer 推流（确保 video + audio 双轨完整送达手机端），
// 采用有序可靠 DataChannel + 周期性按住状态对账，彻底杜绝乱序卡键与丢包。
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

  var Netplay = {
    peer: null,
    conn: null,
    call: null,
    roomId: null,
    gameId: urlGameParam || 'tank-nes',
    isHost: false,
    isClient: false,
    latencyMs: 0,
    mediaStream: null,
    pingTimer: null,
    streamRetryTimer: null,
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

  // 5. 检测当前是否处于访客客户端模式
  Netplay.isClientMode = function () {
    return !!roomParam;
  };

  function clearTimers() {
    if (Netplay.pingTimer) {
      clearInterval(Netplay.pingTimer);
      Netplay.pingTimer = null;
    }
    if (Netplay.streamRetryTimer) {
      clearTimeout(Netplay.streamRetryTimer);
      Netplay.streamRetryTimer = null;
    }
  }

  // 6. 房主模式 (Host)：初始化 Peer、等待 2P 连接并主动向 2P 推送音视频流
  Netplay.startHost = function (opts) {
    opts = opts || {};
    var onReady = opts.onReady || function () {};
    var onClientJoin = opts.onClientJoin || function () {};
    var onClientLeave = opts.onClientLeave || function () {};
    var onInput = opts.onInput || function () {};
    var onSyncHeld = opts.onSyncHeld || function () {};
    var getStream = opts.getStream || null;

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

    if (typeof Peer === 'undefined') {
      console.error('PeerJS 库未加载，无法启动联机');
      return;
    }

    try {
      Netplay.peer = new Peer(Netplay.roomId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        }
      });
    } catch (e) {
      console.error('Peer 初始化异常:', e);
      return;
    }

    function pushStreamToClient(clientPeerId, isAudioUpgrade) {
      if (!Netplay.peer || !clientPeerId || !getStream) return;
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

      // 若首次推流时音频节点尚在异步 resume 微任务中，500ms 后检测是否新拿到了音轨并自动升级一次
      var hasAudio = stream.getAudioTracks && stream.getAudioTracks().length > 0;
      if (!hasAudio && !isAudioUpgrade) {
        if (Netplay.streamRetryTimer) clearTimeout(Netplay.streamRetryTimer);
        Netplay.streamRetryTimer = setTimeout(function () {
          Netplay.streamRetryTimer = null;
          if (!Netplay.conn || Netplay.conn.peer !== clientPeerId || !Netplay.conn.open) return;
          var nextStream = getStream();
          if (nextStream && nextStream.getAudioTracks && nextStream.getAudioTracks().length > 0) {
            pushStreamToClient(clientPeerId, true);
          }
        }, 500);
      }
    }

    Netplay.peer.on('open', function (id) {
      Netplay.roomId = id;
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

      function notifyLeave() {
        if (detached || !clientActive) return;
        clientActive = false;
        if (Netplay.conn === conn) Netplay.conn = null;
        onClientLeave();
      }

      conn.on('open', function () {
        if (detached) return;
        clientActive = true;
        onClientJoin(conn.peer);
        try {
          conn.send(getWelcomeData());
        } catch (err) {
          console.warn('发送欢迎配置失败:', err);
        }
        // 由房主主动向 2P 发起携带 video + audio 双轨的媒体呼叫
        pushStreamToClient(conn.peer, false);
      });

      conn.on('data', function (data) {
        if (detached || !data || typeof data !== 'object') return;
        if (data.type === 'input') {
          onInput(data.btn, data.pressed, 2);
        } else if (data.type === 'ping') {
          if (Array.isArray(data.held)) {
            onSyncHeld(data.held);
          }
          try { conn.send({ type: 'pong', clientTime: data.clientTime }); } catch (_) {}
        } else if (data.type === 'hello') {
          try { conn.send(getWelcomeData()); } catch (_) {}
        } else if (data.type === 'request-stream') {
          pushStreamToClient(conn.peer, false);
        }
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
    var onDisconnected = opts.onDisconnected || function () {};
    var getHeldSnapshot = opts.getHeldSnapshot || function () { return []; };
    var targetRoom = roomParam;
    var notifiedDisconnect = false;
    var gotStream = false;

    Netplay.isHost = false;
    Netplay.isClient = true;
    Netplay.roomId = targetRoom;

    if (typeof Peer === 'undefined') {
      if (typeof alert === 'function') alert('联机组件载入中，请稍候重试');
      return;
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
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        }
      });
    } catch (e) {
      console.error('Peer Client 初始化异常:', e);
      return;
    }

    // 接听来自房主的主动推流呼叫（房主 Offer 同时包含 video + audio 轨道，手机无需构造假流）
    Netplay.peer.on('call', function (call) {
      if (Netplay.call && Netplay.call !== call) {
        try { Netplay.call.close(); } catch (_) {}
      }
      Netplay.call = call;
      call.answer();
      call.on('stream', function (remoteStream) {
        gotStream = true;
        onStream(remoteStream);
      });
      call.on('error', function (err) {
        console.warn('接收媒体流异常:', err);
      });
    });

    Netplay.peer.on('open', function () {
      // 启用有序可靠通道 (reliable: true -> ordered: true)，彻底杜绝松开包乱序或丢包导致死走
      var conn = Netplay.peer.connect(targetRoom, { reliable: true });
      Netplay.conn = conn;

      conn.on('open', function () {
        onConnected(targetRoom);
        try { conn.send({ type: 'hello', clientTime: Date.now() }); } catch (_) {}

        clearTimers();
        Netplay.pingTimer = setInterval(function () {
          if (conn.open) {
            conn.send({
              type: 'ping',
              clientTime: Date.now(),
              held: getHeldSnapshot()
            });
          }
        }, 1500);

        // 若 1.8 秒内未收到房主推流呼叫，主动请求一次推流重发
        Netplay.streamRetryTimer = setTimeout(function () {
          Netplay.streamRetryTimer = null;
          if (!gotStream && conn.open) {
            try { conn.send({ type: 'request-stream' }); } catch (_) {}
          }
        }, 1800);
      });

      conn.on('data', function (data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'welcome') {
          onWelcome(data);
        } else if (data.type === 'pong') {
          var rtt = Date.now() - data.clientTime;
          Netplay.latencyMs = Math.round(rtt / 2);
          if (typeof document !== 'undefined') {
            var latEl = document.getElementById('netplay-ping');
            if (latEl) latEl.textContent = Netplay.latencyMs + 'ms';
          }
        }
      });

      conn.on('close', notifyDisconnect);
      conn.on('error', function (err) {
        console.warn('连接房主失败:', err);
        notifyDisconnect();
      });
    });

    Netplay.peer.on('error', function (err) {
      console.warn('Peer 错误:', err);
    });
  };

  // 8. 访客发送按键至房主
  Netplay.sendInput = function (btn, pressed) {
    if (Netplay.conn && Netplay.conn.open) {
      Netplay.conn.send({
        type: 'input',
        btn: btn,
        pressed: !!pressed,
        player: 2,
        t: Date.now()
      });
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
  };

  Netplay.generateRoomId = generateRoomId;
  Netplay.cleanHostInput = cleanHostInput;
  Netplay.sanitizePad = sanitizePad;
  Netplay.resolveDpadDirections = resolveDpadDirections;
  Netplay.buildClientButtonSpecs = buildClientButtonSpecs;
  Netplay.createClientInputSender = createClientInputSender;

  root.ArcadeNetplay = Netplay;
  if (typeof module !== 'undefined' && module.exports) module.exports = Netplay;
})(typeof window !== 'undefined' ? window : globalThis);
