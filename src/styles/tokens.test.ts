/// <reference types="node" />
/*
 * tsconfig.app.json restreint `types` à vite/vitest/jest-dom : la référence
 * ci-dessus rend node:fs / node:path / node:url visibles pour ce test node.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Garde-fous des feuilles de style : présence des jetons et classes clés,
 * absence de ressource distante, et contraste WCAG calculé depuis les valeurs
 * hexadécimales réellement déclarées dans tokens.css.
 */

const stylesDir = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(join(stylesDir, name), 'utf8');

const css = {
  tokens: read('tokens.css'),
  base: read('base.css'),
  degrees: read('degrees.css'),
  motion: read('motion.css'),
  layout: read('layout.css'),
  index: read('index.css'),
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Retourne les classes de `expected` absentes de `source` (sélecteur exact, pas de préfixe). */
const missingClasses = (source: string, expected: readonly string[]): string[] =>
  expected.filter((cls) => !new RegExp(`\\.${escapeRegExp(cls)}(?![\\w-])`).test(source));

// ---------------------------------------------------------------------------
// Contraste WCAG 2.x — luminance relative sRGB
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) {
    throw new Error(`Couleur hexadécimale invalide : ${hex}`);
  }
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linearChannel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Extraction des jetons de :root
// ---------------------------------------------------------------------------

function parseRootTokens(source: string): Map<string, string> {
  const start = source.indexOf(':root');
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  if (start === -1 || open === -1 || close === -1) {
    throw new Error('Bloc :root introuvable dans tokens.css');
  }
  const block = source.slice(open + 1, close);
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }
  return tokens;
}

/** Résout un jeton jusqu'à sa valeur hexadécimale en suivant les `var(--x)`. */
function resolveHex(tokens: Map<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) {
    throw new Error(`Référence circulaire sur --${name}`);
  }
  seen.add(name);
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`Jeton manquant : --${name}`);
  }
  if (HEX_RE.test(value)) {
    return value.toLowerCase();
  }
  const ref = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
  if (ref === undefined) {
    throw new Error(`--${name} n'est pas une couleur hexadécimale résoluble : ${value}`);
  }
  return resolveHex(tokens, ref, seen);
}

