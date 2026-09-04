/**
 * Épilogue plein écran (après scellement) : sceau et titre de la fin, signatures, comparaison
 * version signée / faits, frise des faits (révélés ou caviardés), trajectoires réelles,
 * autres fins sous forme d'indices. Aucun bouton d'édition : le rapport est irréversible.
 */
import { useId, useState, type JSX } from 'react';

import { useEpilogue, useGameStore, usePlayerView } from '@/state';

import { FAMILY_LABELS, JOURNAL_KIND_LABELS, OUTCOME_TO_VERDICT, plural } from './labels';
import { SignatureRow } from './SignatureRow';
import { TrajectoryMap } from './TrajectoryMap';
import { TruthComparison } from './TruthComparison';
import './conclusion.css';

const FALLBACK_ACCENT = '#6d8fa8';

export function EpilogueScreen(): JSX.Element | null {
  const view = usePlayerView();
  const epilogue = useEpilogue();
  const scenario = useGameStore((s) => s.scenario);
  const [journalOpen, setJournalOpen] = useState(false);
  const titleId = useId();
  const signaturesId = useId();
  const comparisonId = useId();
  const factsId = useId();
  const tracksId = useId();
  const endingsId = useId();
  const journalId = useId();

  if (!view || !view.isSealed || !epilogue || !scenario) return null;

  const zones = scenario.data.zones;
  const zoneLabel = (id: string | null): string | null =>
    id === null ? null : (zones.find((z) => z.id === id)?.label ?? id);
  const characterName = (id: string): string =>
    view.characters.find((c) => c.id === id)?.name ?? id;
  const family = FAMILY_LABELS[epilogue.ending.family];
  const total = epilogue.characters.length;
  const signatures = epilogue.signatureCount;

  const onExport = (): void => {
    const store = useGameStore.getState();
    const result = store.exportSave();
    store.pushToast(result.message, result.ok ? 'success' : 'error');
    store.announce(result.message);
  };
  const onNewGame = (): void => {
    useGameStore.getState().openDialog('new-game');
  };

  return (
    <main className="epilogue" aria-labelledby={titleId}>
      <div className="epi-inner">
        <header className="epi-seal">
          <div>
            <p className="epi-kicker">Rapport scellé · famille : {family}</p>
            <h1 id={titleId} className="epi-title">
              {epilogue.ending.title}
            </h1>
            <p className="epi-meta">
              <span className="badge">
                {signatures} {plural(signatures, 'signature', 'signatures')} sur {total}
              </span>
              <span className="badge">
                {epilogue.shadowCount} {plural(epilogue.shadowCount, 'fait', 'faits')} dans
                l’ombre
              </span>
            </p>
            <div className="ticket">
              <div className="ticket-header">Épilogue</div>
              <p>{epilogue.ending.epilogue}</p>
            </div>
          </div>
          <div className="epi-stamp" data-family={epilogue.ending.family} aria-hidden="true">
            {family}
            <small>rapport scellé</small>
          </div>
        </header>

        <section className="epi-section" aria-labelledby={signaturesId}>
          <h2 id={signaturesId} className="epi-section-title">
            Signatures
          </h2>
          <ul className="sig-list list-plain">
            {epilogue.characters.map((person) => {
              const character = view.characters.find((c) => c.id === person.characterId);
              return (
                <SignatureRow
                  key={person.characterId}
                  name={person.name}
                  role={character?.role}
                  portraitSeed={character?.portraitSeed ?? 0}
                  accentColor={character?.accentColor ?? FALLBACK_ACCENT}
                  verdict={OUTCOME_TO_VERDICT[person.outcome]}
                  line={person.line}
                  reasons={person.publicReasons}
                />
              );
            })}
          </ul>
        </section>

        <section className="epi-section" aria-labelledby={comparisonId}>
          <h2 id={comparisonId} className="epi-section-title">
            Version signée et faits
          </h2>
          <TruthComparison slots={epilogue.slots} />
        </section>

        <section className="epi-section" aria-labelledby={factsId}>
          <h2 id={factsId} className="epi-section-title">
            Ce que la soirée contenait
          </h2>
          <ol className="epi-facts list-plain">
            {epilogue.facts.map((fact) =>
              fact.revealed ? (
                <li key={fact.id} className="epi-fact degree-established" data-revealed="true">
                  <span className="epi-fact-time">
                    {view.clock(fact.interval.start)} – {view.clock(fact.interval.end)}
                  </span>
                  <span className="epi-fact-label">{fact.label}</span>
                  {fact.zoneId ? (
                    <span className="epi-fact-where">{zoneLabel(fact.zoneId)}</span>
                  ) : null}
                  {fact.participantIds.length > 0 ? (
                    <span className="epi-fact-who">
                      {fact.participantIds.map(characterName).join(', ')}
                    </span>
                  ) : null}
                </li>
              ) : (
                <li key={fact.id} className="epi-fact epi-fact-shadow" data-revealed="false">
                  <span aria-hidden="true">◌</span>
                  <span>
                    fait non élucidé{fact.slotLabel ? ` — lié à « ${fact.slotLabel} »` : ''}
                  </span>
                </li>
              ),
            )}
          </ol>
          <p className="epi-note">
            {epilogue.shadowCount > 0
              ? `${epilogue.shadowCount} ${plural(epilogue.shadowCount, 'fait reste', 'faits restent')} dans l’ombre : l’enquête ne les a jamais approchés.`
              : 'Tous les faits de la soirée ont été approchés par l’enquête.'}
          </p>
          {epilogue.omittedEvidenceLabels.length > 0 ? (
            <div className="epi-omitted">
              <h3 className="epi-omitted-title">Pièces omises du rapport</h3>
              <ul className="epi-omitted-list list-plain">
                {epilogue.omittedEvidenceLabels.map((label) => (
                  <li key={label} className="tag">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="epi-section" aria-labelledby={tracksId}>
          <h2 id={tracksId} className="epi-section-title">
            Trajectoires réelles
          </h2>
          <TrajectoryMap
            zones={zones}
            tracks={epilogue.tracks}
            characters={view.characters.map((c) => ({
              id: c.id,
              name: c.name,
              accentColor: c.accentColor,
            }))}
            durationSeconds={view.durationSeconds}
            clock={view.clock}
          />
        </section>

        {epilogue.otherEndings.length > 0 ? (
          <section className="epi-section" aria-labelledby={endingsId}>
            <h2 id={endingsId} className="epi-section-title">
              Autres fins
            </h2>
            <ul className="epi-endings list-plain">
              {epilogue.otherEndings.map((ending) => (
                <li key={ending.id} className="card">
                  <h3 className="epi-ending-title">{ending.title}</h3>
                  {ending.hint ? <p className="epi-ending-hint">{ending.hint}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="epi-section" aria-label="Et ensuite">
          <div className="epi-actions">
            <button type="button" className="btn btn-primary" onClick={onNewGame}>
              Nouvelle partie
            </button>
            <button type="button" className="btn" onClick={onExport}>
              Exporter cette partie
            </button>
            <button
              type="button"
              className="btn"
              aria-expanded={journalOpen}
              aria-controls={journalId}
              onClick={() => setJournalOpen((open) => !open)}
            >
              Relire le dossier
            </button>
          </div>
          {journalOpen ? (
            <ol id={journalId} className="epi-journal list-plain" aria-label="Journal du dossier">
              {view.journal.map((entry) => (
                <li key={entry.id} data-kind={entry.kind}>
                  <span className="tag">{JOURNAL_KIND_LABELS[entry.kind]}</span>
                  <span className={entry.handwritten ? 'hand-note' : undefined}>{entry.text}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </main>
  );
}
