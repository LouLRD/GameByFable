/**
 * Export et import de sauvegardes : sérialisation JSON, nom de fichier local,
 * analyse protégée du texte importé, déclenchement du téléchargement côté navigateur.
 */
import type { ExpectedScenario, SaveFileV2, SaveParseResult } from './saveFormat';
import { parseSave } from './saveFormat';

export const EXPORT_MIME = 'application/json' as const;
export const EXPORT_EXTENSION = '.json' as const;

/** Délai avant révocation de l'URL d'objet : certains navigateurs annulent un téléchargement révoqué trop tôt. */
const REVOKE_DELAY_MS = 1_000;
const MAX_FILENAME_TOKEN_LENGTH = 64;

/** JSON indenté à deux espaces, lisible dans un éditeur et stable en diff. */
export function serializeSave(save: SaveFileV2): string {
  return JSON.stringify(save, null, 2);
}

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** Réduit une chaîne à un jeton sûr pour un nom de fichier : ASCII, sans séparateurs ni caractères interdits. */
function toFilenameToken(value: string): string {
  const ascii = value.normalize('NFD').replace(/\p{M}+/gu, '');
  const cleaned = ascii
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(0, MAX_FILENAME_TOKEN_LENGTH) || 'scenario';
}

/** Ex. `la-veilleuse-300_2026-09-04_21h12.json` (date et heure locales). */
export function buildExportFilename(scenarioId: string, date: Date): string {
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}_${pad2(date.getHours())}h${pad2(date.getMinutes())}`;
  return `${toFilenameToken(scenarioId)}_${stamp}${EXPORT_EXTENSION}`;
}

/** Analyse un texte importé. Un JSON illisible est un refus `invalid-schema`, jamais une exception. */
export function parseImport(text: string, expected: ExpectedScenario): SaveParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'invalid-schema', issues: [`JSON illisible : ${detail}`] };
  }
  return parseSave(value, expected);
}

/**
 * Déclenche le téléchargement d'un fichier texte via un lien `download` temporaire.
 * Ne fait rien hors navigateur (pas de `document`, pas de `URL.createObjectURL`).
 */
export function triggerDownload(filename: string, content: string): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  if (typeof URL.createObjectURL !== 'function') return;

  const blob = new Blob([content], { type: EXPORT_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
  }
}
