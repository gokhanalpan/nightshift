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
Hold E on things to use them: the stock pile in the back room, an empty shelf slot while carrying a box,
the till when a customer is waiting, a spill, the monitor (1–4 switch feeds, E leaves camera mode),
the front door (lock/unlock), the note by the till. G greets the customer at the till.

Progress is saved in localStorage: a night in progress resumes where you left it, and a finished
night moves you on to the next one. "Start over from night 1" on the title screen clears it.

Test switches on the URL:

- `?night=3` — start on night 3 (bypasses the save, nothing is written)
- `?speed=20` — run the clock 20× (a whole night in 30 s)

## Layout

```
src/config/tuning.ts   every tunable number
src/config/anomalies.ts the launch list: one entry per anomaly (night, time, tell, rule)
src/game/              game state, no Three.js: state.ts (data), chores.ts (the shift loop,
                       regulars, scoring, actions), rules.ts (the note, rule checks),
                       anomalies.ts (performs the tells), layout.ts (shelf slots),
                       rng.ts (seeded random), save.ts (localStorage snapshot + progress)
src/render/            Three.js: store.ts builds the room and the lot, player.ts walks,
                       products/customers/spills.ts mirror the state (customers.ts has the
                       five regulars), figure.ts is the figure, cameras.ts the security rig,
                       audio.ts synthesized sound, interact.ts picks what the player is looking at,
                       wallClock.ts draws the clock, materials.ts has the palette
src/main.ts            wires it up and runs the loop
tests/                 vitest
```

Build order: see the end of DESIGN.md. Steps 1–4 are in, plus save/continue and the three endings from step 5.
