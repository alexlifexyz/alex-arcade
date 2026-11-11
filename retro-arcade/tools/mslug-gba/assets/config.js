// 官方正统 32 位掌机独占大作《合金弹头 Advance》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'mslug-gba',
    title: '合金弹头 Advance',
    gameName: '合金弹头 Advance',
    version: '1.0.0',
    shareTitle: 'GBA合金弹头！载具机甲横版射击巅峰',
    shareContent: '官方32位掌机独占大作《合金弹头 Advance》！战车机甲横版冲锋，隐藏卡牌搜集与生命格数系统，经典重火力射击手感！点击即可即开即战。\n\n#小红书小工具 #合金弹头 #合金弹头Advance #GBA #经典游戏 #童年回忆 #掌机情怀 #Alex游戏百宝箱',
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
