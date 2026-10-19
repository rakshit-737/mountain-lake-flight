import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const startOverlay = document.querySelector<HTMLDivElement>('#start-overlay')!;
const launchButton = document.querySelector<HTMLButtonElement>('#launch-button')!;
const missionTitle = document.querySelector<HTMLDivElement>('#mission-title')!;
const missionCopy = document.querySelector<HTMLDivElement>('#mission-copy')!;
const progressBar = document.querySelector<HTMLSpanElement>('#progress-bar')!;
const progressLabel = document.querySelector<HTMLSpanElement>('#progress-label')!;
const distanceLabel = document.querySelector<HTMLSpanElement>('#distance-label')!;
const altitudeValue = document.querySelector<HTMLElement>('#altitude-value')!;
const speedValue = document.querySelector<HTMLElement>('#speed-value')!;
const visibility = document.querySelector<HTMLElement>('#visibility')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const pauseBadge = document.querySelector<HTMLDivElement>('#pause-badge')!;

if (!canvas || !startOverlay || !launchButton || !missionTitle || !missionCopy || !progressBar || !progressLabel || !distanceLabel || !altitudeValue || !speedValue || !visibility || !toast || !pauseBadge) {
  throw new Error('Lakewarden interface could not be mounted.');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#93aaa5');
scene.fog = new THREE.FogExp2('#93aaa5', 0.018);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 7, 19);

const clock = new THREE.Clock();
const keys = new Set<string>();
const waterPoints: Array<{ attribute: THREE.BufferAttribute; index: number; x: number; z: number; phase: number }> = [];
const waterfallShimmers: Array<{ mesh: THREE.Mesh; phase: number; baseX: number; baseY: number }> = [];
const fireflies: Array<{ mesh: THREE.Mesh; phase: number; speed: number; base: THREE.Vector3 }> = [];

const palette = {
  ground: 0x183f3b,
  darkGround: 0x12312f,
  pine: 0x17443f,
  pineLight: 0x25594d,
  trunk: 0x493a2b,
  rock: 0x3d5b59,
  water: 0x2d8f9a,
  waterDeep: 0x1d6775,
  snow: 0xd4e2d1,
  lime: 0xd1f27b,
  orange: 0xff9657,
};

const terrain = new THREE.Group();
const forest = new THREE.Group();
const atmosphere = new THREE.Group();
scene.add(terrain, forest, atmosphere);

const hemiLight = new THREE.HemisphereLight(0xcce4dc, 0x19312f, 2.1);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffe0b5, 3.3);
sun.position.set(-20, 26, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
scene.add(sun);

const rimLight = new THREE.DirectionalLight(0x78d6d4, 1.1);
rimLight.position.set(25, 14, -25);
scene.add(rimLight);

function material(color: number, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function addGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), material(palette.ground, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.1;
  ground.receiveShadow = true;
  terrain.add(ground);

  const shoreGeometry = new THREE.CircleGeometry(1, 72);
  const shore = new THREE.Mesh(shoreGeometry, material(palette.darkGround, 1));
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(19.5, 13.6, 1);
  shore.position.set(-1, -0.94, -1.4);
  shore.receiveShadow = true;
  terrain.add(shore);

  const lakeGeometry = new THREE.CircleGeometry(1, 72);
  const lakeMaterial = new THREE.MeshStandardMaterial({
    color: palette.water,
    roughness: 0.14,
    metalness: 0.25,
    transparent: true,
    opacity: 0.9,
    flatShading: true,
  });
  const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(18, 12.2, 1);
  lake.position.set(-1, -0.72, -1.4);
  lake.receiveShadow = true;
  terrain.add(lake);

  const positionAttribute = lakeGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positionAttribute.count; i += 1) {
    const x = positionAttribute.getX(i) * 18 - 1;
    const z = positionAttribute.getY(i) * 12.2 - 1.4;
    waterPoints.push({ attribute: positionAttribute, index: i, x, z, phase: i * 0.37 });
  }

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.7, 36),
    new THREE.MeshStandardMaterial({ color: 0x63cbd0, transparent: true, opacity: 0.65, roughness: 0.08 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(1.35, 0.7, 1);
  pool.position.set(8.4, -0.68, -10.4);
  terrain.add(pool);
}

function addMountain(x: number, z: number, radius: number, height: number, color: number, snow = false) {
  const mountain = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8, 2), material(color, 1));
  mountain.position.set(x, height * 0.5 - 1, z);
  mountain.rotation.y = (x + z) * 0.08;
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  terrain.add(mountain);

  if (snow) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.32, height * 0.23, 8, 1), material(palette.snow, 0.96));
    cap.position.set(x - radius * 0.04, height * 0.91 - 1, z - radius * 0.01);
    cap.rotation.y = mountain.rotation.y;
    cap.castShadow = true;
    terrain.add(cap);
  }
}

