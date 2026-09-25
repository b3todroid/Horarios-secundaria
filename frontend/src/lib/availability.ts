import type { AvailabilityCell, CellState } from '../api/types';

export const STATES: CellState[] = ['available', 'flexible', 'blocked'];

export const STATE_INFO: Record<CellState, { label: string; short: string; icon: string; help: string }> = {
  available: { label: 'Disponible', short: 'Disp.', icon: '✓', help: 'Se puede colocar una clase normalmente.' },
  flexible: { label: 'Flexible', short: 'Flex.', icon: '~', help: 'Se usa solo si no hay horas disponibles.' },
  blocked: { label: 'Bloqueada', short: 'Bloq.', icon: '✕', help: 'Nunca se coloca una clase.' },
};

/** Clave de celda: día-hora. */
export type Grid = Record<string, CellState>;
export const key = (day: number, period: number) => `${day}-${period}`;

export function cellsToGrid(cells: AvailabilityCell[]): Grid {
  const g: Grid = {};
  for (const c of cells) if (c.state !== 'available') g[key(c.day, c.period_number)] = c.state;
  return g;
}

export function gridToCells(grid: Grid): AvailabilityCell[] {
  return Object.entries(grid)
    .filter(([, st]) => st !== 'available')
    .map(([k, state]) => {
      const [day, period_number] = k.split('-').map(Number);
      return { day, period_number, state };
    })
    .sort((a, b) => a.day - b.day || a.period_number - b.period_number);
}

/** Sin restricción, la celda es DISPONIBLE. */
export const stateOf = (grid: Grid, day: number, period: number): CellState => grid[key(day, period)] ?? 'available';

export function nextState(s: CellState): CellState {
  return STATES[(STATES.indexOf(s) + 1) % STATES.length];
}

export function setCells(grid: Grid, keys: string[], state: CellState): Grid {
  const out = { ...grid };
  for (const k of keys) {
    if (state === 'available') delete out[k];
    else out[k] = state;
  }
  return out;
}

export const dayKeys = (day: number, periods: number[]) => periods.map((p) => key(day, p));
export const periodKeys = (period: number, days = 5) => Array.from({ length: days }, (_, d) => key(d, period));

export function copyDay(grid: Grid, from: number, to: number[], periods: number[]): Grid {
  let out = { ...grid };
  for (const d of to) {
    for (const p of periods) out = setCells(out, [key(d, p)], stateOf(grid, from, p));
  }
  return out;
}

export function countStates(grid: Grid, periods: number[], days = 5): Record<CellState, number> {
  const c: Record<CellState, number> = { available: 0, flexible: 0, blocked: 0 };
  for (let d = 0; d < days; d++) for (const p of periods) c[stateOf(grid, d, p)]++;
  return c;
}
