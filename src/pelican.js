// ── 鹈鹕 + 自行车（程序化建模 + 骨骼/轮子/围巾动画）────────────
import * as THREE from 'three';
import { clamp, lerp, damp, TAU } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** 两点之间的可更新“骨头” */
class Bone {
  constructor(parent, r, mat, seg = 8) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1, seg), mat);
    this.mesh.castShadow = true;
    parent.add(this.mesh);
  }
  set(a, b) {
    _d.copy(b).sub(a);
    const len = _d.length() || 0.001;
    this.mesh.position.copy(a).addScaledVector(_d, 0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
    this.mesh.scale.set(1, len, 1);
  }
}

function tube(parent, a, b, r, mat, seg = 10) {
  const bone = new Bone(parent, r, mat, seg);
  bone.set(a, b);
  return bone;
}

function shapeExtrude(points, depth, mat, bevel = 0.015) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export class Pelican {
  constructor(scene) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();       // 抬前轮 / 侧倾
    this.root.add(this.tilt);
    this.bike = new THREE.Group();
    this.tilt.add(this.bike);
    scene.add(this.root);

    this.crankAngle = 0;
    this.wheelAngle = 0;
    this.wingPhase = 0;
    this.legPhase = 0;
    this.pouchFish = 0;

    this.M = {
      frame: new THREE.MeshStandardMaterial({ color: 0x2f3b4d, roughness: 0.42, metalness: 0.55 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.95 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xc9d4e0, roughness: 0.35, metalness: 0.7 }),
      spoke: new THREE.MeshStandardMaterial({ color: 0x9fb0c2, roughness: 0.4, metalness: 0.6 }),
      saddle: new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.75 }),
      grip: new THREE.MeshStandardMaterial({ color: 0xd24b3a, roughness: 0.85 }),
      body: new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.72 }),
      bodyShade: new THREE.MeshStandardMaterial({ color: 0xdde6ef, roughness: 0.78 }),
      wing: new THREE.MeshStandardMaterial({ color: 0xe6edf4, roughness: 0.8 }),
      wingTip: new THREE.MeshStandardMaterial({ color: 0x2b3546, roughness: 0.85 }),
      bill: new THREE.MeshStandardMaterial({ color: 0xf5a84a, roughness: 0.42, metalness: 0.08 }),
      billEdge: new THREE.MeshStandardMaterial({ color: 0xd97f2c, roughness: 0.5 }),
      pouch: new THREE.MeshStandardMaterial({ color: 0xef9440, roughness: 0.5, side: THREE.DoubleSide }),
      leg: new THREE.MeshStandardMaterial({ color: 0xf0a13a, roughness: 0.62 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0x19c3b1, roughness: 0.28, metalness: 0.25 }),
      helmetTrim: new THREE.MeshStandardMaterial({ color: 0x0d8f86, roughness: 0.4 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.08, metalness: 0.9 }),
      strap: new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 }),
      eye: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.2 }),
    };

    this._buildBike();
    this._buildPelican();
  }

  // ── 自行车 ────────────────────────────────────────────────
  _buildBike() {
    const M = this.M;
    const g = this.bike;
    const BB = new THREE.Vector3(0, 0.30, 0);
    const seatTop = new THREE.Vector3(-0.17, 0.90, 0);
    const headTop = new THREE.Vector3(0.44, 0.95, 0);
    const headBot = new THREE.Vector3(0.52, 0.64, 0);
    const rear = new THREE.Vector3(-0.55, 0.34, 0);
    const front = new THREE.Vector3(0.55, 0.34, 0);
    this.BB = BB;

    tube(g, BB, seatTop, 0.026, M.frame);
    tube(g, seatTop, headTop, 0.024, M.frame);
    tube(g, BB, headBot, 0.026, M.frame);
    tube(g, headTop, headBot, 0.030, M.frame);
    tube(g, BB, rear, 0.020, M.frame);
    tube(g, seatTop, rear, 0.019, M.frame);
    tube(g, headBot, front, 0.019, M.frame);
    // 后叉/前叉小细节
    tube(g, new THREE.Vector3(0.50, 0.62, 0), new THREE.Vector3(0.55, 0.34, 0), 0.017, M.frame);
    // 链条
    tube(g, new THREE.Vector3(BB.x, BB.y + 0.05, 0.045), new THREE.Vector3(rear.x, rear.y + 0.05, 0.045), 0.008, M.saddle);
    tube(g, new THREE.Vector3(BB.x, BB.y - 0.05, 0.045), new THREE.Vector3(rear.x, rear.y - 0.05, 0.045), 0.008, M.saddle);

    // 车座
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), M.saddle);
    saddle.scale.set(1.15, 0.34, 0.62);
    saddle.position.set(-0.22, 0.99, 0);
    saddle.castShadow = true;
    g.add(saddle);

    // 车把
    tube(g, headTop, new THREE.Vector3(0.38, 1.10, 0), 0.020, M.frame);
    tube(g, new THREE.Vector3(0.38, 1.10, 0), new THREE.Vector3(0.30, 1.12, 0.22), 0.016, M.frame);
    tube(g, new THREE.Vector3(0.38, 1.10, 0), new THREE.Vector3(0.30, 1.12, -0.22), 0.016, M.frame);
    const gripR = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.17, 8), M.grip);
    gripR.position.set(0.30, 1.12, 0.235); gripR.rotation.x = Math.PI / 2;
    const gripL = gripR.clone(); gripL.position.z = -0.235;
    g.add(gripR, gripL);

    // 车轮
    this.wheels = [];
    for (const [p, r] of [[rear, 0.34], [front, 0.34]]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(r, 0.042, 10, 32), M.tire);
      tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.014, 8, 32), M.rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), M.rim);
      hub.rotation.x = Math.PI / 2;
      w.add(tire, rim, hub);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, r * 1.85, 4), M.spoke);
        sp.rotation.z = a;
        w.add(sp);
      }
      w.position.copy(p);
      g.add(w);
      this.wheels.push(w);
    }

    // 曲柄 + 脚踏
    this.crank = new THREE.Group();
    this.crank.position.copy(BB);
    g.add(this.crank);
    this.pedals = [];
    for (const z of [0.085, -0.085]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.30, 0.02), M.frame);
      arm.position.set(0, 0.09, z * 0.5);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.075), M.rim);
      ped.position.set(0, 0.17, z);
      ped.castShadow = true;
      this.crank.add(arm, ped);
      this.pedals.push(ped);
    }
    // 后飞轮
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), M.rim);
    gear.rotation.x = Math.PI / 2;
    gear.position.copy(rear);
    g.add(gear);
  }

  // ── 鹈鹕 ──────────────────────────────────────────────────
  _buildPelican() {
    const M = this.M;
    const rider = new THREE.Group();
    this.rider = rider;
    this.bike.add(rider);

    // 身体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.40, 20, 16), M.body);
    body.scale.set(1.28, 1.02, 0.90);
    body.position.set(-0.14, 1.26, 0);
    body.castShadow = true;
    rider.add(body);
    this.body = body;

    // 尾羽
    const tail = shapeExtrude([[0.02, 0.12], [-0.40, 0.17], [-0.46, -0.05], [-0.04, -0.13]], 0.17, M.wing);
    tail.position.set(-0.50, 1.26, 0);
    tail.rotation.z = -0.25;
    tail.rotation.y = Math.PI / 2;
    rider.add(tail);

    // 脖子（管）
    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.02, 1.46, 0),
      new THREE.Vector3(0.07, 1.66, 0),
      new THREE.Vector3(0.18, 1.84, 0),
      new THREE.Vector3(0.26, 1.98, 0),
    ]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 22, 0.108, 12, false), M.body);
    neck.castShadow = true;
    rider.add(neck);

    // 头
    const headG = new THREE.Group();
    headG.position.set(0.29, 2.02, 0);
    rider.add(headG);
    this.head = headG;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14), M.body);
    head.scale.set(1.1, 1.0, 1.0);
    head.castShadow = true;
    headG.add(head);

    // 眼睛
    for (const z of [0.105, -0.105]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), M.eye);
      e.position.set(0.125, 0.05, z);
      headG.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), M.pupil);
      p.position.set(0.152, 0.05, z);
      headG.add(p);
    }

    // 墨镜
    const glass = new THREE.Group();
    glass.position.set(0.175, 0.045, 0);
    for (const z of [0.088, -0.088]) {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 10), M.lens);
      lens.scale.set(0.34, 0.78, 0.95);
      lens.position.set(0.012, 0, z);
      lens.rotation.y = z > 0 ? 0.22 : -0.22;
      glass.add(lens);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.010, 0.12), M.lens);
      arm.position.set(-0.05, 0.035, z * 0.95);
      glass.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.015, 0.055), M.lens);
    bridge.position.set(0.024, 0.026, 0);
    glass.add(bridge);
    headG.add(glass);
    this.glasses = glass;

    // 头盔
    const hel = new THREE.Group();
    hel.position.set(0.01, 0.09, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.215, 20, 14, 0, TAU, 0, Math.PI * 0.56), M.helmet);
    dome.scale.set(1.08, 1.0, 1.02);
    dome.castShadow = true;
    hel.add(dome);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.016, 8, 26), M.helmetTrim);
    trim.rotation.x = Math.PI / 2;
    trim.scale.set(1.06, 1.02, 1);
    trim.position.y = 0.012;
    hel.add(trim);
    // 帽檐
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.022, 16, 1, false, -0.9, 1.8), M.helmetTrim);
    brim.position.set(0.14, -0.055, 0);
    brim.rotation.set(Math.PI / 2, 0, 0);
    brim.scale.set(1, 1, 0.6);
    hel.add(brim);
    // 通风孔
    for (const z of [0.07, -0.07]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), M.helmetTrim);
      v.position.set(-0.02, 0.175, z);
      hel.add(v);
    }
    // 帽带
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 20), M.strap);
    strap.rotation.y = Math.PI / 2;
    strap.scale.set(1.1, 1.05, 1);
    strap.position.set(-0.02, -0.05, 0);
    hel.add(strap);
    headG.add(hel);
    this.helmet = hel;

    // 喙 + 喉囊
    const billG = new THREE.Group();
    billG.position.set(0.38, 1.98, 0);
    billG.rotation.z = -0.05;
    rider.add(billG);
    this.billG = billG;
    // 上颚：细长楔形，尖端略下弯
    const upper = shapeExtrude(
      [[0.00, 0.055], [0.34, 0.045], [0.72, 0.005], [0.92, -0.045], [0.70, -0.075], [0.02, -0.055]],
      0.125, M.bill, 0.018);
    billG.add(upper);
    // 喉囊：悬垂的皮囊
    const ps = new THREE.Shape();
    ps.moveTo(0.04, -0.05);
    ps.bezierCurveTo(0.30, -0.075, 0.52, -0.075, 0.62, -0.10);
    ps.bezierCurveTo(0.64, -0.26, 0.54, -0.40, 0.36, -0.44);
    ps.bezierCurveTo(0.18, -0.47, 0.07, -0.30, 0.04, -0.05);
    const pgeo = new THREE.ExtrudeGeometry(ps, { depth: 0.16, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 3, curveSegments: 14 });
    pgeo.translate(0, 0, -0.08);
    const pouch = new THREE.Mesh(pgeo, M.pouch);
    pouch.castShadow = true;
    billG.add(pouch);
    this.pouch = pouch;
    const bill = new THREE.Object3D();
    bill.position.set(0.9, -0.02, 0);
    billG.add(bill);
    this.bill = bill;

    // 袋中的鱼
    const fishIn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.rim);
    fishIn.scale.set(1.8, 0.9, 0.6);
    fishIn.position.set(0.72, 1.70, 0);
    fishIn.visible = false;
    rider.add(fishIn);
    this.fishIn = fishIn;

    // 翅膀（平铺在体侧，展翅时抬起）
    this.wings = [];
    for (const z of [0.2, -0.2]) {
      const w = new THREE.Group();
      const shape = [[0.04, 0.115], [-0.26, 0.075], [-0.34, -0.03], [-0.06, -0.115]];
      const mesh = shapeExtrude(shape, 0.05, M.wing);
      mesh.rotation.x = -Math.PI / 2;      // 平铺于 XZ 平面
      mesh.position.set(0.02, 0, z > 0 ? -0.015 : 0.015);
      w.add(mesh);
      const tip = shapeExtrude([[-0.20, 0.085], [-0.34, -0.01], [-0.33, -0.06], [-0.19, -0.10]], 0.055, M.wingTip);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0.02, 0.002, z > 0 ? -0.015 : 0.015);
      w.add(tip);
      w.position.set(-0.04, 1.33, z * 0.86);
      w.rotation.y = (z > 0 ? -1 : 1) * 0.18;
      rider.add(w);
      this.wings.push(w);
    }

    // 腿（IK）
    this.legs = [];
    for (const z of [0.1, -0.1]) {
      const thigh = new Bone(this.bike, 0.043, M.leg);
      const shin = new Bone(this.bike, 0.033, M.leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.075), M.leg);
      foot.castShadow = true;
      this.bike.add(foot);
      this.legs.push({ thigh, shin, foot, z, hip: new THREE.Vector3(-0.08, 1.12, z) });
    }

    // 围巾结
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd42a3f, roughness: 0.85 }));
    knot.position.set(-0.03, 1.53, 0);
    knot.scale.set(1, 0.85, 1.1);
    rider.add(knot);
    this.knot = knot;
    this.scarfAnchorLocal = new THREE.Vector3(-0.04, 1.52, 0);
  }

  get scarfAnchorWorld() {
    return this.rider.localToWorld(this.scarfAnchorLocal.clone());
  }
  get billTipWorld() {
    return this.bill.localToWorld(new THREE.Vector3(0.7, 0.0, 0));
  }

  /** 足部 IK：两段骨 */
  _solveLeg(leg, footTarget) {
    const H = leg.hip;
    const L1 = 0.34, L2 = 0.36;
    _a.copy(footTarget).sub(H);
    let d = _a.length();
    const maxD = (L1 + L2) * 0.99;
    if (d > maxD) { _a.multiplyScalar(maxD / d); d = maxD; }
    if (d < 0.02) { _a.set(0.01, -0.01, 0); d = 0.02; }
    const cosA = clamp((L1 * L1 - L2 * L2 + d * d) / (2 * L1 * d), -1, 1);
    const a = Math.acos(cosA);
    // 在矢状面（xy）内旋转
    const base = Math.atan2(_a.y, _a.x);
    const kneeAng = base + a;
    const knee = new THREE.Vector3(H.x + Math.cos(kneeAng) * L1, H.y + Math.sin(kneeAng) * L1, H.z);
    leg.thigh.set(H, knee);
    leg.shin.set(knee, footTarget);
    leg.foot.position.copy(footTarget).add(new THREE.Vector3(0.035, -0.01, 0));
    leg.foot.rotation.z = 0;
  }

  /**
   * @param s { dt, speed, cadence, wheelie, jump, lean, bob }
   */
  update(dt, s) {
    const M = this.M;
    // 车轮
    const wr = 0.34;
    this.wheelAngle -= (s.speed / wr) * dt;
    this.wheels[0].rotation.z = this.wheelAngle;
    this.wheels[1].rotation.z = this.wheelAngle;
    // 前轮转向（轻微）
    this.wheels[1].rotation.y = damp(this.wheels[1].rotation.y, -s.lean * 0.16, 8, dt);

    // 曲柄
    this.crankAngle -= (s.cadence / 60) * TAU * dt;
    this.crank.rotation.z = this.crankAngle;

    // 抬前轮 + 侧倾
    const targetPitch = s.wheelie * 0.40;
    this.tilt.rotation.z = damp(this.tilt.rotation.z, targetPitch, 6, dt);
    this.tilt.rotation.x = damp(this.tilt.rotation.x, s.lean * 0.22, 7, dt);
    this.tilt.position.y = s.jump;

    // 身体起伏
    const bob = Math.sin(this.crankAngle * 2) * 0.012 * clamp(s.speed / 6, 0, 1);
    this.rider.position.y = bob;
    this.rider.rotation.z = Math.sin(this.crankAngle) * 0.02;

    // 脖子/头部：随速度前倾 + 上下微动
    const headT = clamp(s.speed / 22, 0, 1);
    this.rider.rotation.x = -headT * 0.07;
    this.head.rotation.x = Math.sin(this.crankAngle) * 0.035 + headT * 0.05;
    this.head.rotation.y = Math.sin(this.crankAngle * 0.5) * 0.04;

    // 腿：脚踏位置 → IK
    const pedalPos = [];
    for (let i = 0; i < 2; i++) {
      const ang = this.crankAngle + (i === 0 ? 0 : Math.PI);
      const px = this.BB.x + Math.cos(ang) * 0.17;
      const py = this.BB.y + Math.sin(ang) * 0.17;
      pedalPos.push(new THREE.Vector3(px, py, i === 0 ? 0.085 : -0.085));
    }
    for (let i = 0; i < 2; i++) {
      this.legs[i].hip.set(-0.08, 1.12 + bob, this.legs[i].z);
      this._solveLeg(this.legs[i], pedalPos[i]);
    }

    // 翅膀：展翅（抬前轮）时张开
    const wT = s.wheelie;
    this.wingPhase += dt * (6 + s.speed * 0.2);
    for (let i = 0; i < 2; i++) {
      const w = this.wings[i];
      const z = i === 0 ? 0.2 : -0.2;
      w.rotation.z = lerp(w.rotation.z, -wT * 0.95, clamp(dt * 6, 0, 1));
      w.rotation.y = lerp(w.rotation.y, (z > 0 ? -1 : 1) * (0.18 + wT * 0.85), clamp(dt * 6, 0, 1));
      w.rotation.x = lerp(w.rotation.x, Math.sin(this.wingPhase) * 0.14 * wT, clamp(dt * 8, 0, 1));
    }

    // 袋中鱼
    if (this.pouchFish > 0) {
      this.pouchFish -= dt;
      this.fishIn.visible = true;
      this.fishIn.rotation.z = Math.sin(this.timeAcc = (this.timeAcc || 0) + dt * 6) * 0.2;
    } else this.fishIn.visible = false;
  }

  /** 鱼入袋 */
  putFish() { this.pouchFish = 3.2; }
}
