// 《烈火之剑》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'fire-emblem-blazing-gba',
    title: '烈火之剑',
    gameName: '烈火之剑',
    version: '1.0.0',
    shareTitle: '烈火之剑林克参战',
    shareContent: '烈火之剑林克参战，佣兵团一起推关。点格移动、武器相克、支援对话，随时存档。GBA 战棋，点开就能下子。\n\n#小红书小工具 #火焰纹章 #烈火之剑 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
