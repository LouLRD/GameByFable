import type { SlotId } from '@/persistence';

export type SelectionKind = 'evidence' | 'statement' | 'character' | 'fact' | 'hypothesis' | 'contradiction' | 'zone' | 'journal';
export type SpaceId = 'map' | 'timeline' | 'casefile' | 'inspector';
export type FocusPanel = SpaceId | null;
export type InspectorTab = 'version' | 'contradictions';
export type DialogId = 'confrontation' | 'saves' | 'settings' | 'help' | 'round-table' | 'new-game' | 'claim-form' | null;
export type CasefileFilter = 'all' | 'evidence' | 'statements' | 'characters' | 'facts' | 'hypotheses' | 'contradictions' | 'journal';
export type ReducedMotionPref = 'system' | 'on' | 'off';
export type TextSizePref = 's' | 'm' | 'l';

export interface Selection {
  kind: SelectionKind;
  id: string;
}

export interface ConfrontationDraft {
  characterId: string | null;
  targetId: string | null;
  supportId: string | null;
  approach: 'neutral' | 'empathetic' | 'direct';
}

export interface ClaimFormDraft {
  slotId: string;
  hypothesisId: string | null;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export type { SlotId };
