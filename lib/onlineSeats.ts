// Pure viewer-relative seat mapping for the online table. The viewer always
// sits at the bottom (their own hand), so this returns only the OPPONENT seats,
// ordered left-to-right across the top arc, with a `raised` flag for the middle
// seat of a full four-player table (matching the bot table's arc).
//
// node-safe: no imports, no react-native. Unit-tested in lib/onlineSeats.test.ts
// with the same ok() harness the other lib tests use.

export interface OnlineSeatSlot {
  // Absolute seat index in the room (0-based, join order).
  seat: number;
  // Sits higher than its neighbours, arcing the row around the far edge of the
  // table. Only the middle of three opponents is raised; one or two opponents
  // sit level.
  raised: boolean;
}

// Opponent seats for a viewer at `yourSeat` in a room of `seatCount` seats
// (clamped to 2..4), ordered clockwise from the seat to the viewer's left so
// the viewer stays at the bottom:
//   4 players -> 3 opponents: left, middle (raised), right
//   3 players -> 2 opponents: left, right
//   2 players -> 1 opponent:  single seat opposite the viewer
// The result always has seatCount - 1 entries and never includes yourSeat.
export function opponentSeats(yourSeat: number, seatCount: number): OnlineSeatSlot[] {
  const n = Math.max(2, Math.min(4, Math.floor(seatCount)));
  const safeSeat = ((Math.floor(yourSeat) % n) + n) % n;
  const slots: OnlineSeatSlot[] = [];
  for (let offset = 1; offset < n; offset++) {
    slots.push({ seat: (safeSeat + offset) % n, raised: false });
  }
  // Only a full three-opponent row arcs its middle seat up; one or two
  // opponents stay level (a single opponent is centered by the row instead).
  if (slots.length === 3) slots[1].raised = true;
  return slots;
}
