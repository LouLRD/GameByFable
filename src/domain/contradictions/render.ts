/**
 * Rendu textuel (français) des étapes d'explication structurées.
 * Ne révèle jamais autre chose que les libellés des éléments référencés.
 */
import type { ExplanationStep } from '../model/contradiction';
import type { LoadedScenario } from '../model/scenario';
import { formatClockFr, type Interval } from '../model/time';

export interface RenderedStep {
  text: string;
  refIds: string[];
  at?: number;
  zoneIds: string[];
}

export function renderStep(step: ExplanationStep, scenario: LoadedScenario): RenderedStep {
  const start = scenario.data.scenario.timeline.startClock;
  const clock = (t: number) => formatClockFr(start, t);
  const range = (i: Interval) => (i.start === i.end ? `à ${clock(i.start)}` : `de ${clock(i.start)} à ${clock(i.end)}`);
  const name = (id: string) => scenario.index.characters.get(id as never)?.name ?? id;
  const zone = (id: string) => scenario.index.zones.get(id as never)?.label ?? id;
  const prop = (id: string) => scenario.index.propositions.get(id as never)?.label ?? id;
  const hyp = (id: string) => scenario.index.hypotheses.get(id as never)?.label ?? id;
  const evidence = (id: string) => scenario.index.evidence.get(id as never)?.label ?? id;
  const sourceLabel: Record<'camera' | 'evidence' | 'fact' | 'statement' | 'claim', string> = {
    camera: 'caméra',
    evidence: 'pièce',
    fact: 'fait établi',
    statement: 'déclaration',
    claim: 'hypothèse',
  };
  const pieceLabel = (id: string) => scenario.index.evidence.get(id as never)?.label ?? scenario.index.statements.get(id as never)?.publicText ?? scenario.index.hypotheses.get(id as never)?.label ?? id;

  switch (step.type) {
    case 'claim': {
      const parts = [`Hypothèse « ${hyp(step.hypothesisId)} »`];
      if (step.actorId) parts.push(`acteur : ${name(step.actorId)}`);
      if (step.zoneId) parts.push(`lieu : ${zone(step.zoneId)}`);
      if (step.interval) parts.push(range(step.interval));
      return { text: parts.join(' — '), refIds: [step.hypothesisId, ...(step.actorId ? [step.actorId] : [])], zoneIds: step.zoneId ? [step.zoneId] : [], ...(step.interval ? { at: step.interval.start } : {}) };
    }
    case 'statement': {
      const s = scenario.index.statements.get(step.statementId as never);
      return { text: `${name(step.speakerId)} déclare : « ${s?.publicText ?? step.statementId} »`, refIds: [step.statementId, step.speakerId], zoneIds: [] };
    }
    case 'evidence':
      return { text: `Pièce : « ${evidence(step.evidenceId)} »`, refIds: [step.evidenceId], zoneIds: [] };
    case 'position':
      return {
        text: `${name(step.characterId)} se trouve à ${zone(step.zoneId)} ${range(step.interval)} (${sourceLabel[step.source]}).`,
        refIds: [step.characterId],
        zoneIds: [step.zoneId],
        at: step.interval.start,
      };
    case 'absent-from-camera':
      return {
        text: `La caméra, active ${range(step.interval)}, ne montre ${name(step.characterId)} dans aucune zone filmée.`,
        refIds: [step.characterId],
        zoneIds: [],
        at: step.interval.start,
      };
    case 'travel': {
      const via = step.via.length > 2 ? ` via ${step.via.slice(1, -1).map(zone).join(', ')}` : '';
      const secs = Number.isFinite(step.seconds) ? `${Math.round(step.seconds * 10) / 10} s` : 'impossible';
      return {
        text: `Trajet ${zone(step.from)} → ${zone(step.to)} en partant à ${clock(step.departure)} : ${secs}${via}${step.obstructed ? ' (passage encombré)' : ''}.`,
        refIds: [step.characterId],
        zoneIds: step.via,
        at: step.departure,
      };
    }
    case 'arrival-too-late':
      return {
        text: `${name(step.characterId)} ne peut atteindre ${zone(step.zoneId)} avant ${clock(step.earliest)}, alors que l'hypothèse l'y place dès ${clock(step.required)}.`,
        refIds: [step.characterId],
        zoneIds: [step.zoneId],
        at: step.required,
      };
    case 'departure-too-late':
      return {
        text: `Pour être vu·e ensuite là où la caméra le montre, ${name(step.characterId)} devait quitter ${zone(step.zoneId)} au plus tard à ${clock(step.latest)}, mais l'hypothèse le retient jusqu'à ${clock(step.required)}.`,
        refIds: [step.characterId],
        zoneIds: [step.zoneId],
        at: step.required,
      };
    case 'overlap':
      return {
        text: `${name(step.characterId)} serait à la fois à ${zone(step.a.zoneId)} (${range(step.a.interval)}) et à ${zone(step.b.zoneId)} (${range(step.b.interval)}).`,
        refIds: [step.characterId],
        zoneIds: [step.a.zoneId, step.b.zoneId],
        at: Math.max(step.a.interval.start, step.b.interval.start),
      };
    case 'sight': {
      const q = Math.round(step.quality * 100);
      const via = step.via.length > 2 ? ` en passant par ${step.via.slice(1, -1).map(zone).join(', ')}` : '';
      const occlZone = step.occludedBy ? scenario.index.obstructions.get(step.occludedBy as never)?.zoneId : undefined;
      const occl = step.occludedBy ? ` ; une obstruction (${occlZone ? zone(occlZone) : step.occludedBy}) dégrade la vue` : '';
      return {
        text: `Depuis ${zone(step.from)}, la vue vers ${zone(step.to)} à ${clock(step.at)} est ${q === 0 ? 'nulle' : `de qualité ${q} %`}${via}${occl}.`,
        refIds: [step.observer],
        zoneIds: [step.from, step.to],
        at: step.at,
      };
    }
    case 'sound': {
      const via = step.via.length > 2 ? ` via ${step.via.slice(1, -1).map(zone).join(', ')}` : '';
      return {
        text: `Un son émis à ${zone(step.from)} arrive à ${zone(step.to)} avec une intensité de ${Math.round(step.intensity * 100)} %${via} (seuil d'audibilité ${Math.round(step.threshold * 100)} %).`,
        refIds: [],
        zoneIds: [step.from, step.to],
      };
    }
    case 'signature-mismatch':
      return {
        text: `Signature décrite : ${step.expected.join(', ')} ; signature proposée : ${step.claimed.join(', ')} ; en commun : ${step.shared.length > 0 ? step.shared.join(', ') : 'rien'}.`,
        refIds: [],
        zoneIds: [],
      };
    case 'timing-mismatch':
      return {
        text: `Le bruit est situé ${range(step.expected)} ; l'hypothèse le place ${range(step.claimed)}.`,
        refIds: [],
        zoneIds: [],
        at: step.expected.start,
      };
    case 'requires':
      return {
        text: `Cela exige l'une de ces explications : ${step.anyOf.map(prop).join(' / ')}.`,
        refIds: step.evidenceId ? [step.evidenceId] : [],
        zoneIds: [],
      };
    case 'excludes':
      return { text: `« ${pieceLabel(step.sourceId)} » exclut : ${prop(step.propositionId)}.`, refIds: [step.sourceId], zoneIds: [] };
    case 'proposition-conflict':
      return {
        text:
          step.reason === 'explicit'
            ? `« ${prop(step.a)} » et « ${prop(step.b)} » s'excluent mutuellement.`
            : step.reason === 'space-time'
              ? `« ${prop(step.a)} » et « ${prop(step.b)} » placent la même personne à deux endroits en même temps.`
              : `« ${prop(step.a)} » et « ${prop(step.b)} » répondent à la même question par deux réponses différentes.`,
        refIds: [],
        zoneIds: [],
      };
    case 'knowledge-gap':
      return {
        text:
          step.availableTags.length === 0
            ? `Aucune perception ni information connue de ${name(step.characterId)} ne couvre : ${step.missingTags.join(', ')}.`
            : `${name(step.characterId)} disposait de : ${step.availableTags.join(', ')} ; il manque : ${step.missingTags.join(', ')}.`,
        refIds: [step.characterId],
        zoneIds: [],
      };
    case 'discredited':
      return { text: `Cette déclaration est déjà contredite par : ${step.byIds.map(pieceLabel).join(', ')}.`, refIds: [step.statementId, ...step.byIds], zoneIds: [] };
    case 'text':
    case 'conclusion':
      return { text: step.text, refIds: [], zoneIds: [] };
  }
}

export const renderExplanation = (steps: readonly ExplanationStep[], scenario: LoadedScenario): RenderedStep[] =>
  steps.map((s) => renderStep(s, scenario));
