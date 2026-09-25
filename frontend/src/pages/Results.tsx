import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { MovePreview, MoveRequest, ScheduleEntry, ScheduleState } from '../api/types';
import { Alert, Empty, IssueList, Loading, Modal, PageHeader } from '../components/common';
import { Timetable, type Column, type DragPayload, type LessonInfo } from '../components/Timetable';
import { DAYS } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

type Tab = 'general' | 'group' | 'teacher' | 'pending' | 'conflicts' | 'loads';

const shortName = (n: string) => n.split(' ').slice(0, 2).join(' ');
const dayColumns: Column[] = DAYS.map((d, i) => ({ key: `d${i}`, label: d, day: i }));

export default function Results() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const cat = useLoad(async () => {
    const [teachers, groups, subjects, assignments, periods] = await Promise.all([
      api.teachers(pid),
      api.groups(pid),
      api.subjects(pid),
      api.assignments(pid),
      api.periods(pid),
    ]);
    return { teachers, groups, subjects, assignments, periods };
  }, [pid]);
  const sched = useLoad(() => api.schedule(pid), [pid]);

  const [tab, setTab] = useState<Tab>('group');
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [day, setDay] = useState(0);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ScheduleEntry | null>(null);
  const [placing, setPlacing] = useState<string | null>(null); // assignment pendiente
  const [preview, setPreview] = useState<{ req: MoveRequest; data: MovePreview } | null>(null);
  const [applying, setApplying] = useState(false);

  const m = useMemo(() => {
    const d = cat.data;
    return {
      teacher: new Map(d?.teachers.map((t) => [t.id, t]) ?? []),
      group: new Map(d?.groups.map((g) => [g.id, g]) ?? []),
      subject: new Map(d?.subjects.map((s) => [s.id, s]) ?? []),
      assignment: new Map(d?.assignments.map((a) => [a.id, a]) ?? []),
    };
  }, [cat.data]);

  useEffect(() => {
    const d = cat.data;
    if (!d) return;
    if (!groupId) setGroupId(d.groups.find((g) => g.active)?.id ?? d.groups[0]?.id ?? '');
    if (!teacherId) setTeacherId(d.teachers.find((t) => t.active)?.id ?? d.teachers[0]?.id ?? '');
  }, [cat.data, groupId, teacherId]);

  if ((cat.loading && !cat.data) || (sched.loading && !sched.data)) return <Loading />;
  if (cat.error || sched.error || !cat.data || !sched.data) return <Alert kind="error">{cat.error ?? sched.error}</Alert>;

  const state = sched.data;
  const periods = cat.data.periods.filter((p) => p.active);
  const conflictIds = new Set(state.conflicts.flatMap((c) => (c.entry_ids ?? []).filter(Boolean) as string[]));
  const flexibleIds = new Set(state.flexible_ids);
  const setState = (s: ScheduleState) => sched.setData(s);

  const asg = (e: ScheduleEntry) => m.assignment.get(e.assignment_id);
  const describe = (e: ScheduleEntry) => {
    const a = asg(e);
    return {
      subject: m.subject.get(a?.subject_id ?? ''),
      teacher: m.teacher.get(a?.teacher_id ?? ''),
      group: m.group.get(a?.group_id ?? ''),
    };
  };
  const slotText = (d: number, n: number) => {
    const p = periods.find((x) => x.number === n);
    return `${DAYS[d]}, hora ${n}${p ? ` (${p.start_time}–${p.end_time})` : ''}`;
  };

  const infoFor =
    (mode: 'group' | 'teacher' | 'general') =>
    (e: ScheduleEntry): LessonInfo => {
      const { subject, teacher, group } = describe(e);
      const label = `${slotText(e.day, e.period_number)}: ${subject?.name} con ${teacher?.name}, grupo ${group?.name}`;
      if (mode === 'teacher') return { subject: `${group?.name} · ${subject?.name}`, who: subject?.short_name || '', color: subject?.color ?? '#888', label };
      if (mode === 'general')
        return { subject: subject?.short_name || subject?.name || '', who: shortName(teacher?.name ?? ''), color: subject?.color ?? '#888', label };
      return { subject: subject?.name ?? '', who: shortName(teacher?.name ?? ''), color: subject?.color ?? '#888', label };
    };

  // ------------------------------------------------------------ edición
  const openPreview = async (req: MoveRequest) => {
    try {
      const data = await api.previewMove(pid, req);
      setPreview({ req, data });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const onSlot = (col: Column, period: number, groupOfColumn?: string) => {
    if (placing) {
      const a = m.assignment.get(placing);
      if (groupOfColumn && a && a.group_id !== groupOfColumn) {
        toast('Esa columna es de otro grupo. Coloca la clase en la columna de su grupo.', 'error');
        return;
      }
      void openPreview({ assignment_id: placing, day: col.day, period_number: period });
      return;
    }
    if (!selected?.id) {
      toast('Primero toca la clase que quieres mover.', 'info');
      return;
    }
    if (groupOfColumn && asg(selected)?.group_id !== groupOfColumn) {
      toast('En el horario general solo puedes mover una clase dentro de la columna de su grupo.', 'error');
      return;
    }
    void openPreview({ entry_id: selected.id, day: col.day, period_number: period });
  };

  const onLesson = (e: ScheduleEntry) => {
    if (placing) {
      toast('Elige un espacio vacío para la clase pendiente.', 'info');
      return;
    }
    if (!selected || !selected.id || selected.id === e.id) {
      setSelected(selected?.id === e.id ? null : e);
      return;
    }
    void openPreview({ entry_id: selected.id, day: e.day, period_number: e.period_number, swap_with: e.id ?? undefined });
  };

  const onDrop = (p: DragPayload, col: Column, period: number, groupOfColumn?: string) => {
    if ('entryId' in p) {
      const entry = state.entries.find((x) => x.id === p.entryId);
      if (!entry) return;
      if (groupOfColumn && asg(entry)?.group_id !== groupOfColumn) {
        toast('En el horario general solo puedes mover una clase dentro de la columna de su grupo.', 'error');
        return;
      }
      void openPreview({ entry_id: p.entryId, day: col.day, period_number: period });
    }
  };

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const r = await api.applyMove(pid, preview.req);
      setState(r.schedule);
      toast('Cambio guardado.');
      setPreview(null);
      setSelected(null);
      setPlacing(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const toggleLock = async () => {
    if (!selected?.id) return;
    try {
      const s = await api.setLock(pid, selected.id, !selected.locked);
      setState(s);
      toast(selected.locked ? 'Clase liberada.' : 'Clase fijada: el generador no la moverá.');
      setSelected(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const removeSelected = async () => {
    if (!selected?.id) return;
    const d = describe(selected);
    const ok = await confirm({
      title: 'Quitar clase del horario',
      message: `${d.subject?.name} (${d.group?.name}) pasará a la lista de pendientes.`,
      confirmLabel: 'Quitar clase',
    });
    if (!ok) return;
    try {
      setState(await api.removeEntry(pid, selected.id));
      setSelected(null);
      toast('Clase enviada a pendientes.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const undo = async () => {
    try {
      const r = await api.undo(pid);
      setState(r.schedule);
      setSelected(null);
      toast(`Se deshizo: ${r.undone}.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const startPlacing = (assignmentId: string) => {
    const a = m.assignment.get(assignmentId);
    if (!a) return;
    setEditing(true);
    setSelected(null);
    setPlacing(assignmentId);
    setGroupId(a.group_id);
    setTab('group');
  };

  // ------------------------------------------------------------ vistas
  const entriesFor = (filter: (e: ScheduleEntry) => boolean) => (col: Column, period: number) =>
    state.entries.filter((e) => e.day === col.day && e.period_number === period && filter(e));

  const commonProps = {
    periods,
    editing,
    selectedId: selected?.id ?? null,
    conflictIds,
    flexibleIds,
  };

  const groups = cat.data.groups.filter((g) => g.active);
  const hasSchedule = state.entries.length > 0;

  const tabs: { id: Tab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'general', label: 'Horario general' },
    { id: 'group', label: 'Por grupo' },
    { id: 'teacher', label: 'Por maestro' },
    { id: 'pending', label: 'Pendientes', count: state.pending.length, alert: state.pending.length > 0 },
    { id: 'conflicts', label: 'Conflictos', count: state.conflicts.length, alert: state.conflicts.length > 0 },
    { id: 'loads', label: 'Cargas' },
  ];

  const placingInfo = placing ? m.assignment.get(placing) : null;

  return (
    <>
      <PageHeader
        eyebrow="Paso 8"
        title="Resultados"
        description="Consulta el horario por grupo, por maestro o completo. Activa el modo edición para mover, intercambiar o fijar clases; cada cambio se revisa antes de guardarse."
        actions={
          hasSchedule ? (
            <label className="check btn" style={{ gap: '0.6rem' }}>
              <input
                type="checkbox"
                checked={editing}
                onChange={(e) => {
                  setEditing(e.target.checked);
                  setSelected(null);
                  setPlacing(null);
                }}
              />
              Modo edición
            </label>
          ) : undefined
        }
      />

      {!hasSchedule && (
        <div className="card">
          <Empty icon="🗓" title="Todavía no hay horario">
            <p>
              Ve a <Link to="/generar">Generar horario</Link> para crearlo.
            </p>
          </Empty>
        </div>
      )}

      {state.conflicts.length > 0 && (
        <Alert kind="error" title={`Hay ${state.conflicts.length} conflictos en el horario`}>
          Revisa la pestaña «Conflictos». Las clases con problema tienen borde rojo.
        </Alert>
      )}

      <div className="tabs" role="tablist" aria-label="Vistas del horario">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-controls="panel" onClick={() => setTab(t.id)}>
            {t.label}
            {t.count !== undefined && <span className={`count ${t.alert ? 'alert-count' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div id="panel" role="tabpanel">
        {tab === 'general' && (
          <section className="card">
            <div className="card-title">
              <h2>Horario general</h2>
              <div className="segmented" role="group" aria-label="Día">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" aria-pressed={day === i} onClick={() => setDay(i)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <Empty title="No hay grupos activos" />
            ) : (
              <Timetable
                {...commonProps}
                className="general-table"
                caption={`Horario general del ${DAYS[day]}`}
                columns={groups.map((g) => ({ key: g.id, label: g.name, day }))}
                entriesAt={(col, period) =>
                  state.entries.filter((e) => e.day === day && e.period_number === period && asg(e)?.group_id === col.key)
                }
                info={infoFor('general')}
                onLessonClick={onLesson}
                onSlotClick={(col, n) => onSlot(col, n, col.key)}
                onDropPayload={(p, col, n) => onDrop(p, col, n, col.key)}
              />
            )}
          </section>
        )}

        {tab === 'group' && (
          <section className="card">
            <div className="card-title">
              <label className="field" style={{ minWidth: 220 }}>
                <span>Grupo</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {cat.data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.active ? '' : ' (inactivo)'}
                    </option>
                  ))}
                </select>
              </label>
              <span className="badge badge-muted">
                {state.entries.filter((e) => asg(e)?.group_id === groupId).length} horas a la semana
              </span>
            </div>
            <Timetable
              {...commonProps}
              caption={`Horario del grupo ${m.group.get(groupId)?.name ?? ''}`}
              columns={dayColumns}
              entriesAt={entriesFor((e) => asg(e)?.group_id === groupId)}
              info={infoFor('group')}
              onLessonClick={onLesson}
              onSlotClick={(col, n) => onSlot(col, n)}
              onDropPayload={(p, col, n) => onDrop(p, col, n)}
            />
          </section>
        )}

        {tab === 'teacher' && (
          <section className="card">
            <div className="card-title">
              <label className="field" style={{ minWidth: 280 }}>
                <span>Maestro</span>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {cat.data.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                      {t.active ? '' : ' (inactivo)'}
                    </option>
                  ))}
                </select>
              </label>
              <span className="badge badge-muted">
                {state.entries.filter((e) => asg(e)?.teacher_id === teacherId).length} de {m.teacher.get(teacherId)?.weekly_load ?? 0} h
              </span>
            </div>
            <Timetable
              {...commonProps}
              caption={`Horario de ${m.teacher.get(teacherId)?.name ?? ''}`}
              columns={dayColumns}
              entriesAt={entriesFor((e) => asg(e)?.teacher_id === teacherId)}
              info={infoFor('teacher')}
              onLessonClick={onLesson}
              onSlotClick={(col, n) => onSlot(col, n)}
              onDropPayload={(p, col, n) => onDrop(p, col, n)}
            />
          </section>
        )}

        {tab === 'pending' && (
          <section className="card">
            <h2>Asignaciones pendientes</h2>
            {state.pending.length === 0 ? (
              <Alert kind="ok">Todas las asignaciones tienen sus horas completas en el horario.</Alert>
            ) : (
              <div className="table-wrap">
                <table className="data responsive">
                  <thead>
                    <tr>
                      <th scope="col">Maestro</th>
                      <th scope="col">Materia</th>
                      <th scope="col">Grupo</th>
                      <th scope="col" className="num">
                        Requeridas
                      </th>
                      <th scope="col" className="num">
                        Colocadas
                      </th>
                      <th scope="col" className="num">
                        Faltan
                      </th>
                      <th scope="col">Motivo</th>
                      <th scope="col">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.pending.map((p) => (
                      <tr key={p.assignment_id}>
                        <td data-label="Maestro">{p.teacher}</td>
                        <td data-label="Materia">{p.subject}</td>
                        <td data-label="Grupo">{p.group}</td>
                        <td data-label="Requeridas" className="num">
                          {p.hours_per_week}
                        </td>
                        <td data-label="Colocadas" className="num">
                          {p.scheduled}
                        </td>
                        <td data-label="Faltan" className="num">
                          <strong>{p.missing}</strong>
                        </td>
                        <td data-label="Motivo">{p.reason}</td>
                        <td className="actions">
                          {p.missing > 0 && p.reason === 'Faltan horas por colocar' && (
                            <button type="button" className="btn btn-sm" onClick={() => startPlacing(p.assignment_id)}>
                              Colocar manualmente
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {state.last_run?.shortages?.length ? (
              <p style={{ marginTop: '1rem' }}>
                <Link to="/generar">Ver el reporte de conflictos de la última generación →</Link>
              </p>
            ) : null}
          </section>
        )}

        {tab === 'conflicts' && (
          <section className="card">
            <h2>Reporte de conflictos</h2>
            <IssueList issues={state.conflicts} empty="El horario actual no tiene choques ni reglas incumplidas." />
            {state.last_run && state.last_run.shortages.length > 0 && (
              <>
                <h3 style={{ marginTop: '1.25rem' }}>Horas que no se pudieron colocar en la última generación</h3>
                <IssueList issues={state.last_run.shortages} />
              </>
            )}
          </section>
        )}

        {tab === 'loads' && (
          <section className="card">
            <h2>Resumen de cargas horarias</h2>
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th scope="col">Maestro</th>
                    <th scope="col" className="num">
                      Declarada
                    </th>
                    <th scope="col" className="num">
                      Asignada
                    </th>
                    <th scope="col" className="num">
                      En el horario
                    </th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.loads.map((l) => (
                    <tr key={l.teacher_id} className={l.active ? '' : 'inactive'}>
                      <td data-label="Maestro">
                        {l.teacher_code} · {l.teacher_name}
                      </td>
                      <td data-label="Declarada" className="num">
                        {l.declared}
                      </td>
                      <td data-label="Asignada" className="num">
                        {l.assigned}
                      </td>
                      <td data-label="En el horario" className="num">
                        {l.scheduled}
                      </td>
                      <td data-label="Estado">
                        <span className={`badge ${l.status === 'ok' ? 'badge-ok' : 'badge-warn'}`}>{l.message}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {editing && hasSchedule && (
        <div className="edit-bar" role="region" aria-label="Herramientas de edición">
          {placingInfo ? (
            <>
              <span>
                Colocando <strong>{m.subject.get(placingInfo.subject_id)?.name}</strong> ({m.group.get(placingInfo.group_id)?.name}):
                toca un espacio vacío.
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPlacing(null)}>
                Cancelar
              </button>
            </>
          ) : selected ? (
            <>
              <span>
                Seleccionada: <strong>{describe(selected).subject?.name}</strong> ({describe(selected).group?.name}) ·{' '}
                {slotText(selected.day, selected.period_number)}. Toca un espacio vacío para moverla o otra clase para
                intercambiarlas.
              </span>
              <button type="button" className="btn btn-sm" onClick={toggleLock}>
                {selected.locked ? '🔓 Liberar' : '🔒 Fijar'}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={removeSelected}>
                Quitar del horario
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>
                Cancelar selección
              </button>
            </>
          ) : (
            <span>Toca una clase para seleccionarla, o arrástrala a otro espacio.</span>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={undo} disabled={!state.history.length} title={state.history[0]}>
            ↶ Deshacer{state.history[0] ? `: ${state.history[0]}` : ''}
          </button>
        </div>
      )}

      <Modal open={!!preview} title="Confirmar cambio" onClose={() => setPreview(null)} size="modal-lg">
        {preview && (
          <>
            <div className="compare">
              <div className="box">
                <div className="small muted">Clase original</div>
                <strong>
                  {preview.data.original.subject} · {preview.data.original.group}
                </strong>
                <div>{preview.data.original.teacher}</div>
                <div className="small">{preview.data.original.slot}</div>
              </div>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <div className="box">
                <div className="small muted">Nueva posición</div>
                <strong>{preview.data.target.slot}</strong>
                {preview.data.swapped && (
                  <div className="small" style={{ marginTop: '0.3rem' }}>
                    Intercambio con <strong>{preview.data.swapped.subject}</strong> ({preview.data.swapped.group},{' '}
                    {preview.data.swapped.teacher}), que pasa a {preview.data.swapped.new_slot}.
                  </div>
                )}
              </div>
            </div>
            <div className="grid-2">
              <div>
                <strong>Maestros involucrados</strong>
                <p>{preview.data.teachers.join(', ')}</p>
              </div>
              <div>
                <strong>Grupos involucrados</strong>
                <p>{preview.data.groups.join(', ')}</p>
              </div>
            </div>
            {preview.data.warnings.map((w) => (
              <Alert key={w} kind="warn">
                {w}
              </Alert>
            ))}
            <h3>Conflictos encontrados</h3>
            <IssueList issues={preview.data.conflicts} empty="Ninguno. El cambio es válido." />
            {!preview.data.allowed && (
              <Alert kind="error" title="No se puede guardar">
                El cambio produciría conflictos. Elige otro espacio.
              </Alert>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={!preview.data.allowed || applying}>
                {applying ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
