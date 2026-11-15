// The DOM HUD: health, ammo, money, timer, score, kill feed, buy menu, bomb status and
// the overlays. It never touches the simulation; main.js pushes numbers in.
import * as THREE from 'three';

const COPY = {
  start: {
    title: 'NEON DOCKS',
    copy: 'A night container yard. Plant the charge at CRANE or WAREHOUSE, or drop all five guards. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: { title: 'NEON DOCKS', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  round: { title: '', copy: '', action: 'Next round' },
  match: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  // Floating damage numbers: a small pool of divs, each pinned to a world point
  // and projected to the screen every frame while it lives.
  const damageNums = [];
  const damageScratch = new THREE.Vector3();

  function setText(id, value) {
    if (last[id] === value) return;
    last[id] = value;
    $(id).textContent = value;
  }

  return {
    setHealth(hp, armor) {
      setText('health-num', String(Math.max(0, Math.ceil(hp))));
      setText('armor-num', String(Math.max(0, Math.ceil(armor))));
      const bar = $('health-bar');
      bar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      bar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weaponName, grenades) {
      setText('ammo-mag', String(mag));
      setText('ammo-reserve', `/ ${reserve}`);
      setText('weapon-name', weaponName);
      setText('grenades', `FRAG × ${grenades.frag} · SMOKE × ${grenades.smoke}`);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) { setText('money', `$${value}`); },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(total / 60);
      const ss = String(total % 60).padStart(2, '0');
      setText('timer', `${mm}:${ss}`);
      $('timer').classList.toggle('buy', phase === 'buy');
      $('timer').classList.toggle('danger', phase === 'live' && total <= 15);
    },
    setScore(crew, shift, round) {
      setText('score-crew', String(crew));
      setText('score-shift', String(shift));
      setText('round-num', `ROUND ${round}`);
    },
    setObjective(text) {
      setText('objective', text);
    },
    setBomb(text) {
      setText('bomb-status', text);
      $('bomb-status').hidden = !text;
    },
    setPlant(progress) {
      const bar = $('plant-bar');
      if (progress === null) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      $('plant-fill').style.width = `${Math.round(progress * 100)}%`;
      $('plant-label').textContent = progress >= 1 ? 'PLANTED' : 'PLANTING…';
    },
    feed(text, kind = '') {
      const feed = $('feed');
      const line = document.createElement('div');
      line.className = `feed-line ${kind}`;
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
    },
    banner(text, sub = '') {
      setText('banner-text', text);
      setText('banner-sub', sub);
      $('banner').hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { $('banner').hidden = true; }, 3200);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      $('banner').hidden = true;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.remove('on');
      void damage.offsetWidth;
      damage.classList.add('on');
    },
    addDamage(position, amount, killed) {
      let slot = damageNums.find((d) => d.life <= 0);
      if (!slot) {
        if (damageNums.length >= 8) return;
        const el = document.createElement('div');
        el.className = 'dmg-num';
        $('hud').appendChild(el);
        slot = { el, life: 0, position: new THREE.Vector3() };
        damageNums.push(slot);
      }
      slot.position.copy(position);
      slot.life = 0.8;
      slot.el.textContent = (killed ? '✕ ' : '') + String(amount);
      slot.el.classList.toggle('kill', killed);
      slot.el.style.opacity = '1';
    },
    tickDamage(camera, dt) {
      for (const slot of damageNums) {
        if (slot.life <= 0) {
          slot.el.style.opacity = '0';
          continue;
        }
        slot.life -= dt;
        slot.position.y += dt * 0.5;
        damageScratch.copy(slot.position).project(camera);
        if (damageScratch.z > 1) {
          slot.el.style.opacity = '0';
          continue;
        }
        const x = (damageScratch.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-damageScratch.y * 0.5 + 0.5) * window.innerHeight;
        slot.el.style.left = `${x}px`;
        slot.el.style.top = `${y}px`;
        slot.el.style.opacity = String(Math.max(0, slot.life / 0.8));
      }
    },
    crosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    showBuy(open, money, owned, grenades) {
      $('buymenu').hidden = !open;
      if (open) {
        setText('buy-money', `$${money}`);
        $('buy-rifle').classList.toggle('owned', owned.rifle);
        $('buy-dmr').classList.toggle('owned', owned.dmr);
        $('buy-shotgun').classList.toggle('owned', owned.shotgun);
        setText('buy-grenade', `3 · Frag grenade — $400 (own ${grenades.frag})`);
        setText('buy-smoke', `5 · Smoke grenade — $300 (own ${grenades.smoke})`);
      }
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'round') {
        title.textContent = data.winner === 'crew' ? 'ROUND WON' : 'ROUND LOST';
        const earned = data.earned;
        const recap = earned
          ? ` Earned $${earned.kills + earned.plant + earned.round} — kills $${earned.kills}, plant $${earned.plant}, round $${earned.round}.`
          : '';
        copy.textContent = (data.reason || '') + recap;
      } else if (mode === 'match') {
        title.textContent = data.winner === 'crew' ? 'MATCH WON' : data.winner === 'draw' ? 'MATCH DRAWN' : 'MATCH LOST';
        copy.textContent = `Final score ${data.crew} — ${data.shift}.`;
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
