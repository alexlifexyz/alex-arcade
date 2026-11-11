// 《名将》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'captcomm-cps1',
    title: '名将',
    gameName: '名将',
    version: '1.0.0',
    shareTitle: '四个英雄街机清版',
    shareContent: '卡普空街机清版《名将》！队长、银次、宝贝头和麦克四个英雄从地铁一路打到外星基地，投币就能开打。\n\n#小红书小工具 #名将 #街机 #卡普空 #清版动作 #童年回忆 #掌机情怀',
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
