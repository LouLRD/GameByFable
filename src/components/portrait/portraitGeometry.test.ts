import { describe, expect, it } from 'vitest';

import {
  MAX_SHAPES,
  MIN_SHAPES,
  PALETTE,
  PORTRAIT_STATES,
  SHAPE_KINDS,
  applyPortraitState,
  arcEndpoints,
  arcPath,
  buildPortrait,
  mulberry32,
  normalizeAccentColor,
  polygonPoints,
  shadeHex,
} from '@/components/portrait/portraitGeometry';
import type {
  ArcShape,
  HatchBandShape,
  PortraitShape,
  PortraitSpec,
} from '@/components/portrait/portraitGeometry';

/** Les six personnages du scénario « La Veilleuse ». */
const CHARACTERS: readonly { seed: number; accent: string }[] = [
  { seed: 17, accent: '#E3A857' },
  { seed: 29, accent: '#6D8FA8' },
  { seed: 41, accent: '#A8C7A0' },
  { seed: 53, accent: '#B48EAD' },
  { seed: 67, accent: '#D66B5D' },
  { seed: 79, accent: '#8CB6A8' },
];

const HEX_COLOR = /^#[0-9A-F]{6}$/;

/** Toutes les coordonnées géométriques d'une forme, y compris ses extrémités calculées. */
function coordinatesOf(shape: PortraitShape): number[] {
  switch (shape.kind) {
    case 'circle':
      return [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r];
    case 'roundedRect':
    case 'hatchBand':
      return [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height];
    case 'polygon':
      return polygonPoints(shape).flatMap((point) => [point.x, point.y]);
    case 'arc': {
      const { start, end } = arcEndpoints(shape);
      return [start.x, start.y, end.x, end.y, shape.cx - shape.r, shape.cx + shape.r];
    }
  }
}

function coordinatesOfSpec(spec: PortraitSpec): number[] {
  return [
    ...spec.shapes.flatMap(coordinatesOf),
    spec.posture.from.x,
    spec.posture.from.y,
    spec.posture.to.x,
    spec.posture.to.y,
  ];
}

function colorsOf(spec: PortraitSpec): string[] {
  const colors = [spec.background.fill, spec.accentColor, spec.posture.stroke];
  for (const shape of spec.shapes) {
    switch (shape.kind) {
      case 'arc':
        colors.push(shape.stroke);
        break;
      case 'hatchBand':
        colors.push(shape.color);
        break;
      case 'circle':
      case 'roundedRect':
      case 'polygon':
        colors.push(shape.fill);
        break;
    }
  }
  return colors;
}

function arcsOf(spec: PortraitSpec): ArcShape[] {
  return spec.shapes.filter((shape): shape is ArcShape => shape.kind === 'arc');
}

function bandsOf(spec: PortraitSpec): HatchBandShape[] {
  return spec.shapes.filter((shape): shape is HatchBandShape => shape.kind === 'hatchBand');
}

const SAMPLE_SEEDS: readonly number[] = Array.from({ length: 300 }, (_, i) => i + 1);

