const Player = document.getElementById("playerCube");
const bg = document.querySelector("#background");

if (!Player) console.error("Element with id 'playerCube' not found.");
if (!bg) console.error("Element with id 'background' not found.");

// On-screen key indicators
const keyAEl = document.getElementById('keyA');
const keySEl = document.getElementById('keyS');
const keyDEl = document.getElementById('keyD');

// menus
const pauseMenu = document.getElementById('pauseMenu');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const gameOverMenu = document.getElementById('gameOverMenu');
const restartBtn = document.getElementById('restartBtn');

let paused = false;
let isGameOver = false;

function showPauseMenu() {
  setPaused(true);
}

function hidePauseMenu() {
  setPaused(false);
}

// central pause/resume function to keep state consistent
function setPaused(state) {
  if (state) {
    paused = true;
    if (rafHandle) cancelAnimationFrame(rafHandle);
    spawning = false;
    pauseMenu.classList.remove('hidden');
    lastAnim = null;
  } else {
    paused = false;
    pauseMenu.classList.add('hidden');
    lastAnim = null; // reset timing so dt isn't huge
    if (!isGameOver) {
      spawning = true;
      spawnLoop();
      rafHandle = requestAnimationFrame(mainLoop);
    }
  }
}

function showGameOverMenu() {
  paused = true;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  isGameOver = true;
  gameOverMenu.classList.remove('hidden');
}

function hideGameOverMenu() {
  gameOverMenu.classList.add('hidden');
}

resumeBtn?.addEventListener('click', () => { hidePauseMenu(); });
quitBtn?.addEventListener('click', () => { /* implement later if needed */ location.reload(); });
restartBtn?.addEventListener('click', () => { restartGame(); });

// toggle pause with Shift key — use capturing listener and check both key/code
function pauseKeyHandler(e) {
  const isShift = e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';
  if (isShift && !e.repeat) {
    if (isGameOver) return; // don't allow pausing when game is over
    setPaused(!paused);
  }
}

let pauseHandlerAttached = false;
function attachPauseHandler() {
  if (pauseHandlerAttached) return;
  window.addEventListener('keydown', pauseKeyHandler, true);
  pauseHandlerAttached = true;
}
function detachPauseHandler() {
  if (!pauseHandlerAttached) return;
  window.removeEventListener('keydown', pauseKeyHandler, true);
  pauseHandlerAttached = false;
}

// attach initially
attachPauseHandler();

function highlightKey(letter) {
  const el = ({'a': keyAEl, 's': keySEl, 'd': keyDEl})[letter];
  if (!el) return;
  el.classList.add('active');
}

function unhighlightKey(letter) {
  const el = ({'a': keyAEl, 's': keySEl, 'd': keyDEl})[letter];
  if (!el) return;
  el.classList.remove('active');
}

// keyboard handlers: glow on keydown, remove on keyup
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 's' || k === 'd') highlightKey(k);
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 's' || k === 'd') unhighlightKey(k);
});

// clicking on-screen keys should move the player and flash the key
function moveToLane(letter) {
  if (!Player) return;
  if (isGameOver || paused) return;
  if (letter === 'a') Player.style.left = '38%';
  else if (letter === 'd') Player.style.left = '62%';
  else if (letter === 's') Player.style.left = '50%';
}

[keyAEl, keySEl, keyDEl].forEach(el => {
  if (!el) return;
  el.addEventListener('click', () => {
    const letter = el.id.slice(-1).toLowerCase();
    highlightKey(letter);
    moveToLane(letter);
    setTimeout(() => unhighlightKey(letter), 180);
  });
});

document.addEventListener("keydown", (e) => {
  if (!Player) return;
  if (isGameOver || paused) return;
  const key = e.key.toLowerCase();
  if (key === "a") Player.style.left = "38%";
  else if (key === "d") Player.style.left = "62%";
  else if (key === "s") Player.style.left = "50%";
});

let y = 0;
// speed is in px/second, accel is px/second^2
const INITIAL_SPEED = 100; // initial speed (px/s)
const INITIAL_ACCEL = 30; // acceleration (px/s^2)
let speed = INITIAL_SPEED;
let accel = INITIAL_ACCEL; // increases speed over time
const SPIKE_SCALE = 1.0; // 1.0 = same size as player, <1 smaller, >1 bigger
const MAX_CONCURRENT = 3; // maximum simultaneous triangles
const ROW_THRESHOLD = 20; // px: consider obstacles in same spawn row if startY within this
let lastAnim = null;

