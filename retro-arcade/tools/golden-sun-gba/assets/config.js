// 官方正统 32 位掌机巅峰 RPG 巨作《黄金太阳：开启的封印》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'golden-sun-gba',
    title: '黄金太阳开启的封印',
    gameName: '黄金太阳开启的封印',
    version: '1.0.0',
    shareTitle: 'GBA画质巅峰！黄金太阳四大元素精神力',
    shareContent: '官方正统32位掌机巅峰RPG巨作《黄金太阳：开启的封印》！四大元素精神力解谜与召唤兽震撼动画，掌机声画巅峰与华丽战斗手感！点击即可即开即战。\n\n#小红书小工具 #黄金太阳 #GoldenSun #GBA #经典游戏 #童年回忆 #掌机情怀 #RPG #Alex游戏百宝箱',
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
