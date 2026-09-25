export type CellState = 'available' | 'flexible' | 'blocked';

export interface Project {
  id: string;
  name: string;
  is_demo: boolean;
  demo_kind: string | null;
  created_at: string;
  updated_at: string;
}

export interface Period {
  id?: string;
  number: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface Subject {
  id: string;
  name: string;
  short_name: string;
  color: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export type SubjectInput = Pick<Subject, 'name' | 'short_name' | 'color' | 'active'>;

export interface Group {
  id: string;
  grade: number;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export type GroupInput = Pick<Group, 'grade' | 'name' | 'active'>;

export interface Teacher {
  id: string;
  code: string;
  name: string;
  subject_ids: string[];
  weekly_load: number;
  allows_consecutive: boolean;
  max_consecutive: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export type TeacherInput = Omit<Teacher, 'id' | 'created_at' | 'updated_at'>;

export interface Assignment {
  id: string;
  teacher_id: string;
  subject_id: string;
  group_id: string;
  hours_per_week: number;
  created_at: string;
  updated_at: string;
}
export type AssignmentInput = Pick<Assignment, 'teacher_id' | 'subject_id' | 'group_id' | 'hours_per_week'>;

export interface AvailabilityCell {
  day: number;
  period_number: number;
  state: CellState;
}

export interface LoadSummary {
  teacher_id: string;
  teacher_name: string;
  teacher_code: string;
  active: boolean;
  declared: number;
  assigned: number;
  difference: number;
  scheduled: number;
  status: 'ok' | 'faltan' | 'sobran';
  message: string;
}

export interface Issue {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  teacher: string | null;
  group: string | null;
  subject: string | null;
  missing_hours: number | null;
  actions: string[];
  causes?: string[];
  day?: number;
  period_number?: number;
  entry_ids?: (string | null)[];
}

export interface ScheduleEntry {
  id: string | null;
  assignment_id: string;
  day: number;
  period_number: number;
  locked: boolean;
}

export interface PendingItem {
  assignment_id: string;
  teacher: string;
  subject: string;
  group: string;
  teacher_id: string;
  group_id: string;
  subject_id: string;
  hours_per_week: number;
  scheduled: number;
  missing: number;
  reason: string;
}

export interface GenerationReport {
  status: 'complete' | 'partial' | 'invalid' | 'error';
  summary: string;
  prevalidation: Issue[];
  conflicts: Issue[];
  shortages: Issue[];
  lock_warnings: Issue[];
  pending?: PendingItem[];
  stats: {
    required: number;
    placed: number;
    missing?: number;
    flexible_used?: number;
    locked_kept?: number;
    solver_status?: string;
    seconds?: number;
  };
  created_at?: string;
}

export interface ScheduleState {
  entries: ScheduleEntry[];
  conflicts: Issue[];
  pending: PendingItem[];
  flexible_used: number;
  flexible_ids: string[];
  loads: LoadSummary[];
  history: string[];
  last_run: GenerationReport | null;
}

export interface Validation {
  issues: Issue[];
  errors: number;
  warnings: number;
  loads: LoadSummary[];
}

export interface EntryView {
  entry_id: string | null;
  teacher: string;
  subject: string;
  group: string;
  slot: string;
  day: number | null;
  period_number: number | null;
  locked: boolean;
  new_slot?: string;
}

export interface MovePreview {
  kind: 'move' | 'swap' | 'place';
  original: EntryView;
  target: { day: number; period_number: number; slot: string };
  swapped: EntryView | null;
  teachers: string[];
  groups: string[];
  conflicts: Issue[];
  warnings: string[];
  allowed: boolean;
}

export interface MoveRequest {
  entry_id?: string;
  assignment_id?: string;
  day: number;
  period_number: number;
  swap_with?: string;
}

export interface VisionProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  needs_key: boolean;
}

export interface RecognizedAssignment {
  subject: string;
  group: string;
  hours: number;
}

export interface RecognizedTeacher {
  code: string;
  name: string;
  subjects: string[];
  assignments: RecognizedAssignment[];
  weekly_load: number;
  allows_consecutive: boolean;
  max_consecutive: number;
  availability: AvailabilityCell[];
  confidence: Record<string, number>;
  warnings: string[];
}

export interface RecognitionResult {
  provider: string;
  provider_label: string;
  pages: number;
  teachers: RecognizedTeacher[];
  overall_confidence: number;
  warnings: string[];
}

export interface BackupSummary {
  name: string;
  exported_at: string | null;
  teachers: number;
  groups: number;
  subjects: number;
  assignments: number;
  schedule_entries: number;
}
