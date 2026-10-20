// ── 主程序：渲染循环 / 输入 / 游戏状态 / 自动驾驶 ─────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { World, LANES } from './world.js';
import { Pelican } from './pelican.js';
import { Scarf } from './cloth.js';
import { CameraDirector, CAM_NAMES } from './camera.js';
import { AudioEngine } from './audio.js';
import { AchievementManager, ACHIEVEMENTS } from './achievements.js';
import { QualityManager, TIERS } from './quality.js';
import { clamp, lerp, damp, rand, smoothstep } from './utils.js';

const $ = (s) => document.querySelector(s);
const el = {
  spd: $('#spd'), spdBar: $('#spdBar'), cad: $('#cad'), fish: $('#fish'), dist: $('#dist'),
  q: $('#q'), fps: $('#fps'), phaseTxt: $('#phaseTxt'), phaseDot: $('#phaseDot'),
  toasts: $('#toasts'), achList: $('#achList'), achCount: $('#achCount'), achPanel: $('#achPanel'),
  achBtn: $('#achBtn'), muteBtn: $('#muteBtn'), start: $('#start'), goBtn: $('#goBtn'),
  touch: $('#touch'), autoTag: $('#autoTag'),
};

// ── 渲染器 ────────────────────────────────────────────────────
const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.08, 3000);
camera.position.set(-6, 3, 0);

// ── 画质 ──────────────────────────────────────────────────────
const startTier = innerWidth < 700 ? 1 : (devicePixelRatio > 2.5 ? 2 : 3);
const quality = new QualityManager(startTier, (q) => applyQuality(q));
let composer = null, bloomPass = null;

function applyQuality(q) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  world.setQuality(q);
  if (q.bloom && !composer) buildComposer();
  else if (!q.bloom && composer) { composer = null; bloomPass = null; }
  scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.72, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(Math.min(devicePixelRatio, quality.settings.pixelRatio));
}

// ── 世界 ──────────────────────────────────────────────────────
const world = new World(scene, quality.settings);
const pelican = new Pelican(scene);
const scarf = new Scarf({ segments: 11, segLen: 0.105, width: 0.26 });
scene.add(scarf.mesh);
scarf.reset(pelican.scarfAnchorWorld);
const director = new CameraDirector(camera);
const audio = new AudioEngine();

// ── 游戏状态 ──────────────────────────────────────────────────
const G = {
  speed: 0, cruise: 0, maxSpeed: 27,
  lane: 1, laneTarget: 1, z: 0,
  jump: 0, jumpVel: 0, onGround: true, jumpCount: 0,
  wheelie: 0, wheelieHeld: false, wheelieTime: 0,
  distance: 0, fish: 0, combo: 0, comboTimer: 0, bestCombo: 0,
  bikeX: 0, bikeZ: 0,
  auto: false, idle: 0, running: false,
  speedKmh: 0, cadence: 0, phase: 0, cameraMode: 0,
  scarfLift: 0, dt: 0, time: 0,
  dawn: 0, nightTime: 0,
};

const keys = Object.create(null);
let lastPedal = 0;

// ── UI ────────────────────────────────────────────────────────
function toast(a) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = `<span class="ic">${a.icon}</span><div><div class="t">${a.name}</div><div class="d">${a.desc}</div></div>`;
  el.toasts.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 420); }, 3000);
}

const ach = new AchievementManager((a) => {
  toast(a);
  audio.achievement();
  renderAchList();
});

function renderAchList() {
  el.achList.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const on = ach.has(a.id);
    const d = document.createElement('div');
    d.className = 'ach ' + (on ? 'done' : 'lock');
    d.innerHTML = `<div class="ic">${on ? a.icon : '🔒'}</div><div><div class="t">${a.name}</div><div class="d">${a.desc}</div></div>`;
    el.achList.appendChild(d);
  }
  el.achCount.textContent = `${ach.count()}/${ACHIEVEMENTS.length}`;
}
renderAchList();

el.achBtn.onclick = () => el.achPanel.classList.toggle('open');
el.muteBtn.onclick = () => {
  const m = audio.toggleMute();
  el.muteBtn.textContent = m ? '音效 关' : '音效 开';
  el.muteBtn.classList.toggle('on', m);
};
document.querySelectorAll('[data-cam]').forEach((b) => {
  b.onclick = () => { setCam(+b.dataset.cam); };
});
$('#resetBtn').onclick = () => {
  G.distance = 0; G.fish = 0; G.combo = 0; G.speed = 0; G.bikeX = 0; G.lane = G.laneTarget = 1;
};
function setCam(m) {
  director.setMode(m);
  G.cameraMode = director.mode;
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', +b.dataset.cam === director.mode));
}

