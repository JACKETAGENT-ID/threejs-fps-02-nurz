// NEON DOCKS — the look plan in one place. A night container yard: deep navy sky,
// wet asphalt, teal and rust containers, sodium lamps and one cyan neon sign.
// The same names are the CSS custom properties in index.html.
import * as THREE from 'three';

export const PALETTE = {
  night: '#0b1220', // sky / fog
  asphalt: '#1a2230', // ground
  concrete: '#2a3242', // walls and pads
  steel: '#3a4556', // crane and gantries
  teal: '#1f6f6b', // container paint A
  rust: '#a4552c', // container paint B
  olive: '#5c6238', // container paint C
  slate: '#4a5a6a', // container paint D
  sodium: '#f5a623', // lamp glow
  neon: '#35e0d2', // cyan neon accent
  ink: '#e8ecf1', // HUD text
  muted: '#8b98a8', // secondary text
  danger: '#e5484d', // enemy markers / bomb
};

// One shared material per palette entry, so the scene stays cheap.
const cache = new Map();
export function material(name, extra = {}) {
  const key = name + JSON.stringify(extra);
  if (!cache.has(key)) {
    cache.set(
      key,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[name]),
        roughness: extra.roughness ?? 0.88,
        metalness: extra.metalness ?? 0.08,
        emissive: extra.emissive ? new THREE.Color(PALETTE[extra.emissive]) : new THREE.Color(0x000000),
        emissiveIntensity: extra.emissiveIntensity ?? 0,
      }),
    );
  }
  return cache.get(key);
}

// A corrugated-steel texture drawn once on a canvas, so container sides read as steel
// without any image file or network request. One texture per paint colour.
const textureCache = new Map();
export function containerTexture(paint) {
  if (textureCache.has(paint)) return textureCache.get(paint);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE[paint];
  ctx.fillRect(0, 0, 256, 128);
  // Vertical ridges: alternating light and dark stripes.
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, 0, 3, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 8, 0, 4, 128);
  }
  // Grime near the bottom and a stencilled number band near the top.
  const grime = ctx.createLinearGradient(0, 96, 0, 128);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 96, 256, 32);
  ctx.fillStyle = 'rgba(232,236,241,0.75)';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('NDCU 481 902', 14, 30);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(paint, texture);
  return texture;
}

export function containerMaterial(paint) {
  return new THREE.MeshStandardMaterial({
    map: containerTexture(paint),
    roughness: 0.82,
    metalness: 0.25,
  });
}

// A small emissive panel: lamp tubes, neon signs, bomb-site markers.
export function glowMaterial(name, intensity = 2.2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE[name]),
    toneMapped: false,
  });
}
