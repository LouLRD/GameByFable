/**
 * Dépôt de sauvegardes : un emplacement automatique et trois emplacements manuels,
 * au-dessus d'un `StorageAdapter`. Toutes les lectures passent par la validation de
 * schéma ; une donnée corrompue est signalée mais jamais supprimée d'office.
 */
import { parseImport, serializeSave } from './exportImport';
import type {
  ExpectedScenario,
  SaveFileV2,
  SaveParseResult,
  SaveRejectionReason,
} from './saveFormat';
import { StorageQuotaError } from './storage';
import type { StorageAdapter } from './storage';

export type SlotId = 'auto' | 'slot-1' | 'slot-2' | 'slot-3';

export const SLOT_IDS: readonly SlotId[] = ['auto', 'slot-1', 'slot-2', 'slot-3'];

export interface SlotSummary {
  slotId: SlotId;
  label: string;
  savedAt: string;
  actionCount: number;
  /** `true` si aucune sauvegarde lisible n'occupe l'emplacement. */
  empty: boolean;
  /** Présent quand l'emplacement contient des données qui n'ont pas pu être lues (conservées telles quelles). */
  rejection?: SaveRejectionReason;
}

export interface SlotEmpty {
  ok: false;
  reason: 'empty';
  issues: [];
}

export type ReadResult = SaveParseResult | SlotEmpty;

export type WriteResult =
  { ok: true } | { ok: false; reason: 'quota' | 'unavailable'; message: string };

const EMPTY: SlotEmpty = { ok: false, reason: 'empty', issues: [] };

function isQuotaError(error: unknown): boolean {
  if (error instanceof StorageQuotaError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? error.name : undefined;
  const code = 'code' in error ? error.code : undefined;
  // Noms et codes historiques des navigateurs pour un dépassement de quota.
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SaveRepository {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly expected: ExpectedScenario,
    private readonly keyPrefix = 'lva:v1:',
  ) {}

  keyFor(slot: SlotId): string {
    return `${this.keyPrefix}${slot}`;
  }

  list(): SlotSummary[] {
    return SLOT_IDS.map((slotId) => {
      const result = this.read(slotId);
      if (result.ok) {
        return {
          slotId,
          label: result.save.label,
          savedAt: result.save.savedAt,
          actionCount: result.save.actions.length,
          empty: false,
        };
      }
      const summary: SlotSummary = { slotId, label: '', savedAt: '', actionCount: 0, empty: true };
      if (result.reason !== 'empty') summary.rejection = result.reason;
      return summary;
    });
  }

  /** Lit et valide un emplacement. Une donnée corrompue est rejetée mais laissée en place. */
  read(slot: SlotId): ReadResult {
    const raw = this.adapter.getItem(this.keyFor(slot));
    if (raw === null) return EMPTY;
    return parseImport(raw, this.expected);
  }

  /**
   * Écrit une sauvegarde. En cas d'échec (quota, stockage indisponible), l'ancienne valeur
   * de l'emplacement n'est pas touchée : l'adaptateur lève avant d'écrire.
   */
  write(slot: SlotId, save: SaveFileV2): WriteResult {
    try {
      this.adapter.setItem(this.keyFor(slot), serializeSave(save));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: isQuotaError(error) ? 'quota' : 'unavailable',
        message: errorMessage(error),
      };
    }
  }

  clear(slot: SlotId): void {
    this.adapter.removeItem(this.keyFor(slot));
  }

  /** `true` si au moins un emplacement contient une sauvegarde lisible avec au moins une action. */
  hasAnyProgress(): boolean {
    return SLOT_IDS.some((slot) => {
      const result = this.read(slot);
      return result.ok && result.save.actions.length > 0;
    });
  }
}
