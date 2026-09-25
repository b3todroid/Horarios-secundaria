import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Period } from '../api/types';
import { Alert, Loading, PageHeader } from '../components/common';
import { useLoad } from '../lib/useLoad';
import { usePid, useProject } from '../state/project';
import { useUi } from '../state/ui';

const DEFAULTS: [string, string][] = [
  ['07:30', '08:20'],
  ['08:20', '09:10'],
  ['09:10', '10:00'],
  ['10:00', '10:50'],
  ['11:10', '12:00'],
  ['12:00', '12:50'],
  ['12:50', '13:40'],
  ['14:00', '14:45'],
  ['14:45', '15:30'],
];

/** Devuelve un mensaje de error por hora (o null si es válida). */
export function validatePeriods(periods: Period[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const sorted = [...periods].sort((a, b) => a.number - b.number);
  for (const p of sorted) {
    if (!/^\d{2}:\d{2}$/.test(p.start_time) || !/^\d{2}:\d{2}$/.test(p.end_time)) errors[p.number] = 'Escribe las horas como HH:MM.';
    else if (p.end_time <= p.start_time) errors[p.number] = 'La hora de término debe ser posterior a la de inicio.';
  }
  for (let i = 1; i < sorted.length; i++) {
    if (!errors[sorted[i].number] && sorted[i].start_time < sorted[i - 1].end_time)
      errors[sorted[i].number] = `Empieza antes de que termine la hora ${sorted[i - 1].number}.`;
  }
  return errors;
}

export default function Settings() {
  const pid = usePid();
  const { current, refresh } = useProject();
  const { toast } = useUi();
  const { data, loading, error } = useLoad(() => api.periods(pid), [pid]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [name, setName] = useState(current?.name ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (data) setPeriods(data);
  }, [data]);

  const errors = validatePeriods(periods);
  const activeCount = periods.filter((p) => p.active).length;
  const valid = Object.keys(errors).length === 0 && activeCount > 0;

  // Guardado automático (con pequeña espera) cuando los datos son válidos.
  useEffect(() => {
    if (!dirty.current || !valid) return;
    const t = setTimeout(async () => {
      try {
        await api.savePeriods(pid, periods);
        setSaveError(null);
        dirty.current = false;
      } catch (e) {
        setSaveError((e as Error).message);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [periods, pid, valid]);

  const update = (num: number, patch: Partial<Period>) => {
    dirty.current = true;
    setPeriods((ps) => ps.map((p) => (p.number === num ? { ...p, ...patch } : p)));
  };

  const addPeriod = () => {
    if (periods.length >= 9) return;
    const n = periods.length + 1;
    const [s, e] = DEFAULTS[n - 1];
    dirty.current = true;
    setPeriods((ps) => [...ps, { number: n, start_time: s, end_time: e, active: true }]);
  };

  const removeLast = () => {
    if (periods.length <= 1) return;
    dirty.current = true;
    setPeriods((ps) => ps.slice(0, -1));
  };

  const saveName = async () => {
    if (!current || !name.trim() || name.trim() === current.name) return;
    try {
      await api.renameProject(current.id, name.trim());
      await refresh();
      toast('Nombre actualizado.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading />;
  if (error) return <Alert kind="error">{error}</Alert>;

  return (
    <>
      <PageHeader
        eyebrow="Paso 1"
        title="Configuración escolar"
        description="Define cuántas horas tiene el día y su horario. Las horas desactivadas no aparecen en la disponibilidad ni se usan para generar horarios. Los cambios se guardan automáticamente."
      />

      <section className="card">
        <div className="card-title">
          <h2>Datos generales</h2>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Nombre de la escuela o ciclo escolar</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
          <div className="field">
            <span>Días de clase</span>
            <p className="muted" style={{ margin: 0, paddingTop: '0.6rem' }}>
              Lunes a viernes. El horario es válido durante todo el ciclo escolar.
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Horas del día</h2>
          <span className="badge badge-info">{activeCount} activas de {periods.length}</span>
        </div>
        {saveError && <Alert kind="error">{saveError}</Alert>}
        {activeCount === 0 && <Alert kind="warn">Debe haber al menos una hora activa.</Alert>}
        <div className="table-wrap">
          <table className="data responsive">
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Inicio</th>
                <th scope="col">Término</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.number} className={p.active ? '' : 'inactive'}>
                  <td data-label="Hora">
                    <strong>{p.number}ª hora</strong>
                  </td>
                  <td data-label="Inicio">
                    <input
                      type="time"
                      aria-label={`Inicio de la hora ${p.number}`}
                      value={p.start_time}
                      aria-invalid={!!errors[p.number]}
                      onChange={(e) => update(p.number, { start_time: e.target.value })}
                    />
                  </td>
                  <td data-label="Término">
                    <input
                      type="time"
                      aria-label={`Término de la hora ${p.number}`}
                      value={p.end_time}
                      aria-invalid={!!errors[p.number]}
                      aria-describedby={errors[p.number] ? `err-${p.number}` : undefined}
                      onChange={(e) => update(p.number, { end_time: e.target.value })}
                    />
                    {errors[p.number] && (
                      <div className="field-error" id={`err-${p.number}`}>
                        {errors[p.number]}
                      </div>
                    )}
                  </td>
                  <td data-label="Estado">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e) => update(p.number, { active: e.target.checked })}
                      />
                      {p.active ? 'Activa' : 'Desactivada'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={addPeriod} disabled={periods.length >= 9}>
            + Agregar hora
          </button>
          <button type="button" className="btn btn-ghost" onClick={removeLast} disabled={periods.length <= 1}>
            Quitar última hora
          </button>
          <span className="muted small">Se permiten de 1 a 9 horas por día.</span>
        </div>
      </section>
    </>
  );
}
