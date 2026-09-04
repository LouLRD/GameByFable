import { describe, expect, it } from 'vitest';
import { scenario, run, claim, confront, CANONICAL_CLAIMS, CANONICAL_CONFRONTATIONS, PROCEDURAL_CLAIMS } from '@/test/helpers';
import { evaluateVersion } from '../engine/evaluate';
import { trustState, countsAsSignature } from './signatures';
import { interval } from '../model/time';
import { selectEpilogue } from '../selectors/epilogue';
import { selectPlayerView } from '../selectors/playerView';

const adhesion = (s: ReturnType<typeof run>) => Object.fromEntries(evaluateVersion(scenario, s).evaluation.adhesion.map((d) => [d.characterId, d]));

describe('décisions de signature', () => {
  it('états de confiance textuels', () => {
    expect(trustState(-2)).toBe('fermé');
    expect(trustState(0)).toBe('prudent');
    expect(trustState(2)).toBe('disponible');
    expect(trustState(3)).toBe('engagé');
  });

  it('une proposition rejetée catégoriquement entraîne une demande de modification ciblée', () => {
    const d = adhesion(run([claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) })]));
    expect(d.malik?.verdict).toBe('requests-change');
    expect(d.malik?.requestedSlotId).toBe('cash_origin');
    expect(d.malik?.publicReasons.join(' ')).toMatch(/refuse catégoriquement/);
  });

  it('la personne désignée par une hypothèse accusatrice refuse', () => {
    const d = adhesion(run([claim('video_outage', 'h_deliberate_unplug', { actorId: 'ana' as never })]));
    expect(d.ana?.verdict).toBe('requests-change');
    expect(d.malik?.verdict).toBe('signs');
  });

  it('une vérité coûteuse est signée en silence tant qu’elle n’est pas sur la table', () => {
    const d = adhesion(run([...PROCEDURAL_CLAIMS]));
    // Ana sait le remboursement vrai mais l'admettre lui coûterait : elle ne s'oppose pas
    expect(d.ana?.verdict).toBe('signs-silently');
    expect(d.ana?.publicReasons.join(' ')).not.toMatch(/rembours/i);
    expect(d.ana?.internalReasons.length).toBeGreaterThan(0);
  });

  it('une fois la pièce jointe, contredire ce qu’elle établit fait refuser', () => {
    const s = run([confront('ana', 's_ana_initial', 'e_till_report', 'empathetic'), claim('manager_knowledge', 'h_ana_unaware')]);
    const d = adhesion(s);
    expect(d.ana?.verdict).toBe('requests-change');
    expect(d.ana?.publicReasons.join(' ')).toMatch(/tient pour certain/);
  });

  it('le coût personnel non compensé fait refuser ; la confiance le compense', () => {
    const low = adhesion(run([claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) })]));
    // Mina : accuser Malik coûte 3 > tolérance 2 (confiance 1) → refuse ; Jo : coût 1 ≤ tolérance 1 → signe
    expect(low.mina?.verdict).toBe('refuses');
    expect(low.jo?.verdict).toBe('signs');
    expect(low.ines?.verdict).toBe('signs'); // signer une accusation coûte 2 ≤ tolérance 2 → signe
  });

  it('la vérité est acceptée dès que la confiance suffit, malgré le coût', () => {
    const s = run([...CANONICAL_CONFRONTATIONS, ...CANONICAL_CLAIMS]);
    const d = adhesion(s);
    expect(Object.values(d).filter((x) => countsAsSignature(x.verdict)).length).toBe(6);
    expect(d.mina?.internalReasons.join(' ')).toMatch(/Version exacte/);
  });

  it('une approche directe ferme un personnage : il refuse une version qui l’expose, sans soft-lock', () => {
    const s = run([
      confront('ana', 's_ana_initial', 'e_till_report', 'neutral'),
      confront('ana', 's_ana_initial', 'e_drawer_log', 'direct'),
    ]);
    expect(trustState(s.characters.ana?.trust ?? 0)).toBe('fermé');
    const protective = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      confront('malik', 's_malik_initial', 'e_camera_gap', 'empathetic'),
      claim('cash_origin', 'h_emergency_refund'),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_receipt_lost'),
      claim('noise_source', 'h_trolley_threshold'),
      claim('manager_knowledge', 'h_ana_initiated_refund'),
    ], s);
    const d = adhesion(protective);
    expect(d.ana?.verdict).toBe('refuses');
    expect(d.ana?.publicReasons.join(' ')).toMatch(/confiance/);
    // cinq signatures restent possibles : la fin « Réparer sans exposer » reste atteignable
    expect(evaluateVersion(scenario, protective).evaluation.signatureCount).toBe(5);
    expect(evaluateVersion(scenario, protective).evaluation.reachableEndingIds).toContain('ending_protective');
  });
});

