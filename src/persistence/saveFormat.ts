/**
 * Format de sauvegarde : schémas, migration explicite v1 → v2, analyse non destructive.
 *
 * `parseSave` ne lève jamais : toute entrée douteuse produit un `SaveRejection` motivé,
 * ce qui permet à l'appelant de laisser la sauvegarde courante intacte.
 */
import { z } from 'zod';
import type { PlayerAction } from '@/domain/model/actions';
import type { ReplayEnvelope } from '@/domain/model/state';
import { asId } from '@/domain/model/ids';
import { interval } from '@/domain/model/time';
import { ApproachSchema, PlayerActionSchema, toPlayerAction } from './actionSchema';

export const CURRENT_SAVE_VERSION = 2 as const;
export const SAVE_KIND = 'la-version-acceptable-save' as const;
/** Version du schéma de l'enveloppe de rejeu (`ReplayEnvelope.schemaVersion`). */
export const REPLAY_SCHEMA_VERSION = 1 as const;
export const MAX_LABEL_LENGTH = 80;

/** Libellé attribué aux sauvegardes v1 qui n'en avaient pas. */
export const LEGACY_LABEL = 'Sauvegarde importée (ancien format)';
/** Version d'application attribuée aux sauvegardes migrées depuis le format 1. */
export const LEGACY_APP_VERSION = 'inconnue (format 1)';

export type ActiveSpace = 'map' | 'timeline' | 'casefile' | 'version';

export interface SaveUiState {
  cursor: number;
  selectedId: string | null;
  activeSpace: ActiveSpace | null;
}

export interface SaveFileV2 {
  kind: typeof SAVE_KIND;
  formatVersion: 2;
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  actions: PlayerAction[];
  ui: SaveUiState;
  label: string;
  savedAt: string;
  appVersion: string;
}

export interface ExpectedScenario {
  scenarioId: string;
  scenarioVersion: number;
}

export type SaveRejectionReason =
  | 'invalid-schema'
  | 'unknown-scenario'
  | 'newer-format'
  | 'scenario-version-newer'
  | 'unknown-kind';

export interface SaveRejection {
  ok: false;
  reason: SaveRejectionReason;
  issues: string[];
}

export interface SaveAccepted {
  ok: true;
  save: SaveFileV2;
  /** Version de format d'origine si une migration a eu lieu, sinon `null`. */
  migratedFrom: number | null;
}

export type SaveParseResult = SaveAccepted | SaveRejection;

// ---------------------------------------------------------------------------
// Format historique v1 (actions en camelCase, curseur à la racine, pas de `kind`).
// ---------------------------------------------------------------------------

const id = z.string().min(1);

const LegacyActionV1Schema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('setClaim'),
      slot: id,
      hypothesis: id,
      actor: id.optional(),
      zone: id.optional(),
      from: z.number().optional(),
      to: z.number().optional(),
    })
    .refine((a) => (a.from === undefined) === (a.to === undefined), {
      message: '`from` et `to` doivent être fournis ensemble.',
    }),
  z.object({ type: z.literal('clearClaim'), slot: id }),
  z.object({ type: z.literal('attachEvidence'), evidence: id, attached: z.boolean() }),
  z.object({
    type: z.literal('confront'),
    character: id,
    target: id,
    support: id.optional(),
    approach: ApproachSchema,
  }),
  z.object({ type: z.literal('probe'), character: id, target: id, approach: ApproachSchema }),
  z.object({ type: z.literal('requestRoundTable') }),
  z.object({ type: z.literal('leaveRoundTable') }),
  z.object({ type: z.literal('seal') }),
  z.object({ type: z.literal('dismissOnboarding'), step: id }),
]);

export type LegacyActionV1 = z.infer<typeof LegacyActionV1Schema>;

export const SaveFileV1Schema = z.object({
  formatVersion: z.literal(1),
  scenarioId: id,
  scenarioVersion: z.number().int().nonnegative(),
  seed: z.string(),
  cursor: z.number().int().nonnegative(),
  label: z.string().optional(),
  savedAt: z.string().optional(),
  actions: z.array(LegacyActionV1Schema),
});

export type SaveFileV1 = z.infer<typeof SaveFileV1Schema>;

// ---------------------------------------------------------------------------
// Format courant v2.
// ---------------------------------------------------------------------------

