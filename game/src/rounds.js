// Rounds and money: buy phase, round timer, the bomb, and the match score. First to
// five rounds takes the match. Money is earned for kills, plants and round wins, and
// spent in the buy menu between rounds.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3;
export const DETONATE_SECONDS = 40;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1400;
export const PLANT_REWARD = 300;

export function createRounds() {
  const state = {
    phase: 'buy', // buy | live | ended | match
    round: 1,
    score: { crew: 0, shift: 0 },
    money: 800,
    phaseLeft: BUY_SECONDS,
    bomb: {
      planted: false,
      site: null,
      plantProgress: 0,
      plantSite: null,
      detonateLeft: 0,
      defuseProgress: 0,
      position: null,
    },
    endReason: '',
    endWinner: null,
    matchWinner: null,
    beepTimer: 0,
    // Earnings this round, for the round-end recap: what the money came from.
    earned: { kills: 0, plant: 0, round: 0 },
  };

  function startRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.earned.kills = 0;
    state.earned.plant = 0;
    state.earned.round = 0;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.plantProgress = 0;
    state.bomb.plantSite = null;
    state.bomb.detonateLeft = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.position = null;
    state.endReason = '';
    state.endWinner = null;
  }

  function endRound(winner, reason) {
    if (state.phase === 'ended' || state.phase === 'match') return;
    state.phase = 'ended';
    state.endWinner = winner;
    state.endReason = reason;
    state.score[winner] += 1;
    const reward = winner === 'crew' ? WIN_REWARD : LOSS_REWARD;
    state.money += reward;
    state.earned.round = reward;
    if (state.score.crew >= WIN_ROUNDS || state.score.shift >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      state.matchWinner = state.score.crew > state.score.shift ? 'crew' : state.score.shift > state.score.crew ? 'shift' : 'draw';
    }
  }

  return {
    state,
    startRound,
    startMatch() {
      state.round = 1;
      state.score.crew = 0;
      state.score.shift = 0;
      state.money = 800;
      state.matchWinner = null;
      startRound();
    },
    nextRound() {
      state.round += 1;
      startRound();
    },
    endRound,
    earn(amount, kind = 'kills') {
      state.money += amount;
      if (kind === 'plant') state.earned.plant += amount;
      else state.earned.kills += amount;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    beginLive() {
      if (state.phase === 'buy') {
        state.phase = 'live';
        state.phaseLeft = ROUND_SECONDS;
      }
    },
    // Called every fixed step while the player holds E inside a site.
    plantTick(dt, site, position) {
      if (state.phase !== 'live' || state.bomb.planted) return false;
      if (state.bomb.plantSite !== site) {
        state.bomb.plantSite = site;
        state.bomb.plantProgress = 0;
      }
      state.bomb.plantProgress += dt;
      if (state.bomb.plantProgress >= PLANT_SECONDS) {
        state.bomb.planted = true;
        state.bomb.site = site;
        state.bomb.position = position.clone();
        state.bomb.detonateLeft = DETONATE_SECONDS;
        state.bomb.plantProgress = 0;
        state.bomb.plantSite = null;
        this.earn(PLANT_REWARD, 'plant');
        return true;
      }
      return false;
    },
    plantReset() {
      state.bomb.plantProgress = 0;
      state.bomb.plantSite = null;
    },
    setDefuse(progress) {
      state.bomb.defuseProgress = progress;
    },
    // Timer bookkeeping; returns a beep event when the planted bomb ticks.
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'live') {
        state.phaseLeft -= dt;
        if (state.phase === 'buy' && state.phaseLeft <= 0) this.beginLive();
      }
      if (state.bomb.planted) {
        state.bomb.detonateLeft -= dt;
        state.beepTimer -= dt;
        if (state.beepTimer <= 0) {
          state.beepTimer = Math.max(0.35, state.bomb.detonateLeft / 40);
          return 'beep';
        }
        if (state.bomb.detonateLeft <= 0) endRound('crew', 'The charge detonated site ' + state.bomb.site + '.');
      }
      return null;
    },
  };
}
