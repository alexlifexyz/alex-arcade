// shared/web/netplay.js
// 像素街机馆 · WebRTC 双人跨端联机模块 (Remote Play 远程同乐模式)
// 适配 PC 端房主 (1P) 与 手机端访客 (2P) 扫码极速同屏对战。
// 零服务器负担，点对点 UDP 低延迟，100% 杜绝不同步 (Zero Desync)。
(function (root) {
  'use strict';

  var locSearch = (typeof window !== 'undefined' && window.location && window.location.search) || '';
  var qs = new URLSearchParams(locSearch);
  var roomParam = qs.get('room');
  var gameParam = qs.get('game') || 'tank-nes';

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
    isHost: false,
    isClient: false,
    latencyMs: 0,
    mediaStream: null,
    pingTimer: null,
    onInputCallback: null,
    onStatusCallback: null
  };

  // 1. 工具函数：随机生成易记的 4 位房间号（通用前缀，适用于所有双人游戏）
  function generateRoomId() {
    var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var res = '';
    for (var i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'PLAY-' + res;
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
        return {
          id: a.id,
          label: a.label,
          sub: a.sub || '',
          row: typeof a.row === 'number' ? a.row : Math.floor(idx / 3),
          col: typeof a.col === 'number' ? a.col : (idx % 3),
          slot: 'grid-' + (typeof a.row === 'number' ? a.row : Math.floor(idx / 3)) + '-' + (typeof a.col === 'number' ? a.col : (idx % 3))
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

  // 4. 手机端多指与 D-Pad 滑动状态追踪器（纯内存去重发包，断线可全释放）
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

    return {
      setDpadDirs: setDpadDirs,
      pressButton: pressButton,
      releaseButton: releaseButton,
      releaseAll: releaseAll,
      getActiveDpad: function () { return Object.keys(dpadHeld); },
      getHeldButtons: function () { return Object.keys(counts); }
    };
  }

  // 5. 检测当前是否处于访客客户端模式
  Netplay.isClientMode = function () {
    return !!roomParam;
  };

  function clearPingTimer() {
    if (Netplay.pingTimer) {
      clearInterval(Netplay.pingTimer);
      Netplay.pingTimer = null;
    }
  }

  // 6. 房主模式 (Host)：初始化 Peer 并等待 2P 手机连接
  Netplay.startHost = function (opts) {
    opts = opts || {};
    var onReady = opts.onReady || function () {};
    var onClientJoin = opts.onClientJoin || function () {};
    var onClientLeave = opts.onClientLeave || function () {};
    var onInput = opts.onInput || function () {};
    var getStream = opts.getStream || null;
    var getWelcomeData = opts.getWelcomeData || function () {
      return {
        type: 'welcome',
        game: gameParam,
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

    Netplay.peer.on('open', function (id) {
      Netplay.roomId = id;
      onReady(id);
    });

    Netplay.peer.on('connection', function (conn) {
      var clientActive = false;
      Netplay.conn = conn;

      function notifyLeave() {
        if (!clientActive) return;
        clientActive = false;
        if (Netplay.conn === conn) Netplay.conn = null;
        onClientLeave();
      }

      conn.on('open', function () {
        clientActive = true;
        onClientJoin(conn.peer);
        try {
          conn.send(getWelcomeData());
        } catch (err) {
          console.warn('发送欢迎配置失败:', err);
        }
      });

      conn.on('data', function (data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'input') {
          onInput(data.btn, data.pressed, 2);
        } else if (data.type === 'ping') {
          conn.send({ type: 'pong', clientTime: data.clientTime });
        }
      });

      conn.on('close', notifyLeave);
      conn.on('error', function (err) {
        console.warn('DataChannel 异常:', err);
        notifyLeave();
      });
    });

    Netplay.peer.on('call', function (call) {
      Netplay.call = call;
      var stream = getStream ? getStream() : null;
      if (stream) {
        call.answer(stream);
      } else {
        console.warn('未能捕获视频流');
        call.answer();
      }
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
    var targetRoom = roomParam;
    var notifiedDisconnect = false;

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
      clearPingTimer();
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

    Netplay.peer.on('open', function () {
      var conn = Netplay.peer.connect(targetRoom, { reliable: false });
      Netplay.conn = conn;

      conn.on('open', function () {
        onConnected(targetRoom);

        clearPingTimer();
        Netplay.pingTimer = setInterval(function () {
          if (conn.open) {
            conn.send({ type: 'ping', clientTime: Date.now() });
          }
        }, 1500);

        var dummyStream = null;
        try {
          var dummyCanvas = document.createElement('canvas');
          dummyCanvas.width = 2;
          dummyCanvas.height = 2;
          dummyStream = dummyCanvas.captureStream ? dummyCanvas.captureStream(1) : null;
        } catch (_) {}

        var call = Netplay.peer.call(targetRoom, dummyStream || (typeof MediaStream !== 'undefined' ? new MediaStream() : undefined));
        Netplay.call = call;

        if (call) {
          call.on('stream', function (remoteStream) {
            onStream(remoteStream);
          });
          call.on('close', notifyDisconnect);
          call.on('error', function (err) {
            console.warn('媒体通话异常:', err);
          });
        }
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

  // 9. 房主生成联机分享链接 (支持自动识别局域网 IP / 部署域名)
  Netplay.getJoinUrl = function (overrideHost) {
    var loc = window.location;
    var host = overrideHost || loc.host;
    var path = loc.pathname;
    var proto = loc.protocol;
    return proto + '//' + host + path + '?game=' + encodeURIComponent(gameParam) + '&room=' + encodeURIComponent(Netplay.roomId);
  };

  Netplay.disconnect = function () {
    clearPingTimer();
    try { if (Netplay.call) Netplay.call.close(); } catch (_) {}
    try { if (Netplay.conn) Netplay.conn.close(); } catch (_) {}
    try { if (Netplay.peer) Netplay.peer.destroy(); } catch (_) {}
    Netplay.call = null;
    Netplay.conn = null;
    Netplay.peer = null;
  };

  Netplay.generateRoomId = generateRoomId;
  Netplay.sanitizePad = sanitizePad;
  Netplay.resolveDpadDirections = resolveDpadDirections;
  Netplay.buildClientButtonSpecs = buildClientButtonSpecs;
  Netplay.createClientInputSender = createClientInputSender;

  root.ArcadeNetplay = Netplay;
  if (typeof module !== 'undefined' && module.exports) module.exports = Netplay;
})(typeof window !== 'undefined' ? window : globalThis);
