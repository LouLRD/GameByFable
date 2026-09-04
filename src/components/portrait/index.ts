export { Portrait } from '@/components/portrait/Portrait';
export type { PortraitProps } from '@/components/portrait/Portrait';

export {
  PALETTE,
  PORTRAIT_STATES,
  SHAPE_KINDS,
  MIN_SHAPES,
  MAX_SHAPES,
  buildPortrait,
  applyPortraitState,
  normalizeAccentColor,
  shadeHex,
  mulberry32,
  polygonPoints,
  polygonPointsAttribute,
  arcEndpoints,
  arcPath,
} from '@/components/portrait/portraitGeometry';
export type {
  PortraitSpec,
  PortraitState,
  PortraitShape,
  ShapeKind,
  PortraitBackground,
  PostureLine,
  Point,
  CircleShape,
  RoundedRectShape,
  PolygonShape,
  ArcShape,
  HatchBandShape,
} from '@/components/portrait/portraitGeometry';
