// ── Timer State ──
const PHASES = {
  focus: { label: 'Focus', minutes: 25, next: 'shortBreak', color: 'url(#gradient-focus)' },
  shortBreak: { label: 'Short Break', minutes: 5, next: 'focus', color: 'url(#gradient-break)' },
  longBreak: { label: 'Long Break', minutes: 15, next: 'focus', color: 'url(#gradient-break)' }
};

const state = {
  phase: 'focus',        // 'focus' | 'shortBreak' | 'longBreak'
  status: 'idle',        // 'idle' | 'running' | 'paused' | 'finished'
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  sessionsCompleted: 0,   // 0-4 focus sessions done in current cycle
  intervalId: null
};

// ── DOM Elements ──
const timeText = document.getElementById('time-text');
const phaseText = document.getElementById('phase-text');
const progressFill = document.getElementById('progress-fill');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const btnStats = document.getElementById('btn-stats');
const btnPin = document.getElementById('btn-pin');
const btnMinimize = document.getElementById('btn-minimize');
const btnClose = document.getElementById('btn-close');
const btnStatsClose = document.getElementById('btn-stats-close');
const statsPanel = document.getElementById('stats-panel');
const panelOverlay = document.getElementById('panel-overlay');
const statsList = document.getElementById('stats-list');
const sessionDots = document.getElementById('session-dots');
const sessionLabel = document.getElementById('session-label');
const audio = document.getElementById('audio-complete');

// Settings DOM
const btnSettings = document.getElementById('btn-settings');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsPanel = document.getElementById('settings-panel');
const settingFocus = document.getElementById('setting-focus');
const settingShortBreak = document.getElementById('setting-short-break');
const settingLongBreak = document.getElementById('setting-long-break');
const settingSessions = document.getElementById('setting-sessions');
const btnSaveSettings = document.getElementById('btn-save-settings');

// Settings defaults
const DEFAULT_SETTINGS = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  sessions: 4
};
const SETTINGS_KEY = 'pomodoro-settings';

// SVG ring circumference: 2 * PI * 130 ≈ 816.81
const CIRCUMFERENCE = 2 * Math.PI * 130;

// ── Audio: generate a simple beep sound using AudioContext ──
function generateBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

// ── Format ──
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Update UI ──
function updateDisplay() {
  timeText.textContent = formatTime(state.remainingSeconds);
  phaseText.textContent = PHASES[state.phase].label;

  // Progress ring: offset increases as time passes (ring depletes)
  const fractionElapsed = (state.totalSeconds - state.remainingSeconds) / state.totalSeconds;
  progressFill.style.strokeDashoffset = CIRCUMFERENCE * fractionElapsed;
  progressFill.setAttribute('stroke', PHASES[state.phase].color);

  // Buttons
  if (state.status === 'idle' || state.status === 'finished') {
    btnStart.textContent = 'Start';
    btnStart.classList.remove('pause-state');
    btnReset.disabled = true;
  } else if (state.status === 'running') {
    btnStart.textContent = 'Pause';
    btnStart.classList.add('pause-state');
    btnReset.disabled = false;
  } else if (state.status === 'paused') {
    btnStart.textContent = 'Resume';
    btnStart.classList.add('pause-state');
    btnReset.disabled = false;
  }

  // Session dots
  renderSessionDots();
  updateSessionLabel();

  // Tray
  if (window.electronAPI) {
    window.electronAPI.updateTray({
      phase: state.phase,
      time: formatTime(state.remainingSeconds)
    });
  }
}

function renderSessionDots() {
  const totalSessions = PHASES.focus.sessions;
  const dots = sessionDots.querySelectorAll('.session-dot');
  dots.forEach((dot, i) => {
    dot.className = 'session-dot';
    if (i < state.sessionsCompleted) {
      dot.classList.add('completed');
    }
    if (i === state.sessionsCompleted && state.phase === 'focus') {
      dot.classList.add('current');
    }
  });
}

function updateSessionLabel() {
  const totalSessions = PHASES.focus.sessions;
  if (state.phase === 'focus') {
    sessionLabel.textContent = `Round ${state.sessionsCompleted + 1} / ${totalSessions}`;
    sessionLabel.style.display = '';
  } else {
    sessionLabel.style.display = 'none';
  }
}

// ── Timer Logic ──
function setPhase(phase) {
  state.phase = phase;
  state.totalSeconds = PHASES[phase].minutes * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';
  state.intervalId = null;
  updateDisplay();
  // Reset progress ring
  progressFill.style.strokeDashoffset = '0';
}

function beginCountdown() {
  state.intervalId = setInterval(() => {
    state.remainingSeconds--;
    if (state.remainingSeconds <= 0) {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.status = 'finished';
      timerFinished();
    }
    updateDisplay();
  }, 1000);
}

function startTimer() {
  if (state.status === 'running') {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.status = 'paused';
    updateDisplay();
    return;
  }

  state.status = 'running';
  updateDisplay();
  beginCountdown();
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';
  updateDisplay();
  progressFill.style.strokeDashoffset = '0';
}

