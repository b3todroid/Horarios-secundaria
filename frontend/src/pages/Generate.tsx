import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GenerationReport } from '../api/types';
import { Alert, IssueList, Loading, PageHeader } from '../components/common';
import { formatDateTime, plural } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

export function ReportView({ report }: { report: GenerationReport }) {
  const kind = report.status === 'complete' ? 'ok' : report.status === 'partial' ? 'warn' : 'error';
  const title =
    report.status === 'complete'
      ? 'Horario generado'
      : report.status === 'partial'
        ? 'No existe una solución completa'
        : 'No se pudo generar';
  return (
    <div className="stack" aria-live="polite">
      <Alert kind={kind} title={title}>
        <p>{report.summary}</p>
        {report.created_at && <p className="small muted">Generado {formatDateTime(report.created_at)}</p>}
      </Alert>
      <div className="stat-row">
        <div className="stat">
          <div className="label">Horas requeridas</div>
          <div className="value">{report.stats.required}</div>
        </div>
        <div className={`stat ${report.stats.placed >= report.stats.required ? 'ok' : 'warn'}`}>
          <div className="label">Clases colocadas</div>
          <div className="value">{report.stats.placed}</div>
        </div>
        {report.stats.missing !== undefined && (
          <div className={`stat ${report.stats.missing ? 'danger' : 'ok'}`}>
            <div className="label">Horas faltantes</div>
            <div className="value">{report.stats.missing}</div>
          </div>
        )}
        {report.stats.flexible_used !== undefined && (
          <div className={`stat ${report.stats.flexible_used ? 'warn' : ''}`}>
            <div className="label">Horas flexibles usadas</div>
            <div className="value">{report.stats.flexible_used}</div>
          </div>
        )}
        {report.stats.seconds !== undefined && (
          <div className="stat">
            <div className="label">Tiempo de cálculo</div>
            <div className="value">{report.stats.seconds}s</div>
          </div>
        )}
      </div>
      {report.shortages.length > 0 && (
        <section className="card" aria-labelledby="faltantes">
          <h2 id="faltantes">Reporte de conflictos</h2>
          <p className="muted">Cada tarjeta explica qué regla impide colocar las horas y cómo resolverlo.</p>
          <IssueList issues={report.shortages} />
        </section>
      )}
      {report.lock_warnings.length > 0 && (
        <section className="card">
          <h2>Clases fijadas</h2>
          <IssueList issues={report.lock_warnings} />
        </section>
      )}
    </div>
  );
}

export default function Generate() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const v = useLoad(async () => {
    const [validation, schedule] = await Promise.all([api.validate(pid), api.schedule(pid)]);
    return { validation, schedule };
  }, [pid]);
  const [keepLocked, setKeepLocked] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<GenerationReport | null>(null);

  if (v.loading && !v.data) return <Loading />;
  if (v.error || !v.data) return <Alert kind="error">{v.error}</Alert>;
  const { validation, schedule } = v.data;
  const locked = schedule.entries.filter((e) => e.locked).length;
  const shown = report ?? schedule.last_run;

  const run = async () => {
    if (schedule.entries.length && !(keepLocked && locked)) {
      const ok = await confirm({
        title: 'Reemplazar horario actual',
        message: `El horario actual (${schedule.entries.length} clases) se reemplazará por uno nuevo. Podrás deshacerlo desde Resultados.`,
        confirmLabel: 'Generar nuevo horario',
      });
      if (!ok) return;
    }
    setRunning(true);
    try {
      const res = await api.generate(pid, keepLocked);
      setReport(res.report);
      toast(res.report.summary, res.status === 'complete' ? 'success' : 'info');
      await v.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Paso 7"
        title="Generar horario"
        description="El generador respeta todas las reglas obligatorias, usa primero las horas DISPONIBLES y solo recurre a las FLEXIBLES cuando es necesario. También reparte cada materia durante la semana."
      />

      <section className="card" aria-labelledby="revision">
        <div className="card-title">
          <h2 id="revision">Revisión previa</h2>
          <span className="row">
            <span className={`badge ${validation.errors ? 'badge-danger' : 'badge-ok'}`}>
              {validation.errors ? `✕ ${plural(validation.errors, 'error', 'errores')}` : '✓ Sin errores'}
            </span>
            {validation.warnings > 0 && <span className="badge badge-warn">! {plural(validation.warnings, 'aviso', 'avisos')}</span>}
          </span>
        </div>
        <IssueList issues={validation.issues} empty="Los datos están listos para generar el horario." />
        {validation.errors > 0 && (
          <p className="muted small" style={{ marginTop: '0.75rem' }}>
            Puedes generar de todos modos: el sistema colocará todo lo posible y explicará lo que falte.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="generar">
        <h2 id="generar">Generar</h2>
        <div className="stack">
          <label className="check">
            <input type="checkbox" checked={keepLocked} onChange={(e) => setKeepLocked(e.target.checked)} disabled={!locked} />
            Conservar las clases fijadas ({locked}) y regenerar solo las demás
          </label>
          <div className="row">
            <button type="button" className="btn btn-primary btn-lg" onClick={run} disabled={running}>
              {running ? 'Generando…' : keepLocked && locked ? 'Regenerar clases no fijadas' : 'Generar horario'}
            </button>
            {schedule.entries.length > 0 && (
              <Link to="/resultados" className="btn btn-lg">
                Ver resultados →
              </Link>
            )}
          </div>
          {running && <Loading text="Calculando el mejor horario posible…" />}
        </div>
      </section>

      {shown && !running && (
        <section style={{ marginTop: '1rem' }} aria-label="Resultado de la generación">
          <ReportView report={shown} />
        </section>
      )}
    </>
  );
}
