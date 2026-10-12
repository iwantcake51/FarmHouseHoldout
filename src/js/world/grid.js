// The 44x44 cell grid: what is in each cell and coordinate helpers.

const EMPTY = 0, WALL = 1, OPEN = 2, OBST = 3, FENCE = 4;
const cell = new Uint8Array(N * N);
const openAt = new Array(N * N).fill(null);
const cxw = i => i - HALF + 0.5;
const ci = x => Math.floor(x + HALF);
const idx = (i, j) => j * N + i;
const inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
