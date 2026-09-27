/* =========================================================================
   COUNTER — 3D enclosure preview
   A frameless glass shower built live from the same job record that prices
   the quote. Real units (metres), real glass, real hardware finish, plus the
   dimension callouts a glazier would draw on the shop drawing.
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THICKNESS, FINISH, HARDWARE, LAYOUTS, DOORS } from './quote.js';

const IN = 0.0254;
const ACC = 0x5ff3dc;

const isTouch = matchMedia('(hover: none)').matches;
const small = matchMedia('(max-width: 900px)').matches;
const weak = small || isTouch || (navigator.hardwareConcurrency || 8) <= 4;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------- textures

   Glass is only visible when there is something bright behind it. Real glass
   photography is shot against a lit card, so the backdrop here is a soft
   vertical gradient (bright low, dark high) with a faint tile grid on top —
   unlit, so the tint of the glass always has something to read against.
   ------------------------------------------------------------------------ */

function wallTexture({ bright = 1, tiles = 4 } = {}) {
  const w = 256, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  /* A bright band sits at eye level behind the glass — the same reason a
     photographer puts a light card behind a shower door. Dark above and below
     so the floor never out-glows the product. */
  const grd = g.createLinearGradient(0, 0, 0, h);
  const top = mix([163, 173, 181], bright);
  const upper = mix([199, 208, 215], bright);
  const band = mix([231, 236, 240], bright);
  const lower = mix([193, 201, 208], bright);
  const bot = mix([158, 167, 175], bright);
  grd.addColorStop(0, css(top));
  grd.addColorStop(0.30, css(upper));
  grd.addColorStop(0.58, css(band));
  grd.addColorStop(0.74, css(lower));
  grd.addColorStop(1, css(bot));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);

  /* tile grout — subtle, keeps the wall from looking like a CSS gradient */
  const th = h / tiles, tw = w / tiles;
  g.lineWidth = 1.5;
  for (let i = 0; i <= tiles; i++) {
    g.strokeStyle = `rgba(96,110,122,${0.22 * bright})`;
    g.beginPath(); g.moveTo(0, i * th); g.lineTo(w, i * th); g.stroke();
    g.beginPath(); g.moveTo(i * tw, 0); g.lineTo(i * tw, h); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.5 * bright})`;
    g.beginPath(); g.moveTo(0, i * th + 1.5); g.lineTo(w, i * th + 1.5); g.stroke();
  }
  /* a few tiles slightly off-tone */
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '150,163,173'},${Math.abs(Math.random() - 0.5) * 0.09 * bright})`;
      g.fillRect(x * tw + 2, y * th + 2, tw - 4, th - 4);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const mix = (rgb, k) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

function labelSprite(text, color = '#0D4E6B', scale = 0.3) {
  const pad = 18, fs = 46;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `700 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = fs + pad * 2;
  const g = c.getContext('2d');
  g.font = `700 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((c.width / c.height) * scale, scale, 1);
  s.renderOrder = 20;
  return s;
}

function dimLine(pts, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65, depthTest: false });
  const l = new THREE.Line(geo, mat);
  l.renderOrder = 19;
  return l;
}

/* ------------------------------------------------------------- the scene */

