# Neon Docks — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/JACKETAGENT-ID/threejs-fps-02-nurz/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/JACKETAGENT-ID/threejs-fps-02-nurz/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical shooter in a night container yard (teal/rust + sodium lamps + neon cyan), 44×32 m with 3 lanes (A-long / mid / B-short) and 2 bomb sites — A "CRANE" under the gantry crane, B "WAREHOUSE". You + 2 crew bots vs 5 shift bots; plant the bomb (hold E, 3 s) and defend it until detonation, or clear the shift. First to 5 rounds wins.

## The game

- **Complete loop:** first-person mouse-look + WASD movement, crouch and jump, weapons that fire, reload and run dry, bots that patrol, hold angles and shoot back, rounds that end in a win or a loss, and a HUD with health/armour, ammo, money, round timer and score.
- **Gunplay:** headshots deal ~3× damage, recoil + spread punish firing on the move, ADS (right-click, FOV 74→58, spread ×0.45), player tracers and floating damage numbers.
- **Tactics:** bomb plant/defuse, money earned per round and spent in a buy menu (P9 pistol, VK-7 carbine, K-9 Longshot DMR, frag + smoke grenades, kevlar), live minimap, and three bot archetypes — rusher, holder, sniper — that follow waypoint routes, react to gunfire and converge on a planted bomb.
- **Tech:** three.js 0.187.0 vendored, fixed 60 Hz simulation apart from rendering, procedural WebAudio (no asset files), static files under `game/` — no build step, no network.
