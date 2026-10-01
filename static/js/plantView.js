import { LEAVES_PER_STEM, FLOWERS_PER_STEM } from './growth.js';

// Draws the plant the part counts describe. Each part's position depends only on its index,
// so parts are only ever appended: what is already on screen never moves, and only new
// growth animates. A drop in any count (new season) clears the drawing and starts over.

const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE_X = 300;
const GROUND_Y = 160;
const SHOOT_HEIGHT = 140;
// Parts appearing in one render are staggered so they grow in order: roots, stems, leaves,
// flowers. A saved plant regrows within BATCH_SECONDS on load, however large it is.
const STEP_SECONDS = 0.08;
const BATCH_SECONDS = 2;
const BRANCH_DELAY_SECONDS = 0.3;
const FLOWER_SPOTS = [1, 0.62, 0.36];

const drawn = { roots: 0, stems: 0, leaves: 0, flowers: 0 };

// Stable pseudo-random value in [0, 1) for a part, so the plant looks the same after a reload.
function noise(index, salt) {
    const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function create(tag, attributes, parent) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    parent.appendChild(element);
    return element;
}

function delayed(element, seconds) {
    element.style.animationDelay = `${seconds.toFixed(2)}s`;
    return element;
}

const round = (value) => Math.round(value * 10) / 10;

// Stem i adds one internode to the main stalk, ending at node i, plus a side branch there.
// Internodes shorten as the plant rises, so the stalk approaches SHOOT_HEIGHT without passing it.
function stalkNode(i) {
    if (i < 0) return { x: BASE_X, y: GROUND_Y };
    return {
        x: BASE_X + (noise(i, 1) - 0.5) * 8,
        y: GROUND_Y - SHOOT_HEIGHT * (1 - 0.9 ** (i + 2)),
    };
}

function branchCurve(i) {
    const start = stalkNode(i);
    const side = i % 2 === 0 ? 1 : -1;
    const length = 20 + 70 * 0.86 ** i;
    const lift = ((25 + noise(i, 2) * 20) * Math.PI) / 180;
    return {
        start,
        control: { x: start.x + side * length * 0.6, y: start.y - length * 0.05 },
        end: { x: start.x + side * length * Math.cos(lift), y: start.y - length * Math.sin(lift) },
    };
}

