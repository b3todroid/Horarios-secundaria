import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { CellState } from '../api/types';
import { AvailabilityGrid, Legend, type Brush } from '../components/AvailabilityGrid';
import { Alert, Empty, Loading, PageHeader } from '../components/common';
import { STATE_INFO, STATES, cellsToGrid, copyDay, countStates, gridToCells, setCells, type Grid } from '../lib/availability';
import { DAYS } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

export default function Availability() {
  const pid = usePid();
  const { toast, confirm } = useUi();
  const base = useLoad(async () => {
    const [teachers, periods] = await Promise.all([api.teachers(pid), api.periods(pid)]);
    return { teachers, periods };
  }, [pid]);
  const [teacherId, setTeacherId] = useState('');
  const [grid, setGrid] = useState<Grid>({});
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [brush, setBrush] = useState<Brush>('cycle');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyFrom, setCopyFrom] = useState(0);
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [otherTeacher, setOtherTeacher] = useState('');
  const pendingSave = useRef<{ tid: string; grid: Grid } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teachers = base.data?.teachers ?? [];
  const periods = useMemo(() => (base.data?.periods ?? []).filter((p) => p.active), [base.data]);
  const nums = periods.map((p) => p.number);

  useEffect(() => {
    if (!teacherId && teachers.length) setTeacherId(teachers.find((t) => t.active)?.id ?? teachers[0].id);
  }, [teachers, teacherId]);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    const p = pendingSave.current;
    pendingSave.current = null;
    if (!p) return;
    try {
      await api.saveAvailability(pid, p.tid, gridToCells(p.grid));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  useEffect(() => {
    if (!teacherId) return;
    let alive = true;
    setLoadingGrid(true);
    setSelected(new Set());
    api
      .availability(pid, teacherId)
      .then((r) => alive && setGrid(cellsToGrid(r.cells)))
      .catch((e) => toast((e as Error).message, 'error'))
      .finally(() => alive && setLoadingGrid(false));
    return () => {
      alive = false;
    };
  }, [pid, teacherId, toast]);

  // Guarda al salir de la página.
  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const change = (g: Grid) => {
    setGrid(g);
    pendingSave.current = { tid: teacherId, grid: g };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };

  const switchTeacher = async (id: string) => {
    await flush();
    setTeacherId(id);
  };

  const applySelection = (st: CellState) => {
    if (!selected.size) return;
    change(setCells(grid, [...selected], st));
    setSelected(new Set());
  };

  const doCopyDay = () => {
    if (!copyTo.length) {
      toast('Elige al menos un día de destino.', 'info');
      return;
    }
    change(copyDay(grid, copyFrom, copyTo, nums));
    toast(`Se copió el ${DAYS[copyFrom]} a ${copyTo.map((d) => DAYS[d]).join(', ')}.`);
    setCopyTo([]);
  };

  const copyToTeacher = async () => {
    const target = teachers.find((t) => t.id === otherTeacher);
    const source = teachers.find((t) => t.id === teacherId);
    if (!target || !source) return;
    const ok = await confirm({
      title: 'Copiar disponibilidad',
      message: (
        <p>
          La disponibilidad de <strong>{target.name}</strong> se reemplazará por la de <strong>{source.name}</strong>. ¿Deseas
          continuar?
        </p>
      ),
      confirmLabel: 'Copiar y reemplazar',
    });
    if (!ok) return;
    await flush();
    try {
      await api.saveAvailability(pid, target.id, gridToCells(grid));
      toast(`Disponibilidad copiada a ${target.name}.`);
      setOtherTeacher('');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (base.loading && !base.data) return <Loading />;
  if (base.error) return <Alert kind="error">{base.error}</Alert>;

  const counts = countStates(grid, nums);
  const teacher = teachers.find((t) => t.id === teacherId);

  return (
    <>
      <PageHeader
        eyebrow="Paso 6"
        title="Disponibilidad semanal"
        description="Marca para cada maestro qué horas están disponibles, cuáles son flexibles y cuáles están bloqueadas. Sin marcar, la hora se considera disponible. Los cambios se guardan automáticamente."
      />
      {teachers.length === 0 ? (
        <div className="card">
          <Empty icon="🗓" title="Primero registra maestros" />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="field" style={{ flex: 2, minWidth: 240 }}>
              <span>Maestro</span>
              <select value={teacherId} onChange={(e) => void switchTeacher(e.target.value)}>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                    {t.active ? '' : ' (inactivo)'}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span id="brush-label">Al tocar una celda</span>
              <div className="segmented" role="group" aria-labelledby="brush-label">
                <button type="button" aria-pressed={brush === 'cycle'} onClick={() => setBrush('cycle')}>
                  ↻ Alternar
                </button>
                {STATES.map((s) => (
                  <button key={s} type="button" aria-pressed={brush === s} onClick={() => setBrush(s)}>
                    <span aria-hidden="true">{STATE_INFO[s].icon}</span> {STATE_INFO[s].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={selecting}
                onChange={(e) => {
                  setSelecting(e.target.checked);
                  setSelected(new Set());
                }}
              />
              Seleccionar varias celdas
            </label>
          </div>

          <Legend />

          {selecting && (
            <Alert kind="info" title={`${selected.size} celdas seleccionadas`}>
              <p>Toca celdas, días u horas para seleccionarlas y después elige el estado.</p>
              <div className="row">
                {STATES.map((s) => (
                  <button key={s} type="button" className="btn btn-sm" onClick={() => applySelection(s)} disabled={!selected.size}>
                    <span aria-hidden="true">{STATE_INFO[s].icon}</span> Marcar como {STATE_INFO[s].label}
                  </button>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
                  Limpiar selección
                </button>
              </div>
            </Alert>
          )}

          <section className="card" aria-label={`Disponibilidad de ${teacher?.name ?? ''}`}>
            <div className="card-title">
              <h2>{teacher?.name}</h2>
              <span className="row small">
                <span className="badge badge-ok">✓ {counts.available} disponibles</span>
                <span className="badge badge-warn">~ {counts.flexible} flexibles</span>
                <span className="badge badge-danger">✕ {counts.blocked} bloqueadas</span>
              </span>
            </div>
            {teacher && counts.available + counts.flexible < teacher.weekly_load && (
              <Alert kind="warn">
                La carga semanal de {teacher.name} es de {teacher.weekly_load} h y solo tiene {counts.available + counts.flexible}{' '}
                horas no bloqueadas.
              </Alert>
            )}
            {loadingGrid ? (
              <Loading />
            ) : (
              <AvailabilityGrid
                periods={periods}
                grid={grid}
                onChange={change}
                brush={brush}
                selecting={selecting}
                selected={selected}
                onSelectedChange={setSelected}
              />
            )}
            <p className="muted small" style={{ marginTop: '0.75rem' }}>
              Consejo: toca el nombre de un día o de una hora para cambiar toda la columna o toda la fila.
            </p>
          </section>

          <div className="grid-2" style={{ marginTop: '1rem' }}>
            <section className="card" aria-labelledby="copiar-dia">
              <h2 id="copiar-dia">Copiar un día a otros días</h2>
              <div className="stack">
                <label className="field">
                  <span>Copiar desde</span>
                  <select value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))}>
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700 }}>Pegar en</legend>
                  <div className="chips">
                    {DAYS.map((d, i) =>
                      i === copyFrom ? null : (
                        <label key={d} className="chip">
                          <input
                            type="checkbox"
                            checked={copyTo.includes(i)}
                            onChange={(e) => setCopyTo(e.target.checked ? [...copyTo, i] : copyTo.filter((x) => x !== i))}
                          />
                          {d}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
                <button type="button" className="btn" onClick={doCopyDay}>
                  Copiar día
                </button>
              </div>
            </section>
            <section className="card" aria-labelledby="copiar-maestro">
              <h2 id="copiar-maestro">Copiar a otro maestro</h2>
              <p className="muted small">Reemplaza la disponibilidad del maestro elegido por la que ves arriba.</p>
              <div className="stack">
                <label className="field">
                  <span>Maestro de destino</span>
                  <select value={otherTeacher} onChange={(e) => setOtherTeacher(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {teachers
                      .filter((t) => t.id !== teacherId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} · {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button type="button" className="btn" onClick={copyToTeacher} disabled={!otherTeacher}>
                  Copiar disponibilidad…
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
