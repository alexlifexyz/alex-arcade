// 官方正统 32 位掌机巅峰神作《宝可梦：叶绿 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'pokemon-leafgreen-gba',
    title: '宝可梦：叶绿 中文版',
    gameName: '宝可梦：叶绿 中文版',
    version: '1.0.0',
    shareTitle: '初代关都捕捉急冻鸟！宝可梦叶绿怀旧',
    shareContent: '官方正统32位掌机殿堂神作《宝可梦 叶绿 中文版》！妙蛙种子、小火龙、杰尼龟经典启程，全中文剧情对话，关都联盟图鉴收集、挑战八大道馆与传说急冻鸟抓捕！点击即玩童年回忆。\n\n#小红书小工具 #宝可梦 #口袋妖怪 #宝可梦叶绿 #叶绿中文版 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
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
