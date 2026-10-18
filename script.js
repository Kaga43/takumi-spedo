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

let renderPending = false;
function scheduleDashboardRender() {
  if (renderPending) return;
  renderPending = true;
  window.requestAnimationFrame(() => {
    renderPending = false;
    renderDashboard();
  });
}

/**
 * Updates engine status
 * @param {boolean} state - true: On, false: Off
 */
function setEngine(state) {
  telemetry.engine = Boolean(state);
  scheduleDashboardRender();
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
  scheduleDashboardRender();
}

/**
 * Updates RPM (0.0 to 1.0)
 * @param {number} rpm - Ratio from 0.0 to 1.0
 */
function setRPM(rpm) {
  telemetry.rpm = Math.min(Math.max(Number(rpm) || 0, 0), 1);
  scheduleDashboardRender();
}

/**
 * Updates fuel level (0.0 to 1.0)
 * @param {number} fuel - Ratio from 0.0 to 1.0
 */
function setFuel(fuel) {
  telemetry.fuel = Math.min(Math.max(Number(fuel) || 0, 0), 1);
  scheduleDashboardRender();
}

/**
 * Updates vehicle health (0.0 to 1.0)
 * @param {number} health - Ratio from 0.0 to 1.0
 */
function setHealth(health) {
  telemetry.health = Math.min(Math.max(Number(health) || 0, 0), 1);
  scheduleDashboardRender();
}

/**
 * Updates current gear
 * @param {number|string} gear - 0: Neutral/Reverse, 1..6+: Forward
 */
function setGear(gear) {
  telemetry.gear = gear;
  scheduleDashboardRender();
}

/**
 * Updates headlights (0: Off, 1: Low Beam, 2: High Beam)
 * @param {number} state
 */
function setHeadlights(state) {
  telemetry.headlights = Number(state) || 0;
  scheduleDashboardRender();
}

/**
 * Updates left turn indicator
 * @param {boolean} state
 */
function setLeftIndicator(state) {
  telemetry.leftIndicator = Boolean(state);
  scheduleDashboardRender();
}

/**
 * Updates right turn indicator
 * @param {boolean} state
 */
function setRightIndicator(state) {
  telemetry.rightIndicator = Boolean(state);
  scheduleDashboardRender();
}

/**
 * Updates seatbelt status
 * @param {boolean} state - true: fastened, false: unfastened
 */
function setSeatbelts(state) {
  telemetry.seatbelts = Boolean(state);
  scheduleDashboardRender();
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
  scheduleDashboardRender();
}

/**
 * Calculates ideal cluster scale based on current screen/game viewport resolution
 * Standard 1920x1080 = 1.0x; Laptop 1366x768 = ~0.71x; 720p = ~0.66x
 */
function getIdealClusterScale() {
  const screenW = window.innerWidth || 1920;
  const screenH = window.innerHeight || 1080;
  const ratioW = screenW / 1920;
  const ratioH = screenH / 1080;
  const baseRatio = Math.min(ratioW, ratioH);
  return Math.max(0.55, Math.min(1.15, Number(baseRatio.toFixed(2))));
}

/**
 * Adjusts the global size/scale of the cluster (e.g. 0.4 to 2.0)
 * @param {number} scale
 * @param {boolean} saveToStorage - whether to persist manual player scale preference
 */
function setClusterScale(scale, saveToStorage = true) {
  const clamped = Math.max(0.4, Math.min(2.0, Number(scale) || 1.0));
  telemetry.scale = clamped;
  const cluster = document.getElementById('speedo-cluster');
  if (cluster) {
    cluster.style.transform = `scale(${clamped})`;
    cluster.style.transformOrigin = 'bottom right';
  }
  document.documentElement.style.setProperty('--cluster-scale', clamped.toString());
  if (saveToStorage) {
    try {
      localStorage.setItem('ae86_cluster_scale', clamped.toString());
    } catch (e) {}
  }

  const simScale = document.getElementById('sim-scale');
  const valScale = document.getElementById('val-scale');
  if (simScale) simScale.value = clamped;
  if (valScale) valScale.textContent = `${Math.round(clamped * 100)}% (${clamped.toFixed(2)}x)`;
}

/**
 * Clamps cluster position to ensure it remains reachable inside current screen viewport
 */
