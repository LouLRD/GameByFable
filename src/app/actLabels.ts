import type { PlayerView } from '@/domain/selectors/playerView';

/** Libellés des actes (GDD §11). */
export const ACT_LABELS: Readonly<Record<PlayerView['act'], string>> = {
  I: 'Acte I — Les traces',
  II: 'Acte II — Les versions',
  III: 'Acte III — Les signatures',
  Épilogue: 'Épilogue',
};
