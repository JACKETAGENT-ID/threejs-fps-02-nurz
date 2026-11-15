// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Edge-triggered keys (reload, buy, plant, grenade, weapon swap)
// are queued here and consumed once by main.js each fixed step.
import * as THREE from 'three';

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    // True once per physical press; main.js drains the queue every fixed step.
    consume(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearQueue() {
      pressed.clear();
    },
  };
}

// A reusable scratch vector for ray work, so hot loops allocate nothing.
export const SCRATCH = new THREE.Vector3();
