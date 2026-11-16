// 32 位掌机巅峰神作《电脑天使心 中文版》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'chobits-gba',
    title: '电脑天使心 中文版',
    gameName: '电脑天使心 中文版',
    version: '1.0.2',
    shareTitle: '温馨日常陪伴！复古电脑日常互动',
    shareContent: '经典掌机治愈怀旧神作《电脑天使心 中文版》！小电脑温馨启程，全中文剧情对话、日常温馨互动与专属回忆相册！重温经典感动日常。\n\n#小红书小工具 #治愈系 #养成游戏 #剧情解谜 #GBA #童年回忆 #掌机情怀 #单机游戏 #Alex游戏百宝箱',
    slogan: 'Alex 游戏百宝箱',
    skin: 'mint',
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