// main animation loop will update background and obstacles (single RAF)

/* ---------------- Obstacle system ---------------- */
const lanes = ['38%', '50%', '62%']; // must match player possible positions
const minReaction = 0.8; // seconds warning before obstacle drops
const spawnIntervalRange = [900, 1700]; // ms between spawns

function randomBetween(min, max) { return Math.random() * (max - min) + min; }

// shrink a DOMRect by a fraction on each side (0.15 => 15% smaller width/height centered)
function shrinkRect(rect, frac) {
  const w = rect.width * (1 - frac);
  const h = rect.height * (1 - frac);
  const left = rect.left + (rect.width - w) / 2;
  const top = rect.top + (rect.height - h) / 2;
  return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}

function spawnTriangle(lane) {
  const o = document.createElement('div');
  o.className = 'obstacle triangle';
  // append to the background container so obstacles "stick" to it
  const container = bg || document.body;
  // lane may be a percent string like '38%'
  let laneFrac = 0.5;
  if (typeof lane === 'string' && lane.includes('%')) laneFrac = parseFloat(lane) / 100;
  // compute the lane's viewport x (player uses viewport %), then convert to container-local px
  const viewportLaneX = window.innerWidth * laneFrac; // px from left of viewport
  const crect = container.getBoundingClientRect();
  const localLeft = viewportLaneX - crect.left; // px inside container
  o.style.left = `${localLeft}px`;
  // dataset.y stores pixel y relative to the container top (0 at container top)
  const ch = container.clientHeight || window.innerHeight;
  const startY = ch + ch * 0.12; // px below container
  o.dataset.startY = startY; // start Y relative to container
  o.dataset.spawnBgY = y; // background y at spawn time
  o.dataset.lane = lane;
  
  // size the obstacle to match the player's on-screen size
  if (Player) {
    const prect = Player.getBoundingClientRect();
    // size spikes relative to player using SPIKE_SCALE
    const w = Math.round(prect.width * SPIKE_SCALE);
    const h = Math.round(prect.height * SPIKE_SCALE);
    o.style.width = `${w}px`;
    o.style.height = `${h}px`;
    // ensure it's centered and rotated toward container center
    let laneFrac2 = 0.5;
    if (typeof lane === 'string' && lane.includes('%')) laneFrac2 = parseFloat(lane) / 100;
    // rotate toward center: left lanes should point right (-90deg), right lanes point left (90deg)
    let rot = 0;
    if (laneFrac2 < 0.5) rot = -90; // left -> point right
    else if (laneFrac2 > 0.5) rot = 90; // right -> point left
    else rot = 180; // center -> point up
    o.style.transform = `translateX(-50%) rotate(${rot}deg)`;
  }
  // append to container so the spike visually "sticks" to the background column
  container.appendChild(o);
  return o;
}

const activeObstacles = new Set();
let spawning = true;

function animateObstacles(dt) {
  if (paused || isGameOver) return;
  const removeList = [];
  activeObstacles.forEach(o => {

    // compute obstacle Y so it follows the background scroll (sticks to image)
    const startY = parseFloat(o.dataset.startY || 0);
    const spawnBgY = parseFloat(o.dataset.spawnBgY || 0);
    // current background offset is `y`; (y - spawnBgY) is how much the background moved since spawn
    // when background `y` decreases, this value becomes negative so the obstacle moves up with the background
    const yPx = startY + (y - spawnBgY);
    o.style.top = `${yPx}px`;

    // collision check with player using smaller hitboxes
    if (Player) {
      const rectP0 = Player.getBoundingClientRect();
      const rectO0 = o.getBoundingClientRect();
      const rectP = shrinkRect(rectP0, 0.18); // player hitbox 18% smaller
      const rectO = shrinkRect(rectO0, 0.12); // obstacle hitbox 12% smaller
      if (!(rectP.right < rectO.left || rectP.left > rectO.right || rectP.bottom < rectO.top || rectP.top > rectO.bottom)) {
        gameOver();
      }
    }

    // remove when off-screen (above container viewport)
    // remove when the spike has moved above the visible container top
    const crect = (bg && bg.getBoundingClientRect()) || { top: 0 };
    // compute obstacle bottom in viewport coords (container top + yPx + height)
    const oBottom = crect.top + yPx + (o.offsetHeight || 0);
    if (oBottom < crect.top - 20) removeList.push(o);
  });

  removeList.forEach(o => { activeObstacles.delete(o); o.remove(); });
}

