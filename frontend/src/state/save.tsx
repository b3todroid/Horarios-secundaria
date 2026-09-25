import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onMutation } from '../api/client';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string };

const Ctx = createContext<Status>({ kind: 'idle' });

/** Sigue todas las escrituras al backend para mostrar el indicador de guardado. */
export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  useEffect(() => {
    let pending = 0;
    return onMutation((ev, message) => {
      if (ev === 'start') {
        pending++;
        setStatus({ kind: 'saving' });
      } else {
        pending = Math.max(0, pending - 1);
        if (ev === 'error') setStatus({ kind: 'error', message: message ?? 'Error al guardar' });
        else if (pending === 0) setStatus({ kind: 'saved', at: new Date() });
      }
    });
  }, []);
  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

export const useSaveStatus = () => useContext(Ctx);
