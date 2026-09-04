import { useId } from 'react';
import type { JSX } from 'react';

import {
  applyPortraitState,
  arcPath,
  buildPortrait,
  polygonPointsAttribute,
} from '@/components/portrait/portraitGeometry';
import type {
  HatchBandShape,
  PortraitShape,
  PortraitState,
} from '@/components/portrait/portraitGeometry';

export interface PortraitProps {
  /** `Character.portraitSeed`. */
  seed: number;
  /** `Character.accentColor`, au format `#RRGGBB`. */
  accentColor: string;
  /** Nom du personnage, utilisé pour le libellé accessible. */
  name: string;
  /** Côté du carré rendu, en pixels CSS. */
  size?: number;
  /** État de confiance : modifie l'ouverture des arcs, l'inclinaison des bandes et la posture. */
  state?: PortraitState;
}

const HATCH_STROKE_WIDTH = 1.4;
const HATCH_ANGLE = 45;

function hatchPatternId(base: string, index: number): string {
  return `${base}-hatch-${index}`;
}

function rotateAround(rotation: number, cx: number, cy: number): string | undefined {
  return rotation === 0 ? undefined : `rotate(${rotation} ${cx} ${cy})`;
}

interface HatchPatternProps {
  id: string;
  band: HatchBandShape;
}

function HatchPattern({ id, band }: HatchPatternProps): JSX.Element {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={band.spacing}
      height={band.spacing}
      patternTransform={`rotate(${HATCH_ANGLE})`}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={band.spacing}
        stroke={band.color}
        strokeWidth={HATCH_STROKE_WIDTH}
      />
    </pattern>
  );
}

interface ShapeProps {
  shape: PortraitShape;
  hatchId: string | undefined;
}

function Shape({ shape, hatchId }: ShapeProps): JSX.Element {
  switch (shape.kind) {
    case 'circle':
      return (
        <circle data-shape="circle" cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} />
      );
    case 'roundedRect':
      return (
        <rect
          data-shape="roundedRect"
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.radius}
          ry={shape.radius}
          fill={shape.fill}
          transform={rotateAround(
            shape.rotation,
            shape.x + shape.width / 2,
            shape.y + shape.height / 2,
          )}
        />
      );
    case 'polygon':
      return (
        <polygon data-shape="polygon" points={polygonPointsAttribute(shape)} fill={shape.fill} />
      );
    case 'arc':
      return (
        <path
          data-shape="arc"
          d={arcPath(shape)}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeLinecap="round"
        />
      );
    case 'hatchBand':
      return (
        <rect
          data-shape="hatchBand"
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={hatchId === undefined ? shape.color : `url(#${hatchId})`}
          stroke={shape.color}
          strokeWidth={0.6}
          transform={rotateAround(
            shape.rotation,
            shape.x + shape.width / 2,
            shape.y + shape.height / 2,
          )}
        />
      );
  }
}

/**
 * Portrait abstrait d'un personnage : collage SVG déterministe à partir de `seed` et `accentColor`.
 * Aucune image externe, aucune animation, aucun style inline hors attributs géométriques SVG.
 */
export function Portrait({
  seed,
  accentColor,
  name,
  size = 48,
  state = 'neutral',
}: PortraitProps): JSX.Element {
  const reactId = useId();
  const idBase = `portrait-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clipId = `${idBase}-clip`;

  const spec = applyPortraitState(buildPortrait(seed, accentColor), state);

  const hatchIds = new Map<PortraitShape, string>();
  spec.shapes.forEach((shape, index) => {
    if (shape.kind === 'hatchBand') {
      hatchIds.set(shape, hatchPatternId(idBase, index));
    }
  });

  return (
    <svg
      role="img"
      aria-label={`Portrait de ${name}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      data-portrait-seed={seed}
      data-portrait-state={state}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={100} height={100} rx={spec.background.cornerRadius} />
        </clipPath>
        {spec.shapes.map((shape) => {
          const hatchId = hatchIds.get(shape);
          if (shape.kind !== 'hatchBand' || hatchId === undefined) {
            return null;
          }
          return <HatchPattern key={hatchId} id={hatchId} band={shape} />;
        })}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          data-portrait-background=""
          x={0}
          y={0}
          width={100}
          height={100}
          fill={spec.background.fill}
        />
        {spec.shapes.map((shape, index) => (
          <Shape key={`${shape.kind}-${index}`} shape={shape} hatchId={hatchIds.get(shape)} />
        ))}
        <line
          data-posture={spec.posture.kind}
          x1={spec.posture.from.x}
          y1={spec.posture.from.y}
          x2={spec.posture.to.x}
          y2={spec.posture.to.y}
          stroke={spec.posture.stroke}
          strokeWidth={spec.posture.strokeWidth}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
