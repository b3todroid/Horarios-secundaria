export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

export const RULE_LABELS: Record<string, string> = {
  sin_horas: 'Sin horas activas',
  sin_asignaciones: 'Sin asignaciones',
  referencia_inexistente: 'Dato inexistente',
  duplicado: 'Asignación duplicada',
  inactivo: 'Elemento inactivo',
  materia_no_registrada: 'Materia no registrada al maestro',
  excede_semana: 'Excede las horas de la semana',
  carga_no_coincide: 'Carga declarada distinta',
  disponibilidad_insuficiente: 'Disponibilidad insuficiente',
  consecutivas_insuficientes: 'Límite de horas consecutivas',
  grupo_sin_espacio: 'Grupo sin espacio',
  horas_bloqueadas: 'Horas bloqueadas',
  hora_bloqueada: 'Hora bloqueada',
  hora_desactivada: 'Hora desactivada',
  consecutivas: 'Horas consecutivas',
  clases_fijadas: 'Clases fijadas',
  choque_maestro_grupo: 'Sin horas comunes maestro–grupo',
  maestro_duplicado: 'Maestro en dos grupos',
  grupo_duplicado: 'Grupo con dos clases',
  fijacion_invalida: 'Clase fijada ignorada',
};

export const ruleLabel = (rule: string) => RULE_LABELS[rule] ?? rule;

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