function addRock(x: number, y: number, z: number, scale: number) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), material(palette.rock, 0.96));
  rock.position.set(x, y, z);
  rock.scale.set(scale * 1.3, scale * 0.75, scale);
  rock.rotation.set(scale * 0.7, scale * 1.1, scale * 0.3);
  rock.castShadow = true;
  terrain.add(rock);
}

function createTree(scale: number, hueShift = 0) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 1.45, 6), material(palette.trunk, 1));
  trunk.position.y = 0.72;
  trunk.castShadow = true;
  tree.add(trunk);

  const dark = new THREE.Color(palette.pine).offsetHSL(hueShift, 0, 0);
  const light = new THREE.Color(palette.pineLight).offsetHSL(hueShift, 0, 0);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.93, 1.95, 7), material(dark.getHex(), 0.92));
  lower.position.y = 1.45;
  lower.castShadow = true;
  tree.add(lower);
  const middle = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.65, 7), material(light.getHex(), 0.92));
  middle.position.y = 2.42;
  middle.castShadow = true;
  tree.add(middle);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.55, 7), material(dark.getHex(), 0.92));
  top.position.y = 3.28;
  top.castShadow = true;
  tree.add(top);
  tree.scale.setScalar(scale);
  tree.rotation.y = Math.random() * Math.PI;
  return tree;
}

function addForest() {
  let seed = 17;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < 58; i += 1) {
    const x = (random() - 0.5) * 54;
    const z = (random() - 0.38) * 34 - 2;
    const lakeDistance = ((x + 1) / 19) ** 2 + ((z + 1.4) / 13.5) ** 2;
    if (lakeDistance < 1.05) continue;
    const tree = createTree(0.65 + random() * 0.56, random() * 0.05 - 0.025);
    tree.position.set(x, -1, z);
    forest.add(tree);
  }

  for (let i = 0; i < 12; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const tree = createTree(1.05 + (i % 3) * 0.12, 0.02);
    tree.position.set(side * (7.5 + (i % 5) * 1.5), -0.98, 6 - i * 1.75);
    forest.add(tree);
  }
}

function addWaterfall() {
  const waterfall = new THREE.Group();
  waterfall.position.set(8.1, -0.6, -10.8);

  const cliffLeft = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7.8, 6), material(0x294e4d, 1));
  cliffLeft.scale.set(0.85, 1, 0.65);
  cliffLeft.position.set(-2.4, 3.1, -0.2);
  cliffLeft.rotation.z = -0.16;
  cliffLeft.castShadow = true;
  waterfall.add(cliffLeft);

  const cliffRight = new THREE.Mesh(new THREE.ConeGeometry(2.7, 8.4, 6), material(0x244744, 1));
  cliffRight.scale.set(0.9, 1, 0.7);
  cliffRight.position.set(2.25, 3.35, -0.1);
  cliffRight.rotation.z = 0.19;
  cliffRight.castShadow = true;
  waterfall.add(cliffRight);

  const streamMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa5f5e7,
    emissive: 0x276e75,
    emissiveIntensity: 0.45,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 6, 5, 18), streamMaterial);
  stream.position.set(0, 3, 0.7);
  stream.rotation.y = 0.03;
  waterfall.add(stream);

  for (let i = 0; i < 26; i += 1) {
    const shimmer = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + (i % 3) * 0.018, 6, 5),
      new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffffff : 0x90e9df, transparent: true, opacity: 0.6 }),
    );
    const x = (i % 7 - 3) * 0.25 + Math.sin(i) * 0.12;
    const y = 0.3 + (i / 26) * 5.1;
    shimmer.position.set(x, y, 1.02);
    waterfall.add(shimmer);
    waterfallShimmers.push({ mesh: shimmer, phase: i * 0.8, baseX: x, baseY: y });
  }

  const mist = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xc9fbef, transparent: true, opacity: 0.085, depthWrite: false }),
  );
  mist.scale.set(1.5, 0.55, 0.8);
  mist.position.set(0, -0.1, 0.8);
  waterfall.add(mist);
  terrain.add(waterfall);
}

