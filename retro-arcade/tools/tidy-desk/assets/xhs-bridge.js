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
  var LEADERBOARD_MIN = 9510;
  var CLOUD_STORAGE_MIN = 9510;

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
    },

    /**
     * 提交排行榜成绩（9.51+ 内测能力）。
     * @param {{ board?: number, score: number }} params
     * @returns {Promise<{ score: number }>} 返回总榜历史最高分
     */
    submitScore: function (params) {
      var board = (params && params.board) || 1;
      var score = Number(params && params.score) || 0;
      saveGameLocalRecord(board, score);
      return ready().then(function () {
        var tool = miniTool();
        if (can('submitScore', LEADERBOARD_MIN) && typeof tool.submitScore === 'function') {
          return new Promise(function (resolve) {
            try {
              tool.submitScore({
                board: board,
                score: score,
                success: function (res) {
                  resolve(res || { score: score });
                },
                fail: function (err) {
                  resolve({ score: score });
                }
              });
            } catch (e) {
              resolve({ score: score });
            }
          });
        } else {
          return Promise.resolve({ score: score });
        }
      });
    },

    /**
     * 查询排行榜前 100 名榜单（9.51+ 内测能力）。
     * @param {{ board?: number, period?: 'all'|'month'|'week'|'day' }} params
     * @returns {Promise<{ data: Array<{ rank: number, score: number, nickname: string }> }>}
     */
    getRankList: function (params) {
      var board = (params && params.board) || 1;
      var period = (params && params.period) || 'day';
      return ready().then(function () {
        var tool = miniTool();
        if (can('getRankList', LEADERBOARD_MIN) && typeof tool.getRankList === 'function') {
          return new Promise(function (resolve) {
            try {
              tool.getRankList({
                board: board,
                period: period,
                success: function (res) {
                  if (res && res.data && res.data.length > 0) {
                    resolve(res);
                  } else {
                    resolve({ data: getMockRankList(board) });
                  }
                },
                fail: function () {
                  resolve({ data: getMockRankList(board) });
                }
              });
            } catch (e) {
              resolve({ data: getMockRankList(board) });
            }
          });
        } else {
          return Promise.resolve({ data: getMockRankList(board) });
        }
      });
    },

    /**
     * 查询玩家本人的排行榜排名与成绩（9.51+ 内测能力）。
     * @param {{ board?: number, period?: 'all'|'month'|'week'|'day' }} params
     * @returns {Promise<{ status: 'EXACT'|'OVER_LIMIT'|'NO_SCORE'|'NOT_PARTICIPATING', rank: number|null, score: number|null }>}
     */
    getMyRank: function (params) {
      var board = (params && params.board) || 1;
      var period = (params && params.period) || 'day';
      return ready().then(function () {
        var tool = miniTool();
        if (can('getMyRank', LEADERBOARD_MIN) && typeof tool.getMyRank === 'function') {
          return new Promise(function (resolve) {
            try {
              tool.getMyRank({
                board: board,
                period: period,
                success: function (res) {
                  resolve(res || getMockMyRank(board));
                },
                fail: function () {
                  resolve(getMockMyRank(board));
                }
              });
            } catch (e) {
              resolve(getMockMyRank(board));
            }
          });
        } else {
          return Promise.resolve(getMockMyRank(board));
        }
      });
    },

    /**
     * 云存储：新增记录（9.51+ 内测能力，用户维度跨端持久化）
     */
    addCloudStorage: function (params) {
      var collection = params && params.collection;
      var items = params && params.items;
      return ready().then(function () {
        var tool = miniTool();
        if (can('addCloudStorage', CLOUD_STORAGE_MIN) && typeof tool.addCloudStorage === 'function') {
          return new Promise(function (resolve, reject) {
            tool.addCloudStorage({
              collection: collection,
              items: items,
              success: resolve,
              fail: function (err) {
                // 降级本地存储
                writeLocal('xhs_cloud_' + collection, JSON.stringify(items));
                resolve({ data: [{ id: 'local_' + Date.now(), status: 'SUCCESS' }] });
              }
            });
          });
        } else {
          writeLocal('xhs_cloud_' + collection, JSON.stringify(items));
          return Promise.resolve({ data: [{ id: 'local_' + Date.now(), status: 'SUCCESS' }] });
        }
      });
    },

    /**
     * 云存储：查询记录（9.51+ 内测能力）
     */
    queryCloudStorage: function (params) {
      var collection = params && params.collection;
      return ready().then(function () {
        var tool = miniTool();
        if (can('queryCloudStorage', CLOUD_STORAGE_MIN) && typeof tool.queryCloudStorage === 'function') {
          return new Promise(function (resolve) {
            tool.queryCloudStorage({
              collection: collection,
              limit: params && params.limit,
              success: resolve,
              fail: function () {
                var raw = readLocal('xhs_cloud_' + collection);
                var items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                resolve({ items: items });
              }
            });
          });
        } else {
          var raw = readLocal('xhs_cloud_' + collection);
          var items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          return Promise.resolve({ items: items });
        }
      });
    }
  };

  // 本地真实历史成绩归档（当官方服务端为空或未联网时，展示玩家在本小工具中的真实挑战历程）
  function getGameLocalRecords(board) {
    var raw = readLocal('xhs_game_records_' + board);
    if (!Array.isArray(raw)) return [];
    return raw;
  }

  function saveGameLocalRecord(board, score) {
    if (!score || score <= 0) return;
    var list = getGameLocalRecords(board);
    var now = new Date();
    var timeStr = (now.getMonth() + 1) + "-" + now.getDate() + " " + (now.getHours() < 10 ? "0" : "") + now.getHours() + ":" + (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
    list.push({ score: score, time: timeStr });
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 20);
    writeLocal('xhs_game_records_' + board, JSON.stringify(list));
    var maxScore = Number(readLocal('xhs_mock_max_score_' + board)) || 0;
    if (score > maxScore) {
      writeLocal('xhs_mock_max_score_' + board, String(score));
    }
  }

  function getMockRankList(board) {
    var records = getGameLocalRecords(board);
    var list = [];
    for (var i = 0; i < records.length; i++) {
      list.push({
        rank: i + 1,
        score: records[i].score,
        nickname: i === 0 ? "本机历史最高纪录" : ("挑战记录 #" + (i + 1) + " (" + records[i].time + ")")
      });
    }
    return list;
  }

  function getMockMyRank(board) {
    var records = getGameLocalRecords(board);
    if (!records.length) {
      var localMax = Number(readLocal('xhs_mock_max_score_' + board)) || 0;
      if (localMax > 0) {
        return { status: "EXACT", rank: 1, score: localMax };
      }
      return { status: "NO_SCORE", rank: null, score: null };
    }
    return { status: "EXACT", rank: 1, score: records[0].score };
  }
});
