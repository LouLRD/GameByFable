/**
 * Ambiance sonore synthétisée (Web Audio) de LA VERSION ACCEPTABLE.
 *
 * Principes (GDD §14, accessibilité) :
 * - le jeu fonctionne sans son : les sous-titres descriptifs sont le canal principal,
 *   l'audio n'est qu'un ornement ;
 * - aucun fichier audio, aucun réseau : tout est synthétisé (oscillateurs, bruit filtré) ;
 * - le contexte audio n'est créé que dans `enable()`, donc après une interaction explicite ;
 * - aucune fuite : chaque nœud créé est suivi, puis stoppé et déconnecté à la fin de sa vie.
 */

export type AudioCue = 'fridge' | 'neon' | 'till' | 'curtain' | 'crack' | 'reveal' | 'seal';

export interface SubtitleEvent {
  cue: AudioCue;
  text: string;
}

export interface Ambience {
  /** Vrai si l'environnement peut produire du son (voir `AmbienceOptions.audioContextFactory`). */
  isSupported(): boolean;
  /** Vrai lorsqu'un contexte audio est ouvert et que la nappe d'ambiance tourne. */
  isEnabled(): boolean;
  /** Crée le contexte audio (à appeler depuis une interaction explicite). Résout `true` si le son démarre. */
  enable(): Promise<boolean>;
  /** Arrête et déconnecte tous les nœuds, ferme le contexte. Les sous-titres restent publiés. */
  disable(): void;
  /** Publie toujours un sous-titre, puis joue le son bref correspondant si l'audio est actif. */
  playCue(cue: AudioCue): void;
  /** Volume général dans [0, 1] ; les valeurs hors bornes sont ramenées, `NaN` est ignoré. */
  setVolume(v: number): void;
  /** Abonne un écouteur de sous-titres ; renvoie la fonction de désabonnement. */
  onSubtitle(cb: (e: SubtitleEvent) => void): () => void;
  /** Équivaut à `disable()` puis rend l'instance inerte (écouteurs purgés, `enable()` refuse). */
  dispose(): void;
  /** Nombre de nœuds Web Audio actuellement vivants ; sert aux tests de non-fuite. */
  __debugActiveNodeCount(): number;
}

export interface AmbienceOptions {
  /**
   * Fabrique du contexte audio. Par défaut : `new AudioContext()` si le global existe, sinon `null`.
   * Avec une fabrique injectée, le support est présumé jusqu'au premier `enable()` qui renvoie `null`.
   */
  audioContextFactory?: () => AudioContext | null;
}

/** Ordre canonique des cues, utile aux interfaces de réglage et aux tests. */
export const AUDIO_CUES: readonly AudioCue[] = [
  'fridge',
  'neon',
  'till',
  'curtain',
  'crack',
  'reveal',
  'seal',
];

/** Sous-titres descriptifs (canal principal, toujours publiés). */
export const SUBTITLES: Readonly<Record<AudioCue, string>> = {
  fridge: '[ronronnement du frigo]',
  neon: '[grésillement du néon]',
  till: '[tintement de caisse]',
  curtain: '[glissement du rideau]',
  crack: '[craquement sec]',
  reveal: '[deux notes douces, ascendantes]',
  seal: '[note grave, coup de tampon]',
};

/** Aucune couche ni aucun cue ne dépasse ce gain : l'ambiance reste discrète. */
const MAX_LAYER_GAIN = 0.08;
/** Plancher des rampes exponentielles (elles ne peuvent pas atteindre zéro). */
const FLOOR = 0.0001;
const DEFAULT_VOLUME = 0.8;
const FADE_IN_SECONDS = 1.5;

/** Bruit blanc déterministe (xorshift32) : pas besoin d'aléa système pour un souffle de frigo. */
function fillNoise(data: Float32Array, seed: number): void {
  let state = seed >>> 0 || 1;
  for (let i = 0; i < data.length; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    data[i] = (state / 0xffffffff) * 2 - 1;
  }
}

