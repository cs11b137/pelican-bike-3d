// ── 浏览器实时合成的音效与音乐（Web Audio，无外部音频文件）────
import { clamp, lerp, rand } from './utils.js';

const CHORDS = [
  { root: 146.83, notes: [220.00, 261.63, 349.23] }, // Dm
  { root: 116.54, notes: [174.61, 233.08, 293.66] }, // Bb
  { root: 174.61, notes: [261.63, 349.23, 440.00] }, // F
  { root: 130.81, notes: [196.00, 261.63, 329.63] }, // C
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.cadence = 0;
    this.beat = 0;
    this.chordIdx = 0;
    this.night = 0;
    this._crickTimer = 0;
  }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    if (ctx.state === 'suspended') await ctx.resume();

    // 主链路
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master.connect(comp); comp.connect(ctx.destination);

    // 空间感（简易延迟）
    this.delay = ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.26;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.3;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass'; this.delayFilter.frequency.value = 2200;
    this.delay.connect(this.delayFilter); this.delayFilter.connect(this.fb); this.fb.connect(this.delay);
    this.delayOut = ctx.createGain(); this.delayOut.gain.value = 0.42;
    this.delayFilter.connect(this.delayOut); this.delayOut.connect(this.master);

    // 噪声源
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;   // 粉噪化
      d[i] = last * 3.2;
    }
    this.noiseBuf = buf;

    // 海浪（两层：低频涌动 + 高频碎浪）
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0.0;
    this.surfGain.connect(this.master);
    this.surfLP = ctx.createBiquadFilter(); this.surfLP.type = 'lowpass'; this.surfLP.frequency.value = 480;
    this.surfLP.connect(this.surfGain);
    const s1 = ctx.createBufferSource(); s1.buffer = buf; s1.loop = true; s1.connect(this.surfLP); s1.start();
    this.surfBP = ctx.createBiquadFilter(); this.surfBP.type = 'bandpass'; this.surfBP.frequency.value = 1800; this.surfBP.Q.value = 0.7;
    this.washGain = ctx.createGain(); this.washGain.gain.value = 0;
    this.surfBP.connect(this.washGain); this.washGain.connect(this.master);
    const s2 = ctx.createBufferSource(); s2.buffer = buf; s2.loop = true; s2.connect(this.surfBP); s2.start();
    // 浪声起伏
    this.surfLFO = ctx.createOscillator(); this.surfLFO.frequency.value = 0.11;
    this.surfLFOGain = ctx.createGain(); this.surfLFOGain.gain.value = 0.35;
    this.surfLFO.connect(this.surfLFOGain); this.surfLFOGain.connect(this.surfGain.gain); this.surfLFO.start();

    // 风
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windGain.connect(this.master);
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 620; this.windBP.Q.value = 0.55;
    this.windBP.connect(this.windGain);
    const s3 = ctx.createBufferSource(); s3.buffer = buf; s3.loop = true; s3.connect(this.windBP); s3.start();

    // 夜虫
    this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
    this.cricketGain.connect(this.master);

    // 音乐总线
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master); this.musicGain.connect(this.delay);
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0;
    this.padGain.connect(this.master); this.padGain.connect(this.delay);
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900; this.padFilter.Q.value = 0.8;
    this.padFilter.connect(this.padGain);

    this.ready = true;
    this.setNight(0);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.now, 0.05);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  /** 环境声随速度与昼夜变化 */
  update(dt, s) {
    if (!this.ready) return;
    const t = this.now;
    const sp = clamp(s.speed / 30, 0, 1.6);
    this.windGain.gain.setTargetAtTime(0.02 + sp * sp * 0.26, t, 0.15);
    this.windBP.frequency.setTargetAtTime(420 + sp * 900, t, 0.2);
    this.surfGain.gain.setTargetAtTime(0.1 + 0.05 * (1 - sp), t, 0.5);
    this.washGain.gain.setTargetAtTime(0.02 + 0.05 * (1 - sp), t, 0.5);
    this.musicGain.gain.setTargetAtTime(s.running ? 0.42 : 0.12, t, 0.4);
    this.padFilter.frequency.setTargetAtTime(lerp(1400, 620, s.night), t, 1.2);
    this.setNight(s.night);
    // 夜虫
    this._crickTimer -= dt;
    if (this._crickTimer <= 0 && this.night > 0.35) {
      this._crickTimer = rand(0.25, 0.9);
      this.cricket();
    }
  }

  setNight(n) {
    this.night = n;
    if (!this.ready) return;
    this.cricketGain.gain.setTargetAtTime(n * 0.12, this.now, 0.6);
  }

  // ── 基础发声单元 ───────────────────────────────────────────
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, detune = 0, dest = null) {
    if (!this.ready) return;
    const t = this.now + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(dur, freq, q, vol, when = 0, dest = null, type = 'bandpass') {
    if (!this.ready) return;
    const t = this.now + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t); s.stop(t + dur + 0.05);
    return { f, g };
  }

  // ── 踏板节奏（同时驱动音乐节拍）──────────────────────────
  pedalTick(cadence) {
    if (!this.ready) return;
    const half = 60 / Math.max(30, cadence) / 2;
    // 机械踩踏声
    this.noiseBurst(0.05, 2600, 1.2, 0.10, 0, null, 'highpass');
    this.tone(rand(820, 980), 0.05, 'square', 0.035, 0);
    // 音乐：低音 + 琶音
    const ch = CHORDS[this.chordIdx % CHORDS.length];
    this.tone(ch.root / 2, 0.42, 'triangle', 0.16, 0);
    this.tone(ch.root * 2, 0.16, 'sine', 0.05, 0);
    const arp = ch.notes[(this.beat % 3)];
    this.tone(arp * 2, 0.18, 'square', 0.035, 0.005);
    this.tone(arp * 4, 0.12, 'sine', 0.018, 0.005);
    this.tone(arp * 2, 0.14, 'square', 0.028, half);
    if (this.beat % 4 === 0) {
      this.padChord(ch);
      this.chordIdx++;
    }
    this.beat++;
  }

  padChord(ch) {
    if (!this.ready) return;
    const t = this.now;
    ch.notes.forEach((n, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = n / 2;
      o.detune.value = (i - 1) * 7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g); g.connect(this.padFilter);
      o.start(t); o.stop(t + 2.8);
    });
  }

  // ── 事件音效 ───────────────────────────────────────────────
  catchFish() {
    if (!this.ready) return;
    this.noiseBurst(0.35, 900, 0.8, 0.30, 0, null, 'lowpass');
    this.noiseBurst(0.18, 3200, 1.5, 0.12, 0.02, null, 'highpass');
    [880, 1174, 1567].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.10, 0.04 + i * 0.06));
  }
  splash() { this.noiseBurst(0.28, 1400, 0.6, 0.10, 0, null, 'lowpass'); }
  jump() {
    this.noiseBurst(0.3, 900, 0.5, 0.13, 0, null, 'bandpass');
    this.tone(300, 0.2, 'sine', 0.08, 0);
    this.tone(600, 0.22, 'sine', 0.06, 0.06);
  }
  wheelie() {
    const n = this.noiseBurst(0.45, 700, 0.8, 0.16, 0, null, 'bandpass');
    if (n) n.f.frequency.exponentialRampToValueAtTime(2200, this.now + 0.4);
    this.tone(180, 0.3, 'sawtooth', 0.05, 0);
  }
  achievement() {
    if (!this.ready) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.42, 'triangle', 0.12, i * 0.085));
  }
  cricket() {
    if (!this.ready || this.night < 0.35) return;
    const f = rand(3900, 4600);
    for (let i = 0; i < 3; i++) {
      this.tone(f, 0.035, 'square', 0.05, i * 0.055, 0, this.cricketGain);
    }
  }
  lane() { this.noiseBurst(0.12, 1800, 1.0, 0.06, 0, null, 'bandpass'); }
}
