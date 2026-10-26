import * as THREE from "three";
import { TUNING, clockToMinutes, readDebugOptions } from "@/config/tuning";
import { closeCameras, dropBox, greet, holdAction, pendingSummary, seedInitialEmpties, selectFeed, tick } from "@/game/chores";
import { checkBackRoomRule, phoneRinging } from "@/game/anomalies";
import { nextHint } from "@/game/hints";
import { noteLines } from "@/game/rules";
import { clearSave, finishNight, loadSave, snapshotNight, writeSave } from "@/game/save";
import { anomaliesFor, clockMinutes, clockString, createState, isNightOver, startNight, type GameState } from "@/game/state";
import { GameAudio, distanceGain } from "@/render/audio";
import { SecurityCameras } from "@/render/cameras";
import { CartProp } from "@/render/cart";
import { Creature } from "@/render/creature";
import { Customers } from "@/render/customers";
import { Figure } from "@/render/figure";
import { HandBox } from "@/render/handBox";
import { Hanging } from "@/render/hanging";
import { pickInteractable } from "@/render/interact";
import { PlayerController } from "@/render/player";
import { PlayerBody } from "@/render/playerBody";
import { Products } from "@/render/products";
import { Spills } from "@/render/spills";
import { buildStore } from "@/render/store";
import { WallClock } from "@/render/wallClock";

const debug = readDebugOptions(location.search);
const debugNight = new URLSearchParams(location.search).has("night") || debug.test;

// Resume a night in progress, else start the night the save says is next. ?night= bypasses the save.
let save = loadSave();
let resumed = false;
let state: GameState;
if (!debugNight && save.snapshot) {
  state = save.snapshot;
  resumed = true;
} else {
  state = debug.test
    ? createState(TUNING.night.count, 0, true)
    : createState(debugNight ? debug.night : save.progress.night, debugNight ? 0 : save.progress.strikes);
  if (!state.endless) seedInitialEmpties(state);
}
const audio = new GameAudio();

// --- Dev panel (?dev) --------------------------------------------------------------------------
const devLog: string[] = [];
function devNote(text: string): void {
  if (!debug.dev) return;
  devLog.push(`${clockString(state)}  ${text}`);
  if (devLog.length > 10) devLog.shift();
}
if (debug.dev) audio.onPlay = (name) => devNote(`♪ ${name}`);
let firedWas = 0;
let devNoticeWas: string | null = null;
function renderDev(): void {
  if (!debug.dev) return;
  // New anomalies since last frame.
  if (state.anomaliesFired.length > firedWas) {
    for (const id of state.anomaliesFired.slice(firedWas)) {
      const a = anomaliesFor(state).find((x) => x.id === id);
      devNote(`anomaly ${id}${a ? ` (${a.tell.kind}${"stage" in a.tell ? ` ${a.tell.stage}` : ""})` : ""}`);
    }
    firedWas = state.anomaliesFired.length;
  }
  const n = state.notice?.text ?? null;
  if (n && n !== devNoticeWas) devNote(`notice: ${n}`);
  devNoticeWas = n;

  const next = anomaliesFor(state).filter((a) => !state.anomaliesFired.includes(a.id)).sort(
    (a, b) => clockToMinutes(a.at) - clockToMinutes(b.at),
  )[0];
  const active: string[] = [];
  if (state.figure) active.push(`figure ${state.figure.stage}${state.figure.seenOnCam ? " (seen)" : ""}`);
  if (state.peeker) active.push(`peeker ${state.peeker.phase} @(${state.peeker.x},${state.peeker.z}) look ${state.peeker.seenFor.toFixed(1)}s`);
  if (state.lights.out) active.push(`lights OUT, back in ${Math.max(0, state.lights.restoreAt - state.elapsed).toFixed(0)}s`);
  if (state.backRoomFigure !== null) active.push("back-room figure");
  if (state.hanging) active.push(`hanging ${state.hanging.stage} @(${state.hanging.x},${state.hanging.z}) looked ${state.hanging.lookedFor.toFixed(1)}s${state.hanging.lookedAway ? " away" : ""}`);
  if (state.phone) active.push(`phone ${state.phone.answered ? "answered" : "ringing"}`);
  if (state.knocked) active.push("knocked");
  if (state.keyVisible) active.push(state.hasKey ? "has key" : "key visible");
  if (state.ping) active.push(`ping CAM ${state.ping.feed + 1} ${state.ping.age.toFixed(0)}s`);
  if (state.cart) active.push(`cart stage ${state.cart.stage} away ${state.cart.awayFor.toFixed(1)}s`);
  if (state.clockLie) active.push(`clock lie +${state.clockLie.minutes}m`);
  if (state.lightFollow) active.push(`light follow t=${state.lightFollow.t.toFixed(0)}s`);
  for (const c of state.customers) {
    if (c.camOffset) active.push(`${c.regular} off-camera-position`);
    if (c.phase === "lingering") active.push(`${c.regular} lingering step ${c.lingerStep}`);
  }
  const lines = [
    `night ${state.night}  ${clockString(state)}  ${state.elapsed.toFixed(0)}/${state.length}s  x${debug.timeScale}`,
    `score ${state.score.toFixed(1)}  rules ${state.rulesBroken.join(",") || "-"}  strikes ${state.strikes}  door ${state.doorLocked ? "LOCKED" : "open"}`,
    `customers ${state.customers.map((c) => `${c.regular}:${c.phase}${c.repeat ? "*" : ""}`).join(" ") || "-"}`,
    `player (${state.player.x.toFixed(1)}, ${state.player.z.toFixed(1)}) yaw ${state.player.yaw.toFixed(2)}  dread ${dreadLevel().toFixed(2)}`,
    `next: ${next ? `${next.at} ${next.id}` : "-"}`,
    `active: ${active.join(" | ") || "-"}`,
    "",
    ...devLog,
  ];
  devEl.textContent = lines.join("\n");
}

