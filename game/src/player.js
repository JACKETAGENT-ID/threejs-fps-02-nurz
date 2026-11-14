// The player body: acceleration, friction, gravity, jump and crouch, driven by the
// shared mover in collide.js. Speed and spread both punish moving, so stopping to aim pays.
import * as THREE from 'three';
import { createMover } from './collide.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 44;
const AIR_ACCEL = 10;
const FRICTION = 9.5;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders, RADIUS, STAND_HEIGHT);
  const player = {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && player.crouching) {
      // Stand only when the full height fits above the head.
      const probe = new THREE.Box3(
        new THREE.Vector3(player.position.x - RADIUS, player.position.y + 0.02, player.position.z - RADIUS),
        new THREE.Vector3(player.position.x + RADIUS, player.position.y + STAND_HEIGHT - 0.02, player.position.z + RADIUS),
      );
      if (!colliders.some((box) => probe.intersectsBox(box))) {
        player.crouching = false;
        player.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }
    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.onGround = mover.move(player, dt, GRAVITY, player.height);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    reset(spawnPoint) {
      player.position.copy(spawnPoint);
      player.velocity.set(0, 0, 0);
      player.yaw = 0;
      player.pitch = 0;
      player.crouching = false;
      player.height = STAND_HEIGHT;
      player.eye = STAND_EYE;
    },
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
