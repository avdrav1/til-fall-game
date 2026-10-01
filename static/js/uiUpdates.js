import { PHASE_SECONDS, DAY_SECONDS, METER_MAX, METERS, SEASON_DAYS, seasonSecondsLeft } from './state.js';
import { WEATHER } from './resourceManagement.js';
import { PARTS, PART_FIELD, BULK_GROW_LIMIT, getCost, getBlockers, nextGoal } from './growth.js';
import { SPECIALIZATIONS, SPECIALIZATION_SECONDS, activeSpecialization } from './specialization.js';
import { renderPlant } from './plantView.js';

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 37;
const COST_LABEL = { atp: 'ATP', water: '💧', nutrients: '🧪' };
const SOURCE_LABEL = { roots: 'Roots', leaves: 'Leaves', photosynthesis: 'Photosynthesis', night: 'Night' };
const METER_NAME = { sunlight: 'sunlight', water: 'water', co2: 'CO₂' };

const byId = (id) => document.getElementById(id);

function setText(id, text) {
    const element = byId(id);
    if (element && element.textContent !== text) element.textContent = text;
}

function signed(value, digits = 2) {
    const rounded = value.toFixed(digits);
    return value >= 0 ? `+${rounded}` : rounded.replace('-', '−');
}

export function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return `${s}s`;
}

function formatBreakdown(parts) {
    return Object.entries(parts)
        .filter(([, value]) => Math.abs(value) >= 0.005)
        .map(([source, value]) => `${SOURCE_LABEL[source]} ${signed(value)}`)
        .join(' · ');
}

function renderClock(state) {
    const weather = WEATHER[state.weather] ?? WEATHER.clear;
    const elapsedToday = (state.isDaytime ? 0 : PHASE_SECONDS) + (PHASE_SECONDS - state.phaseSecondsLeft);
    const radians = (elapsedToday / DAY_SECONDS) * 2 * Math.PI;
    const hand = byId('clock-hand');
    if (hand) hand.setAttribute('d', `M100 100 L${100 + 90 * Math.sin(radians)} ${100 - 90 * Math.cos(radians)}`);

    byId('day-night-background')?.classList.toggle('night', !state.isDaytime);
    setText('day-counter', `Day ${state.day} of ${SEASON_DAYS}`);
    if (state.seasonOver) {
        setText('day-night-indicator', 'Fall 🍂');
        setText('phase-countdown', 'The season is over');
        return;
    }
    setText('day-night-indicator', state.isDaytime ? 'Daytime 🌞' : 'Nighttime 🌙');
    setText('weather-indicator', `${weather.label} ${state.isDaytime ? weather.dayEmoji : weather.nightEmoji}`);
    setText('phase-countdown', `${state.isDaytime ? 'Night' : 'Dawn'} in ${formatDuration(state.phaseSecondsLeft)}`);
}

function renderMeters(state, rates) {
    for (const meter of METERS) {
        const meterElement = byId(`${meter}-meter`);
        if (meterElement) meterElement.value = state[meter];
        setText(`${meter}-value`, `${Math.floor(state[meter])} / ${METER_MAX}`);
        const net = byId(`${meter}-net`);
        if (net) {
            const rate = rates[meter];
            const clamp = state[meter] >= METER_MAX && rate > 0 ? ' (full)' : state[meter] <= 0 && rate < 0 ? ' (empty)' : '';
            net.textContent = `${signed(rate)}/s${clamp}`;
            net.classList.toggle('rate-up', rate > 0.005);
            net.classList.toggle('rate-down', rate < -0.005);
        }
        setText(`${meter}-rate`, formatBreakdown(rates.breakdown[meter]) || 'Nothing is changing this yet.');
    }
}

function renderAtp(state, rates) {
    setText('atp-counter', Math.floor(state.atp).toLocaleString());
    setText('atp-production-rate', `${rates.atp.toFixed(2)} per second`);
    setText('atp-breakdown', formatBreakdown(rates.breakdown.atp));
}

function tipFor(state, rates) {
    if (state.leaves === 0 || rates.efficiency >= 0.5) return '';
    const limit = rates.limitingFactor;
    const percent = Math.round(rates.efficiency * 100);
    let advice;
    if (limit === 'sunlight') advice = state.isDaytime ? 'Leaves gather sunlight during the day; more leaves gather it faster.' : 'Sunlight only builds during the day. Your roots keep making ATP overnight.';
    else if (limit === 'water') advice = 'Grow more roots, or wait for rain.';
    else advice = 'Leaves take in CO₂; it will build up on its own.';
    return `Photosynthesis is at ${percent}%, held back by ${METER_NAME[limit]}. ${advice}`;
}