describe('mulberry32', () => {
  it('produit la même séquence pour la même seed', () => {
    const a = mulberry32(17);
    const b = mulberry32(17);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produit des séquences différentes pour des seeds différentes', () => {
    const a = mulberry32(17);
    const b = mulberry32(29);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('reste dans [0, 1) et ne se fige pas', () => {
    const rng = mulberry32(53);
    const values = Array.from({ length: 1000 }, () => rng());
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(values).size).toBeGreaterThan(990);
  });
});

describe('couleurs', () => {
  it('normalise une couleur d’accent en majuscules', () => {
    expect(normalizeAccentColor('#b48ead')).toBe('#B48EAD');
    expect(normalizeAccentColor('  #6d8fa8 ')).toBe('#6D8FA8');
  });

  it('retombe sur l’ambre ticket pour une couleur illisible', () => {
    expect(normalizeAccentColor('rouge')).toBe(PALETTE.ticketAmber);
    expect(normalizeAccentColor('#FFF')).toBe(PALETTE.ticketAmber);
  });

  it('éclaircit et assombrit sans sortir de #RRGGBB', () => {
    expect(shadeHex('#808080', 1)).toBe('#FFFFFF');
    expect(shadeHex('#808080', -1)).toBe('#000000');
    expect(shadeHex('#808080', 0)).toBe('#808080');
    expect(shadeHex(PALETTE.inkNight, 0.5)).toBe('#888A8E');
    expect(shadeHex('pas-une-couleur', 0.5)).toBe('pas-une-couleur');
  });
});

describe('buildPortrait — déterminisme', () => {
  it('renvoie exactement la même description pour les mêmes entrées', () => {
    for (const { seed, accent } of CHARACTERS) {
      const first = buildPortrait(seed, accent);
      const second = buildPortrait(seed, accent);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it('ne dépend pas de l’ordre des appels', () => {
    const before = buildPortrait(17, '#E3A857');
    buildPortrait(29, '#6D8FA8');
    buildPortrait(79, '#8CB6A8');
    expect(buildPortrait(17, '#E3A857')).toEqual(before);
  });

  it('normalise la couleur d’accent dans la sortie', () => {
    expect(buildPortrait(17, '#e3a857').accentColor).toBe('#E3A857');
    expect(buildPortrait(17, '#e3a857')).toEqual(buildPortrait(17, '#E3A857'));
  });
});

describe('buildPortrait — variabilité', () => {
  it('donne six portraits distincts pour les six personnages', () => {
    const serialized = CHARACTERS.map(({ seed, accent }) =>
      JSON.stringify(buildPortrait(seed, accent)),
    );
    expect(new Set(serialized).size).toBe(CHARACTERS.length);
  });

  it('change la géométrie quand seule la seed change', () => {
    const a = buildPortrait(17, '#E3A857');
    const b = buildPortrait(18, '#E3A857');
    expect(a.shapes).not.toEqual(b.shapes);
  });

  it('change les couleurs quand seule la couleur d’accent change', () => {
    const a = buildPortrait(41, '#A8C7A0');
    const b = buildPortrait(41, '#D66B5D');
    expect(colorsOf(a)).not.toEqual(colorsOf(b));
    expect(a.shapes.map((shape) => shape.kind)).toEqual(b.shapes.map((shape) => shape.kind));
  });

  it('produit des silhouettes variées sur un large échantillon', () => {
    const silhouettes = new Set(
      SAMPLE_SEEDS.map((seed) => JSON.stringify(buildPortrait(seed, '#E3A857').shapes)),
    );
    expect(silhouettes.size).toBe(SAMPLE_SEEDS.length);
  });
});

describe('buildPortrait — contraintes de composition', () => {
  it(`contient entre ${MIN_SHAPES} et ${MAX_SHAPES} formes`, () => {
    for (const seed of SAMPLE_SEEDS) {
      const { shapes } = buildPortrait(seed, '#6D8FA8');
      expect(shapes.length).toBeGreaterThanOrEqual(MIN_SHAPES);
      expect(shapes.length).toBeLessThanOrEqual(MAX_SHAPES);
    }
  });

  it('utilise toute la gamme de nombres de formes sur l’échantillon', () => {
    const counts = new Set(
      SAMPLE_SEEDS.map((seed) => buildPortrait(seed, '#6D8FA8').shapes.length),
    );
    expect(counts).toEqual(new Set([5, 6, 7, 8, 9]));
  });

  it('représente chacune des cinq familles de formes au moins une fois', () => {
    for (const seed of SAMPLE_SEEDS) {
      const kinds = new Set(buildPortrait(seed, '#A8C7A0').shapes.map((shape) => shape.kind));
      for (const kind of SHAPE_KINDS) {
        expect(kinds.has(kind)).toBe(true);
      }
    }
  });

  it('garde toutes les coordonnées dans le viewBox [0, 100]', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const coordinate of coordinatesOfSpec(buildPortrait(seed, '#D66B5D'))) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(100);
      }
    }
  });

  it('respecte les bornes des polygones et des arcs', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const shape of buildPortrait(seed, '#B48EAD').shapes) {
        if (shape.kind === 'polygon') {
          expect(shape.sides).toBeGreaterThanOrEqual(3);
          expect(shape.sides).toBeLessThanOrEqual(6);
          expect(polygonPoints(shape)).toHaveLength(shape.sides);
        }
        if (shape.kind === 'arc') {
          expect(shape.sweep).toBeGreaterThan(0);
          expect(shape.sweep).toBeLessThan(360);
        }
      }
    }
  });

  it('n’emploie que des couleurs #RRGGBB issues de la palette, de l’accent ou de leurs variantes', () => {
    for (const { seed, accent } of CHARACTERS) {
      for (const color of colorsOf(buildPortrait(seed, accent))) {
        expect(color).toMatch(HEX_COLOR);
      }
    }
  });

  it('fournit une ligne de posture non dégénérée (regard ou épaule)', () => {
    for (const seed of SAMPLE_SEEDS) {
      const { posture } = buildPortrait(seed, '#8CB6A8');
      expect(['gaze', 'shoulder']).toContain(posture.kind);
      const length = Math.hypot(posture.to.x - posture.from.x, posture.to.y - posture.from.y);
      expect(length).toBeGreaterThan(1);
    }
  });

  it('propose les deux types de posture sur l’échantillon', () => {
    const kinds = new Set(SAMPLE_SEEDS.map((seed) => buildPortrait(seed, '#8CB6A8').posture.kind));
    expect(kinds).toEqual(new Set(['gaze', 'shoulder']));
  });
});

