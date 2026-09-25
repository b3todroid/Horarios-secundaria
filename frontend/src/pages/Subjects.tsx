import { useState } from 'react';
import { api } from '../api/client';
import type { Subject, SubjectInput } from '../api/types';
import { Alert, Empty, Loading, Modal, PageHeader, StatusBadge } from '../components/common';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

const PALETTE = ['#2f6fdf', '#d9480f', '#2b8a3e', '#7048e8', '#c2255c', '#0c8599', '#e67700', '#5c940d', '#862e9c', '#1864ab'];

export default function Subjects() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const { data: subjects, loading, error, reload } = useLoad(() => api.subjects(pid), [pid]);
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const [form, setForm] = useState<SubjectInput>({ name: '', short_name: '', color: PALETTE[0], active: true });
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !subjects) return <Loading />;
  if (error || !subjects) return <Alert kind="error">{error}</Alert>;

  const open = (s: Subject | 'new') => {
    setFormError(null);
    setForm(
      s === 'new'
        ? { name: '', short_name: '', color: PALETTE[subjects.length % PALETTE.length], active: true }
        : { name: s.name, short_name: s.short_name, color: s.color, active: s.active },
    );
    setEditing(s);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Escribe el nombre de la materia.');
      return;
    }
    try {
      if (editing === 'new') await api.createSubject(pid, form);
      else if (editing) await api.updateSubject(pid, editing.id, form);
      toast(editing === 'new' ? `Materia «${form.name}» creada.` : 'Materia actualizada.');
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const remove = async (s: Subject) => {
    const ok = await confirm({
      title: `¿Eliminar «${s.name}»?`,
      message: 'Se borrarán las asignaciones de esta materia y sus clases del horario. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar materia',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteSubject(pid, s.id);
      toast('Materia eliminada.');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Paso 4"
        title="Materias"
        description="Las materias se muestran con su color en los horarios. La abreviatura se usa en el horario general."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open('new')}>
            + Agregar materia
          </button>
        }
      />
      {subjects.length === 0 ? (
        <div className="card">
          <Empty icon="📚" title="Aún no hay materias" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data responsive">
            <thead>
              <tr>
                <th scope="col">Materia</th>
                <th scope="col">Abreviatura</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'inactive'}>
                  <td data-label="Materia">
                    <span className="row">
                      <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                      <strong>{s.name}</strong>
                    </span>
                  </td>
                  <td data-label="Abreviatura">{s.short_name || '—'}</td>
                  <td data-label="Estado">
                    <StatusBadge active={s.active} />
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => open(s)} aria-label={`Editar ${s.name}`}>
                      Editar
                    </button>{' '}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(s)} aria-label={`Eliminar ${s.name}`}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Nueva materia' : 'Editar materia'} onClose={() => setEditing(null)} size="modal-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          {formError && <Alert kind="error">{formError}</Alert>}
          <div className="stack">
            <label className="field">
              <span>Nombre de la materia</span>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </label>
            <label className="field">
              <span>Abreviatura (opcional)</span>
              <input
                type="text"
                maxLength={20}
                value={form.short_name}
                onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                placeholder="MAT"
              />
            </label>
            <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Color</legend>
              <div className="chips">
                {PALETTE.map((c) => (
                  <label key={c} className="chip" title={c}>
                    <input
                      type="radio"
                      name="color"
                      checked={form.color === c}
                      onChange={() => setForm({ ...form, color: c })}
                      aria-label={`Color ${c}`}
                    />
                    <span className="swatch" style={{ background: c, width: 22, height: 22 }} aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Activa
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar materia
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
