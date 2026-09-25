import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { Subject, Teacher, TeacherInput } from '../api/types';
import { Alert, Empty, Loading, Modal, PageHeader, StatusBadge } from '../components/common';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

const MAX_TEACHERS = 99;

function nextCode(teachers: Teacher[]): string {
  const nums = teachers.map((t) => Number(/(\d+)$/.exec(t.code)?.[1] ?? 0));
  return `M${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
}

const blank = (code: string): TeacherInput => ({
  code,
  name: '',
  subject_ids: [],
  weekly_load: 0,
  allows_consecutive: true,
  max_consecutive: 3,
  active: true,
});

export function TeacherForm({
  initial,
  subjects,
  onSubmit,
  onCancel,
}: {
  initial: TeacherInput;
  subjects: Subject[];
  onSubmit: (t: TeacherInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TeacherInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('El identificador y el nombre son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, max_consecutive: form.allows_consecutive ? form.max_consecutive : 1 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-grid">
        <label className="field">
          <span>Identificador</span>
          <input type="text" value={form.code} onChange={(e) => set({ code: e.target.value })} required maxLength={20} />
          <span className="hint">Ejemplo: M01</span>
        </label>
        <label className="field">
          <span>Nombre completo</span>
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} required autoFocus />
        </label>
        <label className="field">
          <span>Carga semanal (horas)</span>
          <input
            type="number"
            min={0}
            max={45}
            value={form.weekly_load}
            onChange={(e) => set({ weekly_load: Number(e.target.value) })}
          />
        </label>
        <div className="field">
          <span>Horas consecutivas</span>
          <label className="check">
            <input
              type="checkbox"
              checked={form.allows_consecutive}
              onChange={(e) => set({ allows_consecutive: e.target.checked })}
            />
            Acepta horas consecutivas
          </label>
        </div>
        {form.allows_consecutive && (
          <label className="field">
            <span>Máximo de horas consecutivas</span>
            <input
              type="number"
              min={1}
              max={9}
              value={form.max_consecutive}
              onChange={(e) => set({ max_consecutive: Number(e.target.value) })}
            />
          </label>
        )}
        <div className="field">
          <span>Estado</span>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            Activo (participa en nuevos horarios)
          </label>
        </div>
        <fieldset className="field full" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Materias que puede impartir</legend>
          {subjects.length === 0 ? (
            <p className="muted small">Primero registra materias en el menú Materias.</p>
          ) : (
            <div className="chips">
              {subjects.map((s) => (
                <label key={s.id} className="chip">
                  <input
                    type="checkbox"
                    checked={form.subject_ids.includes(s.id)}
                    onChange={(e) =>
                      set({
                        subject_ids: e.target.checked
                          ? [...form.subject_ids, s.id]
                          : form.subject_ids.filter((x) => x !== s.id),
                      })
                    }
                  />
                  <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar maestro'}
        </button>
      </div>
    </form>
  );
}

export default function Teachers() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const { data, loading, error, reload } = useLoad(
    async () => ({ teachers: await api.teachers(pid), subjects: await api.subjects(pid) }),
    [pid],
  );
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  const subjectName = useMemo(() => new Map(data?.subjects.map((s) => [s.id, s.name]) ?? []), [data]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Alert kind="error">{error}</Alert>;

  const activeCount = data.teachers.filter((t) => t.active).length;
  const list = data.teachers.filter(
    (t) =>
      (showInactive || t.active) &&
      (t.name.toLowerCase().includes(query.toLowerCase()) || t.code.toLowerCase().includes(query.toLowerCase())),
  );

  const toInput = (t: Teacher): TeacherInput => ({
    code: t.code,
    name: t.name,
    subject_ids: t.subject_ids,
    weekly_load: t.weekly_load,
    allows_consecutive: t.allows_consecutive,
    max_consecutive: t.max_consecutive,
    active: t.active,
  });

  const save = async (input: TeacherInput) => {
    if (editing === 'new') {
      await api.createTeacher(pid, input);
      toast(`Maestro «${input.name}» registrado.`);
    } else if (editing) {
      await api.updateTeacher(pid, editing.id, input);
      toast('Cambios guardados.');
    }
    setEditing(null);
    await reload();
  };

  const toggle = async (t: Teacher) => {
    if (t.active) {
      const ok = await confirm({
        title: `¿Desactivar a ${t.name}?`,
        message: 'Su información se conserva, pero no participará en los nuevos horarios.',
        confirmLabel: 'Desactivar',
      });
      if (!ok) return;
    }
    try {
      await api.updateTeacher(pid, t.id, { ...toInput(t), active: !t.active });
      toast(t.active ? 'Maestro desactivado.' : 'Maestro reactivado.');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async (t: Teacher) => {
    const ok = await confirm({
      title: `¿Eliminar a ${t.name}?`,
      message: (
        <>
          <p>Se borrarán también sus asignaciones, su disponibilidad y sus clases del horario.</p>
          <p>
            Si solo dejará de trabajar este ciclo, es mejor <strong>desactivarlo</strong> para conservar su historial.
          </p>
        </>
      ),
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteTeacher(pid, t.id);
      toast('Maestro eliminado.');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Paso 2"
        title="Maestros"
        description={`Registra a cada maestro con su carga semanal y las materias que puede impartir. ${activeCount} de ${MAX_TEACHERS} maestros activos.`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing('new')}
            disabled={activeCount >= MAX_TEACHERS}
          >
            + Agregar maestro
          </button>
        }
      />
      {activeCount >= MAX_TEACHERS && (
        <Alert kind="warn">Se alcanzó el máximo de 99 maestros activos. Desactiva a uno para agregar otro.</Alert>
      )}

      <div className="toolbar">
        <label className="field" style={{ flex: 1 }}>
          <span>Buscar</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o identificador" />
        </label>
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivos
        </label>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty icon="👩‍🏫" title={data.teachers.length ? 'Ningún maestro coincide con la búsqueda' : 'Aún no hay maestros'}>
            <p>Usa «Agregar maestro» o «Importar fotografía».</p>
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data responsive">
            <thead>
              <tr>
                <th scope="col">Id.</th>
                <th scope="col">Nombre</th>
                <th scope="col">Materias</th>
                <th scope="col" className="num">
                  Carga
                </th>
                <th scope="col">Consecutivas</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={t.active ? '' : 'inactive'}>
                  <td data-label="Id.">{t.code}</td>
                  <td data-label="Nombre">
                    <strong>{t.name}</strong>
                  </td>
                  <td data-label="Materias">{t.subject_ids.map((id) => subjectName.get(id)).join(', ') || '—'}</td>
                  <td data-label="Carga" className="num">
                    {t.weekly_load} h
                  </td>
                  <td data-label="Consecutivas">{t.allows_consecutive ? `Máx. ${t.max_consecutive}` : 'No acepta'}</td>
                  <td data-label="Estado">
                    <StatusBadge active={t.active} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(t)} aria-label={`Editar a ${t.name}`}>
                      Editar
                    </button>{' '}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(t)}>
                      {t.active ? 'Desactivar' : 'Reactivar'}
                    </button>{' '}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(t)} aria-label={`Eliminar a ${t.name}`}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Nuevo maestro' : 'Editar maestro'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TeacherForm
            initial={editing === 'new' ? blank(nextCode(data.teachers)) : toInput(editing)}
            subjects={data.subjects.filter((s) => s.active || (editing !== 'new' && editing.subject_ids.includes(s.id)))}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
