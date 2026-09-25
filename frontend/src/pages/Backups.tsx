import { useRef, useState } from 'react';
import { api, download, exportUrls } from '../api/client';
import type { BackupSummary } from '../api/types';
import { Alert, PageHeader } from '../components/common';
import { formatDateTime } from '../lib/format';
import { usePid, useProject } from '../state/project';
import { useUi } from '../state/ui';

export default function Backups() {
  const pid = usePid();
  const { current, refresh, select } = useProject();
  const { toast, confirm } = useUi();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    try {
      const name = await download(exportUrls.backup(pid), 'respaldo.json');
      toast(`Respaldo descargado: ${name}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const choose = async (f: File | null) => {
    setFile(f);
    setSummary(null);
    setError(null);
    if (!f) return;
    try {
      setSummary(await api.inspectBackup(f));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const restore = async (mode: 'new' | 'replace') => {
    if (!file || !summary) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: `¿Reemplazar «${current?.name}»?`,
        message: (
          <>
            <p>
              Toda la información actual de este proyecto se sustituirá por la del respaldo «{summary.name}». Esta acción no
              se puede deshacer.
            </p>
            <p>Si no estás seguro, descarga primero un respaldo del proyecto actual.</p>
          </>
        ),
        confirmLabel: 'Reemplazar información',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const p = await api.restoreBackup(file, mode, pid);
      await refresh();
      select(p.id);
      toast(mode === 'new' ? `Respaldo restaurado como «${p.name}».` : 'Proyecto reemplazado con el respaldo.');
      setFile(null);
      setSummary(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Respaldos"
        description="La información se guarda automáticamente en la base de datos. Descarga respaldos periódicos para protegerla o llevarla a otra computadora."
      />
      <div className="grid-2">
        <section className="card" aria-labelledby="crear">
          <h2 id="crear">Crear respaldo</h2>
          <p className="muted">
            Descarga un archivo JSON con todo el proyecto «{current?.name}»: configuración, maestros, grupos, materias, cargas,
            disponibilidad y horario.
          </p>
          <p className="small muted">Última modificación: {formatDateTime(current?.updated_at)}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={exportBackup}>
            Descargar respaldo
          </button>
        </section>

        <section className="card" aria-labelledby="restaurar">
          <h2 id="restaurar">Restaurar respaldo</h2>
          <label className="field">
            <span>Archivo de respaldo (.json)</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
              style={{ minHeight: 48 }}
            />
          </label>
          {error && (
            <div style={{ marginTop: '0.75rem' }}>
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          {summary && (
            <div style={{ marginTop: '0.75rem' }}>
              <Alert kind="info" title={`Respaldo: ${summary.name}`}>
                <p>
                  Fecha: {formatDateTime(summary.exported_at)} · {summary.teachers} maestros · {summary.groups} grupos ·{' '}
                  {summary.subjects} materias · {summary.assignments} asignaciones · {summary.schedule_entries} clases
                </p>
              </Alert>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => restore('new')} disabled={busy}>
                  Restaurar como proyecto nuevo
                </button>
                <button type="button" className="btn btn-danger" onClick={() => restore('replace')} disabled={busy}>
                  Reemplazar proyecto actual…
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
