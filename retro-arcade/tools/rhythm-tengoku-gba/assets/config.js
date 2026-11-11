// 官方正统 GBA 音乐节奏巅峰神作《节奏天国》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'rhythm-tengoku-gba',
    title: '节奏天国 GBA',
    gameName: '节奏天国 GBA',
    version: '1.0.0',
    desc: '魔性卡点音游！摸鱼带薪必备',
    shareTitle: '节奏天国！魔性卡点音游拍手拔毛',
    shareContent: '任天堂原宿风神级节奏音游《节奏天国》！拔毛、敲鼓、拍手、跳舞，超洗脑魔性卡点，戴上耳机随节奏摇摆！点击即玩童年神作。\n\n#小红书小工具 #节奏天国 #GBA #音游 #卡点音游 #童年回忆 #掌机情怀 #单机游戏 #摸鱼神器 #Alex游戏百宝箱',
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
