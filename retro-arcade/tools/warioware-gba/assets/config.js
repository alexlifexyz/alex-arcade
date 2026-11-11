// 《瓦里奥制造》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'warioware-gba',
    title: '瓦里奥制造',
    gameName: '瓦里奥制造',
    version: '1.0.0',
    shareTitle: '五秒一局瓦里奥',
    shareContent: '五秒一局，鼻子一抽就换玩法。瓦里奥指挥你在极短时间里跳、切、躲、按，手忙脚乱才是乐趣。点开就能玩。\n\n#小红书小工具 #瓦里奥制造 #WarioWare #GBA #经典游戏 #童年回忆 #掌机情怀',
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
