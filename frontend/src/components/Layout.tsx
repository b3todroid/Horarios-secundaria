import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useProject } from '../state/project';
import { useSaveStatus } from '../state/save';
import { formatTime } from '../lib/format';

export const NAV: { to: string; label: string; step?: number; section?: string }[] = [
  { to: '/', label: 'Inicio' },
  { to: '/configuracion', label: 'Configuración escolar', step: 1, section: 'Datos de la escuela' },
  { to: '/maestros', label: 'Maestros', step: 2 },
  { to: '/grupos', label: 'Grupos', step: 3 },
  { to: '/materias', label: 'Materias', step: 4 },
  { to: '/carga', label: 'Carga horaria', step: 5 },
  { to: '/disponibilidad', label: 'Disponibilidad', step: 6 },
  { to: '/importar', label: 'Importar fotografía', section: 'Herramientas' },
  { to: '/generar', label: 'Generar horario', step: 7, section: 'Horario' },
  { to: '/resultados', label: 'Resultados', step: 8 },
  { to: '/exportar', label: 'Exportar' },
  { to: '/respaldos', label: 'Respaldos' },
];

function SaveIndicator() {
  const st = useSaveStatus();
  const text =
    st.kind === 'saving'
      ? 'Guardando…'
      : st.kind === 'saved'
        ? `Guardado ${formatTime(st.at)}`
        : st.kind === 'error'
          ? 'No se guardó'
          : 'Guardado automático';
  return (
    <span className={`save-status ${st.kind}`} role="status" aria-live="polite" title={st.kind === 'error' ? st.message : undefined}>
      <span className="dot" aria-hidden="true" />
      <span className="save-text">{text}</span>
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { projects, current, select } = useProject();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const real = projects.filter((p) => !p.is_demo);
  const demos = projects.filter((p) => p.is_demo);

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className={`sidebar ${open ? 'open' : ''}`} id="menu" aria-label="Menú principal">
        <NavLink to="/" className="brand">
          <img src="/icono.svg" alt="" />
          <div>
            <strong>Horarios</strong>
            <span>Escuela secundaria</span>
          </div>
        </NavLink>
        <nav className="nav">
          {NAV.map((item) => (
            <div key={item.to} style={{ display: 'contents' }}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <NavLink to={item.to} end={item.to === '/'}>
                <span className="num" aria-hidden="true">
                  {item.step ?? '•'}
                </span>
                {item.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon menu-toggle"
            aria-controls="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true">☰</span>
            <span className="sr-only">Abrir menú</span>
          </button>
          <div className="project-select">
            <label htmlFor="proyecto">Proyecto</label>
            <select
              id="proyecto"
              value={current?.id ?? ''}
              onChange={(e) => {
                select(e.target.value);
                navigate('/');
              }}
            >
              <optgroup label="Datos reales">
                {real.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {demos.length > 0 && (
                <optgroup label="Demostración">
                  {demos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <span className="spacer" />
          <SaveIndicator />
        </header>
        {current?.is_demo && (
          <div className="demo-banner" role="note">
            <span aria-hidden="true">⚑</span>
            <span>
              Proyecto de DEMOSTRACIÓN<span className="banner-long">. Sus datos están separados de tus datos reales</span>.
            </span>
            {real[0] && (
              <button type="button" className="btn btn-sm" onClick={() => select(real[0].id)}>
                Volver a «{real[0].name}»
              </button>
            )}
          </div>
        )}
        <main id="contenido" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
