import { describe, expect, it } from 'vitest';
import { createGameStore } from './store';
import { MemoryStorage, SaveRepository, parseImport, serializeSave } from '@/persistence';
import { semanticHash } from '@/domain/replay/hash';

const fixedNow = () => new Date('2026-09-04T21:12:00.000Z');

function make() {
  const adapter = new MemoryStorage();
  const store = createGameStore({ adapter, now: fixedNow });
  store.getState().bootstrap();
  return { adapter, store };
}

describe('store : adaptation moteur ↔ interface', () => {
  it('démarre une partie et sauvegarde automatiquement après chaque action acceptée', () => {
    const { adapter, store } = make();
    expect(store.getState().game?.phase).toBe('investigation');
    const repo = new SaveRepository(adapter, { scenarioId: 'la-veilleuse-300', scenarioVersion: 1 });
    expect(repo.read('auto').ok).toBe(true);
    const r = store.getState().dispatch({ type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_counting_error' as never });
    expect(r.ok).toBe(true);
    const auto = repo.read('auto');
    expect(auto.ok && auto.save.actions.length).toBe(1);
    expect(store.getState().actions).toHaveLength(1);
    expect(store.getState().unsavedSinceExport).toBe(true);
  });

  it('une action refusée laisse l’état intact et compte une impasse', () => {
    const { store } = make();
    const before = semanticHash(store.getState().game);
    const r = store.getState().dispatch({ type: 'confront', characterId: 'noe' as never, targetId: 's_noe_initial', approach: 'neutral' });
    expect(r.ok).toBe(false);
    expect(semanticHash(store.getState().game)).toBe(before);
    expect(store.getState().lastError?.code).toBe('no-matching-confrontation');
    expect(store.getState().impasseCount).toBe(1);
    expect(store.getState().liveMessage.length).toBeGreaterThan(0);
  });

  it('restaure la sauvegarde automatique au redémarrage (état équivalent, curseur conservé)', () => {
    const { adapter, store } = make();
    store.getState().dispatch({ type: 'confront', characterId: 'jo' as never, targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'neutral' });
    store.getState().setCursor(533);
    store.getState().dispatch({ type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_malik_theft' as never });
    const h = semanticHash(store.getState().game);
    const second = createGameStore({ adapter, now: fixedNow });
    second.getState().bootstrap();
    expect(second.getState().restoredFrom).toBe('autosave');
    expect(semanticHash(second.getState().game)).toBe(h);
    expect(second.getState().cursor).toBe(533);
    expect(second.getState().game?.pressure).toBe(store.getState().game?.pressure);
  });

  it('trois emplacements manuels : sauvegarder, lister, charger, effacer', () => {
    const { store } = make();
    store.getState().dispatch({ type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_counting_error' as never });
    expect(store.getState().saveToSlot('slot-2', 'Avant la table ronde').ok).toBe(true);
    const slots = store.getState().listSlots();
    expect(slots.map((s) => s.slotId)).toEqual(['auto', 'slot-1', 'slot-2', 'slot-3']);
    expect(slots.find((s) => s.slotId === 'slot-2')?.label).toBe('Avant la table ronde');
    store.getState().newGame();
    expect(store.getState().actions).toHaveLength(0);
    expect(store.getState().loadSlot('slot-2').ok).toBe(true);
    expect(store.getState().actions).toHaveLength(1);
    store.getState().clearSlot('slot-2');
    expect(store.getState().listSlots().find((s) => s.slotId === 'slot-2')?.empty).toBe(true);
    expect(store.getState().loadSlot('slot-3').ok).toBe(false);
  });

  it('export puis import : état sémantiquement équivalent ; import invalide non destructif', () => {
    const { store } = make();
    store.getState().dispatch({ type: 'confront', characterId: 'malik' as never, targetId: 's_malik_initial', supportId: 'e_camera_gap', approach: 'empathetic' });
    store.getState().dispatch({ type: 'set-claim', slotId: 'noise_source' as never, hypothesisId: 'h_bottle_noise' as never });
    const h = semanticHash(store.getState().game);
    const exported = store.getState().exportSave();
    expect(exported.ok).toBe(true);
    expect(exported.filename).toMatch(/^la-veilleuse-300_2026-09-04_\d{2}h\d{2}\.json$/);
    expect(store.getState().unsavedSinceExport).toBe(false);
    store.getState().newGame();
    expect(semanticHash(store.getState().game)).not.toBe(h);
    const bad = store.getState().importSave('{"kind":"autre"}');
    expect(bad.ok).toBe(false);
    expect(store.getState().actions).toHaveLength(0);
    const good = store.getState().importSave(exported.content ?? '');
    expect(good.ok).toBe(true);
    expect(semanticHash(store.getState().game)).toBe(h);
    const reparsed = parseImport(serializeSave(JSON.parse(exported.content ?? '{}')), { scenarioId: 'la-veilleuse-300', scenarioVersion: 1 });
    expect(reparsed.ok).toBe(true);
  });

  it('les préférences sont persistées et le curseur est borné', () => {
    const { adapter, store } = make();
    store.getState().setPref('textSize', 'l');
    store.getState().setPref('reducedMotion', 'on');
    const again = createGameStore({ adapter, now: fixedNow });
    expect(again.getState().prefs.textSize).toBe('l');
    expect(again.getState().prefs.reducedMotion).toBe('on');
    store.getState().setCursor(-50);
    expect(store.getState().cursor).toBe(0);
    store.getState().setCursor(99_999);
    expect(store.getState().cursor).toBe(1560);
    store.getState().nudgeCursor(-10);
    expect(store.getState().cursor).toBe(1550);
  });

  it('fonctionne sans stockage (adaptateur nul)', () => {
    const store = createGameStore({ adapter: null, now: fixedNow });
    store.getState().bootstrap();
    expect(store.getState().storageAvailable).toBe(false);
    expect(store.getState().game).not.toBeNull();
    expect(store.getState().dispatch({ type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_counting_error' as never }).ok).toBe(true);
  });
});
