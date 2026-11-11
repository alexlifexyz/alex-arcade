// 《黄金太阳2》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'golden-sun2-gba',
    title: '黄金太阳2',
    gameName: '黄金太阳2',
    version: '1.0.0',
    shareTitle: '黄金太阳失落的时代',
    shareContent: '灯塔镇的船开出去以后，大陆被海切开。精神力点燃机关，召唤兽砸开死路，这是 GBA 上最会发光的一款 RPG。点开就能走。\n\n#小红书小工具 #黄金太阳 #失落的时代 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
