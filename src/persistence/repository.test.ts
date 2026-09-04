import { describe, expect, it } from 'vitest';
import { parseImport } from './exportImport';
import { SLOT_IDS, SaveRepository } from './repository';
import { MemoryStorage, createBoundedAdapter } from './storage';
import type { StorageAdapter } from './storage';
import { EXPECTED, makeSave } from './testFixtures';

function setup(adapter: StorageAdapter = new MemoryStorage()) {
  return { adapter, repo: new SaveRepository(adapter, EXPECTED) };
}

describe('SaveRepository', () => {
  it('expose quatre emplacements, tous vides au départ', () => {
    const { repo } = setup();
    expect(SLOT_IDS).toEqual(['auto', 'slot-1', 'slot-2', 'slot-3']);
    expect(repo.list()).toEqual(
      SLOT_IDS.map((slotId) => ({ slotId, label: '', savedAt: '', actionCount: 0, empty: true })),
    );
    expect(repo.read('auto')).toEqual({ ok: false, reason: 'empty', issues: [] });
    expect(repo.hasAnyProgress()).toBe(false);
  });

  it('écrit, relit, liste et efface un emplacement', () => {
    const { repo, adapter } = setup();
    const save = makeSave({ label: 'Soirée du 4' });

    expect(repo.write('slot-2', save)).toEqual({ ok: true });
    expect(adapter.keys()).toEqual(['lva:v1:slot-2']);

    const read = repo.read('slot-2');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.save).toEqual(save);

    const summary = repo.list().find((s) => s.slotId === 'slot-2');
    expect(summary).toEqual({
      slotId: 'slot-2',
      label: 'Soirée du 4',
      savedAt: save.savedAt,
      actionCount: save.actions.length,
      empty: false,
    });
    expect(repo.hasAnyProgress()).toBe(true);

    repo.clear('slot-2');
    expect(repo.read('slot-2')).toEqual({ ok: false, reason: 'empty', issues: [] });
    expect(adapter.keys()).toEqual([]);
  });

  it('respecte un préfixe de clé personnalisé', () => {
    const adapter = new MemoryStorage();
    const repo = new SaveRepository(adapter, EXPECTED, 'test:');
    repo.write('auto', makeSave());
    expect(adapter.keys()).toEqual(['test:auto']);
    expect(repo.keyFor('slot-1')).toBe('test:slot-1');
  });

  it('une écriture refusée pour quota laisse l’ancienne valeur intacte', () => {
    const inner = new MemoryStorage();
    const small = makeSave({ actions: [], ui: { cursor: 0, selectedId: null, activeSpace: null } });
    const smallSize = JSON.stringify(small, null, 2).length;
    const { repo } = setup(createBoundedAdapter(inner, smallSize + 16));

    expect(repo.write('auto', small)).toEqual({ ok: true });
    const before = inner.getItem('lva:v1:auto');

    const result = repo.write('auto', makeSave());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('quota');
      expect(result.message).toContain('lva:v1:auto');
    }
    expect(inner.getItem('lva:v1:auto')).toBe(before);
  });

  it('une écriture sur un stockage indisponible est signalée sans lever', () => {
    const failing: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError: accès refusé');
      },
      removeItem: () => undefined,
      keys: () => [],
    };
    const { repo } = setup(failing);
    expect(repo.write('slot-1', makeSave())).toEqual({
      ok: false,
      reason: 'unavailable',
      message: 'SecurityError: accès refusé',
    });
  });

  it('classe un QuotaExceededError du navigateur comme quota', () => {
    const quotaAdapter: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => undefined,
      keys: () => [],
    };
    const { repo } = setup(quotaAdapter);
    expect(repo.write('slot-1', makeSave())).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('une lecture corrompue retourne le rejet sans supprimer la clé', () => {
    const { repo, adapter } = setup();
    adapter.setItem(
      'lva:v1:slot-3',
      '{"kind": "la-version-acceptable-save", "formatVersion": 2, oops',
    );

    const result = repo.read('slot-3');
    expect(result).toMatchObject({ ok: false, reason: 'invalid-schema' });
    expect(adapter.getItem('lva:v1:slot-3')).toContain('oops');

    const summary = repo.list().find((s) => s.slotId === 'slot-3');
    expect(summary).toEqual({
      slotId: 'slot-3',
      label: '',
      savedAt: '',
      actionCount: 0,
      empty: true,
      rejection: 'invalid-schema',
    });
    expect(repo.hasAnyProgress()).toBe(false);
  });

  it('un emplacement d’un format plus récent est signalé et conservé', () => {
    const { repo, adapter } = setup();
    adapter.setItem('lva:v1:slot-1', JSON.stringify({ ...makeSave(), formatVersion: 7 }));
    expect(repo.read('slot-1')).toMatchObject({ ok: false, reason: 'newer-format' });
    expect(repo.list().find((s) => s.slotId === 'slot-1')?.rejection).toBe('newer-format');
    expect(adapter.getItem('lva:v1:slot-1')).not.toBeNull();
  });

  it('un import invalide laisse la sauvegarde courante intacte', () => {
    const { repo, adapter } = setup();
    const current = makeSave({ label: 'Courante' });
    repo.write('auto', current);
    const rawBefore = adapter.getItem('lva:v1:auto');

    const imported = parseImport('{"formatVersion": 2, "kind": "autre"}', EXPECTED);
    expect(imported.ok).toBe(false);

    expect(adapter.getItem('lva:v1:auto')).toBe(rawBefore);
    const read = repo.read('auto');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.save).toEqual(current);
  });

  it('hasAnyProgress ignore une sauvegarde sans action', () => {
    const { repo } = setup();
    repo.write(
      'auto',
      makeSave({ actions: [], ui: { cursor: 0, selectedId: null, activeSpace: null } }),
    );
    expect(repo.hasAnyProgress()).toBe(false);
  });
});
