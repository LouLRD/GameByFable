import { describe, expect, it } from 'vitest';
import { AUDIO_CUES, SUBTITLES, createAmbience } from './ambience';
import type { AudioCue, SubtitleEvent } from './ambience';

// --- Faux Web Audio minimal : enregistre les appels, ne produit aucun son -------------------

class FakeParam {
  /** Toutes les valeurs explicitement posées (affectation directe, rampes, cibles). */
  readonly history: number[] = [];
  readonly calls: string[] = [];
  private current: number;

  constructor(initial: number) {
    this.current = initial;
  }

  get value(): number {
    return this.current;
  }

  set value(v: number) {
    this.record('value', v);
  }

  setValueAtTime(v: number, t: number): this {
    this.record(`setValueAtTime@${t}`, v);
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.record(`linearRampToValueAtTime@${t}`, v);
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.record(`exponentialRampToValueAtTime@${t}`, v);
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.calls.push(`cancelScheduledValues@${t}`);
    return this;
  }

  get max(): number {
    return Math.max(...this.history);
  }

  get last(): number | undefined {
    return this.history[this.history.length - 1];
  }

  private record(label: string, v: number): void {
    this.calls.push(`${label}:${v}`);
    this.history.push(v);
    this.current = v;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  disconnectCalls = 0;

  connect<T>(target: T): T {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.connections.length = 0;
  }
}

class FakeSource extends FakeNode {
  readonly started: number[] = [];
  readonly stopped: number[] = [];
  onended: ((ev: Event) => void) | null = null;

  start(t = 0): void {
    this.started.push(t);
  }

  stop(t = 0): void {
    this.stopped.push(t);
  }

  /** Simule la fin réelle de lecture, que le navigateur signale de façon asynchrone. */
  emitEnded(): void {
    this.onended?.(new Event('ended'));
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}

class FakeBuffer {
  private readonly data: Float32Array;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48_000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = new FakeNode();
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  createOscillator(): FakeOscillator {
    return this.register(new FakeOscillator());
  }

  createGain(): FakeGain {
    return this.register(new FakeGain());
  }

  createBiquadFilter(): FakeBiquad {
    return this.register(new FakeBiquad());
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeBufferSource {
    return this.register(new FakeBufferSource());
  }

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.closeCalls++;
    this.state = 'closed';
  }

  get sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }

  get gains(): FakeGain[] {
    return this.nodes.filter((n): n is FakeGain => n instanceof FakeGain);
  }

  /** Le nœud maître est le seul gain branché sur la destination. */
  get master(): FakeGain {
    const master = this.gains.find((g) => g.connections.includes(this.destination));
    if (!master) throw new Error('aucun gain maître branché sur la destination');
    return master;
  }

  private register<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
}

function asAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}

/** Construit une ambiance testable et compte les appels à la fabrique. */
function setup(factoryOverride?: () => AudioContext | null) {
  const contexts: FakeAudioContext[] = [];
  let factoryCalls = 0;
  const factory =
    factoryOverride ??
    (() => {
      const fake = new FakeAudioContext();
      contexts.push(fake);
      return asAudioContext(fake);
    });
  const ambience = createAmbience({
    audioContextFactory: () => {
      factoryCalls++;
      return factory();
    },
  });
  const subtitles: SubtitleEvent[] = [];
  ambience.onSubtitle((e) => subtitles.push(e));
  return {
    ambience,
    subtitles,
    get factoryCalls() {
      return factoryCalls;
    },
    get ctx(): FakeAudioContext {
      const last = contexts[contexts.length - 1];
      if (!last) throw new Error('aucun contexte créé');
      return last;
    },
  };
}

// --- Tests -----------------------------------------------------------------------------------

