/**
 * xhs-bridge.js
 * 小红书小工具端能力的轻量封装，按官方容器文档实现：
 * - 客户端版本：先同步读 window.xhs.launchOptions，读不到再异步 getLaunchOptions；取不到按不支持处理。
 * - 存储：9.46+ 用容器 setStorage / getStorage（data 为 JSON 字符串），浏览器缓存只作低版本兜底。
 * - 振动：9.50+ 用 vibrateShort({ type })。
 * - 关注作者：9.51+ 用 followAuthor。
 * 所有端能力调用都先判空、再捕获失败，普通浏览器里静默降级。
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.xhsBridge = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_MIN = 9460;
  var VIBRATE_MIN = 9500;
  var FOLLOW_MIN = 9510;
  var WINDOW_MIN = 9490;

  var hasWindow = typeof window !== 'undefined';
  var isXhs = hasWindow && typeof window.xhs !== 'undefined';
  var version = -1;
  var versionPromise = null;

  function miniTool() {
    if (!hasWindow || !window.xhs) return null;
    return window.xhs.miniTool || null;
  }

  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }

  function syncVersion() {
    try {
      return Math.floor(readBuildVersion(window.xhs && window.xhs.launchOptions) / 1000);
    } catch (e) {
      return 0;
    }
  }

  /** 返回 Promise<客户端版本>，如 9462 代表 9.46.2；取不到为 0。结果会缓存。 */
  function ready() {
    if (versionPromise) return versionPromise;
    var v = syncVersion();
    if (v > 0) {
      version = v;
      versionPromise = Promise.resolve(v);
      return versionPromise;
    }
    var tool = miniTool();
    if (!tool || typeof tool.getLaunchOptions !== 'function') {
      version = 0;
      versionPromise = Promise.resolve(0);
      return versionPromise;
    }
    versionPromise = new Promise(function (resolve) {
      try {
        tool.getLaunchOptions({
          success: function (res) {
            version = Math.floor(readBuildVersion(res) / 1000);
            resolve(version);
          },
          fail: function () {
            version = 0;
            resolve(0);
          }
        });
      } catch (e) {
        version = 0;
        resolve(0);
      }
    });
    return versionPromise;
  }

  function can(name, min) {
    var tool = miniTool();
    return !!tool && typeof tool[name] === 'function' && version >= min;
  }

  function quiet() {}

  function writeLocal(key, str) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, str);
    } catch (e) {}
  }

  function readLocal(key) {
    var raw = null;
    try {
      if (typeof localStorage !== 'undefined') raw = localStorage.getItem(key);
    } catch (e) {
      return null;
    }
    return parse(raw);
  }

  function parse(raw) {
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  }

  ready();

  return {
    isXhs: isXhs,
    ready: ready,

    /** 写入：浏览器缓存留一份同步副本；9.46+ 同时写容器 Storage（JSON 字符串）。 */
    setItem: function (key, value) {
      var str;
      try {
        str = JSON.stringify(value);
      } catch (e) {
        return;
      }
      if (typeof str !== 'string') return;
      writeLocal(key, str);
      ready().then(function () {
        if (!can('setStorage', STORAGE_MIN)) return;
        try {
          miniTool().setStorage({ key: key, data: str, fail: quiet });
        } catch (e) {}
      });
    },

    /** 同步读取浏览器缓存副本。可能为空或已被清理，权威值用 getItemAsync。 */
    getItem: function (key) {
      return readLocal(key);
    },

    /** 异步读取：9.46+ 读容器 Storage，失败或低版本回退浏览器缓存。callback(value|null)。 */
    getItemAsync: function (key, callback) {
      ready().then(function () {
        if (!can('getStorage', STORAGE_MIN)) {
          callback(readLocal(key));
          return;
        }
        try {
          miniTool().getStorage({
            key: key,
            success: function (res) {
              var val = parse(res && res.data);
              callback(val == null ? readLocal(key) : val);
            },
            fail: function () {
              callback(readLocal(key));
            }
          });
        } catch (e) {
          callback(readLocal(key));
        }
      });
    },

    /**
     * 短振动。9.50+ 用容器 vibrateShort；低版本或普通浏览器不振动。
     * @param {'light'|'medium'|'heavy'} type 振动强度
     */
    vibrate: function (type) {
      if (type !== 'light' && type !== 'medium' && type !== 'heavy') type = 'light';
      function fire() {
        if (!can('vibrateShort', VIBRATE_MIN)) return;
        try {
          miniTool().vibrateShort({ type: type, fail: quiet });
        } catch (e) {}
      }
      if (version >= 0) fire();
      else ready().then(fire);
    },

    /**
     * 容器窗口信息（9.49+）：尺寸、安全区和顶部原生按钮（back / me / share）的位置。
     * callback(info|null)；低版本或普通浏览器回调 null。
     */
    windowInfo: function (callback) {
      ready().then(function () {
        if (!can('getWindowInfo', WINDOW_MIN)) {
          callback(null);
          return;
        }
        try {
          miniTool().getWindowInfo({
            success: function (res) { callback(res || null); },
            fail: function () { callback(null); }
          });
        } catch (e) {
          callback(null);
        }
      });
    },

    /** 引导关注当前小工具作者（9.51+）。callback(err, res)，res.follow_status 见官方文档。 */
    openFollowAuthor: function (callback) {
      ready().then(function () {
        if (!can('followAuthor', FOLLOW_MIN)) {
          if (callback) callback(new Error('followAuthor unavailable'));
          return;
        }
        try {
          miniTool().followAuthor({
            success: function (res) { if (callback) callback(null, res); },
            fail: function (err) { if (callback) callback(err); }
          });
        } catch (e) {
          if (callback) callback(e);
        }
      });
    }
  };
});
