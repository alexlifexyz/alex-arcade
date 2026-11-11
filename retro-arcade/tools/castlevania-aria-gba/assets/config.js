// 《晓月圆舞曲》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'castlevania-aria-gba',
    title: '晓月圆舞曲',
    gameName: '晓月圆舞曲',
    version: '1.0.0',
    shareTitle: '晓月圆舞曲魂能刷关',
    shareContent: '来栖来生闯进城，跳跃攻击、后撤魂技，把恶魔城的魂能一点点刷满。点开就能走。\n\n#小红书小工具 #晓月圆舞曲 #恶魔城 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
