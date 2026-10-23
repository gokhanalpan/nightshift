import * as THREE from "three";
import { TUNING, readDebugOptions } from "@/config/tuning";
import { clockMinutes, clockString, createState, isNightOver, startNight, tick } from "@/game/state";
import { PlayerController } from "@/render/player";
import { buildStore } from "@/render/store";
import { WallClock } from "@/render/wallClock";

const debug = readDebugOptions(location.search);
const state = createState(debug.night);

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, TUNING.lot.fogNear, TUNING.lot.fogFar);
scene.add(new THREE.HemisphereLight(0x3a4150, 0x1a1612, TUNING.lighting.hemisphere));

const camera = new THREE.PerspectiveCamera(
  TUNING.render.fov,
  window.innerWidth / window.innerHeight,
  TUNING.render.near,
  TUNING.render.far,
);

// --- World -----------------------------------------------------------------------------------

const store = buildStore();
scene.add(store.group);

const wallClock = new WallClock(0.5);
wallClock.placeAt(store.clockAnchor);
scene.add(wallClock.mesh);

const player = new PlayerController(camera, renderer.domElement, store.colliders);

// --- HUD and overlays ------------------------------------------------------------------------

const hudNight = document.getElementById("hud-night")!;
const hudTime = document.getElementById("hud-time")!;
const fps = document.getElementById("fps")!;
const overlayStart = document.getElementById("overlay-start")!;
const overlayPause = document.getElementById("overlay-pause")!;
const overlayEnd = document.getElementById("overlay-end")!;
const startTitle = document.getElementById("start-title")!;

const nightLabel = state.night > TUNING.night.count ? "Night 6" : `Night ${state.night}`;
hudNight.textContent = nightLabel;
startTitle.textContent = nightLabel;

overlayStart.addEventListener("click", () => player.requestLock());
overlayPause.addEventListener("click", () => player.requestLock());
document.getElementById("btn-next")!.addEventListener("click", () => {
  const next = Math.min(TUNING.night.count + 1, state.night + 1);
  location.search = `?night=${next}${debug.timeScale !== 1 ? `&speed=${debug.timeScale}` : ""}`;
});

player.onLock(() => {
  if (player.locked) {
    overlayStart.hidden = true;
    overlayPause.hidden = true;
    startNight(state);
  } else if (!isNightOver(state)) {
    overlayPause.hidden = false;
  }
});

function showEnd(): void {
  player.canMove = false;
  overlayPause.hidden = true;
  overlayEnd.hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}

// --- Loop ------------------------------------------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let frames = 0;
let fpsTimer = 0;
let ended = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Game state advances only while the player is in the store (pointer locked).
  if (player.locked) tick(state, dt * debug.timeScale);
  player.update(dt);

  const minutes = clockMinutes(state);
  wallClock.update(minutes);
  hudTime.textContent = clockString(state);

  if (!ended && isNightOver(state)) {
    ended = true;
    showEnd();
  }

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fps.textContent = import.meta.env.DEV ? `${frames} fps` : "";
    frames = 0;
    fpsTimer = 0;
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
