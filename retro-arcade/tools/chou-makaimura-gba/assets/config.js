// 32 位掌机动作神作《超魔界村 R》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'chou-makaimura-gba',
    title: '超魔界村 R',
    gameName: '超魔界村 R',
    version: '1.0.2',
    shareTitle: '受难天花板！亚瑟黄金甲通关',
    shareContent: '卡普空殿堂级硬核动作神作《超魔界村 R》！亚瑟身披骑士铠甲勇闯魔界，长矛飞掷、双重二段跳、黄金神盾魔法！重温掌机受难挑战。\n\n#小红书小工具 #硬核游戏 #动作游戏 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
    slogan: 'Alex 游戏百宝箱',
    onlineSlogan: '黄金铠甲二段跳硬核通关',
    skin: 'obsidian',
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
