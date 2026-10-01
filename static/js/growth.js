import { METERS } from './state.js';
import { activeSpecialization } from './specialization.js';

export const PARTS = ['root', 'stem', 'leaf', 'flower'];
export const PART_FIELD = { root: 'roots', stem: 'stems', leaf: 'leaves', flower: 'flowers' };
export const PART_LABEL = { root: 'Root', stem: 'Stem', leaf: 'Leaf', flower: 'Flower' };

export const ROOTS_FOR_STEM = 3;
export const LEAVES_PER_STEM = 10;
export const FLOWERS_PER_STEM = 3;
export const LEAVES_FOR_FLOWER = 50;
export const FLOWER_METER_THRESHOLD = 90;
// Blooming draws this much from every meter; thresholds are always above it.
export const FLOWER_METER_COST = 50;

const BASE_COSTS = {
    root: { atp: 5 },
    stem: { atp: 8, water: 2, nutrients: 2 },
    leaf: { atp: 5, water: 2, nutrients: 2 },
    flower: { atp: 100 },
};

const RESOURCE_LABEL = { atp: 'ATP', water: 'water', nutrients: 'nutrients', sunlight: 'sunlight', co2: 'CO₂' };

export function getCost(state, part) {
    return { ...BASE_COSTS[part], ...activeSpecialization(state)?.costs?.[part] };
}

export function getFlowerThreshold(state) {
    return activeSpecialization(state)?.flowerThreshold ?? FLOWER_METER_THRESHOLD;
}

// Everything stopping `part` from growing right now, as player-facing sentences. Structural
// requirements come first: they tell the player what to build, not just what to wait for.
export function getBlockers(state, part) {
    if (state.seasonOver) return ['Fall has come. Start a new season to grow again.'];
    const blockers = [];
    if (part === 'stem' && state.roots < ROOTS_FOR_STEM) {
        blockers.push(`Needs ${ROOTS_FOR_STEM} roots (${state.roots}/${ROOTS_FOR_STEM})`);
    }
    if (part === 'leaf') {
        if (state.stems < 1) blockers.push('Needs a stem');
        else if (state.leaves >= state.stems * LEAVES_PER_STEM) blockers.push(`Each stem holds ${LEAVES_PER_STEM} leaves — grow a stem`);
    }
    if (part === 'flower') {
        if (state.stems < 1) blockers.push('Needs a stem');
        else if (state.flowers >= state.stems * FLOWERS_PER_STEM) blockers.push(`Each stem holds ${FLOWERS_PER_STEM} flowers — grow a stem`);
        if (state.leaves < LEAVES_FOR_FLOWER) blockers.push(`Needs ${LEAVES_FOR_FLOWER} leaves (${state.leaves}/${LEAVES_FOR_FLOWER})`);
        const threshold = getFlowerThreshold(state);
        for (const meter of METERS) {
            if (state[meter] < threshold) {
                blockers.push(`Needs ${RESOURCE_LABEL[meter]} ≥ ${threshold} (${Math.floor(state[meter])})`);
            }
        }
    }
    for (const [resource, amount] of Object.entries(getCost(state, part))) {
        if (state[resource] < amount) {
            blockers.push(`Needs ${amount} ${RESOURCE_LABEL[resource]} (${Math.floor(state[resource])})`);
        }
    }
    return blockers;
}

export function grow(state, part) {
    const blockers = getBlockers(state, part);
    if (blockers.length > 0) return blockers;
    for (const [resource, amount] of Object.entries(getCost(state, part))) {
        state[resource] -= amount;
    }
    if (part === 'flower') {
        for (const meter of METERS) state[meter] -= FLOWER_METER_COST;
    }
    state[PART_FIELD[part]] += 1;
    return blockers;
}

// Shift-grow buys at most this many per press: unbounded, one press of Shift+Stem could
// spend every drop of water and stall photosynthesis.
export const BULK_GROW_LIMIT = 10;

// Grows up to BULK_GROW_LIMIT in one go; returns how many grew.
export function growMany(state, part) {
    let grown = 0;
    while (grown < BULK_GROW_LIMIT && grow(state, part).length === 0) grown += 1;
    return grown;
}


// The next milestone, phrased as an instruction.
export function nextGoal(state) {
    if (state.seasonOver) return `Fall has come. You bloomed ${state.flowers} flower${state.flowers === 1 ? '' : 's'} this season.`;
    if (state.roots === 0) return 'Grow your first root. Roots make ATP and draw up water and nutrients.';
    if (state.roots < ROOTS_FOR_STEM) {
        const missing = ROOTS_FOR_STEM - state.roots;
        return `Grow ${missing} more root${missing === 1 ? '' : 's'}: a stem needs ${ROOTS_FOR_STEM} roots to stand on.`;
    }
    if (state.stems === 0) return `Grow a stem. Each stem holds ${LEAVES_PER_STEM} leaves and ${FLOWERS_PER_STEM} flowers.`;
    if (state.leaves === 0) return 'Grow a leaf to start photosynthesis: sunlight + water + CO₂ → ATP.';
    if (state.leaves < LEAVES_FOR_FLOWER) {
        return `Grow toward ${LEAVES_FOR_FLOWER} leaves (${state.leaves}/${LEAVES_FOR_FLOWER}). Add stems for room and roots to keep water up.`;
    }
    const threshold = getFlowerThreshold(state);
    if (state.flowers === 0) return `Fill all four meters to ${threshold} during the day, then bloom your first flower.`;
    return `Bloom as many flowers as you can before fall (${state.flowers} so far). Each bloom draws ${FLOWER_METER_COST} from every meter.`;
}
