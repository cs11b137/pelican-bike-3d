// ── 按帧率自适应的画质分级 ─────────────────────────────────────
export const TIERS = [
  { name: '省电',  pixelRatio: 0.60, shadows: false, shadowSize: 512,  bloom: false, oceanSeg: 48,  clothIter: 2, starOct: 1, surfSeg: 24, aniso: 1 },
  { name: '流畅',  pixelRatio: 0.85, shadows: true,  shadowSize: 1024, bloom: false, oceanSeg: 96,  clothIter: 3, starOct: 2, surfSeg: 48, aniso: 4 },
  { name: '高',    pixelRatio: 1.00, shadows: true,  shadowSize: 2048, bloom: true,  oceanSeg: 160, clothIter: 5, starOct: 3, surfSeg: 72, aniso: 8 },
  { name: '极致',  pixelRatio: 2.00, shadows: true,  shadowSize: 2048, bloom: true,  oceanSeg: 240, clothIter: 7, starOct: 3, surfSeg: 96, aniso: 16 },
];

export class QualityManager {
  constructor(startTier, onChange) {
    this.tier = startTier;
    this.onChange = onChange;
    this.samples = [];
    this.acc = 0;
    this.count = 0;
    this.cooldown = 3;
    this.locked = false;
    this.fps = 60;
  }
  get settings() { return TIERS[this.tier]; }
  setTier(t, force = false) {
    t = Math.max(0, Math.min(TIERS.length - 1, t));
    if (t === this.tier) return;
    this.tier = t;
    this.cooldown = 4;
    if (this.onChange) this.onChange(TIERS[t], t);
  }
  /** 每帧喂入 dt，返回当前 fps */
  update(dt) {
    this.acc += dt; this.count++;
    if (this.acc >= 0.5) {
      const fps = this.count / this.acc;
      this.fps = fps;
      this.acc = 0; this.count = 0;
      this.samples.push(fps);
      if (this.samples.length > 6) this.samples.shift();
      if (!this.locked && this.cooldown <= 0 && this.samples.length >= 3) {
        const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
        if (avg < 42 && this.tier > 0) { this.setTier(this.tier - 1); this.upStreak = 0; }
        else if (avg > 58 && this.tier < TIERS.length - 1) {
          this.upStreak = (this.upStreak || 0) + 1;
          if (this.upStreak >= 4) { this.setTier(this.tier + 1); this.upStreak = 0; }
        } else this.upStreak = 0;
      }
    }
    if (this.cooldown > 0) this.cooldown -= dt;
    return this.fps;
  }
}