function timerFinished() {
  generateBeep();

  const finishedPhase = state.phase;
  const finishedLabel = PHASES[finishedPhase].label;

  if (state.phase === 'focus') {
    recordPomodoro(state.totalSeconds / 60);
    state.sessionsCompleted++;

    if (state.sessionsCompleted >= PHASES.focus.sessions) {
      state.sessionsCompleted = 0;
      setPhase('longBreak');
    } else {
      setPhase('shortBreak');
    }
  } else {
    setPhase('focus');
  }

  const nextLabel = PHASES[state.phase].label;

  if (window.electronAPI) {
    window.electronAPI.showNotification(
      'Pomodoro',
      `${finishedLabel} finished! Starting ${nextLabel}.`
    );
  }

  updateDisplay();
  progressFill.style.strokeDashoffset = '0';

  // Auto-start next phase
  state.status = 'running';
  updateDisplay();
  beginCountdown();
}

// ── Settings ──
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved.focus === 'number') {
      PHASES.focus.minutes = saved.focus;
      PHASES.shortBreak.minutes = saved.shortBreak;
      PHASES.longBreak.minutes = saved.longBreak;
      PHASES.focus.sessions = saved.sessions;
      // Update input values
      settingFocus.value = saved.focus;
      settingShortBreak.value = saved.shortBreak;
      settingLongBreak.value = saved.longBreak;
      settingSessions.value = saved.sessions;
      return;
    }
  } catch {}
  // Defaults
  PHASES.focus.sessions = DEFAULT_SETTINGS.sessions;
}

function saveSettings() {
  const settings = {
    focus: parseInt(settingFocus.value) || 25,
    shortBreak: parseInt(settingShortBreak.value) || 5,
    longBreak: parseInt(settingLongBreak.value) || 15,
    sessions: parseInt(settingSessions.value) || 4
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  PHASES.focus.minutes = settings.focus;
  PHASES.shortBreak.minutes = settings.shortBreak;
  PHASES.longBreak.minutes = settings.longBreak;
  PHASES.focus.sessions = settings.sessions;
  // Reset timer to new focus duration
  resetTimer();
  setPhase('focus');
  closePanels();
}

// ── Statistics ──
function getStats() {
  try {
    return JSON.parse(localStorage.getItem('pomodoro-stats')) || {};
  } catch {
    return {};
  }
}

function recordPomodoro(focusMinutes) {
  const stats = getStats();
  const today = new Date().toISOString().split('T')[0];
  if (!stats[today]) {
    stats[today] = { completed: 0, focusMinutes: 0 };
  }
  stats[today].completed++;
  stats[today].focusMinutes += focusMinutes;
  localStorage.setItem('pomodoro-stats', JSON.stringify(stats));
}

function renderStats() {
  const stats = getStats();
  const today = new Date();
  const rows = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = stats[key];
    const label = i === 0 ? 'Today' :
      i === 1 ? 'Yesterday' :
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    rows.push({ label, key, completed: entry ? entry.completed : 0, minutes: entry ? entry.focusMinutes : 0 });
  }

  if (rows.every(r => r.completed === 0)) {
    statsList.innerHTML = '<div class="stats-empty">No pomodoros yet.<br>Start focusing!</div>';
    return;
  }

  statsList.innerHTML = rows.map(r => `
    <div class="stats-row">
      <span class="stats-date">${r.label}</span>
      <span class="stats-count">${r.completed} pomodoros</span>
      <span class="stats-minutes">${r.minutes} min</span>
    </div>
  `).join('');
}

function toggleStats() {
  settingsPanel.classList.remove('active');
  const active = statsPanel.classList.toggle('active');
  panelOverlay.classList.toggle('active', active);
  if (active) { renderStats(); }
}

function closePanels() {
  statsPanel.classList.remove('active');
  settingsPanel.classList.remove('active');
  panelOverlay.classList.remove('active');
}

function toggleSettings() {
  settingsPanel.classList.toggle('active');
  const active = settingsPanel.classList.contains('active');
  panelOverlay.classList.toggle('active', active);
  statsPanel.classList.remove('active');
}

function closeStats() {
  closePanels();
}

// ── Event Listeners ──
btnStart.addEventListener('click', startTimer);
btnReset.addEventListener('click', resetTimer);
btnStats.addEventListener('click', toggleStats);
btnStatsClose.addEventListener('click', closePanels);
btnSettings.addEventListener('click', toggleSettings);
btnSettingsClose.addEventListener('click', closePanels);
btnSaveSettings.addEventListener('click', saveSettings);
panelOverlay.addEventListener('click', closePanels);

// Title bar buttons
btnMinimize.addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.hideWindow();
  }
});

btnClose.addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.hideWindow();
  }
});

btnPin.addEventListener('click', () => {
  const newState = !btnPin.classList.contains('active');
  btnPin.classList.toggle('active', newState);
  if (window.electronAPI) {
    window.electronAPI.toggleAlwaysOnTop(newState);
  }
});

// Listen for always-on-top changes from tray
if (window.electronAPI) {
  window.electronAPI.onAlwaysOnTopChanged((isOnTop) => {
    if (isOnTop) {
      btnPin.classList.add('active');
    } else {
      btnPin.classList.remove('active');
    }
  });
}

// Keyboard shortcut: Space to start/pause
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    startTimer();
  }
});

// ── Init ──
loadSettings();
state.totalSeconds = PHASES.focus.minutes * 60;
state.remainingSeconds = state.totalSeconds;
progressFill.style.strokeDasharray = CIRCUMFERENCE;
updateDisplay();