// ── 输入 ──────────────────────────────────────────────────────
function markInput() { G.idle = 0; if (G.auto) { G.auto = false; el.autoTag.classList.remove('on'); } }

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  if (keys[k]) return;
  keys[k] = true;
  markInput();
  if (k === ' ') doJump();
  if (k === 't') { G.wheelieHeld = true; audio.wheelie(); director.addShake(0.25); }
  if (k === 'c') { director.next(); G.cameraMode = director.mode; document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', +b.dataset.cam === director.mode)); }
  if (k === 'b') el.achPanel.classList.toggle('open');
  if (k === 'arrowleft' || k === 'a') changeLane(-1);
  if (k === 'arrowright' || k === 'd') changeLane(1);
  if (k === '1') setCam(0); if (k === '2') setCam(1); if (k === '3') setCam(2);
  if (k === '4') setCam(3); if (k === '5') setCam(4);
  if (k === 'm') el.muteBtn.click();
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === 't') G.wheelieHeld = false;
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.wheelieHeld = false; });

function changeLane(d) {
  const n = clamp(G.laneTarget + d, 0, 2);
  if (n !== G.laneTarget) { G.laneTarget = n; audio.lane(); }
}

// 触屏按钮
const touchKeys = { left: 'a', right: 'd', accel: 'w', brake: 's', jump: ' ', wheelie: 't' };
document.querySelectorAll('#touch .tbtn').forEach((b) => {
  const k = touchKeys[b.dataset.k];
  const down = (e) => {
    e.preventDefault(); markInput();
    b.classList.add('hit');
    if (k === ' ') { doJump(); }
    else if (k === 't') { G.wheelieHeld = true; audio.wheelie(); }
    else { keys[k] = true; if (k === 'a') changeLane(-1); if (k === 'd') changeLane(1); }
  };
  const up = (e) => {
    e.preventDefault(); b.classList.remove('hit');
    if (k === 't') G.wheelieHeld = false; else if (k) keys[k] = false;
  };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});
if ('ontouchstart' in window) el.touch.classList.add('on');

function doJump() {
  if (!G.onGround) return;
  G.onGround = false;
  G.jumpVel = 6.2;
  G.jumpCount++;
  audio.jump();
  director.addShake(0.18);
}

// ── 自动驾驶 ──────────────────────────────────────────────────
function autoDrive(dt) {
  // 目标速度
  const fish = world.nearestFish(G.bikeX);
  let target = 16.5;
  let lane = 1;
  if (fish) {
    const dx = fish.x - G.bikeX;
    lane = 0;
    if (dx > 4) target = 20.5;
    else if (dx > 0) target = 14.5;
    else target = 11.0;
    if (dx < -14) target = 18.0;
  } else if (Math.sin(G.time * 0.3) > 0.6) {
    lane = 1 + Math.round(Math.sin(G.time * 0.22));
  }
  G.laneTarget = lane;
  G.cruise = target;
  G.speed = damp(G.speed, target, 1.2, dt);
}