/** Enveloppe percussive : attaque linéaire depuis zéro, puis décroissance exponentielle. */
function envelope(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.min(peak, MAX_LAYER_GAIN), t + attack);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

interface Voice {
  readonly nodes: AudioNode[];
  readonly sources: AudioScheduledSourceNode[];
}

/** Atelier de nœuds : tout ce qui est créé ici est consigné dans la voix pour être libéré ensuite. */
class VoiceBuilder {
  readonly voice: Voice = { nodes: [], sources: [] };
  private readonly ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  osc(type: OscillatorType, frequency: number): OscillatorNode {
    const node = this.ctx.createOscillator();
    node.type = type;
    node.frequency.value = frequency;
    this.voice.nodes.push(node);
    this.voice.sources.push(node);
    return node;
  }

  gain(value: number): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = Math.min(value, MAX_LAYER_GAIN);
    this.voice.nodes.push(node);
    return node;
  }

  filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    this.voice.nodes.push(node);
    return node;
  }

  noise(seconds: number, seed: number, loop: boolean): AudioBufferSourceNode {
    const length = Math.max(1, Math.floor(seconds * this.ctx.sampleRate));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    fillNoise(buffer.getChannelData(0), seed);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = loop;
    this.voice.nodes.push(node);
    this.voice.sources.push(node);
    return node;
  }
}

/** Construit et planifie un son bref à partir de `t` ; renvoie l'instant où tout doit s'arrêter. */
type CueSynth = (b: VoiceBuilder, out: AudioNode, t: number) => number;

const CUE_SYNTHS: Readonly<Record<AudioCue, CueSynth>> = {
  fridge(b, out, t) {
    // Compresseur qui s'enclenche : impulsion grave très brève.
    const osc = b.osc('sine', 48);
    const g = b.gain(0);
    osc.connect(g).connect(out);
    envelope(g.gain, t, 0.06, 0.01, 0.3);
    osc.start(t);
    return t + 0.35;
  },
  neon(b, out, t) {
    // Scintillement : bruit aigu haché en quelques éclats.
    const noise = b.noise(0.3, 7, false);
    const hp = b.filter('highpass', 3500, 0.8);
    const g = b.gain(0);
    noise.connect(hp).connect(g).connect(out);
    const flicker = [0, 0.03, 0.07, 0.12, 0.2];
    flicker.forEach((offset, i) => {
      g.gain.setValueAtTime(i % 2 === 0 ? 0.03 : 0.004, t + offset);
    });
    g.gain.linearRampToValueAtTime(0, t + 0.28);
    noise.start(t);
    return t + 0.3;
  },
  till(b, out, t) {
    // Tintement de caisse : deux partiels sinus dans la bande 1,2–2 kHz, enveloppe très rapide.
    const low = b.osc('sine', 1450);
    const lowGain = b.gain(0);
    low.connect(lowGain).connect(out);
    envelope(lowGain.gain, t, 0.07, 0.004, 0.22);
    low.start(t);
    const high = b.osc('sine', 1950);
    const highGain = b.gain(0);
    high.connect(highGain).connect(out);
    envelope(highGain.gain, t, 0.03, 0.004, 0.12);
    high.start(t);
    return t + 0.3;
  },
  curtain(b, out, t) {
    // Rideau : balayage de bruit filtré, la bande monte pendant ~600 ms.
    const noise = b.noise(0.7, 11, false);
    const bp = b.filter('bandpass', 400, 1.2);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.6);
    const g = b.gain(0);
    noise.connect(bp).connect(g).connect(out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    noise.start(t);
    return t + 0.65;
  },
  crack(b, out, t) {
    // Craquement : bruit aigu, chute immédiate.
    const noise = b.noise(0.15, 5, false);
    const hp = b.filter('highpass', 1800, 0.7);
    const g = b.gain(0);
    noise.connect(hp).connect(g).connect(out);
    g.gain.setValueAtTime(MAX_LAYER_GAIN, t);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.12);
    noise.start(t);
    return t + 0.15;
  },
  reveal(b, out, t) {
    // Révélation : deux notes douces ascendantes (do5 puis mi5).
    const notes: readonly (readonly [number, number])[] = [
      [523.25, 0],
      [659.25, 0.22],
    ];
    for (const [frequency, offset] of notes) {
      const osc = b.osc('triangle', frequency);
      const g = b.gain(0);
      osc.connect(g).connect(out);
      envelope(g.gain, t + offset, 0.05, 0.02, 0.45);
      osc.start(t + offset);
    }
    return t + 0.72;
  },
  seal(b, out, t) {
    // Scellé : note grave tenue…
    const osc = b.osc('sine', 110);
    const g = b.gain(0);
    osc.connect(g).connect(out);
    envelope(g.gain, t, 0.06, 0.02, 0.6);
    osc.start(t);
    // …puis le coup de tampon : impact sourd, bruit passe-bas très bref.
    const thud = b.noise(0.1, 3, false);
    const lp = b.filter('lowpass', 320, 0.9);
    const thudGain = b.gain(0);
    thud.connect(lp).connect(thudGain).connect(out);
    thudGain.gain.setValueAtTime(MAX_LAYER_GAIN, t + 0.18);
    thudGain.gain.exponentialRampToValueAtTime(FLOOR, t + 0.28);
    thud.start(t + 0.18);
    return t + 0.7;
  },
};

