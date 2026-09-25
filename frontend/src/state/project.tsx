import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Project } from '../api/types';

interface ProjectCtx {
  projects: Project[];
  current: Project | null;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  refresh: () => Promise<Project[]>;
}

const Ctx = createContext<ProjectCtx | null>(null);
const STORAGE_KEY = 'horarios.proyecto';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStored);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      let list = await api.projects();
      if (list.filter((p) => !p.is_demo).length === 0) {
        // Primer uso: se crea un proyecto real vacío (separado de las demostraciones).
        await api.createProject('Mi escuela');
        list = await api.projects();
      }
      setProjects(list);
      setError(null);
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = useMemo(() => {
    return projects.find((p) => p.id === currentId) ?? projects.find((p) => !p.is_demo) ?? projects[0] ?? null;
  }, [projects, currentId]);

  const select = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const value = useMemo(
    () => ({ projects, current, loading, error, select, refresh }),
    [projects, current, loading, error, select, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject fuera de ProjectProvider');
  return ctx;
}

/** Id del proyecto actual (las páginas solo se muestran cuando existe). */
export function usePid(): string {
  const { current } = useProject();
  if (!current) throw new Error('No hay proyecto seleccionado');
  return current.id;
}
