// ── 14 个成就 ────────────────────────────────────────────────
export const ACHIEVEMENTS = [
  { id: 'first',   icon: '鱼', name: '第一尾鱼',     desc: '捕获第一尾跃出海面的鱼' },
  { id: 'fast',    icon: '风', name: '疾风海岸',     desc: '速度突破 60 km/h' },
  { id: 'jump',    icon: '跃', name: '海鸥起飞',     desc: '按空格跃起一次' },
  { id: 'wheelie', icon: '翼', name: '展翅抬轮',     desc: '按 T 抬起前轮保持 1 秒' },
  { id: 'fish10',  icon: '钓', name: '小有所获',     desc: '累计捕获 10 尾鱼' },
  { id: 'fish25',  icon: '鱼', name: '满载而归',     desc: '累计捕获 25 尾鱼' },
  { id: 'combo3',  icon: '连', name: '三连命中',     desc: '连续捕获 3 尾鱼不失误' },
  { id: 'dusk',    icon: '昏', name: '黄昏出发',     desc: '在黄昏时段骑行 20 秒' },
  { id: 'night',   icon: '夜', name: '星夜巡航',     desc: '在月夜时段骑行 20 秒' },
  { id: 'km1',     icon: '程', name: '海岸一公里',   desc: '累计骑行 1 公里' },
  { id: 'km5',     icon: '径', name: '海岸五公里',   desc: '累计骑行 5 公里' },
  { id: 'camAll',  icon: '镜', name: '全视角大师',   desc: '体验全部 5 种镜头' },
  { id: 'scarf',   icon: '巾', name: '围巾专家',     desc: '在 80 km/h 下让围巾飘起来' },
  { id: 'auto',    icon: '驾', name: '自动驾驶',     desc: '使用自动驾驶跑完 1 公里' },
];

export class AchievementManager {
  constructor(onUnlock) {
    this.list = ACHIEVEMENTS;
    this.onUnlock = onUnlock;
    this.unlocked = new Set();
    this.seen = new Set();
    this.state = {
      fish: 0, combo: 0, bestCombo: 0, dist: 0, autoDist: 0,
      maxSpeed: 0, jumped: false, wheelieTime: 0, duskTime: 0, nightTime: 0,
      cams: new Set(), scarfFast: false,
    };
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem('pelicanRide.ach');
      if (raw) {
        const d = JSON.parse(raw);
        (d.unlocked || []).forEach((id) => this.unlocked.add(id));
      }
    } catch (e) { /* 忽略隐私模式错误 */ }
  }
  save() {
    try {
      localStorage.setItem('pelicanRide.ach', JSON.stringify({ unlocked: [...this.unlocked] }));
    } catch (e) { /* ignore */ }
  }
  has(id) { return this.unlocked.has(id); }
  unlock(id) {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    this.save();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a && this.onUnlock) this.onUnlock(a);
    return true;
  }
  /** 每帧调用，检查条件 */
  evaluate(g) {
    const s = this.state;
    s.fish = g.fish;
    s.dist = g.distance;
    s.maxSpeed = Math.max(s.maxSpeed, g.speedKmh);
    s.cams.add(g.cameraMode);
    if (g.autoDriving) s.autoDist += g.speed * g.dt;
    else s.autoDist = Math.max(0, s.autoDist);

    if (g.fish >= 1) this.unlock('first');
    if (g.fish >= 10) this.unlock('fish10');
    if (g.fish >= 25) this.unlock('fish25');
    if (g.speedKmh > 60) this.unlock('fast');
    if (g.jumpCount > 0) this.unlock('jump');
    if (g.wheelieTime > 1) this.unlock('wheelie');
    if (g.combo >= 3) this.unlock('combo3');
    if (s.duskTime > 20) this.unlock('dusk');
    if (s.nightTime > 20) this.unlock('night');
    if (s.dist > 1000) this.unlock('km1');
    if (s.dist > 5000) this.unlock('km5');
    if (s.cams.size >= 5) this.unlock('camAll');
    if (g.speedKmh > 80 && g.scarfLift > 0.5) { s.scarfFast = true; this.unlock('scarf'); }
    if (s.autoDist > 1000) this.unlock('auto');
  }
  count() { return this.unlocked.size; }
}
