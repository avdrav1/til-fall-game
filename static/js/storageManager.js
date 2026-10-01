import { createInitialState, PHASE_SECONDS, DAY_SECONDS, SEASON_DAYS } from './state.js';
import { SPECIALIZATIONS, SPECIALIZATION_SECONDS } from './specialization.js';
import { WEATHER } from './resourceManagement.js';

const STORAGE_KEY = 'gameState';
// Kept apart from the save so starting a new season or resetting never erases it.
const BEST_KEY = 'bestSeasonFlowers';
const SAVE_VERSION = 2;

export function saveGame(state, isPaused) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        state,
        isPaused,
        savedAt: Date.now(),
    }));
}

export function clearSave() {
    localStorage.removeItem(STORAGE_KEY);
}

export function loadBestSeason() {
    const best = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(best) && best > 0 ? Math.floor(best) : 0;
}

// Returns the best season including this one.
export function recordSeason(flowers) {
    const best = Math.max(loadBestSeason(), flowers);
    localStorage.setItem(BEST_KEY, String(best));
    return best;
}

// Saves written before version 2 kept the plant under `plantData`, counted down
// `specializationExpiresIn` in days, and could store weather as 'sunny' and the leaf
// specialization as 'leafs'. Map them onto the current shape rather than wiping progress.
function fromLegacy(saved) {
    const plant = saved.plantData ?? {};
    const specialization = plant.specialization === 'leafs' ? 'leaves' : plant.specialization;
    return {
        ...plant,
        day: saved.dayCounter,
        isDaytime: saved.isDaytime,
        phaseSecondsLeft: saved.countdown,
        weather: saved.currentWeather === 'sunny' ? 'clear' : saved.currentWeather,
        specialization,
        specializationSecondsLeft: Math.min(SPECIALIZATION_SECONDS, Number(plant.specializationExpiresIn) * DAY_SECONDS),
    };
}

function normalize(raw) {
    const state = createInitialState();
    for (const [key, fallback] of Object.entries(state)) {
        if (typeof fallback === 'number') {
            const value = Number(raw[key]);
            if (Number.isFinite(value) && value >= 0) state[key] = value;
        }
    }
    state.day = Math.max(1, Math.floor(state.day));
    state.isDaytime = raw.isDaytime !== undefined ? Boolean(raw.isDaytime) : true;
    if (state.phaseSecondsLeft <= 0 || state.phaseSecondsLeft > PHASE_SECONDS) state.phaseSecondsLeft = PHASE_SECONDS;
    state.weather = WEATHER[raw.weather] ? raw.weather : 'clear';
    if (SPECIALIZATIONS[raw.specialization] && state.specializationSecondsLeft > 0) {
        state.specialization = raw.specialization;
        state.specializationSecondsLeft = Math.min(SPECIALIZATION_SECONDS, state.specializationSecondsLeft);
    } else {
        state.specializationSecondsLeft = 0;
    }
    // A season never runs past SEASON_DAYS; a save that has (legacy, or edited) has already seen fall.
    state.seasonOver = Boolean(raw.seasonOver) || state.day > SEASON_DAYS;
    if (state.seasonOver) {
        state.day = Math.min(state.day, SEASON_DAYS);
        state.isDaytime = false;
        state.phaseSecondsLeft = 0;
    }
    return state;
}

// Returns { state, isPaused, savedAt } or null when there is no usable save.
export function loadGame() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
    if (!saved || typeof saved !== 'object') return null;
    const raw = saved.version === SAVE_VERSION ? saved.state ?? {} : fromLegacy(saved);
    return {
        state: normalize(raw),
        isPaused: Boolean(saved.isPaused),
        savedAt: Number(saved.savedAt ?? saved.lastSaved) || Date.now(),
    };
}
