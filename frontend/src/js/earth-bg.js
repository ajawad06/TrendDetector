/**
 * Trend Detector — animated Earth background (presentation only).
 *
 * Mounted once behind all routes. Lazy-loads three.js + a day texture after
 * first paint. Falls back to a CSS sphere if WebGL/texture fails.
 *
 * Texture: frontend/src/img/earth/earth-day.jpg
 *   Source: https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-day.jpg
 *   Package: three-globe (MIT). Imagery: NASA Visible Earth / Blue Marble–derived.
 *   Credit NASA; no endorsement. See src/img/earth/LICENSE.txt and About › Credits.
 *
 * three.js: pinned CDN build (cdnjs) with SRI, loaded only when WebGL is used.
 */

const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js';
const THREE_SRI = 'sha384-qOkzR5Ke/XkQxuGVJ9hpFEpDlcoLtWwVYhnJf06cLIZa2vaIptSqaubivErzmD5O';
const TEX_URL = new URL('../img/earth/earth-day.jpg', import.meta.url).href;

/** 8 tracked cities — lat/lon match catalogs/regions.json */
const CITIES = [
  { id: 'lahore', lat: 31.52, lon: 74.36 },
  { id: 'karachi', lat: 24.86, lon: 67.01 },
  { id: 'islamabad', lat: 33.68, lon: 73.05 },
  { id: 'peshawar', lat: 34.01, lon: 71.58 },
  { id: 'faisalabad', lat: 31.42, lon: 73.08 },
  { id: 'multan', lat: 30.2, lon: 71.47 },
  { id: 'quetta', lat: 30.18, lon: 66.98 },
  { id: 'hyderabad', lat: 25.4, lon: 68.37 },
];
const PK = { lat: 30.4, lon: 69.3 }; // Pakistan focus centroid

const STORE_KEY = 'td:earth-anim';
const LERP = 0.09;
const DEG = Math.PI / 180;
const REV_PER_SEC = (Math.PI * 2) / 120; // 1 revolution / 120s

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedData = () => window.matchMedia('(prefers-reduced-data: reduce)').matches
  || !!navigator.connection?.saveData;
const lowPower = () => (navigator.hardwareConcurrency || 8) <= 4
  || (navigator.deviceMemory || 8) <= 4
  || reducedData();
const isMobile = () => window.matchMedia('(max-width: 767.98px)').matches
  || matchMedia('(pointer: coarse)').matches;

let host, stage, vignette, canvas, cssSphere;
let renderer, scene, camera, earth, clouds, atmosphere, markers = [];
let THREE = null;
let running = false, disposed = false, mode = 'pending';
let page = 'home', focusCity = null, enabled = true;
let scrollY = 0, targetScrollY = 0;
let rotY = 0, targetRotY = 0, rotX = 0, targetRotX = 0;
let tiltX = 0, tiltY = 0, tTiltX = 0, tTiltY = 0;
let ptrX = 0, ptrY = 0;
let lastT = 0, visible = true, onScreen = true;
let raf = 0;

function readEnabled() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* private mode */ }
  return true;
}
export function isEarthAnimEnabled() { return enabled; }
export function setEarthAnimEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(STORE_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  applyEnabled();
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

function loadScript() {
  if (window.THREE) return Promise.resolve(window.THREE);
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = THREE_SRC;
    s.integrity = THREE_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.THREE ? ok(window.THREE) : no(new Error('THREE missing')));
    s.onerror = () => no(new Error('three.js failed'));
    document.head.appendChild(s);
  });
}

function latLonToRot(lat, lon) {
  // Face (lat,lon) toward +Z camera: yaw then pitch
  return { y: -lon * DEG, x: -lat * DEG * 0.85 };
}

function setFocus(lat, lon, instant = false) {
  const r = latLonToRot(lat, lon);
  targetRotY = r.y;
  targetRotX = r.x;
  if (instant) { rotY = targetRotY; rotX = targetRotX; }
}

