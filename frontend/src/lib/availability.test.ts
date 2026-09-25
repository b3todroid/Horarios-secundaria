import { describe, expect, it } from 'vitest';
import { cellsToGrid, copyDay, countStates, dayKeys, gridToCells, key, nextState, periodKeys, setCells, stateOf } from './availability';

describe('disponibilidad', () => {
  it('sin restricción la celda es DISPONIBLE', () => {
    expect(stateOf({}, 0, 1)).toBe('available');
  });

  it('maneja exactamente tres estados en ciclo', () => {
    expect(nextState('available')).toBe('flexible');
    expect(nextState('flexible')).toBe('blocked');
    expect(nextState('blocked')).toBe('available');
  });

  it('solo guarda celdas flexibles o bloqueadas', () => {
    const g = setCells({}, [key(0, 1), key(0, 2), key(0, 3)], 'blocked');
    const g2 = setCells(g, [key(0, 2)], 'flexible');
    const g3 = setCells(g2, [key(0, 3)], 'available');
    expect(gridToCells(g3)).toEqual([
      { day: 0, period_number: 1, state: 'blocked' },
      { day: 0, period_number: 2, state: 'flexible' },
    ]);
    expect(cellsToGrid(gridToCells(g3))).toEqual(g3);
  });

  it('marca un día completo y una hora completa', () => {
    const periods = [1, 2, 3];
    const g = setCells({}, dayKeys(2, periods), 'blocked');
    expect(countStates(g, periods)).toEqual({ available: 12, flexible: 0, blocked: 3 });
    const g2 = setCells(g, periodKeys(1), 'flexible');
    expect(stateOf(g2, 4, 1)).toBe('flexible');
    expect(stateOf(g2, 2, 1)).toBe('flexible');
    expect(stateOf(g2, 2, 2)).toBe('blocked');
  });

  it('copia un día a otros días', () => {
    const periods = [1, 2];
    const g = setCells(setCells({}, [key(0, 1)], 'blocked'), [key(0, 2)], 'flexible');
    const withNoise = setCells(g, [key(3, 1)], 'flexible');
    const out = copyDay(withNoise, 0, [3, 4], periods);
    expect(stateOf(out, 3, 1)).toBe('blocked');
    expect(stateOf(out, 4, 2)).toBe('flexible');
    expect(stateOf(out, 1, 1)).toBe('available');
  });
});