function clampClusterPosition() {
  const cluster = document.getElementById('speedo-cluster');
  if (!cluster) return;
  const computed = window.getComputedStyle(cluster);
  const currentRight = parseFloat(cluster.style.right || computed.right) || 24;
  const currentBottom = parseFloat(cluster.style.bottom || computed.bottom) || 24;

  const minRight = 10;
  const maxRight = Math.max(10, window.innerWidth - 120);
  const minBottom = 10;
  const maxBottom = Math.max(10, window.innerHeight - 80);

  const clampedRight = Math.max(minRight, Math.min(maxRight, currentRight));
  const clampedBottom = Math.max(minBottom, Math.min(maxBottom, currentBottom));

  cluster.style.right = `${clampedRight}px`;
  cluster.style.bottom = `${clampedBottom}px`;
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
window.setLocked = () => {}; // Harmless no-op for backward compatibility
window.setSpeedMode = setSpeedMode;
window.setOdometer = setOdometer;
window.setClusterScale = setClusterScale;

// Car Stereo & Music Sync Global Exports
window.playMusic = playTrackAsDriver;
window.syncMusic = syncTrackAsPassenger;
window.setMusicVolume = setMusicVolume;
window.toggleMusic = togglePlayPause;
window.toggleStereoDeck = toggleStereoDeck;

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

  // Car Music & Passenger Sync Events from FiveM
  if (data.action === 'syncMusic' || data.type === 'syncMusic' || data.carMusic) {
    syncTrackAsPassenger(data.carMusic || data);
  }
  if (data.action === 'syncQueue' || data.type === 'syncQueue') {
    if (Array.isArray(data.queue)) {
      carMusic.queue = data.queue;
      if (typeof data.queueIndex === 'number') carMusic.queueIndex = data.queueIndex;
      renderQueueUI();
      updateQueueCountUI();
    }
  }
  if (data.action === 'playMusic' || data.type === 'playMusic') {
    playTrackAsDriver(data.videoId, data.title, data.startSeconds || 0);
  }
  if (data.action === 'toggleStereo' || data.type === 'toggleStereo') {
    toggleStereoDeck();
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
    statusDot: document.getElementById('status-dot'),
    statusBanner: document.querySelector('.status-banner'),
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

  // Cache segment child collections for high-performance zero-recalc loops
  el.rpmNodes = el.rpmBar.children;
  el.fuelNodes = el.fuelBar.children;
  el.engineNodes = el.engineBar.children;
}

// State cache for dirty-checking: DOM writes are strictly skipped when values don't change
const renderCache = {
  spdDigits: '',
  speedUnit: '',
  odoUnit: '',
  isChiming: null,
  isSeatbeltUnbuckled: null,
  gearText: '',
  isRedline: null,
  rpmNumeric: '',
  activeRpmCount: -1,
  fuelPctVal: -1,
  activeFuelSegs: -1,
  healthPctVal: -1,
  activeHealthSegs: -1,
  odoDigits: '',
  leftIndicator: null,
  rightIndicator: null,
  headlights: null,
  isEngineWarning: null,
  tiltAngleRounded: null,
  cupStatusText: '',
  takumiState: null
};

function renderDashboard() {
  if (!el.rpmBar) return;

  const spd = telemetry.calculatedSpeed;
  const rpmRatio = telemetry.engine ? telemetry.rpm : 0;
  const currentRPM = Math.round(rpmRatio * MAX_4AGE_RPM);

  // 1. Digital Speed & Unit
  const spdStr = spd.toString().padStart(3, '0');
  if (renderCache.spdDigits !== spdStr) {
    el.speedDigits.textContent = spdStr;
    renderCache.spdDigits = spdStr;
  }
  
  let unitLabel = 'KM/H';
  let odoUnitLabel = 'KM';
  if (telemetry.speedMode === 1) {
    unitLabel = 'MPH';
    odoUnitLabel = 'MI';
  } else if (telemetry.speedMode === 2) {
    unitLabel = 'KNOTS';
    odoUnitLabel = 'NM';
  }
  if (renderCache.speedUnit !== unitLabel) {
    el.speedUnitText.textContent = unitLabel;
    renderCache.speedUnit = unitLabel;
  }
  if (renderCache.odoUnit !== odoUnitLabel) {
    el.odoUnit.textContent = odoUnitLabel;
    renderCache.odoUnit = odoUnitLabel;
  }

  // 105 KM/H Chime Alert (when in KMH mode)
  const isChiming = (telemetry.speedMode === 0 && spd >= CHIME_SPEED_KMH);
  if (renderCache.isChiming !== isChiming) {
    renderCache.isChiming = isChiming;
    if (isChiming) {
      el.speedDigits.className = 'font-digital speed-digits glow-red';
      el.speedDigits.style.color = '#ff1e42';
      el.chime.className = 'chime-indicator active flash-alert';
    } else {
      el.speedDigits.className = 'font-digital speed-digits glow-amber';
      el.speedDigits.style.color = '#ff9d00';
      el.chime.className = 'chime-indicator';
    }
  }
  if (isChiming) {
    playAe86Chime();
  }

  // 2. Seatbelt Warning Reminder (Audio + Blinking Light)
  const isSeatbeltUnbuckled = !telemetry.seatbelts;
  if (renderCache.isSeatbeltUnbuckled !== isSeatbeltUnbuckled) {
    renderCache.isSeatbeltUnbuckled = isSeatbeltUnbuckled;
    setIndicatorState(el.indSeatbelt, isSeatbeltUnbuckled, 'active-red blink-signal');
  }
  if (isSeatbeltUnbuckled && telemetry.engine) {
    playSeatbeltReminderChime();
  }

  // 3. Gear Readout & Redline Alert
  let gearText = telemetry.gear;
  if (gearText === 0 || gearText === '0' || gearText === 'N') gearText = 'N';
  else if (gearText === -1 || gearText === '-1' || gearText === 'R') gearText = 'R';
  if (renderCache.gearText !== gearText) {
    el.gearBox.textContent = gearText;
    renderCache.gearText = gearText;
  }

  const isRedline = (rpmRatio >= REDLINE_RATIO && telemetry.engine);
  if (renderCache.isRedline !== isRedline) {
    renderCache.isRedline = isRedline;
    if (isRedline) {
      el.shiftLight.className = 'shift-pill active flash-alert';
      el.gearBox.className = 'font-digital gear-box redline flash-alert';
    } else {
      el.shiftLight.className = 'shift-pill';
      el.gearBox.className = 'font-digital gear-box';
    }
  }

  // 4. 24-Segment RPM Bar - Instant & Snappy Real-Time Drop with Zero-Thrash Caching
  const rpmStr = currentRPM.toString().padStart(4, '0');
  if (renderCache.rpmNumeric !== rpmStr) {
    el.rpmNumeric.textContent = rpmStr;
    renderCache.rpmNumeric = rpmStr;
  }

  const activeRpmCount = Math.round(rpmRatio * RPM_SEGMENTS);
  if (renderCache.activeRpmCount !== activeRpmCount) {
    renderCache.activeRpmCount = activeRpmCount;
    const rpmNodes = el.rpmNodes || el.rpmBar.children;
    for (let i = 0; i < RPM_SEGMENTS; i++) {
      const seg = rpmNodes[i];
      seg.className = 'rpm-seg';
      if (i < activeRpmCount) {
        if (i >= 18) seg.classList.add('active-red');
        else if (i >= 11) seg.classList.add('active-amber');
        else seg.classList.add('active-green');
      }
    }
  }

  // 5. Fuel Bar (15 Segments) - Updated ONLY on change
  const fuelPctVal = Math.round(telemetry.fuel * 100);
  const activeFuelSegs = Math.round(telemetry.fuel * SUB_SEGMENTS);
  if (renderCache.fuelPctVal !== fuelPctVal || renderCache.activeFuelSegs !== activeFuelSegs) {
    renderCache.fuelPctVal = fuelPctVal;
    renderCache.activeFuelSegs = activeFuelSegs;
    el.fuelPct.textContent = `${fuelPctVal}%`;
    const fuelNodes = el.fuelNodes || el.fuelBar.children;
    for (let i = 0; i < SUB_SEGMENTS; i++) {
      const seg = fuelNodes[i];
      seg.className = 'sub-segment';
      if (i < activeFuelSegs) {
        seg.classList.add(fuelPctVal <= 15 ? 'active-red' : 'active-amber');
      }
    }
  }

  // 6. Engine Health Bar (15 Segments) - Updated ONLY on change
  const healthPctVal = Math.round(telemetry.health * 100);
  const activeHealthSegs = Math.round(telemetry.health * SUB_SEGMENTS);
  if (renderCache.healthPctVal !== healthPctVal || renderCache.activeHealthSegs !== activeHealthSegs) {
    renderCache.healthPctVal = healthPctVal;
    renderCache.activeHealthSegs = activeHealthSegs;
    el.enginePct.textContent = `${healthPctVal}%`;
    const engineNodes = el.engineNodes || el.engineBar.children;
    for (let i = 0; i < SUB_SEGMENTS; i++) {
      const seg = engineNodes[i];
      seg.className = 'sub-segment';
      if (i < activeHealthSegs) {
        seg.classList.add(healthPctVal <= 35 ? 'active-red' : 'active-green');
      }
    }
  }

  // 7. Odometer - Updated ONLY on change
  const odoStr = telemetry.odometer.toFixed(1).padStart(8, '0');
  if (renderCache.odoDigits !== odoStr) {
    el.odoDigits.textContent = odoStr;
    renderCache.odoDigits = odoStr;
  }

  // 8. Warning Indicators & Headlights
  if (renderCache.leftIndicator !== telemetry.leftIndicator) {
    renderCache.leftIndicator = telemetry.leftIndicator;
    setIndicatorState(el.indLeft, telemetry.leftIndicator, 'active-green blink-signal');
  }
  if (renderCache.rightIndicator !== telemetry.rightIndicator) {
    renderCache.rightIndicator = telemetry.rightIndicator;
    setIndicatorState(el.indRight, telemetry.rightIndicator, 'active-green blink-signal');
  }

  if (renderCache.headlights !== telemetry.headlights) {
    renderCache.headlights = telemetry.headlights;
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
  }

  const isEngineWarning = (!telemetry.engine || healthPctVal < 40);
  if (renderCache.isEngineWarning !== isEngineWarning) {
    renderCache.isEngineWarning = isEngineWarning;
    setIndicatorState(el.indEngine, isEngineWarning, 'active-amber blink-signal');
  }

  // 9. Water Cup Tilt Physics (Simulation) - 0.5-deg step throttle prevents SVG re-rasterization thrash
  const speedDelta = spd - telemetry.lastCalculatedSpeed;
  telemetry.lastCalculatedSpeed = spd;
  let tiltAngle = Math.max(-24, Math.min(24, speedDelta * 2.2 + (telemetry.leftIndicator ? -10 : 0) + (telemetry.rightIndicator ? 10 : 0)));
  if (spd > 110) tiltAngle += Math.sin(performance.now() / 90) * 7;
  
  const roundedTilt = Math.round(tiltAngle * 2) / 2;
  if (renderCache.tiltAngleRounded !== roundedTilt) {
    renderCache.tiltAngleRounded = roundedTilt;
    el.waterSlosh.style.transform = `rotate(${roundedTilt}deg)`;
  }

  let nextCupStatus = 'SAFE';
  let cupColor = '#00f59b';
  let spillOpacity = '0';
  if (Math.abs(tiltAngle) > 14 || healthPctVal < 40) {
    nextCupStatus = 'SPILL!';
    cupColor = '#ff1e42';
    spillOpacity = '1';
  } else if (spd > 90) {
    nextCupStatus = 'EDGE';
    cupColor = '#ff9d00';
    spillOpacity = '0';
  }
  if (renderCache.cupStatusText !== nextCupStatus) {
    renderCache.cupStatusText = nextCupStatus;
    el.cupStatus.textContent = nextCupStatus;
    el.cupStatus.style.color = cupColor;
    el.spill1.style.opacity = spillOpacity;
    el.spill2.style.opacity = spillOpacity;
  }

  // 10. Takumi Reactive Expressions - Cached state prevents daily DOM display resets
  let nextTakumiState = 'CHILL';
  if (!telemetry.engine) {
    nextTakumiState = 'SLEEP';
  } else if (healthPctVal < 40) {
    nextTakumiState = 'DANGER';
  } else if ((telemetry.speedMode === 1 ? spd >= 100 : (telemetry.speedMode === 2 ? spd >= 86 : spd >= 160)) || (telemetry.speedMs >= 44.5)) {
    nextTakumiState = 'FOCUS';
  }

  if (renderCache.takumiState !== nextTakumiState) {
    renderCache.takumiState = nextTakumiState;
    if (nextTakumiState === 'SLEEP') {
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
      el.dialogueJp.style.color = '#38bdf8';
      el.dialogueEn.textContent = 'ENGINE OFF // SLEEPING';
      if (el.statusDot) {
        el.statusDot.style.background = '#38bdf8';
        el.statusDot.style.boxShadow = '0 0 6px #38bdf8';
      }
      if (el.statusBanner) el.statusBanner.style.borderColor = 'rgba(56, 189, 248, 0.45)';
    } else if (nextTakumiState === 'DANGER') {
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
      el.dialogueJp.style.color = '#ff1e42';
      el.dialogueEn.textContent = 'ENGINE CRITICAL ALERT!!';
      if (el.statusDot) {
        el.statusDot.style.background = '#ff1e42';
        el.statusDot.style.boxShadow = '0 0 6px #ff1e42';
      }
      if (el.statusBanner) el.statusBanner.style.borderColor = 'rgba(255, 30, 66, 0.6)';
    } else if (nextTakumiState === 'FOCUS') {
      if (el.takumiChill) el.takumiChill.style.display = 'none';
      if (el.takumiSleep) el.takumiSleep.style.display = 'none';
      if (el.takumiPanic) el.takumiPanic.style.display = 'none';
      if (el.takumiIntense) el.takumiIntense.style.display = 'block';
      el.takumiAura.setAttribute('opacity', '1');
      el.charFrame.className = 'char-frame manga-halftone-intense';
      el.charSpeedlines.style.opacity = '0.9';
      el.charStateBadge.textContent = 'FOCUS';
      el.charStateBadge.style.color = '#ff9d00';
      el.dialogueJp.textContent = '「集中しろ…！」';
      el.dialogueJp.style.color = '#ff9d00';
      el.dialogueEn.textContent = 'FULL CONCENTRATION';
      if (el.statusDot) {
        el.statusDot.style.background = '#ff9d00';
        el.statusDot.style.boxShadow = '0 0 6px #ff9d00';
      }
      if (el.statusBanner) el.statusBanner.style.borderColor = 'rgba(255, 157, 0, 0.5)';
    } else {
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
      el.dialogueJp.style.color = '#00f59b';
      el.dialogueEn.textContent = 'TOFU DELIVERY CRUISE';
      if (el.statusDot) {
        el.statusDot.style.background = '#00f59b';
        el.statusDot.style.boxShadow = '0 0 6px #00f59b';
      }
      if (el.statusBanner) el.statusBanner.style.borderColor = 'rgba(0, 245, 155, 0.45)';
    }
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

// ---------------------------------------------------------------------------
// FUJIWARA CAR STEREO CASSETTE DECK (YOUTUBE STREAMING & PASSENGER SYNC)
// ---------------------------------------------------------------------------

const STANDBY_VIDEO_ID = 'atuFSv2bLa8'; // Standby priming track so YT iframe and audio context initialize immediately

const DEFAULT_STEREO_VOLUME = 20;

function getSavedStereoVolume() {
  try {
    const saved = localStorage.getItem('ae86_stereo_vol');
    if (saved !== null && saved !== '') {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
  } catch (_) {}
  return DEFAULT_STEREO_VOLUME;
}

const carMusic = {
  videoId: '',
  title: 'TAPE - NO CASSETTE / STANDBY',
  isPlaying: false,
  startSeconds: 0,
  serverTime: 0,
  volume: getSavedStereoVolume(),
  isMuted: false,
  isHost: true,
  currentDuration: 0,
  currentPosition: 0,
  isDraggingScrubber: false,
  videoVisible: false,
  isOpen: false,
  queue: [],
  queueIndex: -1,
  isQueueOpen: false,
  isGuestTrack: false,
  interruptedQueueIndex: -1
};

let ytPlayer = null;
let ytReady = false;
let stereoAnimInterval = null;
let handlePerformSearchGlobal = null;
let cassetteInsertTimeout = null;
let autoPeekTimeout = null;

// Load YouTube IFrame API
function initYouTubeApi() {
  if (window.YT && window.YT.Player) {
    onYouTubeIframeAPIReady();
    return;
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }
  }
}

function handlePlayerStateChange(e) {
  if (e.data === 1) { // PLAYING
    carMusic.isPlaying = true;
    updateStereoPlayStateUI(true);
    try {
      if (ytPlayer && ytPlayer.getVideoData) {
        const info = ytPlayer.getVideoData();
        if (info && info.title && (!carMusic.title || carMusic.title.startsWith('SEEK:') || carMusic.title === 'TAPE - NO CASSETTE / STANDBY')) {
          carMusic.title = info.title;
          if (info.video_id) carMusic.videoId = info.video_id;
          updateTrackTitleUI();
          broadcastMusicSync('updateMetadata', {
            videoId: carMusic.videoId,
            title: carMusic.title,
            startSeconds: ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0,
            serverTime: Date.now(),
            isPlaying: true
          });
        }
      }
    } catch (err) {}
  } else if (e.data === 2) { // PAUSED
    carMusic.isPlaying = false;
    updateStereoPlayStateUI(false);
  } else if (e.data === 0) { // ENDED -> AUTO PLAY NEXT FROM TRACK LIST OR RESUME QUEUE
    carMusic.isPlaying = false;
    updateStereoPlayStateUI(false);

    // Only HOST/DRIVER advances the queue to prevent passengers from jumping/cutting the track early
    if (!carMusic.isHost) {
      console.log('[CAR STEREO] Track ended on passenger client. Standby for host track change.');
      return;
    }

    // 1. Smart Queue Memory: If a guest track finished, resume the interrupted queue track!
    if (carMusic.isGuestTrack && carMusic.queue.length > 0 && carMusic.interruptedQueueIndex >= 0 && carMusic.interruptedQueueIndex < carMusic.queue.length) {
      console.log(`[CAR STEREO] Guest track finished. Returning to queued track #${carMusic.interruptedQueueIndex + 1}`);
      const returnIdx = carMusic.interruptedQueueIndex;
      carMusic.isGuestTrack = false;
      carMusic.interruptedQueueIndex = -1;
      playQueueIndex(returnIdx);
      return;
    }

    // 2. Regular queue progression
    if (carMusic.queue.length > 0 && carMusic.queueIndex + 1 < carMusic.queue.length) {
      playQueueIndex(carMusic.queueIndex + 1);
    } else {
      console.log('[CAR STEREO] Reached end of track. Ready to replay.');
      carMusic.startSeconds = 0;
      carMusic.currentPosition = 0;
      if (ytReady && ytPlayer) {
        try {
          if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
          if (typeof ytPlayer.seekTo === 'function') ytPlayer.seekTo(0, true);
        } catch (err) {}
      }
      const fillEl = document.getElementById('stereo-progress-fill');
      const handleEl = document.getElementById('stereo-progress-handle');
      if (fillEl) fillEl.style.width = '0%';
      if (handleEl) handleEl.style.left = '0%';
      const curTimeEl = document.getElementById('stereo-current-time');
      if (curTimeEl) curTimeEl.textContent = '00:00';
      const vfdTimeEl = document.getElementById('stereo-time-display');
      if (vfdTimeEl) vfdTimeEl.textContent = `00:00 / ${formatTime(carMusic.currentDuration)}`;
    }
  }
}

function handlePlayerError(e) {
  console.warn('[CAR STEREO] YouTube Error:', e.data);
  const statusEl = document.getElementById('stereo-play-status');
  if (window.location.protocol === 'file:' && (e.data === 153 || e.data === 150)) {
    if (statusEl) statusEl.textContent = '[ERR] BUKA VIA HTTP SERVER';
    console.error('[CAR STEREO] File dibuka via file://. YouTube Embed wajib diakses via server HTTP (http://localhost:8080/index.html) atau FiveM/HTTPS!');
    return;
  }
  if (statusEl) statusEl.textContent = '[ERR] VIDEO RESTRICTED';
  if (carMusic.queue.length > 0 && carMusic.queueIndex + 1 < carMusic.queue.length) {
    setTimeout(() => playQueueIndex(carMusic.queueIndex + 1), 2000);
  }
}

function ensureYouTubePlayer(callback) {
  if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    if (callback) callback(ytPlayer);
    return;
  }
  let slot = document.getElementById('yt-player-slot');
  if (!slot) {
    const container = document.getElementById('stereo-video-container');
    if (container) {
      container.innerHTML = '<div id="yt-player-slot"></div>';
      slot = document.getElementById('yt-player-slot');
    }
  }
  if (!slot || !window.YT || !window.YT.Player) return;

  try {
    ytPlayer = new YT.Player('yt-player-slot', {
      height: '100%',
      width: '100%',
      videoId: carMusic.videoId || STANDBY_VIDEO_ID,
      playerVars: {
        autoplay: carMusic.isPlaying ? 1 : 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1
      },
      events: {
        onReady: (e) => {
          ytReady = true;
          try {
            if (typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(carMusic.volume);
            if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
          } catch (err) {}
          if (carMusic.isPlaying && carMusic.videoId) {
            ytPlayer.loadVideoById({
              videoId: carMusic.videoId,
              startSeconds: Math.floor(carMusic.startSeconds)
            });
            setTimeout(() => {
              if (carMusic.isPlaying && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
              }
            }, 500);
          }
          if (callback) callback(ytPlayer);
        },
        onStateChange: handlePlayerStateChange,
        onError: handlePlayerError
      }
    });
  } catch (err) {
    console.warn('[CAR STEREO] Failed to initialize YouTube Player:', err);
  }
}

window.onYouTubeIframeAPIReady = function() {
  ensureYouTubePlayer();
};

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function parseYouTubeId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return '';
}

/**
 * Search YouTube directly using open public endpoints (Zero API keys needed, 100% free)
 */
async function fetchYouTubeSearchResults(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  // If user explicitly pasted a full YouTube link, return it as direct video
  if (q.includes('youtube.com') || q.includes('youtu.be')) {
    const directId = parseYouTubeId(q);
    if (directId) {
      return [{
        videoId: directId,
        title: `YouTube Video (${directId})`,
        uploader: 'Direct Link',
        durationStr: '--:--'
      }];
    }
  }

  const instances = [
    'https://api.piped.private.coffee/search?filter=videos&q=',
    'https://pipedapi.ducks.party/search?filter=videos&q='
  ];

  for (const base of instances) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(base + encodeURIComponent(q), { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = await res.json();
      const items = (data.items || data)
        .filter(i => (i.type === 'stream' || i.url) && !i.isShort)
        .slice(0, 6)
        .map(i => {
          const videoId = i.url ? i.url.replace('/watch?v=', '') : (i.id || '');
          const mins = Math.floor((i.duration || 0) / 60);
          const secs = (i.duration || 0) % 60;
          return {
            videoId: videoId,
            title: i.title || 'Unknown Title',
            uploader: i.uploaderName || 'YouTube Artist',
            durationStr: i.duration ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : ''
          };
        })
        .filter(i => i.videoId && i.videoId.length >= 10);

      if (items.length > 0) return items;
    } catch (err) {
      console.warn('[CAR STEREO] Search instance error:', err.message);
    }
  }

  // Fallback: If network API is unavailable, offer direct search playback
  return [{
    videoId: '',
    searchQuery: q,
    title: `SEEK: "${q}" (Auto-Play Best Match)`,
    uploader: 'Pencarian YouTube Bawaan',
    durationStr: 'Auto'
  }];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSearchResultsUI(results, query) {
  const panel = document.getElementById('stereo-search-results');
  const listEl = document.getElementById('stereo-results-list');
  if (!panel || !listEl) return;

  panel.style.display = 'block';
  updateStereoPosition();

  if (!results || results.length === 0) {
    listEl.innerHTML = `
      <div class="results-empty">
        Tidak ditemukan lagu untuk "<strong>${escapeHtml(query)}</strong>". Coba kata kunci lain!
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  results.forEach((item) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'result-item';
    itemEl.innerHTML = `
      <div class="result-info">
        <div class="result-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="result-meta">
          <span class="result-uploader">BY: ${escapeHtml(item.uploader)}</span>
          ${item.durationStr ? `<span class="result-duration">[ ${item.durationStr} ]</span>` : ''}
        </div>
      </div>
      <div class="result-actions">
        <button class="result-btn-play">▶ PLAY</button>
        <button class="result-btn-queue">+ TRACK</button>
      </div>
    `;

    const btnPlay = itemEl.querySelector('.result-btn-play');
    const btnQueue = itemEl.querySelector('.result-btn-queue');

    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';

      // Smart Queue Memory: Remember current queue position as interrupted to return later!
      if (carMusic.queue.length > 0) {
        if (carMusic.queueIndex >= 0) {
          carMusic.interruptedQueueIndex = carMusic.queueIndex;
        } else if (carMusic.interruptedQueueIndex < 0) {
          carMusic.interruptedQueueIndex = 0;
        }
        carMusic.isGuestTrack = true;
      }
      carMusic.queueIndex = -1; // Unmark queue active pointer while guest track plays
      renderQueueUI();
      updateQueueCountUI();

      if (item.videoId) {
        playTrackAsDriver(item.videoId, item.title, 0, false);
      } else if (item.searchQuery) {
        playSearchAsDriver(item.searchQuery, false);
      }
    });

    btnQueue.addEventListener('click', (e) => {
      e.stopPropagation();
      addToQueue(item.videoId || item.searchQuery, item.title);
      btnQueue.textContent = '+ ADDED';
      btnQueue.style.borderColor = '#00f59b';
      setTimeout(() => {
        if (btnQueue) {
          btnQueue.textContent = '+ TRACK';
          btnQueue.style.borderColor = '';
        }
      }, 1500);
    });

    listEl.appendChild(itemEl);
  });
}

/**
 * Driver action: Play YouTube track via search query or direct link
 * Resolves to a concrete Video ID before playing to guarantee 100% sync across all passengers!
 */
async function playSearchAsDriver(query, isMixtape = false) {
  if (!query || !query.trim()) return;
  const q = query.trim();
  const directId = parseYouTubeId(q);

  if (directId) {
    playTrackAsDriver(directId, `Track (${directId})`, 0, isMixtape);
    return;
  }

  carMusic.title = `SEEK: "${q}"...`;
  updateTrackTitleUI();

  try {
    const results = await fetchYouTubeSearchResults(q);
    if (results && results.length > 0 && results[0].videoId) {
      playTrackAsDriver(results[0].videoId, results[0].title, 0, isMixtape);
      return;
    }
  } catch (err) {
    console.warn('[CAR STEREO] Search resolve failed:', err);
  }

  // Fallback to iconic Eurobeat if network search failed
  playTrackAsDriver('jfKfPfyJRdk', 'Initial D - Running in the 90s', 0, isMixtape);
}

/**
 * Add a song or search query to Track List (Mixtape)
 */
function addToQueue(queryOrId, explicitTitle) {
  if (!queryOrId || !queryOrId.trim()) return;
  const raw = queryOrId.trim();
  const videoId = parseYouTubeId(raw);
  const title = explicitTitle || (videoId ? `Track (${videoId})` : raw);

  const item = {
    id: Date.now() + Math.random().toString(36).substring(2, 6),
    videoId: videoId || '',
    searchQuery: videoId ? '' : raw,
    title: title
  };

  carMusic.queue.push(item);

  // If nothing is playing, immediately play the first added track
  if (!carMusic.isPlaying && carMusic.queue.length === 1) {
    playQueueIndex(0);
  } else {
    renderQueueUI();
    updateQueueCountUI();
    broadcastMusicSync('syncQueue', { queue: carMusic.queue, queueIndex: carMusic.queueIndex });
  }
}

/**
 * Play a specific track index from the Track List (Mixtape)
 * When isMixtape is true: no unseat animation and no cassette insertion sound (same tape)
 */
function playQueueIndex(index) {
  if (index < 0 || index >= carMusic.queue.length) return;
  carMusic.queueIndex = index;
  carMusic.isGuestTrack = false;
  carMusic.interruptedQueueIndex = -1;
  const target = carMusic.queue[index];

  renderQueueUI();
  updateQueueCountUI();

  if (target.videoId) {
    playTrackAsDriver(target.videoId, target.title, 0, true);
  } else if (target.searchQuery) {
    playSearchAsDriver(target.searchQuery, true);
  }

  broadcastMusicSync('syncQueue', { queue: carMusic.queue, queueIndex: carMusic.queueIndex });
}

function playNextInQueue() {
  if (carMusic.queue.length === 0) {
    seekTrackAsDriver(0);
    return;
  }
  const nextIdx = carMusic.queueIndex + 1;
  if (nextIdx < carMusic.queue.length) {
    playQueueIndex(nextIdx);
  } else {
    seekTrackAsDriver(0);
  }
}

function playPrevInQueue() {
  if (carMusic.queue.length === 0) return;
  if (carMusic.queueIndex > 0) {
    playQueueIndex(carMusic.queueIndex - 1);
  } else {
    seekTrackAsDriver(0);
  }
}

function removeFromQueue(index) {
  if (index >= 0 && index < carMusic.queue.length) {
    carMusic.queue.splice(index, 1);
    if (index < carMusic.queueIndex) {
      carMusic.queueIndex--;
    } else if (index === carMusic.queueIndex) {
      if (carMusic.queue.length === 0) {
        carMusic.queueIndex = -1;
      } else if (carMusic.queueIndex >= carMusic.queue.length) {
        carMusic.queueIndex = carMusic.queue.length - 1;
      }
    }
    renderQueueUI();
    updateQueueCountUI();
    broadcastMusicSync('syncQueue', { queue: carMusic.queue, queueIndex: carMusic.queueIndex });
  }
}

function clearQueue() {
  carMusic.queue = [];
  carMusic.queueIndex = -1;
  renderQueueUI();
  updateQueueCountUI();
  broadcastMusicSync('syncQueue', { queue: [], queueIndex: -1 });
}

function renderQueueUI() {
  const listEl = document.getElementById('stereo-queue-list');
  if (!listEl) return;

  if (carMusic.queue.length === 0) {
    listEl.innerHTML = `
      <div class="queue-empty-state">
        <span>Daftar track masih kosong. Cari lagu lalu klik <strong>+ TRACK</strong>!</span>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  carMusic.queue.forEach((track, idx) => {
    const isActive = (idx === carMusic.queueIndex);
    const isPassed = (carMusic.queueIndex >= 0 && idx < carMusic.queueIndex);
    const isHold = Boolean(carMusic.isGuestTrack && idx === carMusic.interruptedQueueIndex);

    let statusBadge = '';
    if (isActive) {
      statusBadge = '<span class="track-tag-badge playing">PLAYING</span>';
    } else if (isHold) {
      statusBadge = '<span class="track-tag-badge on-hold" title="Antrean dijeda sementara untuk lagu tamu">ON HOLD</span>';
    } else if (isPassed) {
      statusBadge = '<span class="track-tag-badge passed">PLAYED</span>';
    }

    const itemEl = document.createElement('div');
    itemEl.className = `queue-item ${isActive ? 'active-track' : ''} ${isHold ? 'hold-track' : ''} ${isPassed ? 'passed-track' : ''}`;
    itemEl.innerHTML = `
      <div class="queue-item-left">
        <span class="queue-item-num">#${idx + 1}</span>
        <span class="queue-item-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>
        ${statusBadge}
      </div>
      <div class="queue-item-actions">
        <button class="queue-item-btn btn-play-item" title="${isActive ? 'Sedang Diputar' : (isHold ? 'Lanjutkan Antrean Ini' : 'Putar Track Ini')}" data-idx="${idx}">▶</button>
        <button class="queue-item-btn btn-del-item" title="Hapus dari track list" data-idx="${idx}">✕</button>
      </div>
    `;

    itemEl.querySelector('.btn-play-item').addEventListener('click', (e) => {
      e.stopPropagation();
      playQueueIndex(idx);
    });

    itemEl.querySelector('.btn-del-item').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromQueue(idx);
    });

    listEl.appendChild(itemEl);
  });
}

function updateQueueCountUI() {
  const countSpan = document.getElementById('stereo-queue-count');
  const badgeCount = document.getElementById('queue-badge-count');
  const count = carMusic.queue.length;
  if (countSpan) countSpan.textContent = count;
  if (badgeCount) badgeCount.textContent = `${count} Track`;
}

function toggleQueuePanel() {
  const panel = document.getElementById('stereo-queue-panel');
  const btnToggle = document.getElementById('stereo-btn-toggle-queue');
  const resultsPanel = document.getElementById('stereo-search-results');
  if (!panel) return;
  carMusic.isQueueOpen = !carMusic.isQueueOpen;
  panel.style.display = carMusic.isQueueOpen ? 'block' : 'none';
  if (btnToggle) btnToggle.classList.toggle('active', carMusic.isQueueOpen);

  // Auto-collapse search results when opening track list
  if (carMusic.isQueueOpen && resultsPanel) {
    resultsPanel.style.display = 'none';
  }

  renderQueueUI();
  updateStereoPosition();
}

// Authentic 80s Cassette Deck Mechanical Sound (from YouTube _ijX6DmYaV8)
const CASSETTE_INSERT_SFX = "UklGRu4YAQBXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YcoYAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAEAAAABAAEAAgACAAAAAAABAAEAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAwABAAEAAQAAAAAAAQAAAP///////wAAAAD+///////+//7//f/9//3//P/7//z/+//5//r/+v/5//j/+P/2//j/+f/3//j/9//4//n/+f/5//z//f/+//7//f///wAAAAAAAAAAAAAAAAAAAAADAAAABAADAAYABwAHAAcABwAIAAUABgAIAAkACAAKAAwACwANAAsACQAHAAcACgAKAAoACQAMAAoACAAIAAUAAwADAAIAAwACAAAAAAAAAP3/+f/5//n/+P/2//T/+P/3//X/9P/x//H/8f/y//D/8f/v/+//8P/y//H/8f/0//P/9f/5//n/+//8//3/AAADAAIABAAEAAYABQAEAAYACAAIAAgABwAGAAoACAAJAA0ADAALAAkACAAJAA4ACgAJAA0ACQANAA4ADAALAA0ACwAJAAYABgAJAAUABQAAAAAAAQD//wAA/f/9//n/+v/5//L/9P/7//b/9v/2//f/+v/6//v/9//2//X/9//6//b/9//4//L/8v/z/+//7//r//D/7f/u//b/8P/0//b/9P/z//H/8f/1//v//v/8//7//P/+/wAAAgAAAAcAEAAWABgAEAAUABYAEgARAA4AEAARABIAEwAXAAwAEgAYABIACwARABgAFAAPAAQABgASAA8A+/8HAAUA//8EAAAA+v8CAPf/+f/5/wYACwAOAP7/+f/9//P/6//i//H/6//t//D/8//1//n/8P/q/+b/7f/3//j//P////b//v8AAP7/+/8AAAsAAAD1//b//v/y//D/DQAeABwAEQAVABYAIQANAP7/+v8FAAwAGwAfACEAGAARAA4AEQAAAAQA+f/4/wAACQARABoAFAAMABwABgD6/+v/8//9//L/6f/z/wsAEwAPAPr/4P/V/9z/y//e/wEAAgASABcAAgDw//D/DAAZAAYABwAQAAoAEAAEAAQAAwDw/+b/5P/m/+X/6v/z/wYA9v///xAAFAD9/+f/zf/U/+H/4f/0/9r/z//9/xQABQAJABcAEAD4/+n////s//z/AgALAB4AKQAkADEAKQARABcAIAAPAPX/BgAEAN7/2f/w////CwAbACkAHgAgACYADQAGAAMAEQAYABIA+v/1/xsAKgAwADYAKwAkAA4AAwDk/8T/wf+1/67/vv/O/7r/4v8TABcA5f+4/9b/6f/s/wMAEgANAP//2v/s/wwAGgA0AAkAAAAjACEAEgAdANr/xf/i/wAAAQDn/9X/3v/t//z/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RQAfAP3/FAAaAC8AKAAeABYACQAPAOj/CgAoACkA/f8UAAQA+/8IAAgAFgARAAAA8//y/+H/7//i/8b/hP+o/77/xf+9/+b/+v8OABEA1P+0/6b/kP+w/9z/2v/T/8f/wf/Q/93/EAAhABUAKwA5AGAASQBAAFEANwAfACoANwBhAGIAHgD4//b/HgASABoAOgAyABkABgDR/+f/BwAfABoAEADz//L/AAD8/wMAxP/O/77/y//6/+L/8P/O/7z/r//N/7n/2//1/8b/yv/P/9T/1//8/wMAAAD+/wUABAAYABMA/f/6/wIABgAFAC0AYwBWAB0AIQBPAGgASAAWAAgAIgAbADEALAD//xUAAwD+/w4A7f8AAA4AAADo//j/+/8GABQALgA8AC4AJgAhAAYA6f/N/+z/9v/J/8X/y//Z//L/BQD0/+z/CAAhABUA7f/i/wMA/P/k/8j/1f/i/9H/3f/u/wsADwDp/7D/x//L/8H/xv++/8H/r/+6/87/3P/9//3/+f8HAAEA4f/d////CAD0//H/BAD+//v/IgAgAAgABgAoADUAQgBGACwANQArACsACwDy/wcAMQAxAB0AEQAZACQAGgAoACcAFQAhACMAEAAIAAEA1//W//n/BgANAAAA9f/o/93/9//y/+n/6//4/+v/DgDw//P/DAAXADwANQAxACsALgAdADgAGwAdACYAOABMAC8AAAD7/xQAEgAPAB4AJgAbABoAHAD3/+P/5v/2/wsAHwAqABAA+//4//L/AwDa/7H/wP/B/8H/1f/Y/73/1//W/9r/uv+5/+P//P8EAAYABQD6/w8AIAAWACYAJAAWABIADAAfAEEAWQBPAEQAGgAuACcAGQBMAEYAPwARAA8ACgALABwACAD7//X/GQAWAAkACAAeACgAEwAaAAwAAQD6//b/CgDv/+T/5v/o/8//y//I/87/0//a/9f/4v8FAAkA///7/+n/0P/V//P/DgAdAAUA6v/2/wsADQAIAAwA9//n/8b/r//C/93/7//n/+X/z//F/9f/9/8LAAYA9//Y/9D/y//r/wMA9v/v/+b/CgAaAB0AGAANAPT/+P/i/7j/zP/s/wEA9//N/+P/+//3//z/DAD///r/6v/+/wQAAAAAAOX//P8XACQADwABAP7/CAAEAAAA7v/P/+L/2f/s/+n/3//R/9//5//Z/+H//P8JACEAEQDq/+P/6v/z/wEADwD9//z/AAASABsAGwAcABMAGQAbAAAA6f/1/wAA8v/6//D///8FAAAADwAUABIAKAA2AC0AJQAKAPj/BQAFABQAJQAYAAkADAALAAkAAQAEAP3/1//J/9X/4P8KABQABwAiABoAIgAeAAcAGwAmABcAAwD4/xkAGwABAA4ADgAhAB8AAgAGAAUABgAFAAEABgD5//X//v/9//f/AwD8/wQACwD9//j/8f/7//n/BQAAAPT/9//y/xMAEgAIAPL/+/8PAAUAAAAOABMAGAAYAAcAGAAgACQALwAqACIAMgAvAB0ADgAOABQAFQAeAC8AHwAYACUAIAAWAPz/8//p//D/CQAMAPr/3f/2/wkAAwAFAAkAAAD8/93/z//g/9r/3v/m/+X/6f/2/+//5P8GABoACgD3//L/7//v/wUA+//+//T/BwAXACwALAAdAAsAFQAkABwACwD0//f/7f/u/+j/6v////7/5P/N/9//4v/k/9z/4v/p/+v/8f/w//f/9f/p/+v/7//l//r/GgAUAAsA9/////z/BQAIAA0ADQANABwAGQAUABYACwAGAAMAAwAQABcADAD3////9v8DAAEA6//7/+3/2//O/7//yP/a/87/yP/V/7f/r//C/8D/wv+9/8f/3f/o/9L/zP/T/8f/1v/v/wYAAAD+/wIAHQAwABsAFwAoAB4AIAAtACgAHgArAC4AOgA/ADEAOQA+AE0ATgBFADEAIgAkABIAIgAjABoAFgAZABUAEwAEAP7/BAD7//L/7v/h/+D/0//M/9X/3P/c//L/8//c/9X/5v/l/+T/8//w//H/9v/1//z/8//6/xEABAAGAA4AGQAWAA8ABgAHAAYA//8AAPv/BAAGAAYAFgAVABwAGQAlABwAGgAgAA0A//8CAPf/+P8GAAoA/P/y//D/8//t/+j/8v///wUACQAPABcABQAEAA8AKQArAB0AEgASABsAEgALAA8AHgAbAAsACAAUABcAEAATABQAEAAMAPT/3//l/+n/5//r/+3/3v/l/9P/0//Y/97/4v/i/9//3f/U/9r/4f/V/8r/yv/j//H/9P/m//3/DAAJAAUAFAAgABIAKAAjABQADwAfACMAKQA0ADAAJgApACcAIAArAB0AFAAHAAAACQALAAgA///6/+z/4f/f/93/2P/Y/8//1f/a/9z/3//j/9n/yP++/77/2P/h/93/2f/X/97/6P/r/9r/4v/z/wEACgALABQAFwAZABQAGwAdABcAGgAdABcAGAAmACYAMQAqACkAHgATAAYAAAADAP///v/3//3/9v/y//n/AADg/9X/4P/e/9//7//b/97/4//r//T/+/8EAAgA8f/5//j/BQAGAAAA/P/2/+n/9P8GAA0ACAADABcAMAAhABwAEQAcABoADQACABIAIQAkABoAAAAGAAoAFAALAPX//f/6//n/5P/q/+f/2//h/+//5f/r//X/9v/4/+b/7P/s/+r/6P/0/wYABQAPAAcABAAVAB8AIgAhABYAIgAdABQADwAbABgAGQAiADMAJQAeACQAEAAbACsAJAAdABQAGAAWAA8AFwAiABoACwAVAAMABQD2//v/+P/4//r//v/w/+z/9f/s//n/AwARAAIA/P/9/wMA/f/+/xYAEgALABIADgAOABAAGAAdABgAEQAQAAIA8P/n//L/6f/f/9//9f/5//z/+//q/+j/4v/x/wAA7P/i/+n/4P/p/+X/5P/r//r//f/7//X/7//3/+3/6v/o/+r/9P/3//L/9v/3//v/AAAJAB0AJAAVAAoADAAOABoAIgAsACoAJgATAAcAFgAYABMAHQALAPz/AAADAP3/+//+//n//P/5//H/9v/5/wAA8P/m/+//AAD8//H/8v/y//H/+f8CAPT/+//z//n/9P/3//f/8P/w/+//9P/x//X/8P/k/+7/8//m/+//7P/n/+//7f/x//3//P/9//b/2v/m/+3/7f/p/+r/3//e/+L/3f/h/+T/3//p//T/9//7//z/+P/7////BQADABYAJAAeABEAFAAWACEAHAAWAB8AIQAkABQAGgAUAA0ABgAAAAAACwANAAAA/v/4/wAA8P/1//r/BQD7//3/7v/m/+L/3v/n//H/6//e/+P/6P/q/+j/4v/m//X/AAAGAAAA/v/8//3//f8QABEAEgAJAAsAFgAcABUAFwAeABoAFwAbACMAIAAaABgAIgAWABMAHAAoAB0AIwAVAAsADgAPABQADgAWAAYACwAIAAQACAAGAAAA9//y//f/8//2//7/CwAHAAAAAgACAAAABQASAAwAEQAOABYAGQAMAAwAFAAaAB4AFgAQAA4ACQAEAAQAAgAHAAIACwAPAAYAAQABAAIA9P/4/woAAwAIAAMACADy/+7/9v/4//7/AAD4//f//f/2//f/CAACAP3/8P/z//H/9f/9//7///8IAAIAAwAMAA8ACgARAAUABAAKAAoAAwAFABAACQAKABAA///6//L/7//u/+f/3//Y/9r/4P/Z/9n/1P/U/9b/1f/d/+P/4//h/9X/5P/r/+v/9P/0//P/8v/2/wAAAAAHAAIA///7/wQAAwABAPz/BwAAAAUADAAQABkAHwATAB8AEAAKAAsAAwAEAAcAAwACAAUABQAEAP//+/8GAP//8v/y//j/7v/v/+3/7v/t//f/9v/5//X/BQAAAP3/8v/5//r/CwAIAAgADgATABYACwARABQAEgAOABIAEgAKAAQABQAHAAUAEAAQAAsABgAFAAsABAD3//b/7f/t/+T/2v/e/+L/2//f//n/9//p/+f/6//r//D/8v/t//T/+P/+/wcABQAQAAAAAgAVACMAHAAcABYAFQAiACAAIwAiACMALQApACQAJwAvACkAJAAjABMAGAAIABAADgABAP3/AwAMAAUABAD3//P/9//0//n/8v/r/+z/6P/t/+f/4//e/+//8P/3//n/9v/6/wIA/P///wAABwADAP3/DAAGAAgACAAKAAkADwAAAPL/7//3//f/8f/q//L/8P/v//T/9//0/+r/7//v/+n/7//q/+z/9P/w/+v/7v/t//f/9P/1//X/+//+//P/7f/0//L/8f/v//j/BAAEAAUADAAZAB0AEQANAAsADgAVAAsADgARABIAEAAVAB4AFwAPABAAEQADAP7/7//v//D/9P/z/+z/7f/x//v/9v/y//v/9//y/wIA///8/wIA//8AAAgACgAMABEAFwAbABUAEgAOAAgABgAGAAkACAASABAAEQAPABYADAAVABcAEwAXABwADwALABAAEAABAAkADAARAAsA///+/wYA/v/y/+r/8P/0//T/5v/w/+3/7f/y//z//v/9/wAA/f/+////CAAIAAwAFQAbAB8AEAAVABcAGgAcABoAFAARABEAEAANAAgAAAAAAAIABgAGAAUAAQAHAPn/9//2//H/7//n/+r/8P/p/+v/6//r/+b/5f/q/+j/5v/g/+P/5//u/+X/5//q//H/8f/7//j/AAD0/wAAAgAFAAIAAAD9/wQABQD+/wgAEAAIAAkADQANAAgAAwABAAEA8v/2//n/AAACAP//AAD5//z/9v/4/wAA+f/w//j/7f/w/+3/7//4//b/8f/4//f/+v/+//n/AADv//X/+//6/wYACgAFAPz/AQAOABEAFAAFAP///P8BAPH/9f/5//P/8/8DABcACAANAAIABwABAPn/+//x//f//f/6//L/+v8CAPb/9v////z/9/8DAAMAAwAAAP7//v/x//r/AgAFAAQA+f/4//v/+v/9/wIA//8FAAsA/v8FAA4AFAASABMAGAAVABEAFQAQAAYAAQACAAAA+//7/wEAAAADAP//BgAIAA4ACQADAAEADQD//wMA//8GAAoADgAFAAcADgAWABYAEQAOAA4ABwAOAAgA/f8AAAUA/v8IAAUAAAABAAgAAAD9/+7/8P/w/+z/6//j/+H/5P/x//X/9//4////AAD8/wAADAANAAYAFQAZAAsAGgAYABgAFQAQABkAGQAVABsACwAIAAQABQD7/wAABQD7/wAACQAGAPr/AAAAAPX/8f/7//r/8f/t//D/6//n/+r/4f/b/8z/wP/A/77/sf/D/7z/zf/c/+v/4v/o/9r/5//+/wgABgD3/+7/7f/u/wYAAwATACEALAAjAAIA9f/4/wcAJQA9ADIAJgAWACsAOgBFAFsAYABcAFcASgA6ADIANABJAEUARAA0ADkANwAYAAYAAAALAAoAEgATAA4ACwD6//v/CwAaABMAFAAQAP///v///wMAHgA/AC4AEADy/9L/yf+x/6n/oP+Z/6D/p/+x/8H/2f/g/9X/yf/X/+n/9/8cACYADwARACEAKwAoAC8AJgAZAAwA7v/S/8H/x//V/+f/5//r/9v/1v/B/83/5//q/+D/zP/B/9X/4//4//n/+f8JAAQA7v/k/+v/7f/a/83/xf/A/7r/vf/F/8z/5f/i/+n/8f/t//b/BQAXABcAHAAgABoAFwAYAB0AJwAoACMAJAAuAEEARQBDAEIARwBJAD0AMQA0ADYALAAiAP//6f/v//z/BgAVABcAHQAbAA8AAwDl/+H/9P/0/+f/8//w/+L/4//U/7j/uf/D/8n/xv/K/9r/4v/h/9v/0//Q/9P/0P/f/+r/6v/p/+v/+f/+/xUAGgAYACQAGgAzAEgASgBKAEsAUgBPAFAAWgBkAFQARQA3ACQA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6P8BAM7/2P/L/9z/DgDo/8L/6v8PABwAJQAsACwAIgAgACMAOwAvADAALAA2AGUATAAzAC0AGQAxAF0AXAAyACYAKAA+ADYAJAA9ACYARABEAAwA8P/1/9j/y//G/8D/q//C/97/uv/B/7T/sP/W/9X/3P/7/wAA1P/X/+L/3f/W/9P//f/u/+//2//M/+z/5v/M/8f/zv8LAAAA9f/Y/8n//v8EABYACADg//L/IABFAEUASwAyACcARABfAHAAaABKADoAUAA1ACIAGQAkACoADAD+//b/8v8AAAAAzf/M/+T/CQABANz/8P8JAPP/5P8OABEAFQARAA4AFQDo/7z/uf/G/8j/s/+1/63/rf+y/7H/s//Q/7//uf/w/+7/0P/j/+3/7f/y/wMAGAACAPL/BgAMAAMA9P/5/wQADwDp/8v/9f/q/+f/7v/+/xYAKwAZAO3//f/w/wEAIgA/AAoA8v8BAB8AFAAgADgAMgBHAFAAXQBaACYAMABPACEAEAAkAAwACwAOAPX/+P/q/87/8//s/97/4//d/9//z//m//L/8f8BAB4ANAAsACYAGQAUABMAAgAHAAAA9/8OAP7/9f/u/97/BwApACoACAD1//P/9P/U/9r/6P/w//v/AAAJAPH/9f8LABYAEQASAB4AJgBFAFQAQgAcABYA/f///xMAKAAiAPP/6f8IABEA2v/m//T/+f8PAOr/zP8bABkA+v8PABYACQAqAFAAKwA9AGAAZQBVAC4AKQATADAAQgAfAAEABgDu//7/1/+//8b/y//s//b/w/+//7H/2f/R/7r/5f8VACgA+/8EADIAHAAAAPv/AQACAOj/8v/z/wMABgDX/8P/wf/L/7b/mv+m/6b/rP/I/6z/uf/M/9H/BQAcAP3/DwAnADIANgAiAEUALAAsAFAAJwALABkAHQAcAAQA8v/r/+T//P/O/8v/pv+T/83/wP/G/9T/t//K/8b/2v8BAAcA9v/b/wMAHAAaAP3/9P8uABsAAAAOAAgAEADY/8D/DwApAPf/+v8aAB8A+//E//n/CgD+/zQAJADy////EwAbAAAADwAMABkALQABAAgACwAfAA0A6P8FAAEAFwAcABwAGQASAEQANwAaACkAQwA5ABUAGwAmABsAGgAKABQA///l/9r/9f/9//H/FQAFAPT/3v/M//n/2f/7/ycA9//m/+n/IAAMAOP/8f/u/wAACQD3/wwAHAD//+7/+f8HAAwADgDy/9z/6//y/wIACADk/+b/3v/q//v/FQAjAAoA6v8LAEAAHwAZAEUAXAA9AEcANAAqADkAIQAdAC4APAA+ACQAGQAgAAoA/v/s//X/+P/6/wwA6P/O/8b/vf/X/9z/4/+9/+j/8v/K/8T/qv/E//H/6f/s//f/6//k//r//P/1/+3/AADw/9z/6v8GABAA2//p//3//f8kABoAHwAXAAAAGwAcABUAHQA1AFgAOQBAAFgALwBDAEsAGQAUABMAJQARABIAAADk/wQADgDh/+r/8v8AANn/0f/i/+r/8P/l////DwD+/wkAEQAqACgAEwAxABkABgAdAA4A7f8DACwA+//6//n/2f/7/+X/0P/c/+D/yv+2/7z/s/+r/7n/tv+6/7//6f/d/8P/3v/n/wsAHAAgACUAAgACAAkALgAMAAwAGQD9//T///8TACMACAD6/+H/4P/5//3/AAD3//P/CwAVAD4AKgAwACAAFQAhAC0ARQBFAB8AFQAXAAsA8v/w/wQA7f/x/+v/2f/i/8v/tP/D/8//r//C/8z/qv+v/8n/uP+0/63/u//V//X/EAD4/xAAHQAiADUAPAAZACwALwAsAA0ADgA6AEMAFwASACAAJwArACYA/f8YAAEA5/////n/3v/j//f/8f/p/+P/BwDu//H/BQADAAkAIwAWADUANQAhAPv/4v/w/woADAAjAAsA9f8AAAgA7f/m//T/+P8DABoABgAWACoALgAqADAAHwA0ADsAIgAUACMAEQAIACAAKgAVABcABwABAPH/7f/g/9L/3//8/+n/3P/U/9P/3f/c/+X/xv/U//D/BQACAAAA4//h/+r/AQAQADEAHwAuACgADgACAO3/4f8ZAA4A8P8IABUAAwABAPv/CAArAB4A8f8LAA4A2v/1/woAEQAnACkA/f/6/xAAJwAcAB0AJgAxADgAMgD+//n/BQD5//r////+/wIAFgD7/+3/DwARAB8AHgASAPn/9f8bAAwA6//3/8n/0/8lABoA8v/8/xUAHAAOAP3/BgAYACUAGgDu/9L/6v/S/7n/1f+//9D/0P/V/+X/r//Q/8n/yf/3/+7/z//M/83/4P/b/8z/vP/r/wwA8f8NAAAA8//g//P/CgACACoAEADw//n/+//v/wEAJQAbAA8AHQAkADIAIwAAAPT/8P8cAAwAHAAdAAMA//8BACcAIQAlABkAIwANAAIAJQAfAAAADgAXAAAABwDz/+j/+f/v//b/+v///+//BgAEABIA9//9//3/CQAVAAcA9v/z/wEA7//h/+D/yv/a/83/4P/q/+f/AQDx//P/1v/K//b/AAARAPL/+//z/+H/4P/J/+7/6v/b//3/BQD7//r/7f////r///8BAPn/EgAKAAgA+v8KAB0A+v8ZAC8ASQBlAGAAPgBHAFcALwA2ADEAHAAbACAAKgA5ACgAEgDz/xkAFgAbAC8AFQABAPH/2f/h//H/AADu/9b/5f/9/+7/6//y//P/7P8KAB8AHAAOAA4AEwD8/wAABQD1/+z/3//X/9X/5v/P/+3/6f/L/+n////5//f/3v/V/9P/9P8VAPT/4v/X////FgAjABMABQAbABYAAgAUABEAAQAHAO7/y/8FAAgA5v/r//3/AADu//3/5P/j//7/DwASACMAHAAtABQAFABBAFIARAAsAFMAXgBtAHAAPgBEAD8ALQArABEA+f/p/+r//v/y/wAA8f/q/+T/xP/O/wUAEwAAAAwAFAACAAQA7P/s//j/+v8/AA8ADgARAPX/NgDM/9X/EwDU/97/6P/R/97/2f/B/7//u/+1/7n/n//d/+H/0f8RAB0A+//1/+7/GABHACIAFgBOADAAAQAgAPP/7P/d//r/UADy/+r/LQDb/wAA8P/D//b/2v/8//P/z//Q/8L/3v8OAAoA2f8VAEMAJwAxACEACgAMAEQAPgAmACQA7/8SADEAAwD3/9j/7f/b/+T//v/T/97/8P/h/9v/1//P/9b/+P/v//v///8XABAADgAVAOn/8f8NABYA7f8AAAAA8P8BAAEA+v/o/93////8/+z/5v/N/+3/AADc/97/xf/Q/+f/7P/r//f/+/8GAOr/+/8dABUAKAARAPr/CwD//w8ADwD9/wIA9P/w//3/9//6/+7/7f/y/+L/8f/+/wIACQD1/wAABQD3/wkAIgAmAEQAMgAbAB8AJQAnAB8AIQAlADAAKwAzADwAFwAcAAUABwAuAB8ADAAYAA0ADgAWAAsA+P/v/+v//f8LAAAAEAAMAPX/3P/W/+b/4v/Y/+f/1v/f/+D/4//d/9X/1P/X/9//2f/b/9X/zv/b/8H/1v/g/+7/KgAfABkAGwAdADQARgBNAFAAWABPAEEALwAfABIACgAeABsAMAAvABQALwAyACIAHwAjACgAEwD2//v/DQD///P/4//g/+7/+f/9/wgA6//X/+r/AgAAAPn/DgDr/+j/BwD9//T/CwAHABkA///3//z/7v8GAPD/5//Y/93/2//B/8j/4v/i/+T/yP/h/+f//v/x//n/CAAJAPn/+/8EABMA9v/x//T/IAA0AC4AMAAXAB0AFwD4/wsAHgAuABQA+v/s//v/9f/w/8//7//v//r/DgAhACMAAAACACIAJwA2ADUALwA6ACoAAwAGAPz/AgASAOz/+//7//X/EADo/9L/v/+r/7//2P/W/8n/v//E/8//5//u/+v/1//l/wkAFwAHAOz/xP+//9X/4v/8/wAA+v8RABgAAAD8/xYAHgAGAAgAEAAgACkAMwAXAO3/0v/s/xYAGgD6/wMADQAZAPb/y//r//3/7P8LACEAGQAkAAcA6P8IAB8A/f/8////FwAkABAA5//R/97/BwD6/9L/6/8jAPX/z//M/9v/+/8MAAAAAwD//x0AMQAiAPz/EwAsAEYAPwBKAEsASwBBABUACQAaAAEAAgABAPj/+P/4/+D/4//A/8//6//y//z/7f8aACwADgAAAPL/EAAbACgACQD1/xMAEgASAO7/8P8FAPL/7v/g/9n/vv+1/8r/sv/I/7T/yf/m/+b/9v/l/+D/+v8bAAcA8v8GABsANAA0ACIADAAYABsAFQAqADoAOgA2ACEA//8CACYAKgAEAOX/2//1/xkAAgAAAOz/6f8TACMALgAlABsAKwAbAD0ARABAADEALQAoAAcABgAGAAwABwD3/+D/0//n//D/xv+m/7b/2P/m/8P/wP/E/7r/6f8DAB8AEQAOABsAHQAnACYADwARADAANQAIAP3/4f/0//L/5f/s/+v/BQD5/+D/xP/M//3/CAAQAAUA6/8qAEUALgAHAPn/BwAfAFcAYABDACMA/v8kAC4ALQApAAIABgDw/7r/2f/E/6b/o/+t/6r/kv+4/7n/1P/E/77/8P8HAAkACwAOABMAEQAPAAkA9f8MABwAJQAVAPj/CAAjACsAIwAdAP3///8AAO3/vv/W/8z/x/8AAAgA8v/o/9v/rP/+/xwAFAArAA4ABgAjABYA+f/u/ygA+f/+/+D/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/v/k//P/DgDa/9n/9P/q/wAACAA0ADEACgAQACkACgD8/w8AIwAsAPD/7v8HABYA///p/wYAEAD4/wcAEQDt//v/EgAVAAEA+f/a//3/GwDP/9b/EAAYABcADwA1AB4A8/89AFUAUQBRAEIAXQBLAC0AGQALABYA4//4/w8A7P/V/8j/vv/Q/+b/7f8DABYA7P/h/xUAKAAPABIAGAD6/wMALwBCAEEAAADk/wMACQD8/w8AKwAHAOX/xv/V//f/5P/m/wAABQDt/9H/CQAlAO7/1v/7/yAAGwADABcAJAAaANj/yf/q/8j/tf/L//z/EwDW/8P/tP/R/9z/8f8UAOT/5v8KAA4A9//o/wcA8v8YACoAEAAOAAIA9v/n/+7/EwDm//n/FgAJAAUAFADs//H/CwAEAO7//f/r/wMAFwAMAO7/AgAiABgAKAARAPj/HwAGAAQA/P/8//H/2P/q//H/xP/H/+f/6v+9/+f//v/G//r/RwAyADwAMwAUADsAUQAKAOH/8v8DAOD/5P/v////AADq/woABgABAAMA7/8aABcAEwAnADIAEAAOABUAHAAtAE4AMABIAFgAJAD2/xgAGADo/93/3//e/9j/nv/K/9P/0v/c/9X/3v/0/+f///8YAPP/1//r/wEAAADu////4//G/8z/8v/e/+b/5v/m/wkA1v/N/9r/5v8nACwANwA3ADEAPAAVABAAMwAQAA0AKAAnABsADAAIAAEA9P/0/9r/yf8CAPf/3P/V/9H/yv+t/+H/9P/8/+j/w//m/xUA/f/u/ywAEwDx/wIAMwAwAA8AKgARABgA6P/f/xEACgAjADsALAAaABQAFwD//wAA4/8jABcA9P8NACkAOAA0AP3/+v8EAPz/6P/j/9r/rf+v/73/9//+/+H/CgAOAAkABwAcACAADwD8/wIABgDo/9//DAD8/+T/NADj/+H/AADD/8n/t//P////KQAvABwASAAyAB4AOABAAEEALQAoABwAHwALAAAANwBKADYAOADp/9H/0f/O/wAA5f/R/+r/7/+6/8H/z/++//j/DQAvAC8AFwBaAHwAXgBIAD4AOQBEAFwATAA5ABIAwv/L/9r/sf+H/4//4P/q/9L/7P8HAA4ADQAXADwAOgAnAD8AVgBRABMA5P80AEUANwBUAFcARwAhADIAEgAvAF4AiQAzAesB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vP+4/7L/xv/a//f/6P/a//f/HgAeAB8ATwBBADoATQA+AC4A+P/h//3/LABDAFoAagBxAE4AJwBCAEUAMAAWAP7//v/7/+//z//w/wIA6//I/9P/4//h/93/3v/F/7n/u/+v/5//rv/T/8//+f8dACoAPwAUANz/o/+Y/8H/u//B/9r/1f/t//L/zv/X/+n/7P8AAAcAAAACABsAUQBoAHUApQCkAJcAcQBDAFMAYgA4ABMAAgDz/97/yf/C/7H/sf/X//7/7//d/9v/tP+z/9L/4f8AAA0AAAACAC4ATABAAD4ALgAzACgADwAIAA8AAAAAAAsAHgAoACAAOwAwAAAA3//I/73/rf+e/6b/vP/O/9r/7v8QAB8ADAADAA0ABgANABQACQAJAAMABwAWAB8AHgARAAIA6f/W/9P/1P/W/9H/vf/H/8//0P/e/+7/BgAYADMAOAA9AE8AWABTAEIALgAoABkAEgApADwAQwAzADAAMAAfAAIA6//r/+3/3P/C/7P/tP+s/7f/x//0/x8AHAAUAAAA5P/b/9T/0//h//L/+/8CAP3///8WACYANQA0ADIAIgDw/+z/3//N/7n/tv+//8f/0P/n//T/CAAbAB8ALAAxADkAMAAdABwADwD4/9v/4P/c/9H/1//h//H//P8CAPf/3v/m//b/AQATABsAKAAtAC8AFQD//xQAHwAfABsAHAAiACQAGwAMAAQABgATABEAFwABAPv/DQALAAoAAgAAAPf/8v/w/+z/3f/N/7b/s//B/9D/3v/z/wkAHgAiABUAFAAcABYA/P/9/xIABQD2//7/DgADAPr/AQD///n/5//Y/9X/y/+5/7z/y//c//z/CwAPABEAGwAnAEkAUgBZAFoAUgA4AB0AAwD//wAA7//h/+H/8f/8/wQAFwApAB8AFwAbAB8AIAAMABQAGAAKAAcACwASACMAJAAWAAwAEAAkAB8ACwACAAMABwD4//T/8P/r/+b/6P/m/+f/7P/l/+X/2v/L/8L/t//C/8n/0P/b/+n/+P8AAA8AGQAPAP//7//g/93/3v/U/8b/yP/U/9r/1f/Y/9v/5P/t//v/BAATABgAIQAgAB8AJwAhACMAFgANAAsABgAOAAkABQAHABQAHgAOABIAEQAOAAMA9//l/+L/8/8NABwAJAAjACIAGAADAPf/CQAaACMAJQAuAC4ALgAYAPv/+//8/wQACgAVACYAGwAAAOr/2f/W/9b/0//N/9z/8v/u//n/BQAIAAAAAQAKABEAFgAKAPj/7f/q/+v/6//7/w0AFAAJAPT/2f/S/8H/wf/E/9////8GAAAACAAbAB0AGwAsADQAPwArAB0ADQAQAAsACgADAA0AFQAWAA4AAwD9//j/9f/0//f/+v/q/+L/5v/h/9z/5f/r//v/FAAhACoAIgAdAP3/5//j/+r/+f8JAA0AFwAZAAUA+//4//z/9//t/+3/+P/3//j/9f/t//D/7//1//b//f8JAAcAAAAAAPH/4P/j/+D/8f///wMA///5/+j/6f/t//L/6//s/+3/9P/q/9f/zf/i//b////4//P//P8EAAQACQARABkAIgAiACIAJQAkABgACQAJAA0AFgAgACQAIAAcABQAAQDv/+r/+/8EABIAEAAKAAQA+v/k/+H/6v/0/wcADgAaACgAMgAeABAADAAOAAwADAAKAAcACAABAAoADgAHAP3/4P/m/+L/6f/f/+3/8v/3//3/+v/8/wkACgAMAA4AEQAPAAoAAQAGAPr/7f/0/wEA+/8AABIABQAMAAMA+v/x//X/AAACAAEABwAPABgAFAAfACUAKAAoACwALgAxADEAHAAWABYADQANABAAEgAUAA4AAwAEAPr/+P8KABUAGQAXABIADQAEAPH/6P/s/+7/7P/s//H/8//y/+f/5P/p/+v/8P/6/wAA9//z//L/3P/a/9f/3v/k//L/9//w//D/7//p/9H/0P/h/+X/9v8BAP///f/2//f/AAARABYAHAANAAIA/f/z/+X/4P/Y/+L/6//y////BAAPABAAEwASABIACwAEAAcAEwAbABEAGQAeABwAHAAXACIAFgAEAP//8P/l/+f/6P/g/9//xf+//8H/0v/l/+7/9P/x//r/8//t//L/+v8EAAYA8//m/+v/8v/j//L/9//2//L/8v/4//3/CwAQAP7/8//s/+j/7f///wcAEAAXABoAIwAbABsAIAArACwALAAjABkAHQAeADMAKQAmACIAHQAaAAwAFQAZABUAGAAYABkADgD+//3/AQAGAAQADQAMAA0ACwAAAAAABgAQAAYAAgAGAAEAAgAFAAUACAADAPH/4//l/9v/2v/j/+3/9v/s/+L/4//l/+L/4//r/+3/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+f8OABMAEAD7//n/9//2////DwAZACAAHwAdACEAKgAhABgAGQAZAA4ABgAAAAYAAgACAAIA+//6/xUAMgAxADkAKQAOAPz/BgAUABoAHQAZABgAFQAHAPv/+//+//n/8P/s/+r/7f/m/+r/8//z//7/BwAIAAoA/f8HAAoAFAAKAAcAEgAaACEAHQASAAgA+f/s/9r/1f/X/9b/2v/c/97/4f/e/+v/9//z/+//9P/6/xAAIwAfABMAAQD6/wMADwAaACIAKAAgABUAEgAHAAsADgAXAC0AMQAgAAkAAwD9//X/+v/z//r/+//p/+X/4P/r//n/CwASAAcA/P/2/wIABgAOACMANQAzADYAJQAjACMALgAtAB0AHAATAA0A/P8CABEACAAAAP3//f/0//f/AAANAAgAAgAAAOr/7//1//T/AAAOABQAGgAIAAAA6v/d/+L/5P/l/+X/6//j/9L/y//G/9D/4P/m//P/9//z/+3/5v/e/+z//v8TACAAGgARAP3/+P/2/wUAFAAbABMACQD7//H/8v/8////+//6//z//f8KAAQACQADAAQABQACAAAA+v/8/+//8P/s/+3/9v/z/+P/4//Z/+D/7v/3//T/7//6//n/+//6//j/+v/7//b/+f/z//L/7//3/+j/8v/s/+r/6f/w/+v/5v/u/+//9//9/wEA+//4//b////+/wQABwAJAAYA9//4//n/AAALABYAHgAeACcAKgAgABwAJgAsACEAIwAhACEAGwARAAUA//8AAA8ACAACAAQACAALAAEAAwAJAAwACgAXABIABwD9/wUABwAVABkAHQAYAA4AEQASAA8A/v8NABEAEAAVABQAFgAPABIAHQAaABoAGAAMAPr/7P/x//f/AAAJAAQA/f/2//b/9f/v/+z/6v/v/+X/6//i/+H/6P/o/+b/6v/k//H/+//z/wEABgADAPv//P8DAA0AAwD7////AwAEAAMA/f8AAAcABQAHAPj//P/3//j////7//n/+P/z/+z/8//u//D/+P/6/wIACAASABUADQAGAAAAAAAJAAsAAAAAAP3/+//4/+//5f/r//X//P/7/+n/5f/k/9v/2//o/97/6P/x/+r/9P/9/wAA+//x//T/7f/s/+j/4v/h/+H/3v/q/+r/6f/v/+f/1//e/+X/6P/w/+r/5v/2/wgAFwAjACgAIwAgABoAEwAaACYAHgAeAC4AJwAdABIADwAMAA4ACAAMABgABwAGAAQA+v8JABIAFAAaAA4ACgAPAAkADwAWACwAIwAaAB8AFAAQAAgADgAYABIAAQADAP3/+v8BAAQABgD7////AAAGAAUAAwAEAPL/8P/q/+v/9/8DAAoAHgAeABoAFwAKAPj/8f/8/wUAAgADABAAAADv//f/CQAXACIAIAAJAAIADwAcAB8ADADZ/8v/9v/+/+//zP/l/yIAcwC2AK8AaAAgANL/h/9j/3b/xf8dAEUASgAuAPv/3v8oAIMAiQBBAML/g/+G/33/kf+9/xkAgwC8AMUAdQA3ADoAOAD5/53/ZP9k/0T/P/+G//X/WwCBAIIAewB6AF0ALgDg/2v/Gv8a/1v/n//j/ysAcQCPAHIAOwDw/6//dv9k/1T/cP+x/+7/GQArABgA8v/k/+H/3//i/97/sP9v/3D/qf/y/z8AfgCNAIgAlgCpAKEAmwCbAHQALQDy/9v/z/+s/3//fv+I/6j/3P/T/8j/uv+8/+H///8eACMAHgA2AFcAZwBqAGgAWAA7ABYA6f+8/53/tP/j//j/6//X/9//AwAMAAsADwAAAOr/xf+f/6f/zP8IAFYAagBoAEoAJgD5/8n/sv/E/+n/AAAEAPP/zv/X//r/FwAuACsAJwAWAPL/y//H/+//KgBWAFcATgBMAFsAZQBjAGQAZABgAFQASAA4ABkAAADd/7f/sP+4/8f/5P/+/wYAEQAgAC0AMgAaAP3/8v8AABMANQA6AC0AGAD8//T/AAAOACUALwA6AEUAQAAiAOz/vP+f/5n/n/+0/+H/EQA6AD8AMgA4AEIARgAuAPz/zv+j/6L/mP+b/63/rf++/93/EQA3AGAAWwBSADgABADb/7n/of+p/7H/xP/C/8b/w//E/8L/wv/E/93/+//9/+z/4v/m/+j/8P/j/97/1//I/7v/vv+7/73/0P/h//f/FwAyADQAKQAVAAcAAAAAAP7/8P/a/8n/uf+3/87/AABCAGgAZwBUAEAAEQDv/8D/pv+j/7D/1v/o/xgAOwA8ACgAEwDr/9//3P/e/+X/9P8PAC4AOQAlAAsA8P/m//P/EQAmACIACwAAAPb/AwAUACIAIgAhABcAEgAYAAMA/f8CAA4AIwApACUAEAALAAkAIAAqADEANQAtAC4AMAAqACYAIgAjACAAKQAmACgAKgAqACoAJgAkAAoAAQD7/wMAIQA2ADsAOAA0ACsADgD+//f/9v/m/+H/6//i/+v//f8BAAYADwAUAB0AGAAHAP3/9//6//j/9f/9/wYAFwAcAA0ABQD+//H/7P/w////DgAYACMAEQAFAO3/4f/a/9L/0//a/93/5P/w//r/+//2/+z/6P/x//D/8f/o/9b/0//c/+j/9P/3/+j/1P/F/8T/wP/B/8v/0f/M/8z/y//Y/+r/+P8DAAEAAADk/9b/zP/G/8T/yv/Q/97/7P/y//X/CgAJAAAA/f/3/+j/2v/N/9L/y//j//L/AAD7//z/+P/z/+7/4v/t/+b/3P/d/93/5v/q//X/AwAOABMAEwAbAA4ACwAPABUAIQAyADAAOABEAEAAOgAxAB8ACgD9/+z/6f/1/wEAEgAhACsAKQAuADAAIwAdABwAEwATAB8ALAA2ADoAOgAxACoAHQAVAA8AFAAYABMAGQAkADEANwA2AEUASgBIAEgANgAuAC8AKgAfACcAKgAoADcALQAqAC8AIwAjAB0AFQAJAAoA/v/u/+3/AQAJABQAEQATAPj/2P/O/8T/0f/N/+X/AAAZACkAGQAYABoACQAGAAMAAAALABsAHwAHAOP/4f/k/+b/6f/2/+7/z//M//X/6f/V/7f/0f8NAPX/2P/M/+b/GgANAAYA4/+v/8j/wP+//93/+/8kABMA3v/P/8X/1f/j//H/HQDv/87/yv/o/wsA6v/L/woAMgAHAPL/7v8CAD0AKwD0/xMAUwAmAPb/6/8HACYAEwDm/9r/FQAEAHn/oP8NAPf/mP9F/yv/f/+z/5L/hv9U/7r/JAD4/wAAIwAiAAcA6f/x/y0AXgBLADgAdQBYANr/CwBXAIIAbQAPACcAKQAtABUA0f/e/8r/KQAmAHD/gP/S/ygAIQBCAGAAMgDk/+//JQD9/7v/oP8WAE8AegB1ACkASQByACEA0f+U/wcAEwAHADwA3P8dADYA5//6/+H/9/8MAJH/z/8nAO7/3f/Z/w0ADwDY/5z/jf/N/xwAwP88/4v/RAALAFD/L//Y/zwAHQDj/xAAEABkAK//CQBpAeMBbv8//oX+gP/H/yD/Mv5rAbQCpwAW/9r/VACcATP/Gf0KAWACiwKw/78AsgBv/lj9uwDRApgCOgG2/Rz+vv6KAR//3/+jAYkEzAb2ANf6D/tyAUsExgQc/1/9A/7m/Jj+awJWAvz7gPwqAIwC3ACM/wIBbwNFAdb9b/7bAvAAvv0d/j4BmACo/lL/uwH+AfL+uv0D/dD9E/72/R4A0QL/ARj9BvtI/eADfQg/Bg4Aqfrg+qr8iv+LAnID8wFm/0D8O/7kAI0AtP5F/sT/KgIqAvEABv5I/f/7O/zw/1sEpQVJBG4CdAA3/kr84P2iAAIDmgJtAI7+sP2J/YH+6AFQBIoCcf7R/Eb+awDT/zD+pf4fAYcBvgCa/6H+U/7Y/6kAXQB0ANIAMf8z/ob+7//PAPoApgCmAC4AY/8X/6T/BP8d/0z/GgHXAc8AVP68/HT/oAI2A38Baf8s/q3+rv51/9//o/+9AOMBzAELAngBbwC+/9sAHgEDAFD/+/9KAB4ACP/L/U79QP5mANkBUgJkAaD/FABQAngCkwAo/gX97f2+/64A1QFqASwAC/6C/lEA7f9z/pX9Wf+BARIDeQJ3AC7+RP1l/qUAzQEQALr+KP9zAGgBpQGq/8H95PyZ/Xz/WALGA2UAuPyT+9f97ADeAfwAPQGCAeIAvwCZAOv/9f5X/v3+MAHWAhICPACi/3EAjgItA9sBiQA6ACEAt/84/6D9/fzv/rkBQgRXBcUCe/5A/RD+Xv8AAMz/pv/V/8r/NP9m/2P/FP+C/9kAzwG4AXQAtf7c/gYAbABYAIT/O/7t/az+4v4i/4v+2/2C/hQADQFwAEYAmgCmAH0AhQBsALQAJgE0AYQB1AEMAjAB1P/W/rf+0v77/jP/v/5Y/wAA0P8t/9P+Bf8r/3H/2f9rADcAcf/e/mr/hQBsAU8BBwF9AFIA0gBsAWIBkwDg/+7/zv92/6P+ef6N/zsATQBFADsAGgBB/6/9e/0i/3QAEgCX/9v/MAC6ANQAlQAHAW4BKAEFATEB8wA0AMv/yv/M/0gAdQB6AKcA6f/b/q/+Df8P/2X++/0o/2kApAD2/8f/2P8NAB8AKwB/AOUAygDAAOAA1wAKAIf/H/9o/7//pf+w/+f/4f+k/xL/pf6n/k7/EQA8AEQALwCf/xr/JP/E//7/JgCMAL0ASwAPANr/KgByAGkAPgCvADoBngCY/wT/Qf+U/ycAMAAmANQAZAHpABMAvf8ZAMkAiAAXABcAWABFABYA6/9QAMIAYAAAAKL/tf87AO0ATgEcAV8A8/8PALb/Tv96/5H/i/8t/wL/zP7c/iD/hP8yAHkAYwDJ/9D/BQAGAPL/BwCXAKMAHwAXAHAAHgDJ/6b/EgB3AKcAoACCAGUAEAD6/3IAjQBYAAYAg/9b/4r/rf/q/zQAEwAwAFAA1f+a/4n/EADiALwARgDy/7z/nf8UAIYA+AAaAc8AWwBMACwAm/9S/4H/yP/7//P/BADJ/9//q/+S/9z/rP9V/2P/bP+D/+v/7f+y/77/GQBjAB0A+/8eACUA4f+m/9X/9v+d/1v/h/8AADMAMwBgAGsADADA/3z/bv+2/+r/GwD6/9f/jf90/wMAvgAHAZUALABdACwA0v/G/w0ArQDqAN8A1QB4AOL/0f8UACUAVQBjAH8AZQA0ACIA8//p/87/nv///+D/cP8w/33/pP8cAB0Asf+p/7b//////73/j/9c/2H/qf8MADIAQAB2AJAAmgCAAAAA3/+r/3n/gv/5/+v/dP9v/7X/lf9z/5T/ov/P/+r/+P+u/1L/ef/D/xAASAACANj/EwCOAK4AyABNABIAZwBoADAAHQADAAYAUgBtAOn/SP99/x4A+P+w/+z/+v8wAD0AfQBnAL//jf8FAFMAXQDa/zP/Pv+8/0UAoAAOADX/rf6//r//oQBdAIz/tP80ANkAHAE1ABkAhf+O/5b/pQDw/8L/XgAdAZcAb//X/vv+f/8oAGsCAQLo/6L/NgAE/+T/FQDr/TL9Wf+LAlICAwAc/+f8l/2l/+8BFgAsAG8AuwBjATEBggCM/2EAvP/I/JgBrQaWAhH/UwE7AWwBYQEIAK3+VP8sAjECfv74/e7/MQHp/sf9rv/d/jT54/iC//EDrwGa/ED3ivqnBV0KIAH/+OL9xgGpAcUB5gIlA3L/I/4HAJYDBQUaAqH+vP7CAIcBpAGzAHH/0QA2/4n96/7LAOMAqP4B/okAAgPOA9kA0vwk/v8BtwIw/8T+RABY/iP+Kv70/wMBbf0A+wP+dwPNBCUCuf5z/eX7DPtG/QQA6f6Q/oUBGgGM/c39/gH2AzYBUQCbAb4Ahf6n/kT/NQIZBHADsQGi/kD+3P5fAMMBTADE/pj/kgKbAjX/nf1nAIMDGQNRAqUD8AIBAKH8B/zM/jABvgBrAdcBdv+f/Af7avvn/b3/wQCtAV4Blf6Q/RUA1AHRAe8DfAXwA7oBXQARAScBI//o/RH+aP7+/97/Lv0z+xL8E/23/WH/1P/w/X/9Xf9dAAYB7gE1AdsAbgGmAAX/DP+TACUBZwGpAZQAIADxAAMAX/7N/jgA5f++/w8AMgCA/07/IQD3AIEBfwH0AOAAowGZAs0BkP8+/oL+0v88AL/+3v1W/2cAtf/S/q3+gf5W/vP9c/1T/jAAsACNAKgAVgAhAFn/d/6m/wQCpgKPAVEAKQClAIkB9QE9AkoC7wBD/5L+cf5K/rL9sf1r/hL/Qv/n/gj+y/3h/t3/XACHAO3/b/8H/+j+wf8sAdgB6AAKANH/9//9/9YAtQGmAfQAPQBGAI8AQwD7/2EA4wDGAEYAZQBUAGkAIgGTAegA+/+w/zoA7wDeAEMAnQCiAZ8BOwGDAV8BzABuABkA8/+IAHUB0QD5/6j/yf+y/yj/nv4T/nb+Ov87/xD/SP9h/9X+bP55/s3+4v6o/l/+p/5H/23/A//N/gD/gv/+/8QAVwGHAVkBEgFsACIAkgC7AKIAvwB1APT/wf+3/7X/FADPABkByADy/2n/c/+0/8z/oP9j/3T/kf+E/2b/ov8MAFAAXQBJADkAbgBbABQAHwCyAP8AqQAeABoADwAwAFQAXABHAEQAfwCvAGoALwAgAPn/2P/j/8v/pP+R/5n/cv+U/xUAcwCxALQAWAD9/9b/nv+P/8H/0P+5/+//RgAZAOH/4//X/+L/1/+C/x3/9f4E/2j/kP+c/7z/7f/3/5P/ev/l/x4ALwBvAJ8AngCwAN0A1gDnANMAwwCcAEEALQAPACcAdgBxAE0AWwBbACoAGAA+AEsAJgDk/9b/rf+Z/+3/EgDs/9j/mf81/zb/jv+Z/zL/+/7c/sz+EP9O/9r/KwASABQAMQCVAJsAdQBoACYAHgAqAC0ARwBCAEEAPQDF/7n/8v8AANz/uP+h/9L/AgAFAB8AJwArACoAUgB0ADMAMgCAAMIApwB0AJ8AoQBKABYAMgBSADAA6P+z/8//7/8AAPv/3f/h/9r/xP+n/5r/yP+y/4X/Zf9X/1z/Z/+A/9r/FQDK/5z/t//H/9D/8f///9X/i/9m/2v/cf+r//n/vP+S/4f/d/99/2D/Uf99/7D/eP+K/7P/sP/F/9b/FgA5ACwAYgC0ANIAtwCEAIgA1gDwANwA7ADtAKAARgAmAEMAgACnAKUAlwCrAJAAbQCqAPIA1QCHAHIAVAASABsAdQCTAGwAQQAkABoAAQDf/+X/EQAcAPD/xP+5/8f/5//P/6z/8P8HANL/5v/6/+b/0P/x/zIAIwAXADsACADr/wwAMgBYAE0APgAiAA0A+f8EACMASgA3ANH/tP/T//L/9P/j/9H/5f/7/8z/w//q/+H/qv+A/4z/r/+3/4H/gv+m/8r/xf/I/+7/BgAYAAsA9v+3/7H/CgBQAEgAIwAcAB0A6//p/wkAHQD7/+v/y//J/8j/sv9u/3L/sf/M/9L/tP/B/9//2f/D/77/zf8BADIAUABLAB8A/v8XAB4AHgATAP//yP+s/7H/yv/Y/+f/1//Z/9z/yv+z/6v/v//e/wAABgDF/5H/vv/P/8T/vf/M/8X/q/+4/7T/rP/b/+//wf+1/9//AAAnACIAKAA1ACIAFgAoABQACgA0ADEA+v/3//b/7v/o/8j/8P/f/47/of/R/93/7P/x/8v/wf/y/xkAHwAwAC8AOQBNAEoARABMAGMAZwBqAHoAegBBABYAGAAqADAARgAuAP3/FABAADsAPAA9AEQARAAsACQAUABoAGQAawCFAIcAZwAiAC4ATQBkAGMAQwBBAFwAQwAlAAAA5//9/xoA6/+l/6r/x//Z/83/v/+W/63/yP+4/8b//P8GAOr/2v/g/8n/tv/M/+H/3//4/wcAIABBAFMAXgBjAGYAXABVAFYAQQAYABkAOwBFACYAMQAqAAcAFgA+ACIAEgA+AC0AFAA0AEQADAD//xgAJAAcAPr/+//4/93/3P/5/93/2f/j/8v/x//Q/8f/wv/C/7//xP/V/9j/2//q//7/FwACAP3/EgDr/9D/3f8FAAMA//8QAAkADgASAPz/2v/I/8f/8f8gABoA+//S/7n/wf/J/9f/z/+3/6j/z//f/+v/6P/e/+v/2v/C/7n/vP/g/+b/3//n/wAAAADu/9v/zf/e/+3/8v/l/+P/+v8rACoACgAsAEgAMwA/AEgAWABUAC0AMABXAFsAMQAOABUABADx/9//2v/3/wAAxP+z/9n/6v/q/8//zv/w/wwA///w//f/FAAkAAgA9f8PACQADgALAPv/8P/h/9r/4//z//f/5f/O/8D/tP++/83/yf+p/6X/t//R/+r/AAASAAQA7P8FACQAPABbAEMAIQAKAAsA+v/x//z/BQAAAPz/AQAOAAoAEwAYABMAHgASAN7/yP/N/8D/yf/n//f/3f/k/w4AHgAmACcAMAAqACsARABGACgABwAHAA0AGQAYAP//5P/o/+P/0P/a//n/AADj/+X/9//z//P/4f/c/+v/BAAKADgARQATAP3/JwBbAHIAQQAaAA8ACAAHAPb/4f/m/+b/4f/4/w4A///8//L/3f/Z/+n/9f/j/9P/4v/z//v//f8IABMABQD7/wsAHwAuAB0AAgAdADkAQgAyAB0ADgAiADIAFwD5/+z/7P/7/w0AHAAbAAEA+f/2/wMAHQARABMAJQAYAAYAEQAjADIAOQAqACAAIQAYAA4AJAAcAAwAFAAHAA4AIQARAP//+P/t/8v/w//X//D/9f/x/wgAGgAJAPz//f/u/+T/5v/u/+X/5P8MACoANQAlAAsAHwAwACMAMABEADIAGQAVABUAFwAcACIAIwAvADwANAAFAP7/EQAdAAEA+/8AAPz/3//T/9v/8f/w/+T/4v/p////AwD3/+z/6//1/+L/4f/m/9D/1f/c/9r/+P///9j/zv/O/+P/+/8IAAwA+v/x//f/5v/h/+f/2P/H/9v/5v/b/+f/6f/V/8L/1P/4/9r/xP/C/8f/xf/A/6j/n/+v/7v/rv+k/6n/of+Q/5f/r//H/9f/y/+q/6b/yP/z/wMACAAPAA0AGQAqAB8AHQArAC4AQwA9ADMAMwAqAC8ARQAzAC0AKgAmAB0ANABKADcAJgAtACQAJwA1ADsALgApACUAHQASABkACQD0//n/AQD2//b/8//n//b//P/z/wAADAACAAcAAwDz/wwAKgAPAAkAEwAsACsAMQA3ACMAGQARAPT/6//q/97/yv/A/8r/xP+2/8b/zP+9/7v/zv/a/+H/4P/y/wEA+f/0/wYAGAAWAAkABQAuADYALAAyAFEAYQBdAFQATwBNAEoAQAA5AE8AagBkAGAAYwBtAIIAeABmAGIAUQBaAFEAPwA0AEMAQgAxACsAJwAnACcAKAAhABYAFwAKAAAA+f/w/+T/xf+7/8P/xv+5/7f/u/+x/6z/n/+W/6j/t/+3/67/ov+m/6n/pP+y/7f/w//e/97/yv/X/+j/+P8IAB8AEwD5//T/9/8CABEAEQAaAB0AGAAWAAwABgAOABIAHwA2ABsACQAKABgAGwARABgAIwAdABUAHAAUAAUAAAADAAgAAgDn//H/BQD+//z/3//V/+j/2f/L/9b/1P/M/9T/2f/X/9j/yf+1/7D/tf+q/7H/uv/I/73/vf/A/9D/4v/m/+j/3v/f/9f/yv/c/+b/9v/7/+r/+P8GAP//9P8IABwAHAAUAAAA/f8LABQAJABAAE4APAAvAC0ALQAvAEkASgBWAEoAMQAyACEAOQA/AB4ACwAGAP7/BgADAAcADQAFAO7/8/8DABAAFwD//+r/8//+//v/6//l/+T//P/4//D/AgAHAO3/3f/n/+P/8f/e/9f/2P/d/+H/3f/O/93/4v/P/9D/3P/x//7//v/5//j/CAAgABYAAQAbAEIAMwAZADAATABoAH0AYAA+AAwAMwBaAGkAZABlACkAFwBdALIAawD6/+r/+v86AGsAXABTAEAAGADk/6f/kf+c/+//PABRACMA+//4/9r/tf/P//X/JwAkAPj/3v8FAPn/hf8x/zP/WP+P/9r/wf9w/03/bv/C/wwADgAKAAIA+f8PAC4AMwARAAgAIwBWAFMAMAAmADgAHgD8//b/JQA/ACMACAD6/wIACwAHAOr/4/8dAHAAewAnAOr//v8qAFgAXABOAEsAQAAiABMAVgCIAEgA3f/P/wwAPgA2AOP/m/+S/6L/q//O//X/5//U/93/7f/p/8r/2P8IACgALAAHAN7/0v/g/+T/yf/X/wAAIwAPAPf/9P/2/93/xv+k/6v/zf/m//f/5f/H/8D/0f/p/wUABAD5/wQANABAABgA8f8UAF0AggBnAC0A/P/p//D/BAD4/+7/+v8NABsAHAAEAPj/7//q/+P/3f///xYABwDj/+D/8P8CAA4A/f/j/+X/4//e/+z/8v/r/wUAFQAmADIAIADq/8X/3P8DAP3/4//U/9D/0f/J/7D/ov+7/8b/xP+//9X/4P/K/7b/xP/z//j/+v8TACYAJwATAAkAEgAHAO3/5v8WAEcAUAAzAB0AIQAgABcAAAD9/+//3f/a/+n//v8JAAgADQASADQAVwBbAEEAJQASAAEAAQAJABAAEgAHAAUACQAEAA0ADgD8/wAAJQAtACoAHAARAAgA6v/Z/9L/5P/9/wgAAQACAAYA/f/2//T/AAAJAAAAAAAWACQAJAAnACcAJAAYAA0AEgAUAAAAAAASADEARQA9ADQALAApAB0A/f/g/87/3P/e/+X/8f8DABwAHQAPAAkACQANAAIA9P/0//D/7v/i//L/BAARAA8A//8EABgAFgAUAAgAFwAcAAsACAAYACEAKAAOAAgABQADAOv/3f/g//P/7v/s/+f/4//U/9D/4f/r/+T/7P/v/+b/6P/d/93/6P/p/+j/8//3/+7/7P/z//X/6P/z/wQA/v/5//n/AAAGAAYAAQD+/wMADAAQABYABQAFAAsADgAQAAIA9f8BAAYADAAFAP3/7//x/wEA///4//L/9P/z////AAD6//X/9P/8/wIAAQAAAP7/BwAIAAcA/f/8//r/AAD3//n/8f/k/+T/+f8DAA4ABgAOABcAEgAHAPf/8f8BAPv/+/8LAAwAAAADAAcADAAKAPf/7P/u//L/8v/4/wsAGgAfAB0AGwAYAAMACgAOAAYACAAGAPr//v/8//z/DwATABMAAAD3/wQAAgADAAYAAAAJAAwAIAAlACcAJAASAAoAAADy/wIAEQAQAP///v///wcACQAQABIAFwD8//v/AgALAA0ACAAEAAAA+P/y/+r/8v/8//n/+//n/9j/3P/h/+P/4v/q//P/+f/z//P/6f/l/+v/6f/q/+b/6P/s/+X/6f/o/+f/8f/7//b/+f8AAAIAAgAOABoADAAJAA4ABwAKAAIA/P/3//r/9f/w//L/AAAJAAMABAAFAPz/+v/2/+v/5f/r//P/BQARABIAFgAYAB0AGAASABMAEAAZABYACgALAAoACgAIAAMADwASAA4AFgAfABkADgAMAAYADgAfACsALgA4ACoAHQARAAcA/v/x//L/6v/k/+z/7//s//n//f8FAAoABQAHAAAAAQANABIAEQAQAAgAAQAAAPr/+P/5//D/8//7/wEACwAAAAUADQAFAAUABQALAA4AEAARAA8AAAD6////AgAFAAMA/P/4//D/9P/2//P/9P/w/+n/5P/i/+D/5f/q/wAA/f8DABIAGwAfAC0AOgAuAC8ALgAtACkAHgAYAB0ABgDx/+H/3//o/+X/1f/S/9T/3v/b/+X//v8BAAUA+v/e/9v/7//7//f/+//8/wQADAD3//D/6//v//D/+//8//D/z//A/7X/r/+4/8H/zP/P/9z/4//k/+r/6v/1/wQADQAFAAkAEgAfADYAPwBAADcALwAmABwAFAD+//L/4f/b/+L/1P/f/9v/1f/d/+v/9//5//D/9/8DABsAHQAUABMAFAARAP///f8HAAYACgARABMAAgD1/+3/3P/d/9v/3f/i/+D/7P/5//b/9f8LABoAFQAcABcAGgAmACEAJwAqABwAIQAjAB4AEQAMAAgA/P///wAA+f/+/wkABgAMABoAFwAQAAYA///3//7//P8AAPz/9/8AAAMAEwAPAAMABgAUABQAFwAiABsALQAwADEAMwAfABAAGgAiABgACgAFAAEA/f/u/93/0//g/+7/7//5/wEAAgAIAAYA9////wAA+f/2//n/CQD///3/+f/6/wkAFwAUAAYADQALAA0AEAARABcAGwAiABgAHgAdACAAHgAYAB0AGwAfAB4AJwAhAA4A/P/4/wEA///4/+v/7//t/+T/4P/s/+T/2//e/9n/2P/W/97/3P/P/8n/wv/C/8P/yf/F/8j/3//3/wAABQADAAwAEAAHAP7/+//7//f/9P/5//L/5P/X/9v/4f/g/+L/4P/m/+3/7f/3//z//v/9//v/8v/v//v/CAAQABAAFAAYABYAHQAbAB0AGgARAA4ABwD///z/CQAIAPn/AAACAAQAAQD+/wEA+f/9/wYADwAMAAcA+//u/+7/7v/s/+f/6v/x//L/7//x//f/+v/7//b/9P/8////BAAEAAcAAQD7//P/7v/2//n//P/2//j/AgANABEACwAPABEAFQAUAA4AAAABAAUACwALAAcA/f8GABEAGgAVAAgACgAJAAsAAgAAAAYABAAQAAoABAAGAA0ACAAFAAoAEQAXAAQACQD9//r//f/0//b/8v/p/+X/8P/x//7/+/8AAAQABwAPABMAEAAWABcADQARABEAFQAUAAcAEAAXABAADwAOAAoADwD+//j/9/8AAPf/8f/y/wUABwAFAAMABgAIAAsACAAQABMAGAAWABMAHAAcAB0AHwAaABUAFAATABMAFAAOAAkACQAUABEADgAAAP7/+v/1//T/9P/t//b/7f/s/+7/8P/x/+v/5//s/+3/5//t/+j/5//v//D/7f/4//X/7//1/+7/9P/6//b/+v//////BAD//wEABQADAAQAAAAFAAEABQAJAAsADAAJABEAEAAIAPz//v/+/////f/0//T/8P/x//z/7//2//v//P///wQAAgAAAAwAEwARABQAFAATABoAHQAbABcAHgAbABQAEQAOABEACgD+////AAD1//H/7P/w/+7/6P/e/+j/7P/r/+b/6v/s/+7/6P/f/+P/5//l/+P/5f/u/+f/6//v//P/5P/t//D/8v/u/+r/5v/q/+3/6v/r//P/7v/2//f/+f/w//L/8//3//r/8f/3//z//v/7/wMA/P/7/wAAAQAHAAcABAAMABEAEgAbABQAHAAVABEAFAAPAAYAEQAYABAAFAAYABcAEAAQABAAFgAXABQAEQAOAAgAAAAIAAkAAwASAAcABgAEAAcACQALAAgAAAAFAAYABAAFAAgABwALABAADAAIAAgADAAHAAAACAAKAAAACQAGABAACQASAAUABwADAAAAAAD+/wUADgAcACcAEADx/93/4//3//L//P/9/wMAHAArABYA9//k//H/AQAHABoAHQAMAOn/y/+u/8b/p//d/x4AMAAlAAwA8//r//r/IAA+ADUANgAoACgAHgAdAPX/0f/F/wAADQAJANn/zf/A/+L/+v8uAFAAYQAeAPv/4v/o/yYAMAArAD4APwAwABQA5v/H/+n/8//n/wMABgASABsA0/+i/7f/q/+u//L/FgAKAPj/2P/l/7//z/8EAOD/vf/E/wAALwBGADEAHAASANP/h/+R/9z/1//e/xUA3//V/9T/Zv8s/xQAKACTAYYBpf80/0oAtv8E/k7+ZgD3AT0BIQG7AcsANf42/38AqP6R/e//8QEAAP/9AP8dAq0BUP70/a7/Wf+o/sEAEgF/AMX+SQAmAmsA6/7wAC8DjgDI/iH/9P60/xcAav/W/9L+4f0z/ykA5ACQAGEBuwA9AHoAn/+gAI8AjP5t/nf/pgG4/97+FAI4AkYA2/6pAAICYAJyAIH/LgBV/2j+wPym/toBxwLAARAATP2N/Vz+1v8XAZACbgKBAfT/jv9m/kH9Uf3LAGIBzQFiANIAZgIp/8L9nf3B/TP+GAL6A7sCCQCj/ar9Ff9LAVgCnf8iAAcBBQAV/of+QwBUAn0Bp/5e/Z/+DwB3AMABgP6p/jsCigL0/zYB4f/1/jb+eAG9AscBdv7o/ZQAbQL2Ao8A3f8aAGwA3v/I/eT94v9RAOsAoAEv/zT+/wC3/zv/U/+u/e0BxQNn/xX+3/ly/6MPkvLRA0gJM+6ACqH5DPwECtn4sArB/88K1O+B+jv/xvfE+6sELBRR9HH+vwWzACTzyf+jA9f6pAKjB5wGGwFhAjUCaPnW+kfzqwZJBEcCdQhoB60OTQl+4XDxgPn5/fr9xQQrEH0SHPiH/A0AWQe2+TLu8ga6BT0FPQLFABPuufPgC6Lsu/G+BXEOTQoA91YCkQS3/FLy8/ixANMCsA2SBTD9gQHyDRIC+ft69csGNv1/6awFYAlsDccNLweA/bT4tgVCB2P6o/aGCZMJIvyw8xD/2gh9A8X/QgAnDPQBkAUoBxL+WQGp+Ef4oveB92H/rAS2+/MEiwd19JP9rALh/mz+sfkv/kH/o/d+/vYBH/mU9nb86AAK/3MFJAk6ABv30fiFAdIGDAQNB1UIIAt4BkYDzQIy8qLu/PUzAhkAoPvu+4v4kvhr9lL+9QTnAKoCFATlA5kElAdrAiz8Ef8ZBIABswLIAu/+ogHiAoMAk/+v/PP6lQA9Av/8F/3c/Dv4sfq9AZwFiwRUA2z94PzeAzcF6f9F/jIDigWXBScEjwG1/o39Q/0sATcB6P87//X/r/08/H8BNwUI/1/7J/v2/AX9tf3E/or+MAF3A67/Ef4M/zICPQWrBk0GbwLJ/YL/vAVxCHQFdwMIAxgDZf/cAXcHBQNh/Z8CvQP4AGUANP2f++T7B//8ADv/lf0e/TH9NPwA+hj6Evqt+AT/GAU+BXcAKwCpAC/8gvyR/bP/+P3Q/o8Azf3i+tP69vyC/xUBbP9C/yn/D/+j/67+4vye/FIAtv85/Rz/ZwF7AZL+4Ptw+Qr8wwAKA+UEmgJSAQoBngKYAZUBvgMPA6kDcAI1AqABYgGCA8UCHgHU/xb/3QBPAsgBgQF/ApIAi/3Y/CH/MP7U/dn+zv9MAjcAEf6X/wsAIgEBAGT/Ef+w/kL/2v9PADsCywNcAjgA5gBB/2b+WP72/iECuQMNA0EC7AKcAxkE/AKBAjYBFQARAUgAtP/U/UL+V/4F/a/8b/0F/nn7WfyG/iT+YP/K/6EA2v99/pj+dQCiAFwCswRdBJcDKwMhBKkEpgJ7AWoA/QARAZsCyAIYAsEByP8+/8P88/rQ+xr8k/ss/Ef/Hf/c/cX+JP5w/Un9Lf7m/oD/ev9K/0T/z/9Q/2cAHgGXAHQAOAGkACcA8v8HASEAh/57AAsB4QGlAfAAcwGgALkBVQFVAB8BZwEGAdD/AQCbAR4Bwf/m/rX+Pf7S/nH/nP9A/4P+hv5w/xQAuwAkAU4Amv89/6EAbAHe/6oAuQBV/zUA4ABi/zj/W///AEoBrwC/AZYBd/8PAL7/2v6D/yP+Gv+F/8b+Fv/7/bP88vw3/Vr9xfwK/YL90v3d/Vv9Gf7R/b/9xf14/gn/sv4s/1r+Xf/7/5b+Df8s/zj/Pv+S/8UAcgDH/jL/uv9EAFUB+wDmAJsBEAFgAmUBAwHhAZABowFlAcUBMQFAALIAhAFgAvYB/gHJAYAAfwDKAFQBEwAl/vT+FgArADcBRwIFAxcCYwHcAW8BdwDdAFQBbQAYAKkAoACTAHT/RgB6ARwBHQLxAoYBSwBTAb8BtQAbAMwBHALQAa0BKQEpATEBUgCq/6r/SP9c/hv+kv/X/j//0P9C/3f/1f8l//D+p/7I/vP+y/65/zgA/f9SAGQB2wEKAvMCcgHqAKv/Nf+z/7r/hv9W/7H/rP8E/xT/iP6h/f797/74/on+rv7p/XX+l/8AAAj/Ev4V/y3/g/9jAGsA6v4q/7AAAAH8ANQA/wFkAiUCHAJdAfgAGwFSAWMBlQAw/8T/lwACAJEAcADo/9P/EQBVAL0AhQCR/pH+P/85/zT/rP6//qP+Rf8b/7n+Ov59/bz+m/64/eT9Jf2M/dP9BP6V/S/9vf0y/j3+f/7l/qz+h/+I/yf/n/+2/x//ef+m/zAAsAAaABUAEAC7AFsBeAD5AL0AEQEcAcAAVgCR/1//2v+4AJIAWwClAGoAzgCdAOIA8wDzAA0CRQLsANMAWgJdAuoB4QHCARAChQFFAZkB/QB3ALz/ov8y/0H/mP/7/uX+K//x/l7++f1Q/kv/Cv8J/5/+l/9N/87+i/7w/gf/d/5i//X/M/+i/3gA7P/M/5H/f/+R/y7/Gv9s/yz/uf+cAM4AqQCcAJUASwHvAEABFwLfAbsBPQFpAPr/NgAYAbMARwAxAY4BVwJ7AccArAG9AQcBRQDFAKcAkwAEAaEA9wAgAdIA//9wAPoANgFAAQEBzwC2AHYAZgARAD8As/9r/0gAMwCHAN3/JwCZAHMAu//p/yj/Cf+S/+T/BwBSANP/ov/Q/5r+s/5l/8X/0f8AAIUAJQAr/77/gf9c/y3/rv/J/5X/CwA1ABQAQP+8/uX/GwBUAJkATAHyAOj/vQCSAML/BgB5AEwARQDKAMQASQAIAA0AQP+T/lv/lf8AAMj/pf/t/5D/S/9//xgAz/+3/43/uP+v/5L/Wf9Q/yT/c/6I/sf+Cv/z/p/+Af8a/23/zP5w/tn+of+e/yf/xf8jAJz/EABRAJkAqQAQAB0A9P8mACQAZgC+/6v/SADh/4n/vf8f/1z/O//7/vH/NwCt/9D/0v+S/+H/vP++//z/AACJADMBRwHeAAYBNwEWARUBCQGCAfsAowAEAbkAHgDP/1AATgBbAEUAdgBUAEoAIABnAL4AmwD2/wAAOwDf/+L/EwAz/xf/LP9Y/7v+rP7W/o3+rf5R/n/+ff5p/vT+C/8q/wr/lP6t/v3+Dv8u/8v/Ov89/3j/yP97AIgA8QArASABfQD6AKABnAGrAWQBZwFWAQABAwExAXMBCwGkANMAlAB8AJ8AuQCMAGsAaACcACgAQgBBAQ0BuACwANQA/QD0AMcA7ACOAE4AOwAIACAAZQCHAGwA0f+s/5X/gv+T/47/V/9i//r+lv4J/4f+l/7o/un+NP/d/jX/Nv+g/4P/UP9u/zD/YP80/3P/kv97/5f/H/90/5T/t/8OABIA8P+T/8j/PAAZAKX/mf9s/x4AKADl/9n/yv/n/zIAqgAzAWIBFQGcAKQA6gDUAPUANQFSAQMBJAFKAVwBBwHNANkA+gDnAIkAUwCMAFIAggB5AFQAQQDsACEB5QCLACYAAAAoAEcAoQAzAMj/GwBSAKL/g/9M/xD/Mv8c/1X/mf+M/xL/Jv8i/7H++/5Y/xv/Ev91/+r/cv8//xr/Bf/C/g7/v/8C/xn/TP+o/7z/iP8JACcAFAACAP//WgCu//b/eQC3AH4AfgCmABcADwBxALMAZAAHACgAvQCpANMAnABzANAAggDkAIkBYQFeAaAB7QGJAVsBFAGqALoAvQCeAAEALQAwABIAvv9+/2j/Ov8Y//H+HP9h/yj/w/5I/wr/n/7s/tj+zv7+/jb/2P7W/gD/4f5E/wP/CP81/3n/e/8c/5z/ef+j/+3/6P8WAH7/vP+9//7/ZgBJAPX/MQCoAKIAkACnAGIAJwD6/xcASAA+AOj/JwATAK3/tv/W/+n/3f/R//D/0v+r/5P/rf+Q/9//v/+K/+z/KQD9/zAAGQCt/83/5v+2/xMA7f/0/ysACQDX/6j/DQAdABoA9v/V/xUAEwAAAAIAJQASAAoAXQCLAKwAQgBhAH8AQACwAJsASgAxAEEARgAnAFEADwAbABAAQACTAIwAjgBGAD0AcQBWAEEANwCmAJoAyADTAMYAnACZALoAbABOAKsAigCoALsAqABuAA8AZABiAFQAawB6AGUAUwBRADYAEAAiAEcAJgBpAAkA+f8HACYADgCi/9j/pv8s/1v/vP/0/5r/qf+3//b/nf9t/4L/Z/+U/8r/6f/8/7X/rv+2/9j/uP/m/ykAQwBjAFYAPQB2AHUAKQAaAFoAHgAwAAIAGwBEACsA8/+w/+H/+//h/8H/y/8QAMb/q/+Q/4L/zv/r/+j/xf/k/xUAvf+X/5D/uv/b/+D/wP/M/wAAFgAcAAcA5P/n/wkAEgDg/93/4P8HANX/1v+3/1H/aP9q/5H/ef+G/4//I//p/vj+iv97/wz/LP+W/4X/b/+S/53/VP9C/3j/ZP9o/3f/eP/E/6T/wf+S/4X/0//Q//T/4//z/xMANgBDAPr/5f8TABwAHADz/7r/i//K/8b/z//d/77/3P/V/7b/qf+i/xYAxf94/4j/o//2/+P/HAAkAB8AMwAtAGwAnwB1AHgAbwBxAF0AWgCHAG8AfwCSAJAAjACWAPoAFwH3APYABAGsAKEALAE/ARMB6ADfAAoB9gBYAR4B2ADNAAEBMgHAAIYAjwCCAH0AwADNAKEAawBlAFsAJQAwAEAAJAAKADgAOQDt/+D/y//A/7n/l/+g/6b/nv/U/9v/v/+X/1r/b/+u/3f/i/+q/8z/uf/j/9//sf8LABUAy//x/yMAEgAZABIAHAAnAAMA2v/3/wcAEQDq/+n/+P/p/+P/x/+f/8b/2v+y/7f/qP93/1H/jP+q/3L/Yv9m/2b/SP8e/0T/eP9q/5z/o/+Z/6T/jv+P/8P/sf/b/73/sv/J/+P/zf+J/47/bf+a/+P/GgAuACEARAA6AE8AWAB2AFoATAA8ADUARQAuAAUA0v/t/wsAKABTABoAMAAMAOX/2v/L/wkA8v8aACcAHwAZABoAIQAdAC8AOAAIALz/3v8GAAAABwDu/9//4f/v//3/3P8JAOj/3f/v//H/+//s/8n/5f/w/wQAJQAcADEAAwAPACoANQBEAEIAWABjAEMAewCYAJgAkwBaAG8AhwCbAJkAhgBXAEwAIAASADgANgAqAB4A+f/f/9D/2/8HAOn/qP+v/7n/3v/z//b/0f/R/+D/5/8OAPr/3v/u/+X/+f////f/tf+2/97/7P/v/+P/+f8EADcAHwABAAsAGQDs/wAATAApAPj/6f8EABIAPADv/7T/1v+1/9n/5f/Q/8v/qv+v/4L/oP+u/4n/lv+o/9v/zP+4/6H/2v/o/9X/yf8OAEIAFQABADkAPwAoAAAA5f/+/wMADwAMADMANgA6ACQANwARADkASABHAGYAVAA2ABMAEgAVAP//IAAMAAcAEgAzAGAAPgAXAPb/6v/l/+D/xf/U//j/5v/2/xAA/f///xEAJAApAAMAAwD6/w0ANQAcABAAAAAjACYAJAA+ADYAGwALACIASAA4AP3/9/8KAPT/+v8fABIACQAuAB0A7P/u//P/BQD1//X/7v8GAOz/6//k/9n/4v8WACoA9P/z/+n/yv+4/8H/9v/2/+7/6/8AAB4AGQAXAAwAGAA+ADwATQBWAC8AUwBNABAAJQA3AE8AWABGACUA+P8AAAkA+P/6/xIA+f/w//H/9v/2//D/8v/s//7/+f/x/wQA+//Z/+//AAASAB4ALwAPAOX/2P/K/8L/4//w//j/CgD0/9n/3f+4/6v/vP/k/87/zv/4/73/q//H/8D/vv/P/+L/9v8AAAsA5//G/8z/1//u//z/+f/k/wIAAADs/wAA0f/K/+j/7/8OAAkAFAAEAOj/EAASAAUADwAjACcALwBAADsATQBEACwALQA7AEEAPQA4AD4AOAAUAAYAHwABAO3/8v/l//H/7v/s/9j/yP/V/9D/sP/J/8f/wf/V/9L/wf+f/7z/1P/Z/9f/+/8VAAQAAwDi/9P/vf/D/+L/3/8AAO7/CwDj/9r/CQD1//P/CgAhADcAKAD1/9T/5P/5/+v/9f8FAAgALgAqAAoAAAD//+z/1v/i/wYADwAdAB0ABgDl/+f/+P/5/wgA///6//3/KQAWABwAPAA9AEAAZQBVACIALQBcAG0ATgBNAEkAFQASACIAGAABAPP/7f/g/wcABQD5/wAACgDz/+X/9v8XADUAQwAYACAAMQAcAPX/AAAxAB4AJAA0ABAAKAAwAC0ADAANABEA+f8ZAEYATAAoAPD/7v/z/+7/8f8NABwADwAAAAAA2P/M/9v/0//J/8//7P/D/8D/z//E/6r/nf+9/8r/xv/J/7z/xv+2/57/qP+5/9T/xP/F/9r/5v/Y/+b/5f/m/yIANgAhABwAMAAiAAEA6P8HAB8ALgARABcANgAjAA4ACwAbACoAJAAvAEEANQAoAAgA9//r/wQAFwATAB8AHgALAAoA8f/g/+L/5/8AAN3/0f8CAO7/6//8/8z/4v8SAPP/BAAeAAcACAAUANv//P80ACwARAAuACMAGwAQAB4AGgDo/+//JwAEABAAKwDz/+L/8P/i/+/////d/+X/6v/r/+7/0v/N/+v/5v/Z//r/x//g/wkA5P/7/wAA8f8KABAABAAmAB4A+P8AAA4AHgAsACIASwBZADMAHgAmACUAKwAwACIAHgAXAA4AGQAnABMA8f8DABsAEgAYAAoA8//7/+T/1P/z/8T/tv/u//L/9//i/+z/3f/j//b/8P/m/+v/DgD5//D/AwDx//v//v/Y/9T/+//y//7/EAD+/+///v8IAPv//P8MAAgAIQAcABEAEQD4/+r/CgAMAA0A/P8KACAACgAJAAkAAADz//z/DgASAAUA3f/Y/97/7v8NABAA//8LAA4ABwD+/9z/3P/j////GwAjACkABAAAAOv/3//j//j/9v8AAAAA+v/j/8H/2v/0/xMAHwAlACQA+//n//P///8BAAsAKwBCADIAHQABAPD/+P8aADEAIQApAB8AEAAMAOj/2v/m/wMADAAHAAAA8//v/+7/8//2//v/BgADAAoA/f/2//L/AQAKABIAFQD3/+j/AgD4//3////v/+7/8v8JABEABwAIAO3//P8DAAIADgDu//z/8f/p/+//1v/l/+7/3v/n/+f/5//U/+//AQDj/+b/7P/x////AADi/9r/0//O//L/DgARABgABQDu//v//v8MAAoAAQAXAA0ACAAIAAkAEAD8//n/DAAdABYADAAUAAAA9P8HABEA/P/6/wwACgAJAB4AJQAhACEAEAAJAPj/9f/r//f/DwD///j/7v/s/8//1f/n/9r/6P/p/+X/9//X/+L/7v/v/+z/6//m/+3/7v/k/wUAAgAKABMAFgATAA4ACQD+/wUAFwAbAAYA8v8MACEAGAAIABQAGgAcACEAJQApACkAQAA0AC8ALwAsACUANgA7ADcAPAA0AC8AJAAKAP//FQAOAAYA+P8EABYA/v8UAAYA7//p/+j/AgAJAAgA//8BAAQAAgAHAA0A/v/z/wIAEgAcACIAHwAQAB8ADAACABAACgAHAA0AFAAPAA0A6f/5//X/6f/y/+7/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";

let cassetteSfxAudio = null;

function playCassetteInsertSound(silent = false) {
  if (silent) return;
  try {
    if (!cassetteSfxAudio) {
      cassetteSfxAudio = new Audio('data:audio/wav;base64,' + CASSETTE_INSERT_SFX);
      cassetteSfxAudio.preload = 'auto';
    }
    const vol = (carMusic.isMuted ? 0 : (carMusic.volume / 100)) * 0.85;
    if (vol <= 0.01) return;
    cassetteSfxAudio.volume = vol;
    cassetteSfxAudio.currentTime = 0;
    cassetteSfxAudio.play().catch(() => {});
  } catch (err) {
    console.warn('[CAR STEREO SFX] Sound failed:', err);
  }
}

function triggerCassetteAnimation(onReady, isNextTrack = false, silent = false) {
  const cassetteEl = document.getElementById('cassette-visual');
  const viewport = document.querySelector('.cassette-viewport');
  if (viewport) viewport.classList.remove('cassette-empty');

  if (!cassetteEl) {
    if (onReady) onReady();
    return;
  }

  // Silent mode for passenger joining in-flight song (no animation, already in bay)
  if (silent) {
    cassetteEl.classList.remove('cassette-unseated', 'cassette-seated');
    if (onReady) onReady();
    return;
  }

  if (isNextTrack) {
    // Option 2: Cassette slightly unseats / pops out (3px)
    cassetteEl.classList.remove('cassette-seated');
    cassetteEl.classList.add('cassette-unseated');
    playCassetteInsertSound(false);

    // Swap track info halfway through the mechanical release
    setTimeout(() => {
      if (onReady) onReady();
      // Firm mechanical push-in / seat
      cassetteEl.classList.remove('cassette-unseated');
      cassetteEl.classList.add('cassette-seated');
      setTimeout(() => {
        cassetteEl.classList.remove('cassette-seated');
      }, 250);
    }, 120);
  } else {
    // Initial insert from empty bay
    playCassetteInsertSound(false);
    if (onReady) onReady();
    cassetteEl.classList.remove('cassette-unseated');
    cassetteEl.classList.add('cassette-seated');
    setTimeout(() => {
      cassetteEl.classList.remove('cassette-seated');
    }, 250);
  }
}

function updateRoleDisplay() {
  const roleEl = document.getElementById('stereo-role-badge');
  if (roleEl) roleEl.textContent = 'AUTO REVERSE';
}

/**
 * Driver / DJ action: Play track and broadcast to vehicle cabin
 * @param {string} videoId 
 * @param {string} title 
 * @param {number} startSeconds 
 * @param {boolean} isMixtape - If true, track transitions inside existing mixtape without cassette eject/insert sound
 */
function playTrackAsDriver(videoId, title, startSeconds = 0, isMixtape = false) {
  const isBayEmpty = !carMusic.videoId || carMusic.videoId === STANDBY_VIDEO_ID;
  const isNextTrack = Boolean(carMusic.videoId && carMusic.videoId !== videoId);
  const needsInsertSfx = (isBayEmpty || !isMixtape) && startSeconds <= 1.0;

  if (cassetteInsertTimeout) {
    clearTimeout(cassetteInsertTimeout);
    cassetteInsertTimeout = null;
  }

  // Set active Host/DJ state
  carMusic.isHost = true;
  updateRoleDisplay();

  // Option C: Auto-open deck for 5 seconds so player sees the song & can adjust volume
  if (!carMusic.isOpen) {
    openStereoDeck(5);
  }

  const startActualPlay = () => {
    carMusic.videoId = videoId;
    carMusic.title = title || 'Audio Track';
    carMusic.startSeconds = startSeconds;
    carMusic.serverTime = Date.now();
    carMusic.isPlaying = true;

    updateStereoPlayStateUI(true);
    updateTrackTitleUI();

    const doPlay = (p) => {
      try {
        if (typeof p.unMute === 'function' && !carMusic.isMuted) p.unMute();
        if (typeof p.setVolume === 'function') p.setVolume(carMusic.volume);
        
        if (typeof p.loadVideoById === 'function') {
          p.loadVideoById({
            videoId: videoId,
            startSeconds: Math.floor(startSeconds)
          });
        }
        if (typeof p.seekTo === 'function') {
          p.seekTo(startSeconds, true);
        }
        if (typeof p.playVideo === 'function') {
          p.playVideo();
        }
      } catch (err) {
        console.warn('[CAR STEREO] Play error:', err);
      }
    };

    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      doPlay(ytPlayer);
    } else {
      ensureYouTubePlayer(doPlay);
    }

    broadcastMusicSync('play', {
      videoId: carMusic.videoId,
      title: carMusic.title,
      startSeconds: carMusic.startSeconds,
      serverTime: carMusic.serverTime,
      isPlaying: true,
      isMixtape: isMixtape
    });
  };

  if (needsInsertSfx) {
    // 1. Pause current playback immediately so previous audio stops
    if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    carMusic.isPlaying = false;
    updateStereoPlayStateUI(false);

    // Update track title on tape deck VFD to show mounting tape
    if (title) {
      carMusic.title = title;
      updateTrackTitleUI();
    }

    // 2. Broadcast CASSETTE_INSERT to cabin peers so all passengers hear click & see animation
    broadcastMusicSync('cassetteInsert', {
      videoId: videoId,
      title: title,
      queue: carMusic.queue,
      queueIndex: carMusic.queueIndex
    });

    // 3. Play mechanical sound and seating animation on our deck
    triggerCassetteAnimation(null, isNextTrack, false);

    // 4. Wait for tape mechanism to seat (~1100ms) before starting audio
    cassetteInsertTimeout = setTimeout(() => {
      cassetteInsertTimeout = null;
      startActualPlay();
    }, 1100);
  } else {
    // Seamless mixtape transition or in-flight track change: play immediately
    triggerCassetteAnimation(() => {
      startActualPlay();
    }, isNextTrack, true);
  }
}

/**
 * Passenger action: Synchronizes seamlessly with vehicle music
 * Calculates time elapsed since server timestamp so it does NOT restart from 0:00!
 */
function syncTrackAsPassenger(data) {
  if (!data || !data.videoId) return;

  const now = Date.now();
  const elapsed = Math.max(0, (now - (data.serverTime || now)) / 1000);
  const targetSeconds = (data.startSeconds || 0) + (data.isPlaying ? elapsed : 0);

  const isSilent = targetSeconds > 1.0 || Boolean(data.isMixtape);
  const isNextTrack = Boolean(carMusic.videoId && carMusic.videoId !== data.videoId);
  const isNewTrack = carMusic.videoId !== data.videoId;

  triggerCassetteAnimation(() => {
    carMusic.videoId = data.videoId;
    carMusic.title = data.title || carMusic.title || 'Synced Vehicle Stream';
    carMusic.isPlaying = Boolean(data.isPlaying);
    carMusic.startSeconds = targetSeconds;
    carMusic.serverTime = now;
    carMusic.isHost = false;

    updateStereoPlayStateUI(carMusic.isPlaying);
    updateTrackTitleUI();
    updateRoleDisplay();

    // Option C: Auto-open deck for 5 seconds so player sees the song & can adjust volume
    if (!carMusic.isOpen && carMusic.isPlaying) {
      openStereoDeck(5);
    }

    const doSync = (p) => {
      try {
        if (typeof p.unMute === 'function' && !carMusic.isMuted) p.unMute();
        if (typeof p.setVolume === 'function') p.setVolume(carMusic.volume);
      } catch (err) {}

      if (isNewTrack) {
        p.loadVideoById({
          videoId: data.videoId,
          startSeconds: Math.floor(targetSeconds)
        });
        p.seekTo(targetSeconds, true);
        if (data.isPlaying) p.playVideo();
        else p.pauseVideo();
      } else {
        const current = p.getCurrentTime ? p.getCurrentTime() : 0;
        if (Math.abs(current - targetSeconds) > 2.5) {
          p.seekTo(targetSeconds, true);
        }
        if (data.isPlaying) p.playVideo();
        else p.pauseVideo();
      }
    };

    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      doSync(ytPlayer);
    } else {
      ensureYouTubePlayer(doSync);
    }
  }, isNextTrack, isSilent);
}

