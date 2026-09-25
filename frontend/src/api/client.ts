import type {
  Assignment,
  AssignmentInput,
  AvailabilityCell,
  BackupSummary,
  Group,
  GroupInput,
  LoadSummary,
  MovePreview,
  MoveRequest,
  Period,
  Project,
  RecognitionResult,
  RecognizedTeacher,
  ScheduleState,
  Subject,
  SubjectInput,
  Teacher,
  TeacherInput,
  Validation,
  VisionProviderInfo,
  GenerationReport,
} from './types';

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Listener = (event: 'start' | 'success' | 'error', message?: string) => void;
const listeners = new Set<Listener>();

/** Permite al indicador de guardado seguir las operaciones de escritura. */
export function onMutation(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const mutating = method !== 'GET';
  if (mutating) listeners.forEach((l) => l('start'));
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    const msg = 'No hay conexión con el servidor. Verifica que el backend esté encendido.';
    if (mutating) listeners.forEach((l) => l('error', msg));
    throw new ApiError(msg, 0);
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      msg = typeof data.detail === 'string' ? data.detail : msg;
      details = data.details ?? data.errors;
    } catch {
      /* respuesta sin JSON */
    }
    if (mutating) listeners.forEach((l) => l('error', msg));
    throw new ApiError(msg, res.status, details);
  }
  if (mutating) listeners.forEach((l) => l('success'));
  if (raw) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const p = (pid: string) => `/projects/${pid}`;

