import { useState } from 'react';
import type { Period, RecognitionResult, RecognizedTeacher } from '../api/types';
import { AvailabilityGrid, Legend } from './AvailabilityGrid';
import { Alert } from './common';
import { cellsToGrid, gridToCells } from '../lib/availability';

const LOW = 0.7;

function Confidence({ value, label }: { value: number | undefined; label: string }) {
  const v = value ?? 0;
  const cls = v < 0.5 ? 'conf-low' : v < LOW ? 'conf-mid' : '';
  return (
    <span className={`confidence ${cls}`} title={`Confianza en ${label}`}>
      <span className="conf-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(v * 100)}%` }} />
      </span>
      {Math.round(v * 100)}%{v < LOW && <span className="badge badge-warn">! Revisar</span>}
      <span className="sr-only">
        {' '}
        de confianza en {label}
        {v < LOW ? ', dato dudoso' : ''}
      </span>
    </span>
  );
}

export function emptyTeacher(code = ''): RecognizedTeacher {
  return {
    code,
    name: '',
    subjects: [],
    assignments: [{ subject: '', group: '', hours: 1 }],
    weekly_load: 0,
    allows_consecutive: true,
    max_consecutive: 3,
    availability: [],
    confidence: {},
    warnings: [],
  };
}

/** Errores que impiden confirmar un maestro. */
export function reviewErrors(t: RecognizedTeacher): string[] {
  const errs: string[] = [];
  if (!t.code.trim()) errs.push('Falta el identificador.');
  if (!t.name.trim()) errs.push('Falta el nombre.');
  t.assignments.forEach((a, i) => {
    if (!a.subject.trim() || !a.group.trim() || a.hours < 1) errs.push(`La fila ${i + 1} de materias y grupos está incompleta.`);
  });
  if (t.max_consecutive < 1 || t.max_consecutive > 9) errs.push('El máximo de horas consecutivas debe estar entre 1 y 9.');
  return errs;
}

interface Props {
  result: RecognitionResult;
  images: string[];
  periods: Period[];
  onConfirm: (teachers: RecognizedTeacher[]) => Promise<void> | void;
  onCancel: () => void;
}

