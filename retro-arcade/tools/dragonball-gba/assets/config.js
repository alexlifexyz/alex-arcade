// 官方正统 32 位经典动作神作《龙珠大冒险》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具 与 #Alex游戏百宝箱
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'dragonball-gba',
    title: '龙珠大冒险',
    gameName: '龙珠大冒险 GBA经典版',
    version: '1.0.0',
    shareTitle: '龙珠大冒险！童年动作天花板神作重温',
    shareContent: 'GBA动作天花板神作《龙珠大冒险》！如意棒连招、龟派气功、天下第一武道会，热血冒险即刻重温！点击即玩无需下载。\n\n#小红书小工具 #龙珠大冒险 #Alex游戏百宝箱 #GBA #童年回忆 #动作游戏 #热血经典',
    slogan: 'Alex 游戏百宝箱',
    skin: 'black',
    recordFsMaxMs: 59000,
    recordFsMaxBytes: 33554432
  };

  if (typeof window !== 'undefined') {
    window.GGEMU_CONFIG = GAME_CONFIG;
    window.GAME_CONFIG = GAME_CONFIG;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAME_CONFIG;
  }
})();