export function createScene(canvas, { onFail } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !weak, alpha: true,
      // ?capture keeps the buffer readable so headless screenshot tests can
      // grab pixels; off by default because it costs a copy every frame.
      preserveDrawingBuffer: typeof location !== 'undefined' && location.search.includes('capture'),
      powerPreference: weak ? 'low-power' : 'high-performance',
    });
  } catch { onFail?.(); return null; }
  if (!renderer.getContext()) { onFail?.(); return null; }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, weak ? 1.5 : 2));
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = weak ? 0.3 : 0.75;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  /* white-cyclorama studio: the canvas sits on a white page, so the render
     has to read as a light product shot rather than a dark room */
  scene.background = new THREE.Color(0xeef1f3);
  scene.fog = new THREE.Fog(0xeef1f3, 7, 19);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(3.1, 2.0, 3.6);

  /* environment for believable glass + metal */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 1.7;
  controls.maxDistance = 8;
  controls.minPolarAngle = 0.42;
  controls.maxPolarAngle = 1.53;
  controls.autoRotate = !reduceMotion && !isTouch;
  controls.autoRotateSpeed = 0.42;

  let idleTimer = 0;
  let touched = false;
  controls.addEventListener('start', () => { touched = true; controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => {
    if (reduceMotion || isTouch) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!touched || true) controls.autoRotate = true; }, 4200);
  });

  /* ------------------------------------------------------------- lights */
  scene.add(new THREE.HemisphereLight(0xf4f8fb, 0xb9c2c9, 0.82));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(3.2, 5.2, 3.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6eef6, 0.62);
  fill.position.set(-3.5, 2.2, 2.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbcd4e4, 0.38);
  rim.position.set(0.4, 1.2, -4.0);
  scene.add(rim);
  const strip = new THREE.PointLight(0xffffff, 5, 7, 2);
  strip.position.set(0.2, 2.62, 0.35);
  scene.add(strip);

  /* ---------------------------------------------------------- materials */
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe0dc,
    metalness: 0,
    roughness: 0.03,
    transmission: 0.94,
    thickness: 0.17,
    attenuationDistance: 3.2,
    attenuationColor: new THREE.Color(0xbfe0dc),
    ior: 1.52,
    clearcoat: 0.5,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.4,
    specularIntensity: 1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0d4e6b, transparent: true, opacity: 0.45 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8ec, metalness: 1, roughness: 0.08, envMapIntensity: 1.6 });
  const sealMat = new THREE.MeshStandardMaterial({ color: 0x6b747b, metalness: 0.1, roughness: 0.75 });

  /* the lit backdrop — MeshBasic so it is unaffected by scene lighting and
     the glass tint always has a stable reference to read against */
  const backTex = wallTexture({ bright: 1 });
  const sideTex = wallTexture({ bright: 0.86, tiles: 3 });
  const wallMat = new THREE.MeshBasicMaterial({ map: backTex });
  const wallMatSide = new THREE.MeshBasicMaterial({ map: sideTex });

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.3, metalness: 0.12, envMapIntensity: 0.75 });
  const panMat = new THREE.MeshStandardMaterial({ color: 0xd6dce1, roughness: 0.44, metalness: 0.06 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xe4e9ee, roughness: 0.3, metalness: 0.05 });

  /* -------------------------------------------------------------- static */
  const stat = new THREE.Group();
  scene.add(stat);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(11, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.005, 0);
  stat.add(floor);

  const dyn = new THREE.Group();
  scene.add(dyn);

  /* ------------------------------------------------------------- helpers */
  function clearDyn() {
    for (const o of [...dyn.children]) {
      dyn.remove(o);
      o.traverse?.((n) => {
        if (n.geometry) n.geometry.dispose();
        const m = n.material;
        if (m && m.isSpriteMaterial) { m.map?.dispose(); m.dispose(); }
      });
    }
  }

  function wall(w, h, mat, pos, rotY) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    return m;
  }

  function glassPanel(w, h, t, pos, rotY) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), glassMat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    m.renderOrder = 2;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat);
    e.position.copy(m.position);
    e.rotation.copy(m.rotation);
    e.renderOrder = 3;
    g.add(m, e);
    g.userData.mesh = m;
    return g;
  }

  function metalBox(w, h, d, pos) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    return m;
  }

  function cyl(r, h, pos, axis = 'y') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, weak ? 12 : 20), metalMat);
    m.position.set(...pos);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  }

  /* --------------------------------------------------------- build state */
  let built = null;
  let state = null;
  let lastFitKey = null;

  /* The subject is portrait (a 2 m tall panel) inside a landscape canvas, so
     any hand-tuned distance crops the top or bottom on some layout/aspect
     combo. Solve for the exact distance that fits the enclosure corners
     inside a 4% margin instead — works for every layout and viewport. */
  const _corner = new THREE.Vector3();
  const _look = new THREE.Matrix4();

  function fitDistance(min, max, target, dir, margin = 0.94) {
    const pts = [];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) pts.push(new THREE.Vector3(x, y, z));

    const test = (d) => {
      camera.position.copy(target).addScaledVector(dir, d);
      _look.lookAt(camera.position, target, camera.up);
      camera.quaternion.setFromRotationMatrix(_look);
      camera.updateMatrixWorld(true);
      for (const p of pts) {
        _corner.copy(p).project(camera);
        if (Math.abs(_corner.x) > margin || Math.abs(_corner.y) > margin) return false;
      }
      return true;
    };

    let lo = 0.25, hi = 14;
    if (test(lo)) return lo;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (test(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function build(state) {
    clearDyn();
    const L = LAYOUTS[state.layout];
    const T = THICKNESS[state.thickness];
    const F = FINISH[state.finish];
    const HW = HARDWARE[state.hardware];
    const D = L.door ? DOORS[state.door] : null;

    const W = state.width * IN;
    const H = state.height * IN;
    const t = Math.max(T.scene, 0.008);
    const corner = !!L.corner;
    const sideDepth = corner ? Math.max(0.30, W * 0.42) : 0.34;

    /* glass material follows the finish */
    glassMat.color.setHex(F.glass);
    glassMat.roughness = cheap ? Math.max(F.rough, 0.12) : F.rough;
    glassMat.transmission = cheap ? 0 : F.trans;
    glassMat.opacity = cheap ? 0.36 : 1;
    glassMat.transparent = cheap;
    glassMat.attenuationColor.setHex(F.glass);
    glassMat.attenuationDistance = F.atten;
    glassMat.thickness = F.trans < 0.7 ? 0.10 : 0.20;
    glassMat.clearcoat = cheap ? 0 : state.finish === 'mirror' ? 1 : 0.5;
    glassMat.needsUpdate = true;
    edgeMat.opacity = state.finish === 'frosted' ? 0.3 : 0.62;

    metalMat.color.setHex(HW.color);
    metalMat.roughness = HW.rough;
    metalMat.metalness = HW.metal;
    metalMat.needsUpdate = true;

    /* --- room shell --- */
    const backH = H + 0.62;
    dyn.add(wall(W + 1.0, backH, wallMat, [W / 2 - 0.05, backH / 2 - 0.02, -0.065], 0));
    dyn.add(wall(sideDepth + 0.5, backH, wallMatSide, [-0.065, backH / 2 - 0.02, sideDepth / 2 - 0.1], Math.PI / 2));

    /* a slim ceiling wash for an edge glint — not a lightbox */
    const stripLight = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.86, 0.018, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    stripLight.position.set(W / 2, H + 0.34, 0.16);
    dyn.add(stripLight);

    /* --- shower pan + curb --- */
    const panW = corner ? W + sideDepth : W;
    const panD = corner ? sideDepth + 0.02 : 0.34;

    /* soft contact shadow so the unit sits on the floor instead of floating */
    const shCanvas = document.createElement('canvas');
    shCanvas.width = shCanvas.height = 128;
    const sg = shCanvas.getContext('2d');
    const sgrad = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
    sgrad.addColorStop(0, 'rgba(60,72,84,0.42)');
    sgrad.addColorStop(0.55, 'rgba(60,72,84,0.16)');
    sgrad.addColorStop(1, 'rgba(60,72,84,0)');
    sg.fillStyle = sgrad;
    sg.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(panW * 1.9, Math.max(panD, 0.5) * 3.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCanvas), transparent: true, depthWrite: false })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(corner ? W / 2 - 0.02 : W / 2, 0.004, panD / 2);
    dyn.add(contact);

    const pan = new THREE.Mesh(new THREE.BoxGeometry(panW, 0.05, panD), panMat);
    pan.position.set(corner ? W / 2 - 0.02 : W / 2, 0.022, panD / 2);
    dyn.add(pan);
    const curbY = 0.047;
    const curbSpecs = corner
      ? [[W + 0.03, 0.03, 0.03, W / 2, curbY, 0.015], [0.03, 0.03, sideDepth, 0.015, curbY, sideDepth / 2]]
      : [[W + 0.03, 0.03, 0.03, W / 2, curbY, 0.015]];
    for (const [cw, ch, cd, cx, cy, cz] of curbSpecs) {
      dyn.add(metalBox(cw, ch, cd, [cx, cy, cz]));
    }

    /* --- room fixtures: the space around the glass has to read as a bathroom,
           otherwise the enclosure floats in an empty box. --- */
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd6db, metalness: 1, roughness: 0.16, envMapIntensity: 1.4 });
    const headX = W * 0.24;

    /* riser arm out of the back wall + rain head */
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 20), chromeMat);
    riser.rotation.x = Math.PI / 2;
    riser.position.set(headX, H * 0.86, 0.07);
    riser.castShadow = true;
    dyn.add(riser);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.026, 32), chromeMat);
    head.position.set(headX, H * 0.855, 0.205);
    head.castShadow = true;
    dyn.add(head);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 16), chromeMat);
    arm.position.set(headX, H * 0.855, 0.14);
    dyn.add(arm);

    /* valve plate + handle */
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.016, 24), chromeMat);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(headX, H * 0.40, 0.028);
    dyn.add(plate);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.09, 14), chromeMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(headX + 0.05, H * 0.40, 0.05);
    dyn.add(handle);

    /* recessed niche in the back wall */
    const nicheW = Math.min(0.46, W * 0.34), nicheH = 0.30;
    const nicheX = W * 0.70, nicheY = H * 0.62;
    const niche = new THREE.Mesh(
      new THREE.BoxGeometry(nicheW, nicheH, 0.055),
      new THREE.MeshStandardMaterial({ color: 0xc3cbd2, roughness: 0.72, metalness: 0.04 })
    );
    niche.position.set(nicheX, nicheY, -0.035);
    dyn.add(niche);
    const nicheLip = new THREE.Mesh(new THREE.BoxGeometry(nicheW + 0.03, nicheH + 0.03, 0.012), chromeMat);
    nicheLip.position.set(nicheX, nicheY, -0.062);
    dyn.add(nicheLip);
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.024, 0.11, 14),
      new THREE.MeshStandardMaterial({ color: 0x0d4e6b, roughness: 0.35, metalness: 0.1 })
    );
    bottle.position.set(nicheX - nicheW * 0.22, nicheY - nicheH / 2 + 0.055, -0.03);
    dyn.add(bottle);

    /* linear floor drain */
    const drain = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.5, W * 0.4), 0.008, 0.045),
      new THREE.MeshStandardMaterial({ color: 0xa8b2ba, metalness: 1, roughness: 0.24, envMapIntensity: 1.2 })
    );
    drain.position.set(W / 2, 0.006, panD - 0.06);
    dyn.add(drain);

    /* --- panels --- */
    const y = H / 2 + 0.05;
    const doors = [];

    if (L.open) {
      /* walk-in: one fixed panel, open to the right */
      const pw = W * 0.66;
      dyn.add(glassPanel(pw, H, t, [pw / 2, y, 0.006], 0));
      addFixedHardware(pw / 2 - 0.04, y, 0.006, H, t, state.addons?.bar);
    } else if (L.double) {
      const dw = W / 2;
      const a = glassPanel(dw, H, t, [dw / 2, y, 0.006], 0);
      const b = glassPanel(dw, H, t, [W - dw / 2, y, 0.006], 0);
      dyn.add(a, b);
      doors.push({ g: a, cx: dw / 2, w: dw, hinge: 'left', z: 0.006 });
      doors.push({ g: b, cx: W - dw / 2, w: dw, hinge: 'right', z: 0.006 });
      addFixedHardware(dw - 0.05, y, 0.006, H, t, false);
    } else if (corner) {
      /* neo-angle: fixed wing on the back wall, door wing on the side wall */
      const fw = W * 0.62;
      const dw = sideDepth;
      dyn.add(glassPanel(fw, H, t, [fw / 2, y, 0.006], 0));
      dyn.add(glassPanel(dw, H, t, [0.006, y, dw / 2 + 0.02], Math.PI / 2));
      addFixedHardware(fw - 0.05, y, 0.006, H, t, false);
      doors.push({ g: null, cx: 0.006, cz: dw / 2 + 0.02, w: dw, hinge: 'far', z: 0.006, rotY: Math.PI / 2 });
      /* corner shoe */
      dyn.add(metalBox(0.05, H * 0.96, 0.05, [0.02, y, 0.02]));
    } else {
      /* alcove: fixed panel + door, both on the back wall */
      const dw = Math.max(0.66, Math.min(0.82, W * 0.42));
      const fw = W - dw;
      const fg = glassPanel(fw, H, t, [fw / 2, y, 0.006], 0);
      const dg = glassPanel(dw, H, t, [fw + dw / 2, y, 0.006], 0);
      dyn.add(fg, dg);
      addFixedHardware(fw - 0.05, y, 0.006, H, t, state.addons?.bar);
      doors.push({ g: dg, cx: fw + dw / 2, w: dw, hinge: 'left', z: 0.006 });
    }

    /* --- door hardware --- */
    for (const d of doors) addDoorHardware(d, H, t, D, state);

    /* --- dimension callouts --- */
    const zLine = panD + 0.16;
    dyn.add(dimLine([
      new THREE.Vector3(0, 0.02, zLine), new THREE.Vector3(W, 0.02, zLine),
      new THREE.Vector3(0, 0.02, zLine - 0.05), new THREE.Vector3(0, 0.02, zLine + 0.05),
      new THREE.Vector3(W, 0.02, zLine - 0.05), new THREE.Vector3(W, 0.02, zLine + 0.05),
    ], ACC));
    const lw = labelSprite(`${state.width}″ wide`);
    lw.position.set(W / 2, 0.16, zLine);
    dyn.add(lw);

    const xLine = W + 0.18;
    dyn.add(dimLine([
      new THREE.Vector3(xLine, 0.05, 0), new THREE.Vector3(xLine, H + 0.05, 0),
      new THREE.Vector3(xLine - 0.05, 0.05, 0), new THREE.Vector3(xLine + 0.05, 0.05, 0),
      new THREE.Vector3(xLine - 0.05, H + 0.05, 0), new THREE.Vector3(xLine + 0.05, H + 0.05, 0),
    ], ACC));
    const lh = labelSprite(`${state.height}″ high`);
    lh.position.set(xLine, H / 2 + 0.05, 0.16);
    dyn.add(lh);

    /* frame the shot — exact fit against the real enclosure bounds.
       fitDistance() parks the camera at a trial distance, so stash the live
       view first and only re-frame when the footprint actually changed
       (layout/width/height) — finish and hardware tweaks keep the orbit. */
    const cx = W / 2;
    const cz = corner ? sideDepth * 0.40 : 0.06;
    const target = new THREE.Vector3(cx - W * 0.04, H * 0.52, cz);
    const dir = new THREE.Vector3(0.58, 0.27, 0.77).normalize();
    const fitMin = new THREE.Vector3(-0.10, -0.04, -0.16);
    const fitMax = new THREE.Vector3(W + 0.10, H + 0.20, corner ? sideDepth + 0.34 : 0.44);

    const keptPos = camera.position.clone();
    const keptQuat = camera.quaternion.clone();
    const keptTarget = controls.target.clone();
    const camDist = fitDistance(fitMin, fitMax, target, dir);
    const fitKey = `${state.layout}|${state.width}|${state.height}`;

    if (!built || fitKey !== lastFitKey) {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, camDist);
      controls.minDistance = camDist * 0.55;
      controls.maxDistance = camDist * 1.9;
      lastFitKey = fitKey;
    } else {
      camera.position.copy(keptPos);
      camera.quaternion.copy(keptQuat);
      controls.target.copy(keptTarget);
    }
    controls.update();
    built = true;
  }

  function addFixedHardware(x, y, z, H, t, withBar) {
    dyn.add(metalBox(0.05, 0.11, t + 0.05, [x - 0.02, y + H / 2 - 0.16, z]));
    dyn.add(metalBox(0.05, 0.11, t + 0.05, [x - 0.02, y - H / 2 + 0.16, z]));
    if (withBar) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, H * 0.98, 12), metalMat);
      bar.position.set(x + 0.05, y, z);
      dyn.add(bar);
    }
  }

  function addDoorHardware(d, H, t, D, state) {
    const style = D?.label || 'Swing';
    const rotY = d.rotY || 0;
    const put = (mesh, alongX, alongY, zOff) => {
      if (rotY) {
        mesh.position.set(zOff, alongY, alongX);
        mesh.rotation.y = rotY;
      } else {
        mesh.position.set(alongX, alongY, zOff);
      }
      dyn.add(mesh);
      return mesh;
    };
    const half = d.w / 2;
    const hy1 = y_(H) / 2 + 0.05 - 0.20;
    const hy2 = -(y_(H) / 2 + 0.05) + 0.20;

    const hingeX = d.hinge === 'right' || d.hinge === 'far' ? d.cx + half - 0.02 : d.cx - half + 0.02;
    const pullX = d.hinge === 'right' || d.hinge === 'far' ? d.cx - half + 0.10 : d.cx + half - 0.10;

    if (style === 'Slider') {
      const track = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.1, 0.035, 0.035), metalMat);
      if (rotY) { track.position.set(0.02, y_(H) + 0.02, d.cx); track.rotation.y = rotY; }
      else track.position.set(d.cx, y_(H) + 0.02, 0.02);
      dyn.add(track);
      put(metalBox(0.07, 0.09, 0.07), d.cx - d.w / 4, y_(H) - 0.07, 0.02);
      put(metalBox(0.07, 0.09, 0.07), d.cx + d.w / 4, y_(H) - 0.07, 0.02);
      const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 12), metalMat);
      pull.position.set(...(rotY ? [0.06, y_(H) - 0.28, pullX] : [pullX, y_(H) - 0.28, 0.06]));
      dyn.add(pull);
      return;
    }

    if (style === 'Pivot') {
      const pivotH = H * 0.86;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, pivotH, 14), metalMat);
      post.position.set(...(rotY ? [0.03, y_(H), hingeX] : [hingeX, y_(H), 0.03]));
      if (rotY) post.rotation.z = 0;
      dyn.add(post);
      const arm = metalBox(
        rotY ? 0.05 : 0.1, 0.05, rotY ? 0.1 : 0.05,
        rotY ? [0.05, y_(H) + pivotH / 2 - 0.06, hingeX + 0.06] : [hingeX + 0.07, y_(H) + pivotH / 2 - 0.06, 0.05]
      );
      dyn.add(arm);
    } else {
      for (const hy of [hy1, hy2]) {
        put(metalBox(0.07, 0.15, t + 0.07), hingeX, hy, 0.0);
      }
    }

    /* pull handle — the detail that reads as a real fitting */
    const barLen = Math.min(0.9, H * 0.42);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, barLen, 14), metalMat);
    const barY = y_(H) - barLen / 2 - 0.04;
    if (rotY) { bar.position.set(0.055, barY, pullX); }
    else { bar.position.set(pullX, barY, 0.055); }
    dyn.add(bar);
    for (const off of [0.03, barLen - 0.03]) {
      const stub = cyl(0.011, 0.055, [0, 0, 0], 'z');
      stub.position.set(...(rotY ? [0.03, barY + off, pullX] : [pullX, barY + off, 0.03]));
      dyn.add(stub);
    }
  }

  const y_ = (H) => H + 0.05;

  /* ---------------------------------------------------------------- loop */
  let raf = 0, running = false, visible = true, lastT = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.95 ? 46 : 38;
    camera.updateProjectionMatrix();
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const _off = new THREE.Vector3();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible || !running) return;
    const dt = Math.min((now - lastT) / 1000 || 0, 0.05);
    lastT = now;
    if (controls.autoRotate) {
      _off.subVectors(camera.position, controls.target).applyAxisAngle(UP, dt * 0.16);
      camera.position.copy(controls.target).add(_off);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function start() { if (!running) { running = true; lastT = performance.now(); frame(lastT); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) lastT = performance.now();
  }, { rootMargin: '120px' });
  io.observe(canvas);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  /* survive a lost context (tab backgrounding, driver reset, old phones).
     Transmission is by far the heaviest pass — it re-renders the scene into a
     second target every frame. A device that dropped the context once is not
     going to survive it, so degrade permanently to a cheap translucent glass
     rather than freezing the hero on the second loss. */
  let losses = 0;
  let cheap = false;

  function degrade() {
    cheap = true;
    glassMat.transmission = 0;
    glassMat.opacity = 0.36;
    glassMat.transparent = true;
    glassMat.clearcoat = 0;
    glassMat.needsUpdate = true;
    renderer.setPixelRatio(1);
    if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.25;
    renderer.shadowMap.enabled = false;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    losses++;
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    if (losses > 1) degrade();
    scene.environment = envRT.texture;
    if (state) build(state);
    resize();
    start();
  }, false);

  resize();
  start();

  /* re-render labels once the webfont lands */
  document.fonts?.ready?.then(() => { if (state) build(state); });

  if (typeof location !== 'undefined' && location.search.includes('capture')) {
    window.__gl = { THREE, camera, controls, scene, get state() { return state; } };
  }

  return {
    setState(s) { state = s; build(s); },
    resize,
    dispose() { stop(); io.disconnect(); ro.disconnect(); envRT.dispose(); renderer.dispose(); },
  };
}
