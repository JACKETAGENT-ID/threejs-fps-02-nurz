// The bots: two crew mates and five shift guards, all driven by the same controller.
// Each bot walks a waypoint route, holds and scans, reacts to gunfire it hears, and
// fights with aimed bursts. When the bomb is planted the shift bots converge to defuse.
import * as THREE from 'three';
import { createMover, hasLineOfSight } from './collide.js';
import { PALETTE } from './palette.js';

const BOT_NAMES = {
  crew: ['REEF', 'MARA'],
  shift: ['VOLT', 'JINX', 'ORION', 'PICO', 'SLATE'],
};
const BOT_SPEED = 3.4;
const BOT_RUSH_SPEED = 4.4;
const BOT_HEALTH = 100;
const EYE_HEIGHT = 1.55;
const COMBAT_RANGE = 42;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.12;
const DEFUSE_SECONDS = 5;

function buildBotMesh(scene, team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'crew' ? '#274b4a' : '#4a2727'), roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c2129'), roughness: 0.7, metalness: 0.2 });
  const visor = new THREE.MeshBasicMaterial({ color: new THREE.Color(team === 'crew' ? PALETTE.neon : PALETTE.danger) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.26), dark);
  legs.position.y = 0.39;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.y = 1.09;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), dark);
  head.position.y = 1.56;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), visor);
  strip.position.set(0, 1.58, -0.16);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.62), dark);
  gun.position.set(0.24, 1.18, -0.2);
  group.add(legs, torso, head, strip, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, gun };
}

