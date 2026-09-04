// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Portrait } from '@/components/portrait/Portrait';
import { PORTRAIT_STATES } from '@/components/portrait/portraitGeometry';

function shapeElements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('[data-shape]'));
}

/** Balisage du portrait où le préfixe d'identifiant issu de `useId` est remplacé par un jeton fixe. */
function markupWithoutIds(container: HTMLElement): string {
  const clip = container.querySelector('clipPath');
  const idBase = clip?.id.replace(/-clip$/, '') ?? '';
  expect(idBase).not.toBe('');
  return container.innerHTML.split(idBase).join('portrait-ID');
}

describe('<Portrait />', () => {
  it('rend un svg role="img" avec le libellé accessible « Portrait de {name} »', () => {
    render(<Portrait seed={17} accentColor="#E3A857" name="Nadia" />);
    const svg = screen.getByRole('img', { name: 'Portrait de Nadia' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
  });

  it('applique la taille par défaut de 48 via width/height, sans style inline', () => {
    const { container } = render(<Portrait seed={29} accentColor="#6D8FA8" name="Karim" />);
    const svg = screen.getByRole('img', { name: 'Portrait de Karim' });
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
    for (const element of Array.from(container.querySelectorAll('*'))) {
      expect(element).not.toHaveAttribute('style');
    }
  });

  it('respecte la prop size', () => {
    render(<Portrait seed={41} accentColor="#A8C7A0" name="Léa" size={96} />);
    const svg = screen.getByRole('img', { name: 'Portrait de Léa' });
    expect(svg).toHaveAttribute('width', '96');
    expect(svg).toHaveAttribute('height', '96');
  });

  it('dessine plus de quatre éléments de forme, un fond et une ligne de posture', () => {
    const { container } = render(<Portrait seed={53} accentColor="#B48EAD" name="Sami" />);
    expect(shapeElements(container).length).toBeGreaterThan(4);
    expect(container.querySelector('[data-portrait-background]')).not.toBeNull();
    const posture = container.querySelector('line[data-posture]');
    expect(posture).not.toBeNull();
    expect(['gaze', 'shoulder']).toContain(posture?.getAttribute('data-posture'));
  });

  it('remplit les bandes hachurées avec un motif <pattern> référencé', () => {
    const { container } = render(<Portrait seed={67} accentColor="#D66B5D" name="Inès" />);
    const bands = Array.from(container.querySelectorAll('[data-shape="hatchBand"]'));
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      const fill = band.getAttribute('fill') ?? '';
      const match = /^url\(#(.+)\)$/.exec(fill);
      expect(match).not.toBeNull();
      const pattern = container.querySelector(`pattern[id="${match?.[1] ?? ''}"]`);
      expect(pattern).not.toBeNull();
      expect(pattern?.querySelector('line')).not.toBeNull();
    }
  });

  it('rend le même balisage pour les mêmes props, aux identifiants près', () => {
    const first = render(<Portrait seed={79} accentColor="#8CB6A8" name="Youssef" />);
    const markupA = markupWithoutIds(first.container);
    first.unmount();
    const second = render(<Portrait seed={79} accentColor="#8CB6A8" name="Youssef" />);
    expect(markupWithoutIds(second.container)).toBe(markupA);
    expect(markupA).toContain('data-shape=');
  });

  it('expose l’état et fait varier un détail (arc) entre fermé et engagé', () => {
    const closed = render(<Portrait seed={17} accentColor="#E3A857" name="Nadia" state="closed" />);
    const closedSvg = screen.getByRole('img', { name: 'Portrait de Nadia' });
    expect(closedSvg).toHaveAttribute('data-portrait-state', 'closed');
    const closedArcs = Array.from(closed.container.querySelectorAll('[data-shape="arc"]')).map(
      (arc) => arc.getAttribute('d'),
    );
    const closedShapeCount = shapeElements(closed.container).length;
    closed.unmount();

    const engaged = render(
      <Portrait seed={17} accentColor="#E3A857" name="Nadia" state="engaged" />,
    );
    const engagedArcs = Array.from(engaged.container.querySelectorAll('[data-shape="arc"]')).map(
      (arc) => arc.getAttribute('d'),
    );
    expect(engagedArcs).not.toEqual(closedArcs);
    expect(shapeElements(engaged.container).length).toBe(closedShapeCount);
  });

  it('rend chacun des cinq états sans erreur', () => {
    for (const state of PORTRAIT_STATES) {
      const { container, unmount } = render(
        <Portrait seed={29} accentColor="#6D8FA8" name="Karim" state={state} />,
      );
      expect(container.querySelector(`svg[data-portrait-state="${state}"]`)).not.toBeNull();
      unmount();
    }
  });

  it('donne des identifiants uniques aux motifs quand plusieurs portraits cohabitent', () => {
    const { container } = render(
      <>
        <Portrait seed={17} accentColor="#E3A857" name="Nadia" />
        <Portrait seed={17} accentColor="#E3A857" name="Nadia (bis)" />
        <Portrait seed={41} accentColor="#A8C7A0" name="Léa" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });
});
