import { TUNING } from "@/config/tuning";

/** One product slot on a shelf face. Position is the slot centre in world space. */
export interface ShelfSlot {
  id: string;
  row: number;
  /** -1 faces -X, +1 faces +X. */
  side: -1 | 1;
  level: number;
  x: number;
  y: number;
  z: number;
  /** Product box size. */
  w: number;
  h: number;
  d: number;
  colorIndex: number;
}

const SLOT_WIDTH = 0.3;
const SLOT_GAP = 0.06;

let cached: ShelfSlot[] | null = null;

/** All slots, in a stable order. Built once. */
export function shelfSlots(): ShelfSlot[] {
  if (cached) return cached;
  const sh = TUNING.store.shelves;
  const slots: ShelfSlot[] = [];
  let i = 0;
  sh.rowX.forEach((x, row) => {
    for (let level = 0; level < sh.levels; level++) {
      const y = 0.4 + level * ((sh.height - 0.5) / (sh.levels - 1));
      for (const side of [-1, 1] as const) {
        const faceX = x + side * (sh.width / 4 + 0.02);
        let z = sh.zStart + 0.12;
        while (z + SLOT_WIDTH <= sh.zEnd - 0.12) {
          const h = 0.16 + ((i * 5) % 4) * 0.05;
          const w = 0.14 + ((i * 7) % 3) * 0.05;
          slots.push({
            id: `s${row}${side === 1 ? "r" : "l"}${level}-${slots.length}`,
            row,
            side,
            level,
            x: faceX,
            y: y + 0.02 + h / 2,
            z: z + SLOT_WIDTH / 2,
            w: sh.width / 2 - 0.12,
            h,
            d: w,
            colorIndex: i,
          });
          z += SLOT_WIDTH + SLOT_GAP;
          i++;
        }
      }
    }
  });
  cached = slots;
  return slots;
}

export function slotById(id: string): ShelfSlot | undefined {
  return shelfSlots().find((s) => s.id === id);
}
