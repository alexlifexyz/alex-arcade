// 官方正统 32 位经典战棋神作《最终幻想战略版A》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具 与 #Alex游戏百宝箱
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'ffta-gba',
    title: '最终幻想战略版A',
    gameName: '最终幻想战略版A',
    version: '1.0.0',
    shareTitle: '最终幻想战略版A！GBA战棋巅峰神作',
    shareContent: 'SQUARE ENIX 传世战棋巅峰神作《最终幻想战略版A》（FFTA）！异世界伊瓦利斯大冒险、数百种华丽职业转职、严谨法则裁判系统！点击即玩无需下载。\n\n#小红书小工具 #最终幻想战略版A #最终幻想 #Alex游戏百宝箱 #GBA #战棋游戏 #经典游戏',
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