export function createBots(scene, map) {
  const raycaster = new THREE.Raycaster();
  const mover = createMover(map.colliders, 0.34, 1.72);
  const bots = [];
  const hitMeshes = [];
  const tracers = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });

  function nearestNode(x, z) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < map.waypoints.length; i += 1) {
      const node = map.waypoints[i];
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }

  function spawn(team, index) {
    const spawnPoint = map.spawns[team][index % map.spawns[team].length];
    const parts = buildBotMesh(scene, team);
    const bot = {
      team,
      name: BOT_NAMES[team][index % BOT_NAMES[team].length],
      position: spawnPoint.clone(),
      velocity: new THREE.Vector3(),
      yaw: team === 'crew' ? Math.PI : 0,
      health: BOT_HEALTH,
      alive: true,
      node: nearestNode(spawnPoint.x, spawnPoint.z),
      targetNode: -1,
      holdLeft: 0,
      lane: ['A', 'mid', 'B'][index % 3],
      state: 'advance',
      aimTime: 0,
      burstLeft: 0,
      shotTimer: 0,
      fall: 0,
      defuseLeft: 0,
      suspicion: null,
      suspicionUntil: 0,
      parts,
    };
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'torso';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  function addTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    scene.add(line);
    tracers.push({ line, left: 0.09 });
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Being shot makes a bot snap toward the shooter and take cover briefly.
      bot.holdLeft = 0.6;
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    bot.defuseLeft = 0;
    return true;
  }

  function damageInRadius(center, radius, amount) {
    let kills = 0;
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = bot.position.distanceTo(center);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.6;
      if (damage(bot, amount * falloff, 'torso')) kills += 1;
    }
    return kills;
  }

  // Greedy step toward a goal node: follow the link that gets closest to it.
  function stepTowardNode(bot, goal, dt, speed) {
    const node = map.waypoints[bot.node];
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      if (bot.node === goal) return true;
      let next = bot.node;
      let best = Infinity;
      for (const link of node.links) {
        const target = map.waypoints[link];
        const goalNode = map.waypoints[goal];
        const d = (target.x - goalNode.x) ** 2 + (target.z - goalNode.z) ** 2;
        if (d < best) {
          best = d;
          next = link;
        }
      }
      bot.node = next;
      return false;
    }
    bot.velocity.x = (dx / dist) * speed;
    bot.velocity.z = (dz / dist) * speed;
    bot.yaw = Math.atan2(dx, dz);
    mover.move(bot, dt, 20, 1.72);
    bot.velocity.x = 0;
    bot.velocity.z = 0;
    return false;
  }

  function visibleEnemy(bot, env) {
    // Returns {kind, bot|player, eye, distance} for the closest visible enemy, if any.
    let best = null;
    const eye = new THREE.Vector3(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
    const candidates = [];
    // The player fights for the crew: only shift bots treat the player as an enemy.
    if (env.playerAlive && bot.team === 'shift') candidates.push({ kind: 'player', eye: new THREE.Vector3(env.playerPos.x, env.playerPos.y + env.playerEye, env.playerPos.z), ref: null });
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', eye: new THREE.Vector3(other.position.x, other.position.y + EYE_HEIGHT, other.position.z), ref: other });
    }
    for (const candidate of candidates) {
      const distance = eye.distanceTo(candidate.eye);
      if (distance > COMBAT_RANGE) continue;
      if (!hasLineOfSight(map.shootables, eye, candidate.eye, raycaster)) continue;
      if (!best || distance < best.distance) best = { ...candidate, distance };
    }
    return best;
  }

  function step(dt, env) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.parts.group.rotation.x = -bot.fall * 1.5;
          bot.parts.group.position.y = -bot.fall * 0.25;
        }
        continue;
      }
      bot.parts.group.position.copy(bot.position);
      bot.parts.group.rotation.y = bot.yaw;

      const enemy = visibleEnemy(bot, env);
      if (enemy) {
        // Face the enemy and fire in bursts; aim tightens the longer the bot sees them.
        const dx = enemy.eye.x - bot.position.x;
        const dz = enemy.eye.z - bot.position.z;
        bot.yaw = Math.atan2(dx, dz);
        bot.aimTime = Math.min(2.2, bot.aimTime + dt);
        bot.shotTimer -= dt;
        if (bot.burstLeft <= 0 && bot.shotTimer <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(env.rng() * (BURST_MAX - BURST_MIN + 1));
          bot.shotTimer = 0.5 + env.rng() * 0.4;
        }
        if (bot.burstLeft > 0 && bot.shotTimer <= 0) {
          bot.burstLeft -= 1;
          bot.shotTimer = SHOT_GAP;
          const spread = 0.05 + 0.09 * (1 - bot.aimTime / 2.2) + enemy.distance * 0.0012;
          const hit = env.rng() > spread * 4;
          const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.25, bot.position.z);
          addTracer(muzzle, enemy.eye);
          if (hit) {
            const damageAmount = 11 + env.rng() * 9;
            if (enemy.kind === 'player') env.damagePlayer(damageAmount, bot);
            else if (damage(enemy.ref, damageAmount, 'torso')) env.onKill(bot, enemy.ref);
          }
          env.onBotShot(bot.position);
        }
        continue;
      }
      bot.aimTime = 0;

      // No enemy in sight: follow the plan.
      if (bot.holdLeft > 0) {
        bot.holdLeft -= dt;
        continue;
      }
      let goal = bot.targetNode;
      if (env.bomb.planted && bot.team === 'shift') {
        goal = env.bomb.site === 'A' ? 14 : 15;
      } else if (env.bomb.planted && bot.team === 'crew') {
        goal = env.bomb.site === 'A' ? 19 : 20;
      } else if (goal < 0) {
        goal = bot.lane === 'A' ? 14 : bot.lane === 'B' ? 15 : 16;
        bot.targetNode = goal;
      }
      if (bot.suspicion && env.time < bot.suspicionUntil && !env.bomb.planted) {
        goal = nearestNode(bot.suspicion.x, bot.suspicion.z);
      }
      const arrived = stepTowardNode(bot, goal, dt, env.bomb.planted ? BOT_RUSH_SPEED : BOT_SPEED);
      if (arrived) {
        if (env.bomb.planted && bot.team === 'shift') {
          // At the planted site: channel the defuse.
          bot.defuseLeft += dt;
          env.onDefuse(bot.defuseLeft / DEFUSE_SECONDS);
          if (bot.defuseLeft >= DEFUSE_SECONDS) env.onDefused(bot);
        } else {
          bot.holdLeft = 1 + env.rng() * 2.5;
        }
      }
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].left -= dt;
      if (tracers[i].left <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  function hearNoise(position, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.position.distanceTo(position) < 26) {
        bot.suspicion = position.clone();
        bot.suspicionUntil = time + 6;
      }
    }
  }

  function reset() {
    for (const bot of bots) {
      scene.remove(bot.parts.group);
    }
    bots.length = 0;
    hitMeshes.length = 0;
    for (const tracer of tracers) scene.remove(tracer.line);
    tracers.length = 0;
    for (let i = 0; i < 2; i += 1) spawn('crew', i);
    for (let i = 0; i < 5; i += 1) spawn('shift', i);
  }

  return {
    bots,
    hitMeshes,
    spawn,
    step,
    damage,
    damageInRadius,
    hearNoise,
    reset,
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
  };
}
