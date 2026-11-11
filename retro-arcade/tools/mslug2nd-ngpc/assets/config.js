// SNK 官方正统掌机独占大作《合金弹头：第二任务》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'mslug2nd-ngpc',
    title: '合金弹头：第二任务',
    gameName: '合金弹头：第二任务',
    version: '1.0.1',
    shareTitle: 'NGPC合金弹头第二任务！战术手雷双主角破局',
    shareContent: 'SNK官方正统掌机独占大作《合金弹头：第二任务》！战术手雷双主角分支作战，隐藏战俘营地营救，经典重火力射击手感！无需下载，即开即战。\n\n#小红书小工具 #合金弹头 #合金弹头第二任务 #NGPC #经典游戏 #童年回忆 #掌机情怀 #Alex游戏百宝箱',
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
