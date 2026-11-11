// 官方正统 GBA 经典神作《星之卡比：梦之泉物语》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'kirby-dreamland-gba',
    title: '星之卡比 梦之泉物语',
    gameName: '星之卡比 梦之泉物语',
    version: '1.0.0',
    shareTitle: '梦之泉物语！粉红萌神吸入变身',
    shareContent: 'GBA经典神作《星之卡比：梦之泉物语》！粉红萌神吸入变身，20多种复制能力与经典迷你游戏，治愈系横版冒险巅峰！点击即可即开即玩。\n\n#小红书小工具 #星之卡比 #梦之泉物语 #GBA #童年回忆 #经典掌机 #治愈系 #卡比 #Alex游戏百宝箱',
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