// --- Renderer --------------------------------------------------------------------------------

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const NIGHT_SKY = new THREE.Color(0x05060a);
const DAWN_SKY = new THREE.Color(0x4a3f4e);
const scene = new THREE.Scene();
scene.background = NIGHT_SKY.clone();
scene.fog = new THREE.Fog(NIGHT_SKY.clone(), TUNING.lot.fogNear, TUNING.lot.fogFar);
const hemi = new THREE.HemisphereLight(0x3a4150, 0x1a1612, TUNING.lighting.hemisphere);
scene.add(hemi);

const aspect = () => window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(TUNING.render.fov, aspect(), TUNING.render.near, TUNING.render.far);
camera.layers.enable(1); // wrong customers and camera housings live on layer 1

// --- World -----------------------------------------------------------------------------------

const store = buildStore();
scene.add(store.group);

const wallClock = new WallClock(0.5);
wallClock.placeAt(store.clockAnchor);
scene.add(wallClock.mesh);

const products = new Products();
scene.add(products.group);
const customers = new Customers();
scene.add(customers.group);
const spills = new Spills();
scene.add(spills.group);
const security = new SecurityCameras(aspect());
scene.add(security.group);
const figureOutside = new Figure();
scene.add(figureOutside.group);
const figureInside = new Figure();
scene.add(figureInside.group);
const creature = new Creature();
scene.add(creature.group);
const hanging = new Hanging();
scene.add(hanging.group);
const cartProp = new CartProp();
scene.add(cartProp.group);

const player = new PlayerController(camera, renderer.domElement, store.colliders);

const handBox = new HandBox();
camera.add(handBox.group);
scene.add(camera);
const playerBody = new PlayerBody();
scene.add(playerBody.group);
// The same kind of box, on the floor, when the player sets it down.
const floorBox = new HandBox();
floorBox.group.position.set(0, 0.15, 0);
floorBox.group.rotation.set(0, 0, 0);
scene.add(floorBox.group);

// --- HUD and overlays ------------------------------------------------------------------------

const el = (id: string) => document.getElementById(id)!;
const hud = el("hud");
const hudNight = el("hud-night");
const hudTime = el("hud-time");
const hudScore = el("hud-score");
const hudTasks = el("hud-tasks");
const hudCarry = el("hud-carry");
const hudPing = el("hud-ping");
const prompt = el("prompt");
const promptText = el("prompt-text");
const progressBar = el("progress-bar");
const noticeEl = el("notice");
const hintEl = el("hint");
const fps = el("fps");
const overlayStart = el("overlay-start");
const overlayPause = el("overlay-pause");
const overlayEnd = el("overlay-end");
const overlayNote = el("overlay-note");
const noteLinesEl = el("note-lines");
const camview = el("camview");
const camLabel = el("cam-label");
const camTabs = el("cam-tabs");
const errEl = el("err");
const devEl = el("dev");
const vignette = el("vignette");
const camFlash = el("cam-flash");

const nightLabel = state.testNight ? "Test night" : state.endless ? "Night 6" : `Night ${state.night}`;
hudNight.textContent = nightLabel;
el("start-title").textContent = nightLabel;
if (resumed) el("start-sub").textContent = `Click to carry on from ${clockString(state)}`;
if (state.endless) el("start-sub").textContent = "Click to carry on";
el("start-note").hidden = !(state.night === 1 && !resumed);
const btnNew = el("btn-new");
btnNew.hidden = !(resumed || state.night > 1) || debugNight;
btnNew.addEventListener("click", (e) => {
  e.stopPropagation();
  clearSave();
  restart("");
});

/** Reload with the given query string, without the unload handler re-saving on the way out. */
let leaving = false;
function restart(search: string): void {
  leaving = true;
  const url = location.pathname + search;
  if (location.search === search) location.reload();
  else location.assign(url);
}

overlayStart.addEventListener("click", () => {
  audio.unlock();
  void audio.loadClip("laugh1", `${import.meta.env.BASE_URL}sfx/laugh1.mp3`);
  void audio.loadClip("laugh2", `${import.meta.env.BASE_URL}sfx/laugh2.mp3`);
  player.requestLock();
});
overlayPause.addEventListener("click", () => {
  audio.unlock();
  player.requestLock();
});
const btnNext = el("btn-next");
btnNext.addEventListener("click", () => {
  if (state.ending === "secret" || (state.ending === "good" && state.night >= TUNING.night.count)) clearSave();
  restart(debug.timeScale !== 1 ? `?speed=${debug.timeScale}` : "");
});

