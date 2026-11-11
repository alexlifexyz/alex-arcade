!function(){"use strict";const e=[{id:"snes",name:"超任灰紫",light:!0,body:"#cfcfd6",bezel:"#28282c",plate:"#b4b1c6",groove:"#a19db6",btn:{X:"#bdb3f2",Y:"#bdb3f2",A:"#5b2aa8",B:"#5b2aa8"},cap:"#8e8e97",base:"#bfbfc7",knob:"#d0222b",text:"rgba(58,58,70,0.78)"},{id:"sfc",name:"超任彩色",light:!0,body:"#d3d3d8",bezel:"#28282c",plate:"#bcbcc4",groove:"#aaaab3",btn:{X:"#2d64cc",Y:"#2b9b48",A:"#d6302b",B:"#f1bf2d"},cap:"#8e8e97",base:"#c2c2c9",knob:"#d0222b",text:"rgba(58,58,70,0.78)"},{id:"black",name:"曜石黑",light:!1,body:"#2c2d32",bezel:"#0e0e10",plate:"#3a3b42",groove:"#313238",btn:{X:"#2a2b30",Y:"#2a2b30",A:"#2a2b30",B:"#2a2b30"},cap:"#4b4c54",base:"#3d3e45",knob:"#d0222b",text:"rgba(225,225,232,0.6)"},{id:"famicom",name:"红白机",light:!0,body:"#ebe5d8",bezel:"#2e2526",plate:"#d6ccb6",groove:"#c9bea6",btn:{X:"#b8232c",Y:"#b8232c",A:"#b8232c",B:"#b8232c"},cap:"#8b2026",base:"#d9d1bf",knob:"#d0222b",text:"rgba(130,32,38,0.85)"},{id:"mint",name:"薄荷绿",light:!0,body:"#bfe2d5",bezel:"#22302b",plate:"#a2cfbf",groove:"#93c2b1",btn:{X:"#f4f8f6",Y:"#f4f8f6",A:"#2e8e73",B:"#2e8e73"},cap:"#77a796",base:"#b0d8c9",knob:"#d0222b",text:"rgba(28,72,60,0.78)"}];function t(e){const t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,255&t]}function a(e,a){const o=t(e),l=a<0?0:255,n=Math.abs(a);return"rgb("+o.map(e=>Math.round(e+(l-e)*n)).join(",")+")"}function o(e){const a=t(e);return(.299*a[0]+.587*a[1]+.114*a[2])/255}function l(e,t){const a=document.createElement("canvas");return a.width=Math.max(1,Math.ceil(e)),a.height=Math.max(1,Math.ceil(t)),a}function n(e,t,a,o,l,n){n=Math.min(n,o/2,l/2),e.moveTo(t+n,a),e.lineTo(t+o-n,a),e.arcTo(t+o,a,t+o,a+n,n),e.lineTo(t+o,a+l-n),e.arcTo(t+o,a+l,t+o-n,a+l,n),e.lineTo(t+n,a+l),e.arcTo(t,a+l,t,a+l-n,n),e.lineTo(t,a+n),e.arcTo(t,a,t+n,a,n),e.closePath()}function i(e,t,a,o){e.moveTo(t+o,a),e.arc(t,a,o,0,2*Math.PI),e.closePath()}function r(e,t,a,o,l,n){const i=Math.atan2(l-a,o-t);e.moveTo(t+Math.cos(i+Math.PI/2)*n,a+Math.sin(i+Math.PI/2)*n),e.arc(t,a,n,i+Math.PI/2,i+1.5*Math.PI),e.arc(o,l,n,i-Math.PI/2,i+Math.PI/2),e.closePath()}const s='-apple-system, "Helvetica Neue", "PingFang SC", sans-serif';function c(e,t,a,o,l){l=l||1,e.save(),e.beginPath(),t(e),e.fillStyle=a,e.fill(),e.clip(),e.beginPath(),e.rect(-5e3,-5e3,1e4,1e4),t(e),e.shadowColor="rgba(0,0,0,"+.42*l+")",e.shadowBlur=8,e.shadowOffsetY=3,e.fillStyle="rgba(0,0,0,0.5)",e.fill("evenodd"),e.restore(),e.save(),e.translate(0,1),e.beginPath(),t(e),e.strokeStyle=o.light?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.1)",e.lineWidth=1,e.stroke(),e.restore()}function d(e,t,a){e.save(),e.strokeStyle="rgba(255,255,255,0.8)",e.fillStyle="rgba(255,255,255,0.8)",e.lineWidth=1.6,e.lineCap="round",e.beginPath(),e.arc(t,a,5.5,.35*-Math.PI,1.25*Math.PI),e.stroke();const o=.35*-Math.PI,l=t+5.5*Math.cos(o),n=a+5.5*Math.sin(o);e.beginPath(),e.moveTo(l+3.2,n-.6),e.lineTo(l-.8,n-3.4),e.lineTo(l-.4,n+1.6),e.closePath(),e.fill(),e.restore()}function b(e,t,a){const o=["#e57373","#64b5f6","#81c784","#ffd54f"];for(let l=0;l<4;l++)e.beginPath(),e.arc(t+l%2*7-3.5,a+7*(l>>1)-3.5,3,0,2*Math.PI),e.fillStyle=o[l],e.fill()}function h(e,t,a,o){t&&(e.save(),e.beginPath(),n(e,t.x,t.y,t.w,t.h,t.h/2),e.fillStyle="rgba(255,255,255,0.08)",e.fill(),e.strokeStyle="rgba(255,255,255,0.22)",e.lineWidth=1,e.stroke(),o(e,t.x+14,t.y+t.h/2),e.font="11px "+s,e.textAlign="left",e.textBaseline="middle",e.fillStyle="rgba(255,255,255,0.7)",e.fillText(a,t.x+25,t.y+t.h/2+.5),e.restore())}function f(e,t,a,o,l){e.save(),e.fillStyle="rgba(255,255,255,0.07)";for(let n=0;n<l;n++)for(let l=0;l<o;l++)e.beginPath(),i(e,t+7*l+n%2*3.5,a+6*n,1.6),e.fill();e.restore()}function g(e){return{w:e.w+8,h:22}}function y(e,t,o,y,x){const p=o.dpr||1,m=l(e*p,t*p),u=m.getContext("2d");u.scale(p,p);const S=o.hitboxes,w=u.createLinearGradient(0,0,0,t);w.addColorStop(0,a(y.body,y.light?.18:.06)),w.addColorStop(1,a(y.body,-.08)),u.fillStyle=w,u.fillRect(0,0,e,t),u.beginPath(),n(u,3,3,e-6,t-6,42),u.strokeStyle=y.light?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.08)",u.lineWidth=2,u.stroke(),u.beginPath(),n(u,7,7,e-14,t-14,38),u.strokeStyle="rgba(0,0,0,0.08)",u.lineWidth=2,u.stroke();const P=o.bezel;u.save(),u.beginPath(),n(u,P.x-3,P.y-3,P.w+6,P.h+6,30),u.fillStyle=a(y.body,-.18),u.fill(),u.restore(),u.save(),u.beginPath(),n(u,P.x,P.y,P.w,P.h,27),u.shadowColor="rgba(0,0,0,0.35)",u.shadowBlur=6,u.shadowOffsetY=2;const k=u.createLinearGradient(0,P.y,0,P.y+P.h);if(k.addColorStop(0,a(y.bezel,.1)),k.addColorStop(1,y.bezel),u.fillStyle=k,u.fill(),u.restore(),S.game){const e=S.game;u.save(),u.beginPath(),n(u,e.x-5,e.y-5,e.w+10,e.h+10,10),u.fillStyle="rgba(0,0,0,0.55)",u.fill(),u.restore()}if(!o.landscape&&S.game&&S.game.y-P.y>40){const e=P.y+18;f(u,P.x+26,e,5,4),f(u,P.x+P.w-26-31,e,5,4)}if(h(u,S.orientBtn,o.landscape?"竖屏":"横屏",d),h(u,S.skinBtn,"配色",b),S.dpadCenter){
  const hasStick = !(!x.pad||!x.pad.stick);const e=S.dpadCenter,t=1.5*e.size;c(u,a=>i(a,e.x,e.y,t+10),a(y.body,-.06),y,.9);
