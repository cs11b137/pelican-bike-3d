// ── 5 种镜头（含电影运镜与鹈鹕视角）─────────────────────────────
import * as THREE from 'three';
import { clamp, lerp, damp, easeInOut, rand } from './utils.js';

export const CAM_NAMES = ['追尾', '电影运镜', '鹈鹕视角', '侧视跟拍', '航拍俯瞰'];

const SHOTS = [
  { off: [0.6, 0.85, 5.0], look: [0, 1.15, 0], fov: 42, dur: 5.0, name: '横移' },
  { off: [4.6, 0.5, 2.4], look: [0.1, 1.0, 0], fov: 36, dur: 4.2, name: '低机位前推' },
  { off: [-0.8, 5.2, 3.4], look: [0, 0.9, 0], fov: 48, dur: 4.6, name: '升降' },
  { off: [-1.7, 1.85, -2.5], look: [0.2, 1.35, 0], fov: 50, dur: 4.0, name: '过肩' },
  { off: [-8.5, 2.6, 6.5], look: [0, 1.0, 0], fov: 30, dur: 6.0, name: '大远景' },
  { off: [-3.4, 1.15, 1.6], look: [0.6, 1.0, 0], fov: 55, dur: 3.6, name: '贴地跟拍' },
];

export class CameraDirector {
  constructor(camera) {
    this.cam = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(-6, 3, 0);
    this.look = new THREE.Vector3();
    this.shot = 0;
    this.shotT = 0;
    this.blend = 1;
    this.prevPos = new THREE.Vector3();
    this.prevLook = new THREE.Vector3();
    this.shake = 0;
    this.t = 0;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._yAxis = new THREE.Vector3(0, 1, 0);
  }

  setMode(m) {
    m = ((m % CAM_NAMES.length) + CAM_NAMES.length) % CAM_NAMES.length;
    if (m === this.mode) return;
    this.prevPos.copy(this.pos);
    this.prevLook.copy(this.look);
    this.mode = m;
    this.blend = 0;
    if (m === 1) { this.shot = Math.floor(rand(0, SHOTS.length)); this.shotT = 0; }
  }
  next() { this.setMode(this.mode + 1); }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  /**
   * @param ctx { bike:THREE.Vector3(世界坐标), head:THREE.Object3D, speed, dt }
   */
  update(dt, ctx) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const bike = ctx.bike;
    const targetPos = this._v;
    const targetLook = new THREE.Vector3();
    let fov = 52;
    let lerpK = 4.5;

    if (this.mode === 0) {
      const back = 6.4 + ctx.speed * 0.14;
      targetPos.set(bike.x - back, bike.y + 2.85 + ctx.speed * 0.02, bike.z + 0.5);
      targetLook.set(bike.x + 1.4, bike.y + 1.45, bike.z);
      fov = 54 + clamp(ctx.speed * 0.26, 0, 12);
      lerpK = 4.0;
    } else if (this.mode === 1) {
      this.shotT += dt;
      const s = SHOTS[this.shot];
      if (this.shotT > s.dur) {
        this.shotT = 0;
        this.shot = (this.shot + 1) % SHOTS.length;
        this.prevPos.copy(this.pos); this.prevLook.copy(this.look);
        this.blend = 0;
      }
      const s2 = SHOTS[this.shot];
      const k = easeInOut(clamp(this.shotT / 0.9, 0, 1));
      const ox = lerp(s.off[0], s2.off[0], k);
      const oy = lerp(s.off[1], s2.off[1], k);
      const oz = lerp(s.off[2], s2.off[2], k);
      const lx = lerp(s.look[0], s2.look[0], k);
      const ly = lerp(s.look[1], s2.look[1], k);
      const lz = lerp(s.look[2], s2.look[2], k);
      const drift = Math.sin(this.t * 0.35) * 0.5;
      targetPos.set(bike.x + ox + drift, bike.y + oy, bike.z + oz + drift * 0.4);
      targetLook.set(bike.x + lx, bike.y + ly, bike.z + lz);
      fov = lerp(s.fov, s2.fov, k);
      lerpK = 3.0;
    } else if (this.mode === 2) {
      const head = ctx.head;
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(targetPos);
      head.getWorldQuaternion(this._q);
      targetPos.add(new THREE.Vector3(0.46, 0.13, 0).applyQuaternion(this._q));
      this._q2.setFromAxisAngle(this._yAxis, -Math.PI / 2);
      this._q.multiply(this._q2);
      this.cam.position.copy(targetPos);
      this.cam.quaternion.slerp(this._q, clamp(dt * 22, 0, 1));
      this.cam.fov = damp(this.cam.fov, 62 + clamp(ctx.speed * 0.45, 0, 16), 5, dt);
      this.cam.updateProjectionMatrix();
      this._applyShake(dt, 0.0016);
      return;
    } else if (this.mode === 3) {
      targetPos.set(bike.x + 0.6, bike.y + 1.5, bike.z + 7.2);
      targetLook.set(bike.x + 0.6, bike.y + 1.3, bike.z);
      fov = 40; lerpK = 5.0;
    } else {
      const a = this.t * 0.12;
      const r = 9.5 + Math.sin(this.t * 0.2) * 2.0;
      targetPos.set(bike.x - Math.cos(a) * r, bike.y + 7.2 + Math.sin(this.t * 0.25) * 1.4, bike.z + Math.sin(a) * r);
      targetLook.set(bike.x, bike.y + 0.8, bike.z);
      fov = 46; lerpK = 2.2;
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.45);
      const e = easeInOut(this.blend);
      this.pos.lerpVectors(this.prevPos, targetPos, e);
      this.look.lerpVectors(this.prevLook, targetLook, e);
    } else {
      const k = clamp(1 - Math.exp(-lerpK * dt), 0, 1);
      this.pos.lerp(targetPos, k);
      this.look.lerp(targetLook, k);
    }

    this.cam.position.copy(this.pos);
    this._applyShake(dt, 0.01 + ctx.speed * 0.0006);
    this.cam.lookAt(this.look);
    this.cam.fov = damp(this.cam.fov, fov, 4, dt);
    this.cam.updateProjectionMatrix();
  }

  _applyShake(dt, amp) {
    if (this.shake <= 0.001) return;
    const s = this.shake * this.shake * amp * 60;
    this.cam.position.x += rand(-s, s);
    this.cam.position.y += rand(-s, s);
    this.cam.position.z += rand(-s, s);
  }
}
