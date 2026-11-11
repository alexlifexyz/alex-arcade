// 《高级战争》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'advance-wars-gba',
    title: '高级战争',
    gameName: '高级战争',
    version: '1.0.0',
    shareTitle: '格子里把坦克推过去',
    shareContent: '一格一格把坦克、步兵和炮兵推到对岸。占领城市、算好射程，再决定这一回合打不打。点开就能下。\n\n#小红书小工具 #高级战争 #战棋 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
