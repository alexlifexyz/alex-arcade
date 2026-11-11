// 官方正统 32 位掌机殿堂战棋《火焰之纹章：封印之剑》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'fire-emblem-gba',
    title: '火焰之纹章 封印之剑',
    gameName: '火焰之纹章 封印之剑',
    version: '1.0.0',
    shareTitle: '火纹封印之剑！任天堂SRPG殿堂战棋',
    shareContent: '官方正统32位掌机SRPG殿堂巅峰《火焰之纹章：封印之剑》！年轻红发贵族罗伊率领利西亚同盟军，迎战伯尔尼王国侵略！纯正战棋回合制博弈，战死不可复活机制，经典转职与兵种克制，点击即开即战！\n\n#小红书小工具 #火焰之纹章 #封印之剑 #GBA #战棋游戏 #经典游戏 #童年回忆 #掌机情怀 #任天堂SRPG战棋殿堂',
    slogan: '任天堂SRPG战棋殿堂',
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
