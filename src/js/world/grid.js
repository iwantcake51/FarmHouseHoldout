// The 44x44 cell grid: what is in each cell and coordinate helpers.

import { HALF, N } from '../core/math.js';

export const EMPTY = 0, WALL = 1, OPEN = 2, OBST = 3, FENCE = 4;
export const cell = new Uint8Array(N * N);
export const openAt = new Array(N * N).fill(null);
export const cxw = i => i - HALF + 0.5;
export const ci = x => Math.floor(x + HALF);
export const idx = (i, j) => j * N + i;
export const inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