export function ImportReview({ result, images, periods, onConfirm, onCancel }: Props) {
  const [teachers, setTeachers] = useState<RecognizedTeacher[]>(result.teachers.length ? result.teachers : [emptyTeacher('M01')]);
  const [include, setInclude] = useState<boolean[]>(teachers.map(() => true));
  const [idx, setIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = teachers[idx];
  const activePeriods = periods.filter((p) => p.active);

  const update = (patch: Partial<RecognizedTeacher>) =>
    setTeachers((ts) => ts.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const doubt = (field: string) => (t.confidence[field] ?? 1) < LOW;
  const totalHours = t.assignments.reduce((s, a) => s + (a.hours || 0), 0);

  const confirm = async () => {
    const chosen = teachers.filter((_, i) => include[i]);
    if (!chosen.length) {
      setError('Selecciona al menos un maestro para importar.');
      return;
    }
    const problems = teachers.flatMap((x, i) => (include[i] ? reviewErrors(x).map((e) => `${x.name || `Maestro ${i + 1}`}: ${e}`) : []));
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm(chosen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review">
      <div className="image-pane">
        <section className="card" aria-label="Imagen original">
          <div className="card-title">
            <h2>Imagen original</h2>
            {images.length > 1 && (
              <span className="badge badge-muted">
                Página {page + 1} de {images.length}
              </span>
            )}
          </div>
          {images.length ? (
            <>
              <div className="image-frame">
                <img src={images[page]} alt={`Página ${page + 1} del formato fotografiado`} />
              </div>
              {images.length > 1 && (
                <div className="thumbs" style={{ marginTop: '0.6rem' }}>
                  {images.map((u, i) => (
                    <button key={u} type="button" className="thumb" aria-pressed={i === page} onClick={() => setPage(i)}>
                      <img src={u} alt="" />
                      <span>Página {i + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Captura manual: no hay imagen.</p>
          )}
        </section>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="rev-title">
          <div className="card-title">
            <h2 id="rev-title">Datos reconocidos</h2>
            <span className="row small">
              <span className="muted">{result.provider_label}</span>
              <span>Confianza general:</span>
              <Confidence value={result.overall_confidence} label="el reconocimiento" />
            </span>
          </div>
          <Alert kind="info">
            Nada se guarda hasta que pulses <strong>«Confirmar e importar»</strong>. Revisa y corrige todos los datos, sobre
            todo los marcados con <strong>! Revisar</strong>.
          </Alert>
          {result.warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
          {teachers.length > 1 && (
            <div className="tabs" role="tablist" aria-label="Maestros reconocidos">
              {teachers.map((x, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === idx} onClick={() => setIdx(i)}>
                  {x.name || `Maestro ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={include[idx]}
              onChange={(e) => setInclude(include.map((v, i) => (i === idx ? e.target.checked : v)))}
            />
            Importar este maestro
          </label>

          {t.warnings.length > 0 && (
            <Alert kind="warn" title="Advertencias del reconocimiento">
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {t.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="form-grid" style={{ marginTop: '0.75rem' }}>
            <label className="field">
              <span>Identificador</span>
              <input type="text" value={t.code} onChange={(e) => update({ code: e.target.value })} aria-invalid={!t.code.trim()} />
            </label>
            <div className={`field ${doubt('name') ? 'doubt' : ''}`}>
              <label htmlFor="rev-name" className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
                Nombre del maestro <Confidence value={t.confidence.name} label="el nombre" />
              </label>
              <input id="rev-name" type="text" value={t.name} onChange={(e) => update({ name: e.target.value })} aria-invalid={!t.name.trim()} />
            </div>
            <div className={`field ${doubt('weekly_load') ? 'doubt' : ''}`}>
              <label htmlFor="rev-load" className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
                Horas semanales <Confidence value={t.confidence.weekly_load} label="las horas semanales" />
              </label>
              <input
                id="rev-load"
                type="number"
                min={0}
                max={45}
                value={t.weekly_load}
                onChange={(e) => update({ weekly_load: Number(e.target.value) })}
              />
              {t.weekly_load !== totalHours && (
                <span className="field-error">La suma por grupo es {totalHours} h.</span>
              )}
            </div>
            <div className={`field ${doubt('max_consecutive') ? 'doubt' : ''}`}>
              <label htmlFor="rev-max" className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
                Máximo de horas consecutivas <Confidence value={t.confidence.max_consecutive} label="el máximo de consecutivas" />
              </label>
              <input
                id="rev-max"
                type="number"
                min={1}
                max={9}
                value={t.max_consecutive}
                onChange={(e) => update({ max_consecutive: Number(e.target.value), allows_consecutive: Number(e.target.value) > 1 })}
              />
            </div>
            <div className={`field full ${doubt('subjects') ? 'doubt' : ''}`}>
              <label htmlFor="rev-subjects" className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
                Materias (separadas por coma) <Confidence value={t.confidence.subjects} label="las materias" />
              </label>
              <input
                id="rev-subjects"
                type="text"
                value={t.subjects.join(', ')}
                onChange={(e) => update({ subjects: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
          </div>
        </section>

        <section className={`card`} aria-labelledby="rev-groups">
          <div className="card-title">
            <h3 id="rev-groups">Grupos y horas</h3>
            <Confidence value={t.confidence.assignments} label="los grupos y horas" />
          </div>
          <div className={doubt('assignments') ? 'doubt' : ''} style={{ margin: 0 }}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Materia</th>
                    <th scope="col">Grupo</th>
                    <th scope="col">Horas</th>
                    <th scope="col">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.assignments.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="text"
                          aria-label={`Materia de la fila ${i + 1}`}
                          value={a.subject}
                          onChange={(e) => update({ assignments: t.assignments.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Grupo de la fila ${i + 1}`}
                          value={a.group}
                          style={{ width: 90 }}
                          onChange={(e) => update({ assignments: t.assignments.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={45}
                          aria-label={`Horas de la fila ${i + 1}`}
                          value={a.hours}
                          style={{ width: 80 }}
                          onChange={(e) =>
                            update({ assignments: t.assignments.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)) })
                          }
                        />
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          aria-label={`Quitar fila ${i + 1}`}
                          onClick={() => update({ assignments: t.assignments.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: '0.6rem' }}
            onClick={() => update({ assignments: [...t.assignments, { subject: '', group: '', hours: 1 }] })}
          >
            + Agregar fila
          </button>
        </section>

        <section className="card" aria-labelledby="rev-avail">
          <div className="card-title">
            <h3 id="rev-avail">Disponibilidad</h3>
            <Confidence value={t.confidence.availability} label="la disponibilidad" />
          </div>
          <Legend />
          <AvailabilityGrid
            periods={activePeriods}
            grid={cellsToGrid(t.availability)}
            onChange={(g) => update({ availability: gridToCells(g) })}
            brush="cycle"
            selecting={false}
            selected={new Set()}
            onSelectedChange={() => undefined}
          />
        </section>

        {error && <Alert kind="error">{error}</Alert>}
        <div className="edit-bar">
          <button type="button" className="btn btn-primary btn-lg" onClick={confirm} disabled={busy}>
            {busy ? 'Importando…' : 'Confirmar e importar'}
          </button>
          <button type="button" className="btn" onClick={() => {
            setTeachers([...teachers, emptyTeacher()]);
            setInclude([...include, true]);
            setIdx(teachers.length);
          }}>
            + Agregar maestro manualmente
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