describe('createAmbience — support et création du contexte', () => {
  it("n'est pas supporté sans AudioContext global et reste fonctionnel sans son", async () => {
    expect(typeof globalThis.AudioContext).toBe('undefined');
    const ambience = createAmbience();
    const received: SubtitleEvent[] = [];
    ambience.onSubtitle((e) => received.push(e));

    expect(ambience.isSupported()).toBe(false);
    await expect(ambience.enable()).resolves.toBe(false);
    expect(ambience.isEnabled()).toBe(false);

    ambience.playCue('till');
    expect(received).toEqual([{ cue: 'till', text: '[tintement de caisse]' }]);
    expect(ambience.__debugActiveNodeCount()).toBe(0);
  });

  it('devient non supporté quand la fabrique renvoie null', async () => {
    const s = setup(() => null);
    await expect(s.ambience.enable()).resolves.toBe(false);
    expect(s.ambience.isSupported()).toBe(false);
    expect(s.ambience.isEnabled()).toBe(false);
    expect(s.factoryCalls).toBe(1);
  });

  it('devient non supporté quand la fabrique lève, sans propager l’erreur', async () => {
    const s = setup(() => {
      throw new Error('AudioContext indisponible');
    });
    await expect(s.ambience.enable()).resolves.toBe(false);
    expect(s.ambience.isSupported()).toBe(false);
  });

  it('ne crée le contexte qu’à enable(), jamais à la construction ni via playCue', async () => {
    const s = setup();
    s.ambience.playCue('crack');
    s.ambience.setVolume(0.5);
    expect(s.ambience.isSupported()).toBe(true);
    expect(s.factoryCalls).toBe(0);

    await expect(s.ambience.enable()).resolves.toBe(true);
    expect(s.factoryCalls).toBe(1);
    expect(s.ambience.isEnabled()).toBe(true);
    expect(s.ctx.resumeCalls).toBe(1);
    expect(s.ctx.state).toBe('running');
  });

  it('est idempotent : deux enable() concurrents ne créent qu’un contexte', async () => {
    const s = setup();
    const results = await Promise.all([s.ambience.enable(), s.ambience.enable()]);
    expect(results).toEqual([true, true]);
    await expect(s.ambience.enable()).resolves.toBe(true);
    expect(s.factoryCalls).toBe(1);
  });

  it('renonce proprement si resume() est refusé (politique d’autoplay)', async () => {
    const s = setup(() => {
      const fake = new FakeAudioContext();
      fake.resume = () => Promise.reject(new Error('autoplay bloqué'));
      return asAudioContext(fake);
    });
    await expect(s.ambience.enable()).resolves.toBe(false);
    expect(s.ambience.isEnabled()).toBe(false);
    expect(s.ambience.__debugActiveNodeCount()).toBe(0);
    // Le support n'est pas remis en cause : l'utilisateur peut réessayer.
    expect(s.ambience.isSupported()).toBe(true);
  });

  it('annule un enable() en vol si disable() intervient entre-temps', async () => {
    const s = setup();
    const pending = s.ambience.enable();
    s.ambience.disable();
    await expect(pending).resolves.toBe(false);
    expect(s.ambience.isEnabled()).toBe(false);
    expect(s.ctx.closeCalls).toBe(1);
    expect(s.ambience.__debugActiveNodeCount()).toBe(0);
  });
});

describe('createAmbience — nappe d’ambiance', () => {
  it('démarre une nappe discrète : tout nœud est branché, toute source démarrée, gains ≤ 0,08', async () => {
    const s = setup();
    await s.ambience.enable();
    const ctx = s.ctx;

    expect(s.ambience.__debugActiveNodeCount()).toBe(ctx.nodes.length);
    expect(ctx.nodes.length).toBeGreaterThan(4);
    for (const node of ctx.nodes) expect(node.connections.length).toBeGreaterThanOrEqual(1);
    for (const source of ctx.sources) expect(source.started).toHaveLength(1);

    const master = ctx.master;
    for (const gain of ctx.gains) {
      if (gain !== master) expect(gain.gain.max).toBeLessThanOrEqual(0.08);
    }
    // Le maître monte en fondu depuis zéro jusqu'au volume par défaut, borné à 1.
    expect(master.gain.history[0]).toBe(0);
    expect(master.gain.last).toBeGreaterThan(0);
    expect(master.gain.max).toBeLessThanOrEqual(1);

    // Frigo (~50-60 Hz) et néon (~120 Hz) sont bien présents.
    const frequencies = ctx.nodes
      .filter((n): n is FakeOscillator => n instanceof FakeOscillator)
      .map((o) => o.frequency.value);
    expect(frequencies.some((f) => f >= 50 && f <= 60)).toBe(true);
    expect(frequencies.some((f) => f >= 110 && f <= 130)).toBe(true);
    // Le bruit est synthétisé (tampons remplis), pas chargé.
    expect(ctx.buffers.length).toBeGreaterThanOrEqual(2);
    for (const buffer of ctx.buffers) {
      const data = buffer.getChannelData();
      expect(data.some((v) => v !== 0)).toBe(true);
      expect(data.every((v) => v >= -1 && v <= 1)).toBe(true);
    }
  });

  it('publie les sous-titres de la nappe (frigo, néon) quand le son démarre réellement', async () => {
    const s = setup();
    await s.ambience.enable();
    expect(s.subtitles).toEqual([
      { cue: 'fridge', text: SUBTITLES.fridge },
      { cue: 'neon', text: SUBTITLES.neon },
    ]);
  });

  it('applique le volume : avant enable(), pendant, avec bornage et NaN ignoré', async () => {
    const s = setup();
    s.ambience.setVolume(0.3);
    await s.ambience.enable();
    const master = s.ctx.master;
    expect(master.gain.last).toBe(0.3);

    s.ambience.setVolume(5);
    expect(master.gain.last).toBe(1);
    s.ambience.setVolume(-2);
    expect(master.gain.last).toBe(0);
    s.ambience.setVolume(Number.NaN);
    expect(master.gain.last).toBe(0);
    expect(master.gain.max).toBeLessThanOrEqual(1);
  });
});

