// Live tactical minimap: a top-down canvas of the yard, drawn from the map's own
// colliders and sites, so it can never drift out of sync with the level. Dots are
// the crew (cyan), the shift (red) and the player (white arrow); a planted charge
// pulses on its site. Redrawn at ~8 Hz from main.js, never every frame.
export function createMinimap(canvas, mapData) {
  const ctx = canvas.getContext('2d');
  const { bounds, rects, sites } = mapData;
  const W = canvas.width;
  const H = canvas.height;

  function toMap(x, z) {
    return [
      ((x - bounds.x) / bounds.w) * W,
      ((z - bounds.z) / bounds.h) * H,
    ];
  }

  function drawRects() {
    ctx.fillStyle = '#101a2c';
    ctx.fillRect(0, 0, W, H);
    for (const rect of rects) {
      const [x, z] = toMap(rect.x0, rect.z0);
      const [x2, z2] = toMap(rect.x1, rect.z1);
      ctx.fillStyle = rect.color;
      ctx.fillRect(x, z, Math.max(1.5, x2 - x), Math.max(1.5, z2 - z));
    }
  }

  function drawSites(bomb, time) {
    for (const [key, site] of Object.entries(sites)) {
      const [x, z] = toMap(site.center.x, site.center.z);
      const planted = bomb.planted && bomb.site === key;
      ctx.beginPath();
      ctx.arc(x, z, planted ? 7 + Math.sin(time * 6) * 1.5 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = planted ? '#ff5a5f' : 'rgba(229,72,77,0.7)';
      ctx.lineWidth = planted ? 2.5 : 1.5;
      ctx.stroke();
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, x, z - 9);
    }
  }

  return {
    draw(state) {
      drawRects();
      drawSites(state.bomb, state.time);
      for (const bot of state.bots) {
        if (!bot.alive) continue;
        const [x, z] = toMap(bot.position.x, bot.position.z);
        ctx.beginPath();
        ctx.arc(x, z, bot.team === 'crew' ? 3 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = bot.team === 'crew' ? '#35e0d2' : '#e5484d';
        ctx.fill();
      }
      // Player arrow, rotated by yaw.
      const [px, pz] = toMap(state.player.x, state.player.z);
      const yaw = state.yaw;
      ctx.save();
      ctx.translate(px, pz);
      // Canvas up is -z; forward is (-sin yaw, -cos yaw), so the arrow turns by
      // atan2(-sin yaw, cos yaw): yaw 0 points up, yaw +PI/2 points left.
      ctx.rotate(Math.atan2(-Math.sin(yaw), Math.cos(yaw)));
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#2a3648';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    },
  };
}