function persist(): void {
  if (debugNight || leaving) return;
  save = snapshotNight(save, state);
  writeSave(save);
}
window.addEventListener("beforeunload", persist);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});

player.onLock(() => {
  if (player.locked) {
    overlayStart.hidden = true;
    overlayPause.hidden = true;
    startNight(state);
  } else if (!isNightOver(state)) {
    overlayPause.hidden = false;
    persist();
  }
});

// Keys that are presses, not holds: feeds, leaving camera mode, closing the note, greeting.
document.addEventListener("keydown", (e) => {
  if (e.repeat || !player.locked) return;
  if (state.viewingFeed !== null) {
    if (e.code === "KeyE" || e.code === "KeyQ") {
      closeCameras(state);
      eWasDown = true; // so this same press doesn't reopen them in the frame loop
      e.preventDefault();
    } else if (e.code.startsWith("Digit")) {
      selectFeed(state, Number(e.code.slice(5)) - 1);
    }
    return;
  }
  if (state.reading) {
    if (e.code === "KeyE" || e.code === "KeyQ") {
      state.reading = false;
      eWasDown = true;
    }
    return;
  }
  if (e.code === "KeyG") greet(state);
  if (e.code === "KeyQ") dropBox(state, player.position.x, player.position.z);
});

function renderNote(): void {
  const lines = noteLines(state.night).map((l) => ({ ...l }));
  // While the clock lies, the note says something it didn't.
  if (state.clockLie && lines[TUNING.clockLie.line]) lines[TUNING.clockLie.line]!.text = TUNING.clockLie.text;
  noteLinesEl.replaceChildren(
    ...lines.map((l, i) => {
      const li = document.createElement("li");
      li.textContent = l.text;
      if (l.crossed) li.classList.add("crossed");
      if (i === lines.length - 1 && state.night >= TUNING.night.count) li.classList.add("last");
      return li;
    }),
  );
  if (lines.length === 0) {
    const blank = document.createElement("div");
    blank.className = "blank";
    noteLinesEl.replaceChildren(blank);
  }
}

let finalFrame = false;

function showEnd(): void {
  player.canMove = false;
  closeCameras(state);
  state.reading = false;
  overlayPause.hidden = true;
  overlayEnd.hidden = false;
  overlayEnd.classList.remove("good", "bad", "secret");
  const st = state.stats;
  const score = `Manager score ${Math.round(state.score)} — served ${st.served}, restocked ${st.restocked}, mopped ${st.mopped}, cameras ${st.pingsAnswered}/${st.pingsAnswered + st.pingsMissed}`;
  const total = state.strikes + state.rulesBroken.length;
  const title = el("end-title");
  const line = el("end-line");
  el("end-score").textContent = score;
  // Each broken rule, spelled out, so the player knows what to do differently.
  const rulesEl = el("end-rules");
  const broken = [...state.rulesBroken].sort();
  if (broken.length === 0) {
    rulesEl.textContent = total === 0 ? "No rules broken." : `No rules broken tonight. ${total} this week so far.`;
  } else {
    const head = document.createElement("div");
    head.textContent = `Rules broken tonight (${total} this week):`;
    const list = document.createElement("ul");
    for (const r of broken) {
      const li = document.createElement("li");
      li.textContent = `${r}. ${TUNING.rules.lines[r - 1]}`;
      list.append(li);
    }
    const tail = document.createElement("div");
    tail.textContent = state.night < TUNING.night.count && state.ending !== "bad" ? "It's closer now." : "";
    rulesEl.replaceChildren(head, list, tail);
  }

  if (state.ending === "bad") {
    overlayEnd.classList.add("bad");
    title.textContent = "06:00";
    line.textContent = "The door won't open.";
    btnNext.hidden = true;
    state.lights.out = true;
    window.setTimeout(() => {
      title.textContent = "NIGHT 6";
      line.textContent = "The clock reads 23:00.";
      btnNext.textContent = "Go in";
      btnNext.hidden = false;
    }, 3500);
  } else if (state.ending === "secret") {
    overlayEnd.classList.add("secret");
    title.textContent = "MANAGER";
    line.textContent = "The door opens onto a room exactly like the shop, with a till, and someone sitting at it.";
    el("end-score").textContent = "";
    el("end-rules").textContent = "";
    btnNext.textContent = "Start over";
  } else if (state.night >= TUNING.night.count) {
    // Good ending on the last night: sunrise, and the last camera frame.
    overlayEnd.classList.add("good");
    title.textContent = "06:00";
    line.textContent = "Sunrise. The door unlocks. You worked the week.";
    btnNext.textContent = "Start over";
    finalFrame = true;
    scene.background = DAWN_SKY.clone();
    (scene.fog as THREE.Fog).color = DAWN_SKY.clone();
  } else {
    overlayEnd.classList.add("good");
    title.textContent = "06:00";
    line.textContent = "Shift over. The door unlocks. See you tomorrow.";
    btnNext.textContent = "Next night";
    scene.background = DAWN_SKY.clone();
    (scene.fog as THREE.Fog).color = DAWN_SKY.clone();
  }
  if (document.pointerLockElement) document.exitPointerLock();
  if (!debugNight) {
    if (state.ending === "bad") save = { ...finishNight(save, state), progress: { ...save.progress, night: TUNING.night.count + 1 } };
    else if (state.ending === "good" && state.night < TUNING.night.count) save = finishNight(save, state);
    else save = { ...save, snapshot: null };
    writeSave(save);
  }
}

