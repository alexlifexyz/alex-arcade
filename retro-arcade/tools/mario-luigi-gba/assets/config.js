// 《马里奥与路易吉 RPG》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'mario-luigi-gba',
    title: '马里奥与路易吉RPG',
    gameName: '马里奥与路易吉RPG',
    version: '1.0.0',
    shareTitle: '兄弟同心把库巴锤扁',
    shareContent: '马里奥和路易吉一起闯豆豆王国，跳锤配合、兄弟闪避，GBA 上最默契的双人冒险。点开就能走。\n\n#小红书小工具 #马里奥 #路易吉 #GBA #经典游戏 #童年回忆 #掌机情怀 #RPG',
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
