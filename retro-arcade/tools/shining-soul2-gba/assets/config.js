// 32 位掌机巅峰 ARPG 神作《光明之魂 2 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'shining-soul2-gba',
    title: '光明之魂2',
    gameName: '光明之魂2',
    version: '1.0.1',
    shareTitle: '掌机暗黑刷装神作！光明之魂2',
    shareContent: 'GBA经典ARPG神作《光明之魂2》中文版！八大职业自由养成，深入暗黑地牢勇闯随机关卡，神圣锻造刷齐毕业神装！掌机动作RPG巅峰体验。\n\n#小红书小工具 #光明之魂 #GBA #经典游戏 #动作RPG #单机游戏 #暗黑地牢 #Alex游戏百宝箱',
    slogan: 'Alex 游戏百宝箱',
    skin: 'sfc',
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
