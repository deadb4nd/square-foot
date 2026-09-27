/* =========================================================================
   hero-glass.js — the light on the glass

   The hero is dark and it is the first thing anyone sees, so it has to earn
   the word "glass" rather than just tinting a rectangle blue. Two layers:

     1. a full-screen shader drawing slow caustic banding — the light you get
        when a sheet of glass sits in a window, done procedurally so it costs
        one quad and scales to any viewport
     2. a handful of real glass panes in 3D, drifting and turning, catching a
        travelling key light. Cheap materials, low transmission resolution, and
        the whole thing stops rendering the moment it leaves the screen.

   No textures, no video, no network. If WebGL is unavailable the hero simply
   falls back to the CSS backdrop underneath.
   ========================================================================= */

import * as THREE from 'three';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const weak = matchMedia('(max-width: 760px)').matches ||
             (navigator.hardwareConcurrency || 8) <= 4;

/* ------------------------------------------------------------- the backdrop */

const VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* Layered directional waves, sharpened and colour-graded to look like light
   bent through a textured sheet rather than a scrolling gradient. */
const FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uRes;
  uniform vec3  uDeep;
  uniform vec3  uMid;
  uniform vec3  uHi;
  uniform float uMouse;

  float band(vec2 p, float ang, float freq, float speed, float t){
    float a = ang;
    vec2 d = vec2(cos(a), sin(a));
    float w = sin((p.x*d.x + p.y*d.y) * freq + t*speed);
    return w;
  }

  void main(){
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
    float t = uTime * 0.055;

    /* three wave sets at different angles — this is what stops it reading as
       a single sine ramp and starts reading as interference */
    float w = band(p, 0.55, 6.2, 1.00, t) * 0.50
            + band(p, 1.35, 10.5, -0.72, t) * 0.32
            + band(p, 2.25, 17.0, 1.44, t) * 0.18;

    /* a slow diagonal drift so the field breathes rather than pulses */
    float drift = sin(uv.x*2.1 + t*0.6) * cos(uv.y*1.7 - t*0.45) * 0.35;
    w += drift;

    /* sharpen the crests into filaments */
    float caustic = pow(max(0.0, 0.5 + 0.5*w), 5.0);

    /* vertical grade: dark at the top, a little more light low down, so the
       headline always has something to sit on */
    float v = smoothstep(1.02, -0.10, uv.y);
    float base = mix(0.0, 1.0, v);

    /* a soft pool of light behind where the headline sits */
    float pool = exp(-length((uv - vec2(0.5 + uMouse*0.05, 0.56)) * vec2(1.5, 2.0)) * 2.1);

    vec3 col = mix(uDeep, uMid, base * 0.72 + pool * 0.36);
    col += uHi * caustic * (0.30 + pool * 0.55);

    /* faint diagonal edge highlights, like the arris of a cut sheet */
    float arris = smoothstep(0.985, 1.0, sin((uv.x*0.9 + uv.y) * 3.14159 * 2.0 + t*0.7) * 0.5 + 0.5);
    col += uHi * arris * 0.05;

    /* a very light grain stops the banding on cheap panels */
    float g = fract(sin(dot(uv*uRes + t, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ module */

export function createHeroGlass(canvas, { onFail } = {}) {
  if (reduceMotion || weak) { onFail?.(); return null; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false,
      powerPreference: 'low-power',
    });
  } catch { onFail?.(); return null; }
  if (!renderer.getContext()) { onFail?.(); return null; }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.28;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ---- backdrop quad, drawn in screen space ---- */
  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDeep: { value: new THREE.Color('#050e12') },
    uMid: { value: new THREE.Color('#0b2b2a') },
    uHi:  { value: new THREE.Color('#63e3bd') },
    uMouse: { value: 0 },
  };
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthWrite: false, depthTest: false })
  );
  bg.renderOrder = -1;
  scene.add(bg);

  /* ---- real panes, in a shallow perspective volume behind the quad ---- */
  /* the quad is drawn first with depthTest off, so the panes need a real
     camera in front of it: swap in a perspective camera for the pane pass by
     rendering panes into the same target with the quad hidden. Simpler and
     cheaper: draw the panes with their own tiny perspective camera. */
  const persp = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  persp.position.set(0, 0, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironmentLite(), 0.06);
  scene.environment = envRT.texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdff7f0, 0x041014, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x5fe0bb, 0.6);
  fill.position.set(-4, 1, 2);
  scene.add(fill);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff7f0, metalness: 0, roughness: 0.05,
    transmission: 0.92, thickness: 0.5, ior: 1.52,
    attenuationDistance: 2.4, attenuationColor: new THREE.Color(0x8fe6cc),
    clearcoat: 1, clearcoatRoughness: 0.04,
    envMapIntensity: 1.5, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8ff0d4, transparent: true, opacity: 0.5 });

  const PANES = 7;
  const panes = [];
  const paneGroup = new THREE.Group();
  scene.add(paneGroup);

  for (let i = 0; i < PANES; i++) {
    const w = 0.5 + (i % 3) * 0.42;
    const h = 1.5 + ((i + 1) % 3) * 0.7;
    const geo = new THREE.BoxGeometry(w, h, 0.02);
    const m = new THREE.Mesh(geo, glassMat);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    const g = new THREE.Group();
    g.add(m, e);
    g.position.set(
      ((i * 2.13) % 5.4) - 2.7,
      ((i * 1.77) % 3.2) - 1.6,
      -0.4 - i * 0.42
    );
    g.rotation.set((i % 2 ? 1 : -1) * 0.14, ((i * 0.7) % 1) - 0.4, ((i % 3) - 1) * 0.1);
    paneGroup.add(g);
    panes.push({ g, ph: i * 1.7, sp: 0.06 + (i % 4) * 0.022, ry: (i % 2 ? 1 : -1) * (0.04 + (i % 3) * 0.02) });
  }

  /* ------------------------------------------------------------- the loop */
  let raf = 0, running = false, visible = true, lastT = 0;
  const mx = { v: 0, t: 0 };
  let mxTarget = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.position.z = h > w ? 7.4 : 6;
    persp.updateProjectionMatrix();
    uniforms.uRes.value.set(w, h);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible || !running) return;
    const t = now / 1000;
    const dt = Math.min((now - lastT) / 1000 || 0, 0.05);
    lastT = now;

    /* ease the pointer offset so the parallax never snaps */
    mx.v += (mxTarget - mx.v) * Math.min(1, dt * 2.4);
    uniforms.uMouse.value = mx.v;
    uniforms.uTime.value = t;

    persp.position.x = mx.v * 0.55;
    persp.position.y = mx.v * 0.24;
    persp.lookAt(0, 0, 0);

    for (const p of panes) {
      p.g.rotation.y += p.ry * dt;
      p.g.position.y += Math.sin(t * p.sp + p.ph) * dt * 0.13;
      p.g.position.x += Math.cos(t * p.sp * 0.7 + p.ph) * dt * 0.07;
      /* keep them on a slow orbit so they never wander out of frame */
      p.g.position.y = Math.max(-2.2, Math.min(2.2, p.g.position.y));
      p.g.position.x = Math.max(-3.2, Math.min(3.2, p.g.position.x));
    }

    /* the quad is screen space, so render it with depth off; the panes need
       the perspective camera, so they are drawn in a second pass */
    bg.visible = false;
    renderer.render(scene, persp);
    bg.visible = true;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }

  function start() { if (!running) { running = true; lastT = performance.now(); frame(lastT); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) lastT = performance.now();
  }, { rootMargin: '150px' });
  io.observe(canvas);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  addEventListener('pointermove', (e) => {
    if (!visible) return;
    mxTarget = (e.clientX / innerWidth - 0.5) * 2;
  }, { passive: true });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { resize(); start(); }, false);

  resize();
  start();

  return {
    dispose() { stop(); io.disconnect(); ro.disconnect(); envRT.dispose(); renderer.dispose(); },
  };
}

/* -------------------------------------------------------------- environment
   A tiny stand-in for RoomEnvironment: two emissive boxes and a soft ground.
   Far cheaper to pre-filter than the full room and indistinguishable once it
   is only ever seen through frosted glass.
   -------------------------------------------------------------------------- */

class RoomEnvironmentLite extends THREE.Scene {
  constructor() {
    super();
    const box = new THREE.BoxGeometry();
    const mk = (color, intensity, sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: intensity,
        side: THREE.BackSide,
      }));
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      this.add(m);
    };
    mk(0xffffff, 3.2, 12, 0.1, 12, 0, 6, 0);      // ceiling light
    mk(0xbfe8dc, 1.1, 0.1, 8, 8, 6, 1, 0);        // side wall, cool
    mk(0x1a3a38, 0.6, 0.1, 8, 8, -6, 1, 0);       // side wall, dark
  }
}
