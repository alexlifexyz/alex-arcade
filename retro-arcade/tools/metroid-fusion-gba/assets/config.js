// 《密特罗德 融合》小红书平台配置
// 59 秒录屏、32MB 字节闸门、标题不超过 20 字、无 emoji、正文带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'metroid-fusion-gba',
    title: '密特罗德融合',
    gameName: '密特罗德融合',
    version: '1.0.0',
    shareTitle: '萨姆斯在空间站逃亡',
    shareContent: '萨姆斯被 X 寄生虫感染，在 B.S.L 空间站一边逃一边打。导弹瞄准、冰冻核心，GBA 上最紧的密特罗德。点开就能跑。\n\n#小红书小工具 #密特罗德 #密特罗德融合 #GBA #经典游戏 #童年回忆 #掌机情怀',
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
