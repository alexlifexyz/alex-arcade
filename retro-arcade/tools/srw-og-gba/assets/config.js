// 官方正统 32 位经典机甲神作《超级机器人大战OG》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具 与 #Alex游戏百宝箱
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'srw-og-gba',
    title: '超级机器人大战OG',
    gameName: '超级机器人大战OG',
    version: '1.0.0',
    shareTitle: '超级机器人大战OG！机战巅峰热血战棋神作',
    shareContent: 'GBA机战巅峰《超级机器人大战OG》！原创机体悉数登场，热血战斗动画、精神指令策略交锋！点击即玩无需下载。\n\n#小红书小工具 #超级机器人大战 #机战OG #Alex游戏百宝箱 #GBA #机甲 #战棋 #经典游戏',
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
