// ── 围巾布料物理（Verlet 质点 + 距离约束）─────────────────────
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Scarf {
  /**
   * @param {object} o segments 段数 / segLen 段长 / width 带宽 / color 颜色
   */
  constructor({ segments = 10, segLen = 0.105, width = 0.26, color = 0xd42a3f } = {}) {
    this.n = segments;
    this.segLen = segLen;
    this.width = width;
    this.pts = [];
    this.anchor = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      this.pts.push({
        p: new THREE.Vector3(0, 0, -i * segLen),
        prev: new THREE.Vector3(0, 0, -(i - 1) * segLen),
      });
    }
    // 网格
    const geo = new THREE.BufferGeometry();
    const vcount = (segments + 1) * 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    const idx = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.time = 0;
  }

  reset(anchor) {
    this.anchor.copy(anchor);
    for (let i = 0; i <= this.n; i++) {
      this.pts[i].p.set(anchor.x, anchor.y, anchor.z - i * this.segLen);
      this.pts[i].prev.copy(this.pts[i].p);
    }
  }

  /**
   * @param dt 秒
   * @param anchor 世界坐标锚点（脖子）
   * @param wind 风向量（世界坐标）
   * @param iterations 约束迭代次数
   */
  update(dt, anchor, wind, iterations = 5) {
    this.time += dt;
    const h = Math.min(dt, 1 / 30);
    const gravity = new THREE.Vector3(0, -9.0, 0);
    const acc = new THREE.Vector3().copy(gravity).addScaledVector(wind, 1);
    // 湍流
    const tt = this.time;
    for (let i = 1; i <= this.n; i++) {
      const p = this.pts[i];
      const turb = Math.sin(tt * 9.4 + i * 2.1) * 2.6 + Math.sin(tt * 4.3 + i * 1.3) * 1.7 + Math.sin(tt * 15.1 + i * 0.7) * 0.9;
      _v.copy(p.p).sub(p.prev).multiplyScalar(0.985);          // 阻尼
      p.prev.copy(p.p);
      _v.x += (acc.x + turb * 0.55) * h * h;
      _v.y += (acc.y + turb * 0.35) * h * h;
      _v.z += (acc.z + turb * 0.75) * h * h;
      p.p.add(_v);
    }
    // 锚点固定
    this.pts[0].p.copy(anchor);
    this.pts[0].prev.copy(anchor);
    // 距离约束
    for (let k = 0; k < iterations; k++) {
      for (let i = 0; i < this.n; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        _v.copy(b.p).sub(a.p);
        const d = _v.length() || 1e-5;
        const diff = (d - this.segLen) / d;
        const wa = i === 0 ? 0 : 0.5;
        const wb = i === 0 ? 1 : 0.5;
        a.p.addScaledVector(_v, diff * wa);
        b.p.addScaledVector(_v, -diff * wb);
      }
      this.pts[0].p.copy(anchor);
      // 防止穿地
      for (let i = 1; i <= this.n; i++) {
        if (this.pts[i].p.y < 0.12) this.pts[i].p.y = 0.12;
      }
    }
    this.sync();
  }

  /** 生成带宽度的条带网格 */
  sync() {
    const pos = this.geo.attributes.position.array;
    const nrm = this.geo.attributes.normal.array;
    const w = this.width;
    for (let i = 0; i <= this.n; i++) {
      const p = this.pts[i].p;
      const prev = this.pts[Math.max(0, i - 1)].p;
      const next = this.pts[Math.min(this.n, i + 1)].p;
      _t.copy(next).sub(prev);
      if (_t.lengthSq() < 1e-8) _t.set(0, 0, -1);
      _t.normalize();
      _s.set(0, 1, 0).cross(_t);
      if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0).cross(_t);
      _s.normalize();
      // 副法线（绕切线旋转的轴）
      _b.copy(_t).cross(_s).normalize();
      // 扭转：起始接近竖直，随后越靠末端扭得越明显
      const ang = 1.15 + i * 0.17 + Math.sin(this.time * 4 + i * 0.6) * 0.16;
      _n.copy(_s).multiplyScalar(Math.cos(ang)).addScaledVector(_b, Math.sin(ang)).normalize();
      const taper = w * (1 - 0.45 * (i / this.n));
      const o = i * 6;
      pos[o + 0] = p.x + _n.x * taper * 0.5;
      pos[o + 1] = p.y + _n.y * taper * 0.5;
      pos[o + 2] = p.z + _n.z * taper * 0.5;
      pos[o + 3] = p.x - _n.x * taper * 0.5;
      pos[o + 4] = p.y - _n.y * taper * 0.5;
      pos[o + 5] = p.z - _n.z * taper * 0.5;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  /** 末端相对锚点的抬升（用于「围巾飘起来」判定） */
  tipLift(anchor) {
    const tip = this.pts[this.n].p;
    return (tip.y - anchor.y) / (this.segLen * this.n);
  }
}
