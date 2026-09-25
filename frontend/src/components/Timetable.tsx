import { useState, type CSSProperties, type DragEvent } from 'react';
import type { Period, ScheduleEntry } from '../api/types';

export interface LessonInfo {
  subject: string;
  who: string;
  color: string;
  label: string; // texto accesible completo
}

export interface Column {
  key: string;
  label: string;
  day: number; // día al que corresponde la columna
}

export type DragPayload = { entryId: string } | { assignmentId: string };

interface Props {
  caption: string;
  columns: Column[];
  periods: Period[];
  className?: string;
  /** Clases en la celda (columna, hora). */
  entriesAt: (col: Column, period: number) => ScheduleEntry[];
  info: (e: ScheduleEntry) => LessonInfo;
  editing?: boolean;
  selectedId?: string | null;
  conflictIds?: Set<string>;
  flexibleIds?: Set<string>;
  onLessonClick?: (e: ScheduleEntry, col: Column, period: number) => void;
  onSlotClick?: (col: Column, period: number) => void;
  onDropPayload?: (p: DragPayload, col: Column, period: number) => void;
}

export function Timetable({
  caption,
  columns,
  periods,
  className = '',
  entriesAt,
  info,
  editing = false,
  selectedId,
  conflictIds,
  flexibleIds,
  onLessonClick,
  onSlotClick,
  onDropPayload,
}: Props) {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const onDragStart = (ev: DragEvent, e: ScheduleEntry) => {
    if (!e.id) return;
    ev.dataTransfer.setData('text/plain', JSON.stringify({ entryId: e.id }));
    ev.dataTransfer.effectAllowed = 'move';
    setDragging(e.id);
  };

  const onDrop = (ev: DragEvent, col: Column, period: number) => {
    ev.preventDefault();
    setOver(null);
    setDragging(null);
    try {
      const payload = JSON.parse(ev.dataTransfer.getData('text/plain')) as DragPayload;
      onDropPayload?.(payload, col, period);
    } catch {
      /* contenido ajeno */
    }
  };

  return (
    <div className="timetable-wrap">
      <table className={`timetable ${className}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="hour">
              Hora
            </th>
            {columns.map((c) => (
              <th scope="col" key={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.number}>
              <th scope="row" className="hour">
                {p.number}ª<span className="time">{p.start_time}–{p.end_time}</span>
              </th>
              {columns.map((col) => {
                const slotKey = `${col.key}|${p.number}`;
                const list = entriesAt(col, p.number);
                return (
                  <td
                    key={slotKey}
                    className={`slot ${over === slotKey ? 'drop-ok' : ''}`}
                    onDragOver={
                      editing
                        ? (ev) => {
                            ev.preventDefault();
                            setOver(slotKey);
                          }
                        : undefined
                    }
                    onDragLeave={editing ? () => setOver((o) => (o === slotKey ? null : o)) : undefined}
                    onDrop={editing ? (ev) => onDrop(ev, col, p.number) : undefined}
                  >
                    {list.length === 0 ? (
                      editing ? (
                        <button
                          type="button"
                          className="slot-btn"
                          aria-label={`Espacio vacío: ${col.label}, hora ${p.number}`}
                          onClick={() => onSlotClick?.(col, p.number)}
                        />
                      ) : null
                    ) : (
                      list.map((e) => {
                        const inf = info(e);
                        const classes = [
                          'lesson',
                          e.locked ? 'locked' : '',
                          e.id && conflictIds?.has(e.id) ? 'conflict' : '',
                          e.id && flexibleIds?.has(e.id) ? 'flex-slot' : '',
                          e.id && selectedId === e.id ? 'selected' : '',
                          e.id && dragging === e.id ? 'dragging' : '',
                        ].join(' ');
                        const style = { '--subject': inf.color } as CSSProperties;
                        if (!editing) {
                          return (
                            <div key={e.id ?? e.assignment_id} className={classes} style={{ ...style, cursor: 'default' }} title={inf.label}>
                              <span className="subj">{inf.subject}</span>
                              <span className="who">{inf.who}</span>
                              <span className="sr-only">{inf.label}</span>
                            </div>
                          );
                        }
                        return (
                          <button
                            type="button"
                            key={e.id ?? e.assignment_id}
                            className={classes}
                            style={style}
                            draggable
                            onDragStart={(ev) => onDragStart(ev, e)}
                            onDragEnd={() => setDragging(null)}
                            onClick={() => onLessonClick?.(e, col, p.number)}
                            aria-pressed={selectedId === e.id}
                            aria-label={`${inf.label}${e.locked ? ', fijada' : ''}. Pulsa para seleccionar o intercambiar.`}
                          >
                            <span className="subj">{inf.subject}</span>
                            <span className="who">{inf.who}</span>
                          </button>
                        );
                      })
                    )}
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
