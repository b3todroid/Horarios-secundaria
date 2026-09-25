import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { Assignment } from '../api/types';
import { Alert, Empty, Loading, PageHeader } from '../components/common';
import { computeLoads, loadMessage } from '../lib/loads';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

export default function Workload() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const { data, loading, error, reload, setData } = useLoad(async () => {
    const [teachers, subjects, groups, assignments] = await Promise.all([
      api.teachers(pid),
      api.subjects(pid),
      api.groups(pid),
      api.assignments(pid),
    ]);
    return { teachers, subjects, groups, assignments };
  }, [pid]);
  const [form, setForm] = useState({ teacher_id: '', subject_id: '', group_id: '', hours_per_week: 1 });
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const maps = useMemo(
    () => ({
      teacher: new Map(data?.teachers.map((t) => [t.id, t]) ?? []),
      subject: new Map(data?.subjects.map((s) => [s.id, s]) ?? []),
      group: new Map(data?.groups.map((g) => [g.id, g]) ?? []),
    }),
    [data],
  );

  if (loading && !data) return <Loading />;
  if (error || !data) return <Alert kind="error">{error}</Alert>;

  const loads = computeLoads(data.teachers, data.assignments);
  const selectedTeacher = maps.teacher.get(form.teacher_id);
  const suggested = selectedTeacher
    ? data.subjects.filter((s) => selectedTeacher.subject_ids.includes(s.id))
    : [];
  const others = data.subjects.filter((s) => !suggested.includes(s));

  const add = async () => {
    setFormError(null);
    if (!form.teacher_id || !form.subject_id || !form.group_id) {
      setFormError('Selecciona maestro, materia y grupo.');
      return;
    }
    if (form.hours_per_week < 1) {
      setFormError('Las horas por semana deben ser al menos 1.');
      return;
    }
    try {
      const a = await api.createAssignment(pid, form);
      setData({ ...data, assignments: [...data.assignments, a] });
      toast('Asignación agregada.');
      setForm({ ...form, group_id: '' });
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const updateHours = async (a: Assignment, hours: number) => {
    if (!Number.isFinite(hours) || hours < 1 || hours === a.hours_per_week) return;
    try {
      const upd = await api.updateAssignment(pid, a.id, {
        teacher_id: a.teacher_id,
        subject_id: a.subject_id,
        group_id: a.group_id,
        hours_per_week: hours,
      });
      setData({ ...data, assignments: data.assignments.map((x) => (x.id === a.id ? upd : x)) });
    } catch (e) {
      toast((e as Error).message, 'error');
      await reload();
    }
  };

  const remove = async (a: Assignment) => {
    const t = maps.teacher.get(a.teacher_id);
    const ok = await confirm({
      title: '¿Eliminar asignación?',
      message: `${t?.name} – ${maps.subject.get(a.subject_id)?.name} – ${maps.group.get(a.group_id)?.name}. Sus clases se quitarán del horario.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAssignment(pid, a.id);
      setData({ ...data, assignments: data.assignments.filter((x) => x.id !== a.id) });
      toast('Asignación eliminada.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const rows = data.assignments
    .filter((a) => !filter || a.teacher_id === filter)
    .sort((a, b) => {
      const ta = maps.teacher.get(a.teacher_id)?.code ?? '';
      const tb = maps.teacher.get(b.teacher_id)?.code ?? '';
      return ta.localeCompare(tb) || (maps.group.get(a.group_id)?.name ?? '').localeCompare(maps.group.get(b.group_id)?.name ?? '');
    });

  const groupTotals = new Map<string, number>();
  for (const a of data.assignments) groupTotals.set(a.group_id, (groupTotals.get(a.group_id) ?? 0) + a.hours_per_week);
  const problems = loads.filter((l) => l.teacher.active && l.status !== 'ok');

  return (
    <>
      <PageHeader
        eyebrow="Paso 5"
        title="Carga horaria"
        description="Registra qué materia imparte cada maestro en cada grupo y cuántas horas exactas a la semana. La suma se compara con la carga semanal declarada del maestro."
      />

      <section className="card" aria-labelledby="nueva">
        <div className="card-title">
          <h2 id="nueva">Nueva asignación</h2>
        </div>
        {formError && <Alert kind="error">{formError}</Alert>}
        <form
          className="toolbar"
          style={{ marginBottom: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="field" style={{ flex: 2 }}>
            <span>Maestro</span>
            <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value, subject_id: '' })}>
              <option value="">Selecciona…</option>
              {data.teachers
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field" style={{ flex: 2 }}>
            <span>Materia</span>
            <select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {suggested.length > 0 && (
                <optgroup label="Materias del maestro">
                  {suggested.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={suggested.length ? 'Otras materias' : 'Materias'}>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="field">
            <span>Grupo</span>
            <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {data.groups
                .filter((g) => g.active)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120, flex: 0 }}>
            <span>Horas/semana</span>
            <input
              type="number"
              min={1}
              max={45}
              value={form.hours_per_week}
              onChange={(e) => setForm({ ...form, hours_per_week: Number(e.target.value) })}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Agregar
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="resumen">
        <div className="card-title">
          <h2 id="resumen">Resumen de cargas</h2>
          {problems.length ? (
            <span className="badge badge-warn">! {problems.length} con diferencia</span>
          ) : (
            <span className="badge badge-ok">✓ Todas coinciden</span>
          )}
        </div>
        {loads.length === 0 ? (
          <Empty title="Registra maestros para ver sus cargas" />
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th scope="col">Maestro</th>
                  <th scope="col" className="num">
                    Carga declarada
                  </th>
                  <th scope="col" className="num">
                    Horas asignadas
                  </th>
                  <th scope="col" className="num">
                    Diferencia pendiente
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((l) => (
                  <tr key={l.teacher.id} className={l.teacher.active ? '' : 'inactive'}>
                    <td data-label="Maestro">
                      {l.teacher.code} · {l.teacher.name}
                      {!l.teacher.active && ' (inactivo)'}
                    </td>
                    <td data-label="Carga declarada" className="num">
                      {l.declared}
                    </td>
                    <td data-label="Horas asignadas" className="num">
                      {l.assigned}
                    </td>
                    <td data-label="Diferencia" className="num">
                      {l.difference > 0 ? `+${l.difference}` : l.difference}
                    </td>
                    <td data-label="Estado">
                      <span className={`badge ${l.status === 'ok' ? 'badge-ok' : l.status === 'faltan' ? 'badge-warn' : 'badge-danger'}`}>
                        {l.status === 'ok' ? '✓' : l.status === 'faltan' ? '!' : '✕'} {loadMessage(l)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="asignaciones">
        <div className="card-title">
          <h2 id="asignaciones">Asignaciones ({data.assignments.length})</h2>
          <label className="field" style={{ minWidth: 240 }}>
            <span className="sr-only">Filtrar por maestro</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por maestro">
              <option value="">Todos los maestros</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty icon="🗂" title="Sin asignaciones todavía" />
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th scope="col">Maestro</th>
                  <th scope="col">Materia</th>
                  <th scope="col">Grupo</th>
                  <th scope="col" className="num">
                    Horas/semana
                  </th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const t = maps.teacher.get(a.teacher_id);
                  const s = maps.subject.get(a.subject_id);
                  const g = maps.group.get(a.group_id);
                  const notTheirs = t && !t.subject_ids.includes(a.subject_id);
                  return (
                    <tr key={a.id} className={t?.active && g?.active ? '' : 'inactive'}>
                      <td data-label="Maestro">{t ? `${t.code} · ${t.name}` : '—'}</td>
                      <td data-label="Materia">
                        <span className="row">
                          <span className="swatch" style={{ background: s?.color }} aria-hidden="true" />
                          {s?.name}
                          {notTheirs && (
                            <span className="badge badge-warn" title="La materia no está registrada en el perfil del maestro">
                              ! no registrada
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-label="Grupo">
                        {g?.name}{' '}
                        <span className="muted small">({groupTotals.get(a.group_id)} h del grupo)</span>
                      </td>
                      <td data-label="Horas/semana" className="num">
                        <input
                          type="number"
                          min={1}
                          max={45}
                          defaultValue={a.hours_per_week}
                          key={`${a.id}-${a.hours_per_week}`}
                          style={{ width: 90, textAlign: 'right' }}
                          aria-label={`Horas por semana de ${s?.name} en ${g?.name}`}
                          onBlur={(e) => void updateHours(a, Number(e.target.value))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                      <td className="actions">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(a)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
