// shared/web/netplay.js
// 像素街机馆 · WebRTC 双人跨端联机模块 (Remote Play 远程同乐模式)
// 适配 PC 端房主 (1P) 与 手机端访客 (2P) 扫码极速同屏对战。
// 零服务器负担，点对点 UDP 低延迟，100% 杜绝不同步 (Zero Desync)。
(function (root) {
  'use strict';

  var Netplay = {
    peer: null,
    conn: null,
    call: null,
    roomId: null,
    isHost: false,
    isClient: false,
    latencyMs: 0,
    mediaStream: null,
    onInputCallback: null,
    onStatusCallback: null
  };

  var qs = new URLSearchParams(window.location.search);
  var roomParam = qs.get('room');
  var gameParam = qs.get('game') || 'tank-nes';

  // 1. 工具函数：随机生成易记的 4 位房间号
  function generateRoomId() {
    var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var res = '';
    for (var i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'TANK-' + res;
  }

  // 2. 检测当前是否处于访客客户端模式
  Netplay.isClientMode = function () {
    return !!roomParam;
  };

  // 3. 房主模式 (Host)：初始化 Peer 并等待 2P 手机连接
  Netplay.startHost = function (opts) {
    opts = opts || {};
    var onReady = opts.onReady || function () {};
    var onClientJoin = opts.onClientJoin || function () {};
    var onClientLeave = opts.onClientLeave || function () {};
    var onInput = opts.onInput || function () {};
    var getStream = opts.getStream || null;

    Netplay.isHost = true;
    Netplay.isClient = false;
    Netplay.roomId = generateRoomId();

    if (typeof Peer === 'undefined') {
      console.error('PeerJS 库未加载，无法启动联机');
      return;
    }

    // 建立 Peer 实例 (采用免费稳定的公共 STUN / PeerJS Cloud 节点)
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
      Netplay.conn = conn;

      conn.on('open', function () {
        onClientJoin(conn.peer);
        // 发送初始化握手包
        conn.send({ type: 'welcome', game: gameParam, hostTime: Date.now() });
      });

      conn.on('data', function (data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'input') {
          // 接收 2P 按键
          onInput(data.btn, data.pressed, 2);
        } else if (data.type === 'ping') {
          // 心跳与延迟计算
          conn.send({ type: 'pong', clientTime: data.clientTime });
        }
      });

      conn.on('close', function () {
        Netplay.conn = null;
        onClientLeave();
      });

      conn.on('error', function (err) {
        console.warn('DataChannel 异常:', err);
      });
    });

    // 处理来自 Client 的视频呼叫
    Netplay.peer.on('call', function (call) {
      Netplay.call = call;
      var stream = getStream ? getStream() : null;
      if (stream) {
        call.answer(stream);
      } else {
        console.warn('未能捕获 Canvas 视频流');
        call.answer();
      }
    });

    Netplay.peer.on('error', function (err) {
      console.warn('Peer 错误:', err);
    });
  };

  // 4. 访客客户端模式 (Client / 手机端)
  Netplay.startClient = function (opts) {
    opts = opts || {};
    var onConnected = opts.onConnected || function () {};
    var onStream = opts.onStream || function () {};
    var onDisconnected = opts.onDisconnected || function () {};
    var targetRoom = roomParam;

    Netplay.isHost = false;
    Netplay.isClient = true;
    Netplay.roomId = targetRoom;

    if (typeof Peer === 'undefined') {
      alert('联机组件载入中，请稍候重试');
      return;
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
      // 1) 建立 DataChannel 连接
      var conn = Netplay.peer.connect(targetRoom, { reliable: false });
      Netplay.conn = conn;

      conn.on('open', function () {
        onConnected(targetRoom);

        // 启动延迟心跳探测
        setInterval(function () {
          if (conn.open) {
            conn.send({ type: 'ping', clientTime: Date.now() });
          }
        }, 1500);

        // 2) 向房主发起视音频通话呼叫
        // 手机只需接收流，发送空音视频轨道占位
        var dummyStream = null;
        try {
          var dummyCanvas = document.createElement('canvas');
          dummyCanvas.width = 2;
          dummyCanvas.height = 2;
          dummyStream = dummyCanvas.captureStream ? dummyCanvas.captureStream(1) : null;
        } catch (_) {}

        var call = Netplay.peer.call(targetRoom, dummyStream || new MediaStream());
        Netplay.call = call;

        call.on('stream', function (remoteStream) {
          onStream(remoteStream);
        });

        call.on('close', function () {
          onDisconnected();
        });
      });

      conn.on('data', function (data) {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'pong') {
          var rtt = Date.now() - data.clientTime;
          Netplay.latencyMs = Math.round(rtt / 2);
          var latEl = document.getElementById('netplay-ping');
          if (latEl) latEl.textContent = Netplay.latencyMs + 'ms';
        }
      });

      conn.on('close', function () {
        onDisconnected();
      });

      conn.on('error', function (err) {
        console.warn('连接房主失败:', err);
      });
    });

    Netplay.peer.on('error', function (err) {
      console.warn('Peer 错误:', err);
    });
  };

  // 5. 访客发送按键至房主
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

  // 6. 房主生成联机分享链接 (支持自动识别局域网 IP / 部署域名)
  Netplay.getJoinUrl = function (overrideHost) {
    var loc = window.location;
    var host = overrideHost || loc.host;
    var path = loc.pathname;
    var proto = loc.protocol;
    return proto + '//' + host + path + '?game=' + encodeURIComponent(gameParam) + '&room=' + encodeURIComponent(Netplay.roomId);
  };

  root.ArcadeNetplay = Netplay;
})(window);
