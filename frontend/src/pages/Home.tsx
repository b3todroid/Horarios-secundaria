import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Loading, Modal, PageHeader } from '../components/common';
import { formatDateTime } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { usePid, useProject } from '../state/project';
import { useUi } from '../state/ui';

export default function Home() {
  const pid = usePid();
  const { current, projects, refresh, select } = useProject();
  const { toast, confirm } = useUi();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading } = useLoad(async () => {
    const [periods, teachers, groups, subjects, assignments, schedule] = await Promise.all([
      api.periods(pid),
      api.teachers(pid),
      api.groups(pid),
      api.subjects(pid),
      api.assignments(pid),
      api.schedule(pid),
    ]);
    return { periods, teachers, groups, subjects, assignments, schedule };
  }, [pid]);

  const openDemo = async (kind: 'solvable' | 'conflict') => {
    const exists = projects.some((p) => p.is_demo && p.demo_kind === kind);
    if (
      exists &&
      !(await confirm({
        title: 'Reiniciar demostración',
        message: 'La demostración se volverá a crear desde cero. Tus datos reales no se modifican.',
        confirmLabel: 'Reiniciar demostración',
      }))
    )
      return;
    setBusy(kind);
    try {
      const p = await api.createDemo(kind);
      await refresh();
      select(p.id);
      toast(`Se abrió «${p.name}».`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    try {
      const p = await api.createProject(newName.trim());
      await refresh();
      select(p.id);
      setNewOpen(false);
      setNewName('');
      toast(`Proyecto «${p.name}» creado.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const deleteProject = async () => {
    if (!current) return;
    const ok = await confirm({
      title: `¿Eliminar «${current.name}»?`,
      message: (
        <>
          <p>Se borrarán maestros, grupos, materias, cargas, disponibilidad y horarios de este proyecto.</p>
          <p>
            <strong>Esta acción no se puede deshacer.</strong> Te recomendamos descargar un respaldo antes.
          </p>
        </>
      ),
      confirmLabel: 'Eliminar proyecto',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteProject(current.id);
      const list = await refresh();
      const next = list.find((p) => !p.is_demo) ?? list[0];
      if (next) select(next.id);
      toast('Proyecto eliminado.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading || !data) return <Loading />;
  const activePeriods = data.periods.filter((p) => p.active).length;
  const activeTeachers = data.teachers.filter((t) => t.active).length;
  const hours = data.assignments.reduce((s, a) => s + a.hours_per_week, 0);
  const placed = data.schedule.entries.length;

  const steps = [
    { to: '/configuracion', n: 1, title: 'Configurar horas', done: activePeriods > 0, detail: `${activePeriods} horas activas por día` },
    { to: '/maestros', n: 2, title: 'Registrar maestros', done: activeTeachers > 0, detail: `${activeTeachers} activos` },
    { to: '/grupos', n: 3, title: 'Registrar grupos', done: data.groups.length > 0, detail: `${data.groups.length} grupos` },
    { to: '/materias', n: 4, title: 'Registrar materias', done: data.subjects.length > 0, detail: `${data.subjects.length} materias` },
    { to: '/carga', n: 5, title: 'Capturar carga horaria', done: data.assignments.length > 0, detail: `${hours} horas asignadas` },
    { to: '/disponibilidad', n: 6, title: 'Revisar disponibilidad', done: activeTeachers > 0, detail: 'Verde, amarillo o rojo' },
    { to: '/generar', n: 7, title: 'Generar horario', done: placed > 0, detail: placed ? `${placed} clases colocadas` : 'Pendiente' },
    {
      to: '/resultados',
      n: 8,
      title: 'Revisar y exportar',
      done: placed > 0 && data.schedule.conflicts.length === 0 && data.schedule.pending.length === 0,
      detail: data.schedule.pending.length ? `${data.schedule.pending.length} asignaciones pendientes` : 'Por grupo y por maestro',
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={current?.is_demo ? 'Demostración' : 'Proyecto'}
        title={current?.name ?? ''}
        description={`Creado ${formatDateTime(current?.created_at)} · Última modificación ${formatDateTime(current?.updated_at)}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setNewOpen(true)}>
              + Nuevo proyecto
            </button>
            <button type="button" className="btn btn-ghost" onClick={deleteProject}>
              Eliminar proyecto
            </button>
          </>
        }
      />

      <div className="stat-row">
        <div className="stat">
          <div className="label">Maestros activos</div>
          <div className="value">{activeTeachers}</div>
        </div>
        <div className="stat">
          <div className="label">Grupos</div>
          <div className="value">{data.groups.length}</div>
        </div>
        <div className="stat">
          <div className="label">Materias</div>
          <div className="value">{data.subjects.length}</div>
        </div>
        <div className="stat">
          <div className="label">Horas por colocar</div>
          <div className="value">{hours}</div>
        </div>
        <div className={`stat ${placed && placed >= hours ? 'ok' : placed ? 'warn' : ''}`}>
          <div className="label">Clases en el horario</div>
          <div className="value">{placed}</div>
        </div>
      </div>

      <section className="card" aria-labelledby="pasos">
        <div className="card-title">
          <h2 id="pasos">Pasos para crear el horario</h2>
        </div>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.n}>
              <Link to={s.to} className={`step ${s.done ? 'done' : ''}`}>
                <span className="mark" aria-hidden="true">
                  {s.done ? '✓' : s.n}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.detail}</small>
                  <span className="sr-only">{s.done ? ' (completado)' : ' (pendiente)'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="demo">
        <div className="card-title">
          <h2 id="demo">Modo de demostración</h2>
        </div>
        <p className="muted">
          Practica con datos de ejemplo (5 maestros, 5 grupos y 6 materias). Las demostraciones se guardan en proyectos
          separados y nunca se mezclan con tus datos reales.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => openDemo('solvable')} disabled={!!busy}>
            {busy === 'solvable' ? 'Abriendo…' : 'Abrir ejemplo con solución'}
          </button>
          <button type="button" className="btn" onClick={() => openDemo('conflict')} disabled={!!busy}>
            {busy === 'conflict' ? 'Abriendo…' : 'Abrir ejemplo con conflicto'}
          </button>
        </div>
      </section>

      <Modal open={newOpen} title="Nuevo proyecto" onClose={() => setNewOpen(false)} size="modal-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createProject();
          }}
        >
          <label className="field">
            <span>Nombre de la escuela o ciclo</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Crear proyecto
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
