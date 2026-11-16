// 32 位掌机动作探索巅峰神作《恶魔城：月轮 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'castlevania-moon-gba',
    title: '恶魔城月轮',
    gameName: '恶魔城月轮',
    version: '1.0.1',
    shareTitle: '硬核挥鞭！月轮全卡片探索城堡',
    shareContent: '经典掌机暗黑探索神作《恶魔城：月轮 中文版》！内森挥动神鞭闯入古堡，十种神明与属性双卡组合，觉醒DSS魔法刻印！纯正硬核动作体验。\n\n#小红书小工具 #恶魔城 #动作游戏 #掌机情怀 #单机游戏 #经典怀旧 #GBA #Alex游戏百宝箱',
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