describe('createAmbience — cues et sous-titres', () => {
  it('publie toujours un sous-titre français pour chaque cue, même audio désactivé', () => {
    const s = setup();
    for (const cue of AUDIO_CUES) s.ambience.playCue(cue);

    expect(s.subtitles).toEqual(AUDIO_CUES.map((cue) => ({ cue, text: SUBTITLES[cue] })));
    for (const { text } of s.subtitles) expect(text).toMatch(/^\[[^[\]]+\]$/u);
    expect(s.factoryCalls).toBe(0);
    expect(s.ambience.__debugActiveNodeCount()).toBe(0);
  });

  it('joue un son bref par cue puis libère ses nœuds à la fin de lecture', async () => {
    const s = setup();
    await s.ambience.enable();
    const ctx = s.ctx;
    const baseline = s.ambience.__debugActiveNodeCount();
    const master = ctx.master;

    for (const cue of AUDIO_CUES) {
      const before = ctx.nodes.length;
      const subtitlesBefore = s.subtitles.length;
      s.ambience.playCue(cue);

      const created = ctx.nodes.slice(before);
      const sources = created.filter((n): n is FakeSource => n instanceof FakeSource);
      expect(created.length, cue).toBeGreaterThan(0);
      expect(sources.length, cue).toBeGreaterThan(0);
      expect(s.ambience.__debugActiveNodeCount(), cue).toBe(baseline + created.length);
      expect(s.subtitles.slice(subtitlesBefore), cue).toEqual([{ cue, text: SUBTITLES[cue] }]);
      for (const node of created) expect(node.connections.length, cue).toBeGreaterThanOrEqual(1);
      for (const source of sources) {
        expect(source.started, cue).toHaveLength(1);
        expect(source.stopped, cue).toHaveLength(1);
        expect(source.stopped[0], cue).toBeGreaterThan(source.started[0] ?? Number.NaN);
      }
      for (const gain of created.filter((n): n is FakeGain => n instanceof FakeGain)) {
        expect(gain, cue).not.toBe(master);
        expect(gain.gain.max, cue).toBeLessThanOrEqual(0.08);
      }

      for (const source of sources) source.emitEnded();
      expect(s.ambience.__debugActiveNodeCount(), cue).toBe(baseline);
      for (const node of created) expect(node.disconnectCalls, cue).toBeGreaterThanOrEqual(1);
    }
  });

  it('le tintement de caisse est un sinus dans la bande 1,2–2 kHz', async () => {
    const s = setup();
    await s.ambience.enable();
    const before = s.ctx.nodes.length;
    s.ambience.playCue('till');
    const oscillators = s.ctx.nodes
      .slice(before)
      .filter((n): n is FakeOscillator => n instanceof FakeOscillator);
    expect(oscillators.length).toBeGreaterThan(0);
    for (const osc of oscillators) {
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBeGreaterThanOrEqual(1200);
      expect(osc.frequency.value).toBeLessThanOrEqual(2000);
    }
  });

  it('onSubtitle désabonne le seul écouteur concerné et tolère un double désabonnement', () => {
    const ambience = createAmbience({ audioContextFactory: () => null });
    const first: AudioCue[] = [];
    const second: AudioCue[] = [];
    const unsubscribeFirst = ambience.onSubtitle((e) => first.push(e.cue));
    ambience.onSubtitle((e) => second.push(e.cue));

    ambience.playCue('reveal');
    unsubscribeFirst();
    unsubscribeFirst();
    ambience.playCue('seal');

    expect(first).toEqual(['reveal']);
    expect(second).toEqual(['reveal', 'seal']);
  });

  it('un écouteur peut se désabonner pendant la diffusion sans perturber les autres', () => {
    const ambience = createAmbience({ audioContextFactory: () => null });
    const received: string[] = [];
    const unsubscribe = ambience.onSubtitle(() => {
      received.push('a');
      unsubscribe();
    });
    ambience.onSubtitle(() => received.push('b'));

    ambience.playCue('crack');
    ambience.playCue('crack');
    expect(received).toEqual(['a', 'b', 'b']);
  });
});