/** Nappe continue : frigo (fondamentale grave + souffle) et néon (120 Hz scintillant + grésil). */
function buildBed(b: VoiceBuilder, out: AudioNode): void {
  // Frigo : sinus ~52 Hz dont l'amplitude tremble lentement, plus un souffle filtré passe-bas.
  const fridgeOsc = b.osc('sine', 52);
  const fridgeGain = b.gain(0.045);
  fridgeOsc.connect(fridgeGain).connect(out);
  const fridgeLfo = b.osc('sine', 0.35);
  const fridgeDepth = b.gain(0.008);
  fridgeLfo.connect(fridgeDepth).connect(fridgeGain.gain);
  const fridgeNoise = b.noise(2, 17, true);
  const fridgeLowpass = b.filter('lowpass', 160, 0.7);
  const fridgeNoiseGain = b.gain(0.02);
  fridgeNoise.connect(fridgeLowpass).connect(fridgeNoiseGain).connect(out);

  // Néon : triangle 120 Hz modulé par un scintillement à 8 Hz, plus un grésil passe-haut à gain infime.
  const neonOsc = b.osc('triangle', 120);
  const neonGain = b.gain(0.02);
  neonOsc.connect(neonGain).connect(out);
  const neonLfo = b.osc('square', 8);
  const neonDepth = b.gain(0.006);
  neonLfo.connect(neonDepth).connect(neonGain.gain);
  const neonNoise = b.noise(2, 23, true);
  const neonHighpass = b.filter('highpass', 4000, 0.8);
  const neonNoiseGain = b.gain(0.006);
  neonNoise.connect(neonHighpass).connect(neonNoiseGain).connect(out);
}

function defaultAudioContextFactory(): AudioContext | null {
  return typeof globalThis.AudioContext === 'function'
    ? new AudioContext({ latencyHint: 'playback' })
    : null;
}

class WebAudioAmbience implements Ambience {
  private readonly factory: () => AudioContext | null;
  private readonly listeners = new Set<(e: SubtitleEvent) => void>();
  private readonly activeNodes = new Set<AudioNode>();
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = DEFAULT_VOLUME;
  private supported: boolean;
  private disposed = false;
  private pending: Promise<boolean> | null = null;
  /** Incrémenté à chaque `disable()` : un `enable()` en vol qui voit un autre numéro s'annule. */
  private generation = 0;

  constructor(options: AmbienceOptions) {
    this.factory = options.audioContextFactory ?? defaultAudioContextFactory;
    this.supported = options.audioContextFactory
      ? true
      : typeof globalThis.AudioContext === 'function';
  }