function seekTrackAsDriver(seconds) {
  const targetSec = Math.max(0, Math.min(carMusic.currentDuration || 9999, seconds));
  carMusic.startSeconds = targetSec;
  carMusic.currentPosition = targetSec;
  carMusic.serverTime = Date.now();
  carMusic.isPlaying = true;

  // Immediate UI timeline & text update
  const fillEl = document.getElementById('stereo-progress-fill');
  const handleEl = document.getElementById('stereo-progress-handle');
  const ratio = Math.max(0, Math.min(1, targetSec / (carMusic.currentDuration || 1)));
  if (fillEl) fillEl.style.width = `${(ratio * 100).toFixed(1)}%`;
  if (handleEl) handleEl.style.left = `${(ratio * 100).toFixed(1)}%`;

  const curTimeEl = document.getElementById('stereo-current-time');
  const vfdTimeEl = document.getElementById('stereo-time-display');
  const curStr = formatTime(targetSec);
  const durStr = formatTime(carMusic.currentDuration);
  if (curTimeEl) curTimeEl.textContent = curStr;
  if (vfdTimeEl) vfdTimeEl.textContent = `${curStr} / ${durStr}`;

  updateStereoPlayStateUI(true);

  if (ytReady && ytPlayer) {
    try {
      if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
      if (typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(carMusic.volume);
      if (typeof ytPlayer.seekTo === 'function') ytPlayer.seekTo(targetSec, true);
      if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
    } catch (err) {
      console.warn('[CAR STEREO] Seek play error:', err);
    }
  }

  startCabinHeartbeat();

  broadcastMusicSync('seek', {
    videoId: carMusic.videoId,
    title: carMusic.title,
    startSeconds: targetSec,
    serverTime: carMusic.serverTime,
    isPlaying: true
  });
  broadcastMusicSync('resume', {
    videoId: carMusic.videoId,
    title: carMusic.title,
    startSeconds: targetSec,
    serverTime: carMusic.serverTime,
    isPlaying: true
  });
}

function togglePlayPause() {
  if (cassetteInsertTimeout) {
    clearTimeout(cassetteInsertTimeout);
    cassetteInsertTimeout = null;
  }
  if (carMusic.isPlaying) {
    carMusic.isPlaying = false;
    const current = (ytReady && ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : carMusic.currentPosition;
    carMusic.startSeconds = current;
    carMusic.serverTime = Date.now();
    if (ytReady && ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    updateStereoPlayStateUI(false);
    broadcastMusicSync('pause', {
      videoId: carMusic.videoId,
      title: carMusic.title,
      startSeconds: carMusic.startSeconds,
      serverTime: carMusic.serverTime,
      isPlaying: false
    });
  } else {
    if (!carMusic.videoId) {
      if (carMusic.queue.length > 0) {
        playNextInQueue();
        return;
      }
      return;
    }
    carMusic.isPlaying = true;
    carMusic.serverTime = Date.now();

    // Check if player ended or needs rewind from 0:00
    let isAtEnd = false;
    try {
      if (ytReady && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
        const state = ytPlayer.getPlayerState();
        isAtEnd = (state === 0 || state === -1 || state === 5);
      }
    } catch (err) {}

    const isNearEnd = (carMusic.currentDuration > 0 && carMusic.currentPosition >= carMusic.currentDuration - 1.5);
    const shouldRewind = isAtEnd || isNearEnd || carMusic.currentPosition <= 0.5;

    if (shouldRewind) {
      carMusic.startSeconds = 0;
      carMusic.currentPosition = 0;
      if (ytReady && ytPlayer) {
        try {
          if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
          if (typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(carMusic.volume);
          if (typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById({
              videoId: carMusic.videoId,
              startSeconds: 0
            });
          } else if (typeof ytPlayer.seekTo === 'function') {
            ytPlayer.seekTo(0, true);
          }
          if (typeof ytPlayer.playVideo === 'function') {
            ytPlayer.playVideo();
          }
        } catch (err) {
          console.warn('[CAR STEREO] Replay error:', err);
        }
      }
    } else {
      if (ytReady && ytPlayer && ytPlayer.playVideo) {
        try {
          if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
          if (typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(carMusic.volume);
        } catch (err) {}
        ytPlayer.playVideo();
      }
    }

    updateStereoPlayStateUI(true);
    broadcastMusicSync('resume', {
      videoId: carMusic.videoId,
      title: carMusic.title,
      startSeconds: carMusic.startSeconds,
      serverTime: carMusic.serverTime,
      isPlaying: true
    });
  }
}

function stopMusic() {
  if (cassetteInsertTimeout) {
    clearTimeout(cassetteInsertTimeout);
    cassetteInsertTimeout = null;
  }
  carMusic.isPlaying = false;
  carMusic.startSeconds = 0;
  carMusic.currentPosition = 0;
  if (ytReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  updateStereoPlayStateUI(false);
  const fillEl = document.getElementById('stereo-progress-fill');
  const handleEl = document.getElementById('stereo-progress-handle');
  if (fillEl) fillEl.style.width = '0%';
  if (handleEl) handleEl.style.left = '0%';
  const vfdTimeEl = document.getElementById('stereo-time-display');
  if (vfdTimeEl) vfdTimeEl.textContent = '00:00 / 00:00';
  broadcastMusicSync('stop', {
    videoId: carMusic.videoId,
    startSeconds: 0,
    serverTime: Date.now(),
    isPlaying: false
  });
}

function setMusicVolume(val) {
  const vol = Math.max(0, Math.min(100, Number(val) || 0));
  carMusic.volume = vol;
  try {
    localStorage.setItem('ae86_stereo_vol', vol.toString());
  } catch (_) {}
  if (ytReady && ytPlayer && ytPlayer.setVolume) {
    ytPlayer.setVolume(vol);
  }
  const slider = document.getElementById('stereo-vol-slider');
  const label = document.getElementById('stereo-vol-text');
  const btnMute = document.getElementById('stereo-btn-mute');
  if (slider) slider.value = vol;
  if (label) label.textContent = `${vol}%`;
  if (btnMute) btnMute.textContent = (vol === 0 || carMusic.isMuted) ? 'MUTE' : 'VOL';
}

function updateTrackTitleUI() {
  const titleEl = document.getElementById('stereo-track-title');
  const cassetteTitleEl = document.getElementById('stereo-cassette-title');
  const cassetteViewport = document.querySelector('.cassette-viewport');

  const hasCassette = Boolean(carMusic.videoId && carMusic.videoId !== STANDBY_VIDEO_ID && carMusic.title && carMusic.title !== 'TAPE - NO CASSETTE / STANDBY');

  if (cassetteViewport) {
    cassetteViewport.classList.toggle('cassette-empty', !hasCassette);
  }

  if (titleEl) {
    titleEl.textContent = hasCassette ? carMusic.title : 'TAPE - NO CASSETTE / STANDBY';
  }
  if (cassetteTitleEl) {
    cassetteTitleEl.textContent = hasCassette ? carMusic.title.toUpperCase() : '[ NO CASSETTE INSERTED ]';
  }
}

function updateStereoPlayStateUI(isPlaying) {
  const statusEl = document.getElementById('stereo-play-status');
  const spoolLeft = document.getElementById('spool-left');
  const spoolRight = document.getElementById('spool-right');
  const btnPlay = document.getElementById('stereo-btn-play');
  const tofuTag = document.getElementById('tofu-music-tag');
  const tofuPlate = document.getElementById('tofu-plate-btn');
  const cassetteViewport = document.querySelector('.cassette-viewport');

  const hasCassette = Boolean(carMusic.videoId && carMusic.videoId !== STANDBY_VIDEO_ID && carMusic.title && carMusic.title !== 'TAPE - NO CASSETTE / STANDBY');

  if (cassetteViewport) {
    cassetteViewport.classList.toggle('cassette-empty', !hasCassette);
  }

  if (statusEl) statusEl.textContent = isPlaying ? '▶ PLAYING' : (hasCassette ? '❚❚ PAUSED' : '■ STANDBY');
  if (btnPlay) btnPlay.textContent = isPlaying ? '❚❚' : '▶';

  if (spoolLeft) spoolLeft.classList.toggle('spinning', isPlaying && hasCassette);
  if (spoolRight) spoolRight.classList.toggle('spinning', isPlaying && hasCassette);

  if (tofuTag) tofuTag.classList.toggle('playing', isPlaying);
  if (tofuPlate) tofuPlate.classList.toggle('stereo-open', isPlaying);
}

let cachedEqBands = null;
function getEqBands() {
  if (!cachedEqBands || cachedEqBands.length === 0) {
    cachedEqBands = Array.from(document.querySelectorAll('#stereo-eq-meter .eq-band'));
  }
  return cachedEqBands;
}

function animateEqualizer(isActive) {
  if (!carMusic.isOpen) return; // Zero DOM updates when deck is closed
  const bands = getEqBands();
  bands.forEach((band) => {
    const pips = band.children;
    const count = isActive ? Math.floor(Math.random() * 5) + 1 : 0;
    for (let i = 0; i < pips.length; i++) {
      pips[i].className = 'eq-pip';
      if (i < count) {
        if (i >= 4) pips[i].classList.add('active-red');
        else if (i >= 2) pips[i].classList.add('active-amber');
        else pips[i].classList.add('active-green');
      }
    }
  });
}

function refreshStereoProgressUI() {
  const fillEl = document.getElementById('stereo-progress-fill');
  const handleEl = document.getElementById('stereo-progress-handle');
  const curTimeEl = document.getElementById('stereo-current-time');
  const durTimeEl = document.getElementById('stereo-duration-time');
  const vfdTimeEl = document.getElementById('stereo-time-display');

  if (carMusic.currentDuration > 0) {
    const pct = Math.min(100, Math.max(0, (carMusic.currentPosition / carMusic.currentDuration) * 100));
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (handleEl) handleEl.style.left = `${pct}%`;
  }
  const curStr = formatTime(carMusic.currentPosition);
  const durStr = formatTime(carMusic.currentDuration);
  if (curTimeEl) curTimeEl.textContent = curStr;
  if (durTimeEl) durTimeEl.textContent = durStr;
  if (vfdTimeEl) vfdTimeEl.textContent = `${curStr} / ${durStr}`;
}

function startStereoAnimLoop() {
  if (stereoAnimInterval) return;
  const fillEl = document.getElementById('stereo-progress-fill');
  const handleEl = document.getElementById('stereo-progress-handle');
  const curTimeEl = document.getElementById('stereo-current-time');
  const durTimeEl = document.getElementById('stereo-duration-time');
  const vfdTimeEl = document.getElementById('stereo-time-display');

  stereoAnimInterval = setInterval(() => {
    if (!carMusic.isPlaying) {
      if (carMusic.isOpen) animateEqualizer(false);
      return;
    }

    if (ytReady && ytPlayer && ytPlayer.getCurrentTime) {
      carMusic.currentPosition = ytPlayer.getCurrentTime() || 0;
      carMusic.currentDuration = ytPlayer.getDuration() || 0;
    } else {
      carMusic.currentPosition += 0.2;
    }

    // High performance optimization: skip all visual DOM updates if deck is closed!
    if (!carMusic.isOpen) return;

    if (!carMusic.isDraggingScrubber && carMusic.currentDuration > 0) {
      const pct = Math.min(100, Math.max(0, (carMusic.currentPosition / carMusic.currentDuration) * 100));
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (handleEl) handleEl.style.left = `${pct}%`;
    }

    const curStr = formatTime(carMusic.currentPosition);
    const durStr = formatTime(carMusic.currentDuration);
    if (curTimeEl) curTimeEl.textContent = curStr;
    if (durTimeEl) durTimeEl.textContent = durStr;
    if (vfdTimeEl) vfdTimeEl.textContent = `${curStr} / ${durStr}`;

    animateEqualizer(true);
  }, 200);
}

function openStereoDeck(autoCloseSeconds = 0) {
  const modal = document.getElementById('stereo-modal');
  const tofuBtn = document.getElementById('tofu-plate-btn');
  if (!modal) return;

  if (autoPeekTimeout) {
    clearTimeout(autoPeekTimeout);
    autoPeekTimeout = null;
  }

  carMusic.isOpen = true;
  refreshStereoProgressUI();
  modal.classList.remove('deck-closing');
  modal.style.display = 'block';
  modal.style.visibility = 'visible';
  // Force browser reflow so transition plays smoothly
  void modal.offsetWidth;
  modal.classList.add('deck-open');

  if (tofuBtn) tofuBtn.classList.add('stereo-open');
  updateStereoPosition();
  startStereoAnimLoop();

  const searchInput = document.getElementById('stereo-search-input');
  if (searchInput && document.activeElement === searchInput) {
    searchInput.blur();
    releaseNuiFocus(true);
  }
  console.log('[CAR STEREO] Opened Fujiwara Stereo Deck.');

  if (autoCloseSeconds > 0) {
    autoPeekTimeout = setTimeout(() => {
      autoPeekTimeout = null;
      // Do not auto-close if player is actively interacting with the deck
      const searchInput = document.getElementById('stereo-search-input');
      const isTyping = searchInput && document.activeElement === searchInput;
      if (!isTyping && !carMusic.isQueueOpen && !carMusic.isDraggingScrubber) {
        closeStereoDeck();
      }
    }, autoCloseSeconds * 1000);
  }
}

function closeStereoDeck() {
  const modal = document.getElementById('stereo-modal');
  const tofuBtn = document.getElementById('tofu-plate-btn');
  if (autoPeekTimeout) {
    clearTimeout(autoPeekTimeout);
    autoPeekTimeout = null;
  }
  if (!modal) return;

  carMusic.isOpen = false;
  modal.classList.remove('deck-open');
  modal.classList.add('deck-closing');

  if (tofuBtn) tofuBtn.classList.remove('stereo-open');
  releaseNuiFocus();
  console.log('[CAR STEREO] Closed Fujiwara Stereo Deck.');

  setTimeout(() => {
    if (!carMusic.isOpen && modal) {
      modal.style.display = 'none';
      modal.classList.remove('deck-closing');
    }
  }, 220);
}

function toggleStereoDeck() {
  if (carMusic.isOpen) {
    closeStereoDeck();
  } else {
    openStereoDeck(0);
  }
}

function updateStereoPosition() {
  const modal = document.getElementById('stereo-modal');
  const cluster = document.getElementById('speedo-cluster');
  if (!modal || !cluster) return;

  modal.classList.remove('pop-below');
  modal.style.bottom = '';
  modal.style.top = '';

  const clusterRect = cluster.getBoundingClientRect();
  const modalHeight = modal.offsetHeight || 240;
  const availableAbove = clusterRect.top;
  const availableBelow = window.innerHeight - clusterRect.bottom;

  // If not enough space above, but plenty of space below:
  if (availableAbove < (modalHeight + 10) && availableBelow > (modalHeight + 10)) {
    modal.classList.add('pop-below');
  } else if (availableAbove < (modalHeight + 10)) {
    // Clamping: If constrained above, shift modal down so its top stays inside viewport
    const scale = parseFloat(getComputedStyle(cluster).getPropertyValue('--cluster-scale')) || 1;
    const diff = (modalHeight * scale) - availableAbove + 10;
    if (diff > 0) {
      modal.style.bottom = `calc(100% + 8px - ${Math.round(diff / scale)}px)`;
    }
  }
}

function broadcastMusicSync(action, payload) {
  // 100% Cloud Cabin Sync over WebSockets (Zero Lua required, works on GitHub Pages & Vercel)
  try {
    if (typeof publishCabinSync === 'function') {
      publishCabinSync(action, payload);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// REAL-TIME CABIN CLOUD SYNC (WEBSOCKET / MQTT PUBSUB FOR GITHUB PAGES & FIVEM)
// ---------------------------------------------------------------------------

let cabinMqttClient = null;
const cabinClientId = 'ae86_' + Math.random().toString(36).substring(2, 9);
const CABIN_TOPIC = 'kaga43_ae86_cabin';
let cabinHeartbeatInterval = null;

function getCabinTopic() {
  return CABIN_TOPIC;
}

function startCabinHeartbeat() {
  // Disabled: Clean Event-Driven Sync prevents continuous seek-stutter and network lag loops
  stopCabinHeartbeat();
}

function stopCabinHeartbeat() {
  if (cabinHeartbeatInterval) {
    clearInterval(cabinHeartbeatInterval);
    cabinHeartbeatInterval = null;
  }
}

function initCabinCloudSync() {
  if (typeof window.mqtt === 'undefined') {
    console.warn('[CABIN SYNC] MQTT library not available. Cloud sync inactive.');
    return;
  }

  try {
    const topic = getCabinTopic();
    // Connect to HiveMQ Public WSS Broker (zero keys, free, global WebSocket)
    cabinMqttClient = window.mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: cabinClientId,
      keepalive: 30,
      clean: true,
      reconnectPeriod: 3000
    });

    cabinMqttClient.on('connect', () => {
      console.log(`[CABIN SYNC] Connected to Cloud Cabin Broker. Subscribing to: ${topic}`);
      cabinMqttClient.subscribe(topic, { qos: 0 });
      updateCabinSyncUI(true);

      // If we are a passenger joining an existing car, ask if any music is already playing in the cabin
      setTimeout(() => {
        publishCabinMessage('REQUEST_SYNC', {});
      }, 600);
    });

    cabinMqttClient.on('message', (msgTopic, rawMsg) => {
      try {
        const payload = JSON.parse(rawMsg.toString());
        // Ignore messages sent by ourself
        if (payload.sender === cabinClientId) return;

        handleCabinIncomingMessage(payload);
      } catch (err) {
        console.warn('[CABIN SYNC] Parse error:', err);
      }
    });

    cabinMqttClient.on('error', (err) => {
      console.warn('[CABIN SYNC] Connection error:', err.message);
      updateCabinSyncUI(false);
    });

    cabinMqttClient.on('close', () => {
      updateCabinSyncUI(false);
      stopCabinHeartbeat();
    });
  } catch (err) {
    console.warn('[CABIN SYNC] Init failed:', err);
  }
}

function updateCabinSyncUI(connected) {
  const syncInfoEl = document.getElementById('stereo-sync-info');
  if (syncInfoEl) {
    if (connected) {
      syncInfoEl.textContent = carMusic.isHost ? 'STEREO HI-FI' : 'STEREO LINKED';
      syncInfoEl.style.color = '#00f59b';
    } else {
      syncInfoEl.textContent = 'CONNECTING...';
      syncInfoEl.style.color = '#ff9d00';
    }
  }
  updateRoleDisplay(carMusic.isHost);
}

function publishCabinMessage(type, data = {}) {
  if (!cabinMqttClient || !cabinMqttClient.connected) return;
  try {
    const topic = getCabinTopic();
    const packet = JSON.stringify({
      sender: cabinClientId,
      type: type,
      timestamp: Date.now(),
      ...data
    });
    cabinMqttClient.publish(topic, packet, { qos: 0 });
  } catch (err) {}
}

function publishCabinSync(action, payload) {
  if (!cabinMqttClient || !cabinMqttClient.connected) return;
  if (action === 'cassetteInsert') {
    publishCabinMessage('CASSETTE_INSERT', {
      videoId: payload.videoId,
      title: payload.title,
      queue: payload.queue,
      queueIndex: payload.queueIndex
    });
  } else if (action === 'play') {
    startCabinHeartbeat();
    publishCabinMessage('PLAY_TRACK', {
      videoId: payload.videoId,
      title: payload.title,
      startSeconds: payload.startSeconds,
      serverTime: payload.serverTime,
      isPlaying: payload.isPlaying,
      isMixtape: payload.isMixtape,
      queue: carMusic.queue,
      queueIndex: carMusic.queueIndex
    });
  } else if (action === 'pause') {
    stopCabinHeartbeat();
    publishCabinMessage('TOGGLE_PLAY', { isPlaying: false, currentPosition: payload.startSeconds });
  } else if (action === 'resume') {
    startCabinHeartbeat();
    publishCabinMessage('TOGGLE_PLAY', { isPlaying: true, currentPosition: payload.startSeconds });
  } else if (action === 'stop') {
    stopCabinHeartbeat();
    publishCabinMessage('STOP', {});
  } else if (action === 'seek') {
    publishCabinMessage('SEEK', { seconds: payload.startSeconds });
  } else if (action === 'syncQueue') {
    publishCabinMessage('SYNC_QUEUE', { queue: payload.queue, queueIndex: payload.queueIndex });
  }
}

function handleCabinIncomingMessage(msg) {
  console.log('[CABIN SYNC] Received message from cabin peer:', msg.type);

  switch (msg.type) {
    case 'CASSETTE_INSERT':
      if (cassetteInsertTimeout) {
        clearTimeout(cassetteInsertTimeout);
        cassetteInsertTimeout = null;
      }
      if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        try { ytPlayer.pauseVideo(); } catch (e) {}
      }
      carMusic.isPlaying = false;
      carMusic.isHost = false;
      stopCabinHeartbeat();
      updateStereoPlayStateUI(false);
      updateRoleDisplay();

      // Option C: Auto-open deck for 5 seconds so player sees mounting tape & can adjust volume
      if (!carMusic.isOpen) {
        openStereoDeck(5);
      }

      if (msg.title) {
        carMusic.title = msg.title;
        updateTrackTitleUI();
      }
      if (msg.queue) {
        carMusic.queue = msg.queue;
        if (typeof msg.queueIndex === 'number') carMusic.queueIndex = msg.queueIndex;
        renderQueueUI();
        updateQueueCountUI();
      }

      const isNextCassette = Boolean(carMusic.videoId && carMusic.videoId !== msg.videoId);
      triggerCassetteAnimation(null, isNextCassette, false);
      break;

    case 'REQUEST_SYNC':
      // Another occupant entered the car. If we have active music, reply with current status
      if (carMusic.videoId && carMusic.videoId !== STANDBY_VIDEO_ID) {
        publishCabinMessage('SYNC_STATE', {
          videoId: carMusic.videoId,
          title: carMusic.title,
          startSeconds: (ytReady && ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : carMusic.currentPosition,
          serverTime: Date.now(),
          isPlaying: carMusic.isPlaying,
          queue: carMusic.queue,
          queueIndex: carMusic.queueIndex,
          isMixtape: true
        });
      }
      break;

    case 'HEARTBEAT':
      // Disabled: Clean Event-Driven Sync allows audio to play naturally and continuously
      // without repetitive seekTo buffering and network lag loops.
      break;

    case 'SYNC_STATE':
    case 'PLAY_TRACK':
      if (cassetteInsertTimeout) {
        clearTimeout(cassetteInsertTimeout);
        cassetteInsertTimeout = null;
      }
      if (msg.queue) {
        carMusic.queue = msg.queue;
        if (typeof msg.queueIndex === 'number') carMusic.queueIndex = msg.queueIndex;
        renderQueueUI();
        updateQueueCountUI();
      }
      syncTrackAsPassenger({
        videoId: msg.videoId,
        title: msg.title,
        startSeconds: msg.startSeconds || 0,
        serverTime: msg.serverTime || msg.timestamp || Date.now(),
        isPlaying: Boolean(msg.isPlaying),
        isMixtape: true
      });
      break;

    case 'TOGGLE_PLAY':
      if (typeof msg.currentPosition === 'number') {
        carMusic.currentPosition = msg.currentPosition;
        if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
          ytPlayer.seekTo(msg.currentPosition, true);
        }
      }
      if (msg.isPlaying) {
        carMusic.isPlaying = true;
        updateStereoPlayStateUI(true);
        if (ytReady && ytPlayer) {
          try {
            if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
            if (typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(carMusic.volume);
            if (typeof msg.currentPosition === 'number' && msg.currentPosition <= 0.5 && typeof ytPlayer.loadVideoById === 'function') {
              ytPlayer.loadVideoById({ videoId: carMusic.videoId, startSeconds: 0 });
            }
          } catch (e) {}
          if (typeof ytPlayer.playVideo === 'function') {
            ytPlayer.playVideo();
          }
        }
      } else {
        carMusic.isPlaying = false;
        updateStereoPlayStateUI(false);
        if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
          ytPlayer.pauseVideo();
        }
      }
      break;

    case 'STOP':
      stopMusic();
      break;

    case 'SEEK':
      if (typeof msg.seconds === 'number') {
        carMusic.startSeconds = msg.seconds;
        if (ytReady && ytPlayer && ytPlayer.seekTo) {
          ytPlayer.seekTo(msg.seconds, true);
        }
      }
      break;

    case 'SYNC_QUEUE':
      if (Array.isArray(msg.queue)) {
        carMusic.queue = msg.queue;
        if (typeof msg.queueIndex === 'number') carMusic.queueIndex = msg.queueIndex;
        renderQueueUI();
        updateQueueCountUI();
      }
      break;
  }
}

function initStereoDeck() {
  const tofuBtn = document.getElementById('tofu-plate-btn');
  const btnClose = document.getElementById('stereo-close-btn');
  const btnPlay = document.getElementById('stereo-btn-play');
  const btnStop = document.getElementById('stereo-btn-stop');
  const btnPrev = document.getElementById('stereo-btn-prev');
  const btnNext = document.getElementById('stereo-btn-next');
  const searchInput = document.getElementById('stereo-search-input');
  const btnSearch = document.getElementById('stereo-btn-search');
  const btnClearSearch = document.getElementById('stereo-btn-clear-search');
  const btnToggleQueue = document.getElementById('stereo-btn-toggle-queue');
  const btnClearAllQueue = document.getElementById('queue-btn-clear-all');
  const volSlider = document.getElementById('stereo-vol-slider');
  const btnMute = document.getElementById('stereo-btn-mute');
  const btnToggleVideo = document.getElementById('stereo-btn-toggle-video');
  const videoBox = document.getElementById('stereo-video-container');
  const progressWrap = document.getElementById('stereo-progress-wrap');

  const modal = document.getElementById('stereo-modal');
  if (modal) {
    modal.addEventListener('pointerdown', () => {
      // User interacted with deck: cancel auto-close so it remains open
      if (autoPeekTimeout) {
        clearTimeout(autoPeekTimeout);
        autoPeekTimeout = null;
      }
    });
  }

  // Tofu plate click & pointerdown toggles stereo deck reliably
  if (tofuBtn) {
    let lastToggle = 0;
    const handleToggle = (e) => {
      const now = Date.now();
      if (now - lastToggle < 300) return;
      lastToggle = now;
      if (e) {
        e.stopPropagation();
      }
      toggleStereoDeck();
    };

    tofuBtn.addEventListener('click', handleToggle);
    tofuBtn.addEventListener('pointerdown', handleToggle);
  }

  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeStereoDeck();
    });
  }

  if (btnPlay) btnPlay.addEventListener('click', togglePlayPause);
  if (btnStop) btnStop.addEventListener('click', stopMusic);

  if (btnNext) btnNext.addEventListener('click', playNextInQueue);
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const cur = carMusic.currentPosition || 0;
      if (cur > 3.0) {
        seekTrackAsDriver(0);
      } else {
        playPrevInQueue();
      }
    });
  }

  const handlePerformSearch = async () => {
    if (!searchInput) return;
    const q = searchInput.value.trim();
    if (!q) return;

    const resultsPanel = document.getElementById('stereo-search-results');
    const resultsList = document.getElementById('stereo-results-list');
    const queuePanel = document.getElementById('stereo-queue-panel');
    const btnToggleQueue = document.getElementById('stereo-btn-toggle-queue');

    // Auto-collapse queue panel when performing search
    if (queuePanel && carMusic.isQueueOpen) {
      carMusic.isQueueOpen = false;
      queuePanel.style.display = 'none';
      if (btnToggleQueue) btnToggleQueue.classList.remove('active');
    }

    if (resultsPanel && resultsList) {
      resultsPanel.style.display = 'block';
      resultsList.innerHTML = `<div class="results-loading">[SEEK] Sedang mencari "<strong>${escapeHtml(q)}</strong>" di YouTube...</div>`;
      updateStereoPosition();
    }

    const results = await fetchYouTubeSearchResults(q);
    renderSearchResultsUI(results, q);
  };

  handlePerformSearchGlobal = handlePerformSearch;

  const searchForm = document.getElementById('stereo-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (searchInput) searchInput.blur();
      releaseNuiFocus(true);
      handlePerformSearch();
    });
  }

  if (btnSearch) {
    btnSearch.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (searchInput) searchInput.blur();
      releaseNuiFocus(true);
      handlePerformSearch();
    });
  }

  const btnCloseResults = document.getElementById('stereo-btn-close-results');
  if (btnCloseResults) {
    btnCloseResults.addEventListener('click', (e) => {
      e.stopPropagation();
      const resultsPanel = document.getElementById('stereo-search-results');
      if (resultsPanel) resultsPanel.style.display = 'none';
      updateStereoPosition();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (btnClearSearch) {
        btnClearSearch.style.display = searchInput.value.length > 0 ? 'block' : 'none';
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
        e.preventDefault();
        searchInput.blur();
        releaseNuiFocus(true);
        handlePerformSearch();
        return;
      }

      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        searchInput.blur();
        releaseNuiFocus(true);
        return;
      }
    });

    searchInput.addEventListener('keypress', (e) => e.stopPropagation());
    searchInput.addEventListener('keyup', (e) => e.stopPropagation());

    searchInput.addEventListener('mousedown', (e) => e.stopPropagation());
    searchInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    searchInput.addEventListener('mouseup', (e) => e.stopPropagation());
    searchInput.addEventListener('pointerup', (e) => e.stopPropagation());
    searchInput.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.focus();
    });

    searchInput.addEventListener('blur', () => {
      releaseNuiFocus(true);
    });

    searchInput.addEventListener('focus', (e) => {
      e.stopPropagation();
    });
  }

  if (btnClearSearch && searchInput) {
    btnClearSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.value = '';
      btnClearSearch.style.display = 'none';
      searchInput.focus();
    });
  }

  if (btnToggleQueue) {
    btnToggleQueue.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleQueuePanel();
    });
  }

  if (btnClearAllQueue) {
    btnClearAllQueue.addEventListener('click', (e) => {
      e.stopPropagation();
      clearQueue();
    });
  }

  const initialVol = getSavedStereoVolume();
  setMusicVolume(initialVol);

  if (volSlider) {
    volSlider.value = initialVol;
    volSlider.addEventListener('input', (e) => {
      setMusicVolume(e.target.value);
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      carMusic.isMuted = !carMusic.isMuted;
      if (carMusic.isMuted) {
        if (ytReady && ytPlayer && ytPlayer.mute) ytPlayer.mute();
        btnMute.textContent = 'MUTE';
      } else {
        if (ytReady && ytPlayer && ytPlayer.unMute) ytPlayer.unMute();
        btnMute.textContent = 'VOL';
      }
    });
  }

  if (btnToggleVideo && videoBox) {
    btnToggleVideo.addEventListener('click', () => {
      carMusic.videoVisible = !carMusic.videoVisible;
      videoBox.classList.toggle('hidden-preview', !carMusic.videoVisible);
      btnToggleVideo.classList.toggle('active', carMusic.videoVisible);
      updateStereoPosition();
    });
  }

  if (progressWrap) {
    const fillEl = document.getElementById('stereo-progress-fill');
    const handleEl = document.getElementById('stereo-progress-handle');
    const curTimeEl = document.getElementById('stereo-current-time');
    const vfdTimeEl = document.getElementById('stereo-time-display');

    const updateScrubberVisual = (ratio) => {
      const pct = Math.max(0, Math.min(100, ratio * 100));
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (handleEl) handleEl.style.left = `${pct}%`;
      if (carMusic.currentDuration > 0) {
        const previewSec = ratio * carMusic.currentDuration;
        const curStr = formatTime(previewSec);
        const durStr = formatTime(carMusic.currentDuration);
        if (curTimeEl) curTimeEl.textContent = curStr;
        if (vfdTimeEl) vfdTimeEl.textContent = `${curStr} / ${durStr}`;
      }
    };

    const getScrubberRatio = (e) => {
      const rect = progressWrap.getBoundingClientRect();
      if (!rect.width) return 0;
      const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    let isPointerDown = false;

    progressWrap.addEventListener('pointerdown', (e) => {
      if (!carMusic.currentDuration) return;
      e.stopPropagation();
      isPointerDown = true;
      carMusic.isDraggingScrubber = true;
      progressWrap.classList.add('dragging');

      if (autoPeekTimeout) {
        clearTimeout(autoPeekTimeout);
        autoPeekTimeout = null;
      }

      try {
        progressWrap.setPointerCapture(e.pointerId);
      } catch (_) {}

      const ratio = getScrubberRatio(e);
      updateScrubberVisual(ratio);
    });

    progressWrap.addEventListener('pointermove', (e) => {
      if (!isPointerDown || !carMusic.isDraggingScrubber) return;
      e.stopPropagation();
      const ratio = getScrubberRatio(e);
      updateScrubberVisual(ratio);
    });

    const handlePointerEnd = (e) => {
      if (!isPointerDown) return;
      e.stopPropagation();
      isPointerDown = false;
      carMusic.isDraggingScrubber = false;
      progressWrap.classList.remove('dragging');

      try {
        progressWrap.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (carMusic.currentDuration > 0) {
        const ratio = getScrubberRatio(e);
        const targetSec = ratio * carMusic.currentDuration;
        seekTrackAsDriver(targetSec);
      }
    };

    progressWrap.addEventListener('pointerup', handlePointerEnd);
    progressWrap.addEventListener('pointercancel', handlePointerEnd);
  }

  updateTrackTitleUI();
  updateStereoPlayStateUI(false);
  startStereoAnimLoop();
}

/**
 * Release NUI and CEF DOM focus so keyboard controls (T for chat, F5, driving keys)
 * are immediately returned to GTA V / FiveM.
 */
function releaseNuiFocus(force = false) {
  try {
    if (!force && document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof window.blur === 'function') {
      window.blur();
    }
    if (window.parent && window.parent !== window && typeof window.parent.blur === 'function') {
      window.parent.blur();
    }
  } catch (err) {}
}

let isInteractingGrip = false;

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

  // Prevent Chromium from stealing OS keyboard focus on click/drag
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  const onPointerDown = (e) => {
    if (e.button !== 0) return; // Only drag on primary pointer button
    isDragging = true;
    isInteractingGrip = true;
    startX = e.clientX ?? (e.touches && e.touches[0].clientX);
    startY = e.clientY ?? (e.touches && e.touches[0].clientY);
    startScale = telemetry.scale || 1.0;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    try {
      if (e.pointerId !== undefined) grip.setPointerCapture(e.pointerId);
    } catch (err) {}

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

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    isInteractingGrip = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    try {
      if (e && e.pointerId !== undefined) grip.releasePointerCapture(e.pointerId);
    } catch (err) {}

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    // Release CEF focus immediately so game keys (T, F5) work in FiveM
    releaseNuiFocus(true);
  };

  // Double click resets scale to ideal auto-scale based on current game resolution
  grip.addEventListener('dblclick', (e) => {
    e.preventDefault();
    try {
      localStorage.removeItem('ae86_cluster_scale');
    } catch (err) {}
    setClusterScale(getIdealClusterScale(), false);
    releaseNuiFocus(true);
  });

  grip.addEventListener('pointerdown', onPointerDown);
}

