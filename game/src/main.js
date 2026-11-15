// NEON DOCKS — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. ?shot=start|play|bomb|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, SMOKE_PRICE, ARMOR_PRICE, SHOTGUN_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS, ROUND_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createMinimap } from './minimap.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.night);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.night), 26, 68);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const hud = createHud();
const audio = createAudio();
const rounds = createRounds();
const weapons = createWeapons(camera);
const bots = createBots(scene, map);
const minimap = createMinimap(document.getElementById('minimap'), map.minimap);
const player = createPlayer(map.colliders, map.spawns.crew[0]);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const body = player.state;
let health = 100;
let playerAlive = true;
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let buyOpen = false;
let bombMesh = null;
let bombLight = null;
let minimapTimer = 0;
const grenades = [];
const smokes = [];
const playerTracers = [];
const direction = new THREE.Vector3();
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.olive), roughness: 0.6, metalness: 0.4 });
const smokeGrenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a6b7d'), roughness: 0.6, metalness: 0.4 });
const smokeGeo = new THREE.SphereGeometry(1.1, 10, 8);
const spark = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 8, 6),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sodium), toneMapped: false }),
);
spark.visible = false;
scene.add(spark);
let sparkLeft = 0;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function resetRound() {
  health = 100;
  playerAlive = true;
  player.reset(map.spawns.crew[0]);
  weapons.refillAmmo();
  weapons.select('pistol');
  bots.reset();
  for (const grenade of grenades) scene.remove(grenade.mesh);
  grenades.length = 0;
  for (const smoke of smokes) {
    for (const mesh of smoke.meshes) scene.remove(mesh);
    smoke.material.dispose();
  }
  smokes.length = 0;
  for (const tracer of playerTracers) {
    scene.remove(tracer.line);
    tracer.line.geometry.dispose();
    tracer.line.material.dispose();
  }
  playerTracers.length = 0;
  spark.visible = false;
  sparkLeft = 0;
  clearBombMesh();
  buyOpen = true;
  hud.showBuy(true, rounds.state.money, weapons.state.owned, weapons.state.grenades);
  hud.setBomb('');
  hud.setPlant(null);
}

function startMatch() {
  rounds.startMatch();
  resetRound();
  hud.setScore(0, 0, 1);
  hud.banner('NEON DOCKS', 'First to 5 rounds — plant the charge or drop the shift');
}

function clearBombMesh() {
  if (bombMesh) {
    scene.remove(bombMesh);
    bombMesh = null;
  }
  if (bombLight) {
    scene.remove(bombLight);
    bombLight = null;
  }
}

function placeBombMesh(siteKey) {
  clearBombMesh();
  const site = map.sites[siteKey];
  bombMesh = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.3 }),
  );
  box.position.y = 0.13;
  box.castShadow = true;
  bombMesh.add(box);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger), toneMapped: false }),
  );
  lamp.position.y = 0.32;
  bombMesh.add(lamp);
  bombMesh.position.copy(site.center);
  scene.add(bombMesh);
  bombLight = new THREE.PointLight(new THREE.Color(PALETTE.danger), 8, 9, 1.6);
  bombLight.position.set(site.center.x, 1.2, site.center.z);
  scene.add(bombLight);
}

function damagePlayer(amount, fromBot) {
  if (!playerAlive) return;
  const absorbed = Math.min(weapons.state.armor, amount * 0.5);
  weapons.state.armor -= absorbed;
  health -= amount - absorbed;
  hud.damageFlash();
  audio.hurt();
  if (health <= 0) {
    health = 0;
    playerAlive = false;
    hud.feed(`You were dropped by ${fromBot ? fromBot.name : 'the shift'}`, 'bad');
    if (document.pointerLockElement) document.exitPointerLock();
    checkRoundEnd();
  }
}

