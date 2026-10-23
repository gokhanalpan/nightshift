# Night Shift at the Mini Market — Design

Single-player first-person horror short for the browser. TypeScript + Vite + Three.js.
Target: itch.io, 30–45 minutes of play, five nights. Roblox co-op version only if this one lands.

## Pillars

- One small map, seen mostly from the till. Dread comes from the window, the cameras and the far end of the middle aisle.
- No gore, no chases. Scares are: things moving between camera checks, sound from a direction with nothing there, a regular behaving wrong, lights going out, and a figure outside getting closer over five nights.
- Rules on a note by the till. Follow them and you leave at 06:00. Break them and night 6 never ends.
- Every anomaly is a small object with a trigger and a tell, so adding more is cheap.

## Tech rules (same as Block City)

- Game state is separate from rendering.
- Every tunable number lives in one config file.
- Save in localStorage: which night you are on, manager score, rules unlocked. Export/import later if needed.
- Blocky low-poly art, baked-feel lighting, few textures. The lighting carries the mood, not the models.

## The store

Roughly 12 × 8 m, one room.

- Till counter facing the front door. Camera monitor on the counter with four feeds: shop floor, back room, front lot, the aisle behind the player.
- Front wall: glass door and two large windows onto the lot. The lot has one streetlight, a dumpster and a bus shelter across the road. The player never goes outside.
- Three aisles of shelves running away from the till. The far end of the middle aisle is out of sight from the counter.
- Fridge wall along the back, constant hum.
- Back room door (stock boxes), a staff toilet, and a locked door marked MANAGER (night 5 only).
- Fuse box in the back room.

## The shift loop

One night = 10 real minutes. Wall clock runs 23:00 → 06:00.

Four chores, each a short interaction with a progress bar:

1. Restock — carry boxes from the back room to empty shelf slots.
2. Serve — customers walk to the till; scan items, hand change.
3. Mop — a spill appears somewhere on the floor; clean it.
4. Cameras — the monitor pings; look at the feed it points to.

Manager score goes up when chores are done on time and down when customers wait, spills sit, or rules are broken. The score picks the ending.

## Customers

Five or six blocky regulars with distinct silhouettes:
hoodie guy, old woman with a cart, a kid, a suited man, a nurse coming off shift.
Regulars matter because the anomalies are "the regular, but wrong".

## The rules note

Taped by the till. Three mundane lines on night 1. One line added each morning. By night 5 it is a wall of rules and some contradict the early ones.

1. Lock the door at 02:00, unlock at 05:00.
2. Don't serve customers who don't appear on camera.
3. If the lights go out, wait at the till. Do not go to the fuse box.
4. If the same customer comes in twice, do not greet them the second time.
5. If the phone rings after 03:00, don't pick up.
6. If someone knocks on the back room door from the inside, it's time to leave.

## Five nights

Night 1 — Normal. One tell: around 03:00 a figure stands at the bus shelter and is gone on the next camera check. Most players won't notice.

Night 2 — Hoodie guy buys and leaves; the camera shows the aisle empty at that moment. The figure is now across the road, closer. A spill appears in the far aisle with nobody near it.

Night 3 — Lights cut around 02:30. Go to the fuse box: something is standing in the back room when the lights return, then it walks out. Wait at the till: lights return by themselves and the old woman is already standing there, silent. First "same customer twice".

Night 4 — The phone rings. Picking up plays breathing and the player's own footsteps a second behind. The figure is at the window. Some rule lines are crossed out. Light under the manager door.

Night 5 — Everything, faster. The last rule reads "There is no night 6." Around 05:00, a knock from inside the back room. A key for the manager door appears in the back room.

## Endings

- Good — rules followed, score high: door unlocks at 06:00, sunrise, credits. Last camera frame shows someone sitting at the till.
- Bad — rules broken: the door won't unlock, lights go out, the clock resets to 23:00 and the wall shows NIGHT 6. The rules note is blank. No death screen, no retry; the player can quit from here.
- Secret — manager door opened on night 5: short, ambiguous. Decide later.

## Anomaly system

Each anomaly is a data entry:

- `night` — which night(s) it can fire
- `trigger` — time window, chore completed, player position, camera feed opened
- `tell` — what the player can notice (model swap, sound, camera frame, light)
- `ruleBroken` — which rule it tests, if any
- `scoreDelta` — effect on manager score

The five nights above are the launch list. More anomalies after launch should be new entries, not new code.

## Build order

1. Store interior, lot, first-person controller, wall clock, 10-minute night.
2. The four chores working as a loop with the manager score. Playable, no scares.
3. Customers and regulars.
4. Rules note and the anomaly system; implement nights 1–5.
5. Endings, save, title screen, night select for testing.
6. Sound pass, lighting pass, trailer.
