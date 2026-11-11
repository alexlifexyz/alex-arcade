/**
 * bg-scene.js
 * 《人类极限挑战》Three.js 3D 动态科技能量波浪背景引擎
 * 特性：
 * 1. 2500 粒子 3D 动态波浪网格 (Cyber Wave Matrix)
 * 2. 悬浮自旋 3D 能量线框晶核 (Floating Polyhedron Core)
 * 3. 毫秒级受激冲击波扩散 (Shockwave Ripple)
 * 4. 颜色与能量动态响应游戏状态 (静默暗黑 / 蓄力暗红 / 激发翠绿 / 胜利幻彩)
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PeakBgScene = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  let renderer = null;
  let scene = null;
  let camera = null;
  let canvasEl = null;

  // 粒子系统参数
  const SEPARATION = 40;
  const AMOUNTX = 45;
  const AMOUNTY = 45;
  let particles = null;
  let count = 0;

  // 悬浮能量晶核
  let coreMesh = null;
  let coreWire = null;
  let coreGlow = null;

  // 冲击波能量
  let shockwaveProgress = 1.0;
  let shockwaveCenter = { x: 0, y: 0 };

  // 目标主题色
  let targetColor = { r: 0.02, g: 0.72, b: 0.83 }; // 默认电光青
  let currentColor = { r: 0.02, g: 0.72, b: 0.83 };

  let isRunning = false;
  let animId = null;

  function init(canvas) {
    if (!window.THREE) {
      console.warn("Three.js not found, fallback to 2D");
      return;
    }
    canvasEl = canvas;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. 初始化相机
    camera = new THREE.PerspectiveCamera(65, width / height, 1, 10000);
    camera.position.set(0, 320, 650);
    camera.lookAt(0, 0, 0);

    // 2. 初始化场景
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050811, 0.0014);

    // 3. 构建 3D 粒子波浪网格
    const numParticles = AMOUNTX * AMOUNTY;
    const positions = new Float32Array(numParticles * 3);
    const scales = new Float32Array(numParticles);

    let i = 0;
    let j = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2); // x
        positions[i + 1] = 0; // y
        positions[i + 2] = iy * SEPARATION - ((AMOUNTY * SEPARATION) / 2) - 100; // z
        scales[j] = 1.0;
        i += 3;
        j++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    // 自定义粒子材质着色
    const material = new THREE.PointsMaterial({
      color: 0x00f5d4,
      size: 3.5,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 4. 构建中央 3D 悬浮几何晶核 (Icosahedron)
    const coreGeo = new THREE.IcosahedronGeometry(75, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    coreWire = new THREE.Mesh(coreGeo, wireMat);
    coreWire.position.set(0, 80, 0);
    scene.add(coreWire);

    const innerGeo = new THREE.IcosahedronGeometry(45, 0);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: false,
      transparent: true,
      opacity: 0.15
    });
    coreMesh = new THREE.Mesh(innerGeo, innerMat);
    coreMesh.position.set(0, 80, 0);
    scene.add(coreMesh);

    // 5. 初始化渲染器
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x050811, 1.0);

    window.addEventListener("resize", onWindowResize);
    start();
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // 产生轻触激荡冲击波
  function triggerPulse() {
    shockwaveProgress = 0.0;
    if (coreWire) {
      coreWire.scale.set(1.3, 1.3, 1.3);
    }
  }

  // 设置场景主题状态色
  function setThemeState(stateName) {
    if (stateName === "waiting") {
      // 专注蓄力暗红
      targetColor = { r: 0.95, g: 0.15, b: 0.35 };
    } else if (stateName === "ready") {
      // 爆发电光翠绿
      targetColor = { r: 0.06, g: 0.95, b: 0.65 };
      triggerPulse();
    } else if (stateName === "result" || stateName === "finished") {
      // 胜利未来蓝紫
      targetColor = { r: 0.55, g: 0.35, b: 0.98 };
    } else if (stateName === "failed") {
      // 抢跑警示暗红
      targetColor = { r: 0.88, g: 0.11, b: 0.28 };
    } else {
      // 默认电光青
      targetColor = { r: 0.02, g: 0.72, b: 0.83 };
    }
  }

  function animate() {
    if (!isRunning) return;
    animId = requestAnimationFrame(animate);

    // 颜色渐变过渡
    currentColor.r += (targetColor.r - currentColor.r) * 0.08;
    currentColor.g += (targetColor.g - currentColor.g) * 0.08;
    currentColor.b += (targetColor.b - currentColor.b) * 0.08;

    if (particles && particles.material) {
      particles.material.color.setRGB(currentColor.r, currentColor.g, currentColor.b);
    }
    if (coreWire && coreWire.material) {
      coreWire.material.color.setRGB(currentColor.r, currentColor.g, currentColor.b);
      coreWire.rotation.x += 0.008;
      coreWire.rotation.y += 0.012;
      // 弹性缩放回弹
      coreWire.scale.x += (1.0 - coreWire.scale.x) * 0.1;
      coreWire.scale.y += (1.0 - coreWire.scale.y) * 0.1;
      coreWire.scale.z += (1.0 - coreWire.scale.z) * 0.1;
    }
    if (coreMesh) {
      coreMesh.rotation.x -= 0.01;
      coreMesh.rotation.y -= 0.007;
    }

    // 冲击波衰减
    if (shockwaveProgress < 1.0) {
      shockwaveProgress += 0.025;
    }

    // 粒子波浪起伏更新
    if (particles) {
      const positions = particles.geometry.attributes.position.array;
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          const wave1 = Math.sin((ix + count) * 0.3) * 32;
          const wave2 = Math.sin((iy + count) * 0.5) * 32;

          // 叠加冲击波
          let shock = 0;
          if (shockwaveProgress < 1.0) {
            const dist = Math.hypot(ix - AMOUNTX / 2, iy - AMOUNTY / 2);
            const waveFront = shockwaveProgress * 30;
            const diff = Math.abs(dist - waveFront);
            if (diff < 4) {
              shock = (1.0 - shockwaveProgress) * 45 * Math.cos(diff * 0.8);
            }
          }

          positions[i + 1] = wave1 + wave2 + shock;
          i += 3;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;
    }

    count += 0.035;
    renderer.render(scene, camera);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    animate();
  }

  function stop() {
    isRunning = false;
    if (animId) cancelAnimationFrame(animId);
  }

  return {
    init: init,
    triggerPulse: triggerPulse,
    setThemeState: setThemeState,
    handleResize: onWindowResize,
    start: start,
    stop: stop
  };
});
