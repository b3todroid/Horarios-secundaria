import type { Assignment, Teacher } from '../api/types';

export interface TeacherLoad {
  teacher: Teacher;
  declared: number;
  assigned: number;
  difference: number;
  status: 'ok' | 'faltan' | 'sobran';
}

/** Compara la suma de asignaciones de cada maestro con su carga semanal declarada. */
export function computeLoads(teachers: Teacher[], assignments: Assignment[]): TeacherLoad[] {
  const sum = new Map<string, number>();
  for (const a of assignments) sum.set(a.teacher_id, (sum.get(a.teacher_id) ?? 0) + a.hours_per_week);
  return teachers.map((t) => {
    const assigned = sum.get(t.id) ?? 0;
    const difference = t.weekly_load - assigned;
    return {
      teacher: t,
      declared: t.weekly_load,
      assigned,
      difference,
      status: difference === 0 ? 'ok' : difference > 0 ? 'faltan' : 'sobran',
    };
  });
}

export function loadMessage(l: Pick<TeacherLoad, 'difference'>): string {
  if (l.difference === 0) return 'Completa';
  if (l.difference > 0) return `Faltan ${l.difference} h`;
  return `Sobran ${-l.difference} h`;
}