// --- Lights and props ------------------------------------------------------------------------

let lightsOn = true;
function applyLights(on: boolean): void {
  lightsOn = on;
  store.fridgeLight.intensity = on ? TUNING.lighting.fridgeGlow : 0.3;
  store.backRoomBulb.intensity = on ? TUNING.lighting.backRoomBulb : 0;
  audio.ambience.setHum(on);
}

/** Ceiling brightness this frame: the night's dimming, the late-shift dimming, and any flicker. */
let flickerUntil = 0;
let nextStrayFlicker = 0;
let buzzTimer = 0;
function setCeiling(level: number): void {
  // The mood takes the ceiling almost out and the ambient with it.
  const m = 1 - mood * 0.94;
  for (const l of store.ceilingLights) l.intensity = TUNING.lighting.panelIntensity * level * m;
  for (const p of store.ceilingPanels) (p.material as THREE.MeshLambertMaterial).emissiveIntensity = 1.4 * level * m;
  hemi.intensity = (lightsOn ? TUNING.lighting.hemisphere : 0.06) * (1 - mood * 0.9);
  store.fridgeLight.intensity = (lightsOn ? TUNING.lighting.fridgeGlow : 0.3) * (1 - mood * 0.7);
}
function ceilingLevel(now: number, dt: number): number {
  if (!lightsOn) return 0;
  const L = TUNING.lighting;
  let level = L.nightDim[state.night] ?? 0.6;
  if (clockMinutes(state) >= clockToMinutes(L.lateFrom)) level *= L.lateDim;
  // Three seconds of warning before a blackout.
  const minutesPerSecond = (TUNING.night.clockEnd - TUNING.night.clockStart) / state.length;
  const nowMin = clockMinutes(state);
  const blackoutSoon = anomaliesFor(state).some(
    (a) => a.tell.kind === "lightsOut" && !state.anomaliesFired.includes(a.id) && clockToMinutes(a.at) - nowMin <= L.preBlackoutFlicker * minutesPerSecond,
  );
  // The odd stray flicker, later in the week.
  if (state.night >= L.strayFlickerFromNight && player.locked && !state.endless) {
    if (nextStrayFlicker === 0) nextStrayFlicker = now + (L.strayFlicker[0] + Math.random() * (L.strayFlicker[1] - L.strayFlicker[0])) * 1000;
    if (now >= nextStrayFlicker) {
      flickerUntil = now + 350;
      nextStrayFlicker = now + (L.strayFlicker[0] + Math.random() * (L.strayFlicker[1] - L.strayFlicker[0])) * 1000;
    }
  }
  const flickering = blackoutSoon || now < flickerUntil;
  if (flickering) {
    buzzTimer -= dt;
    if (buzzTimer <= 0) {
      audio.buzz(0.8);
      buzzTimer = 0.25 + Math.random() * 0.2;
    }
    const stutter = Math.random() < 0.35 ? 0.15 : 1 - Math.random() * 0.4;
    return level * stutter;
  }
  return level;
}

/**
 * Mood: 0 is the shop as it is, 1 is the dark. Pulls the hemisphere down, the ceiling almost off,
 * and the fog in close and blue so the far end of the room hazes out. Eased, never snapped.
 */
let mood = 0;
const FOG_NORMAL = { near: TUNING.lot.fogNear, far: TUNING.lot.fogFar };
const DARK_SKY = new THREE.Color(0x070b14);
function moodTarget(): number {
  if (state.hanging) return state.hanging.stage === "still" ? 0.75 : 1;
  if (state.lights.out) return 0.9;
  if (state.endless) return 0.8;
  if (state.peeker) return 0.4;
  if (state.figure?.stage === "window") return 0.35;
  return 0;
}
function applyMood(dt: number): void {
  const target = moodTarget();
  const rate = target > mood ? 2.5 : 0.8; // falls fast, recovers slowly
  mood += (target - mood) * Math.min(1, dt * rate);
  const fog = scene.fog as THREE.Fog;
  fog.near = FOG_NORMAL.near + (3.5 - FOG_NORMAL.near) * mood;
  fog.far = FOG_NORMAL.far + (18 - FOG_NORMAL.far) * mood;
  const sky = ended && state.ending !== "bad" ? DAWN_SKY : NIGHT_SKY;
  fog.color.copy(sky).lerp(DARK_SKY, mood);
  (scene.background as THREE.Color).copy(fog.color);
}

/** How much dread the scene carries right now: the figure, and anyone who shouldn't be here. */
function dreadLevel(): number {
  let d = 0;
  if (state.figure) d = Math.max(d, TUNING.figure.dread[state.figure.stage] ?? 0.3);
  if (state.peeker) d = Math.max(d, TUNING.peeker.dread);
  if (state.hanging) d = Math.max(d, state.hanging.stage === "still" ? 0.5 : TUNING.hanging.dread);
  if (state.backRoomFigure !== null) d = Math.max(d, 0.9);
  if (state.lights.out) d = Math.max(d, 0.45);
  if (state.endless) d = Math.max(d, 0.5);
  return d;
}

