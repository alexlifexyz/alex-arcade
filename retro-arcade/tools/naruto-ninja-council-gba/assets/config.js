// 官方正统 32 位经典动作神作《火影忍者 最强忍者大集结 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具 与 #Alex游戏百宝箱
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'naruto-ninja-council-gba',
    title: '火影最强忍者大集结',
    gameName: '火影忍者：最强忍者大集结 中文版',
    version: '1.0.0',
    shareTitle: '螺旋丸替身连招！火影最强忍者大集结',
    shareContent: 'GBA经典横版动作神作《火影忍者 最强忍者大集结 中文版》！鸣人、佐助、小樱全员集结，双击疾跑飞檐走壁，查克拉忍术对决与替身奥义！点击即玩无需下载。\n\n#小红书小工具 #火影忍者 #最强忍者大集结 #Alex游戏百宝箱 #GBA #童年回忆 #动作游戏 #热血经典',
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
