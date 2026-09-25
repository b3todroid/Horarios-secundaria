import { useEffect, useRef, type ReactNode } from 'react';
import type { Issue } from '../api/types';
import { ruleLabel } from '../lib/format';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Horarios de Secundaria`;
  }, [title]);
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  size = '',
  labelledBy = 'modal-title',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: '' | 'modal-sm' | 'modal-lg';
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${size}`}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <h2 id={labelledBy} className="modal-title">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Alert({ kind, children, title }: { kind: 'error' | 'warn' | 'ok' | 'info'; title?: string; children?: ReactNode }) {
  const icon = { error: '⚠', warn: '!', ok: '✓', info: 'ℹ' }[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      <div>
        {title && <strong style={{ display: 'block', marginBottom: '0.2rem' }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="empty" role="status">
      <span className="spinner" aria-hidden="true" /> <span>{text}</span>
    </div>
  );
}

export function Empty({ icon = '○', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="big" aria-hidden="true">
        {icon}
      </span>
      <strong style={{ display: 'block', color: 'var(--ink)' }}>{title}</strong>
      {children}
    </div>
  );
}

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (!issues.length) return empty ? <Alert kind="ok">{empty}</Alert> : null;
  return (
    <ul className="issue-list">
      {issues.map((i, idx) => (
        <li key={idx} className={`issue ${i.severity}`}>
          <div className="issue-head">
            <span className={`badge ${i.severity === 'error' ? 'badge-danger' : 'badge-warn'}`}>
              {i.severity === 'error' ? '✕ Error' : '! Aviso'}
            </span>
            <strong>{ruleLabel(i.rule)}</strong>
          </div>
          <div>{i.message}</div>
          {(i.teacher || i.group || i.subject || i.missing_hours) && (
            <div className="issue-meta">
              {i.teacher && (
                <span>
                  Maestro: <b>{i.teacher}</b>
                </span>
              )}
              {i.group && (
                <span>
                  Grupo: <b>{i.group}</b>
                </span>
              )}
              {i.subject && (
                <span>
                  Materia: <b>{i.subject}</b>
                </span>
              )}
              {i.missing_hours ? (
                <span>
                  Horas faltantes: <b>{i.missing_hours}</b>
                </span>
              ) : null}
            </div>
          )}
          {i.actions.length > 0 && (
            <>
              <div className="small" style={{ fontWeight: 700, marginTop: '0.3rem' }}>
                Posibles soluciones:
              </div>
              <ul>
                {i.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? <span className="badge badge-ok">● Activo</span> : <span className="badge badge-muted">○ Inactivo</span>;
}