export const SaveUiStateSchema = z.object({
  cursor: z.number().int().nonnegative(),
  selectedId: z.string().nullable(),
  activeSpace: z.enum(['map', 'timeline', 'casefile', 'version']).nullable(),
});

export const SaveFileV2Schema = z
  .object({
    kind: z.literal(SAVE_KIND),
    formatVersion: z.literal(2),
    scenarioId: id,
    scenarioVersion: z.number().int().nonnegative(),
    seed: z.string(),
    actions: z.array(PlayerActionSchema),
    ui: SaveUiStateSchema,
    label: z.string().max(MAX_LABEL_LENGTH),
    savedAt: z.string(),
    appVersion: z.string(),
  })
  // `ui.cursor` est le curseur TEMPOREL (secondes simulées), borné par l'interface au chargement.
  .refine((save) => save.ui.cursor <= 24 * 3600, {
    path: ['ui', 'cursor'],
    message: 'Le curseur temporel dépasse une journée.',
  });

export type SaveFileV2Input = z.infer<typeof SaveFileV2Schema>;

// ---------------------------------------------------------------------------
// Migration v1 → v2.
// ---------------------------------------------------------------------------

function migrateActionV1(action: LegacyActionV1): PlayerAction {
  switch (action.type) {
    case 'setClaim':
      return {
        type: 'set-claim',
        slotId: asId<'claim-slot'>(action.slot),
        hypothesisId: asId<'hypothesis'>(action.hypothesis),
        ...(action.actor !== undefined ? { actorId: asId<'character'>(action.actor) } : {}),
        ...(action.zone !== undefined ? { zoneId: asId<'zone'>(action.zone) } : {}),
        ...(action.from !== undefined && action.to !== undefined
          ? { interval: interval(action.from, action.to) }
          : {}),
      };
    case 'clearClaim':
      return { type: 'clear-claim', slotId: asId<'claim-slot'>(action.slot) };
    case 'attachEvidence':
      return {
        type: 'set-evidence-attached',
        evidenceId: asId<'evidence'>(action.evidence),
        attached: action.attached,
      };
    case 'confront':
      return {
        type: 'confront',
        characterId: asId<'character'>(action.character),
        targetId: action.target,
        ...(action.support !== undefined ? { supportId: action.support } : {}),
        approach: action.approach,
      };
    case 'probe':
      return {
        type: 'probe',
        characterId: asId<'character'>(action.character),
        targetId: action.target,
        approach: action.approach,
      };
    case 'requestRoundTable':
      return { type: 'request-round-table' };
    case 'leaveRoundTable':
      return { type: 'leave-round-table' };
    case 'seal':
      return { type: 'seal-report' };
    case 'dismissOnboarding':
      return { type: 'dismiss-onboarding', onboardingId: asId<'onboarding'>(action.step) };
  }
}

/**
 * Convertit une sauvegarde v1 validée en v2. L'ordre des actions est préservé ;
 * `from`/`to` deviennent `interval` ; le curseur est borné au nombre d'actions.
 */
export function migrateV1toV2(v1: SaveFileV1): SaveFileV2 {
  return {
    kind: SAVE_KIND,
    formatVersion: 2,
    scenarioId: v1.scenarioId,
    scenarioVersion: v1.scenarioVersion,
    seed: v1.seed,
    actions: v1.actions.map(migrateActionV1),
    ui: { cursor: Math.max(0, v1.cursor), selectedId: null, activeSpace: null },
    label: truncateLabel(v1.label ?? LEGACY_LABEL),
    savedAt: v1.savedAt ?? '',
    appVersion: LEGACY_APP_VERSION,
  };
}

function fromV2Input(data: SaveFileV2Input): SaveFileV2 {
  return {
    kind: data.kind,
    formatVersion: data.formatVersion,
    scenarioId: data.scenarioId,
    scenarioVersion: data.scenarioVersion,
    seed: data.seed,
    actions: data.actions.map(toPlayerAction),
    ui: {
      cursor: data.ui.cursor,
      selectedId: data.ui.selectedId,
      activeSpace: data.ui.activeSpace,
    },
    label: data.label,
    savedAt: data.savedAt,
    appVersion: data.appVersion,
  };
}

