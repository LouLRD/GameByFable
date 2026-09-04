
import { requireBundledScenario } from '@/scenario';
import { createInitialState, applyAction } from '@/domain/replay/reducer';
import { evaluateVersion } from '@/domain/engine/evaluate';
import { renderExplanation } from '@/domain/contradictions/render';
import type { GameState } from '@/domain/model/state';
import type { PlayerAction } from '@/domain/model/actions';

const scenario = requireBundledScenario();
const A = (s: GameState, a: PlayerAction) => { const r = applyAction(scenario, s, a); if (!r.ok) { console.log('REFUSED', a, r.error); return s; } return r.state; };
const dump = (label: string, s: GameState) => {
  const { evaluation } = evaluateVersion(scenario, s);
  console.log(`\n=== ${label} === pressure=${s.pressure} phase=${s.phase}`);
  console.log('coherence', evaluation.coherence.status, 'completeness', evaluation.completeness, 'disclosure', evaluation.disclosure.establishedExplained.toFixed(2), 'signatures', evaluation.signatureCount, 'reachable', evaluation.reachableEndingIds);
  for (const c of evaluation.contradictions) {
    console.log(` - [${c.kind}/${c.severity}${c.involvesVersion ? '/V' : ''}] ${c.title}  {${c.involvedIds.join(',')}}`);
    for (const st of renderExplanation(c.explanation, scenario)) console.log(`      · ${st.text}`);
  }
  for (const d of evaluation.adhesion) console.log(`   ${d.characterId}: ${d.verdict} — ${d.publicReasons.join(' | ')} ## ${d.internalReasons.join(' | ')}`);
  console.log('   slots', evaluation.slots.map((x) => `${x.slotId}:${x.status}`).join(' '));
};

