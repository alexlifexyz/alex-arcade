// SNK 官方正统掌机独占大作《合金弹头：第一任务》小红书平台配置规范
// 严格遵守规范：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'mslug1st-ngpc',
    title: '合金弹头第一任务',
    gameName: '合金弹头第一任务',
    version: '1.0.0',
    shareTitle: '合金弹头第一任务：掌机特种突击经典',
    shareContent: 'SNK官方正统掌机独占大作《合金弹头：第一任务》！经典战壕突击、人质营救与多路线分支关卡，原汁原味黑白与全彩机台射击手感！点击即可即开即战。\n\n#小红书小工具 #合金弹头 #合金弹头第一任务 #NGPC #经典游戏 #童年回忆 #掌机情怀 #Alex游戏百宝箱',
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
