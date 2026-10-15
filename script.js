/**
 * Initial D AE86 Digital Speedometer & Cluster
 * Designed for JG:VRP (Jogjagamers V Roleplay) & FiveM CEF
 * Implements 100% of jgvrp-speedometer-template telemetry API
 */

// Constants
const RPM_SEGMENTS = 24;
const SUB_SEGMENTS = 15;
const MAX_4AGE_RPM = 11000;
const REDLINE_RATIO = 0.77; // ~8500 RPM
const CHIME_SPEED_KMH = 105;

// Internal Telemetry State
const telemetry = {
  engine: true,
  speedMs: 0,
  speedMode: 0, // 0: KMH, 1: MPH, 2: Knots
  calculatedSpeed: 0,
  lastCalculatedSpeed: 0,
  rpm: 0.1, // 0.0 to 1.0
  peakRpmSegment: 0,
  fuel: 0.85, // 0.0 to 1.0
  health: 1.0, // 0.0 to 1.0
  gear: 1,
  headlights: 0, // 0: Off, 1: Low Beam (Green), 2: High Beam (Blue)
  leftIndicator: false,
  rightIndicator: false,
  seatbelts: true,
  locked: true, // true: Locked (Amber), false: Unlocked
  odometer: 86240.5, // miles or km
  soundEnabled: true, // Default ON for local testing
};

// DOM Elements Cache
let el = {};

// Web Audio API Context for Chimes (105 KM/H Bell & Seatbelt Reminder)
let audioCtx = null;
let lastChimeTime = 0;
let lastSeatbeltChimeTime = 0;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Authentic AE86 105 KM/H "Kin-Kon" Speed Chime
function playAe86Chime() {
  if (!telemetry.soundEnabled) return;
  const now = performance.now();
  if (now - lastChimeTime < 650) return; // 650ms cadence
  lastChimeTime = now;

  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;

    const playTone = (freq, startTime, duration, vol = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playTone(1046.5, t, 0.28, 0.07);       // High C6 ("Kin")
    playTone(880.0, t + 0.25, 0.35, 0.07); // A5 ("Kon")
  } catch (e) {
    // Audio context may require user click first
  }
}

// 2. Seatbelt Warning Reminder Chime (Double Ding)
function playSeatbeltReminderChime() {
  if (!telemetry.soundEnabled) return;
  const now = performance.now();
  // Ding cadence every 1.4 seconds when unbuckled & engine is on
  if (now - lastSeatbeltChimeTime < 1400) return;
  lastSeatbeltChimeTime = now;

  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;

    const playSeatTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // Soft acoustic warning ding
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Double chime reminder (880 Hz -> 698.4 Hz)
    playSeatTone(880.0, t, 0.20);
    playSeatTone(698.4, t + 0.18, 0.25);
  } catch (e) {
    // Ignore audio permission error
  }
}

// ---------------------------------------------------------------------------
// 12 GLOBAL TELEMETRY API FUNCTIONS (JG:VRP TEMPLATE SPECIFICATION)
// ---------------------------------------------------------------------------

/**
 * Updates engine status
 * @param {boolean} state - true: On, false: Off
 */
function setEngine(state) {
  telemetry.engine = Boolean(state);
  renderDashboard();
}

/**
 * Updates speed based on speed mode
 * @param {number} speed - The speed in meters per second (m/s)
 */
function setSpeed(speed) {
  telemetry.speedMs = Math.max(0, Number(speed) || 0);
  switch (telemetry.speedMode) {
    case 1: // MPH
      telemetry.calculatedSpeed = Math.round(telemetry.speedMs * 2.236936);
      break;
    case 2: // Knots
      telemetry.calculatedSpeed = Math.round(telemetry.speedMs * 1.943844);
      break;
    default: // KMH
      telemetry.calculatedSpeed = Math.round(telemetry.speedMs * 3.6);
      break;
  }
  renderDashboard();
}

/**
 * Updates RPM (0.0 to 1.0)
 * @param {number} rpm - Ratio from 0.0 to 1.0
 */
function setRPM(rpm) {
  telemetry.rpm = Math.min(Math.max(Number(rpm) || 0, 0), 1);
  renderDashboard();
}

/**
 * Updates fuel level (0.0 to 1.0)
 * @param {number} fuel - Ratio from 0.0 to 1.0
 */