/** Route-aware size/opacity + Pakistan default face. */
export function setEarthRoute(routePage) {
  page = routePage || 'home';
  host?.classList.toggle('is-home', page === 'home');
  if (page === 'home' || (page !== 'trends' && page !== 'compare')) {
    focusCity = null;
    setFocus(PK.lat, PK.lon);
  } else if (focusCity) {
    const c = CITIES.find((x) => x.id === focusCity);
    if (c) setFocus(c.lat, c.lon);
  } else {
    setFocus(PK.lat, PK.lon);
  }
  wake();
}

/** Face a tracked city (trends / compare). Unknown id → Pakistan. */
export function setEarthCity(cityId) {
  focusCity = cityId || null;
  if (page !== 'trends' && page !== 'compare') return;
  const c = CITIES.find((x) => x.id === cityId);
  if (c) setFocus(c.lat, c.lon);
  else setFocus(PK.lat, PK.lon);
  wake();
}

function mountShell() {
  host = document.createElement('div');
  host.className = 'earth-bg is-home';
  host.setAttribute('aria-hidden', 'true');
  host.dataset.mode = 'pending';

  stage = document.createElement('div');
  stage.className = 'earth-stage';

  vignette = document.createElement('div');
  vignette.className = 'earth-vignette';

  host.append(stage, vignette);

  // Insert above starfield (prepended earlier) so z-order: stars < earth < content
  const stars = document.querySelector('.starfield');
  if (stars?.nextSibling) document.body.insertBefore(host, stars.nextSibling);
  else if (stars) stars.after(host);
  else document.body.prepend(host);
}

function showCssFallback() {
  mode = 'css';
  host.dataset.mode = 'css';
  stage.replaceChildren();
  cssSphere = document.createElement('div');
  cssSphere.className = 'earth-css';
  const marks = document.createElement('div');
  marks.className = 'earth-css-markers';
  // Rough projected positions for Pakistan cluster (decorative only)
  const spots = [
    [58, 42], [52, 58], [60, 38], [55, 36], [57, 44], [54, 48], [48, 46], [53, 56],
  ];
  spots.forEach(([x, y]) => {
    const i = document.createElement('i');
    i.style.left = `${x}%`; i.style.top = `${y}%`;
    marks.appendChild(i);
  });
  cssSphere.appendChild(marks);
  stage.appendChild(cssSphere);
  applyEnabled();
}

function makeCloudTexture(T) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    const r = 8 + Math.random() * 28;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.08 + Math.random() * 0.12})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace || T.sRGBEncoding;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

