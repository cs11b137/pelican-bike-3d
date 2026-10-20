// ── 世界：天空 / 海洋 / 海岸 / 公路 / 道具 / 鱼群 ─────────────────
import * as THREE from 'three';
import { clamp, lerp, rand, randInt, smoothstep } from './utils.js';

const ROAD_LEN = 8000;      // 公路单段长度（8 km，周期可无缝回收）
const TILE = 25;            // 路面贴图周期（米）
const ROAD_HALF = 6.5;      // 路半宽
const LANES = [-4.2, 0, 4.2];
const SHORE_Z = -20;        // 水线
const SCROLL_ROAD = 8000;   // 公路回收步长

// ── 昼夜关键帧 ────────────────────────────────────────────────
const SKY_KEYS = [
  { p: 0.00, top: [0.07, 0.10, 0.32], hor: [1.00, 0.46, 0.16], sun: [1.00, 0.62, 0.30], amb: [0.52, 0.34, 0.30], night: 0.00 },
  { p: 0.10, top: [0.05, 0.08, 0.26], hor: [0.95, 0.30, 0.18], sun: [1.00, 0.45, 0.22], amb: [0.34, 0.24, 0.30], night: 0.18 },
  { p: 0.24, top: [0.02, 0.03, 0.14], hor: [0.28, 0.16, 0.34], sun: [0.40, 0.22, 0.32], amb: [0.13, 0.13, 0.24], night: 0.72 },
  { p: 0.42, top: [0.008, 0.012, 0.05], hor: [0.05, 0.07, 0.17], sun: [0.20, 0.26, 0.46], amb: [0.07, 0.09, 0.17], night: 1.00 },
  { p: 0.70, top: [0.012, 0.018, 0.07], hor: [0.10, 0.12, 0.26], sun: [0.26, 0.30, 0.50], amb: [0.10, 0.13, 0.22], night: 0.92 },
  { p: 0.88, top: [0.05, 0.06, 0.22], hor: [0.55, 0.24, 0.24], sun: [0.80, 0.40, 0.30], amb: [0.24, 0.20, 0.26], night: 0.45 },
  { p: 1.00, top: [0.10, 0.13, 0.34], hor: [1.00, 0.46, 0.16], sun: [1.00, 0.62, 0.30], amb: [0.52, 0.34, 0.30], night: 0.00 },
];