function setFuel(fuel) {
  telemetry.fuel = Math.min(Math.max(Number(fuel) || 0, 0), 1);
  renderDashboard();
}

/**
 * Updates vehicle health (0.0 to 1.0)
 * @param {number} health - Ratio from 0.0 to 1.0
 */
function setHealth(health) {
  telemetry.health = Math.min(Math.max(Number(health) || 0, 0), 1);
  renderDashboard();
}

/**
 * Updates current gear
 * @param {number|string} gear - 0: Neutral/Reverse, 1..6+: Forward
 */
function setGear(gear) {
  telemetry.gear = gear;
  renderDashboard();
}

/**
 * Updates headlights (0: Off, 1: Low Beam, 2: High Beam)
 * @param {number} state
 */
function setHeadlights(state) {
  telemetry.headlights = Number(state) || 0;
  renderDashboard();
}

/**
 * Updates left turn indicator
 * @param {boolean} state
 */
function setLeftIndicator(state) {
  telemetry.leftIndicator = Boolean(state);
  renderDashboard();
}

/**
 * Updates right turn indicator
 * @param {boolean} state
 */
function setRightIndicator(state) {
  telemetry.rightIndicator = Boolean(state);
  renderDashboard();
}

/**
 * Updates seatbelt status
 * @param {boolean} state - true: fastened, false: unfastened
 */
function setSeatbelts(state) {
  telemetry.seatbelts = Boolean(state);
  renderDashboard();
}

/**
 * Sets speed display mode (0: KMH, 1: MPH, 2: Knots)
 * @param {number} mode
 */
function setSpeedMode(mode) {
  telemetry.speedMode = Number(mode) || 0;
  setSpeed(telemetry.speedMs); // Recalculate speed with new unit
}

/**
 * Updates odometer distance in miles
 * @param {number} distance
 */
function setOdometer(distance) {
  telemetry.odometer = Number(distance) || 0;
  renderDashboard();
}

/**
 * Updates vehicle door lock status (Custom extension for FiveM car lock scripts)
 * @param {boolean} state - true: locked, false: unlocked
 */
function setLocked(state) {
  telemetry.locked = Boolean(state);
  renderDashboard();
}

/**
 * Adjusts the global size/scale of the cluster (e.g. 0.7 to 1.5)
 * @param {number} scale
 */
function setClusterScale(scale) {
  const clamped = Math.max(0.4, Math.min(2.0, Number(scale) || 1.0));
  telemetry.scale = clamped;
  const cluster = document.getElementById('speedo-cluster');
  if (cluster) {
    cluster.style.transform = `scale(${clamped})`;
    cluster.style.transformOrigin = 'bottom right';
  }
  document.documentElement.style.setProperty('--cluster-scale', clamped.toString());
  try {
    localStorage.setItem('ae86_cluster_scale', clamped.toString());
  } catch (e) {}

  const simScale = document.getElementById('sim-scale');
  const valScale = document.getElementById('val-scale');
  if (simScale) simScale.value = clamped;
  if (valScale) valScale.textContent = `${Math.round(clamped * 100)}% (${clamped.toFixed(2)}x)`;
}

// Expose all functions to global window for JG:VRP game client & custom script calls
window.setEngine = setEngine;
window.setSpeed = setSpeed;
window.setRPM = setRPM;
window.setFuel = setFuel;
window.setHealth = setHealth;
window.setGear = setGear;
window.setHeadlights = setHeadlights;
window.setLeftIndicator = setLeftIndicator;
window.setRightIndicator = setRightIndicator;
window.setSeatbelts = setSeatbelts;
window.setLocked = setLocked;
window.setSpeedMode = setSpeedMode;
window.setOdometer = setOdometer;
window.setClusterScale = setClusterScale;

// FiveM window.addEventListener('message') fallback support
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.engine !== undefined) setEngine(data.engine);
  if (data.speed !== undefined) setSpeed(data.speed);
  if (data.rpm !== undefined) setRPM(data.rpm);
  if (data.fuel !== undefined) setFuel(data.fuel);
  if (data.health !== undefined) setHealth(data.health);
  if (data.gear !== undefined) setGear(data.gear);
  if (data.headlights !== undefined) setHeadlights(data.headlights);
  if (data.leftIndicator !== undefined) setLeftIndicator(data.leftIndicator);
  if (data.rightIndicator !== undefined) setRightIndicator(data.rightIndicator);
  if (data.seatbelt !== undefined) setSeatbelts(data.seatbelt);
  if (data.locked !== undefined) setLocked(data.locked);
  if (data.lock !== undefined) setLocked(data.lock);
  if (data.speedMode !== undefined) setSpeedMode(data.speedMode);
  if (data.odometer !== undefined) setOdometer(data.odometer);
  if (data.scale !== undefined || data.clusterScale !== undefined) {
    setClusterScale(data.scale ?? data.clusterScale);
  }
});

