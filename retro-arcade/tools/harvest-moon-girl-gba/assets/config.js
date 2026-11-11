// 官方正统 32 位经典模拟神作《牧场物语：矿石镇的伙伴们 女孩篇 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具 与 #Alex游戏百宝箱
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'harvest-moon-girl-gba',
    title: '牧场物语矿石镇女孩',
    gameName: '牧场物语：矿石镇女孩篇 中文版',
    version: '1.0.0',
    shareTitle: '牧场物语矿石镇女孩篇！梦幻田园治愈浪漫生活',
    shareContent: 'GBA经典神作《牧场物语：矿石镇的伙伴们 女孩篇》简体中文版！全新女主视角、专属恋爱剧情、耕种放牧、经营梦幻农场！点击即玩无需下载。\n\n#小红书小工具 #牧场物语 #矿石镇的伙伴们 #Alex游戏百宝箱 #GBA #模拟经营 #治愈系 #经典游戏',
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
