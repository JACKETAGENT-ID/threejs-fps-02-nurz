// The arsenal: a sidearm every crew member carries, a carbine bought between rounds,
// and a frag grenade. Numbers live here; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36, damage: 25, headDamage: 75,
    gap: 0.18, reload: 1.3, auto: false, spreadStill: 0.004, spreadMoving: 0.03, kick: 0.012,
  },
  rifle: {
    name: 'VK-7 Carbine', price: 2500, mag: 30, reserve: 90, damage: 33, headDamage: 100,
    gap: 0.1, reload: 2.0, auto: true, spreadStill: 0.002, spreadMoving: 0.026, kick: 0.009,
  },
};

export const GRENADE_PRICE = 400;
export const ARMOR_PRICE = 650;

function buildPistolModel() {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a35'), roughness: 0.55, metalness: 0.5 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.7, metalness: 0.15 });
  const group = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), dark);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), grip);
  handle.position.set(0, -0.08, 0.08);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.02), dark);
  sight.position.set(0, 0.04, -0.1);
  group.add(slide, handle, sight);
  return group;
}

function buildRifleModel() {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a35'), roughness: 0.5, metalness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.neon), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.neon), emissiveIntensity: 0.35 });
  const group = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.44), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), dark);
  barrel.position.set(0, 0.03, -0.4);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.24), dark);
  stock.position.set(0, -0.02, 0.32);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), accent);
  handguard.position.set(0, 0.01, -0.28);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), dark);
  mag.position.set(0, -0.12, -0.02);
  mag.rotation.x = 0.2;
  group.add(receiver, barrel, stock, handguard, mag);
  return group;
}

export function createWeapons(camera) {
  const models = {
    pistol: buildPistolModel(),
    rifle: buildRifleModel(),
  };
  for (const [name, model] of Object.entries(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = name === 'pistol';
    camera.add(model);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.19),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: true, rifle: false },
    mag: { pistol: WEAPONS.pistol.mag, rifle: WEAPONS.rifle.mag },
    reserve: { pistol: WEAPONS.pistol.reserve, rifle: WEAPONS.rifle.reserve },
    grenades: 0,
    armor: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };

  function currentDef() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.0;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 28;
    flashLight.intensity = state.flash > 0 ? 10 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.5 * Math.min(1, (currentDef().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = currentDef();
        const need = def.mag - state.mag[state.current];
        const take = Math.min(need, state.reserve[state.current]);
        state.mag[state.current] += take;
        state.reserve[state.current] -= take;
      }
    }
  }

  return {
    state,
    step,
    def() { return currentDef(); },
    select(name) {
      if (!state.owned[name] || state.reloadLeft > 0) return false;
      state.current = name;
      for (const [key, model] of Object.entries(models)) model.visible = key === name;
      return true;
    },
    ready() {
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = 0.05;
    },
    takeRound() {
      if (state.mag[state.current] <= 0) return false;
      state.mag[state.current] -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      if (state.reloadLeft > 0 || state.mag[state.current] === def.mag || state.reserve[state.current] === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMoving;
    },
    buy(name) {
      if (name === 'grenade') return GRENADE_PRICE;
      if (name === 'armor') return ARMOR_PRICE;
      return WEAPONS[name] ? WEAPONS[name].price : -1;
    },
    grant(name) {
      if (name === 'grenade') state.grenades += 1;
      else if (name === 'armor') state.armor = 100;
      else if (WEAPONS[name]) {
        state.owned[name] = true;
        state.mag[name] = WEAPONS[name].mag;
        state.reserve[name] = WEAPONS[name].reserve;
      }
    },
    throwGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    refillAmmo() {
      for (const name of Object.keys(WEAPONS)) {
        if (state.owned[name]) {
          state.mag[name] = WEAPONS[name].mag;
          state.reserve[name] = WEAPONS[name].reserve;
        }
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
