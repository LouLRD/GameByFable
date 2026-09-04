/**
 * Store Zustand : adaptation moteur <-> interface. AUCUNE logique métier ici :
 * chaque action de jeu passe par `applyAction` du domaine ; le store journalise,
 * sauvegarde automatiquement et pilote l'état d'interface (curseur, sélection, dialogues).
 */
import { create } from 'zustand';
import type { LoadedScenario } from '@/domain/model/scenario';
import type { GameState } from '@/domain/model/state';
import type { ActionError, ActionResult, PlayerAction } from '@/domain/model/actions';
import { applyAction, createInitialState, reduceGame } from '@/domain/replay/reducer';
import { loadBundledScenario, type ScenarioIssue } from '@/scenario';
import {
  SaveRepository,
  createBoundedAdapter,
  createLocalStorageAdapter,
  createSaveFile,
  MemoryStorage,
  parseImport,
  serializeSave,
  buildExportFilename,
  triggerDownload,
  type SaveFileV2,
  type SlotId,
  type SlotSummary,
  type StorageAdapter,
} from '@/persistence';
import { APP_VERSION } from '@/app/version';
import type {
  CasefileFilter,
  ClaimFormDraft,
  ConfrontationDraft,
  DialogId,
  FocusPanel,
  InspectorTab,
  ReducedMotionPref,
  Selection,
  SelectionKind,
  SpaceId,
  TextSizePref,
  Toast,
} from './types';

const PREFS_KEY = 'lva:prefs:v1';

export interface Prefs {
  reducedMotion: ReducedMotionPref;
  textSize: TextSizePref;
  hintsEnabled: boolean;
  audioEnabled: boolean;
  seenIntro: boolean;
}

const defaultPrefs: Prefs = { reducedMotion: 'system', textSize: 'm', hintsEnabled: true, audioEnabled: false, seenIntro: false };

export interface SessionState {
  scenario: LoadedScenario | null;
  loadIssues: ScenarioIssue[] | null;
  seed: string;
  actions: PlayerAction[];
  game: GameState | null;
  lastError: ActionError | null;
  /** Incrémenté à chaque action acceptée : permet aux composants de réagir (propagation visuelle). */
  actionNonce: number;
  /** Type de la dernière action acceptée (pour les retours visuels). */
  lastActionType: PlayerAction['type'] | null;
  unsavedSinceExport: boolean;
  restoredFrom: 'autosave' | 'new' | 'slot' | 'import' | null;
  storageAvailable: boolean;
}

export interface UiState {
  cursor: number;
  selection: Selection | null;
  activeSpace: SpaceId;
  focusPanel: FocusPanel;
  inspectorTab: InspectorTab;
  casefileFilter: CasefileFilter;
  playing: boolean;
  playbackSpeed: number;
  dialog: DialogId;
  confrontationDraft: ConfrontationDraft;
  claimForm: ClaimFormDraft | null;
  liveMessage: string;
  liveNonce: number;
  impasseCount: number;
  toasts: Toast[];
  /** Zones/personnages à mettre en évidence brièvement (propagation). */
  highlightIds: string[];
  highlightNonce: number;
  prefs: Prefs;
}

export interface StoreActions {
  bootstrap(): void;
  newGame(seed?: string): void;
  dispatch(action: PlayerAction): ActionResult<GameState> | { ok: false; error: ActionError; state: null };
  listSlots(): SlotSummary[];
  saveToSlot(slot: SlotId, label?: string): { ok: boolean; message: string };
  loadSlot(slot: SlotId): { ok: boolean; message: string };
  clearSlot(slot: SlotId): void;
  exportSave(): { ok: boolean; message: string; filename?: string; content?: string };
  importSave(text: string): { ok: boolean; message: string };
  setCursor(t: number): void;
  nudgeCursor(delta: number): void;
  select(kind: SelectionKind, id: string, opts?: { space?: SpaceId; cursor?: number }): void;
  clearSelection(): void;
  setActiveSpace(space: SpaceId): void;
  setFocusPanel(panel: FocusPanel): void;
  setInspectorTab(tab: InspectorTab): void;
  setCasefileFilter(filter: CasefileFilter): void;
  setPlaying(playing: boolean): void;
  setPlaybackSpeed(speed: number): void;
  openDialog(dialog: DialogId): void;
  closeDialog(): void;
  setConfrontationDraft(draft: Partial<ConfrontationDraft>): void;
  openClaimForm(slotId: string, hypothesisId?: string | null): void;
  announce(message: string): void;
  pushToast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  highlight(ids: string[]): void;
  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void;
  noteImpasse(): void;
  resetImpasses(): void;
}

export type GameStore = SessionState & UiState & StoreActions;

function loadPrefs(adapter: StorageAdapter | null): Prefs {
  if (!adapter) return defaultPrefs;
  try {
    const raw = adapter.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...defaultPrefs, ...parsed };
  } catch {
    return defaultPrefs;
  }
}

function savePrefs(adapter: StorageAdapter | null, prefs: Prefs): void {
  if (!adapter) return;
  try {
    adapter.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // stockage indisponible : les préférences restent en mémoire
  }
}

