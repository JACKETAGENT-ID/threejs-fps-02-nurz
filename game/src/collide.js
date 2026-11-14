// One shared mover: a standing box resolved against the world's colliders one axis at a
// time, so a wall never swallows a body and a body can slide along it. The player and the
// bots both walk through this; nothing else in the game moves a body.
import * as THREE from 'three';

export function createMover(colliders, radius, height) {
  const probe = new THREE.Box3();
  const tmpMin = new THREE.Vector3();
  const tmpMax = new THREE.Vector3();

  function overlaps(x, y, z, lift) {
    tmpMin.set(x - radius, y + lift, z - radius);
    tmpMax.set(x + radius, y + height - lift, z + radius);
    probe.min.copy(tmpMin);
    probe.max.copy(tmpMax);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  // Moves body.position by body.velocity * dt; returns true while standing on something.
  // height is passed per call because a crouching body is shorter than a standing one.
  function move(body, dt, gravity, height) {
    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    let grounded = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      grounded = true;
    } else if (hit) {
      body.position.y = hit.min.y - height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      grounded = true;
    }
    body.velocity.y -= gravity * dt;
    body.velocity.y = Math.max(-32, body.velocity.y);
    return grounded;
  }

  return { move, overlaps };
}

// A line-of-sight test: true when nothing solid stands between the two points.
export function hasLineOfSight(shootables, from, to, raycaster) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  if (distance < 0.01) return true;
  direction.normalize();
  raycaster.set(from, direction);
  raycaster.far = distance;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  return !hit;
}
