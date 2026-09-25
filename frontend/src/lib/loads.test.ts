import { describe, expect, it } from 'vitest';
import type { Assignment, Teacher } from '../api/types';
import { computeLoads, loadMessage } from './loads';

const teacher = (id: string, load: number): Teacher => ({
  id, code: id, name: id, subject_ids: [], weekly_load: load, allows_consecutive: true, max_consecutive: 3,
  active: true, created_at: '', updated_at: '',
});
const asg = (teacher_id: string, hours: number): Assignment => ({
  id: `${teacher_id}${hours}${Math.random()}`, teacher_id, subject_id: 's', group_id: 'g', hours_per_week: hours,
  created_at: '', updated_at: '',
});

describe('carga semanal', () => {
  it('compara horas asignadas con la carga declarada', () => {
    const loads = computeLoads([teacher('a', 10), teacher('b', 5), teacher('c', 4)], [asg('a', 5), asg('a', 5), asg('b', 3), asg('c', 6)]);
    expect(loads.map((l) => [l.assigned, l.difference, l.status])).toEqual([
      [10, 0, 'ok'],
      [3, 2, 'faltan'],
      [6, -2, 'sobran'],
    ]);
    expect(loadMessage(loads[1])).toBe('Faltan 2 h');
    expect(loadMessage(loads[2])).toBe('Sobran 2 h');
  });
});
