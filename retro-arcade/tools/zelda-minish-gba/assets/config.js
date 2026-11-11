// 《塞尔达传说 缩小帽》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'zelda-minish-gba',
    title: '塞尔达缩小帽',
    gameName: '塞尔达缩小帽',
    version: '1.0.0',
    shareTitle: '缩小帽钻进小人国',
    shareContent: '林克戴上缩小帽，钻进树丛、书本和瓶子里的小人国。剑盾谜题、风车小镇，GBA 上最精巧的塞尔达。点开就能走。\n\n#小红书小工具 #塞尔达传说 #缩小帽 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