function addPlayerTracer(to) {
  const from = camera.position.clone().addScaledVector(direction, 0.6);
  from.y -= 0.12;
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to.clone()]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }));
  scene.add(line);
  playerTracers.push({ line, left: 0.1 });
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dryClick();
    return false;
  }
  const def = weapons.def();
  // The shotgun fires a cone of pellets: one trigger pull, one ray per pellet,
  // each pellet its own hit. Total damage is reported as a single number.
  const pellets = def.pellets || 1;
  let totalDealt = 0;
  let killedBot = null;
  let killedHead = false;
  for (let p = 0; p < pellets; p += 1) {
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    const targets = map.shootables.concat(bots.hitMeshes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const endPoint = hit ? hit.point : camera.position.clone().addScaledVector(direction, 60);
    addPlayerTracer(endPoint);
    if (hit) {
      spark.position.copy(hit.point);
      spark.visible = true;
      sparkLeft = 0.12;
    }
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      if (!bot.alive) continue; // A later pellet of the same blast skips a corpse.
      const isHead = hit.object.userData.part === 'head';
      // Pellet falloff past 9 m: the shotgun stays lethal up close and fades
      // at rifle range, so it never becomes a long-range one-tap.
      const falloff = hit.distance > 9 ? Math.max(0.45, 1 - (hit.distance - 9) * 0.04) : 1;
      const dealt = Math.max(1, Math.round((isHead ? def.headDamage : def.damage) * falloff));
      totalDealt += dealt;
      const killed = bots.damage(bot, dealt, hit.object.userData.part);
      if (killed) {
        killedBot = bot;
        killedHead = isHead;
      }
    }
  }
  if (totalDealt > 0) {
    hud.hitMarker(Boolean(killedBot), killedBot ? 4000 : 90);
    hud.addDamage(killedBot ? killedBot.position.clone().setY(1.4) : camera.position.clone().addScaledVector(direction, 10), totalDealt, Boolean(killedBot));
    if (killedBot) {
      audio.kill();
      hud.feed(`You dropped ${killedBot.name} ${killedHead ? '(headshot)' : ''}`, 'good');
      rounds.earn(300);
      checkRoundEnd();
    } else {
      audio.hit();
    }
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(weapons.state.current);
  bots.hearNoise(body.position, elapsed);
  return true;
}

function throwGrenade(type) {
  if (!weapons.throwGrenade(type)) return;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(grenadeGeo, type === 'smoke' ? smokeGrenadeMat : grenadeMat);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.4);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    type,
    mesh,
    velocity: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: type === 'smoke' ? 1.2 : 1.6,
  });
  if (type === 'smoke') audio.smoke();
  else audio.shot('rifle');
}

function deploySmoke(grenade) {
  const center = grenade.mesh.position.clone();
  center.y = Math.max(0.9, center.y);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9aa7b5'), transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
  });
  const meshes = [];
  for (let i = 0; i < 5; i += 1) {
    const mesh = new THREE.Mesh(smokeGeo, material);
    mesh.position.set(
      center.x + (random() * 2 - 1) * 1.2,
      center.y + 0.4 + random() * 1.2,
      center.z + (random() * 2 - 1) * 1.2,
    );
    scene.add(mesh);
    meshes.push(mesh);
  }
  smokes.push({ position: center, radius: 2.2, left: 12, maxLeft: 12, meshes, material });
  hud.feed('Smoke deployed — sightline blocked', 'good');
  audio.smoke();
  bots.hearNoise(center, elapsed);
}

function stepSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i -= 1) {
    const smoke = smokes[i];
    smoke.left -= dt;
    smoke.radius = 2.2 + (1 - smoke.left / smoke.maxLeft) * 1.2;
    smoke.material.opacity = 0.5 * Math.min(1, smoke.left / 3);
    const scale = smoke.radius / 2.2;
    for (const mesh of smoke.meshes) mesh.scale.setScalar(scale);
    if (smoke.left <= 0) {
      for (const mesh of smoke.meshes) scene.remove(mesh);
      smoke.material.dispose();
      smokes.splice(i, 1);
    }
  }
}

function stepTracers(dt) {
  for (let i = playerTracers.length - 1; i >= 0; i -= 1) {
    const tracer = playerTracers[i];
    tracer.left -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.left / 0.1) * 0.85;
    if (tracer.left <= 0) {
      scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
      playerTracers.splice(i, 1);
    }
  }
  if (sparkLeft > 0) {
    sparkLeft -= dt;
    const s = Math.max(0.2, sparkLeft / 0.12);
    spark.scale.setScalar(s);
    if (sparkLeft <= 0) spark.visible = false;
  }
}

function explodeGrenade(grenade) {
  scene.remove(grenade.mesh);
  const center = grenade.mesh.position;
  const kills = bots.damageInRadius(center, 6, 90);
  if (kills > 0) {
    rounds.earn(300 * kills);
    hud.feed(`Frag took ${kills} guard${kills > 1 ? 's' : ''}`, 'good');
  }
  const distToPlayer = center.distanceTo(body.position);
  if (playerAlive && distToPlayer < 6) {
    damagePlayer(55 * (1 - distToPlayer / 7), null);
  }
  const flash = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 60, 18, 1.5);
  flash.position.copy(center).setY(center.y + 0.5);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 160);
  audio.explosion();
  bots.hearNoise(center, elapsed);
  checkRoundEnd();
}