// --- Loop ------------------------------------------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
  security.setAspect(aspect());
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let frames = 0;
let fpsTimer = 0;
let ended = false;
let eWasDown = false;
let pingBeepTimer = 0;
let saveTimer = 0;
let hintUntil = 0;
let doorWasOpen = false;
let doorWasLocked = state.doorLocked;
let wasKnocked = state.knocked;
let phoneWasAnswered = false;
let figureWasAtWindow = false;
let backRoomFigureWasThere = false;
let feedWas: number | null = null;
let laughTimer = 999;
let peekerWasHiding = false;
let hangingStageWas: string | null = null;
let noteLieWas = false;
let clockLieWas = false;
let cartStageWas = -1;
let lingerStepsWas = new Map<number, number>();
let ownStepAcc = 0;
let ownLastX = 0;
let ownLastZ = 0;
/** Times (ms) of the player's recent footsteps, for the second phone call. */
const ownSteps: number[] = [];
let secondCallPlayed = false;
let phoneSecondWasOpen = false;
/** Where the player has been, for the light that follows (ms, x, z). */
const trail: Array<{ t: number; x: number; z: number }> = [];
let followLock: { x: number; z: number } | null = null;
const hourChimed = new Set<string>();
const stepAccum = new Map<number, { x: number; z: number; acc: number }>();