function spawnLoop() {
  if (!spawning) return;
  // only spawn if there are no other active obstacles (spawn lonely)
  // limit concurrent obstacles
  if (activeObstacles.size >= MAX_CONCURRENT) {
    const next = randomBetween(spawnIntervalRange[0], spawnIntervalRange[1]);
    setTimeout(spawnLoop, next);
    return;
  }
  // choose a lane that doesn't already have an obstacle
  const available = lanes.filter(l => ![...activeObstacles].some(o => o.dataset.lane === l));
  // compute spawn startY for this column to check row occupancy
  const container = bg || document.body;
  const ch = container.clientHeight || window.innerHeight;
  const spawnRowY = ch + ch * 0.12;
  const sameRowCount = [...activeObstacles].filter(o => Math.abs((parseFloat(o.dataset.startY)||0) - spawnRowY) < ROW_THRESHOLD).length;
  if (sameRowCount >= 2) {
    const next = randomBetween(spawnIntervalRange[0], spawnIntervalRange[1]);
    setTimeout(spawnLoop, next);
    return;
  }
  if (available.length === 0) {
    const next = randomBetween(spawnIntervalRange[0], spawnIntervalRange[1]);
    setTimeout(spawnLoop, next);
    return;
  }
  const lane = available[Math.floor(Math.random() * available.length)];
  // spawn triangle immediately (no warning)
  const tri = spawnTriangle(lane);
  activeObstacles.add(tri);

  const next = randomBetween(spawnIntervalRange[0], spawnIntervalRange[1]);
  setTimeout(spawnLoop, next);
}

// integrate obstacle animation into the main scroll loop by wrapping scroll
// We replace the existing scroll loop with a small wrapper that calls scroll and animates obstacles
let rafHandle = null;
function mainLoop(timestamp) {
  // if paused or game-over, stop requesting frames here
  if (paused || isGameOver) { lastAnim = null; rafHandle = null; return; }
  if (!lastAnim) lastAnim = timestamp;
  const dt = (timestamp - lastAnim) / 1000; // seconds
  lastAnim = timestamp;

  // update speed and background position
  speed += accel * dt;
  y -= speed * dt;
  if (bg) bg.style.backgroundPosition = `center ${y}px`;

  // animate obstacles (they follow background via `y` values)
  animateObstacles(dt);

  rafHandle = requestAnimationFrame(mainLoop);
}

// start spawn and integrated loop
spawnLoop();
if (rafHandle) cancelAnimationFrame(rafHandle);
rafHandle = requestAnimationFrame(mainLoop);

// --------- Game over / reset ---------
function clearObstacles() {
  activeObstacles.forEach(o => o.remove());
  activeObstacles.clear();
}

function gameOver() {
  if (!spawning) return; // already handling game over
  spawning = false;
  console.log('Collision detected — game over');
  clearObstacles();
  if (rafHandle) cancelAnimationFrame(rafHandle);

  // Show the Game Over modal (no alert), let the player choose Restart
  showGameOverMenu();
}

function restartGame() {
  // hide UI and clear game-over state
  hideGameOverMenu();
  isGameOver = false;
  paused = false;
  // ensure pause menu hidden and input focus cleared so key events reach document
  pauseMenu.classList.add('hidden');
  try { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); } catch (e) {}
  // reattach pause handler to ensure it's active after restart
  try {
    // detach any previous attachment and reattach via helpers
    detachPauseHandler();
  } catch (e) {}
  attachPauseHandler();
  // reset motion variables
  y = 0;
  speed = INITIAL_SPEED;
  accel = INITIAL_ACCEL;
  lastAnim = null;
  if (bg) bg.style.backgroundPosition = `center 0px`;
  // recentre player
  if (Player) Player.style.left = '50%';
  // clear any lingering obstacles
  clearObstacles();
  // resume spawning and animation
  spawning = true;
  spawnLoop();
  rafHandle = requestAnimationFrame(mainLoop);
}