(() => {
  let s = createInitialState(scenario);
  dump('start', s);
  // Parcours 1: unplug with Malik in office 490-520
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_deliberate_unplug' as never, actorId: 'malik' as never });
  dump('unplug malik', s);
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_deliberate_unplug' as never, actorId: 'malik' as never, interval: { start: 520, end: 540 } as never });
  dump('unplug malik 520-540', s);
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_deliberate_unplug' as never, actorId: 'ana' as never });
  dump('unplug ana', s);
  // canonical path
  s = A(s, { type: 'confront', characterId: 'malik' as never, targetId: 's_malik_initial', supportId: 'e_camera_gap', approach: 'empathetic' });
  s = A(s, { type: 'confront', characterId: 'jo' as never, targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'neutral' });
  s = A(s, { type: 'confront', characterId: 'ines' as never, targetId: 's_ines_initial', supportId: 'e_pallet_scan', approach: 'empathetic' });
  s = A(s, { type: 'confront', characterId: 'noe' as never, targetId: 's_noe_initial', supportId: 'e_pallet_scan', approach: 'neutral' });
  s = A(s, { type: 'confront', characterId: 'ana' as never, targetId: 's_ana_initial', supportId: 'e_till_report', approach: 'empathetic' });
  s = A(s, { type: 'confront', characterId: 'ana' as never, targetId: 's_ana_initial', supportId: 'e_drawer_log', approach: 'neutral' });
  s = A(s, { type: 'confront', characterId: 'mina' as never, targetId: 's_mina_initial', supportId: 'e_pressure_imprint', approach: 'empathetic' });
  s = A(s, { type: 'confront', characterId: 'jo' as never, targetId: 's_malik_clarified', supportId: 'e_pallet_scan', approach: 'neutral' });
  s = A(s, { type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_emergency_refund' as never });
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_circuit_overload' as never });
  s = A(s, { type: 'set-claim', slotId: 'receipt_path' as never, hypothesisId: 'h_mina_hidden_receipt' as never });
  s = A(s, { type: 'set-claim', slotId: 'noise_source' as never, hypothesisId: 'h_trolley_threshold' as never });
  s = A(s, { type: 'set-claim', slotId: 'manager_knowledge' as never, hypothesisId: 'h_ana_initiated_refund' as never });
  dump('canonical version', s);
  s = A(s, { type: 'request-round-table' });
  dump('round table', s);
  s = A(s, { type: 'seal-report' });
  console.log('ENDING', s.endingId, 'journal', s.journal.length);
})();

// --- Variantes de fin --------------------------------------------------------
(() => {
  const base0 = createInitialState(scenario);
  const prep = (s0: GameState) => {
    let s = s0;
    s = A(s, { type: 'confront', characterId: 'jo' as never, targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'neutral' });
    s = A(s, { type: 'confront', characterId: 'noe' as never, targetId: 's_noe_initial', supportId: 'e_pallet_scan', approach: 'neutral' });
    s = A(s, { type: 'confront', characterId: 'ines' as never, targetId: 's_ines_initial', supportId: 'e_pallet_scan', approach: 'empathetic' });
    s = A(s, { type: 'confront', characterId: 'ana' as never, targetId: 's_ana_initial', supportId: 'e_till_report', approach: 'empathetic' });
    s = A(s, { type: 'confront', characterId: 'ana' as never, targetId: 's_ana_initial', supportId: 'e_drawer_log', approach: 'neutral' });
    return s;
  };
  // Protective: refund + overload + receipt lost + trolley + ana initiated, without hidden receipt
  let s = prep(base0);
  s = A(s, { type: 'confront', characterId: 'malik' as never, targetId: 's_malik_initial', supportId: 'e_camera_gap', approach: 'empathetic' });
  s = A(s, { type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_emergency_refund' as never });
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_circuit_overload' as never });
  s = A(s, { type: 'set-claim', slotId: 'receipt_path' as never, hypothesisId: 'h_receipt_lost' as never });
  s = A(s, { type: 'set-claim', slotId: 'noise_source' as never, hypothesisId: 'h_trolley_threshold' as never });
  s = A(s, { type: 'set-claim', slotId: 'manager_knowledge' as never, hypothesisId: 'h_ana_initiated_refund' as never });
  dump('protective version', s);
  s = A(s, { type: 'request-round-table' });
  s = A(s, { type: 'seal-report' });
  console.log('ENDING protective path =>', s.endingId);

  // Scapegoat: Malik theft, no hidden receipt; need Ines & Jo trust
  s = createInitialState(scenario);
  s = A(s, { type: 'confront', characterId: 'jo' as never, targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'neutral' });
  s = A(s, { type: 'confront', characterId: 'ines' as never, targetId: 's_ines_initial', supportId: 'e_pallet_scan', approach: 'empathetic' });
  s = A(s, { type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_malik_theft' as never });
  dump('scapegoat default interval', s);
  s = A(s, { type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_malik_theft' as never, interval: { start: 326, end: 350 } as never });
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_circuit_overload' as never });
  s = A(s, { type: 'set-claim', slotId: 'receipt_path' as never, hypothesisId: 'h_no_receipt' as never });
  s = A(s, { type: 'set-claim', slotId: 'noise_source' as never, hypothesisId: 'h_stockroom_door' as never, actorId: 'mina' as never });
  s = A(s, { type: 'set-claim', slotId: 'manager_knowledge' as never, hypothesisId: 'h_ana_unaware' as never });
  dump('scapegoat version', s);
  s = A(s, { type: 'request-round-table' });
  s = A(s, { type: 'seal-report' });
  console.log('ENDING scapegoat path =>', s.endingId);

  // Procedural
  s = createInitialState(scenario);
  s = A(s, { type: 'confront', characterId: 'jo' as never, targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'direct' });
  s = A(s, { type: 'confront', characterId: 'malik' as never, targetId: 's_malik_initial', supportId: 'e_camera_gap', approach: 'direct' });
  s = A(s, { type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_counting_error' as never });
  s = A(s, { type: 'set-claim', slotId: 'video_outage' as never, hypothesisId: 'h_scheduled_reboot' as never });
  s = A(s, { type: 'set-claim', slotId: 'receipt_path' as never, hypothesisId: 'h_no_receipt' as never });
  s = A(s, { type: 'set-claim', slotId: 'noise_source' as never, hypothesisId: 'h_freezer_alarm' as never });
  s = A(s, { type: 'set-claim', slotId: 'manager_knowledge' as never, hypothesisId: 'h_ana_unaware' as never });
  dump('procedural version', s);
  s = A(s, { type: 'request-round-table' });
  s = A(s, { type: 'seal-report' });
  console.log('ENDING procedural path =>', s.endingId);
})();