function addMountains() {
  addMountain(-22, -21, 14, 19, 0x2d5552, true);
  addMountain(-7, -27, 16, 25, 0x345f5b, true);
  addMountain(13, -29, 17, 28, 0x2b5553, true);
  addMountain(29, -21, 13, 21, 0x224944, true);
  addMountain(-36, -5, 17, 22, 0x244b48, false);
  addMountain(35, 0, 16, 25, 0x224743, false);
  addMountain(-26, 10, 11, 14, 0x1e4541, false);
  addMountain(25, 13, 12, 16, 0x1c403d, false);
}

function addAtmosphere() {
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xe7eee4, transparent: true, opacity: 0.07, depthWrite: false });
  const cloudPositions = [
    [-15, 11, -11, 3.6],
    [13, 14, -20, 4.7],
    [22, 9, -4, 2.8],
    [-22, 8, 3, 3.2],
  ];
  cloudPositions.forEach(([x, y, z, scale]) => {
    const cloud = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMaterial);
      puff.position.set((i - 2) * 1.1, Math.sin(i) * 0.35, Math.cos(i * 1.7) * 0.5);
      puff.scale.set(1.5, 0.48 + (i % 2) * 0.15, 0.7);
      cloud.add(puff);
    }
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale / 3);
    atmosphere.add(cloud);
  });

  const fireflyMaterial = new THREE.MeshBasicMaterial({ color: palette.lime, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 28; i += 1) {
    const firefly = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 3) * 0.01, 5, 4), fireflyMaterial);
    const base = new THREE.Vector3((i % 7 - 3) * 1.25 + Math.sin(i) * 1.4, 1.1 + (i % 5) * 0.38, -4 + (i % 6) * 1.8);
    firefly.position.copy(base);
    atmosphere.add(firefly);
    fireflies.push({ mesh: firefly, phase: i * 1.14, speed: 0.6 + (i % 4) * 0.12, base });
  }
}

function createSeaplane() {
  const group = new THREE.Group();
  const body = material(0xdfe9d8, 0.46, 0.08);
  const teal = material(0x2d7b78, 0.48, 0.05);
  const orange = material(palette.orange, 0.48, 0.04);
  const dark = material(0x152c2e, 0.28, 0.22);

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.55, 2.85), body);
  fuselage.position.y = 0.1;
  fuselage.castShadow = true;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), body);
  nose.scale.set(0.84, 0.72, 1.22);
  nose.position.set(0, 0.1, -1.42);
  nose.castShadow = true;
  group.add(nose);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.25, 0.72), dark);
  cockpit.position.set(0, 0.43, -0.34);
  cockpit.rotation.x = -0.07;
  cockpit.castShadow = true;
  group.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.13, 0.68), teal);
  wing.position.set(0, 0.03, -0.03);
  wing.castShadow = true;
  group.add(wing);

  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(3.74, 0.04, 0.12), orange);
  wingStripe.position.set(0, 0.1, 0.08);
  group.add(wingStripe);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 0.43), teal);
  tailWing.position.set(0, 0.3, 1.08);
  tailWing.castShadow = true;
  group.add(tailWing);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.48), orange);
  tail.position.set(0, 0.63, 1.1);
  tail.rotation.x = -0.1;
  tail.castShadow = true;
  group.add(tail);

  [-0.84, 0.84].forEach((x) => {
    const pontoon = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 2.35, 4, 8), teal);
    pontoon.rotation.x = Math.PI / 2;
    pontoon.position.set(x, -0.47, 0.05);
    pontoon.castShadow = true;
    group.add(pontoon);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.52, 0.08), dark);
    strut.position.set(x, -0.2, -0.18);
    group.add(strut);
  });

  const propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8), orange);
  hub.rotation.x = Math.PI / 2;
  propeller.add(hub);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.22, 0.055), material(0xe5f0df, 0.45));
  propeller.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  propeller.add(blade2);
  propeller.position.set(0, 0.1, -1.8);
  group.add(propeller);

  group.position.set(0, 4.6, 8.3);
  group.scale.setScalar(0.95);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

