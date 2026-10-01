import { PHASE_SECONDS, METER_MAX, METERS, SEASON_DAYS } from './state.js';
import { specializationBonus } from './specialization.js';

export const WEATHER = {
    clear:  { label: 'Clear',  dayEmoji: '☀️', nightEmoji: '🌙', light: 1,    rain: 0 },
    cloudy: { label: 'Cloudy', dayEmoji: '☁️', nightEmoji: '☁️', light: 0.5,  rain: 0.3 },
    rainy:  { label: 'Rainy',  dayEmoji: '🌧️', nightEmoji: '🌧️', light: 0.25, rain: 1 },
};

const DAY_WEATHER = [['clear', 0.5], ['cloudy', 0.3], ['rainy', 0.2]];
const NIGHT_WEATHER = [['clear', 0.6], ['rainy', 0.4]];

// Per-second rates. Photosynthesis spends water, CO₂ and stored light for every ATP it makes,
// so a big canopy needs a root system to match.
const ROOT_WATER = 0.12;
const ROOT_NUTRIENTS = 0.05;
const ROOT_ATP_BASE = 0.05;
const ROOT_ATP = 0.05;
const LEAF_TRANSPIRATION = 0.02;
const NIGHT_TRANSPIRATION = 0.3;
const LEAF_LIGHT = 0.25;
const NIGHT_LIGHT_DECAY = 1;
const LEAF_CO2 = 0.1;
const LEAF_ATP = 0.15;
const PHOTOSYNTHESIS_INPUT = 0.2;

export function rollWeather(isDaytime, random = Math.random) {
    const table = isDaytime ? DAY_WEATHER : NIGHT_WEATHER;
    let roll = random();
    for (const [weather, weight] of table) {
        if (roll < weight) return weather;
        roll -= weight;
    }
    return table[table.length - 1][0];
}

// The single source of truth for how the plant changes over time. The loop, offline
// catch-up and every rate shown on screen come from this one function.
export function computeRates(state) {
    const weather = WEATHER[state.weather] ?? WEATHER.clear;
    const light = state.isDaytime ? weather.light : 0;
    const uptake = specializationBonus(state, 'uptake');

    const rootWater = state.roots * ROOT_WATER * (1 + weather.rain) * uptake;
    const rootNutrients = state.roots * ROOT_NUTRIENTS * uptake;
    const rootAtp = state.roots > 0 ? ROOT_ATP_BASE + state.roots * ROOT_ATP : 0;

    const transpiration = state.leaves * LEAF_TRANSPIRATION * (state.isDaytime ? 1 : NIGHT_TRANSPIRATION);
    const lightDecay = state.isDaytime || state.sunlight <= 0 ? 0 : NIGHT_LIGHT_DECAY;
    const leafLight = state.leaves * LEAF_LIGHT * light;
    const leafCo2 = state.leaves * LEAF_CO2;

    let limitingFactor = null;
    let efficiency = 0;
    if (state.leaves > 0) {
        limitingFactor = ['sunlight', 'water', 'co2'].reduce((a, b) => (state[b] < state[a] ? b : a));
        efficiency = state[limitingFactor] / METER_MAX;
    }
    const photosynthesis = state.leaves * LEAF_ATP * efficiency * specializationBonus(state, 'photosynthesis');
    const photoInput = photosynthesis * PHOTOSYNTHESIS_INPUT;

    const breakdown = {
        atp: { roots: rootAtp, photosynthesis },
        water: { roots: rootWater, leaves: -transpiration, photosynthesis: -photoInput },
        nutrients: { roots: rootNutrients },
        sunlight: { leaves: leafLight, night: -lightDecay, photosynthesis: -photoInput },
        co2: { leaves: leafCo2, photosynthesis: -photoInput },
    };
    const net = (parts) => Object.values(parts).reduce((sum, v) => sum + v, 0);

    return {
        atp: net(breakdown.atp),
        water: net(breakdown.water),
        nutrients: net(breakdown.nutrients),
        sunlight: net(breakdown.sunlight),
        co2: net(breakdown.co2),
        breakdown,
        efficiency,
        limitingFactor,
    };
}

function advancePhase(state, random, events) {
    if (!state.isDaytime && state.day >= SEASON_DAYS) {
        state.seasonOver = true;
        state.phaseSecondsLeft = 0;
        events.push({ type: 'fall', flowers: state.flowers });
        return;
    }
    state.isDaytime = !state.isDaytime;
    state.phaseSecondsLeft = PHASE_SECONDS;
    if (state.isDaytime) state.day += 1;
    state.weather = rollWeather(state.isDaytime, random);
    events.push({ type: state.isDaytime ? 'dawn' : 'dusk', day: state.day, weather: state.weather });
}

// Advances the plant by `seconds` in steps of at most one second, stopping exactly on
// day/night boundaries so a long gap (offline, throttled background tab) plays out the same
// as watching it live. Returns the notable things that happened, in order.
export function simulate(state, seconds, random = Math.random) {
    const events = [];
    let remaining = seconds;
    while (remaining > 0 && !state.seasonOver) {
        const dt = Math.min(1, remaining, state.phaseSecondsLeft);
        const rates = computeRates(state);
        state.atp += rates.atp * dt;
        for (const meter of METERS) {
            state[meter] = Math.min(METER_MAX, Math.max(0, state[meter] + rates[meter] * dt));
        }

        if (state.specialization !== null) {
            state.specializationSecondsLeft -= dt;
            if (state.specializationSecondsLeft <= 0) {
                events.push({ type: 'specialization-expired', specialization: state.specialization });
                state.specialization = null;
                state.specializationSecondsLeft = 0;
            }
        }

        state.phaseSecondsLeft -= dt;
        if (state.phaseSecondsLeft <= 1e-9) advancePhase(state, random, events);
        remaining -= dt;
    }
    return events;
}