describe('applyPortraitState', () => {
  const base = buildPortrait(17, '#E3A857');

  it('laisse le portrait inchangé en état neutre', () => {
    expect(applyPortraitState(base, 'neutral')).toEqual(base);
  });

  it('ne mute pas le portrait d’origine', () => {
    const snapshot = JSON.stringify(base);
    applyPortraitState(base, 'engaged');
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('ferme les arcs en état fermé et les ouvre en état engagé', () => {
    const closed = arcsOf(applyPortraitState(base, 'closed'));
    const neutral = arcsOf(base);
    const engaged = arcsOf(applyPortraitState(base, 'engaged'));
    expect(neutral.length).toBeGreaterThan(0);
    neutral.forEach((arc, index) => {
      expect(closed[index]?.sweep).toBeLessThan(arc.sweep);
      expect(engaged[index]?.sweep).toBeGreaterThan(arc.sweep);
    });
  });

  it('incline les bandes hachurées différemment selon l’état', () => {
    const closed = bandsOf(applyPortraitState(base, 'closed'));
    const engaged = bandsOf(applyPortraitState(base, 'engaged'));
    const neutral = bandsOf(base);
    expect(neutral.length).toBeGreaterThan(0);
    neutral.forEach((band, index) => {
      expect(closed[index]?.rotation).toBeGreaterThan(band.rotation);
      expect(engaged[index]?.rotation).toBeLessThan(band.rotation);
    });
  });

  it('rétracte la posture en état fermé et l’allonge en état engagé', () => {
    const length = (spec: PortraitSpec): number =>
      Math.hypot(spec.posture.to.x - spec.posture.from.x, spec.posture.to.y - spec.posture.from.y);
    expect(length(applyPortraitState(base, 'closed'))).toBeLessThan(length(base));
    expect(length(applyPortraitState(base, 'careful'))).toBeLessThan(length(base));
    expect(length(applyPortraitState(base, 'available'))).toBeGreaterThanOrEqual(length(base));
  });

  it('produit cinq états distincts sans toucher aux masses (cercles, rectangles, polygones)', () => {
    const variants = PORTRAIT_STATES.map((state) =>
      JSON.stringify(applyPortraitState(base, state)),
    );
    expect(new Set(variants).size).toBe(PORTRAIT_STATES.length);
    for (const state of PORTRAIT_STATES) {
      const shapes = applyPortraitState(base, state).shapes;
      shapes.forEach((shape, index) => {
        if (shape.kind === 'circle' || shape.kind === 'roundedRect' || shape.kind === 'polygon') {
          expect(shape).toEqual(base.shapes[index]);
        }
      });
    }
  });

  it('préserve les bornes [0, 100] et l’ouverture des arcs dans tous les états', () => {
    for (const seed of SAMPLE_SEEDS) {
      const spec = buildPortrait(seed, '#6D8FA8');
      for (const state of PORTRAIT_STATES) {
        const varied = applyPortraitState(spec, state);
        for (const coordinate of coordinatesOfSpec(varied)) {
          expect(coordinate).toBeGreaterThanOrEqual(0);
          expect(coordinate).toBeLessThanOrEqual(100);
        }
        for (const arc of arcsOf(varied)) {
          expect(arc.sweep).toBeGreaterThan(0);
          expect(arc.sweep).toBeLessThan(360);
        }
      }
    }
  });
});

describe('helpers de rendu', () => {
  it('construit un chemin d’arc SVG valide avec le drapeau grand-arc', () => {
    const small: ArcShape = {
      kind: 'arc',
      cx: 50,
      cy: 50,
      r: 10,
      startAngle: 0,
      sweep: 90,
      stroke: PALETTE.inkNight,
      strokeWidth: 2,
    };
    expect(arcPath(small)).toBe('M 60 50 A 10 10 0 0 1 50 60');
    expect(arcPath({ ...small, sweep: 270 })).toBe('M 60 50 A 10 10 0 1 1 50 40');
  });

  it('place les sommets d’un carré non tourné sur les axes', () => {
    const points = polygonPoints({
      kind: 'polygon',
      cx: 50,
      cy: 50,
      radius: 10,
      sides: 4,
      rotation: 0,
      fill: PALETTE.coldPaper,
    });
    expect(points).toEqual([
      { x: 60, y: 50 },
      { x: 50, y: 60 },
      { x: 40, y: 50 },
      { x: 50, y: 40 },
    ]);
  });
});
