// 《洛克人Zero》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'megaman-zero-gba',
    title: '洛克人Zero',
    gameName: '洛克人Zero',
    version: '1.0.0',
    shareTitle: '零号洛克人光剑突围',
    shareContent: '杰洛拿着光剑在废墟里突围，冲刺、射击、切武器，一关比一关紧。GBA 上最利落的洛克人。点开就能打。\n\n#小红书小工具 #洛克人 #洛克人Zero #GBA #经典游戏 #童年回忆 #掌机情怀',
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
