import { describe, expect, it } from 'vitest';
import { validatePeriods } from './Settings';

describe('configuración de horas', () => {
  it('acepta el horario predeterminado', () => {
    expect(
      validatePeriods([
        { number: 1, start_time: '07:30', end_time: '08:20', active: true },
        { number: 2, start_time: '08:20', end_time: '09:10', active: false },
      ]),
    ).toEqual({});
  });
  it('detecta horas invertidas y traslapes', () => {
    const errs = validatePeriods([
      { number: 1, start_time: '08:00', end_time: '07:00', active: true },
      { number: 2, start_time: '09:00', end_time: '10:00', active: true },
      { number: 3, start_time: '09:30', end_time: '10:30', active: true },
    ]);
    expect(errs[1]).toMatch(/posterior/);
    expect(errs[3]).toMatch(/antes de que termine la hora 2/);
    expect(errs[2]).toBeUndefined();
  });
});
