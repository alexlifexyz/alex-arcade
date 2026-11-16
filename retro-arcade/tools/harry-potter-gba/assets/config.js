// 官方正统 32 位掌机经典神作《哈利波特与密室 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'harry-potter-gba',
    title: '哈利波特与密室 中文版',
    gameName: '哈利波特与密室 中文版',
    version: '1.0.0',
    shareTitle: '骑飞天扫帚闯密室！哈利波特你能通关吗',
    shareContent: '官方正统32位掌机经典神作《哈利波特与密室 中文版》！重返霍格沃茨魔法学校，掌握除你武器与荧光闪烁等神奇魔咒，骑乘飞天扫帚勇闯密室击败蛇怪！全中文剧情，点击即玩魔法世界童年回忆。\n\n#小红书小工具 #哈利波特 #哈利波特与密室 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
    slogan: '骑飞天扫帚勇闯密室',
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