describe('createAmbience — arrêt et libération', () => {
  it('disable() stoppe toutes les sources, déconnecte tous les nœuds et ferme le contexte', async () => {
    const s = setup();
    await s.ambience.enable();
    s.ambience.playCue('curtain');
    s.ambience.playCue('seal');
    const ctx = s.ctx;
    expect(s.ambience.__debugActiveNodeCount()).toBeGreaterThan(0);

    s.ambience.disable();

    expect(s.ambience.isEnabled()).toBe(false);
    expect(s.ambience.__debugActiveNodeCount()).toBe(0);
    for (const source of ctx.sources) expect(source.stopped.length).toBeGreaterThanOrEqual(1);
    for (const node of ctx.nodes) {
      expect(node.disconnectCalls).toBeGreaterThanOrEqual(1);
      expect(node.connections).toHaveLength(0);
    }
    expect(ctx.closeCalls).toBe(1);
    expect(ctx.state).toBe('closed');

    // Une fin de lecture tardive ne doit rien casser ni rien recompter.
    for (const source of ctx.sources) source.emitEnded();
    expect(s.ambience.__debugActiveNodeCount()).toBe(0);

    // Les sous-titres restent le canal principal après l'arrêt du son, sans recréer de nœud.
    const before = s.subtitles.length;
    const nodesAfterDisable = ctx.nodes.length;
    s.ambience.playCue('till');
    expect(s.subtitles.slice(before)).toEqual([{ cue: 'till', text: SUBTITLES.till }]);
    expect(ctx.nodes).toHaveLength(nodesAfterDisable);
    expect(s.factoryCalls).toBe(1);
  });

  it('disable() sans contexte est sans effet et enable() repart sur un contexte neuf', async () => {
    const s = setup();
    s.ambience.disable();
    expect(s.factoryCalls).toBe(0);

    await s.ambience.enable();
    const first = s.ctx;
    s.ambience.disable();
    await expect(s.ambience.enable()).resolves.toBe(true);
    expect(s.factoryCalls).toBe(2);
    expect(s.ctx).not.toBe(first);
    expect(s.ambience.isEnabled()).toBe(true);
    expect(s.ambience.__debugActiveNodeCount()).toBe(s.ctx.nodes.length);
  });

  it('dispose() libère tout, purge les écouteurs et rend l’instance inerte', async () => {
    const s = setup();
    await s.ambience.enable();
    s.ambience.playCue('reveal');
    const ctx = s.ctx;

    s.ambience.dispose();

    expect(s.ambience.__debugActiveNodeCount()).toBe(0);
    expect(ctx.closeCalls).toBe(1);
    const before = s.subtitles.length;
    s.ambience.playCue('till');
    expect(s.subtitles).toHaveLength(before);

    const late: SubtitleEvent[] = [];
    const unsubscribe = s.ambience.onSubtitle((e) => late.push(e));
    s.ambience.playCue('crack');
    unsubscribe();
    expect(late).toEqual([]);

    await expect(s.ambience.enable()).resolves.toBe(false);
    expect(s.factoryCalls).toBe(1);
    expect(s.ambience.isEnabled()).toBe(false);
  });
});
