/**
 * All sound is synthesized with WebAudio, so there are no files to ship. Everything takes a
 * `gain` so callers can fade things with distance. The real sound pass (step 6) can replace
 * any of these with samples without changing the call sites.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private ringTimer: number | null = null;
  private breathing: AudioBufferSourceNode | null = null;

  readonly ambience = new Ambience();
  private readonly clips = new Map<string, AudioBuffer>();

  /** Fetch and decode a clip once; later plays are instant. */
  async loadClip(name: string, url: string): Promise<void> {
    if (!this.ctx || this.clips.has(name)) return;
    try {
      const res = await fetch(url);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.clips.set(name, buf);
    } catch (err) {
      console.warn(`clip ${name} failed to load`, err);
    }
  }

  /** Play one of the named clips at random. */
  playClip(names: string[], gain = 1): void {
    if (!this.ctx) return;
    const have = names.filter((n) => this.clips.has(n));
    if (have.length === 0) return;
    const name = have[Math.floor(Math.random() * have.length)]!;
    const src = this.ctx.createBufferSource();
    src.buffer = this.clips.get(name)!;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  }

  /** Browsers only allow audio after a user gesture; call this from the start click. */
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ambience.attach(this.ctx);
  }

  /** Something is suddenly there: a low hit with a sour overtone sliding down. */
  stinger(gain = 1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.tone(55, t, 1.4, 0.25 * gain, "sine");
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 1.1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  /** A burst of static, for switching feeds. */
  static(gain = 1, len = 0.12): void {
    if (!this.ctx || !this.noiseBuffer()) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1500;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.08 * gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  /** Fluorescent tube stuttering. */
  buzz(gain = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      this.tone(120 + i * 7, t + i * 0.045 + Math.random() * 0.02, 0.05, 0.05 * gain, "square");
    }
  }

  /** Two short tones, like a monitor asking for attention. */
  ping(gain = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.08, 0.05 * gain, "square");
    this.tone(1175, t + 0.12, 0.1, 0.05 * gain, "square");
  }

  /** Door chime: two bright notes. */
  chime(gain = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1318, t, 0.35, 0.06 * gain, "sine");
    this.tone(1046, t + 0.18, 0.5, 0.06 * gain, "sine");
  }

  /** One footstep: a soft filtered thud. */
  step(gain = 1): void {
    if (!this.ctx || !this.noiseBuffer()) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.14);
  }

  /** A lock turning. */
  click(gain = 1): void {
    if (!this.ctx || !this.noiseBuffer()) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.08);
  }

  /** The lights going out: a deep thunk and the hum dropping away. */
  thunk(gain = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(70, t, 0.5, 0.2 * gain, "sine");
    this.tone(52, t + 0.05, 0.7, 0.15 * gain, "triangle");
  }

  /** Three knocks on wood. */
  knock(gain = 1): void {
    if (!this.ctx || !this.noiseBuffer()) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.55;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.2);
      this.tone(140, t, 0.12, 0.25 * gain, "sine");
    }
  }

  /** Start the phone ringing (two bursts a second, pause, repeat) until stopRing. */
  startRing(gain = 1): void {
    if (!this.ctx || this.ringTimer !== null) return;
    const burst = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        this.tone(1480, t + i * 0.5, 0.18, 0.05 * gain, "square");
        this.tone(1240, t + i * 0.5 + 0.09, 0.18, 0.05 * gain, "square");
      }
    };
    burst();
    this.ringTimer = window.setInterval(burst, 2000);
  }

  stopRing(): void {
    if (this.ringTimer !== null) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
  }

  /** Breathing on the line, and footsteps that follow the player's a beat behind. */
  startBreathing(gain = 1): void {
    if (!this.ctx || !this.noiseBuffer() || this.breathing) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.28; // one breath every ~3.5 s
    lfoGain.gain.value = 0.05 * gain;
    g.gain.value = 0.05 * gain;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(ctx.destination);
    lfo.start();
    src.start();
    this.breathing = src;
    window.setTimeout(() => this.stopBreathing(), 9000);
  }

  stopBreathing(): void {
    try {
      this.breathing?.stop();
    } catch {
      // already stopped
    }
    this.breathing = null;
  }

  private tone(freq: number, at: number, len: number, peak: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }

  private noiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noise) {
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}

/** Loudness falloff by distance: full within 2 m, faint by 12 m. */
export function distanceGain(d: number): number {
  return 1 / (1 + (d * d) / 12);
}

/** Continuous layers: the fridge hum and the dread drone. Separate so they can be faded, not fired. */
export class Ambience {
  private ctx: AudioContext | null = null;
  private hum: GainNode | null = null;
  private drone: GainNode | null = null;
  private droneLevel = 0;
  private humOn = true;

  attach(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    // Fridge hum: mains frequency with a harmonic, very quiet.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    for (const [f, g] of [
      [50, 1],
      [100, 0.4],
      [150, 0.15],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      o.connect(og).connect(lp).connect(this.hum);
      o.start();
    }
    this.hum.connect(ctx.destination);
    // Dread drone: beating tones around 80–165 Hz, which laptop speakers can actually play,
    // with a dull sawtooth underneath for body.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    for (const [f, type, g] of [
      [82, "sine", 1],
      [82.9, "sine", 1],
      [164.4, "sine", 0.45],
      [41, "sawtooth", 0.25],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;
      o.connect(og).connect(lp).connect(this.drone);
      o.start();
    }
    this.drone.connect(ctx.destination);
    this.setHum(this.humOn);
  }

  setHum(on: boolean): void {
    this.humOn = on;
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    this.hum.gain.cancelScheduledValues(t);
    this.hum.gain.setTargetAtTime(on ? 0.012 : 0, t, on ? 1.2 : 0.05);
  }

  /** 0..1; fades over about a second. */
  setDread(level: number): void {
    const l = Math.max(0, Math.min(1, level));
    if (Math.abs(l - this.droneLevel) < 0.01 || !this.ctx || !this.drone) return;
    this.droneLevel = l;
    const t = this.ctx.currentTime;
    this.drone.gain.cancelScheduledValues(t);
    this.drone.gain.setTargetAtTime(l * 0.16, t, 1.0);
  }
}