// ── 主循环 ────────────────────────────────────────────────────
let last = performance.now();
let hudT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  G.dt = dt;
  if (!G.running) { renderer.render(scene, camera); return; }
  G.time += dt;

  // 输入 → 状态
  const acc = keys['w'] || keys['arrowup'];
  const brk = keys['s'] || keys['arrowdown'];
  if (acc || brk) {
    G.cruise = clamp(G.cruise + (acc ? 6.5 : -13) * dt, 0, G.maxSpeed);
    G.speed = damp(G.speed, G.cruise, acc ? 1.1 : 2.6, dt);
  }
  G.idle += dt;
  if (G.idle > 4.5 && !G.auto) {
    G.auto = true; el.autoTag.classList.add('on');
    G.cruise = 16;
  }
  if (G.auto) autoDrive(dt);

  // 车道
  const laneZ = LANES[G.laneTarget];
  const prevZ = G.z;
  G.z = damp(G.z, laneZ, 7.5, dt);
  const lean = clamp((G.z - prevZ) / Math.max(dt, 1e-3) * 0.055, -0.6, 0.6);

  // 跳跃
  if (!G.onGround) {
    G.jumpVel -= 19 * dt;
    G.jump += G.jumpVel * dt;
    if (G.jump <= 0) { G.jump = 0; G.jumpVel = 0; G.onGround = true; }
  }

  // 抬前轮
  const canWheelie = G.wheelieHeld && G.speed > 5.5 && G.onGround;
  G.wheelie = damp(G.wheelie, canWheelie ? 1 : 0, canWheelie ? 5 : 3.5, dt);
  if (canWheelie) G.wheelieTime += dt; else G.wheelieTime = 0;

  // 位移
  G.speed = Math.max(0, G.speed);
  G.bikeX += G.speed * dt;
  G.distance += G.speed * dt;
  G.speedKmh = G.speed * 3.6;

  // 踏频（跟随车速）
  const targetCad = clamp(G.speed * 5.1 + 6, 0, 118);
  G.cadence = damp(G.cadence, targetCad, 4, dt);

  // 鱼连击计时
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }

  // 鹈鹕 & 自行车
  pelican.root.position.set(G.bikeX, G.jump, G.z);
  pelican.root.rotation.z = 0;
  pelican.update(dt, {
    speed: G.speed, cadence: G.cadence, wheelie: G.wheelie, jump: G.jump, lean,
  });

  // 围巾（布料）
  const anchor = pelican.scarfAnchorWorld;
  const wind = new THREE.Vector3(-G.speed * 0.85 - 1.4, 1.15 + G.speed * 0.045, Math.sin(G.time * 2.1) * 1.1);
  scarf.update(dt, anchor, wind, quality.settings.clothIter);
  G.scarfLift = scarf.tipLift(anchor);

  // 昼夜
  G.phase = (G.time / 240) % 1;
  world.setPhase(G.phase);
  const nightAmt = world.night;
  if (G.phase < 0.22) G.dawn += dt; else G.nightTime += dt;

  // 世界更新（鱼 / 道具 / 浪）
  const billPos = pelican.billTipWorld;
  const ev = world.update(dt, {
    dt, time: G.time, bikeX: G.bikeX, bikeZ: G.z,
    camX: camera.position.x, camY: camera.position.y, camZ: camera.position.z,
    billPos,
  });
  if (ev && ev.type === 'catch') {
    G.fish++; G.combo++; G.comboTimer = 4.5; G.bestCombo = Math.max(G.bestCombo, G.combo);
    pelican.putFish();
    audio.catchFish();
    director.addShake(0.3);
    world.spawnRing(ev.x, ev.y * 0 + -12);
  }

  // 镜头
  director.update(dt, {
    bike: pelican.root.position, head: pelican.head, speed: G.speed,
  });

  // 音频
  audio.update(dt, { speed: G.speed, night: nightAmt, running: true });
  // 踏板节奏 → 音乐节拍
  const crank = pelican.crankAngle;
  if (Math.floor(crank / Math.PI) !== lastPedal) {
    lastPedal = Math.floor(crank / Math.PI);
    audio.pedalTick(G.cadence);
  }

  // 成就
  ach.evaluate(G);

  // 画质
  const fps = quality.update(dt);

  // HUD
  hudT += dt;
  if (hudT > 0.08) {
    hudT = 0;
    el.spd.textContent = G.speedKmh.toFixed(0);
    el.spdBar.style.width = `${clamp(G.speedKmh / 95 * 100, 0, 100)}%`;
    el.cad.innerHTML = `${G.cadence.toFixed(0)} <span class="unit">rpm</span>`;
    el.fish.textContent = `${G.fish}${G.combo > 1 ? ' (×' + G.combo + ')' : ''}`;
    el.dist.textContent = (G.distance / 1000).toFixed(2) + ' km';
    el.q.textContent = `${TIERS[quality.tier].name} · ${fps.toFixed(0)}`;
    el.fps.textContent = `${fps.toFixed(0)} fps · ${TIERS[quality.tier].name}`;
    const pname = G.phase < 0.1 ? '黄昏' : G.phase < 0.26 ? '暮色' : G.phase < 0.78 ? '星夜' : '黎明前';
    el.phaseTxt.textContent = pname + (G.combo > 1 ? ` · ${G.combo}连击` : '');
    el.phaseDot.style.background = nightAmt > 0.5 ? '#9fb6ff' : '#ffb347';
    el.autoTag.style.display = G.auto ? '' : 'none';
  }

  if (composer) composer.render(); else renderer.render(scene, camera);
}

// ── 尺寸 ──────────────────────────────────────────────────────
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); }
}
addEventListener('resize', resize);

// ── 启动 ──────────────────────────────────────────────────────
el.goBtn.onclick = async () => {
  try { await audio.start(); } catch (e) { /* 忽略音频失败 */ }
  el.start.classList.add('hide');
  setTimeout(() => el.start.remove(), 800);
  G.running = true;
  setCam(0);
};

applyQuality(quality.settings);
if (quality.settings.bloom) buildComposer();
requestAnimationFrame(frame);

// 调试钩子
window.__game = { G, world, pelican, director, quality, camera, scene, renderer, scarf, audio, ach, setCam };
