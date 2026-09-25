import { useState } from 'react';
import { download, exportUrls, api } from '../api/client';
import { Alert, Loading, PageHeader } from '../components/common';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

export default function ExportPage() {
  const pid = usePid();
  const { toast } = useUi();
  const meta = useLoad(async () => {
    const [groups, teachers, schedule] = await Promise.all([api.groups(pid), api.teachers(pid), api.schedule(pid)]);
    return { groups, teachers, schedule };
  }, [pid]);
  const [scope, setScope] = useState<'group' | 'teacher' | 'general'>('group');
  const [item, setItem] = useState('');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [busy, setBusy] = useState<string | null>(null);

  if (meta.loading && !meta.data) return <Loading />;
  if (meta.error || !meta.data) return <Alert kind="error">{meta.error}</Alert>;

  const run = async (key: string, path: string, name: string) => {
    setBusy(key);
    try {
      const file = await download(path, name);
      toast(`Descargado: ${file}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const items = scope === 'group' ? meta.data.groups.filter((g) => g.active) : meta.data.teachers.filter((t) => t.active);

  return (
    <>
      <PageHeader
        title="Exportar"
        description="Descarga los horarios en PDF para imprimir, en Excel para editarlos o en JSON como respaldo completo."
      />
      {meta.data.schedule.entries.length === 0 && (
        <Alert kind="warn">Todavía no hay horario generado; los archivos saldrán vacíos.</Alert>
      )}

      <section className="card" aria-labelledby="pdf">
        <h2 id="pdf">PDF (tamaño carta)</h2>
        <p className="muted">Letra grande y legible. Los espacios sin clase quedan en blanco.</p>
        <div className="toolbar">
          <div className="field">
            <span id="tipo-pdf">Tipo de horario</span>
            <div className="segmented" role="group" aria-labelledby="tipo-pdf">
              {(
                [
                  ['group', 'Por grupo'],
                  ['teacher', 'Por maestro'],
                  ['general', 'General'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={scope === v}
                  onClick={() => {
                    setScope(v);
                    setItem('');
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {scope !== 'general' && (
            <label className="field" style={{ minWidth: 240 }}>
              <span>{scope === 'group' ? 'Grupo' : 'Maestro'}</span>
              <select value={item} onChange={(e) => setItem(e.target.value)}>
                <option value="">{scope === 'group' ? 'Todos los grupos (una página por grupo)' : 'Todos los maestros (una página por maestro)'}</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {'code' in x ? `${x.code} · ${x.name}` : x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field">
            <span id="orient">Orientación</span>
            <div className="segmented" role="group" aria-labelledby="orient">
              <button type="button" aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')}>
                Horizontal
              </button>
              <button type="button" aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')}>
                Vertical
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!!busy}
          onClick={() => run('pdf', exportUrls.pdf(pid, scope, orientation, item || undefined), 'horario.pdf')}
        >
          {busy === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}
        </button>
      </section>

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <section className="card" aria-labelledby="excel">
          <h2 id="excel">Excel</h2>
          <p className="muted">Un libro con el horario general, una hoja por grupo, una por maestro y el resumen de cargas.</p>
          <button type="button" className="btn btn-lg" disabled={!!busy} onClick={() => run('xlsx', exportUrls.xlsx(pid), 'horarios.xlsx')}>
            {busy === 'xlsx' ? 'Preparando…' : 'Descargar Excel'}
          </button>
        </section>
        <section className="card" aria-labelledby="json">
          <h2 id="json">JSON</h2>
          <p className="muted">Todos los datos del proyecto. Sirve como respaldo y se puede restaurar en «Respaldos».</p>
          <button type="button" className="btn btn-lg" disabled={!!busy} onClick={() => run('json', exportUrls.json(pid), 'horarios.json')}>
            {busy === 'json' ? 'Preparando…' : 'Descargar JSON'}
          </button>
        </section>
      </div>
    </>
  );
}