const tokens = parseRootTokens(css.tokens);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('styles/index.css', () => {
  it('importe les cinq feuilles dans l’ordre jetons → base → degrés → mouvement → layout', () => {
    const imports = [...css.index.matchAll(/@import\s+['"]\.\/([\w-]+\.css)['"]\s*;/g)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(['tokens.css', 'base.css', 'degrees.css', 'motion.css', 'layout.css']);
  });
});

describe('styles — aucune ressource distante', () => {
  it.each(Object.entries(css))('%s ne charge rien depuis le réseau', (_name, source) => {
    expect(source).not.toMatch(/@import\s+url\(/i);
    expect(source).not.toMatch(/fonts\.googleapis/i);
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/@font-face/i);
  });
});

describe('styles/tokens.css', () => {
  const requiredTokens = [
    'c-ink',
    'c-paper',
    'c-sage',
    'c-amber',
    'c-coral',
    'c-camera',
    'bg',
    'bg-elevated',
    'bg-sunken',
    'fg',
    'fg-muted',
    'fg-subtle',
    'border',
    'border-strong',
    'accent',
    'accent-fg',
    'danger',
    'danger-fg',
    'success',
    'info',
    'warning',
    'focus-ring',
    'selection',
    'font-ui',
    'font-mono',
    'font-hand',
    'space-1',
    'space-2',
    'space-3',
    'space-4',
    'space-5',
    'space-6',
    'space-7',
    'space-8',
    'radius-1',
    'radius-2',
    'radius-3',
    'shadow-1',
    'shadow-2',
    'z-base',
    'z-overlay',
    'z-modal',
    'z-toast',
    'duration-fast',
    'duration-normal',
    'duration-slow',
    'ease',
  ] as const;

  it('déclare tous les jetons clés sur :root', () => {
    const missing = requiredTokens.filter((name) => !tokens.has(name));
    expect(missing).toEqual([]);
  });

  it('reprend exactement la palette du GDD', () => {
    expect(resolveHex(tokens, 'c-ink')).toBe('#11151c');
    expect(resolveHex(tokens, 'c-paper')).toBe('#e8e3d7');
    expect(resolveHex(tokens, 'c-sage')).toBe('#a8c7a0');
    expect(resolveHex(tokens, 'c-amber')).toBe('#e3a857');
    expect(resolveHex(tokens, 'c-coral')).toBe('#d66b5d');
    expect(resolveHex(tokens, 'c-camera')).toBe('#6d8fa8');
  });

  it('utilise un thème sombre : fond nuit encre, texte papier', () => {
    expect(relativeLuminance(hexToRgb(resolveHex(tokens, 'bg')))).toBeLessThan(0.05);
    expect(relativeLuminance(hexToRgb(resolveHex(tokens, 'fg')))).toBeGreaterThan(0.6);
  });

  it('termine chaque pile de polices par une famille générique', () => {
    expect(tokens.get('font-ui')).toMatch(/sans-serif\s*$/);
    expect(tokens.get('font-mono')).toMatch(/monospace\s*$/);
    expect(tokens.get('font-hand')).toMatch(/cursive\s*$/);
  });

  it('respecte une échelle d’espacement à base 4 px', () => {
    expect(tokens.get('space-1')).toBe('0.25rem');
    expect(tokens.get('space-2')).toBe('0.5rem');
    expect(tokens.get('space-4')).toBe('1rem');
  });
});

describe('contraste WCAG', () => {
  it('la formule est étalonnée sur des valeurs de référence', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #777777 sur blanc : 4.48:1, juste sous le seuil AA — valeur de référence courante.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#11151c', '#e8e3d7')).toBe(contrastRatio('#e8e3d7', '#11151c'));
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  const textPairs: readonly (readonly [fg: string, bg: string])[] = [
    ['fg', 'bg'],
    ['fg-muted', 'bg'],
    ['fg-subtle', 'bg'],
    ['fg', 'bg-elevated'],
    ['fg-muted', 'bg-elevated'],
    ['fg-subtle', 'bg-elevated'],
    ['fg', 'bg-sunken'],
    ['accent-fg', 'accent'],
    ['accent-fg', 'accent-hover'],
    ['accent-fg', 'accent-active'],
    ['danger-fg', 'danger'],
    ['danger-fg', 'danger-hover'],
    ['success-fg', 'success'],
    ['info-fg', 'info'],
    ['warning-fg', 'warning'],
    ['success', 'bg'],
    ['info', 'bg'],
    ['warning', 'bg'],
    ['danger', 'bg'],
    ['info', 'bg-elevated'],
    ['danger', 'bg-elevated'],
  ];

  it('toutes les paires texte/fond atteignent au moins 4.5:1', () => {
    const failing = textPairs
      .map(([fg, bg]) => ({
        pair: `--${fg} / --${bg}`,
        ratio: Number(contrastRatio(resolveHex(tokens, fg), resolveHex(tokens, bg)).toFixed(2)),
      }))
      .filter(({ ratio }) => ratio < 4.5);
    expect(failing).toEqual([]);
  });

  it('l’anneau de focus atteint au moins 3:1 sur le fond (indicateur non textuel)', () => {
    expect(
      contrastRatio(resolveHex(tokens, 'focus-ring'), resolveHex(tokens, 'bg')),
    ).toBeGreaterThanOrEqual(3);
  });

  it('les teintes profondes utilisées sur papier (.ticket) atteignent 4.5:1', () => {
    const paper = resolveHex(tokens, 'c-paper');
    const ticketBlock = /\.ticket\s*\{([^}]*)\}/.exec(css.base)?.[1];
    expect(ticketBlock).toBeDefined();
    const overrides = [
      ...(ticketBlock ?? '').matchAll(
        /--(fg-muted|fg-subtle|danger|info|warning|success)\s*:\s*(#[0-9a-f]{6})\s*;/gi,
      ),
    ];
    expect(overrides.map((m) => m[1])).toEqual(
      expect.arrayContaining(['fg-muted', 'fg-subtle', 'danger', 'info', 'warning', 'success']),
    );
    const failing = overrides
      .map((m) => ({ token: m[1], ratio: contrastRatio(m[2] ?? '', paper) }))
      .filter(({ ratio }) => ratio < 4.5);
    expect(failing).toEqual([]);
  });
});

describe('styles/base.css', () => {
  it('gère les trois tailles de texte via html[data-text-size]', () => {
    for (const size of ['s', 'm', 'l']) {
      expect(css.base).toMatch(new RegExp(`html\\[data-text-size=['"]${size}['"]\\]`));
    }
  });

  it('applique un focus visible fort (outline 3px --focus-ring avec décalage)', () => {
    const block = /:focus-visible\s*\{([^}]*)\}/.exec(css.base)?.[1] ?? '';
    expect(block).toMatch(/outline:\s*3px\s+solid\s+var\(--focus-ring\)/);
    expect(block).toMatch(/outline-offset:\s*[1-9]/);
  });

  it('expose les classes d’interface attendues', () => {
    const expected = [
      'visually-hidden',
      'skip-link',
      'btn',
      'btn-primary',
      'btn-ghost',
      'btn-danger',
      'field',
      'input',
      'select',
      'badge',
      'chip',
      'tag',
      'card',
      'panel',
      'panel-header',
      'panel-body',
      'ticket',
      'hand-note',
      'tape',
      'kbd',
    ];
    expect(missingClasses(css.base, expected)).toEqual([]);
  });

  it('donne aux boutons une hauteur tactile d’au moins 40 px et des états complets', () => {
    expect(tokens.get('tap-min')).toBe('40px');
    const btnBlock = /\.btn\s*\{([^}]*)\}/.exec(css.base)?.[1] ?? '';
    expect(btnBlock).toMatch(/min-height:\s*var\(--tap-min\)/);
    expect(css.base).toMatch(/\.btn[^{]*:hover/);
    expect(css.base).toMatch(/\.btn[^{]*:active/);
    expect(css.base).toMatch(/\.btn:disabled/);
  });

  it('dessine le ticket sur papier en monospace avec des bords dentelés', () => {
    const ticketBlock = /\.ticket\s*\{([^}]*)\}/.exec(css.base)?.[1] ?? '';
    expect(ticketBlock).toMatch(/background-color:\s*var\(--c-paper\)/);
    expect(ticketBlock).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(css.base).toMatch(/\.ticket::before[\s\S]*?conic-gradient/);
    expect(css.base).toMatch(/\.ticket::after[\s\S]*?conic-gradient/);
  });

  it('écrit les annotations à la main en ambre avec une légère rotation', () => {
    const block = /\.hand-note\s*\{([^}]*)\}/.exec(css.base)?.[1] ?? '';
    expect(block).toMatch(/font-family:\s*var\(--font-hand\)/);
    expect(block).toMatch(/color:\s*var\(--warning\)/);
    expect(block).toMatch(/transform:\s*rotate\(/);
  });
});

describe('styles/degrees.css', () => {
  it('déclare les cinq degrés, les cinq statuts, les trois sévérités et les libellés', () => {
    const expected = [
      'degree-established',
      'degree-reported',
      'degree-deduced',
      'degree-proposed',
      'degree-unknown',
      'degree-label',
      'status-impossible',
      'status-contradicted',
      'status-unsupported',
      'status-supported',
      'status-unknown',
      'status-label',
      'severity-notice',
      'severity-major',
      'severity-critical',
      'severity-label',
    ];
    expect(missingClasses(css.degrees, expected)).toEqual([]);
  });

  it.each([
    ['degree-established', '■'],
    ['degree-reported', '▤'],
    ['degree-deduced', '◆'],
    ['degree-proposed', '◌'],
    ['degree-unknown', '?'],
    ['status-impossible', '✕'],
    ['status-contradicted', '≠'],
    ['status-unsupported', '○'],
    ['status-supported', '✓'],
    ['status-unknown', '?'],
    ['severity-notice', 'i'],
    ['severity-major', '!'],
    ['severity-critical', '!!'],
  ])('.%s porte le glyphe « %s » dans ::before', (cls, glyph) => {
    const pattern = new RegExp(
      `\\.${escapeRegExp(cls)}::before[^{]*\\{[^}]*content:\\s*'${escapeRegExp(glyph)}'`,
    );
    expect(css.degrees).toMatch(pattern);
  });

  it('associe une texture distincte à chaque degré (plein, hachures, pointillés, trame, damier)', () => {
    // Règle dont le sélecteur est exactement la classe (précédée d'une ligne vide),
    // et non la liste de sélecteurs du bloc commun.
    const blockOf = (cls: string): string =>
      new RegExp(`(?<=\\n\\n)\\.${escapeRegExp(cls)}\\s*\\{([^}]*)\\}`).exec(css.degrees)?.[1] ??
      '';
    expect(blockOf('degree-established')).toMatch(/linear-gradient\(/);
    expect(blockOf('degree-reported')).toMatch(/repeating-linear-gradient\(/);
    expect(blockOf('degree-deduced')).toMatch(/radial-gradient\(/);
    const proposed = blockOf('degree-proposed');
    expect(proposed.match(/(?<!repeating-)linear-gradient\(/g)).toHaveLength(2);
    expect(proposed).toMatch(/linear-gradient\(\s*90deg/);
    expect(blockOf('degree-unknown')).toMatch(/repeating-conic-gradient\(/);
    for (const cls of [
      'degree-established',
      'degree-reported',
      'degree-deduced',
      'degree-proposed',
      'degree-unknown',
    ]) {
      expect(blockOf(cls)).toMatch(/border-left-style:\s*(solid|double|dashed|dotted)/);
    }
  });
});

describe('styles/motion.css', () => {
  it('définit les animations et classes attendues', () => {
    for (const name of ['propagate', 'crack', 'fade-in', 'slide-up']) {
      expect(css.motion).toMatch(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
    }
    expect(missingClasses(css.motion, ['anim-propagate', 'anim-crack', 'anim-fade-in'])).toEqual(
      [],
    );
  });

  it('neutralise tout mouvement sous prefers-reduced-motion ET html[data-reduced-motion]', () => {
    const mediaIndex = css.motion.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    const attrIndex = css.motion.indexOf("html[data-reduced-motion='true']");
    expect(mediaIndex).toBeGreaterThan(-1);
    expect(attrIndex).toBeGreaterThan(-1);

    const mediaSection = css.motion.slice(mediaIndex, attrIndex);
    const attrSection = css.motion.slice(attrIndex);
    for (const section of [mediaSection, attrSection]) {
      expect(section).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
      expect(section).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
      expect(section).toMatch(/transform:\s*none\s*!important/);
    }
  });
});

describe('styles/layout.css', () => {
  it('déclare la grille du bureau, les zones et la barre d’espaces', () => {
    expect(
      missingClasses(css.layout, ['workbench', 'topbar', 'space', 'space-bar', 'space-bar-tab']),
    ).toEqual([]);
    expect(css.layout).toMatch(/--casefile-width/);
    expect(css.layout).toMatch(/--inspector-width/);
    expect(css.layout).toMatch(/grid-template-areas/);
  });

  it('propose un mode focus pour chacun des quatre panneaux', () => {
    for (const target of ['map', 'timeline', 'casefile', 'inspector']) {
      expect(css.layout).toMatch(new RegExp(`\\.workbench\\[data-focus='${target}'\\]`));
    }
  });

  it('bascule en pile à une zone sous 1024 px avec des onglets ≥ 44 px et la safe-area', () => {
    expect(css.layout).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css.layout).toMatch(/@media\s*\(max-width:\s*1023px\)/);
    expect(css.layout).toMatch(/\.space\[data-active='true'\]/);
    expect(css.layout).toMatch(/safe-area-inset-bottom/);
    expect(tokens.get('tap-comfortable')).toBe('44px');
    const tabBlock = /\.space-bar-tab\s*\{([^}]*)\}/.exec(css.layout)?.[1] ?? '';
    expect(tabBlock).toMatch(/min-height:\s*var\(--tap-comfortable\)/);
  });

  it('empêche tout débordement horizontal (racine masquée, enfants min-width: 0)', () => {
    const rootBlock = /\.workbench\s*\{([^}]*)\}/.exec(css.layout)?.[1] ?? '';
    expect(rootBlock).toMatch(/overflow-x:\s*hidden/);
    const childrenBlock = /\.workbench\s*>\s*\*\s*\{([^}]*)\}/.exec(css.layout)?.[1] ?? '';
    expect(childrenBlock).toMatch(/min-width:\s*0/);
  });
});