function sampleKeys(p) {
  p = ((p % 1) + 1) % 1;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (p >= SKY_KEYS[i].p && p <= SKY_KEYS[i + 1].p) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const t = smoothstep(a.p, b.p, p);
  const mix3 = (x, y) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return { top: mix3(a.top, b.top), hor: mix3(a.hor, b.hor), sun: mix3(a.sun, b.sun), amb: mix3(a.amb, b.amb), night: lerp(a.night, b.night, t) };
}

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    this.time = 0;
    this.phase = 0;
    this.night = 0;
    this.fog = new THREE.FogExp2(0x1a2035, 0.0029);
    scene.fog = this.fog;
    scene.background = null;

    this._buildSky();
    this._buildLights();
    this._buildRoad();
    this._buildBeach();
    this._buildOcean();
    this._buildProps();
    this._buildFish();
    this.setPhase(0);
  }

  // ── 天空穹顶（渐变 + 太阳 + 月亮 + 星空）────────────────────
  _buildSky() {
    const geo = new THREE.SphereGeometry(2600, 40, 24);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1a2244) },
        uHorizon: { value: new THREE.Color(0xff7a29) },
        uSunCol: { value: new THREE.Color(0xffb060) },
        uMoonCol: { value: new THREE.Color(0xcddcff) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.1, -0.9) },
        uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, 0.8) },
        uNight: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop,uHorizon,uSunCol,uMoonCol,uSunDir,uMoonDir;
        uniform float uNight,uTime;
        varying vec3 vDir;
        float hash13(vec3 p3){ p3=fract(p3*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
        float noise3(vec3 p){
          vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float n000=hash13(i),n100=hash13(i+vec3(1,0,0)),n010=hash13(i+vec3(0,1,0)),n110=hash13(i+vec3(1,1,0));
          float n001=hash13(i+vec3(0,0,1)),n101=hash13(i+vec3(1,0,1)),n011=hash13(i+vec3(0,1,1)),n111=hash13(i+vec3(1,1,1));
          return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
        }
        void main(){
          vec3 d=normalize(vDir);
          float h=clamp(d.y*0.5+0.5,0.0,1.0);
          vec3 col=mix(uHorizon,uTop,pow(smoothstep(0.47,0.92,h),0.85));
          // 地平线附近的太阳散射
          float sunAz=max(dot(normalize(vec3(d.x,0.0,d.z)),normalize(vec3(uSunDir.x,0.0,uSunDir.z))),0.0);
          col+=uSunCol*pow(sunAz,6.0)*smoothstep(0.30,-0.02,abs(d.y))*0.28*(1.0-uNight);
          // 太阳
          float sd=max(dot(d,uSunDir),0.0);
          col+=uSunCol*pow(sd,1600.0)*9.0;
          col+=uSunCol*pow(sd,22.0)*0.26*(1.0-uNight*0.8);
          // 月亮
          float md=max(dot(d,uMoonDir),0.0);
          float disc=smoothstep(0.99955,0.99985,md);
          float craters=0.70+0.30*noise3(d*320.0);
          col+=uMoonCol*disc*3.4*craters;
          col+=uMoonCol*pow(md,220.0)*0.55;
          // 星空
          if(uNight>0.02){
            vec3 acc=vec3(0.0);
            for(int i=0;i<3;i++){
              float sc=95.0+float(i)*145.0;
              vec3 sp=d*sc; vec3 ip=floor(sp); vec3 fp=fract(sp)-0.5;
              float hs=hash13(ip+float(i)*17.13);
              if(hs>0.962){
                float dd=length(fp);
                float tw=0.55+0.45*sin(uTime*(1.4+hs*5.0)+hs*40.0);
                acc+=vec3(0.88,0.93,1.0)*smoothstep(0.19,0.0,dd)*(hs-0.962)*42.0*tw;
              }
            }
            col+=acc*uNight*smoothstep(-0.04,0.30,d.y);
          }
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xffb066, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -46; cam.right = 46; cam.top = 46; cam.bottom = -46; cam.near = 1; cam.far = 240;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x3b3226, 0.6);
    this.scene.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0x6f8dff, 0.35);
    this.fill.position.set(-1, 0.6, 1);
    this.scene.add(this.fill);
  }

  // ── 路面 ───────────────────────────────────────────────────
  _buildRoad() {
    // 沥青 + 车道线贴图
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#26282e'; g.fillRect(0, 0, 512, 256);
    // 噪点
    const img = g.getImageData(0, 0, 512, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // 轻微补丁色块
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${40 + randInt(0, 22)},${40 + randInt(0, 22)},${46 + randInt(0, 22)},0.35)`;
      g.beginPath(); g.ellipse(rand(0, 512), rand(0, 256), rand(18, 70), rand(8, 34), rand(0, 3), 0, 7); g.fill();
    }
    const vOf = (z) => (ROAD_HALF - z) / (ROAD_HALF * 2); // 世界 z -> 贴图 v
    // 边缘实线
    g.fillStyle = '#e9edf2';
    g.fillRect(0, vOf(6.05) * 256 - 3, 512, 6);
    g.fillRect(0, vOf(-6.05) * 256 - 3, 512, 6);
    // 车道虚线
    g.fillStyle = '#e6e2d4';
    [2.1, -2.1].forEach((z) => {
      const y = vOf(z) * 256 - 3;
      for (let x = 0; x < 512; x += 64) g.fillRect(x, y, 40, 6);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ROAD_LEN / TILE, 1);
    tex.anisotropy = this.q.aniso || 4;
    this.roadTex = tex;

    const geo = new THREE.PlaneGeometry(ROAD_LEN, ROAD_HALF * 2, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 });
    this.road = new THREE.Mesh(geo, mat);
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.set(0, 0, 0);
    this.road.receiveShadow = true;
    this.scene.add(this.road);

    // 路肩草皮（内侧）
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const gx = gc.getContext('2d');
    gx.fillStyle = '#3d5a31'; gx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      gx.fillStyle = `rgba(${randInt(30, 90)},${randInt(60, 125)},${randInt(28, 70)},${rand(0.2, 0.7)})`;
      gx.fillRect(rand(0, 256), rand(0, 256), rand(2, 9), rand(2, 9));
    }
    for (let i = 0; i < 26; i++) {
      gx.fillStyle = `rgba(${randInt(120, 170)},${randInt(110, 150)},${randInt(80, 120)},${rand(0.15, 0.4)})`;
      gx.beginPath(); gx.ellipse(rand(0, 256), rand(0, 256), rand(8, 34), rand(5, 22), rand(0, 3), 0, 7); gx.fill();
    }
    const gtex = new THREE.CanvasTexture(gc);
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(ROAD_LEN / 14, 9);
    gtex.anisotropy = this.q.aniso || 4;
    this.grassTex = gtex;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LEN, 120),
      new THREE.MeshStandardMaterial({ map: gtex, color: 0xb9d0a8, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, ROAD_HALF + 60);
    grass.receiveShadow = true;
    this.grass = grass;
    this.scene.add(grass);
  }

  // ── 沙滩 ───────────────────────────────────────────────────
  _buildBeach() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c4a97e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = `rgba(${randInt(180, 235)},${randInt(155, 205)},${randInt(110, 160)},${rand(0.15, 0.5)})`;
      g.fillRect(rand(0, 256), rand(0, 256), rand(1, 3), rand(1, 3));
    }
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(150,125,90,${rand(0.05, 0.18)})`;
      g.lineWidth = rand(1, 3);
      g.beginPath(); g.moveTo(rand(0, 256), rand(0, 256));
      g.bezierCurveTo(rand(0, 256), rand(0, 256), rand(0, 256), rand(0, 256), rand(0, 256), rand(0, 256));
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ROAD_LEN / 6, 1);
    tex.anisotropy = this.q.aniso || 4;
    this.beachTex = tex;

    const geo = new THREE.PlaneGeometry(ROAD_LEN, 13.5, 1, 24);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);            // 局部 y -> 世界 -z
      const t = (y + 6.75) / 13.5;     // 0 = 海侧(z=-20) 1 = 路侧
      p.setZ(i, lerp(-1.35, 0.45, t * t * (3 - 2 * t)));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    this.beach = new THREE.Mesh(geo, mat);
    this.beach.rotation.x = -Math.PI / 2;
    this.beach.position.set(0, 0, -6.75 - 13.5 / 2 + 0.0);
    this.beach.receiveShadow = true;
    this.scene.add(this.beach);
  }

  // ── 海洋材质（Gerstner 波浪 + 菲涅尔 + 高光 + 泡沫）──────────
  _oceanMaterial(waveAmp) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveAmp: { value: waveAmp },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(0xffb060) },
        uDeep: { value: new THREE.Color(0x04203c) },
        uShallow: { value: new THREE.Color(0x1f8fa8) },
        uSkyTop: { value: new THREE.Color(0x1a2244) },
        uSkyHor: { value: new THREE.Color(0xff7a29) },
        uNight: { value: 0 },
        uFogColor: { value: new THREE.Color(0x1a2035) },
        uFogDensity: { value: 0.0029 },
        uShoreZ: { value: SHORE_Z },
      },
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uShoreZ; uniform float uWaveAmp;
        varying vec3 vW; varying vec3 vN; varying float vDepth; varying float vCrest;
        vec3 gerstner(vec2 p, vec2 dir, float steep, float wl, float spd, inout vec3 t, inout vec3 b){
          float k=6.2831853/wl; float c=sqrt(9.81/k);
          vec2 d=normalize(dir);
          float f=k*(dot(d,p)-c*spd*uTime);
          float a=steep/k;
          float sf=sin(f), cf=cos(f);
          t+=vec3(-d.x*d.x*steep*sf, d.x*steep*cf, 0.0);
          b+=vec3(-d.x*d.y*steep*sf, d.y*steep*cf, 0.0);
          return vec3(d.x*(a*cf), a*sf, d.y*(a*cf));
        }
        void main(){
          vec4 wp=modelMatrix*vec4(position,1.0);
          vec2 p=wp.xz;
          float atten=(1.0-smoothstep(0.0,620.0,abs(p.y-uShoreZ)))*uWaveAmp;
          vec3 t=vec3(1.0,0.0,0.0), b=vec3(0.0,0.0,1.0);
          vec3 d=vec3(0.0);
          d+=gerstner(p, vec2(1.0,0.25), 0.40*atten, 26.0, 1.0, t, b);
          d+=gerstner(p, vec2(0.9,-0.45), 0.30*atten, 17.0, 1.15, t, b);
          d+=gerstner(p, vec2(1.0,0.9),  0.20*atten, 11.0, 1.35, t, b);
          d+=gerstner(p, vec2(0.7,0.7),  0.13*atten, 6.5,  1.7,  t, b);
          vec3 pos=wp.xyz+d;
          vW=pos; vN=normalize(cross(b,t));
          vDepth=smoothstep(0.0,70.0,uShoreZ-p.y);
          vCrest=clamp(d.y*1.9+0.25,0.0,1.0);
          gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir,uMoonDir,uSunCol,uDeep,uShallow,uSkyTop,uSkyHor,uFogColor;
        uniform float uNight,uFogDensity,uTime;
        varying vec3 vW; varying vec3 vN; varying float vDepth; varying float vCrest;
        float hash12(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise2(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash12(i), b=hash12(i+vec2(1,0)), c=hash12(i+vec2(0,1)), d=hash12(i+vec2(1,1));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }
        void main(){
          vec3 V=normalize(cameraPosition-vW);
          vec3 N=normalize(vN);
          float fres=pow(1.0-max(dot(N,V),0.0),5.0);
          fres=clamp(fres*0.9+0.05,0.0,1.0);
          vec3 R=reflect(-V,N);
          vec3 sky=mix(uSkyHor,uSkyTop,clamp(R.y*0.9+0.25,0.0,1.0));
          vec3 base=mix(uShallow,uDeep,vDepth);
          vec3 col=mix(base,sky,fres*0.72);
          vec3 L=normalize(uSunDir);
          vec3 H=normalize(L+V);
          col+=uSunCol*pow(max(dot(N,H),0.0),180.0)*2.2*(1.0-uNight*0.75);
          vec3 M=normalize(uMoonDir);
          col+=vec3(0.70,0.80,1.0)*pow(max(dot(N,normalize(M+V)),0.0),340.0)*1.5*uNight;
          float glint=pow(max(dot(N,normalize(L+V)),0.0),900.0);
          col+=uSunCol*glint*4.0*(1.0-uNight*0.7);
          float shoreBand=1.0-smoothstep(0.0,9.0,abs(vW.z-(-20.0)));
          float fn=noise2(vW.xz*0.16+vec2(uTime*0.35,uTime*0.12));
          float foam=smoothstep(0.45,0.92,fn)*shoreBand*0.62 + smoothstep(0.68,1.0,vCrest)*0.30*vDepth;
          foam*=1.0-uNight*0.45;
          col=mix(col,vec3(0.93,0.96,1.0),clamp(foam,0.0,0.7));
          float dcam=length(cameraPosition-vW);
          float fog=1.0-exp(-uFogDensity*uFogDensity*dcam*dcam);
          col=mix(col,uFogColor,clamp(fog,0.0,1.0));
          gl_FragColor=vec4(col,1.0);
        }`,
    });
  }

  _buildOcean() {
    const seg = this.q.oceanSeg || 160;
    this.oceanMat = this._oceanMaterial(1.0);
    this.oceanFarMat = this._oceanMaterial(0.0);
    this.oceanMats = [this.oceanMat, this.oceanFarMat];
    const geo = new THREE.PlaneGeometry(1600, 900, seg, Math.round(seg * 0.6));
    this.ocean = new THREE.Mesh(geo, this.oceanMat);
    this.oceanSeg = seg;
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, 0, SHORE_Z - 450);
    this.ocean.renderOrder = 1;
    this.scene.add(this.ocean);

    // 远景海面（平面 + 天空反射，提供地平线）
    const farGeo = new THREE.PlaneGeometry(9000, 8200, 12, 12);
    this.oceanFar = new THREE.Mesh(farGeo, this.oceanFarMat);
    this.oceanFar.rotation.x = -Math.PI / 2;
    this.oceanFar.position.set(0, -0.4, SHORE_Z - 5000);
    this.oceanFar.renderOrder = 0;
    this.scene.add(this.oceanFar);

    // ── 碎浪带（近岸白沫）───────────────────────────────────
    const sgeo = new THREE.PlaneGeometry(1600, 26, 1, 1);
    this.surfMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uFogColor: { value: new THREE.Color(0x1a2035) }, uFogDensity: { value: 0.0029 },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: /* glsl */`
        uniform float uTime,uFogDensity; uniform vec3 uFogColor; varying vec2 vUv; varying vec3 vW;
        float hash12(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash12(i),b=hash12(i+vec2(1,0)),c=hash12(i+vec2(0,1)),d=hash12(i+vec2(1,1));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
        float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise2(p); p*=2.03; a*=0.5;} return v; }
        void main(){
          float shore=1.0-vUv.y;
          float wave=fbm(vec2(vW.x*0.055-uTime*0.55, vUv.y*2.0));
          float band=smoothstep(0.35,0.95,shore+wave*0.55);
          float foam=smoothstep(0.52,0.86,wave*0.7+band*0.55);
          float edge=smoothstep(0.0,0.35,shore);
          float a=foam*edge*0.62;
          float dcam=length(cameraPosition-vW);
          float fog=1.0-exp(-uFogDensity*uFogDensity*dcam*dcam);
          a*=1.0-fog;
          gl_FragColor=vec4(vec3(0.95,0.98,1.0),a);
        }`,
    });
    this.surf = new THREE.Mesh(sgeo, this.surfMat);
    this.surf.rotation.x = -Math.PI / 2;
    this.surf.position.set(0, 0.18, SHORE_Z - 13);
    this.surf.renderOrder = 2;
    this.scene.add(this.surf);
  }

  // ── 道具：护栏桩、路灯、棕榈、礁石 ─────────────────────────
  _buildProps() {
    this.props = new THREE.Group();
    this.scene.add(this.props);

    const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.15, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6, emissive: 0x333333, emissiveIntensity: 0.2 });
    this.posts = new THREE.InstancedMesh(postGeo, postMat, 90);
    this.posts.castShadow = true;
    this.bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.135, 0.135, 0.16, 6), bandMat, 90);
    this.props.add(this.posts, this.bands);

    // 路灯
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.7, metalness: 0.4 });
    this.lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.14, 7.4, 7), lampMat, 40);
    this.lampPole.castShadow = true;
    this.lampArm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.13, 0.13), lampMat, 40);
    this.lampHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffcf6a, emissiveIntensity: 0 }), 40);
    this.props.add(this.lampPole, this.lampArm, this.lampHead);

    // 棕榈树
    this.palms = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6b45, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b39, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 5.2, 6), trunkMat);
      tr.position.y = 2.6; tr.castShadow = true; g.add(tr);
      for (let f = 0; f < 9; f++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.30, 2.3, 4, 1, true), leafMat);
        const a = (f / 9) * Math.PI * 2 + rand(-0.2, 0.2);
        leaf.position.set(Math.cos(a) * 0.95, 5.45 - 0.35, Math.sin(a) * 0.95);
        leaf.rotation.set(Math.cos(a) * 1.05, -a, Math.sin(a) * 1.05);
        leaf.scale.set(1, 1, 0.45);
        leaf.castShadow = true;
        g.add(leaf);
      }
      g.position.set(i * 62, 0.2, -12 - rand(0, 4));
      g.rotation.y = rand(0, 6.28);
      g.scale.setScalar(rand(0.8, 1.2));
      this.palms.add(g);
    }
    this.scene.add(this.palms);

    // 远处沙丘
    this.dunes = new THREE.Group();
    const duneMat = new THREE.MeshStandardMaterial({ color: 0x6f6a4c, roughness: 1, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const d = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), duneMat);
      const w = rand(26, 60);
      d.scale.set(w, rand(7, 15), w * rand(0.6, 1.1));
      d.position.set(i * 120 + rand(-25, 25), rand(-2, 0), rand(70, 150));
      d.rotation.y = rand(0, 3);
      this.dunes.add(d);
    }
    this.scene.add(this.dunes);

    // 礁石
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5f63, roughness: 1, flatShading: true });
    this.rocks = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.5, 1.8), 0), rockMat);
      r.position.set(rand(-30, 340), rand(-0.3, 0.2), SHORE_Z - rand(0.5, 6));
      r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      r.castShadow = true;
      this.rocks.add(r);
    }
    this.scene.add(this.rocks);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  _setInst(mesh, i, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this._q.setFromEuler(new THREE.Euler(rx, ry, rz));
    this._v.set(x, y, z);
    this._s.set(sx, sy, sz);
    this._m.compose(this._v, this._q, this._s);
    mesh.setMatrixAt(i, this._m);
  }

  // ── 鱼 ─────────────────────────────────────────────────────
  _buildFish() {
    this.fishes = [];
    const bodyGeo = new THREE.SphereGeometry(0.42, 14, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9fb8cc, roughness: 0.35, metalness: 0.25 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xe8f2f8, roughness: 0.4 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x5f87a8, roughness: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, bodyMat); b.scale.set(1.7, 0.95, 0.62); g.add(b);
      const belly = new THREE.Mesh(bodyGeo, bellyMat); belly.scale.set(1.55, 0.5, 0.66); belly.position.y = -0.2; g.add(belly);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 3), finMat);
      tail.position.x = -0.9; tail.rotation.z = Math.PI / 2; g.add(tail);
      const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 3), finMat);
      dorsal.position.set(0, 0.42, 0); g.add(dorsal);
      g.scale.setScalar(1.05);
      g.castShadow = true;
      this.scene.add(g);
      this.fishes.push({
        g, state: 'idle', t: 0, x: 0, z: -40, home: -40, phase: rand(0, 6.28),
        startX: 0, startZ: 0, endX: 0, endZ: 0, caught: false, respawn: rand(2, 12), tail: tail,
      });
    }
    // 溅水环
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.4, 0.62, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(ringGeo, ringMat.clone());
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.scene.add(r);
      this.rings.push({ m: r, t: 0 });
    }
  }

  spawnRing(x, z) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true; r.m.position.set(x, 0.12, z); r.t = 0;
  }

  // ── 相位（昼夜）───────────────────────────────────────────
  setPhase(p) {
    this.phase = ((p % 1) + 1) % 1;
    const k = sampleKeys(this.phase);
    this.night = k.night;
    const u = this.skyMat.uniforms;
    u.uTop.value.setRGB(k.top[0], k.top[1], k.top[2]);
    u.uHorizon.value.setRGB(k.hor[0], k.hor[1], k.hor[2]);
    u.uSunCol.value.setRGB(k.sun[0], k.sun[1], k.sun[2]);
    u.uNight.value = k.night;

    // 太阳 / 月亮方向
    const sunAlt = -0.34 + 0.46 * Math.cos(this.phase * Math.PI * 2);
    const moonAlt = -0.30 - 0.48 * Math.cos(this.phase * Math.PI * 2);
    const sdir = new THREE.Vector3(0.34, sunAlt, -0.94).normalize();
    const mdir = new THREE.Vector3(-0.62, moonAlt, -0.72).normalize();
    u.uSunDir.value.copy(sdir);
    u.uMoonDir.value.copy(mdir);
    this.sunDir = sdir; this.moonDir = mdir;

    // 光照
    const dayF = clamp(sunAlt * 3 + 0.55, 0, 1);
    this.sun.color.setRGB(
      lerp(0.55, k.sun[0], dayF), lerp(0.62, k.sun[1], dayF), lerp(0.95, k.sun[2], dayF)
    );
    this.sun.intensity = lerp(0.62, 2.1, dayF);
    this.sun.color.setRGB(lerp(0.62, k.sun[0], dayF), lerp(0.72, k.sun[1], dayF), lerp(1.0, k.sun[2], dayF));
    this.hemi.intensity = lerp(0.34, 0.8, 1 - k.night) + 0.18;
    this.hemi.color.setRGB(lerp(0.30, 0.62, 1 - k.night), lerp(0.40, 0.77, 1 - k.night), lerp(0.75, 1.0, 1 - k.night));
    this.hemi.groundColor.setRGB(0.20, 0.18, 0.14);
    this.fill.intensity = lerp(0.30, 0.4, 1 - k.night);
    this.fill.color.setRGB(0.45, 0.58, 0.95);

    // 雾 & 海面颜色
    const fogC = new THREE.Color(
      lerp(k.hor[0], k.top[0], 0.35), lerp(k.hor[1], k.top[1], 0.35), lerp(k.hor[2], k.top[2], 0.35)
    );
    this.fog.color.copy(fogC);
    for (const m of this.oceanMats) m.uniforms.uFogColor.value.copy(fogC);
    this.surfMat.uniforms.uFogColor.value.copy(fogC);
    for (const m of this.oceanMats) {
      m.uniforms.uNight.value = k.night;
      m.uniforms.uSunCol.value.setRGB(k.sun[0], k.sun[1], k.sun[2]);
      m.uniforms.uSkyTop.value.setRGB(k.top[0], k.top[1], k.top[2]);
      m.uniforms.uSkyHor.value.setRGB(k.hor[0], k.hor[1], k.hor[2]);
      m.uniforms.uDeep.value.setRGB(lerp(0.010, 0.016, k.night), lerp(0.065, 0.085, k.night), lerp(0.13, 0.20, k.night));
      m.uniforms.uShallow.value.setRGB(lerp(0.05, 0.06, k.night), lerp(0.26, 0.24, k.night), lerp(0.33, 0.36, k.night));
    }
    this.lampHead.material.emissiveIntensity = k.night * 2.2;
    this.bands.material.emissiveIntensity = 0.2 + k.night * 1.4;
  }

  setQuality(q) {
    this.q = q;
    if (this.roadTex) this.roadTex.anisotropy = q.aniso || 4;
    if (this.beachTex) this.beachTex.anisotropy = q.aniso || 4;
    if (this.sun.shadow.mapSize.width !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.sun.castShadow = q.shadows;
    // 海面细分随画质重建
    if (this.ocean && this.oceanSeg !== q.oceanSeg) {
      this.oceanSeg = q.oceanSeg;
      const seg = q.oceanSeg;
      const geo = new THREE.PlaneGeometry(1600, 900, seg, Math.round(seg * 0.6));
      this.ocean.geometry.dispose();
      this.ocean.geometry = geo;
    }
  }

  /**
   * @param ctx { dt, time, bikeX, bikeZ, speed, lane }
   * @returns 捕捉事件 {type:'catch', x} 或 null
   */
  update(dt, ctx) {
    this.time += ctx.dt;
    this.skyMat.uniforms.uTime.value = this.time;
    for (const m of this.oceanMats) m.uniforms.uTime.value = this.time;
    this.surfMat.uniforms.uTime.value = this.time;
    for (const m of this.oceanMats) {
      m.uniforms.uSunDir.value.copy(this.sunDir);
      m.uniforms.uMoonDir.value.copy(this.moonDir);
    }

    // 天空跟随相机
    this.sky.position.set(ctx.camX, ctx.camY, ctx.camZ);

    // 太阳/月亮光源跟随
    const lightTarget = this.night > 0.5 ? this.moonDir : this.sunDir;
    this.sun.position.set(ctx.bikeX + lightTarget.x * 90, lightTarget.y * 90 + 30, ctx.bikeZ + lightTarget.z * 90);
    this.sun.target.position.set(ctx.bikeX, 0, ctx.bikeZ);
    this.sun.target.updateMatrixWorld();

    // 公路 / 沙滩 / 草皮 循环回收
    const shift = ROAD_LEN;
    if (ctx.bikeX > this.road.position.x + shift * 0.5) {
      this.road.position.x += shift;
      this.beach.position.x += shift;
      this.grass.position.x += shift;
    }
    this.roadTex.offset.x = (((this.road.position.x % TILE) + TILE) % TILE) / TILE;
    if (this.grassTex) this.grassTex.offset.x = (((this.grass.position.x % 14) + 14) % 14) / 14;
    this.beachTex.offset.x = (((this.beach.position.x % 6) + 6) % 6) / 6;

    // 道具：跟随玩家滚动（跑道式循环）
    const postSpacing = 12, postN = 90;
    for (let i = 0; i < postN; i++) {
      let x = i * postSpacing - (ctx.bikeX % postSpacing);
      const z = -7.4;
      this._setInst(this.posts, i, x, 0.55, z);
      this._setInst(this.bands, i, x, 0.95, z);
    }
    this.posts.instanceMatrix.needsUpdate = true;
    this.bands.instanceMatrix.needsUpdate = true;

    const lampSpacing = 58, lampN = 40;
    for (let i = 0; i < lampN; i++) {
      let x = i * lampSpacing - (ctx.bikeX % lampSpacing);
      this._setInst(this.lampPole, i, x, 3.7, 7.6);
      this._setInst(this.lampArm, i, x - 0.85, 7.3, 7.0, 0, 0, 0.32);
      this._setInst(this.lampHead, i, x - 1.6, 7.15, 6.75);
    }
    this.lampPole.instanceMatrix.needsUpdate = true;
    this.lampArm.instanceMatrix.needsUpdate = true;
    this.lampHead.instanceMatrix.needsUpdate = true;

    // 棕榈 / 礁石 循环（跑道式：随玩家滚动，间距=回绕周期）
    this.palms.position.x = -((ctx.bikeX % 62) + 62) % 62;
    this.rocks.position.x = -((ctx.bikeX % 60) + 60) % 60;
    this.dunes.position.x = -((ctx.bikeX % 120) + 120) % 120;

    // 海洋跟随
    this.ocean.position.x = ctx.bikeX;
    this.oceanFar.position.x = ctx.bikeX;
    this.surf.position.x = ctx.bikeX;

    // ── 鱼的逻辑 ───────────────────────────────────────────
    let event = null;
    for (const f of this.fishes) {
      if (f.state === 'idle') {
        f.respawn -= dt;
        if (f.respawn <= 0) {
          f.state = 'swim';
          f.t = 0;
          f.x = ctx.bikeX + rand(140, 420);
          f.z = SHORE_Z - rand(6, 26);
          f.home = f.z;
        } else {
          f.g.visible = false;
          continue;
        }
      }
      if (f.state === 'swim') {
        f.t += dt;
        f.g.visible = f.t < 4.6;
        f.x -= dt * 1.2;
        f.z = f.home + Math.sin(f.t * 0.9 + f.phase) * 3.2;
        f.g.position.set(f.x, -0.12 + Math.sin(f.t * 2.2) * 0.08, f.z);
        f.g.rotation.y = Math.PI / 2;
        f.g.rotation.z = Math.sin(f.t * 6) * 0.12;
        f.tail.rotation.x = Math.sin(f.t * 14) * 0.5;
        if (f.t >= 4.6) {
          // 跃出水面
          f.state = 'leap'; f.t = 0;
          f.startX = f.x; f.startZ = SHORE_Z - 9;
          f.endX = f.x + rand(-1.5, 1.5); f.endZ = -10.5;
          this.spawnRing(f.x, f.startZ);
          f.g.visible = true;
        }
      } else if (f.state === 'leap') {
        f.t += dt;
        const dur = 2.0;
        const u = clamp(f.t / dur, 0, 1);
        const x = lerp(f.startX, f.endX, u);
        const z = lerp(f.startZ, f.endZ, u);
        const y = Math.sin(Math.PI * u) * 5.2 - 0.2;
        f.g.position.set(x, y, z);
        f.g.rotation.z = Math.cos(Math.PI * u) * -1.25;
        f.tail.rotation.x = Math.sin(f.t * 22) * 0.7;
        // 判定捕获
        if (u > 0.18 && u < 0.92 && Math.abs(x - ctx.bikeX) < 3.4 && ctx.bikeZ < -1.6 && z > -17) {
          f.state = 'caught'; f.t = 0;
          event = { type: 'catch', x, y };
        }
        if (u >= 1) {
          f.state = 'idle'; f.respawn = rand(1.5, 6); f.g.visible = false;
          this.spawnRing(f.x, f.endZ);
        }
      } else if (f.state === 'caught') {
        f.t += dt;
        f.g.position.lerp(ctx.billPos, clamp(dt * 6, 0, 1));
        f.g.scale.setScalar(Math.max(0.01, 1 - f.t * 0.9));
        if (f.t > 0.35) { f.state = 'idle'; f.respawn = rand(2, 8); f.g.visible = false; }
      }
    }

    // 溅水环
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const s = 1 + r.t * 6;
      r.m.scale.set(s, s, 1);
      r.m.material.opacity = Math.max(0, 0.55 - r.t * 0.5);
      if (r.t > 1.1) r.m.visible = false;
    }

    return event;
  }

  /** 最近的可捕获鱼（供自动驾驶使用） */
  nearestFish(bikeX) {
    let best = null, bd = 1e9;
    for (const f of this.fishes) {
      if (f.state !== 'swim' && f.state !== 'leap') continue;
      const d = f.x - bikeX;
      if (d > 20 || d < -30) continue;
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = f; }
    }
    return best;
  }
}

export { LANES, SHORE_Z };
