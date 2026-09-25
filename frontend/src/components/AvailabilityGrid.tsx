import { useRef, useState, type KeyboardEvent } from 'react';
import type { CellState, Period } from '../api/types';
import { DAYS, DAYS_SHORT } from '../lib/format';
import { STATE_INFO, STATES, dayKeys, key, nextState, periodKeys, setCells, stateOf, type Grid } from '../lib/availability';

export type Brush = 'cycle' | CellState;

export function Legend() {
  return (
    <ul className="legend" aria-label="Leyenda de disponibilidad">
      {STATES.map((s) => (
        <li key={s}>
          <span className={`sample cell-${s}`} aria-hidden="true">
            {STATE_INFO[s].icon}
          </span>
          <span>
            <strong>{STATE_INFO[s].label}</strong> — {STATE_INFO[s].help}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  periods: Period[]; // solo horas activas
  grid: Grid;
  onChange: (g: Grid) => void;
  brush: Brush;
  selecting: boolean;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  disabled?: boolean;
}

export function AvailabilityGrid({ periods, grid, onChange, brush, selecting, selected, onSelectedChange, disabled }: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [lastFocus, setLastFocus] = useState<string | null>(null);
  const nums = periods.map((p) => p.number);

  const apply = (keys: string[], fallbackFrom?: string) => {
    if (brush === 'cycle') {
      const base = fallbackFrom ? (grid[fallbackFrom] ?? 'available') : 'available';
      onChange(setCells(grid, keys, nextState(base)));
    } else {
      onChange(setCells(grid, keys, brush));
    }
  };

  const clickCell = (k: string) => {
    if (disabled) return;
    if (selecting) {
      const s = new Set(selected);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      onSelectedChange(s);
      return;
    }
    apply([k], k);
  };

  const clickDay = (d: number) => {
    if (disabled) return;
    const keys = dayKeys(d, nums);
    if (selecting) {
      const all = keys.every((k) => selected.has(k));
      const s = new Set(selected);
      keys.forEach((k) => (all ? s.delete(k) : s.add(k)));
      onSelectedChange(s);
    } else apply(keys, keys[0]);
  };

  const clickPeriod = (n: number) => {
    if (disabled) return;
    const keys = periodKeys(n);
    if (selecting) {
      const all = keys.every((k) => selected.has(k));
      const s = new Set(selected);
      keys.forEach((k) => (all ? s.delete(k) : s.add(k)));
      onSelectedChange(s);
    } else apply(keys, keys[0]);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, d: number, idx: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const nd = Math.min(4, Math.max(0, d + m[0]));
    const ni = Math.min(nums.length - 1, Math.max(0, idx + m[1]));
    const target = tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${key(nd, nums[ni])}"]`);
    target?.focus();
  };

  return (
    <div className="timetable-wrap">
      <table className="avail-grid" ref={tableRef}>
        <caption className="sr-only">
          Disponibilidad semanal. Usa las flechas para moverte y Enter o Espacio para cambiar una celda.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="corner" style={{ display: 'grid', placeItems: 'center' }}>
                Hora
              </span>
            </th>
            {DAYS.map((d, i) => (
              <th scope="col" key={d}>
                <button type="button" onClick={() => clickDay(i)} disabled={disabled} title={`Aplicar a todo el ${d}`}>
                  <span className="day-long">{d}</span>
                  <span className="day-abbr" aria-hidden="true">
                    {DAYS_SHORT[i]}
                  </span>
                  <span className="sr-only"> — aplicar a todo el día</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, idx) => (
            <tr key={p.number}>
              <th scope="row">
                <button type="button" onClick={() => clickPeriod(p.number)} disabled={disabled} title="Aplicar a toda la hora">
                  {p.number}ª<span className="time">{p.start_time}–{p.end_time}</span>
                  <span className="sr-only"> — aplicar a esta hora en todos los días</span>
                </button>
              </th>
              {DAYS.map((dayName, d) => {
                const k = key(d, p.number);
                const st = stateOf(grid, d, p.number);
                const info = STATE_INFO[st];
                const isSel = selected.has(k);
                return (
                  <td key={k}>
                    <button
                      type="button"
                      data-cell={k}
                      className={`avail-cell cell-${st} ${isSel ? 'selected' : ''}`}
                      aria-label={`${dayName}, hora ${p.number} (${p.start_time} a ${p.end_time}): ${info.label}${isSel ? ', seleccionada' : ''}`}
                      aria-pressed={selecting ? isSel : undefined}
                      tabIndex={lastFocus ? (lastFocus === k ? 0 : -1) : d === 0 && idx === 0 ? 0 : -1}
                      onFocus={() => setLastFocus(k)}
                      onClick={() => clickCell(k)}
                      onKeyDown={(e) => onKey(e, d, idx)}
                      disabled={disabled}
                    >
                      <span className="ico" aria-hidden="true">
                        {info.icon}
                      </span>
                      <span className="txt" aria-hidden="true">
                        <span className="day-short">{DAYS_SHORT[d]} </span>
                        {info.short}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
