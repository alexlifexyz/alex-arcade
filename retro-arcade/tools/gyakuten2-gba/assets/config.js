// 《逆转裁判2》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'gyakuten2-gba',
    title: '逆转裁判2',
    gameName: '逆转裁判2',
    version: '1.0.0',
    shareTitle: '逆转裁判二勾玉篇',
    shareContent: '勾玉看穿证人的破绽，出示证据把法庭翻过来。成步堂的第二季，点开就能审。\n\n#小红书小工具 #逆转裁判 #勾玉 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
