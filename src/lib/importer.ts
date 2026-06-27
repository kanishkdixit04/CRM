import { readSheet } from 'read-excel-file/browser';

export type ImportedLeadRow = {
  lead_id?: string | null;
  student_name?: string | null;
  student_phone?: string | null;
  student_email?: string | null;
  parent_name?: string | null;
  parent_relationship?: string | null;
  parent_primary_number?: string | null;
  parent_alternate_number?: string | null;
  parent_whatsapp_number?: string | null;
  preferred_language?: string | null;
  preferred_calling_time?: string | null;
  batch?: string | null;
  mode?: string | null;
  registration_source?: string | null;
  assessment_status?: string | null;
  assessment_score?: number | null;
  day1_assessment_status?: string | null;
  day1_assessment_score?: number | null;
  day1_feedback_status?: string | null;
  day2_assessment_status?: string | null;
  day2_assessment_score?: number | null;
  day2_feedback_status?: string | null;
  student_goals?: string | null;
  pain_points?: string | null;
  day1_attendance?: boolean | null;
  day2_attendance?: boolean | null;
  day3_attendance?: boolean | null;
  participation_score?: number | null;
  mentor_notes?: string | null;
  before_video_status?: string | null;
  after_video_status?: string | null;
  testimonial_status?: string | null;
  current_stage?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  parent_objection?: string | null;
  recommended_program?: string | null;
  payment_status?: string | null;
  enrollment_status?: string | null;
  closure_reason?: string | null;
  notes?: string | null;
  source_row: number;
};

type CellValue = string | number | boolean | Date | null;

const fieldAliases: Record<keyof Omit<ImportedLeadRow, 'source_row'>, string[]> = {
  lead_id: ['leadid', 'lead id', 'uniqueleadid', 'unique lead id'],
  student_name: ['studentname', 'student name', 'name', 'childname', 'child name'],
  student_phone: ['studentphone', 'student phone', 'studentmobile', 'student mobile', 'childphone'],
  student_email: ['studentemail', 'student email', 'email', 'childemail'],
  parent_name: ['parentname', 'parent name', 'fathername', 'mothername', 'guardianname'],
  parent_relationship: ['parentrelationship', 'parent relationship', 'relationship'],
  parent_primary_number: ['parentprimarynumber', 'parent primary number', 'parentphone', 'parent phone', 'parentmobile', 'mobile', 'phone'],
  parent_alternate_number: ['parentalternatenumber', 'parent alternate number', 'alternate number', 'alternatephone'],
  parent_whatsapp_number: ['parentwhatsappnumber', 'parent whatsapp number', 'whatsapp', 'whatsappnumber', 'whatsapp number'],
  preferred_language: ['preferredlanguage', 'preferred language', 'language'],
  preferred_calling_time: ['preferredcallingtime', 'preferred calling time', 'callingtime', 'callbacktime'],
  batch: ['batch', 'bootcampbatch'],
  mode: ['mode', 'classmode'],
  registration_source: ['registrationsource', 'registration source', 'source', 'leadsource', 'lead source'],
  assessment_status: ['assessmentstatus', 'assessment status'],
  assessment_score: ['assessmentscore', 'assessment score'],
  day1_assessment_status: ['day1assessmentstatus', 'day 1 assessment status', 'd1assessmentstatus'],
  day1_assessment_score: ['day1assessmentscore', 'day 1 assessment score', 'd1score'],
  day1_feedback_status: ['day1feedbackstatus', 'day 1 feedback status', 'd1feedback'],
  day2_assessment_status: ['day2assessmentstatus', 'day 2 assessment status', 'd2assessmentstatus'],
  day2_assessment_score: ['day2assessmentscore', 'day 2 assessment score', 'd2score'],
  day2_feedback_status: ['day2feedbackstatus', 'day 2 feedback status', 'd2feedback'],
  student_goals: ['studentgoals', 'student goals', 'goals'],
  pain_points: ['painpoints', 'pain points', 'parentobservation'],
  day1_attendance: ['day1attendance', 'day 1 attendance', 'd1attendance'],
  day2_attendance: ['day2attendance', 'day 2 attendance', 'd2attendance'],
  day3_attendance: ['day3attendance', 'day 3 attendance', 'd3attendance'],
  participation_score: ['participationscore', 'participation score'],
  mentor_notes: ['mentornotes', 'mentor notes', 'notes by mentor'],
  before_video_status: ['beforevideostatus', 'before video status', 'beforevideo'],
  after_video_status: ['aftervideostatus', 'after video status', 'aftervideo'],
  testimonial_status: ['testimonialstatus', 'testimonial status'],
  current_stage: ['currentstage', 'current stage', 'stage'],
  next_action: ['nextaction', 'next action'],
  next_action_at: ['nextactiondatetime', 'next action date time', 'nextactionat', 'next action at', 'next action date'],
  parent_objection: ['parentobjection', 'parent objection', 'objection'],
  recommended_program: ['recommendedprogram', 'recommended program', 'program'],
  payment_status: ['paymentstatus', 'payment status'],
  enrollment_status: ['enrollmentstatus', 'enrollment status'],
  closure_reason: ['closurereason', 'closure reason'],
  notes: ['notes', 'remarks', 'comment'],
};

const booleanFields = new Set<keyof ImportedLeadRow>(['day1_attendance', 'day2_attendance', 'day3_attendance']);
const numberFields = new Set<keyof ImportedLeadRow>([
  'assessment_score',
  'day1_assessment_score',
  'day2_assessment_score',
  'participation_score',
]);

function normalizeHeader(value: CellValue) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function compactHeader(value: string) {
  return value.replace(/[^a-z0-9]/g, '');
}

function cellToString(value: CellValue) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cellToBoolean(value: CellValue) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', 'present', 'attended', '1'].includes(text)) return true;
  if (['no', 'n', 'false', 'absent', '0'].includes(text)) return false;
  return null;
}

function cellToNumber(value: CellValue) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function parseCsv(text: string): CellValue[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current);
  rows.push(row);
  return rows.filter((item) => item.some((cell) => String(cell).trim().length > 0));
}

function mapRows(rows: CellValue[][]) {
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  const fieldByIndex = headers.map((header) => {
    const compact = compactHeader(header);
    return Object.entries(fieldAliases).find(([, aliases]) =>
      aliases.some((alias) => compactHeader(alias) === compact || normalizeHeader(alias) === header),
    )?.[0] as keyof Omit<ImportedLeadRow, 'source_row'> | undefined;
  });

  return rows.slice(1).reduce<ImportedLeadRow[]>((mappedRows, row, rowIndex) => {
    const imported: ImportedLeadRow = { source_row: rowIndex + 2 };

    row.forEach((cell, cellIndex) => {
      const field = fieldByIndex[cellIndex];
      if (!field) return;

      if (booleanFields.has(field)) {
        imported[field] = cellToBoolean(cell) as never;
      } else if (numberFields.has(field)) {
        imported[field] = cellToNumber(cell) as never;
      } else {
        imported[field] = cellToString(cell) as never;
      }
    });

    if (Object.values(imported).some((value) => value !== null && value !== undefined && value !== imported.source_row)) {
      mappedRows.push(imported);
    }

    return mappedRows;
  }, []);
}

export async function parseLeadImportFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return mapRows(parseCsv(await file.text()));
  }

  if (extension === 'xlsx') {
    const rows = (await readSheet(file)) as CellValue[][];
    return mapRows(rows);
  }

  throw new Error('Please upload a .xlsx or .csv file.');
}