function frame(now: number): void {
  requestAnimationFrame(frame);
  try {
    step(now);
  } catch (err) {
    errEl.hidden = false;
    errEl.textContent = `Error in frame: ${err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)}`;
    console.error(err);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function step(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const simDt = dt * debug.timeScale;

  // The sim knows where the player is, so it can put things in the corner of their eye.
  state.player = { x: player.position.x, z: player.position.z, yaw: player.yaw };
  // Game state advances only while the player is in the store (pointer locked).
  if (player.locked && !state.reading) tick(state, simDt);
  if (player.locked) checkBackRoomRule(state, player.position.x);

  const inCameras = state.viewingFeed !== null;
  const frozen = inCameras || state.reading || ended;
  player.canLook = !frozen;
  player.canMove = !frozen;
  player.update(dt);

  // Hold E on whatever is in view. Some actions fire on press, not hold.
  const eDown = player.locked && player.isDown("KeyE");
  const target = player.locked && !frozen ? pickInteractable(state, camera) : null;
  if (target) {
    const isPress = ["cameras", "door", "phone", "takeKey", "managerDoor", "readNote", "putBack", "pickUp"].includes(target.action.kind);
    const holding = isPress ? eDown && !eWasDown : eDown;
    holdAction(state, target.action, holding, simDt);
    prompt.hidden = false;
    promptText.textContent = target.label;
    progressBar.style.width = `${Math.round((state.action?.progress ?? 0) * 100)}%`;
  } else {
    holdAction(state, null, false, 0);
    prompt.hidden = true;
  }
  eWasDown = eDown;

  // Scene follows state.
  products.sync(state, now / 1000);
  customers.sync(state, now / 1000);
  spills.sync(state);
  handBox.sync(state.carrying);
  playerBody.sync(player.position.x, player.position.z, player.yaw, state.carrying > 0, dt);
  if (state.droppedBox) {
    floorBox.group.position.set(state.droppedBox.x, 0.15, state.droppedBox.z);
    floorBox.sync(state.droppedBox.items);
  } else {
    floorBox.sync(0);
  }
  syncDoor();
  syncMonitor(now / 1000);
  syncFigures(now / 1000);
  creature.sync(state, now / 1000);
  hanging.sync(state, now / 1000);
  cartProp.sync(state);
  if (lightsOn === state.lights.out) {
    if (state.lights.out) {
      audio.thunk();
      // Somewhere in the dark, a child laughing. Once now, once more a few seconds in.
      window.setTimeout(() => audio.playClip(["laugh1", "laugh2"], 0.6), 1800);
      laughTimer = 6 + Math.random() * 10;
    }
    applyLights(!state.lights.out);
  }
  if (state.lights.out && player.locked && !state.endless) {
    laughTimer -= dt;
    if (laughTimer <= 0) {
      audio.playClip(["laugh1", "laugh2"], 0.35);
      laughTimer = 999; // just the once more per blackout
    }
  }
  applyMood(dt);
  setCeiling(ceilingLevel(now, dt));
  syncLightFollow(now);
  const dread = dreadLevel();
  audio.ambience.setDread(player.locked ? dread : 0);
  vignette.style.opacity = String(dread * 0.85);
  store.managerDoorGlow.visible = state.night >= TUNING.rules.crossedOutFrom.night && !state.endless;
  store.managerKey.visible = state.keyVisible && !state.hasKey;
  store.night6Sign.visible = state.endless;
  store.phoneHandset.position.y = 1.09 + (phoneRinging(state) ? Math.abs(Math.sin(now / 40)) * 0.012 : 0);

  // Sounds driven by state edges.
  syncSounds(dt);

  // Autosave the running night every couple of seconds.
  if (player.locked && state.status === "running") {
    saveTimer += dt;
    if (saveTimer >= 2) {
      saveTimer = 0;
      persist();
    }
  }

  // HUD.
  wallClock.update(clockMinutes(state) + (state.clockLie ? state.clockLie.minutes : 0));
  hudTime.textContent = clockString(state);
  hudScore.textContent = state.endless ? "" : `Manager ${Math.round(state.score)}`;
  hudTasks.textContent = state.endless ? "" : pendingSummary(state).join(" · ");
  hudCarry.textContent = state.carrying > 0 ? `Box: ${state.carrying} left` : state.hasKey ? "Key: MANAGER" : "";
  if (state.ping) {
    hudPing.textContent = `CHECK CAM ${state.ping.feed + 1}`;
    hudPing.classList.toggle("urgent", state.ping.age > TUNING.chores.ping.expires * 0.6);
  } else {
    hudPing.textContent = "";
  }
  const n = state.notice;
  noticeEl.textContent = n ? n.text : "";
  noticeEl.classList.toggle("show", !!n && state.elapsed - n.at < 2.5);
  if (player.locked && now > hintUntil && !frozen) {
    const hint = nextHint(state);
    if (hint) {
      hintEl.textContent = hint;
      hintUntil = now + 7000;
    }
  }
  hintEl.classList.toggle("show", now < hintUntil && !frozen);

  // The note. Re-rendered when opened, and when the lie starts or stops while it's open.
  const lying = state.clockLie !== null;
  if (state.reading && (overlayNote.hidden || lying !== noteLieWas)) renderNote();
  noteLieWas = lying;
  overlayNote.hidden = !state.reading;

  if (!ended && isNightOver(state)) {
    ended = true;
    showEnd();
  }
  devEl.hidden = !debug.dev;
  renderDev();

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fps.textContent = import.meta.env.DEV ? `${frames} fps` : "";
    frames = 0;
    fpsTimer = 0;
  }

  // Camera mode renders through the chosen feed; the final frame uses CAM 4.
  if (inCameras || finalFrame) {
    const feed = finalFrame ? 3 : state.viewingFeed!;
    camview.hidden = false;
    camLabel.textContent = TUNING.cameras.feeds[feed]!.label;
    camTabs.replaceChildren(
      ...TUNING.cameras.feeds.map((_, i) => {
        const s = document.createElement("span");
        s.textContent = String(i + 1);
        if (i === feed) s.classList.add("on");
        if (state.ping && state.ping.feed === i) s.classList.add("ping");
        return s;
      }),
    );
    prompt.hidden = true;
    hud.hidden = true;
    camview.classList.toggle("bad", state.customers.some((c) => c.wrong && c.phase !== "gone"));
    renderer.render(scene, security.cameras[feed]!);
  } else {
    camview.hidden = true;
    hud.hidden = false;
    renderer.render(scene, camera);
  }
}

/**
 * The light that follows. All panels off but one: above the player, then above where they were
 * a moment ago, then well behind them, then stopped where they stood at the minute mark while
 * the back-room doorway is the only other light in the shop.
 */
function syncLightFollow(now: number): void {
  const lf = state.lightFollow;
  trail.push({ t: now, x: player.position.x, z: player.position.z });
  while (trail.length > 0 && now - trail[0]!.t > 8000) trail.shift();
  if (!lf) {
    followLock = null;
    store.backRoomBulb.intensity = lightsOn ? TUNING.lighting.backRoomBulb : 0;
    return;
  }
  const L = TUNING.lightFollow;
  const posAgo = (sec: number) => {
    const target = now - sec * 1000;
    let best = trail[0]!;
    for (const p of trail) if (Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
    return best;
  };
  let at: { x: number; z: number } | null;
  if (lf.t < L.lagAt) at = { x: player.position.x, z: player.position.z };
  else if (lf.t < L.behindAt) at = posAgo(L.lagSeconds);
  else if (lf.t < L.stopAt) at = posAgo(L.behindSeconds);
  else if (lf.t < L.offAt) {
    if (!followLock) followLock = { x: player.position.x, z: player.position.z };
    at = followLock;
  } else at = null;

  // Nearest panel to that point gets the light; everything else goes dark.
  let nearest = -1;
  let nearestD = Infinity;
  store.ceilingLights.forEach((l, i) => {
    if (!at) return;
    const d = Math.hypot(l.position.x - at.x, l.position.z - at.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = i;
    }
  });
  store.ceilingLights.forEach((l, i) => {
    const on = i === nearest;
    l.intensity = on ? TUNING.lighting.panelIntensity * 1.3 : 0;
    (store.ceilingPanels[i]!.material as THREE.MeshLambertMaterial).emissiveIntensity = on ? 1.8 : 0;
  });
  hemi.intensity = 0.02;
  store.fridgeLight.intensity = 0.2;
  // The last phase: the back-room doorway is lit, and if the week has gone badly, someone is in it.
  const last = lf.t >= L.stopAt;
  store.backRoomBulb.intensity = last ? TUNING.lighting.backRoomBulb * 2.5 : TUNING.lighting.backRoomBulb;
  if (last && state.strikes >= 2) figureInside.show(TUNING.store.width / 2 + 0.5, TUNING.store.backRoom.z, -Math.PI / 2);
}

/** Swing the front door open while a customer is within reach of it. */
function syncDoor(): void {
  const doorZ = -TUNING.store.depth / 2;
  let open = false;
  let silent = true;
  for (const cu of state.customers) {
    if (cu.silent) continue;
    if (Math.abs(cu.x) < 1.2 && Math.abs(cu.z - doorZ) < 1.0) {
      open = true;
      silent = false;
    }
  }
  if (open && !doorWasOpen && !silent) audio.chime(distanceGain(player.position.distanceTo(new THREE.Vector3(0, 1, doorZ))));
  doorWasOpen = open;
  // Swings outward so customers don't walk through the leaf on their way to the queue.
  const targetAngle = open ? Math.PI / 2.2 : 0;
  store.frontDoor.rotation.y += (targetAngle - store.frontDoor.rotation.y) * 0.18;
}

/** The pinged quadrant on the counter monitor pulses until it is checked. */
function syncMonitor(time: number): void {
  const snowy = state.customers.some((c) => !c.onCamera && c.phase !== "gone");
  store.monitorFeeds.forEach((mesh, i) => {
    const m = mesh.material as THREE.MeshLambertMaterial;
    const pinged = state.ping?.feed === i;
    if (snowy) {
      // Static: the quadrants flash grey at random, the picture isn't holding.
      const n = Math.random();
      m.emissiveIntensity = n < 0.3 ? 6 + Math.random() * 6 : 0.6;
      m.emissive.setScalar(n < 0.3 ? 0.6 : 0.15);
      mesh.position.x += (Math.random() - 0.5) * 0.004;
    } else {
      m.emissive.set(FEED_COLORS[i]!);
      m.emissiveIntensity = pinged ? 3 + Math.sin(time * 8) * 2.5 : 2.2;
      mesh.position.x = FEED_X[i]!;
    }
  });
}
const FEED_COLORS = [0x1e3a2a, 0x1e2f3a, 0x2a2a1e, 0x2a1e2a];
const FEED_X = store.monitorFeeds.map((m) => m.position.x);

function syncFigures(time: number): void {
  const F = TUNING.figure;
  if (state.figure) {
    const st = F.stages[state.figure.stage];
    figureOutside.show(st.x, st.z, st.yaw);
  } else {
    figureOutside.hide();
  }
  if (finalFrame) {
    figureInside.show(F.till.x, F.till.z, F.till.yaw);
  } else if (state.backRoomFigure !== null) {
    // Stands for a moment, then walks out through the back-room door and is gone.
    const left = state.backRoomFigure - state.elapsed;
    const t = Math.max(0, 1.6 - left) / 1.6;
    const x = F.backRoom.x + (TUNING.store.width / 2 + 0.6 - F.backRoom.x) * Math.min(1, t);
    figureInside.show(x, F.backRoom.z, F.backRoom.yaw);
    figureInside.group.position.y = Math.abs(Math.sin(time * 6)) * 0.02 * (t > 0 ? 1 : 0);
  } else {
    figureInside.hide();
  }
}

function syncSounds(dt: number): void {
  // Monitor ping: beeps until checked.
  if (state.ping && state.viewingFeed === null && player.locked) {
    pingBeepTimer -= dt;
    if (pingBeepTimer <= 0) {
      audio.ping(distanceGain(player.position.distanceTo(new THREE.Vector3(TUNING.interact.points.monitor.x, 1.2, TUNING.interact.points.monitor.z))));
      pingBeepTimer = TUNING.chores.ping.beepEvery;
    }
  } else {
    pingBeepTimer = 0;
  }

  // Footsteps for walking customers who make any.
  const seen = new Set<number>();
  for (const cu of state.customers) {
    seen.add(cu.id);
    let acc = stepAccum.get(cu.id);
    if (!acc) {
      acc = { x: cu.x, z: cu.z, acc: 0 };
      stepAccum.set(cu.id, acc);
    }
    const moved = Math.hypot(cu.x - acc.x, cu.z - acc.z);
    acc.x = cu.x;
    acc.z = cu.z;
    if (cu.silent) continue;
    acc.acc += moved;
    if (acc.acc >= 0.55) {
      acc.acc = 0;
      audio.step(distanceGain(player.position.distanceTo(new THREE.Vector3(cu.x, 1, cu.z))) * (cu.regular === "kid" ? 0.6 : 1));
    }
  }
  for (const id of stepAccum.keys()) if (!seen.has(id)) stepAccum.delete(id);

  // Door lock.
  if (state.doorLocked !== doorWasLocked) {
    audio.click(distanceGain(player.position.distanceTo(new THREE.Vector3(0, 1, -4))));
    doorWasLocked = state.doorLocked;
  }

  // Phone.
  if (phoneRinging(state) && player.locked) audio.startRing(distanceGain(player.position.distanceTo(new THREE.Vector3(TUNING.props.phone.x, 1.1, TUNING.props.phone.z))));
  else audio.stopRing();
  const answered = (state.phone?.answered ?? false) && !state.phone?.second;
  if (answered && !phoneWasAnswered) audio.startBreathing();
  phoneWasAnswered = answered;

  // The knock.
  if (state.knocked && !wasKnocked) audio.knock(distanceGain(player.position.distanceTo(new THREE.Vector3(6.5, 1, 3))));
  wasKnocked = state.knocked;

  // The wall clock marks the hours the note cares about.
  if (player.locked && !state.endless) {
    const nowMin = clockMinutes(state);
    for (const hhmm of [TUNING.rules.lockAt, TUNING.rules.unlockAt]) {
      const key = `${state.night}-${hhmm}`;
      if (nowMin >= clockToMinutes(hhmm) && nowMin < clockToMinutes(hhmm) + 1 && !hourChimed.has(key)) {
        hourChimed.add(key);
        audio.chime(0.5);
        state.notice = { text: hhmm, at: state.elapsed };
      }
    }
  }

  // Stingers: the figure reaching the window, something in the back room, someone suddenly at the till.
  const atWindow = state.figure?.stage === "window";
  if (atWindow && !figureWasAtWindow) audio.stinger(1);
  figureWasAtWindow = atWindow;
  const backRoom = state.backRoomFigure !== null;
  if (backRoom && !backRoomFigureWasThere) audio.stinger(0.9);
  backRoomFigureWasThere = backRoom;
  const hiding = state.peeker?.phase === "hiding";
  if (hiding && !peekerWasHiding) audio.stinger(0.8);
  peekerWasHiding = hiding;

  // The clock that lies: the 02:00 chime, twice.
  if (!!state.clockLie !== clockLieWas) {
    if (state.clockLie) {
      audio.chime(0.5);
      window.setTimeout(() => audio.chime(0.5), 1300);
    }
    clockLieWas = !!state.clockLie;
  }

  // The cart squeaks when it moves (while you're not looking at it).
  const cartStage = state.cart ? state.cart.stage : -1;
  if (state.cart && cartStage !== cartStageWas && cartStage > 0) {
    audio.squeak(distanceGain(player.position.distanceTo(new THREE.Vector3(state.cart.x, 0.5, state.cart.z))) * 0.9);
    if (state.cart.besideAt !== null) window.setTimeout(() => audio.stinger(0.6), 150);
  }
  cartStageWas = cartStage;

  // The lingerer: a faint drag of fabric each time they move.
  const steps = new Map<number, number>();
  for (const cu of state.customers) {
    if (cu.phase !== "lingering") continue;
    steps.set(cu.id, cu.lingerStep);
    const was = lingerStepsWas.get(cu.id);
    if (was !== undefined && cu.lingerStep > was) audio.static(0.25, 0.3);
  }
  lingerStepsWas = steps;

  // The player's own footsteps, quiet, and a record of when they fell.
  if (player.locked && player.canMove) {
    const moved = Math.hypot(player.position.x - ownLastX, player.position.z - ownLastZ);
    ownStepAcc += moved;
    if (ownStepAcc >= 0.65) {
      ownStepAcc = 0;
      audio.step(0.35);
      ownSteps.push(performance.now());
      while (ownSteps.length > 0 && performance.now() - ownSteps[0]! > 20000) ownSteps.shift();
    }
  }
  ownLastX = player.position.x;
  ownLastZ = player.position.z;

  // The second call: five seconds of nothing, your own footsteps from a moment ago, three knocks on
  // the line; and when the line closes, one real knock from the back room.
  const secondOpen = !!state.phone?.second && !!state.phone?.answered;
  if (secondOpen && !secondCallPlayed) {
    secondCallPlayed = true;
    const base = ownSteps.length > 0 ? ownSteps[0]! : performance.now();
    const pattern = ownSteps.length > 0 ? ownSteps.map((t) => t - base) : [0, 600, 1200, 1800, 2600];
    for (const dtms of pattern) window.setTimeout(() => audio.step(0.5), 5000 + dtms);
    const end = 5000 + (pattern[pattern.length - 1] ?? 0) + 900;
    window.setTimeout(() => audio.knock(0.35), end);
  }
  if (!secondOpen && phoneSecondWasOpen) audio.knock(1.0, false, 1);
  phoneSecondWasOpen = secondOpen;

  // The hanging man: nothing on discovery; the rope creaks as the head tilts; the tube buzzes out;
  // only the rush gets the heavy knocks and a stinger. Disappearing is silent.
  const stage = state.hanging?.stage ?? null;
  if (stage !== hangingStageWas) {
    if (stage === "tilt") audio.creak(0.8);
    if (stage === "out") audio.buzz(1);
    if (stage === "rush") {
      audio.knock(1.2, true);
      window.setTimeout(() => audio.stinger(1.2), 350);
    }
    hangingStageWas = stage;
  }

  // Feed switches: static and a flash.
  if (state.viewingFeed !== feedWas) {
    if (state.viewingFeed !== null) {
      audio.static(1);
      camFlash.classList.remove("on");
      void camFlash.offsetWidth; // restart the animation
      camFlash.classList.add("on");
    }
    feedWas = state.viewingFeed;
  }
}

applyLights(!state.lights.out);
requestAnimationFrame(frame);
