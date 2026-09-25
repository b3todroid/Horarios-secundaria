import { useState } from 'react';
import { api } from '../api/client';
import type { Group, GroupInput } from '../api/types';
import { Alert, Empty, Loading, Modal, PageHeader, StatusBadge } from '../components/common';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

export default function Groups() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const { data: groups, loading, error, reload } = useLoad(() => api.groups(pid), [pid]);
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [form, setForm] = useState<GroupInput>({ grade: 1, name: '', active: true });
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !groups) return <Loading />;
  if (error || !groups) return <Alert kind="error">{error}</Alert>;

  const open = (g: Group | 'new') => {
    setFormError(null);
    setForm(g === 'new' ? { grade: 1, name: '', active: true } : { grade: g.grade, name: g.name, active: g.active });
    setEditing(g);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Escribe el nombre del grupo, por ejemplo 1A.');
      return;
    }
    try {
      if (editing === 'new') await api.createGroup(pid, form);
      else if (editing) await api.updateGroup(pid, editing.id, form);
      toast(editing === 'new' ? `Grupo ${form.name} creado.` : 'Grupo actualizado.');
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const toggle = async (g: Group) => {
    try {
      await api.updateGroup(pid, g.id, { grade: g.grade, name: g.name, active: !g.active });
      toast(g.active ? 'Grupo desactivado.' : 'Grupo reactivado.');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async (g: Group) => {
    const ok = await confirm({
      title: `¿Eliminar el grupo ${g.name}?`,
      message: 'Se borrarán sus asignaciones y sus clases del horario. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar grupo',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteGroup(pid, g.id);
      toast('Grupo eliminado.');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const grades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a - b);

  return (
    <>
      <PageHeader
        eyebrow="Paso 3"
        title="Grupos"
        description="Agrega todos los grupos de la escuela organizados por grado. No hay un número fijo de grupos."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open('new')}>
            + Agregar grupo
          </button>
        }
      />
      {groups.length === 0 && (
        <div className="card">
          <Empty icon="🏫" title="Aún no hay grupos">
            <p>Ejemplos de nombres: 1A, 1B, 2A, 3A.</p>
          </Empty>
        </div>
      )}
      <div className="grid-3">
        {grades.map((grade) => (
          <section key={grade} className="card" aria-labelledby={`grado-${grade}`}>
            <div className="card-title">
              <h2 id={`grado-${grade}`}>{grade}.º grado</h2>
              <span className="badge badge-muted">{groups.filter((g) => g.grade === grade).length} grupos</span>
            </div>
            <ul className="issue-list">
              {groups
                .filter((g) => g.grade === grade)
                .map((g) => (
                  <li key={g.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row">
                      <strong style={{ fontSize: '1.15rem' }}>{g.name}</strong>
                      <StatusBadge active={g.active} />
                    </span>
                    <span className="row">
                      <button type="button" className="btn btn-sm" onClick={() => open(g)} aria-label={`Editar grupo ${g.name}`}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(g)}>
                        {g.active ? 'Desactivar' : 'Reactivar'}
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(g)} aria-label={`Eliminar grupo ${g.name}`}>
                        Eliminar
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal open={editing !== null} title={editing === 'new' ? 'Nuevo grupo' : 'Editar grupo'} onClose={() => setEditing(null)} size="modal-sm">
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
              <span>Grado</span>
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}.º grado
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nombre del grupo</span>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus placeholder="1A" />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Activo
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar grupo
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