addGround();
addMountains();
addForest();
addWaterfall();
addAtmosphere();

const plane = createSeaplane();
scene.add(plane);

const beacon = new THREE.Group();
const beaconRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.75, 0.07, 8, 48),
  new THREE.MeshBasicMaterial({ color: palette.orange, transparent: true, opacity: 0.88 }),
);
beaconRing.rotation.x = 0.06;
beacon.add(beaconRing);
const beaconCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 10, 8),
  new THREE.MeshBasicMaterial({ color: palette.lime, transparent: true, opacity: 0.9 }),
);
beacon.add(beaconCore);
const beaconBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.12, 5.4, 8, 1, true),
  new THREE.MeshBasicMaterial({ color: palette.orange, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
);
beaconBeam.position.y = -2.7;
beacon.add(beaconBeam);
beacon.position.set(8.1, 6.55, -9.7);
scene.add(beacon);

const startPosition = plane.position.clone();
const velocity = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 3.9, 10.5);
const targetOffset = new THREE.Vector3(0, -0.55, -8);
let started = false;
let paused = false;
let routeComplete = false;
let elapsed = 0;
let lookYaw = 0;
let lookPitch = 0;
let dragStart: { x: number; y: number } | null = null;
let toastTimeout = 0;

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 2800);
}

function beginExpedition() {
  started = true;
  paused = false;
  startOverlay.classList.add('hidden');
  pauseBadge.classList.remove('visible');
  showToast('EXPEDITION LIVE — FIND THE AMBER BEACON');
}

function togglePause() {
  if (!started) return;
  paused = !paused;
  pauseBadge.classList.toggle('visible', paused);
}

launchButton.addEventListener('click', beginExpedition);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && !started) {
    beginExpedition();
    return;
  }
  if (event.code === 'KeyP' || event.code === 'Escape') {
    togglePause();
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => keys.delete(event.code));

