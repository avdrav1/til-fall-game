import { createInitialState, MAX_OFFLINE_SECONDS } from './state.js';
import { simulate, computeRates, WEATHER } from './resourceManagement.js';
import { PARTS, PART_LABEL, grow, growMany } from './growth.js';
import { SPECIALIZATIONS, specialize } from './specialization.js';
import { saveGame, loadGame, clearSave, loadBestSeason, recordSeason } from './storageManager.js';
import { render, toast, formatDuration, showSpecializationDescription } from './uiUpdates.js';
import { initializeBackgroundMusic, toggleBackgroundMusic, isMusicPlaying, enableMusic, disableMusic } from './backgroundMusic.js';

// Short ticks keep buttons responsive as resources cross a cost; simulate() scales by real
// elapsed time, so the tick length does not change the game's speed.
const TICK_MS = 250;
const OFFLINE_REPORT_SECONDS = 60;

let state = createInitialState();
let isPaused = false;
let lastTick = Date.now();
let resumeMusicOnUnpause = false;
let bestSeason = loadBestSeason();

function refresh() {
    render(state, computeRates(state), isPaused, bestSeason);
}

function persist() {
    saveGame(state, isPaused);
}

function announce(events) {
    for (const event of events) {
        if (event.type === 'dawn') {
            const weather = WEATHER[event.weather];
            toast(`Day ${event.day} begins: ${weather.label.toLowerCase()} ${weather.dayEmoji}`);
        } else if (event.type === 'dusk') {
            toast('Night falls. Leaves rest; roots keep working. 🌙');
        } else if (event.type === 'specialization-expired') {
            toast(`Your ${SPECIALIZATIONS[event.specialization].label} specialization has ended. You can choose again.`);
        } else if (event.type === 'fall') {
            bestSeason = recordSeason(event.flowers);
            toast('🍂 Fall has come!');
        }
    }
}

function tick() {
    const now = Date.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;
    if (!isPaused && elapsed > 0) announce(simulate(state, elapsed));
    refresh();
}

function growFromInput(part, all) {
    if (isPaused) return;
    if (all) {
        const grown = growMany(state, part);
        if (grown > 0) toast(`Grew ${grown} ${PART_LABEL[part].toLowerCase()}${grown === 1 ? '' : 's'}.`, 'success');
        else toast(grow(state, part)[0], 'warning');
    } else {
        const blockers = grow(state, part);
        if (blockers.length > 0) toast(blockers[0], 'warning');
        else if (part === 'flower') toast(`A flower bloomed! 🌸 (${state.flowers} total)`, 'success');
    }
    refresh();
    persist();
}

function togglePause() {
    if (state.seasonOver) return;
    isPaused = !isPaused;
    if (isPaused) {
        resumeMusicOnUnpause = isMusicPlaying();
        if (resumeMusicOnUnpause) disableMusic();
    } else {
        lastTick = Date.now();
        if (resumeMusicOnUnpause) enableMusic();
    }
    refresh();
    persist();
}

function startNewSeason() {
    clearSave();
    state = createInitialState();
    isPaused = false;
    lastTick = Date.now();
    refresh();
    persist();
    toast(`A new seed is planted. 🌱 Bloom as many flowers as you can before fall.`);
}

function resetGame() {
    if (!window.confirm('Start over? This season\'s plant will be lost. Your best season is kept.')) return;
    startNewSeason();
}

function catchUpOffline(savedAt) {
    const away = (Date.now() - savedAt) / 1000;
    if (away <= 0) return;
    const simulated = Math.min(away, MAX_OFFLINE_SECONDS);
    const before = { atp: state.atp, day: state.day };
    const events = simulate(state, simulated);
    const fell = events.some((event) => event.type === 'fall');
    if (away >= OFFLINE_REPORT_SECONDS) {
        const capped = away > MAX_OFFLINE_SECONDS ? ` (progress is capped at ${MAX_OFFLINE_SECONDS / 3600} hours)` : '';
        const days = state.day - before.day;
        const dayText = days > 0 ? ` and ${days} day${days === 1 ? '' : 's'} passed` : '';
        const fallText = fell ? ' 🍂 Fall came while you were away.' : '';
        toast(`While you were away for ${formatDuration(away)}, your plant made ${Math.floor(state.atp - before.atp).toLocaleString()} ATP${dayText}${capped}.${fallText}`);
    }
}

function wireInputs() {
    for (const part of PARTS) {
        document.getElementById(`grow-${part}`)?.addEventListener('click', (event) => growFromInput(part, event.shiftKey));
    }

    for (const button of document.querySelectorAll('[data-specialization]')) {
        const key = button.dataset.specialization;
        const describe = () => showSpecializationDescription(key);
        button.addEventListener('mouseenter', describe);
        button.addEventListener('focus', describe);
        button.addEventListener('click', () => {
            if (isPaused || !specialize(state, key)) return;
            showSpecializationDescription(key);
            toast(`Specialized in ${SPECIALIZATIONS[key].label}. ${SPECIALIZATIONS[key].emoji}`, 'success');
            refresh();
            persist();
        });
    }

    document.getElementById('pause-game')?.addEventListener('click', togglePause);
    document.getElementById('reset-game')?.addEventListener('click', resetGame);
    document.getElementById('new-season')?.addEventListener('click', startNewSeason);

    const musicButton = document.getElementById('music-toggle');
    musicButton?.addEventListener('click', () => {
        toggleBackgroundMusic();
        musicButton.textContent = isMusicPlaying() ? 'Disable Music' : 'Enable Music';
    });

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select')) return;
        const part = PARTS[Number(event.code.replace('Digit', '')) - 1];
        if (event.code.startsWith('Digit') && part) {
            event.preventDefault();
            growFromInput(part, event.shiftKey);
        } else if (event.code === 'KeyP') {
            event.preventDefault();
            togglePause();
        }
    });

    // Background tabs throttle timers; save on the way out so offline catch-up starts from now.
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persist();
    });
}

function start() {
    initializeBackgroundMusic();
    const saved = loadGame();
    if (saved) {
        state = saved.state;
        isPaused = saved.isPaused;
        if (!isPaused) catchUpOffline(saved.savedAt);
        // Covers fall during offline catch-up and saves that had already reached fall.
        if (state.seasonOver) bestSeason = recordSeason(state.flowers);
    } else {
        toast('Welcome! Bloom as many flowers as you can before fall. Follow the 🎯 goal to get started.');
    }
    lastTick = Date.now();
    wireInputs();
    refresh();
    persist();
    setInterval(tick, TICK_MS);
    setInterval(persist, 1000);
}

start();