// ---------------------------------------------------------------------------
// INITIALIZATION & RENDERING ENGINE
// ---------------------------------------------------------------------------

function initDom() {
  el = {
    // Warning Lights (Integrated directly with Tachometer)
    indLeft: document.getElementById('ind-left'),
    indRight: document.getElementById('ind-right'),
    indLights: document.getElementById('ind-lights'),
    svgLightLow: document.getElementById('svg-light-low'),
    svgLightHigh: document.getElementById('svg-light-high'),
    indSeatbelt: document.getElementById('ind-seatbelt'),
    indLock: document.getElementById('ind-lock'),
    svgLockClosed: document.getElementById('svg-lock-closed'),
    svgLockOpen: document.getElementById('svg-lock-open'),
    indEngine: document.getElementById('ind-engine'),

    // Tacho elements
    rpmBar: document.getElementById('rpm-bar'),
    rpmNumeric: document.getElementById('rpm-numeric'),
    shiftLight: document.getElementById('shift-light-pill'),
    chime: document.getElementById('chime-indicator'),

    // Submeters (Fuel, Health, Odo integrated with Tachometer)
    fuelBar: document.getElementById('fuel-bar'),
    fuelPct: document.getElementById('fuel-pct'),
    engineBar: document.getElementById('engine-bar'),
    enginePct: document.getElementById('engine-pct'),
    odoDigits: document.getElementById('odo-digits'),
    odoUnit: document.getElementById('odo-unit'),

    // Speed & Gear
    speedDigits: document.getElementById('speed-digits'),
    speedUnitText: document.getElementById('speed-unit-text'),
    gearBox: document.getElementById('gear-box'),
    clock: document.getElementById('clock-display'),

    // Extras (Takumi & Water Cup on top of Speed)
    waterSlosh: document.getElementById('water-slosh-group'),
    cupStatus: document.getElementById('cup-status'),
    spill1: document.getElementById('spill-drop-1'),
    spill2: document.getElementById('spill-drop-2'),
    charFrame: document.getElementById('char-frame'),
    charSpeedlines: document.getElementById('char-speedlines'),
    charStateBadge: document.getElementById('char-state-badge'),
    dialogueJp: document.getElementById('dialogue-jp'),
    dialogueEn: document.getElementById('dialogue-en'),
    takumiChill: document.getElementById('takumi-face-chill'),
    takumiIntense: document.getElementById('takumi-face-intense'),
    takumiPanic: document.getElementById('takumi-face-panic'),
    takumiSleep: document.getElementById('takumi-face-sleep'),
    takumiAura: document.getElementById('takumi-aura'),
  };

  // Build segmented LED bars
  el.rpmBar.innerHTML = '';
  for (let i = 0; i < RPM_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'rpm-seg';
    el.rpmBar.appendChild(seg);
  }

  el.fuelBar.innerHTML = '';
  for (let i = 0; i < SUB_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'sub-segment';
    el.fuelBar.appendChild(seg);
  }

  el.engineBar.innerHTML = '';
  for (let i = 0; i < SUB_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'sub-segment';
    el.engineBar.appendChild(seg);
  }
}

