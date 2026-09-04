// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingStep } from '@/domain/model/scenario';
import { App } from '@/app/App';
import { resetStore, stubViewport } from '@/app/testing';
import { useGameStore } from '@/state';
import { focusToSpace } from './focusTarget';
import { HintCallout } from './HintCallout';
import { OnboardingCallout } from './OnboardingCallout';

vi.setConfig({ testTimeout: 30_000 });

function hintCallout(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.callout-hint');
}

function steps(): OnboardingStep[] {
  return useGameStore.getState().scenario?.data.onboarding ?? [];
}

describe('<OnboardingCallout />', () => {
  beforeEach(() => {
    stubViewport(1280);
    resetStore();
  });
  afterEach(cleanup);

  it('« Compris » dispatch dismiss-onboarding pour l’étape courante', async () => {
    const user = userEvent.setup();
    const [step] = steps();
    if (!step) throw new Error('scénario sans onboarding');
    render(<OnboardingCallout step={step} isDesktop />);
    expect(screen.getByText(step.text)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compris' }));
    const s = useGameStore.getState();
    expect(s.game?.dismissedOnboardingIds).toEqual([step.id]);
    expect(s.actions.at(-1)).toEqual({ type: 'dismiss-onboarding', onboardingId: step.id });
  });

  it('« Tout passer » ferme toutes les étapes restantes', async () => {
    const user = userEvent.setup();
    const all = steps();
    const [first] = all;
    if (!first) throw new Error('scénario sans onboarding');
    render(<OnboardingCallout step={first} isDesktop />);
    await user.click(screen.getByRole('button', { name: 'Tout passer' }));
    const dismissed = useGameStore.getState().game?.dismissedOnboardingIds ?? [];
    expect([...dismissed].sort()).toEqual(all.map((o) => o.id).sort());
  });

  it('en mobile, « Aller à l’espace » active l’espace visé par le repère', async () => {
    const user = userEvent.setup();
    const step = steps().find((o) => o.focus === 'timeline');
    if (!step) throw new Error('aucune étape ciblant la frise');
    expect(focusToSpace(step.focus)).toBe('timeline');
    render(<OnboardingCallout step={step} isDesktop={false} />);
    await user.click(screen.getByRole('button', { name: 'Aller à l’espace Temps' }));
    expect(useGameStore.getState().activeSpace).toBe('timeline');
  });

  it('dans le bureau, la bulle suit view.onboarding et disparaît après « Compris »', async () => {
    const user = userEvent.setup();
    const [first] = steps();
    if (!first) throw new Error('scénario sans onboarding');
    render(<App />);
    const callout = screen.getByText(first.text).closest('aside');
    expect(callout).not.toBeNull();
    expect(document.querySelector('.callout-stack')).toHaveAttribute('data-anchor', focusToSpace(first.focus));
    await user.click(screen.getByRole('button', { name: 'Compris' }));
    expect(screen.queryByText(first.text)).toBeNull();
  });
});

describe('<HintCallout /> — aide progressive', () => {
  beforeEach(() => {
    stubViewport(1280);
    resetStore();
  });
  afterEach(cleanup);

  it('reste muette sous le seuil, puis propose une piste ; « Masquer » remet les impasses à zéro', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(hintCallout()).toBeNull();
    // Trois actions refusées (hypothèse inconnue) : le moteur compte les impasses.
    act(() => {
      for (let i = 0; i < 3; i++) {
        const r = useGameStore.getState().dispatch({ type: 'set-claim', slotId: 'cash_origin' as never, hypothesisId: 'h_inexistante' as never });
        expect(r.ok).toBe(false);
      }
    });
    expect(useGameStore.getState().impasseCount).toBe(3);
    const hint = hintCallout();
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent(/^Piste/);
    expect(hint).toHaveTextContent('Confrontez une déclaration avec la pièce qui la contredit.');
    await user.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(useGameStore.getState().impasseCount).toBe(0);
    expect(hintCallout()).toBeNull();
  });

  it('est désactivable par la préférence hintsEnabled', () => {
    useGameStore.setState((s) => ({ impasseCount: 5, prefs: { ...s.prefs, hintsEnabled: false } }));
    const view = { version: { blockingIds: [] }, contradictions: [], evidence: [] } as unknown as Parameters<typeof HintCallout>[0]['view'];
    const { container } = render(<HintCallout view={view} />);
    expect(container).toBeEmptyDOMElement();
  });
});