/**
 * Interactive Corner Drag Move Handle (4-Way Arrow Grip at Top-Left)
 * Allows freely repositioning the speedometer cluster anywhere on the screen.
 * Saves position to localStorage and guarantees screen clamping.
 */
function initMoveGrip() {
  const moveGrip = document.getElementById('move-grip');
  const cluster = document.getElementById('speedo-cluster');
  if (!moveGrip || !cluster) return;

  let isMoving = false;
  let startX = 0;
  let startY = 0;
  let startRight = 24;
  let startBottom = 24;

  // Prevent Chromium from stealing OS keyboard focus on click/drag
  moveGrip.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  const onPointerDown = (e) => {
    if (e.button !== 0) return; // Only drag on primary pointer button
    isMoving = true;
    isInteractingGrip = true;
    startX = e.clientX ?? (e.touches && e.touches[0].clientX);
    startY = e.clientY ?? (e.touches && e.touches[0].clientY);

    const computed = window.getComputedStyle(cluster);
    startRight = parseFloat(computed.right) || 24;
    startBottom = parseFloat(computed.bottom) || 24;

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    moveGrip.style.cursor = 'grabbing';

    try {
      if (e.pointerId !== undefined) moveGrip.setPointerCapture(e.pointerId);
    } catch (err) {}

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isMoving) return;
    const currentX = e.clientX ?? (e.touches && e.touches[0].clientX);
    const currentY = e.clientY ?? (e.touches && e.touches[0].clientY);

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Moving right means distance to right edge decreases
    let newRight = startRight - deltaX;
    // Moving down means distance to bottom edge decreases
    let newBottom = startBottom - deltaY;

    // Viewport clamping (keep at least 80px and the grip visible inside screen)
    const minRight = 10;
    const maxRight = Math.max(10, window.innerWidth - 80);
    const minBottom = 10;
    const maxBottom = Math.max(10, window.innerHeight - 60);

    newRight = Math.max(minRight, Math.min(maxRight, newRight));
    newBottom = Math.max(minBottom, Math.min(maxBottom, newBottom));

    cluster.style.right = `${newRight}px`;
    cluster.style.bottom = `${newBottom}px`;
  };

  const onPointerUp = (e) => {
    if (!isMoving) return;
    isMoving = false;
    isInteractingGrip = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    moveGrip.style.cursor = '';

    try {
      if (e && e.pointerId !== undefined) moveGrip.releasePointerCapture(e.pointerId);
    } catch (err) {}

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    // Clamp position within viewport boundaries and persist in localStorage
    clampClusterPosition();
    try {
      const computed = window.getComputedStyle(cluster);
      localStorage.setItem('ae86_cluster_pos_right', computed.right);
      localStorage.setItem('ae86_cluster_pos_bottom', computed.bottom);
    } catch (err) {}

    // Release CEF focus immediately
    releaseNuiFocus(true);
  };

  // Double click resets position to default bottom-right
  moveGrip.addEventListener('dblclick', (e) => {
    e.preventDefault();
    cluster.style.right = '24px';
    cluster.style.bottom = '24px';
    try {
      localStorage.removeItem('ae86_cluster_pos_right');
      localStorage.removeItem('ae86_cluster_pos_bottom');
    } catch (err) {}
    releaseNuiFocus(true);
  });

  moveGrip.addEventListener('pointerdown', onPointerDown);
}