// Point on a quadratic curve, with the tangent direction in degrees.
function pointOn({ start, control, end }, t) {
    const u = 1 - t;
    const dx = 2 * u * (control.x - start.x) + 2 * t * (end.x - control.x);
    const dy = 2 * u * (control.y - start.y) + 2 * t * (end.y - control.y);
    return {
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
}

function curvePath({ start, control, end }) {
    return `M${round(start.x)} ${round(start.y)} Q${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`;
}

function addRoot(i, delay, group) {
    // Golden-ratio steps spread successive roots evenly across ±75° from straight down.
    const angle = ((((i * 0.618034) % 1) * 2 - 1) * 75 * Math.PI) / 180;
    const length = 22 + noise(i, 3) * 33;
    const start = { x: BASE_X, y: GROUND_Y + 2 };
    const end = { x: start.x + length * Math.sin(angle), y: start.y + length * Math.cos(angle) };
    const bend = (noise(i, 4) - 0.5) * 14;
    const control = {
        x: (start.x + end.x) / 2 + bend * Math.cos(angle),
        y: (start.y + end.y) / 2 - bend * Math.sin(angle),
    };
    delayed(create('path', {
        class: 'plant-root grow-line',
        d: curvePath({ start, control, end }),
        'stroke-width': round(Math.max(1.2, 2.4 - i * 0.1)),
        pathLength: 1,
    }, group), delay);
}

function addStem(i, delay, group) {
    const width = Math.max(1.8, 6 - i * 0.3);
    const from = stalkNode(i - 1);
    const to = stalkNode(i);
    delayed(create('path', {
        class: 'plant-stem grow-line',
        d: `M${round(from.x)} ${round(from.y)} L${round(to.x)} ${round(to.y)}`,
        'stroke-width': round(width),
        pathLength: 1,
    }, group), delay);
    delayed(create('path', {
        class: 'plant-stem grow-line',
        d: curvePath(branchCurve(i)),
        'stroke-width': round(Math.max(1.2, width * 0.55)),
        pathLength: 1,
    }, group), delay + BRANCH_DELAY_SECONDS);
}

function addLeaf(j, stemIndex, delay, group) {
    const k = j % LEAVES_PER_STEM;
    const point = pointOn(branchCurve(stemIndex), 0.12 + (0.8 * k) / (LEAVES_PER_STEM - 1));
    const side = k % 2 === 0 ? -1 : 1;
    const length = 11 + noise(j, 5) * 5;
    const width = length * 0.4;
    const holder = create('g', {
        transform: `translate(${round(point.x)} ${round(point.y)}) rotate(${round(point.angle + side * 50)})`,
    }, group);
    delayed(create('path', {
        class: `plant-leaf leaf-${j % 3} grow-in`,
        d: `M0 0 Q${round(length / 2)} ${round(-width)} ${round(length)} 0 Q${round(length / 2)} ${round(width)} 0 0Z`,
    }, holder), delay);
}

function addFlower(f, stemIndex, delay, group) {
    const point = pointOn(branchCurve(stemIndex), FLOWER_SPOTS[f % FLOWERS_PER_STEM] ?? 1);
    const holder = create('g', { transform: `translate(${round(point.x)} ${round(point.y - 3)})` }, group);
    const bloom = delayed(create('g', { class: 'grow-bloom' }, holder), delay);
    for (let petal = 0; petal < 5; petal += 1) {
        create('ellipse', {
            class: `plant-petal petal-${f % 3}`,
            cx: 4, cy: 0, rx: 4.5, ry: 2.6,
            transform: `rotate(${petal * 72})`,
        }, bloom);
    }
    create('circle', { class: 'plant-flower-center', r: 2.2 }, bloom);
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

export function renderPlant(state) {
    const view = document.getElementById('plant-view');
    if (!view) return;
    view.classList.toggle('night', !state.isDaytime && !state.seasonOver);
    view.classList.toggle('fall', state.seasonOver);

    const groups = {
        roots: document.getElementById('plant-roots'),
        stems: document.getElementById('plant-stems'),
        leaves: document.getElementById('plant-leaves'),
        flowers: document.getElementById('plant-flowers'),
    };
    if (Object.keys(drawn).some((field) => state[field] < drawn[field])) {
        for (const field of Object.keys(drawn)) {
            groups[field].replaceChildren();
            drawn[field] = 0;
        }
    }

    const label = document.getElementById('plant-view-label');
    const description = `Your plant: ${plural(state.roots, 'root', 'roots')}, ${plural(state.stems, 'stem', 'stems')}, `
        + `${plural(state.leaves, 'leaf', 'leaves')}, ${plural(state.flowers, 'flower', 'flowers')}`;
    if (label && label.textContent !== description) label.textContent = description;

    const pending = Object.keys(drawn).reduce((sum, field) => sum + state[field] - drawn[field], 0);
    if (pending === 0) return;
    const step = Math.min(STEP_SECONDS, BATCH_SECONDS / pending);
    let order = 0;
    const nextDelay = () => step * order++;
    const lastStem = Math.max(0, state.stems - 1);

    for (; drawn.roots < state.roots; drawn.roots += 1) addRoot(drawn.roots, nextDelay(), groups.roots);
    for (; drawn.stems < state.stems; drawn.stems += 1) addStem(drawn.stems, nextDelay(), groups.stems);
    for (; drawn.leaves < state.leaves; drawn.leaves += 1) {
        const stemIndex = Math.min(Math.floor(drawn.leaves / LEAVES_PER_STEM), lastStem);
        addLeaf(drawn.leaves, stemIndex, nextDelay(), groups.leaves);
    }
    for (; drawn.flowers < state.flowers; drawn.flowers += 1) {
        const stemIndex = Math.min(Math.floor(drawn.flowers / FLOWERS_PER_STEM), lastStem);
        addFlower(drawn.flowers, stemIndex, nextDelay(), groups.flowers);
    }
}
