import type { Fraction } from './fraction';

/** A matrix of exact entries, row by row. */
export type Rows = Fraction[][];

/** Names of the unknowns / coordinates, in order. */
export const VAR_NAMES = ['x', 'y', 'z'];