function fresnelMaterial(T) {
  return new T.ShaderMaterial({
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      c: { value: 0.15 },
      p: { value: 3.8 },
      glowColor: { value: new T.Color(0x5cc8ff) },
      glowColor2: { value: new T.Color(0x6ee7b7) },
    },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vWorldPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float c; uniform float p;
      uniform vec3 glowColor; uniform vec3 glowColor2;
      varying vec3 vNormal; varying vec3 vWorldPos;
      void main() {
        float inten = pow(c - dot(normalize(vNormal), normalize(-vWorldPos)), p);
        vec3 col = mix(glowColor, glowColor2, clamp(inten, 0.0, 1.0));
        gl_FragColor = vec4(col, inten * 0.55);
      }`,
  });
}

function addMarkers(T, parent) {
  markers = [];
  const geo = new T.SphereGeometry(0.012, 8, 8);
  const mat = new T.MeshBasicMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.85 });
  const ringGeo = new T.RingGeometry(0.018, 0.028, 16);
  const ringMat = new T.MeshBasicMaterial({
    color: 0x6ee7b7, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false,
  });
  CITIES.forEach((city) => {
    const phi = (90 - city.lat) * DEG;
    const theta = (city.lon + 180) * DEG;
    const r = 1.02;
    const x = -r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
    const group = new T.Group();
    const dot = new T.Mesh(geo, mat.clone());
    const ring = new T.Mesh(ringGeo, ringMat.clone());
    ring.lookAt(0, 0, 0);
    group.add(dot, ring);
    group.position.set(x, y, z);
    group.userData = { ring, phase: Math.random() * Math.PI * 2 };
    parent.add(group);
    markers.push(group);
  });
}

async function buildWebGL() {
  THREE = await loadScript();
  const T = THREE;
  const low = lowPower();
  const mobile = isMobile();

  canvas = document.createElement('canvas');
  stage.appendChild(canvas);

  renderer = new T.WebGLRenderer({
    canvas, alpha: true, antialias: false, powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const size = stage.clientWidth || 400;
  renderer.setSize(size, size, false);

  scene = new T.Scene();
  camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.z = 3.15;

  const loader = new T.TextureLoader();
  const dayTex = await new Promise((ok, no) => {
    loader.load(TEX_URL, ok, undefined, no);
  });
  dayTex.colorSpace = T.SRGBColorSpace || T.sRGBEncoding;
  if (low) {
    dayTex.generateMipmaps = false;
    dayTex.minFilter = T.LinearFilter;
  }

  const earthMat = new T.MeshStandardMaterial({
    map: dayTex,
    roughness: 0.92,
    metalness: 0.05,
  });
  earth = new T.Mesh(new T.SphereGeometry(1, low ? 32 : 48, low ? 32 : 48), earthMat);
  scene.add(earth);

  if (!low && !mobile) {
    const cloudTex = makeCloudTexture(T);
    clouds = new T.Mesh(
      new T.SphereGeometry(1.015, 32, 32),
      new T.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.22, depthWrite: false,
      }),
    );
    scene.add(clouds);
  }

  atmosphere = new T.Mesh(new T.SphereGeometry(1.12, 32, 32), fresnelMaterial(T));
  scene.add(atmosphere);

  addMarkers(T, earth);

  const amb = new T.AmbientLight(0x8899bb, 0.55);
  const sun = new T.DirectionalLight(0xffffff, 1.15);
  sun.position.set(4, 1.2, 2.5);
  scene.add(amb, sun);

  mode = 'webgl';
  host.dataset.mode = 'webgl';
  setFocus(PK.lat, PK.lon, true);
  applyEnabled();
  wake();
}

function disposeWebGL() {
  if (!renderer) return;
  cancelAnimationFrame(raf); raf = 0; running = false;
  markers = [];
  scene?.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose?.(); });
        m.dispose?.();
      });
    }
  });
  renderer.dispose();
  renderer.forceContextLoss?.();
  canvas?.remove();
  renderer = scene = camera = earth = clouds = atmosphere = canvas = null;
}

function applyEnabled() {
  if (!host) return;
  const off = !enabled;
  const frozen = reducedMotion() || off;
  host.classList.toggle('is-off', off);
  host.classList.toggle('is-static', frozen);
  if (off || disposed) { cancelAnimationFrame(raf); running = false; return; }
  wake();
}

function onScroll() {
  targetScrollY = window.scrollY || 0;
  wake();
}

function onPointer(e) {
  if (isMobile() || reducedMotion() || !enabled) return;
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = (e.clientY / window.innerHeight) * 2 - 1;
  ptrX = x; ptrY = y;
  tTiltY = x * 3; // deg
  tTiltX = -y * 3;
  wake();
}

function onVisibility() {
  visible = !document.hidden;
  if (visible) wake();
  else { cancelAnimationFrame(raf); running = false; }
}

function checkOnScreen() {
  if (!host) return;
  const r = host.getBoundingClientRect();
  onScreen = r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(host).opacity !== '0';
}

function tick(now) {
  if (!running || disposed) return;
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
  lastT = now;

  if (!visible || !onScreen || !enabled || reducedMotion()) {
    running = false;
    // Still render one static frame for WebGL when freezing
    if (mode === 'webgl' && renderer && scene && camera) renderer.render(scene, camera);
    return;
  }

  scrollY = lerp(scrollY, targetScrollY, LERP);
  const spin = REV_PER_SEC * dt;
  // Idle spin + gentle scroll-linked extra rotation
  targetRotY += spin;
  rotY = lerp(rotY, targetRotY + scrollY * 0.00035, LERP);
  rotX = lerp(rotX, targetRotX, LERP);
  tiltX = lerp(tiltX, tTiltX, LERP);
  tiltY = lerp(tiltY, tTiltY, LERP);

  host.style.setProperty('--earth-py', `${(scrollY * 0.15).toFixed(1)}px`);
  stage.style.setProperty('--earth-tilt-x', `${tiltX.toFixed(2)}deg`);
  stage.style.setProperty('--earth-tilt-y', `${tiltY.toFixed(2)}deg`);

  if (mode === 'webgl' && earth) {
    earth.rotation.y = rotY;
    earth.rotation.x = rotX;
    if (clouds) clouds.rotation.y = rotY * 1.15 + now * 0.00002;
    if (atmosphere) { atmosphere.rotation.y = rotY; atmosphere.rotation.x = rotX; }
    const t = now * 0.001;
    markers.forEach((g) => {
      const ring = g.userData.ring;
      if (!ring) return;
      const p = (Math.sin(t * Math.PI + g.userData.phase) + 1) * 0.5;
      ring.scale.setScalar(0.7 + p * 0.9);
      ring.material.opacity = 0.5 * (1 - p);
    });
    renderer.render(scene, camera);
  } else if (mode === 'css' && cssSphere) {
    cssSphere.style.setProperty('--css-earth-x', `${((-rotY / (Math.PI * 2)) * 100).toFixed(2)}%`);
  }

  raf = requestAnimationFrame(tick);
}

function wake() {
  if (disposed || !enabled || !visible) return;
  if (reducedMotion() && mode === 'webgl' && renderer) {
    renderer.render(scene, camera);
    return;
  }
  if (running) return;
  running = true;
  lastT = 0;
  checkOnScreen();
  raf = requestAnimationFrame(tick);
}

function onResize() {
  if (!renderer || !stage) return;
  const s = stage.clientWidth || 400;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(s, s, false);
  wake();
}

/**
 * Mount once after first paint. Idempotent.
 * @returns {{ setRoute, setCity, setEnabled, dispose }}
 */
export function initEarthBg() {
  if (host) return api();
  enabled = readEnabled();
  mountShell();
  setFocus(PK.lat, PK.lon, true);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) wake(); }, { threshold: 0 });
  io.observe(host);

  const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqData = window.matchMedia('(prefers-reduced-data: reduce)');
  const onPrefs = () => {
    if (reducedMotion() || reducedData() || !enabled) {
      if (mode === 'webgl') {
        // Swap to a static CSS frame under reduced-motion / reduced-data / low-power prefs
        disposeWebGL();
        showCssFallback();
      }
      host?.classList.add('is-static');
      applyEnabled();
      return;
    }
    host?.classList.remove('is-static');
    applyEnabled();
  };
  mqMotion.addEventListener?.('change', onPrefs);
  mqData.addEventListener?.('change', onPrefs);

  const start = async () => {
    if (disposed) return;
    // Reduced-data / save-data / disabled / no-WebGL → CSS sphere (static if reduced-motion).
    if (!enabled || !webglOk() || reducedData() || reducedMotion()) {
      showCssFallback();
      if (reducedMotion() || !enabled) host.classList.add('is-static');
      return;
    }
    try {
      await buildWebGL();
    } catch (err) {
      console.info('Earth WebGL unavailable, using CSS fallback', err);
      disposeWebGL();
      showCssFallback();
    }
  };

  // Lazy: after first paint / idle
  if ('requestIdleCallback' in window) requestIdleCallback(() => start(), { timeout: 1800 });
  else setTimeout(start, 400);

  return api();
}

function api() {
  return {
    setRoute: setEarthRoute,
    setCity: setEarthCity,
    setEnabled: setEarthAnimEnabled,
    isEnabled: isEarthAnimEnabled,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      disposeWebGL();
      host?.remove();
      host = null;
    },
  };
}
