import { DAY_SECONDS } from './state.js';

export const SPECIALIZATION_DAYS = 3;
export const SPECIALIZATION_SECONDS = SPECIALIZATION_DAYS * DAY_SECONDS;

// Costs here override the matching fields of the base cost in growth.js. Bonuses are
// multipliers read by computeRates(). Descriptions must state exactly these numbers.
export const SPECIALIZATIONS = {
    roots: {
        label: 'Roots',
        emoji: '🌱',
        description: 'For 3 days: roots cost 2 ATP instead of 5, and every root draws up 50% more water and nutrients.',
        costs: { root: { atp: 2 } },
        bonus: { uptake: 1.5 },
    },
    leaves: {
        label: 'Leaves',
        emoji: '🍃',
        description: 'For 3 days: leaves cost 2 ATP, 1 water and 1 nutrient, and photosynthesis makes 50% more ATP.',
        costs: { leaf: { atp: 2, water: 1, nutrients: 1 } },
        bonus: { photosynthesis: 1.5 },
    },
    flowers: {
        label: 'Flowers',
        emoji: '🌸',
        description: 'For 3 days: flowers cost 60 ATP instead of 100 and can bloom once every meter reaches 75 instead of 90.',
        costs: { flower: { atp: 60 } },
        flowerThreshold: 75,
    },
};

export function activeSpecialization(state) {
    return state.specialization ? SPECIALIZATIONS[state.specialization] ?? null : null;
}

export function specializationBonus(state, kind) {
    return activeSpecialization(state)?.bonus?.[kind] ?? 1;
}

export function specialize(state, key) {
    if (state.seasonOver || state.specialization !== null || !SPECIALIZATIONS[key]) return false;
    state.specialization = key;
    state.specializationSecondsLeft = SPECIALIZATION_SECONDS;
    return true;
}
