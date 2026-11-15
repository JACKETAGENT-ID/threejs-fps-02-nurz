// NEON DOCKS — the map. A 44 x 32 m container yard at night: two bomb sites (A under
// the gantry crane, B by the warehouse), three lanes (A-long west, mid alley, B-short
// east) joined by a cross connector. Every solid is a box collider and a bullet stop.
import * as THREE from 'three';
import { PALETTE, material, containerMaterial, glowMaterial } from './palette.js';

const YARD_X = 22;
const YARD_Z = 16;
const WALL_H = 5;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) colliders.push(new THREE.Box3().setFromObject(mesh));
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  // Ground: wet asphalt, slightly reflective.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(YARD_X * 2 + 4, YARD_Z * 2 + 4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.asphalt), roughness: 0.35, metalness: 0.35 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-YARD_X - 2, -0.4, -YARD_Z - 2), new THREE.Vector3(YARD_X + 2, 0, YARD_Z + 2)));

  // Perimeter walls with a hazard stripe on the inner face.
  const wallMat = material('concrete', { roughness: 0.95 });
  box(0.6, WALL_H, YARD_Z * 2 + 1.2, -YARD_X - 0.3, WALL_H / 2, 0, wallMat);
  box(0.6, WALL_H, YARD_Z * 2 + 1.2, YARD_X + 0.3, WALL_H / 2, 0, wallMat);
  box(YARD_X * 2 + 1.2, WALL_H, 0.6, 0, WALL_H / 2, -YARD_Z - 0.3, wallMat);
  box(YARD_X * 2 + 1.2, WALL_H, 0.6, 0, WALL_H / 2, YARD_Z + 0.3, wallMat);
  // Sodium stripe along the top of the north wall.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(YARD_X * 2, 0.12, 0.1), glowMaterial('sodium'));
  stripe.position.set(0, WALL_H - 0.2, -YARD_Z + 0.05);
  group.add(stripe);

  // Shipping containers: 6.1 long, 2.6 high, 2.44 wide. A second box on top makes a stack.
  function container(cx, cz, rotY, paint, stack = false) {
    const mat = containerMaterial(paint);
    const long = rotY ? 2.44 : 6.1;
    const wide = rotY ? 6.1 : 2.44;
    box(long, 2.6, wide, cx, 1.3, cz, mat, { rotY });
    if (stack) box(long, 2.6, wide, cx, 3.9, cz, containerMaterial(paint === 'teal' ? 'slate' : 'teal'), { rotY });
  }

  // North row (z = -8): three blocks, two gaps for the mid-north corridors.
  container(-13, -8, 0, 'teal', true);
  container(0, -8, 0, 'rust', true);
  container(13, -8, 0, 'olive', true);
  // Side pillars (long axis north-south) shaping the A and B lanes.
  container(-18, 0, Math.PI / 2, 'slate');
  container(18, 0, Math.PI / 2, 'teal');
  // South row (z = +6): two blocks, open centre for the crew push.
  container(-6, 6, 0, 'olive');
  container(6, 6, 0, 'rust');
  // A lone stack mid-yard, the map's centrepiece and best cover.
  container(-3.4, -1.5, Math.PI / 2, 'teal', true);

  // Gantry crane over site A: two legs, a beam, a hanging hook block.
  const steel = material('steel', { roughness: 0.6, metalness: 0.6 });
  box(0.8, 9, 0.8, -19, 4.5, -12, steel);
  box(0.8, 9, 0.8, -13, 4.5, -12, steel);
  box(7.2, 0.9, 1.1, -16, 9, -12, steel);
  const hook = box(1.1, 1.1, 1.1, -16, 6.4, -12, material('rust', { roughness: 0.6, metalness: 0.4 }));
  hook.castShadow = true;
  // A hanging work light under the beam.
  const craneLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), glowMaterial('sodium'));
  craneLight.position.set(-16, 8.4, -12);
  group.add(craneLight);

  // Warehouse block over site B: solid hall with an awning and a roller door.
  box(12, 6, 8, 16, 3, -12.5, material('concrete', { roughness: 0.9 }));
  box(12.6, 0.4, 2.2, 16, 5.4, -8.2, material('steel', { roughness: 0.6, metalness: 0.5 }));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.4), containerMaterial('slate'));
  door.position.set(16, 2.2, -8.45);
  group.add(door);

  // Forklift parked mid-yard: body, mast, forks and a cab.
  const forkMat = material('rust', { roughness: 0.55, metalness: 0.35 });
  box(1.5, 0.9, 2.2, 3.5, 0.45, 4, forkMat);
  box(0.12, 1.9, 1.4, 3.5, 0.95, 2.85, material('steel', { roughness: 0.5, metalness: 0.6 }));
  box(0.1, 0.08, 1.3, 3.5, 0.25, 1.7, material('steel', { roughness: 0.5, metalness: 0.6 }));
  box(1.3, 1.0, 1.2, 3.5, 1.4, 4.4, material('night', { roughness: 0.4, metalness: 0.2 }));

  // Lamp poles: sodium heads; three carry real point lights, the rest glow only.
  const poleMat = material('steel', { roughness: 0.6, metalness: 0.5 });
  const lampSpots = [
    { x: -10, z: 2, lit: true },
    { x: 10, z: 2, lit: true },
    { x: 0, z: -11, lit: true },
    { x: -18, z: 9, lit: false },
    { x: 18, z: 9, lit: false },
  ];
  for (const lamp of lampSpots) {
    box(0.18, 5.4, 0.18, lamp.x, 2.7, lamp.z, poleMat, { noShoot: true });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.34), glowMaterial('sodium'));
    head.position.set(lamp.x, 5.4, lamp.z);
    group.add(head);
    if (lamp.lit) {
      const point = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 26, 22, 1.8);
      point.position.set(lamp.x, 5.2, lamp.z);
      scene.add(point);
    }
  }

  // Cyan neon sign on the north wall, drawn on a canvas — the yard's signature.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#0b1220';
  sctx.fillRect(0, 0, 512, 96);
  sctx.fillStyle = '#35e0d2';
  sctx.font = 'bold 56px monospace';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.shadowColor = '#35e0d2';
  sctx.shadowBlur = 22;
  sctx.fillText('NEON DOCKS', 256, 50);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 1.9),
    new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false }),
  );
  sign.position.set(0, 4.2, -YARD_Z + 0.08);
  group.add(sign);

  // Night lighting: cold moon key with shadows, warm sodium fill, dark sky.
  const moon = new THREE.DirectionalLight(new THREE.Color('#9db8e8'), 1.7);
  moon.position.set(-14, 22, 10);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  moon.shadow.camera.far = 70;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const sky = new THREE.HemisphereLight(new THREE.Color('#24344d'), new THREE.Color('#0b1220'), 1.05);
  scene.add(sky);

  // Bomb sites: flat zones the planter must stand inside. A light pillar and a
  // floating letter mark each site from across the yard, so the objective reads
  // in a screenshot as well as in play.
  const sites = {
    A: { name: 'CRANE', center: new THREE.Vector3(-16, 0, -9), radius: 3.4 },
    B: { name: 'WAREHOUSE', center: new THREE.Vector3(16, 0, -9), radius: 3.4 },
  };
  for (const [key, site] of Object.entries(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.14, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger), transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    group.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 11, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.danger), transparent: true, opacity: 0.09,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    pillar.position.set(site.center.x, 5.5, site.center.z);
    group.add(pillar);
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 128;
    const lctx = labelCanvas.getContext('2d');
    lctx.fillStyle = '#e5484d';
    lctx.font = 'bold 84px monospace';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.shadowColor = '#e5484d';
    lctx.shadowBlur = 18;
    lctx.fillText(key, 64, 68);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
    label.scale.set(1.6, 1.6, 1);
    label.position.set(site.center.x, 3.6, site.center.z);
    group.add(label);
  }

  // Stars above the yard: a fixed dome of points, so the night sky is not flat fog.
  const starCount = 320;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.42;
    const radius = 70 + Math.random() * 25;
    starPositions[i * 3] = Math.cos(theta) * Math.sin(phi) * radius;
    starPositions[i * 3 + 1] = Math.cos(phi) * radius * 0.6 + 6;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: new THREE.Color('#cfe0ff'), size: 0.22, sizeAttenuation: true, fog: false,
    transparent: true, opacity: 0.85,
  }));
  scene.add(stars);

  // Wet puddles under the lamps: near-mirror planes that catch the sodium glow,
  // so the yard reads wet after the rain instead of flat dark asphalt.
  const puddleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1626'), roughness: 0.06, metalness: 0.85 });
  const puddleGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f5a623'), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const lamp of lampSpots) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(lamp.x, 0.015, lamp.z);
    group.add(puddle);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), puddleGlowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(lamp.x, 0.025, lamp.z);
    group.add(glow);
  }

  // Rain: 520 streaks as one LineSegments, positions recycled in place — no new
  // objects per frame. Drops fall, hit the yard and respawn at the top.
  const RAIN_DROPS = 520;
  const RAIN_TOP = 11;
  const rainPos = new Float32Array(RAIN_DROPS * 6);
  const rainDrop = new Float32Array(RAIN_DROPS * 4); // x, y, z, speed
  for (let i = 0; i < RAIN_DROPS; i += 1) {
    rainDrop[i * 4] = (Math.random() * 2 - 1) * (YARD_X + 2);
    rainDrop[i * 4 + 1] = Math.random() * RAIN_TOP;
    rainDrop[i * 4 + 2] = (Math.random() * 2 - 1) * (YARD_Z + 2);
    rainDrop[i * 4 + 3] = 19 + Math.random() * 7;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
    color: new THREE.Color('#8fa8c8'), transparent: true, opacity: 0.34, fog: false,
  }));
  rain.frustumCulled = false;
  scene.add(rain);

  // Lightning: a distant storm flashes every ~20-35 s, briefly lifting the moon
  // and sky. flashOnce() fires one immediately (used by the bomb screenshot).
  let flash = 0;
  let nextFlashIn = 14 + Math.random() * 10;
  const moonBase = 1.7;
  const skyBase = 1.05;
  function updateWeather(dt) {
    for (let i = 0; i < RAIN_DROPS; i += 1) {
      let y = rainDrop[i * 4 + 1] - rainDrop[i * 4 + 3] * dt;
      if (y < 0) {
        y = RAIN_TOP + Math.random() * 2;
        rainDrop[i * 4] = (Math.random() * 2 - 1) * (YARD_X + 2);
        rainDrop[i * 4 + 2] = (Math.random() * 2 - 1) * (YARD_Z + 2);
      }
      rainDrop[i * 4 + 1] = y;
      const x = rainDrop[i * 4];
      const z = rainDrop[i * 4 + 2];
      rainPos[i * 6] = x;
      rainPos[i * 6 + 1] = y;
      rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x;
      rainPos[i * 6 + 4] = y - 0.55;
      rainPos[i * 6 + 5] = z;
    }
    rainGeometry.attributes.position.needsUpdate = true;
    nextFlashIn -= dt;
    if (nextFlashIn <= 0) {
      flash = 1;
      nextFlashIn = 20 + Math.random() * 15;
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 2.6);
      moon.intensity = moonBase + flash * 2.4;
      sky.intensity = skyBase + flash * 1.8;
      scene.background.setRGB(0.043 + flash * 0.05, 0.07 + flash * 0.07, 0.125 + flash * 0.09);
    }
  }

  // Waypoints: lane junctions the bots walk. links are neighbour indices.
  const waypoints = [
    { x: 0, z: 13 }, // 0 crew spawn
    { x: -7, z: 13 }, // 1 crew spawn
    { x: 7, z: 13 }, // 2 crew spawn
    { x: 0, z: 8 }, // 3 mid south
    { x: -12, z: 8 }, // 4 A south
    { x: 12, z: 8 }, // 5 B south
    { x: 0, z: 2 }, // 6 mid centre
    { x: -12, z: 0 }, // 7 A connector
    { x: 12, z: 0 }, // 8 B connector
    { x: -19, z: -3 }, // 9 A-long
    { x: 19, z: -3 }, // 10 B-short
    { x: 0, z: -4 }, // 11 mid north
    { x: -6, z: -4 }, // 12 mid-A gap
    { x: 6, z: -4 }, // 13 mid-B gap
    { x: -16, z: -9 }, // 14 site A
    { x: 16, z: -9 }, // 15 site B
    { x: 0, z: -12 }, // 16 north centre
    { x: -6, z: -13 }, // 17 shift spawn
    { x: 6, z: -13 }, // 18 shift spawn
    { x: -10, z: -12 }, // 19 A hold
    { x: 10, z: -12 }, // 20 B hold
  ];
  const links = {
    0: [1, 2, 3], 1: [0, 4], 2: [0, 5], 3: [0, 6, 4, 5], 4: [1, 3, 7],
    5: [2, 3, 8], 6: [3, 11, 7, 8], 7: [4, 6, 9, 12], 8: [5, 6, 10, 13],
    9: [7, 14, 19], 10: [8, 15, 20], 11: [6, 12, 13, 16], 12: [11, 7, 19],
    13: [11, 8, 20], 14: [9, 19], 15: [10, 20], 16: [11, 17, 18, 19, 20],
    17: [16, 19], 18: [16, 20], 19: [14, 12, 16, 17], 20: [15, 13, 16, 18],
  };
  for (const [index, node] of waypoints.entries()) node.links = links[index];

  // Minimap data, derived from the same colliders the game walks on: every solid
  // that stands above the ground and below the crane beam, as a top-down rectangle.
  const minimapRects = colliders
    .filter((box) => box.min.y < 1 && box.max.y > 0.5 && box.max.y <= 6.5)
    .map((box) => ({
      x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, color: '#46587a',
    }));

  return {
    colliders,
    shootables,
    sites,
    waypoints,
    updateWeather,
    flashOnce() { flash = 1; },
    minimap: {
      bounds: { x: -24, z: -18, w: 48, h: 36 },
      rects: minimapRects,
      sites,
    },
    spawns: {
      crew: [new THREE.Vector3(0, 0, 13), new THREE.Vector3(-7, 0, 13), new THREE.Vector3(7, 0, 13)],
      shift: [new THREE.Vector3(-6, 0, -13), new THREE.Vector3(0, 0, -13), new THREE.Vector3(6, 0, -13)],
    },
    group,
  };
}