const botEnv = {
  playerPos: body.position,
  playerEye: 1.6,
  playerAlive: true,
  bomb: rounds.state.bomb,
  smokes,
  time: 0,
  rng: random,
  damagePlayer,
  onKill(killer, victim) {
    hud.feed(`${killer.name} dropped ${victim.name}`, 'bad');
  },
  onBotShot() { audio.enemyShot(); },
  onDefuse(progress) {
    rounds.setDefuse(progress);
  },
  onDefused(bot) {
    clearBombMesh();
    rounds.endRound('shift', `${bot.name} defused the charge.`);
  },
};

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  if (bots.aliveCount('shift') === 0) {
    rounds.endRound('crew', 'All five guards are down.');
  } else if (!playerAlive && bots.aliveCount('crew') === 0) {
    rounds.endRound('shift', 'The crew is wiped out.');
  }
}

const grenadeProbe = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 12 * dt;
    const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
    grenadeProbe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
    grenadeProbe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
    const hitsWall = map.colliders.some((box) => grenadeProbe.intersectsBox(box));
    if (hitsWall) {
      grenade.velocity.multiplyScalar(-0.35);
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.4 + 1;
    } else {
      grenade.mesh.position.copy(next);
    }
    if (grenade.mesh.position.y < 0.09) {
      grenade.mesh.position.y = 0.09;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.4;
      grenade.velocity.x *= 0.7;
      grenade.velocity.z *= 0.7;
    }
    if (grenade.fuse <= 0) {
      grenades.splice(i, 1);
      if (grenade.type === 'smoke') {
        scene.remove(grenade.mesh);
        deploySmoke(grenade);
      } else {
        explodeGrenade(grenade);
      }
    }
  }
}

function handleBuyKeys() {
  if (!buyOpen || rounds.state.phase !== 'buy') return;
  const money = rounds.state;
  if (input.consume('Digit1') && !weapons.state.owned.rifle) {
    if (rounds.spend(WEAPONS.rifle.price)) {
      weapons.grant('rifle');
      weapons.select('rifle');
      audio.buy();
    }
  } else if (input.consume('Digit2')) {
    if (rounds.spend(200)) {
      weapons.refillAmmo();
      audio.buy();
    }
  } else if (input.consume('Digit3')) {
    if (rounds.spend(GRENADE_PRICE)) {
      weapons.grant('grenade');
      audio.buy();
    }
  } else if (input.consume('Digit4') && weapons.state.armor < 100) {
    if (rounds.spend(ARMOR_PRICE)) {
      weapons.grant('armor');
      audio.buy();
    }
  } else if (input.consume('Digit5')) {
    if (rounds.spend(SMOKE_PRICE)) {
      weapons.grant('smoke');
      audio.buy();
    }
  } else if (input.consume('Digit6') && !weapons.state.owned.dmr) {
    if (rounds.spend(WEAPONS.dmr.price)) {
      weapons.grant('dmr');
      weapons.select('dmr');
      audio.buy();
    }
  } else if (input.consume('Digit7') && !weapons.state.owned.shotgun) {
    if (rounds.spend(SHOTGUN_PRICE)) {
      weapons.grant('shotgun');
      weapons.select('shotgun');
      audio.buy();
    }
  }
  hud.showBuy(true, money.money, weapons.state.owned, weapons.state.grenades);
}