export const api = {
  health: () => request<{ status: string }>('GET', '/health'),

  projects: () => request<Project[]>('GET', '/projects'),
  createProject: (name: string) => request<Project>('POST', '/projects', { name }),
  renameProject: (pid: string, name: string) => request<Project>('PUT', p(pid), { name }),
  deleteProject: (pid: string) => request<void>('DELETE', p(pid)),
  createDemo: (kind: 'solvable' | 'conflict') => request<Project>('POST', `/demo/${kind}`),

  periods: (pid: string) => request<Period[]>('GET', `${p(pid)}/periods`),
  savePeriods: (pid: string, periods: Period[]) =>
    request<Period[]>('PUT', `${p(pid)}/periods`, {
      periods: periods.map(({ number, start_time, end_time, active }) => ({ number, start_time, end_time, active })),
    }),

  subjects: (pid: string) => request<Subject[]>('GET', `${p(pid)}/subjects`),
  createSubject: (pid: string, d: SubjectInput) => request<Subject>('POST', `${p(pid)}/subjects`, d),
  updateSubject: (pid: string, id: string, d: SubjectInput) => request<Subject>('PUT', `${p(pid)}/subjects/${id}`, d),
  deleteSubject: (pid: string, id: string) => request<void>('DELETE', `${p(pid)}/subjects/${id}`),

  groups: (pid: string) => request<Group[]>('GET', `${p(pid)}/groups`),
  createGroup: (pid: string, d: GroupInput) => request<Group>('POST', `${p(pid)}/groups`, d),
  updateGroup: (pid: string, id: string, d: GroupInput) => request<Group>('PUT', `${p(pid)}/groups/${id}`, d),
  deleteGroup: (pid: string, id: string) => request<void>('DELETE', `${p(pid)}/groups/${id}`),

  teachers: (pid: string) => request<Teacher[]>('GET', `${p(pid)}/teachers`),
  createTeacher: (pid: string, d: TeacherInput) => request<Teacher>('POST', `${p(pid)}/teachers`, d),
  updateTeacher: (pid: string, id: string, d: TeacherInput) => request<Teacher>('PUT', `${p(pid)}/teachers/${id}`, d),
  deleteTeacher: (pid: string, id: string) => request<void>('DELETE', `${p(pid)}/teachers/${id}`),
  availability: (pid: string, tid: string) =>
    request<{ teacher_id: string; cells: AvailabilityCell[] }>('GET', `${p(pid)}/teachers/${tid}/availability`),
  saveAvailability: (pid: string, tid: string, cells: AvailabilityCell[]) =>
    request<{ teacher_id: string; cells: AvailabilityCell[] }>('PUT', `${p(pid)}/teachers/${tid}/availability`, { cells }),

  assignments: (pid: string) => request<Assignment[]>('GET', `${p(pid)}/assignments`),
  createAssignment: (pid: string, d: AssignmentInput) => request<Assignment>('POST', `${p(pid)}/assignments`, d),
  updateAssignment: (pid: string, id: string, d: AssignmentInput) =>
    request<Assignment>('PUT', `${p(pid)}/assignments/${id}`, d),
  deleteAssignment: (pid: string, id: string) => request<void>('DELETE', `${p(pid)}/assignments/${id}`),

  loads: (pid: string) => request<LoadSummary[]>('GET', `${p(pid)}/loads`),
  validate: (pid: string) => request<Validation>('GET', `${p(pid)}/validate`),

  schedule: (pid: string) => request<ScheduleState>('GET', `${p(pid)}/schedule`),
  generate: (pid: string, keepLocked: boolean) =>
    request<{ status: string; report: GenerationReport; schedule: ScheduleState }>('POST', `${p(pid)}/generate`, {
      keep_locked: keepLocked,
    }),
  previewMove: (pid: string, body: MoveRequest) => request<MovePreview>('POST', `${p(pid)}/schedule/preview`, body),
  applyMove: (pid: string, body: MoveRequest) =>
    request<{ preview: MovePreview; schedule: ScheduleState }>('POST', `${p(pid)}/schedule/apply`, body),
  setLock: (pid: string, eid: string, locked: boolean) =>
    request<ScheduleState>('PATCH', `${p(pid)}/schedule/entries/${eid}`, { locked }),
  removeEntry: (pid: string, eid: string) => request<ScheduleState>('DELETE', `${p(pid)}/schedule/entries/${eid}`),
  undo: (pid: string) => request<{ undone: string; schedule: ScheduleState }>('POST', `${p(pid)}/schedule/undo`),
  clearSchedule: (pid: string) => request<ScheduleState>('DELETE', `${p(pid)}/schedule`),

  visionProviders: () => request<VisionProviderInfo[]>('GET', '/vision/providers'),
  recognize: (provider: string, files: Blob[]) => {
    const fd = new FormData();
    fd.append('provider', provider);
    files.forEach((f, i) => fd.append('files', f, `pagina-${i + 1}.jpg`));
    return request<RecognitionResult>('POST', '/vision/recognize', fd);
  },
  confirmImport: (pid: string, teachers: RecognizedTeacher[]) =>
    request<{
      teachers: string[];
      updated_teachers: string[];
      subjects: string[];
      groups: string[];
      assignments: number;
    }>('POST', `${p(pid)}/import/confirm`, {
      teachers: teachers.map((t) => ({
        code: t.code,
        name: t.name,
        subjects: t.subjects,
        assignments: t.assignments,
        weekly_load: t.weekly_load,
        allows_consecutive: t.allows_consecutive,
        max_consecutive: t.max_consecutive,
        availability: t.availability,
      })),
    }),

  inspectBackup: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<BackupSummary>('POST', '/backup/inspect', fd);
  },
  restoreBackup: (file: File, mode: 'new' | 'replace', projectId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    const q = new URLSearchParams({ mode });
    if (mode === 'replace' && projectId) {
      q.set('project_id', projectId);
      q.set('confirm', 'true');
    }
    return request<Project>('POST', `/backup/restore?${q}`, fd);
  },
};

/** Descarga un archivo del backend respetando el nombre sugerido. */
export async function download(path: string, fallbackName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(BASE + path);
  } catch {
    throw new ApiError('No hay conexión con el servidor.', 0);
  }
  if (!res.ok) {
    let msg = `No se pudo descargar (error ${res.status}).`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {
      /* sin JSON */
    }
    throw new ApiError(msg, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export const exportUrls = {
  pdf: (pid: string, scope: string, orientation: string, itemId?: string) => {
    const q = new URLSearchParams({ scope, orientation });
    if (itemId) q.set('item_id', itemId);
    return `${p(pid)}/export/pdf?${q}`;
  },
  xlsx: (pid: string) => `${p(pid)}/export/xlsx`,
  json: (pid: string) => `${p(pid)}/export/json`,
  backup: (pid: string) => `${p(pid)}/backup`,
};
