// 32 位掌机巅峰神作《棋魂黑白对弈 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'hikaru-no-go-gba',
    title: '棋魂黑白对弈 中文版',
    gameName: '棋魂黑白对弈 中文版',
    version: '1.0.2',
    shareTitle: '十九路黑白落子！棋盘定式博弈较量',
    shareContent: '经典掌机智力博弈神作《棋魂黑白对弈 中文版》！经典剧情启发成长，全中文剧情对话与专业19路黑白对局，重温执子博弈的智力较量！点击即玩童年情怀神作。\n\n#小红书小工具 #围棋 #棋盘对弈 #益智游戏 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
    slogan: 'Alex 游戏百宝箱',
    skin: 'snes',
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
