// 《火焰纹章 圣魔之光石》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'fire-emblem-sacred-gba',
    title: '圣魔之光石',
    gameName: '圣魔之光石',
    version: '1.0.0',
    shareTitle: '圣魔光石双主角',
    shareContent: '艾瑞可与伊弗列姆分头走，魔石、转职和支援对话都还在。GBA 火焰纹章里最完整的一章。点开就能走。\n\n#小红书小工具 #火焰纹章 #圣魔之光石 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
