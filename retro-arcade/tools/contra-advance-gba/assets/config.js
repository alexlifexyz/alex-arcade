// 《魂斗罗Advance》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'contra-advance-gba',
    title: '魂斗罗Advance',
    gameName: '魂斗罗Advance',
    version: '1.0.0',
    shareTitle: '魂斗罗彩色宽画面',
    shareContent: 'GBA 宽画面魂斗罗，左右换枪、下跳右射。基地、丛林、俯视角走廊，散弹扫过去就停不下来。点开就能打。\n\n#小红书小工具 #魂斗罗 #魂斗罗Advance #GBA #经典游戏 #童年回忆 #掌机情怀',
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
