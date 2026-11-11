// 官方正统 32 位掌机巅峰神作《宝可梦：火红 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'pokemon-firered-gba',
    title: '宝可梦：火红 中文版',
    gameName: '宝可梦：火红 中文版',
    version: '1.0.0',
    shareTitle: '宝可梦火红中文版！真新镇出发抓超梦',
    shareContent: '官方正统32位掌机殿堂神作《宝可梦 火红 中文版》！小火龙、妙蛙种子、杰尼龟御三家经典启程，全中文剧情对话，关都联盟八大道馆挑战与超梦抓捕！点击即玩童年回忆。\n\n#小红书小工具 #宝可梦 #口袋妖怪 #宝可梦火红 #火红中文版 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
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
