// Everything that changes during play lives in one plain object, so the live loop,
// offline catch-up, saving and rendering all read and write the same thing.

export const PHASE_SECONDS = 300;              // one daytime or one night
export const DAY_SECONDS = PHASE_SECONDS * 2;  // a full in-game day
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const METER_MAX = 100;
export const METERS = ['water', 'nutrients', 'sunlight', 'co2'];
// Fall arrives at the dawn after this day; the score is flowers bloomed by then.
export const SEASON_DAYS = 7;

export function createInitialState() {
    return {
        atp: 25,
        water: 20,
        nutrients: 20,
        sunlight: 0,
        co2: 0,
        roots: 0,
        stems: 0,
        leaves: 0,
        flowers: 0,
        day: 1,
        isDaytime: true,
        phaseSecondsLeft: PHASE_SECONDS,
        weather: 'clear',
        specialization: null,
        specializationSecondsLeft: 0,
        seasonOver: false,
    };
}

export function seasonSecondsLeft(state) {
    if (state.seasonOver) return 0;
    const restOfToday = state.phaseSecondsLeft + (state.isDaytime ? PHASE_SECONDS : 0);
    return restOfToday + (SEASON_DAYS - state.day) * DAY_SECONDS;
}