function renderDashboard() {
  if (!el.rpmBar) return;

  const spd = telemetry.calculatedSpeed;
  const rpmRatio = telemetry.engine ? telemetry.rpm : 0;
  const currentRPM = Math.round(rpmRatio * MAX_4AGE_RPM);

  // 1. Digital Speed & Unit
  el.speedDigits.textContent = spd.toString().padStart(3, '0');
  
  let unitLabel = 'KM/H';
  let odoUnitLabel = 'KM';
  if (telemetry.speedMode === 1) {
    unitLabel = 'MPH';
    odoUnitLabel = 'MI';
  } else if (telemetry.speedMode === 2) {
    unitLabel = 'KNOTS';
    odoUnitLabel = 'NM';
  }
  el.speedUnitText.textContent = unitLabel;
  el.odoUnit.textContent = odoUnitLabel;

  // 105 KM/H Chime Alert (when in KMH mode)
  const isChiming = (telemetry.speedMode === 0 && spd >= CHIME_SPEED_KMH);
  if (isChiming) {
    el.speedDigits.className = 'font-digital speed-digits glow-red';
    el.speedDigits.style.color = '#ff1e42';
    el.chime.className = 'chime-indicator active flash-alert';
    playAe86Chime();
  } else {
    el.speedDigits.className = 'font-digital speed-digits glow-amber';
    el.speedDigits.style.color = '#ff9d00';
    el.chime.className = 'chime-indicator';
  }

  // 2. Seatbelt Warning Reminder (Audio + Blinking Light)
  const isSeatbeltUnbuckled = !telemetry.seatbelts;
  setIndicatorState(el.indSeatbelt, isSeatbeltUnbuckled, 'active-red blink-signal');
  if (isSeatbeltUnbuckled && telemetry.engine) {
    playSeatbeltReminderChime();
  }

  // 3. Gear Readout & Redline Alert
  let gearText = telemetry.gear;
  if (gearText === 0 || gearText === '0' || gearText === 'N') gearText = 'N';
  else if (gearText === -1 || gearText === '-1' || gearText === 'R') gearText = 'R';
  el.gearBox.textContent = gearText;

  const isRedline = rpmRatio >= REDLINE_RATIO;
  if (isRedline && telemetry.engine) {
    el.shiftLight.className = 'shift-pill active flash-alert';
    el.gearBox.className = 'font-digital gear-box redline flash-alert';
  } else {
    el.shiftLight.className = 'shift-pill';
    el.gearBox.className = 'font-digital gear-box';
  }

  // 4. 24-Segment RPM Bar with Peak Hold
  el.rpmNumeric.textContent = currentRPM.toString().padStart(4, '0');
  const activeRpmCount = Math.round(rpmRatio * RPM_SEGMENTS);

  if (activeRpmCount >= telemetry.peakRpmSegment) {
    telemetry.peakRpmSegment = activeRpmCount;
  } else if (telemetry.peakRpmSegment > 0) {
    telemetry.peakRpmSegment = Math.max(activeRpmCount, telemetry.peakRpmSegment - 0.15);
  }
  const peakIndex = Math.min(RPM_SEGMENTS - 1, Math.floor(telemetry.peakRpmSegment));

  const rpmNodes = el.rpmBar.children;
  for (let i = 0; i < RPM_SEGMENTS; i++) {
    const seg = rpmNodes[i];
    seg.className = 'rpm-seg';
    if (i < activeRpmCount) {
      if (i >= 18) seg.classList.add('active-red');
      else if (i >= 11) seg.classList.add('active-amber');
      else seg.classList.add('active-green');
    } else if (i === peakIndex && peakIndex > 2) {
      seg.classList.add('peak-hold');
    }
  }

  // 5. Fuel Bar (15 Segments)
  const fuelPctVal = Math.round(telemetry.fuel * 100);
  el.fuelPct.textContent = `${fuelPctVal}%`;
  const activeFuelSegs = Math.round(telemetry.fuel * SUB_SEGMENTS);
  for (let i = 0; i < SUB_SEGMENTS; i++) {
    const seg = el.fuelBar.children[i];
    seg.className = 'sub-segment';
    if (i < activeFuelSegs) {
      seg.classList.add(fuelPctVal <= 15 ? 'active-red' : 'active-amber');
    }
  }

  // 6. Engine Health Bar (15 Segments)
  const healthPctVal = Math.round(telemetry.health * 100);
  el.enginePct.textContent = `${healthPctVal}%`;
  const activeHealthSegs = Math.round(telemetry.health * SUB_SEGMENTS);
  for (let i = 0; i < SUB_SEGMENTS; i++) {
    const seg = el.engineBar.children[i];
    seg.className = 'sub-segment';
    if (i < activeHealthSegs) {
      seg.classList.add(healthPctVal <= 35 ? 'active-red' : 'active-green');
    }
  }

  // 7. Odometer
  el.odoDigits.textContent = telemetry.odometer.toFixed(1).padStart(8, '0');

  // 8. Warning Indicators
  setIndicatorState(el.indLeft, telemetry.leftIndicator, 'active-green blink-signal');
  setIndicatorState(el.indRight, telemetry.rightIndicator, 'active-green blink-signal');

  // Headlights: 0: Off (dim low-beam), 1: Low Beam (Green, angled down), 2: High Beam (Blue, straight forward)
  if (telemetry.headlights === 2) {
    if (el.svgLightLow) el.svgLightLow.style.display = 'none';
    if (el.svgLightHigh) el.svgLightHigh.style.display = 'block';
    setIndicatorState(el.indLights, true, 'active-blue');
  } else if (telemetry.headlights === 1) {
    if (el.svgLightLow) el.svgLightLow.style.display = 'block';
    if (el.svgLightHigh) el.svgLightHigh.style.display = 'none';
    setIndicatorState(el.indLights, true, 'active-green');
  } else {
    if (el.svgLightLow) el.svgLightLow.style.display = 'block';
    if (el.svgLightHigh) el.svgLightHigh.style.display = 'none';
    setIndicatorState(el.indLights, false, '');
  }

  // Door Lock indicator (true: locked padlock with amber glow; false: open padlock dimmed)
  if (telemetry.locked) {
    if (el.svgLockClosed) el.svgLockClosed.style.display = 'block';
    if (el.svgLockOpen) el.svgLockOpen.style.display = 'none';
    setIndicatorState(el.indLock, true, 'active-amber');
  } else {
    if (el.svgLockClosed) el.svgLockClosed.style.display = 'none';
    if (el.svgLockOpen) el.svgLockOpen.style.display = 'block';
    setIndicatorState(el.indLock, false, '');
  }

  const isEngineWarning = !telemetry.engine || healthPctVal < 40;
  setIndicatorState(el.indEngine, isEngineWarning, 'active-amber blink-signal');

  // 9. Water Cup Tilt Physics (Simulation)
  const speedDelta = spd - telemetry.lastCalculatedSpeed;
  telemetry.lastCalculatedSpeed = spd;
  let tiltAngle = Math.max(-24, Math.min(24, speedDelta * 2.2 + (telemetry.leftIndicator ? -10 : 0) + (telemetry.rightIndicator ? 10 : 0)));
  if (spd > 110) tiltAngle += Math.sin(performance.now() / 90) * 7;
  el.waterSlosh.style.transform = `rotate(${tiltAngle.toFixed(1)}deg)`;

  if (Math.abs(tiltAngle) > 14 || healthPctVal < 40) {
    el.cupStatus.textContent = 'SPILL!';
    el.cupStatus.style.color = '#ff1e42';
    el.spill1.style.opacity = '1';
    el.spill2.style.opacity = '1';
  } else if (spd > 90) {
    el.cupStatus.textContent = 'EDGE';
    el.cupStatus.style.color = '#ff9d00';
    el.spill1.style.opacity = '0';
    el.spill2.style.opacity = '0';
  } else {
    el.cupStatus.textContent = 'SAFE';
    el.cupStatus.style.color = '#00f59b';
    el.spill1.style.opacity = '0';
    el.spill2.style.opacity = '0';
  }

  // 10. Takumi Reactive Expressions
  if (!telemetry.engine) {
    // STATE 0: ENGINE OFF — TAKUMI IS SLEEPING PEACEFULLY
    if (el.takumiChill) el.takumiChill.style.display = 'none';
    if (el.takumiIntense) el.takumiIntense.style.display = 'none';
    if (el.takumiPanic) el.takumiPanic.style.display = 'none';
    if (el.takumiSleep) el.takumiSleep.style.display = 'block';
    el.takumiAura.setAttribute('opacity', '0');
    el.charFrame.className = 'char-frame manga-halftone';
    el.charSpeedlines.style.opacity = '0';
    el.charStateBadge.textContent = 'SLEEP';
    el.charStateBadge.style.color = '#38bdf8';
    el.dialogueJp.textContent = '「仮眠中… Zzz」';
    el.dialogueEn.textContent = 'ENGINE OFF // SLEEPING';
  } else if (healthPctVal < 40) {
    // STATE 3: ENGINE CRITICAL DAMAGE ("NANI?!")
    if (el.takumiChill) el.takumiChill.style.display = 'none';
    if (el.takumiIntense) el.takumiIntense.style.display = 'none';
    if (el.takumiSleep) el.takumiSleep.style.display = 'none';
    if (el.takumiPanic) el.takumiPanic.style.display = 'block';
    el.takumiAura.setAttribute('opacity', '0');
    el.charFrame.className = 'char-frame manga-halftone-danger shake-anim';
    el.charSpeedlines.style.opacity = '0.35';
    el.charStateBadge.textContent = 'DANGER';
    el.charStateBadge.style.color = '#ff1e42';
    el.dialogueJp.textContent = '「エンジンが…！？」';
    el.dialogueEn.textContent = 'ENGINE CRITICAL ALERT!!';
  } else if (rpmRatio >= REDLINE_RATIO || spd >= 110) {
    // STATE 2: FUJIWARA ZONE FOCUS
    if (el.takumiChill) el.takumiChill.style.display = 'none';
    if (el.takumiSleep) el.takumiSleep.style.display = 'none';
    if (el.takumiPanic) el.takumiPanic.style.display = 'none';
    if (el.takumiIntense) el.takumiIntense.style.display = 'block';
    el.takumiAura.setAttribute('opacity', '1');
    el.charFrame.className = 'char-frame manga-halftone-intense';
    el.charSpeedlines.style.opacity = '0.9';
    el.charStateBadge.textContent = 'ZONE';
    el.charStateBadge.style.color = '#ff9d00';
    el.dialogueJp.textContent = '「11,000回転キッチリ回せ！」';
    el.dialogueEn.textContent = 'KANSEI DORIFTO // ZONE';
  } else {
    // STATE 1: CHILL TOFU DELIVERY CRUISE
    if (el.takumiSleep) el.takumiSleep.style.display = 'none';
    if (el.takumiIntense) el.takumiIntense.style.display = 'none';
    if (el.takumiPanic) el.takumiPanic.style.display = 'none';
    if (el.takumiChill) el.takumiChill.style.display = 'block';
    el.takumiAura.setAttribute('opacity', '0');
    el.charFrame.className = 'char-frame manga-halftone';
    el.charSpeedlines.style.opacity = '0';
    el.charStateBadge.textContent = 'CHILL';
    el.charStateBadge.style.color = '#00f59b';
    el.dialogueJp.textContent = '「藤原とうふ店・配達中」';
    el.dialogueEn.textContent = 'TOFU DELIVERY CRUISE';
  }
}