// Universal Audio & Interaction Unlock (Bypasses Chromium Autoplay restriction for passengers)
const unlockAudioOnGesture = () => {
  if (telemetry.soundEnabled) getAudioContext();
  if (carMusic.isPlaying && ytReady && ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try {
      if (typeof ytPlayer.unMute === 'function' && !carMusic.isMuted) ytPlayer.unMute();
      ytPlayer.playVideo();
    } catch (e) {}
  }
};
window.addEventListener('click', unlockAudioOnGesture);
window.addEventListener('pointerdown', unlockAudioOnGesture);

// Global Focus Management Listeners for FiveM CEF
const handleGlobalRelease = (e) => {
  // If active element is an input/textarea and pointer released inside stereo deck or search form, keep selection!
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
    if (e && e.target && typeof e.target.closest === 'function' && (e.target.closest('#stereo-modal') || e.target.closest('#stereo-search-form') || e.target.closest('.stereo-search-input-wrap'))) {
      return;
    }
  }
  if (e && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    return;
  }
  releaseNuiFocus(true);
};
window.addEventListener('pointerup', handleGlobalRelease);
window.addEventListener('touchend', handleGlobalRelease);

// Keyboard Management:
// Strict Root-Level Capturing Key Isolator:
// Intercepts 'T' / 't' in the CAPTURE phase before CEF/FiveM message pump can dispatch it to chat
['keydown', 'keypress', 'keyup'].forEach((evtType) => {
  window.addEventListener(evtType, (e) => {
    const input = document.getElementById('stereo-search-input');
    const isTargetInput = (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'));
    const isInputActive = isTargetInput || (input && document.activeElement === input);

    // 1. If typing in search input, strictly isolate 'T' / 't' and all game keys
    if (isInputActive) {
      const isKeyT = (e.key === 't' || e.key === 'T' || e.code === 'KeyT' || e.keyCode === 84 || e.which === 84);

      if (isKeyT) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();

        if (evtType === 'keydown' && input) {
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const val = input.value;
          const char = e.shiftKey ? 'T' : 't';
          input.value = val.substring(0, start) + char + val.substring(end);
          input.selectionStart = input.selectionEnd = start + 1;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return false;
      }

      if (e.key === 'Enter' || e.keyCode === 13) {
        if (evtType === 'keydown') {
          e.preventDefault();
          e.stopPropagation();
          if (input) input.blur();
          releaseNuiFocus(true);
          if (typeof handlePerformSearchGlobal === 'function') {
            handlePerformSearchGlobal();
          }
        }
        return;
      }

      if (e.key === 'Escape' || e.keyCode === 27) {
        if (evtType === 'keydown') {
          e.preventDefault();
          e.stopPropagation();
          if (input) input.blur();
          releaseNuiFocus(true);
        }
        return;
      }

      // Prevent vehicle driving keys (W, A, S, D, Space, F) from triggering GTA vehicle controls while typing in search
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key && e.key.length === 1 && evtType === 'keydown') {
        const isGameControlKey = ['w', 'a', 's', 'd', ' ', 'f', 'r', 'g', 'h'].includes(e.key.toLowerCase());
        if (isGameControlKey) {
          e.preventDefault();
          e.stopPropagation();
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const val = input.value;
          input.value = val.substring(0, start) + e.key + val.substring(end);
          input.selectionStart = input.selectionEnd = start + 1;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return false;
        }
      }
    }

    // 2. When deck is open or user is dragging grips, also block stray 'T' keypresses
    if (carMusic.isOpen || isInteractingGrip) {
      const isKeyT = (e.key === 't' || e.key === 'T' || e.code === 'KeyT' || e.keyCode === 84 || e.which === 84);
      if (isKeyT) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
      if (e.key === 'Escape' && evtType === 'keydown') {
        if (carMusic.isOpen) toggleStereoDeck();
        releaseNuiFocus(true);
        return;
      }
    }
  }, true); // TRUE = Root capture phase!
});

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initDom();
  if (typeof initTestSimulator === 'function') {
  }
  initResizeGrip();
  initMoveGrip();
  initStereoDeck();
  initYouTubeApi();
  initCabinCloudSync();

  // Auto-adapt scale to screen resolution unless player manually saved a preference
  try {
    const savedScale = localStorage.getItem('ae86_cluster_scale');
    if (savedScale !== null) {
      setClusterScale(parseFloat(savedScale), false);
    } else {
      setClusterScale(getIdealClusterScale(), false);
    }
  } catch (e) {
    setClusterScale(getIdealClusterScale(), false);
  }

  // Restore saved position and clamp within screen boundaries
  try {
    const cluster = document.getElementById('speedo-cluster');
    const savedRight = localStorage.getItem('ae86_cluster_pos_right');
    const savedBottom = localStorage.getItem('ae86_cluster_pos_bottom');
    if (cluster && savedRight !== null && savedBottom !== null) {
      cluster.style.right = savedRight;
      cluster.style.bottom = savedBottom;
    }
  } catch (e) {}
  clampClusterPosition();

  // Listen to window resize (game resolution change or windowed resize)
  window.addEventListener('resize', () => {
    try {
      const savedScale = localStorage.getItem('ae86_cluster_scale');
      if (savedScale === null) {
        setClusterScale(getIdealClusterScale(), false);
      }
    } catch (e) {}
    clampClusterPosition();
  });

  // Initial Seed
  setSpeed(0);
  setRPM(0.1);
  setFuel(0.85);
  setHealth(1.0);
  setGear(1);
  setSeatbelts(true);
  setEngine(true);
  setOdometer(86240.5);
  renderDashboard();
});
