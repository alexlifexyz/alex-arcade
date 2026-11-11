// 经典格斗正统神作《拳皇 EX2：咆哮之血》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'kof-gba',
    title: '拳皇EX2：咆哮之血',
    gameName: '拳皇EX2：咆哮之血',
    version: '1.0.1',
    shareTitle: '八神草薙大招随便放！拳皇EX2经典掌机',
    shareContent: '当年在街机厅搓出八稚女和百八式大蛇薙是什么感觉？正统拳皇EX2咆哮之血全彩高画质掌机版，草薙京、八神庵、不知火舞集结，四键连招拳拳到肉！ #小红书小工具 #拳皇 #拳皇EX2 #格斗游戏 #童年回忆',
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