canvas.addEventListener('pointerdown', (event) => {
  dragStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragStart || !started || paused) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  lookYaw = THREE.MathUtils.clamp(lookYaw - dx * 0.002, -0.7, 0.7);
  lookPitch = THREE.MathUtils.clamp(lookPitch + dy * 0.0014, -0.35, 0.35);
  dragStart = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', () => { dragStart = null; });
canvas.addEventListener('pointercancel', () => { dragStart = null; });

function updatePlane(delta: number) {
  if (!started || paused) return;

  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const climb = keys.has('KeyW') || keys.has('ArrowUp');
  const dive = keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space');
  const steer = Number(right) - Number(left);
  const vertical = Number(climb) - Number(dive);
  const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = boosting ? 11 : climb ? 7 : 3.5;

  plane.rotation.y += steer * delta * 0.62;
  plane.rotation.z = THREE.MathUtils.damp(plane.rotation.z, -steer * 0.3, 5.5, delta);
  plane.rotation.x = THREE.MathUtils.damp(plane.rotation.x, -vertical * 0.1, 4, delta);
  plane.translateZ(-speed * delta);
  plane.position.y += vertical * delta * (boosting ? 4.2 : 3.2);

  plane.position.x = THREE.MathUtils.clamp(plane.position.x, -24, 24);
  plane.position.y = THREE.MathUtils.clamp(plane.position.y, 2.25, 14.5);
  plane.position.z = THREE.MathUtils.clamp(plane.position.z, -26, 11);

  const distance = plane.position.distanceTo(beacon.position);
  if (!routeComplete && distance < 2.25) {
    routeComplete = true;
    beaconRing.material.opacity = 0.22;
    missionTitle.textContent = 'RUN COMPLETE';
    missionCopy.textContent = 'Survey beacon acquired. Take the long way home.';
    progressBar.style.width = '100%';
    progressLabel.textContent = '03 / 03 CHECKPOINTS';
    distanceLabel.textContent = 'CLEAR';
    showToast('BEACON ACQUIRED — NICE FLYING');
  }

  updateTelemetry(speed, distance);
}

function updateTelemetry(speed: number, distance: number) {
  altitudeValue.textContent = Math.round(820 + plane.position.y * 92).toString();
  speedValue.textContent = Math.max(3, Math.round(speed * 1.6)).toString().padStart(2, '0');
  if (!routeComplete) distanceLabel.textContent = `${Math.max(0.1, distance * 0.18).toFixed(1)} KM`;
  visibility.textContent = plane.position.y < 4 ? 'MISTY' : 'CLEAR';
}

function animateEnvironment(delta: number) {
  elapsed += delta;

  waterPoints.forEach((point) => {
    const ripple = Math.sin(elapsed * 1.7 + point.x * 0.18 + point.phase) * 0.035 + Math.cos(elapsed * 1.1 + point.z * 0.1) * 0.022;
    point.attribute.setZ(point.index, ripple);
  });
  if (waterPoints[0]) waterPoints[0].attribute.needsUpdate = true;

  waterfallShimmers.forEach((shimmer, index) => {
    shimmer.mesh.position.x = shimmer.baseX + Math.sin(elapsed * 3.2 + shimmer.phase) * 0.1;
    shimmer.mesh.position.y = shimmer.baseY - ((elapsed * (0.42 + index * 0.013)) % 5.2);
    if (shimmer.mesh.position.y < 0.25) shimmer.mesh.position.y += 5.1;
    shimmer.mesh.scale.y = 0.75 + Math.sin(elapsed * 5 + shimmer.phase) * 0.25;
  });

  fireflies.forEach((firefly) => {
    firefly.mesh.position.x = firefly.base.x + Math.sin(elapsed * firefly.speed + firefly.phase) * 0.45;
    firefly.mesh.position.y = firefly.base.y + Math.cos(elapsed * firefly.speed * 0.7 + firefly.phase) * 0.22;
    const material = firefly.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.45 + (Math.sin(elapsed * 2.5 + firefly.phase) + 1) * 0.25;
  });

  beacon.rotation.y = elapsed * 0.38;
  beaconRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.06);
  beaconCore.scale.setScalar(1 + Math.sin(elapsed * 4.5) * 0.18);

  if (!started) {
    plane.position.y = startPosition.y + Math.sin(elapsed * 1.6) * 0.11;
    plane.rotation.z = Math.sin(elapsed * 0.9) * 0.018;
    plane.rotation.y = Math.sin(elapsed * 0.32) * 0.06;
  }
}

function updateCamera(delta: number) {
  const desiredPosition = cameraOffset.clone().applyQuaternion(plane.quaternion).add(plane.position);
  const desiredTarget = targetOffset.clone().applyQuaternion(plane.quaternion).add(plane.position);
  desiredTarget.x += lookYaw * 6;
  desiredTarget.y += lookPitch * 3;

  camera.position.lerp(desiredPosition, 1 - Math.pow(0.001, delta));
  const currentTarget = new THREE.Vector3();
  camera.getWorldDirection(currentTarget);
  const lookPoint = new THREE.Vector3().lerpVectors(camera.position, desiredTarget, 0.18);
  camera.lookAt(lookPoint);
  if (started && !paused) {
    lookYaw = THREE.MathUtils.damp(lookYaw, 0, 0.7, delta);
    lookPitch = THREE.MathUtils.damp(lookPitch, 0, 0.7, delta);
  }
}

function render() {
  requestAnimationFrame(render);
  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlane(delta);
  animateEnvironment(delta);
  updateCamera(delta);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
});

updateTelemetry(3.5, plane.position.distanceTo(beacon.position));
render();