function renderGrowButtons(state, isPaused) {
    for (const part of PARTS) {
        const button = byId(`grow-${part}`);
        if (!button) continue;
        const blockers = getBlockers(state, part);
        button.disabled = isPaused || blockers.length > 0;
        const cost = Object.entries(getCost(state, part))
            .map(([resource, amount]) => `${amount} ${COST_LABEL[resource]}`)
            .join(' · ');
        setText(`grow-${part}-cost`, cost);
        setText(`grow-${part}-blocker`, blockers[0] ?? '');
        button.title = blockers.length > 0 ? blockers.join('\n') : `Shift+click to grow up to ${BULK_GROW_LIMIT} at once`;
    }
}

function renderSpecialization(state, isPaused) {
    const active = activeSpecialization(state);
    for (const button of document.querySelectorAll('[data-specialization]')) {
        button.disabled = isPaused || state.seasonOver || active !== null;
        button.classList.toggle('active', state.specialization === button.dataset.specialization);
    }

    const progress = byId('specialization-progress');
    if (progress) {
        const fraction = active ? state.specializationSecondsLeft / SPECIALIZATION_SECONDS : 0;
        progress.setAttribute('stroke-dasharray', String(TIMER_CIRCUMFERENCE));
        progress.setAttribute('stroke-dashoffset', String(TIMER_CIRCUMFERENCE * (1 - fraction)));
    }
    setText('specialization-emoji', active ? active.emoji : '');
    setText('specialization-text', active
        ? `${active.label} · ${(state.specializationSecondsLeft / DAY_SECONDS).toFixed(1)} days left`
        : 'None');
    // While one is active, the panel explains the one in effect, not whatever was last hovered.
    if (active) setText('specialization-description', active.description);
}

function renderSeason(state, bestSeason) {
    setText('season-countdown', state.seasonOver
        ? '🍂 Fall has come'
        : `🍂 Fall in ${formatDuration(seasonSecondsLeft(state))} (end of day ${SEASON_DAYS})`);
    setText('season-score', `🌸 ${state.flowers} this season`);
    setText('season-best', `🏆 Best season: ${bestSeason > 0 ? bestSeason : 'none yet'}`);

    const overlay = byId('season-over');
    if (overlay) overlay.hidden = !state.seasonOver;
    if (!state.seasonOver) return;
    setText('season-final-score', `You bloomed ${state.flowers} flower${state.flowers === 1 ? '' : 's'} this season.`);
    setText('season-final-best', state.flowers > 0 && state.flowers >= bestSeason
        ? '🏆 Your best season yet!'
        : `Best season: ${bestSeason} flower${bestSeason === 1 ? '' : 's'}.`);
}

export function render(state, rates, isPaused, bestSeason) {
    document.body.classList.toggle('paused', isPaused);
    renderClock(state);
    renderAtp(state, rates);
    renderMeters(state, rates);
    renderGrowButtons(state, isPaused);
    renderSpecialization(state, isPaused);
    renderPlant(state);
    for (const field of Object.values(PART_FIELD)) setText(`${field}-count`, String(state[field]));
    setText('goal-text', nextGoal(state));
    setText('tip-text', state.seasonOver ? '' : tipFor(state, rates));
    renderSeason(state, bestSeason);
    const pause = byId('pause-game');
    if (pause) {
        pause.firstChild.textContent = isPaused ? 'Resume ' : 'Pause ';
        pause.disabled = state.seasonOver;
    }
}

export function showSpecializationDescription(key) {
    const description = SPECIALIZATIONS[key]?.description;
    if (description) setText('specialization-description', description);
}

export function toast(message, kind = 'info') {
    const container = byId('toast-container');
    if (!container) return;
    const element = document.createElement('div');
    element.className = `toast toast-${kind}`;
    element.textContent = message;
    container.appendChild(element);
    while (container.children.length > 4) container.firstChild.remove();
    setTimeout(() => element.classList.add('toast-hide'), 3500);
    setTimeout(() => element.remove(), 4000);
}
