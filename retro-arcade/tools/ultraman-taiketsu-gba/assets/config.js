// 32 位掌机动作巅峰神作《光之英雄传说 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'ultraman-taiketsu-gba',
    title: '光之英雄传说 中文版',
    gameName: '光之英雄传说 中文版',
    version: '1.0.2',
    shareTitle: '变身光之巨人！光线蓄能克敌制胜',
    shareContent: '经典掌机动作格斗神作《光之英雄传说 中文版》！英雄全员登场，全中文剧情对话与畅快动作连段，守护和平！随时随地开启光之巨人热血对决。\n\n#小红书小工具 #动作游戏 #格斗游戏 #经典怀旧 #童年回忆 #掌机情怀 #单机游戏 #GBA #Alex游戏百宝箱',
    slogan: 'Alex 游戏百宝箱',
    skin: 'famicom',
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
