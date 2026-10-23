# Night Shift at the Mini Market

Single-player first-person horror short for the browser. TypeScript + Vite + Three.js.
Design: [DESIGN.md](DESIGN.md).

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # dist/ — zip it and upload to itch.io
```

Click to start the shift; the pointer locks to the canvas. WASD walks, the mouse looks, Esc pauses.

Test switches on the URL:

- `?night=3` — start on night 3
- `?speed=20` — run the clock 20× (a whole night in 30 s)

## Layout

```
src/config/tuning.ts   every tunable number
src/game/              game state, no Three.js (state.ts: night + wall clock)
src/render/            Three.js: store.ts builds the room and the lot, player.ts walks,
                       wallClock.ts draws the clock, materials.ts has the palette
src/main.ts            wires it up and runs the loop
tests/                 vitest
```

Build order and what is done so far: see the end of DESIGN.md. This is step 1.
