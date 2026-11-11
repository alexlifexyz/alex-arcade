// 官方正统 32 位掌机推理神作《逆转裁判1 GBA》小红书平台配置规范
// 严格遵守 AGENTS.md：59秒录屏上限、32MB字节闸门、标题 <=20字无emoji、必带 #小红书小工具
(function() {
  'use strict';

  var GAME_CONFIG = {
    gameId: 'gyakuten1-gba',
    title: '逆转裁判1 GBA',
    desc: '异议阿里！成步堂拍桌神反转',
    gameName: '逆转裁判1 GBA',
    version: '1.0.0',
    shareTitle: '逆转裁判1！异议阿里成步堂经典庭辩',
    shareContent: 'GBA法庭推理殿堂神作《逆转裁判1》！化身新手律师成步堂龙一，开庭搜集证物寻问证人，在千钧一发之际拍桌大喊异议阿里，绝地反击揭开真相！点击即玩无需下载。\n\n#小红书小工具 #逆转裁判 #成步堂龙一 #GBA #推理游戏 #法庭辩论 #童年回忆 #经典游戏',
    slogan: '异议阿里！绝地大反转',
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