  isSupported(): boolean {
    return this.supported;
  }

  isEnabled(): boolean {
    return this.ctx !== null;
  }

  enable(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.ctx) return Promise.resolve(true);
    this.pending ??= this.start().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  disable(): void {
    this.generation++;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (!ctx) return;
    this.silenceAll(ctx);
    void ctx.close().catch(() => undefined);
  }

  playCue(cue: AudioCue): void {
    if (this.disposed) return;
    this.publish(cue);
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state === 'closed') return;
    const builder = new VoiceBuilder(ctx);
    const stopAt = CUE_SYNTHS[cue](builder, master, ctx.currentTime);
    this.track(builder.voice);
    this.armRelease(builder.voice, stopAt);
  }

  setVolume(v: number): void {
    if (Number.isNaN(v)) return;
    this.volume = Math.min(1, Math.max(0, v));
    if (!this.ctx || !this.master) return;
    const gain = this.master.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.volume, now + 0.05);
  }

  onSubtitle(cb: (e: SubtitleEvent) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose(): void {
    this.disable();
    this.listeners.clear();
    this.disposed = true;
  }

  __debugActiveNodeCount(): number {
    return this.activeNodes.size;
  }

  private async start(): Promise<boolean> {
    const ctx = this.createContext();
    if (!ctx) return false;
    const generation = this.generation;
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      void ctx.close().catch(() => undefined);
      return false;
    }
    if (this.disposed || generation !== this.generation) {
      void ctx.close().catch(() => undefined);
      return false;
    }
    try {
      this.startBed(ctx);
    } catch {
      // Implémentation Web Audio défaillante : on nettoie et on renonce au son, sans casser le jeu.
      this.silenceAll(ctx);
      void ctx.close().catch(() => undefined);
      this.supported = false;
      return false;
    }
    this.ctx = ctx;
    this.publish('fridge');
    this.publish('neon');
    return true;
  }

  private createContext(): AudioContext | null {
    let ctx: AudioContext | null = null;
    try {
      ctx = this.factory();
    } catch {
      ctx = null;
    }
    if (!ctx) this.supported = false;
    return ctx;
  }

  private startBed(ctx: AudioContext): void {
    const builder = new VoiceBuilder(ctx);
    const master = ctx.createGain();
    builder.voice.nodes.push(master);
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(this.volume, now + FADE_IN_SECONDS);
    master.connect(ctx.destination);
    buildBed(builder, master);
    this.track(builder.voice);
    for (const source of builder.voice.sources) source.start(now);
    this.master = master;
  }

  private track(voice: Voice): void {
    for (const node of voice.nodes) this.activeNodes.add(node);
    for (const source of voice.sources) this.activeSources.add(source);
  }

  /** Planifie l'arrêt d'une voix brève et sa libération dès que ses sources ont fini. */
  private armRelease(voice: Voice, stopAt: number): void {
    const release = (): void => {
      for (const node of voice.nodes) {
        this.activeNodes.delete(node);
        node.disconnect();
      }
      for (const source of voice.sources) this.activeSources.delete(source);
    };
    for (const source of voice.sources) {
      source.stop(stopAt);
      source.onended = release;
    }
  }

  private silenceAll(ctx: AudioContext): void {
    const now = ctx.currentTime;
    for (const source of this.activeSources) {
      try {
        source.stop(now);
      } catch {
        // Source jamais démarrée ou déjà arrêtée : rien à faire.
      }
    }
    for (const node of this.activeNodes) node.disconnect();
    this.activeSources.clear();
    this.activeNodes.clear();
  }

  private publish(cue: AudioCue): void {
    const event: SubtitleEvent = { cue, text: SUBTITLES[cue] };
    for (const listener of [...this.listeners]) listener(event);
  }
}

export function createAmbience(options: AmbienceOptions = {}): Ambience {
  return new WebAudioAmbience(options);
}
