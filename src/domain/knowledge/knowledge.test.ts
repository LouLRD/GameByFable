import { describe, expect, it } from 'vitest';
import { scenario, run, confront } from '@/test/helpers';
import { createInitialState } from '../replay/reducer';
import { certainties, initialKnowledge, knowledgePath, isSelfProposition } from './knowledge';
import { characterId } from '../model/ids';

describe('connaissance et provenance', () => {
  it('aucun personnage ne possède une connaissance sans provenance', () => {
    const s = run(
      [
        confront('malik', 's_malik_initial', 'e_camera_gap'),
        confront('jo', 's_jo_initial', 'e_camera_gap'),
        { type: 'request-round-table' } as never,
      ].slice(0, 2),
    );
    for (const c of scenario.data.characters) {
      for (const k of s.characters[c.id]?.knowledge ?? []) {
        expect(k.provenanceIds.length, `${c.id}/${k.propositionId}`).toBeGreaterThan(0);
        expect(['self', 'belief', 'perception', 'public', 'learned']).toContain(k.origin);
      }
    }
  });

  it('les personnages ne connaissent pas les secrets qu’ils n’ont ni perçus ni appris', () => {
    const s = createInitialState(scenario);
    const jo = new Map((s.characters.jo?.knowledge ?? []).map((k) => [k.propositionId, k]));
    expect(jo.has('prop_refund_happened' as never)).toBe(false);
    expect(jo.has('prop_mina_hid_receipt' as never)).toBe(false);
    expect(jo.has('prop_kettle_caused_trip' as never)).toBe(false);
    const noe = new Map((s.characters.noe?.knowledge ?? []).map((k) => [k.propositionId, k]));
    expect(noe.has('prop_refund_happened' as never)).toBe(false);
    // une perception propre n'est pas une certitude : Noé croit sincèrement (0,48) avoir vu Inès
    expect(noe.get('prop_ines_went_stockroom' as never)?.confidence).toBeCloseTo(0.48);
    expect(
      isSelfProposition(
        {
          type: 'perceived',
          observerId: characterId('noe'),
          modality: 'visual',
          target: {
            zoneId: 'x' as never,
            interval: { start: 0, end: 1 } as never,
            claimedTags: [],
          },
        },
        characterId('noe'),
      ),
    ).toBe(false);
  });

  it('une déclaration mensongère ne remplace pas la croyance du personnage', () => {
    const s = createInitialState(scenario);
    const ana = certainties(s.characters.ana?.knowledge ?? []);
    // Ana ment (« rien d'inhabituel ») mais sait le remboursement vrai et sa déclaration fausse
    expect(ana.get('prop_refund_happened' as never)).toBe(true);
    expect(ana.get('prop_ana_no_unusual_drawer' as never)).toBe(false);
    const statement = scenario.index.statements.get('s_ana_initial' as never);
    expect(statement?.relationToBelief).toBe('lie');
  });

  it('la connaissance apprise porte la provenance de la confrontation et de la pièce', () => {
    const s = run([confront('malik', 's_malik_initial', 'e_camera_gap')]);
    const learned = (s.characters.malik?.knowledge ?? []).find(
      (k) => k.propositionId === 'prop_camera_offline_4m20',
    );
    expect(learned?.provenanceIds).toEqual(
      expect.arrayContaining(['c_malik_route', 'e_camera_gap']),
    );
  });

  it('les croyances peuvent être corrigées par une confrontation sans effacer la perception', () => {
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
    ]);
    const noe = new Map((s.characters.noe?.knowledge ?? []).map((k) => [k.propositionId, k]));
    expect(noe.get('prop_ines_went_stockroom' as never)?.confidence).toBeCloseTo(0.1);
    expect(noe.get('prop_trolley_maybe_door' as never)?.confidence).toBeCloseTo(0.8);
    expect(s.revealedPerceptionIds).toContain('p_noe_silhouette');
  });

  it('le chemin de connaissance distingue le mode joueur du mode canonique', () => {
    const s = createInitialState(scenario);
    const prop = scenario.index.propositions.get('prop_ines_went_stockroom' as never);
    if (!prop) throw new Error('proposition manquante');
    const player = knowledgePath(scenario, s, characterId('noe'), prop, 'player');
    const canonical = knowledgePath(scenario, s, characterId('noe'), prop, 'canonical');
    expect(player.status).toBe('none');
    // en canonique, Noé a perçu une silhouette vers la réserve mais pas l'identité
    expect(canonical.status).toBe('partial');
    expect(canonical.missingTags).toEqual(['ines']);
  });

  it('la connaissance initiale de soi est cohérente avec la vérité canonique', () => {
    for (const c of scenario.data.characters) {
      for (const k of initialKnowledge(scenario, c.id)) {
        if (k.origin !== 'self') continue;
        const def = scenario.index.propositions.get(k.propositionId);
        expect(k.confidence).toBe(def?.truth ? 1 : 0);
      }
    }
  });
});