if(hasStick){
  const o=u.createRadialGradient(e.x,e.y-.2*t,.1*t,e.x,e.y,t);
  o.addColorStop(0,a(y.base,-.18)),o.addColorStop(.75,y.base),o.addColorStop(1,a(y.base,y.light?.25:.08)),u.beginPath(),i(u,e.x,e.y,t),u.fillStyle=o,u.fill(),u.strokeStyle="rgba(0,0,0,0.18)",u.lineWidth=1,u.stroke(),u.beginPath(),i(u,e.x,e.y,.36*t),u.fillStyle="rgba(0,0,0,0.28)",u.fill(),u.fillStyle=y.text,[[0,-1],[0,1],[-1,0],[1,0]].forEach(a=>{const o=e.x+a[0]*(t-9),l=e.y+a[1]*(t-9),n=Math.atan2(a[1],a[0]);u.beginPath(),u.moveTo(o+4*Math.cos(n),l+4*Math.sin(n)),u.lineTo(o+4*Math.cos(n+2.4),l+4*Math.sin(n+2.4)),u.lineTo(o+4*Math.cos(n-2.4),l+4*Math.sin(n-2.4)),u.closePath(),u.fill()});
}else{
  const o=u.createRadialGradient(e.x,e.y-.2*t,.1*t,e.x,e.y,t);
  o.addColorStop(0,a(y.base,-.25)),o.addColorStop(.75,y.base),o.addColorStop(1,a(y.base,y.light?.15:.05)),u.beginPath(),i(u,e.x,e.y,t),u.fillStyle=o,u.fill(),u.strokeStyle="rgba(0,0,0,0.25)",u.lineWidth=1,u.stroke();
  const cw=Math.round(e.size*2.6),ch=Math.round(e.size*0.88),cr=4;
  const drawCrossShape=(ctx)=>{
    ctx.beginPath();
    n(ctx,e.x-cw/2,e.y-ch/2,cw,ch,cr);
    n(ctx,e.x-ch/2,e.y-cw/2,ch,cw,cr);
  };
  u.save();
  u.shadowColor="rgba(0,0,0,0.65)";u.shadowBlur=8;u.shadowOffsetY=4;
  drawCrossShape(u);
  const cGrad=u.createLinearGradient(0,e.y-cw/2,0,e.y+cw/2);
  cGrad.addColorStop(0,"#38393e");cGrad.addColorStop(1,"#1e1f23");
  u.fillStyle=cGrad;u.fill();
  u.restore();
  u.save();
  drawCrossShape(u);
  u.strokeStyle="rgba(0,0,0,0.6)";u.lineWidth=1.2;u.stroke();
  u.beginPath();i(u,e.x,e.y,Math.round(ch*0.28));
  u.fillStyle="rgba(0,0,0,0.35)";u.fill();
  u.strokeStyle="rgba(255,255,255,0.08)";u.lineWidth=1;u.stroke();
  // 纯正任天堂十字键四臂凹槽长条刻线 (对齐图1标杆)
  u.strokeStyle="rgba(255,255,255,0.32)";
  u.lineWidth=2;
  u.lineCap="round";
  const mD=Math.round(cw*0.3),mL=Math.round(ch*0.36);
  u.beginPath();
  u.moveTo(e.x,e.y-mD-mL/2);u.lineTo(e.x,e.y-mD+mL/2);
  u.moveTo(e.x,e.y+mD-mL/2);u.lineTo(e.x,e.y+mD+mL/2);
  u.moveTo(e.x-mD-mL/2,e.y);u.lineTo(e.x-mD+mL/2,e.y);
  u.moveTo(e.x+mD-mL/2,e.y);u.lineTo(e.x+mD+mL/2,e.y);
  u.stroke();
  u.restore();
}}const M=S.six;if(M){const e=10;c(u,t=>n(t,M.x-M.w/2-e,M.y-M.h/2-e,M.w+2*e,M.h+2*e,M.r+e),y.plate,y,.7)}const v=S.diamond||S.single;if(v){
  const outerR = v.plateR || (v.d + v.r + 16);
  // 1. 最外层凹槽阴影大圆 (100% 绝对等大对齐左侧最外圈凹槽大圆)
  c(u, t=>i(t, v.x, v.y, outerR), a(y.body, -.06), y, .9);
  // 2. 内层紫灰精致底盘
  const grad = u.createRadialGradient(v.x, v.y - 0.2*outerR, 0.1*outerR, v.x, v.y, outerR);
  grad.addColorStop(0, a(y.plate, y.light ? 0.08 : 0.04));
  grad.addColorStop(0.8, y.plate);
  grad.addColorStop(1, a(y.plate, -0.06));
  u.beginPath(); i(u, v.x, v.y, outerR - 2); u.fillStyle = grad; u.fill();
  u.strokeStyle = "rgba(0,0,0,0.12)"; u.lineWidth = 1; u.stroke();
  
  // 3. 药丸双滑槽 (连接 Y-X 与 B-A)
  const actMap = {};
  x.actions.forEach(e => { if(e.key) actMap[e.key] = S[e.id]; });
  u.save(); u.fillStyle = y.groove;
  if(actMap.Y && actMap.X){ u.beginPath(); r(u, actMap.Y.x, actMap.Y.y, actMap.X.x, actMap.X.y, v.r + 6); u.fill(); }
  if(actMap.B && actMap.A){ u.beginPath(); r(u, actMap.B.x, actMap.B.y, actMap.A.x, actMap.A.y, v.r + 6); u.fill(); }
  u.restore();
  
  // 4. 外圈字母标识 X, Y, A, B (深灰精致无衬线)
  u.save();
  u.font = "700 12px " + s;
  u.textAlign = "center";
  u.textBaseline = "middle";
  u.fillStyle = y.text;
  x.actions.forEach(e => {
    const t = S[e.id];
    if(!t || !e.key) return;
    const ang = Math.atan2(t.y - v.y, t.x - v.x);
    const distLabel = v.d + v.r + 5;
    u.fillText(e.key, v.x + Math.cos(ang)*distLabel, v.y + Math.sin(ang)*distLabel);
  });
  u.restore();
}
const tb=S.twoButton;
if(tb){
  const outerR = tb.plateR || 84;
  // 1. 最外层科技暗纹微凹底盘 (对齐左侧十字键底盘)
  c(u, t=>i(t, tb.x, tb.y, outerR), a(y.body, -.06), y, .8);
  const grad = u.createRadialGradient(tb.x, tb.y - 0.2*outerR, 0.1*outerR, tb.x, tb.y, outerR);
  grad.addColorStop(0, a(y.plate, y.light ? 0.06 : 0.03));
  grad.addColorStop(0.8, y.plate);
  grad.addColorStop(1, a(y.plate, -0.06));
  u.beginPath(); i(u, tb.x, tb.y, outerR - 2); u.fillStyle = grad; u.fill();
  u.strokeStyle = "rgba(0,0,0,0.15)"; u.lineWidth = 1; u.stroke();
  
  // 2. 倾斜优雅跑道双键滑槽
  const bB = x.actions.find(a=>a.key==="B"||a.id==="b")||x.actions[0];
  const bA = x.actions.find(a=>a.key==="A"||a.id==="a")||x.actions[1]||x.actions[0];
  const pB = bB && S[bB.id], pA = bA && S[bA.id];
  if(pB && pA){
    u.save(); u.fillStyle = y.groove;
    u.beginPath(); r(u, pB.x, pB.y, pA.x, pA.y, pA.r + 8); u.fill();
    u.restore();
  }
}
return x.capsules.map(e=>S[e.id]).filter(Boolean).forEach(e=>{const t=g(e),o=e.x+e.w/2,l=e.y+e.h/2;c(u,e=>n(e,o-t.w/2-4,l-t.h/2-4,t.w+8,t.h+8,t.h/2+4),a(y.body,-.1),y,.7)}),S.sloganAt&&x.slogan?(u.save(),u.font="10px "+s,u.textAlign="center",u.textBaseline="middle",u.fillStyle="rgba(255,255,255,0.4)",u.measureText(x.slogan).width<=S.sloganAt.maxW&&u.fillText(x.slogan,S.sloganAt.x,S.sloganAt.y),u.restore()):void 0!==S.capsuleRowY&&x.slogan&&(u.save(),u.font="11px "+s,u.textAlign="center",u.textBaseline="middle",u.fillStyle=y.text,u.fillText(x.slogan,e/2,S.capsuleRowY-14),u.restore()),m}let x=1;function p(e,t,a,o){const n=l((e+2*a)*x,(t+2*a)*x);n.cssW=e+2*a,n.cssH=t+2*a;const i=n.getContext("2d");return i.scale(x,x),i.translate(a,a),o(i),n}function m(e,t,l){x=e.dpr||1;const r=e.hitboxes,c={},d=12;if(l.actions.forEach(e=>{const l=r[e.id];if(!l)return;const n=l.r,b=t.btn&&t.btn[e.key]||t.btn.A,h=t=>p(2*n,2*n,d,l=>{const r=t?1.5:0;!function(e,t,l,n,r,s){const c=o(r)>.62;e.save(),e.shadowColor="rgba(0,0,0,"+(s?.35:.5)+")",e.shadowBlur=s?2:6,e.shadowOffsetY=s?1:3;const d=e.createLinearGradient(t,l-n,t,l+n);if(s?(d.addColorStop(0,a(r,-.25)),d.addColorStop(1,a(r,-.05))):(d.addColorStop(0,a(r,c?.35:.22)),d.addColorStop(.6,r),d.addColorStop(1,a(r,-.28))),e.beginPath(),i(e,t,l,n),e.fillStyle=d,e.fill(),e.restore(),e.save(),e.beginPath(),i(e,t,l,n),e.strokeStyle=a(r,-.45),e.lineWidth=1.2,e.stroke(),!s){e.clip();const a=e.createRadialGradient(t-.3*n,l-.45*n,0,t-.3*n,l-.45*n,.9*n);a.addColorStop(0,"rgba(255,255,255,"+(c?.6:.35)+")"),a.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=a,e.fillRect(t-n,l-n,2*n,2*n)}e.restore()}(l,n,n+r,n-1,b,t),l.save(),l.font=(e.label.length<=2?"800 ":"600 ")+Math.round(e.label.length<=2?n*0.72:Math.max(10,.46*n))+"px "+s,l.textAlign="center",l.textBaseline="middle";const c=o(b)>.6;l.fillStyle=c?"rgba(40,30,70,0.75)":"rgba(255,255,255,0.92)",l.fillText(e.label,n,n+r+1),l.restore()});c[e.id]={x:l.x-n-d,y:l.y-n-d,up:h(!1),down:h(!0)}}),l.capsules.forEach(e=>{const l=r[e.id];if(!l)return;const i=g(l),b=l=>p(i.w,i.h,d,r=>{const c=l?1:0;r.save(),r.shadowColor="rgba(0,0,0,"+(l?.3:.45)+")",r.shadowBlur=l?2:4,r.shadowOffsetY=l?1:2;const d=r.createLinearGradient(0,c,0,i.h+c);d.addColorStop(0,a(t.cap,l?-.15:.25)),d.addColorStop(1,a(t.cap,-.2)),r.beginPath(),n(r,0,c,i.w,i.h,i.h/2),r.fillStyle=d,r.fill(),r.restore(),r.beginPath(),n(r,0,c,i.w,i.h,i.h/2),r.strokeStyle=a(t.cap,-.4),r.lineWidth=1,r.stroke(),r.font="600 12px "+s,r.textAlign="center",r.textBaseline="middle",r.fillStyle=o(t.cap)>.6?"rgba(40,40,48,0.85)":"rgba(255,255,255,0.92)",r.fillText(e.label,i.w/2,i.h/2+c+.5)});c[e.id]={x:l.x+l.w/2-i.w/2-d,y:l.y+l.h/2-i.h/2-d,up:b(!1),down:b(!0)}}),r.dpadCenter&&!(l.pad&&!l.pad.stick)){const e=1.5*r.dpadCenter.size,o=.6*e,l=p(2*o,2*o,d,e=>{e.save(),e.shadowColor="rgba(0,0,0,0.55)",e.shadowBlur=10,e.shadowOffsetY=5;const l=e.createRadialGradient(.7*o,.55*o,.05*o,o,o,o);l.addColorStop(0,a(t.knob,.55)),l.addColorStop(.35,a(t.knob,.12)),l.addColorStop(1,t.knob),e.beginPath(),i(e,o,o,o),e.fillStyle=l,e.fill(),e.restore();const n=e.createRadialGradient(.68*o,.5*o,0,.68*o,.5*o,.35*o);n.addColorStop(0,"rgba(255,255,255,0.75)"),n.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=n,e.beginPath(),i(e,.68*o,.5*o,.35*o),e.fill()});c.__knob={img:l,cx:r.dpadCenter.x,cy:r.dpadCenter.y,travel:.42*e}}return c}function u(t){for(let a=0;a<e.length;a++)if(e[a].id===t)return e[a];return e[0]}window.GGEMU_SKIN={themes:e.concat([{id:"classic",name:"经典"}]),layout:{bezelInset:10,screenInset:22,bezelAbove:66,band:34,topPad:14},storageKey:"ggemu_skin_pocket",find:u,build:function(e,t,a){const o=u(t);return{theme:o,bg:y(e.w,e.h,e,o,a),sprites:m(e,o,a)}},draw:function(e,t,a,o,l){const n=a.hitboxes;e.drawImage(t.bg,0,0,a.w,a.h),l&&n.game&&(e.imageSmoothingEnabled=!1,e.drawImage(l,n.game.x,n.game.y,n.game.w,n.game.h),e.imageSmoothingEnabled=!0);const i=t.sprites;Object.keys(i).forEach(t=>{if("__knob"===t)return;const a=i[t],l=o[t]?a.down:a.up;e.drawImage(l,a.x,a.y,l.cssW,l.cssH)});const r=i.__knob;if(r){const t=a.stick||{x:0,y:0},o=r.cx+t.x*r.travel-r.img.cssW/2,l=r.cy+t.y*r.travel-r.img.cssH/2;e.drawImage(r.img,o,l,r.img.cssW,r.img.cssH)}}}}();