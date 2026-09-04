/**
 * Fenêtre de la vue du plan : enveloppe `<StoreMap>` dans une couche transformée
 * (`translate + scale`, 1× à 4×) et pose les contrôles visibles de zoom en superposition.
 * Les gestes (Pointer Events) et le clavier sont gérés par `useMapGestures` ; ici, uniquement le
 * rendu, les libellés et les annonces de palier.
 *
 * `touch-action: none` n'est posé QUE sur `.map-viewport-stage` (voir map.css).
 */
import { useRef, type ReactNode } from 'react';
import { LABELS_VISIBLE_SCALE, isIdentity, transformToCss } from './gestureMath';
import { formatMultiplier } from './mapModel';
import { useMapGestures, zoomAnnouncement } from './useMapGestures';

export interface MapViewportProps {
  /** Mode mobile : le plan occupe toute la largeur (carré borné par la hauteur disponible). */
  compact?: boolean;
  /** Reçoit les annonces de palier (aria-live du store). */
  onAnnounce?: (message: string) => void;
  children: ReactNode;
}

export function MapViewport({
  compact = false,
  onAnnounce,
  children,
}: MapViewportProps): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const { transform, phase, atMin, atMax, zoomIn, zoomOut, reset } = useMapGestures(stageRef, {
    onZoomChange: (scale, cause, changed) => {
      const message = zoomAnnouncement(scale, cause, changed);
      if (message && onAnnounce) onAnnounce(message);
    },
  });
  const level = formatMultiplier(transform.scale);

  return (
    <div
      className="map-viewport"
      data-compact={compact ? 'true' : 'false'}
      data-phase={phase}
      data-scale={transform.scale}
      data-zoomed={transform.scale >= LABELS_VISIBLE_SCALE ? 'true' : 'false'}
      data-transformed={isIdentity(transform) ? 'false' : 'true'}
    >
      <div ref={stageRef} className="map-viewport-stage" data-testid="map-viewport-stage">
        <div
          className="map-viewport-layer"
          data-testid="map-viewport-layer"
          style={{ transform: transformToCss(transform) }}
        >
          {children}
        </div>
      </div>
      <div className="map-zoom" role="group" aria-label="Zoom du plan">
        <button
          type="button"
          className="btn map-zoom-btn"
          aria-label="Zoom avant"
          aria-disabled={atMax ? 'true' : undefined}
          title="Zoom avant (+)"
          onClick={() => zoomIn('button')}
        >
          <span aria-hidden="true">+</span>
        </button>
        <span className="map-zoom-level mono" data-testid="map-zoom-level">
          <span className="visually-hidden">Niveau de zoom </span>
          {level}
        </span>
        <button
          type="button"
          className="btn map-zoom-btn"
          aria-label="Zoom arrière"
          aria-disabled={atMin ? 'true' : undefined}
          title="Zoom arrière (−)"
          onClick={() => zoomOut('button')}
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          className="btn map-zoom-btn map-zoom-reset"
          aria-label="Recadrer"
          title="Recadrer le plan (0)"
          onClick={() => reset()}
        >
          <span aria-hidden="true">1:1</span>
        </button>
      </div>
    </div>
  );
}