function setIndicatorState(element, active, activeClasses) {
  if (!element) return;
  element.className = 'ind-icon ' + (active ? activeClasses : '');
}

// Clock tick
setInterval(() => {
  const d = new Date();
  if (el.clock) el.clock.textContent = d.toTimeString().slice(0, 5);
}, 1000);

// Periodic Seatbelt Chime Loop (Triggered every 1.4s when unbuckled & engine is on)
setInterval(() => {
  if (telemetry.engine && !telemetry.seatbelts && telemetry.soundEnabled) {
    playSeatbeltReminderChime();
  }
}, 1400);

/**
 * Interactive Corner Drag Resize Handle (Grip Triangle at Top-Left)
 */
function initResizeGrip() {
  const grip = document.getElementById('resize-grip');
  if (!grip) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startScale = 1.0;

  const onPointerDown = (e) => {
    isDragging = true;
    startX = e.clientX ?? (e.touches && e.touches[0].clientX);
    startY = e.clientY ?? (e.touches && e.touches[0].clientY);
    startScale = telemetry.scale || 1.0;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const currentX = e.clientX ?? (e.touches && e.touches[0].clientX);
    const currentY = e.clientY ?? (e.touches && e.touches[0].clientY);
    // Dragging away from bottom-right (up/left) increases scale; dragging towards bottom-right decreases
    const deltaX = startX - currentX;
    const deltaY = startY - currentY;
    const delta = (deltaX + deltaY) / 2;
    const newScale = startScale + (delta / 280);
    setClusterScale(newScale);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  grip.addEventListener('pointerdown', onPointerDown);
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initDom();
  initResizeGrip();

  // Initial Seed
  setSpeed(0);
  setRPM(0.1);
  setFuel(0.85);
  setHealth(1.0);
  setGear(1);
  setSeatbelts(true);
  setLocked(true);
  setEngine(true);
  setOdometer(86240.5);
  renderDashboard();
});