function step(dt) {
  elapsed += dt;
  map.updateWeather(dt);
  const phase = rounds.state.phase;
  if (phase === 'buy' || phase === 'live') {
    if (playerAlive) player.step(dt, input.state.keys);
    weapons.step(dt);
    botEnv.playerAlive = playerAlive;
    botEnv.playerEye = body.eye;
    botEnv.time = elapsed;
    bots.step(dt, botEnv);
    stepGrenades(dt);
    stepSmokes(dt);
    stepTracers(dt);

    // Planting: hold E inside a site.
    let inSite = null;
    for (const [key, site] of Object.entries(map.sites)) {
      const dx = body.position.x - site.center.x;
      const dz = body.position.z - site.center.z;
      if (Math.hypot(dx, dz) < site.radius) inSite = key;
    }
    if (phase === 'live' && playerAlive && inSite && input.state.keys.has('KeyE')) {
      const planted = rounds.plantTick(dt, inSite, body.position);
      hud.setPlant(rounds.state.bomb.plantProgress / 3);
      if (planted) {
        placeBombMesh(inSite);
        audio.plant();
        hud.banner('CHARGE PLANTED', `Site ${inSite} — 40 seconds to detonation`);
        hud.feed('You planted the charge', 'good');
      }
    } else {
      rounds.plantReset();
      hud.setPlant(null);
    }

    const event = rounds.tick(dt);
    if (event === 'beep') audio.beep();
    if (phase === 'buy' && rounds.state.phase === 'live') {
      buyOpen = false;
      hud.showBuy(false, 0, false, 0);
      hud.banner(`ROUND ${rounds.state.round} — CREW ${rounds.state.score.crew} : ${rounds.state.score.shift} SHIFT`, 'Plant the charge or drop the shift');
    }
    if (phase === 'live' && !rounds.state.bomb.planted && rounds.state.phaseLeft <= 0) {
      rounds.endRound('shift', 'Time expired — the charge was never planted.');
    }
  }

  // Phase transitions: overlays, sounds, pointer release.
  if (rounds.state.phase === 'ended' && phase !== 'ended') {
    const reason = rounds.state.endReason;
    if (reason.includes('detonat')) {
      audio.explosion();
      const flash = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 80, 30, 1.4);
      flash.position.set(rounds.state.bomb.position.x, 2, rounds.state.bomb.position.z);
      scene.add(flash);
      setTimeout(() => scene.remove(flash), 300);
    }
    clearBombMesh();
    if (rounds.state.endWinner === 'crew') audio.roundWin();
    else audio.roundLose();
    hud.showOverlay('round', { winner: rounds.state.endWinner, reason, earned: rounds.state.earned });
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (rounds.state.phase === 'match' && phase !== 'match') {
    if (rounds.state.matchWinner === 'crew') audio.roundWin();
    else audio.roundLose();
    hud.showOverlay('match', {
      winner: rounds.state.matchWinner,
      crew: rounds.state.score.crew,
      shift: rounds.state.score.shift,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // One-shot keys, drained every fixed step.
  if (input.consume('KeyR')) weapons.reload();
  if (input.consume('KeyG') && phase === 'live' && playerAlive) throwGrenade('frag');
  if (input.consume('KeyH') && phase === 'live' && playerAlive) throwGrenade('smoke');
  if (input.consume('KeyB') && rounds.state.phase === 'buy') {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen, rounds.state.money, weapons.state.owned, weapons.state.grenades);
  }
  if (!buyOpen) {
    if (input.consume('Digit1')) weapons.select('pistol');
    if (input.consume('Digit2')) weapons.select('rifle');
    if (input.consume('Digit3')) weapons.select('dmr');
    if (input.consume('Digit4')) weapons.select('shotgun');
  }
  handleBuyKeys();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const phase = rounds.state.phase;
    // Aim-down-sights: right mouse narrows the field of view, steadies the hands
    // and tightens the spread — stopping to aim pays, firing on the move does not.
    const aiming = input.state.aiming && playerAlive && (phase === 'buy' || phase === 'live');
    const fovTarget = aiming ? 58 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.05) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    player.look(look.x, look.y, aiming ? 0.0012 : 0.0022);
    if ((phase === 'buy' || phase === 'live') && playerAlive) {
      const firing = input.state.firing;
      const def = weapons.def();
      const wantFire = def.auto ? firing : firing && !prevFiring;
      if (wantFire && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed(), aiming));
      else if (firing && !weapons.ready() && weapons.state.mag[weapons.state.current] === 0) weapons.reload();
      prevFiring = firing;
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD refresh (cheap: setText caches by value).
    const def = weapons.def();
    hud.setHealth(health, weapons.state.armor);
    hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], def.name.toUpperCase(), weapons.state.grenades);
    hud.setMoney(rounds.state.money);
    const bomb = rounds.state.bomb;
    hud.setObjective(bomb.planted
      ? `DEFEND THE CHARGE @ SITE ${bomb.site} — ${Math.ceil(bomb.detonateLeft)}s`
      : rounds.state.phase === 'buy' ? 'BUY PHASE — SPEND YOUR $ · B TO CLOSE'
      : rounds.state.phase === 'live' ? 'PLANT THE CHARGE AT A OR B — HOLD E'
      : 'NEON DOCKS');
    if (bomb.planted) {
      hud.setTimer(bomb.detonateLeft, 'live');
      hud.setBomb(`CHARGE @ SITE ${bomb.site} — DEFUSE ${Math.round(bomb.defuseProgress * 100)}%`);
    } else {
      hud.setTimer(rounds.state.phaseLeft, rounds.state.phase);
      hud.setBomb('');
    }
    hud.setScore(rounds.state.score.crew, rounds.state.score.shift, rounds.state.round);
    hud.crosshairSpread(4 + weapons.spread(player.groundSpeed(), aiming) * 260);
    hud.tickDamage(camera, dt);
    // Minimap at ~8 Hz: the picture changes slowly, so it never costs a frame.
    minimapTimer += dt;
    if (minimapTimer >= 0.12) {
      minimapTimer = 0;
      minimap.draw({
        player: body.position,
        yaw: body.yaw,
        bots: bots.bots,
        bomb: rounds.state.bomb,
        time: elapsed,
      });
    }
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (playerAlive && (rounds.state.phase === 'buy' || rounds.state.phase === 'live')) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  const phase = rounds.state.phase;
  if (phase === 'match') {
    startMatch();
  } else if (phase === 'ended') {
    rounds.nextRound();
    resetRound();
  }
  input.requestLock();
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  buyOpen = false;
  hud.showBuy(false, 0, false, 0);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0.6, 0, 13.4);
    settle(20);
    aimAt(new THREE.Vector3(0, 4.2, -16));
    hud.showOverlay('start');
  } else if (name === 'play') {
    rounds.beginLive();
    body.position.set(0, 0, 8);
    settle(20);
    const guard = bots.bots.find((bot) => bot.team === 'shift');
    guard.position.set(1.5, 0, 2);
    guard.yaw = Math.PI;
    guard.parts.group.position.copy(guard.position);
    guard.parts.group.rotation.y = guard.yaw;
    settle(6);
    // Showcase the v3 shotgun: one close blast at the guard, eight pellets,
    // then the smoke throw after the kill.
    weapons.grant('shotgun');
    weapons.select('shotgun');
    aimAt(new THREE.Vector3(guard.position.x, 1.3, guard.position.z));
    shoot(0);
    settle(10);
    aimAt(new THREE.Vector3(guard.position.x, 1.55, guard.position.z));
    settle(6);
    // Showcase the smoke grenade: lob one at the west stack, let it pop, then
    // look back at the dropped guard for the frozen frame.
    weapons.grant('smoke');
    aimAt(new THREE.Vector3(-8, 1.5, -2));
    throwGrenade('smoke');
    settle(80);
    aimAt(new THREE.Vector3(guard.position.x, 1.55, guard.position.z));
    settle(6);
  } else if (name === 'bomb') {
    rounds.beginLive();
    rounds.state.bomb.planted = true;
    rounds.state.bomb.site = 'A';
    rounds.state.bomb.detonateLeft = 38;
    rounds.state.bomb.position = map.sites.A.center.clone();
    placeBombMesh('A');
    body.position.set(-18.5, 0, -5.5);
    settle(20);
    const guard = bots.bots.find((bot) => bot.team === 'shift');
    guard.position.set(-18, 0, -11);
    guard.yaw = Math.atan2(body.position.x + 18, body.position.z + 11);
    guard.parts.group.position.copy(guard.position);
    guard.parts.group.rotation.y = guard.yaw;
    aimAt(new THREE.Vector3(-16, 0.3, -9));
    // Lightning flash lights the planted site for this frame.
    map.flashOnce();
    settle(6);
  } else {
    rounds.endRound('crew', 'All five guards are down.');
    hud.showOverlay('round', { winner: 'crew', reason: 'All five guards are down.', earned: rounds.state.earned });
    body.position.set(0, 0, 10);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
  }
  hud.setHealth(health, weapons.state.armor);
  const def = weapons.def();
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], def.name.toUpperCase(), weapons.state.grenades);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.score.crew, rounds.state.score.shift, rounds.state.round);
  hud.setTimer(rounds.state.bomb.planted ? rounds.state.bomb.detonateLeft : rounds.state.phaseLeft, rounds.state.phase);
  if (rounds.state.bomb.planted) {
    hud.setBomb('CHARGE @ SITE A');
    hud.setObjective('DEFEND THE CHARGE @ SITE A — 38s');
  }
  // Shot mode never runs frame(): draw the minimap and place damage numbers once,
  // or the capture would show a blank map and numbers stuck at the corner.
  // The camera has never rendered yet, so refresh its matrices first — without
  // this, project() uses a stale matrixWorldInverse and the numbers land off-screen.
  scene.updateMatrixWorld(true);
  minimap.draw({
    player: body.position,
    yaw: body.yaw,
    bots: bots.bots,
    bomb: rounds.state.bomb,
    time: elapsed,
  });
  hud.tickDamage(camera, 0);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startMatch();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
