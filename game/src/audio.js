// Procedural sound: every effect is synthesized with WebAudio, so the game ships no
// audio files and makes no network request. The context starts on the first click.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ensure()) return;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, duration, type, gainValue, slideTo = 0) {
    if (!ensure()) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'rifle') noiseBurst(0.09, 2600, 0.9);
      else noiseBurst(0.07, 3200, 0.7);
    },
    enemyShot() { noiseBurst(0.08, 1600, 0.35); },
    reload() {
      tone(520, 0.06, 'square', 0.12);
      setTimeout(() => tone(340, 0.06, 'square', 0.12), 180);
    },
    dryClick() { tone(900, 0.04, 'square', 0.1); },
    hit() { tone(1400, 0.05, 'sine', 0.25); },
    kill() { tone(880, 0.09, 'sine', 0.3, 1320); },
    hurt() { tone(180, 0.18, 'sawtooth', 0.3, 90); },
    explosion() {
      noiseBurst(0.7, 420, 1.0);
      tone(70, 0.6, 'sine', 0.5, 34);
    },
    beep() { tone(1180, 0.07, 'square', 0.16); },
    plant() {
      tone(660, 0.1, 'square', 0.2);
      setTimeout(() => tone(990, 0.14, 'square', 0.2), 140);
    },
    roundWin() {
      [523, 659, 784].forEach((freq, i) => setTimeout(() => tone(freq, 0.16, 'sine', 0.25), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((freq, i) => setTimeout(() => tone(freq, 0.18, 'sine', 0.22), i * 140));
    },
    buy() { tone(1040, 0.07, 'sine', 0.2, 1560); },
  };
}
