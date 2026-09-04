import { requireBundledScenario } from '@/scenario';
import type { PlayerAction } from '@/domain/model/actions';
import type { GameState } from '@/domain/model/state';
import { applyAction, createInitialState } from '@/domain/replay/reducer';
import type { CharacterId, ClaimSlotId, HypothesisId } from '@/domain/model/ids';
import type { Approach } from '@/domain/model/scenario';

export const scenario = requireBundledScenario();

export function run(
  actions: readonly PlayerAction[],
  from: GameState = createInitialState(scenario),
): GameState {
  let state = from;
  for (const a of actions) {
    const r = applyAction(scenario, state, a);
    if (!r.ok)
      throw new Error(
        `Action refusée (${r.error.code}) : ${r.error.message} — ${JSON.stringify(a)}`,
      );
    state = r.state;
  }
  return state;
}

export const claim = (
  slotId: string,
  hypothesisId: string,
  extra: Partial<Extract<PlayerAction, { type: 'set-claim' }>> = {},
): PlayerAction => ({
  type: 'set-claim',
  slotId: slotId as ClaimSlotId,
  hypothesisId: hypothesisId as HypothesisId,
  ...extra,
});

export const confront = (
  characterId: string,
  targetId: string,
  supportId: string | undefined,
  approach: Approach = 'neutral',
): PlayerAction => ({
  type: 'confront',
  characterId: characterId as CharacterId,
  targetId,
  ...(supportId ? { supportId } : {}),
  approach,
});

/** Chemin canonique complet (confrontations + hypothèses vraies). */
export const CANONICAL_CONFRONTATIONS: PlayerAction[] = [
  confront('malik', 's_malik_initial', 'e_camera_gap', 'empathetic'),
  confront('jo', 's_jo_initial', 'e_camera_gap', 'neutral'),
  confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
  confront('noe', 's_noe_initial', 'e_pallet_scan', 'neutral'),
  confront('ana', 's_ana_initial', 'e_till_report', 'empathetic'),
  confront('ana', 's_ana_initial', 'e_drawer_log', 'neutral'),
  confront('mina', 's_mina_initial', 'e_pressure_imprint', 'empathetic'),
];

export const CANONICAL_CLAIMS: PlayerAction[] = [
  claim('cash_origin', 'h_emergency_refund'),
  claim('video_outage', 'h_circuit_overload'),
  claim('receipt_path', 'h_mina_hidden_receipt'),
  claim('noise_source', 'h_trolley_threshold'),
  claim('manager_knowledge', 'h_ana_initiated_refund'),
];

export const PROCEDURAL_CLAIMS: PlayerAction[] = [
  claim('cash_origin', 'h_counting_error'),
  claim('video_outage', 'h_scheduled_reboot'),
  claim('receipt_path', 'h_no_receipt'),
  claim('noise_source', 'h_freezer_alarm'),
  claim('manager_knowledge', 'h_ana_unaware'),
];