describe('fins', () => {
  it('quatre fins de familles différentes sont atteignables par les données', () => {
    const transparent = run([...CANONICAL_CONFRONTATIONS, ...CANONICAL_CLAIMS, { type: 'request-round-table' }, { type: 'seal-report' }]);
    expect(transparent.endingId).toBe('ending_transparent');

    const protective = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      confront('ana', 's_ana_initial', 'e_till_report', 'empathetic'),
      confront('ana', 's_ana_initial', 'e_drawer_log'),
      claim('cash_origin', 'h_emergency_refund'),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_receipt_lost'),
      claim('noise_source', 'h_trolley_threshold'),
      claim('manager_knowledge', 'h_ana_initiated_refund'),
      { type: 'request-round-table' },
      { type: 'seal-report' },
    ]);
    expect(protective.endingId).toBe('ending_protective');

    const scapegoat = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) }),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_no_receipt'),
      claim('noise_source', 'h_stockroom_door', { actorId: 'mina' as never }),
      claim('manager_knowledge', 'h_ana_unaware'),
      { type: 'request-round-table' },
      { type: 'seal-report' },
    ]);
    expect(scapegoat.endingId).toBe('ending_scapegoat');

    const procedural = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('malik', 's_malik_initial', 'e_camera_gap', 'direct'), ...PROCEDURAL_CLAIMS, { type: 'request-round-table' }, { type: 'seal-report' }]);
    expect(procedural.endingId).toBe('ending_procedural');

    const families = new Set([transparent, protective, scapegoat, procedural].map((s) => scenario.index.endings.get(s.endingId!)?.family));
    expect(families.size).toBe(4);
  });

  it('la fin de repli s’applique quand rien ne tient', () => {
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      claim('cash_origin', 'h_mina_theft'),
      claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never }),
      claim('receipt_path', 'h_ana_destroyed_receipt'),
      claim('noise_source', 'h_bottle_noise'),
      claim('manager_knowledge', 'h_ana_staged'),
      { type: 'request-round-table' },
      { type: 'seal-report' },
    ]);
    expect(s.endingId).toBe('ending_impossible');
  });

  it('la bouc-émissaire devient inatteignable une fois le justificatif retrouvé', () => {
    const s = run([
      ...CANONICAL_CONFRONTATIONS,
      claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) }),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_no_receipt'),
      claim('noise_source', 'h_trolley_threshold'),
      claim('manager_knowledge', 'h_ana_unaware'),
    ]);
    expect(evaluateVersion(scenario, s).evaluation.reachableEndingIds).not.toContain('ending_scapegoat');
  });

  it('le parcours protecteur ne révèle pas l’emplacement réel du justificatif', () => {
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      confront('ana', 's_ana_initial', 'e_till_report', 'empathetic'),
      confront('ana', 's_ana_initial', 'e_drawer_log'),
      claim('cash_origin', 'h_emergency_refund'),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_receipt_lost'),
      claim('noise_source', 'h_trolley_threshold'),
      claim('manager_knowledge', 'h_ana_initiated_refund'),
      { type: 'request-round-table' },
      { type: 'seal-report' },
    ]);
    const epilogue = selectEpilogue(scenario, s);
    expect(epilogue?.ending.id).toBe('ending_protective');
    const receipt = epilogue?.slots.find((x) => x.slotId === 'receipt_path');
    expect(receipt?.matches).toBe(false);
    expect(receipt?.canonicalLabel).toBeNull();
    const hidden = epilogue?.facts.find((f) => f.id === 'f_receipt_hidden');
    expect(hidden?.revealed).toBe(false);
    expect(hidden?.label).toBeNull();
    expect(JSON.stringify(epilogue)).not.toMatch(/fiche d’entretien|fiche d'entretien/);
    expect(epilogue?.characters.find((c) => c.characterId === 'mina')?.outcome).toBe('signed-silently');
  });

  it('l’alignement canonique reste caché avant l’épilogue et visible après', () => {
    const before = run([...CANONICAL_CONFRONTATIONS, ...CANONICAL_CLAIMS, { type: 'request-round-table' }]);
    expect(selectPlayerView(scenario, before).version.disclosure.canonicalAlignment).toBeNull();
    expect(selectEpilogue(scenario, before)).toBeNull();
    const after = run([{ type: 'seal-report' }], before);
    expect(selectEpilogue(scenario, after)?.canonicalAlignment).toBe(1);
    expect(selectPlayerView(scenario, after).version.disclosure.canonicalAlignment).toBe(1);
  });
});