export interface StoreDeps {
  adapter?: StorageAdapter | null;
  now?: () => Date;
}

export function createGameStore(deps: StoreDeps = {}) {
  const adapter = deps.adapter === undefined ? createLocalStorageAdapter() : deps.adapter;
  const storageAvailable = adapter !== null;
  const bounded = createBoundedAdapter(adapter ?? new MemoryStorage());
  const now = deps.now ?? (() => new Date());
  let repository: SaveRepository | null = null;
  let toastCounter = 0;

  return create<GameStore>()((set, get) => {
    const buildSave = (label: string): SaveFileV2 | null => {
      const { scenario, seed, actions, cursor, selection, activeSpace } = get();
      if (!scenario) return null;
      return createSaveFile({
        scenarioId: scenario.data.scenario.id,
        scenarioVersion: scenario.data.scenario.version,
        seed,
        actions,
        ui: { cursor, selectedId: selection?.id ?? null, activeSpace: activeSpace === 'inspector' ? 'version' : activeSpace },
        label,
        savedAt: now().toISOString(),
        appVersion: APP_VERSION,
      });
    };
    const autosave = () => {
      const save = buildSave('Sauvegarde automatique');
      if (save && repository) repository.write('auto', save);
    };
    const restore = (save: SaveFileV2, from: SessionState['restoredFrom']) => {
      const scenario = get().scenario;
      if (!scenario) return { ok: false, message: 'Scénario non chargé.' };
      const initial = createInitialState(scenario, save.seed);
      const { state, rejected } = reduceGame(scenario, initial, save.actions);
      const actions = save.actions.filter((_, i) => !rejected.some((r) => r.index === i));
      set({
        seed: save.seed,
        actions,
        game: state,
        lastError: null,
        restoredFrom: from,
        cursor: Math.min(Math.max(0, save.ui.cursor), scenario.data.scenario.timeline.durationSeconds),
        selection: null,
        activeSpace: save.ui.activeSpace === 'version' ? 'inspector' : (save.ui.activeSpace ?? 'casefile'),
        dialog: null,
        unsavedSinceExport: from !== 'import',
        actionNonce: get().actionNonce + 1,
        lastActionType: null,
      });
      autosave();
      return {
        ok: true,
        message: rejected.length > 0 ? `Partie restaurée ; ${rejected.length} action(s) obsolète(s) ignorée(s).` : 'Partie restaurée.',
      };
    };

    return {
      // --- session ---------------------------------------------------------
      scenario: null,
      loadIssues: null,
      seed: '',
      actions: [],
      game: null,
      lastError: null,
      actionNonce: 0,
      lastActionType: null,
      unsavedSinceExport: false,
      restoredFrom: null,
      storageAvailable,
      // --- ui --------------------------------------------------------------
      cursor: 0,
      selection: null,
      activeSpace: 'casefile',
      focusPanel: null,
      inspectorTab: 'version',
      casefileFilter: 'all',
      playing: false,
      playbackSpeed: 4,
      dialog: null,
      confrontationDraft: { characterId: null, targetId: null, supportId: null, approach: 'neutral' },
      claimForm: null,
      liveMessage: '',
      liveNonce: 0,
      impasseCount: 0,
      toasts: [],
      highlightIds: [],
      highlightNonce: 0,
      prefs: loadPrefs(adapter),

      bootstrap() {
        const result = loadBundledScenario();
        if (!result.ok) {
          set({ scenario: null, loadIssues: result.issues, game: null });
          return;
        }
        const scenario = result.scenario;
        repository = new SaveRepository(bounded, { scenarioId: scenario.data.scenario.id, scenarioVersion: scenario.data.scenario.version });
        set({ scenario, loadIssues: null, cursor: 0 });
        const auto = repository.read('auto');
        if (auto.ok) {
          restore(auto.save, 'autosave');
          return;
        }
        get().newGame();
      },

      newGame(seed) {
        const scenario = get().scenario;
        if (!scenario) return;
        const finalSeed = seed ?? scenario.data.scenario.seed;
        const game = createInitialState(scenario, finalSeed);
        set({
          seed: finalSeed,
          actions: [],
          game,
          lastError: null,
          restoredFrom: 'new',
          cursor: 0,
          selection: null,
          activeSpace: 'casefile',
          focusPanel: null,
          inspectorTab: 'version',
          dialog: null,
          claimForm: null,
          impasseCount: 0,
          unsavedSinceExport: false,
          actionNonce: get().actionNonce + 1,
          lastActionType: null,
          playing: false,
        });
        autosave();
        get().announce('Nouvelle partie. Le dossier de La Veilleuse est ouvert.');
      },

      dispatch(action) {
        const { scenario, game } = get();
        if (!scenario || !game) return { ok: false, error: { code: 'sealed', message: 'Aucune partie en cours.' }, state: null };
        const result = applyAction(scenario, game, action);
        if (!result.ok) {
          set({ lastError: result.error, impasseCount: get().impasseCount + 1 });
          get().announce(result.error.message);
          return result;
        }
        set((s) => ({
          game: result.state,
          actions: [...s.actions, action],
          lastError: null,
          actionNonce: s.actionNonce + 1,
          lastActionType: action.type,
          unsavedSinceExport: true,
        }));
        autosave();
        return result;
      },

      listSlots() {
        return repository ? repository.list() : [];
      },
      saveToSlot(slot, label) {
        const save = buildSave(label ?? `Emplacement ${slot.replace('slot-', '')}`);
        if (!save || !repository) return { ok: false, message: 'Sauvegarde impossible : scénario non chargé.' };
        const r = repository.write(slot, save);
        if (!r.ok) return { ok: false, message: r.message };
        return { ok: true, message: 'Partie sauvegardée.' };
      },
      loadSlot(slot) {
        if (!repository) return { ok: false, message: 'Stockage indisponible.' };
        const r = repository.read(slot);
        if (!r.ok) return { ok: false, message: r.reason === 'empty' ? 'Emplacement vide.' : `Sauvegarde refusée (${r.reason}) : ${r.issues.join(' ; ')}` };
        return restore(r.save, 'slot');
      },
      clearSlot(slot) {
        repository?.clear(slot);
      },
      exportSave() {
        const { scenario } = get();
        const save = buildSave('Export');
        if (!save || !scenario) return { ok: false, message: 'Export impossible.' };
        const content = serializeSave(save);
        const filename = buildExportFilename(scenario.data.scenario.id, now());
        triggerDownload(filename, content);
        set({ unsavedSinceExport: false });
        return { ok: true, message: `Sauvegarde exportée : ${filename}`, filename, content };
      },
      importSave(text) {
        const { scenario } = get();
        if (!scenario) return { ok: false, message: 'Scénario non chargé.' };
        const r = parseImport(text, { scenarioId: scenario.data.scenario.id, scenarioVersion: scenario.data.scenario.version });
        if (!r.ok) {
          const reasons: Record<string, string> = {
            'invalid-schema': 'fichier illisible ou incomplet',
            'unknown-scenario': 'scénario inconnu',
            'newer-format': 'format de sauvegarde plus récent que cette version du jeu',
            'scenario-version-newer': 'version de scénario plus récente',
            'unknown-kind': 'ce fichier n’est pas une sauvegarde du jeu',
          };
          return { ok: false, message: `Import refusé : ${reasons[r.reason] ?? r.reason}. La partie en cours est conservée.` };
        }
        const res = restore(r.save, 'import');
        return { ok: res.ok, message: r.migratedFrom ? `${res.message} (migrée depuis le format ${r.migratedFrom}).` : res.message };
      },

      // --- ui --------------------------------------------------------------
      setCursor(t) {
        const scenario = get().scenario;
        const max = scenario?.data.scenario.timeline.durationSeconds ?? 0;
        set({ cursor: Math.min(max, Math.max(0, Math.round(t))) });
      },
      nudgeCursor(delta) {
        get().setCursor(get().cursor + delta);
      },
      select(kind, id, opts) {
        set((s) => ({
          selection: { kind, id },
          ...(opts?.space ? { activeSpace: opts.space } : {}),
          ...(kind === 'contradiction' ? { inspectorTab: 'contradictions' as InspectorTab } : {}),
          ...(opts?.cursor !== undefined ? { cursor: Math.round(opts.cursor) } : {}),
          highlightIds: s.highlightIds,
        }));
      },
      clearSelection() {
        set({ selection: null });
      },
      setActiveSpace(space) {
        set({ activeSpace: space });
      },
      setFocusPanel(panel) {
        set({ focusPanel: panel });
      },
      setInspectorTab(tab) {
        set({ inspectorTab: tab });
      },
      setCasefileFilter(filter) {
        set({ casefileFilter: filter });
      },
      setPlaying(playing) {
        set({ playing });
      },
      setPlaybackSpeed(speed) {
        set({ playbackSpeed: Math.max(1, Math.min(32, speed)) });
      },
      openDialog(dialog) {
        set({ dialog, playing: false });
      },
      closeDialog() {
        set({ dialog: null, claimForm: null });
      },
      setConfrontationDraft(draft) {
        set((s) => ({ confrontationDraft: { ...s.confrontationDraft, ...draft } }));
      },
      openClaimForm(slotId, hypothesisId = null) {
        set({ claimForm: { slotId, hypothesisId }, dialog: 'claim-form', playing: false });
      },
      announce(message) {
        set((s) => ({ liveMessage: message, liveNonce: s.liveNonce + 1 }));
      },
      pushToast(text, tone = 'info') {
        toastCounter += 1;
        const id = toastCounter;
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-4) }));
      },
      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },
      highlight(ids) {
        set((s) => ({ highlightIds: ids, highlightNonce: s.highlightNonce + 1 }));
      },
      setPref(key, value) {
        const prefs = { ...get().prefs, [key]: value };
        set({ prefs });
        savePrefs(adapter, prefs);
      },
      noteImpasse() {
        set((s) => ({ impasseCount: s.impasseCount + 1 }));
      },
      resetImpasses() {
        set({ impasseCount: 0 });
      },
    };
  });
}

export const useGameStore = createGameStore();
export type GameStoreApi = ReturnType<typeof createGameStore>;
