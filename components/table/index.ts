// Shared table kit: the designed bot-table UI extracted from
// app/game-local.tsx so the online table (app/room/[code].tsx) renders on the
// exact same surface. Consumers import from here.
export { TablePanel } from './TablePanel';
export { SeatPlate, SeatChip } from './SeatPlate';
export { TopBar } from './TopBar';
export { BannerStrip } from './BannerStrip';
export { PoolRegion } from './PoolRegion';
export { HandRow, HAND_FAN_CONTAINER_HEIGHT, HAND_FAN_CARD_TOP } from './HandRow';
export {
  COMPACT_PANEL_HEIGHT,
  POOL_MIN_HEIGHT,
  CENTER_ACTION_HIT_SLOP,
  HAND_FAN_BOTTOM,
  HAND_FAN_BOTTOM_COMPACT,
  usablePanelHeight,
} from './layout';