// ---------------------------------------------------------------------------
// Analyse.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(reason: SaveRejectionReason, issues: string[]): SaveRejection {
  return { ok: false, reason, issues };
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path.length > 0 ? `${path} : ${issue.message}` : issue.message;
  });
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return `« ${value} »`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return typeof value;
}

function decodeByVersion(input: Record<string, unknown>, formatVersion: number): SaveParseResult {
  switch (formatVersion) {
    case 1: {
      const parsed = SaveFileV1Schema.safeParse(input);
      if (!parsed.success) return reject('invalid-schema', formatIssues(parsed.error));
      return { ok: true, save: migrateV1toV2(parsed.data), migratedFrom: 1 };
    }
    case 2: {
      const parsed = SaveFileV2Schema.safeParse(input);
      if (!parsed.success) return reject('invalid-schema', formatIssues(parsed.error));
      return { ok: true, save: fromV2Input(parsed.data), migratedFrom: null };
    }
    default:
      return reject('invalid-schema', [
        `formatVersion : version ${formatVersion} non prise en charge.`,
      ]);
  }
}

/**
 * Analyse une sauvegarde déjà désérialisée (objet JSON). Accepte v1 (migrée) et v2.
 * Refuse sans lever : format plus récent, type de fichier inconnu, scénario différent,
 * version de scénario plus récente que celle chargée, ou forme invalide.
 */
export function parseSave(input: unknown, expected: ExpectedScenario): SaveParseResult {
  if (!isRecord(input)) {
    return reject('invalid-schema', [`Objet JSON attendu, ${describeValue(input)} reçu.`]);
  }

  const kind = input.kind;
  if (kind !== undefined && kind !== SAVE_KIND) {
    return reject('unknown-kind', [`Type de fichier inconnu : ${describeValue(kind)}.`]);
  }

  const formatVersion = input.formatVersion;
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion)) {
    return reject('invalid-schema', [
      `formatVersion : entier attendu, ${describeValue(formatVersion)} reçu.`,
    ]);
  }
  if (formatVersion > CURRENT_SAVE_VERSION) {
    return reject('newer-format', [
      `Format ${formatVersion} plus récent que le format pris en charge (${CURRENT_SAVE_VERSION}).`,
    ]);
  }

  const decoded = decodeByVersion(input, formatVersion);
  if (!decoded.ok) return decoded;

  const { save } = decoded;
  if (save.scenarioId !== expected.scenarioId) {
    return reject('unknown-scenario', [
      `Scénario « ${save.scenarioId} » inconnu (scénario chargé : « ${expected.scenarioId} »).`,
    ]);
  }
  if (save.scenarioVersion > expected.scenarioVersion) {
    return reject('scenario-version-newer', [
      `Version de scénario ${save.scenarioVersion} plus récente que la version chargée (${expected.scenarioVersion}).`,
    ]);
  }

  return decoded;
}

// ---------------------------------------------------------------------------
// Construction.
// ---------------------------------------------------------------------------

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? label.slice(0, MAX_LABEL_LENGTH) : label;
}

export interface CreateSaveFileParams {
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  actions: readonly PlayerAction[];
  ui: SaveUiState;
  label: string;
  savedAt: string;
  appVersion: string;
}

/** Construit une sauvegarde v2. Les actions sont copiées ; le libellé est tronqué à `MAX_LABEL_LENGTH`. */
export function createSaveFile(params: CreateSaveFileParams): SaveFileV2 {
  return {
    kind: SAVE_KIND,
    formatVersion: CURRENT_SAVE_VERSION,
    scenarioId: params.scenarioId,
    scenarioVersion: params.scenarioVersion,
    seed: params.seed,
    actions: [...params.actions],
    ui: {
      cursor: params.ui.cursor,
      selectedId: params.ui.selectedId,
      activeSpace: params.ui.activeSpace,
    },
    label: truncateLabel(params.label),
    savedAt: params.savedAt,
    appVersion: params.appVersion,
  };
}

/** Enveloppe de rejeu pour le moteur : seules les données sémantiques, sans état d'interface. */
export function toReplayEnvelope(save: SaveFileV2): ReplayEnvelope {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    scenarioId: save.scenarioId,
    scenarioVersion: save.scenarioVersion,
    seed: save.seed,
    actions: [...save.actions],
  };
}
