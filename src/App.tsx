import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LogOut,
  MessageSquareText,
  PhoneCall,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  buildWorkflowPatch,
  calculateScore,
  classifyPriority,
  Counselor,
  getMissingFields,
  KraKpi,
  Lead,
  priorityRank,
  terminalStages,
} from './lib/workflow';
import { ImportedLeadRow, parseLeadImportFile } from './lib/importer';

type NewLeadForm = {
  student_name: string;
  student_phone: string;
  student_email: string;
  parent_name: string;
  parent_primary_number: string;
  parent_whatsapp_number: string;
  batch: string;
  registration_source: string;
};

const initialLeadForm: NewLeadForm = {
  student_name: '',
  student_phone: '',
  student_email: '',
  parent_name: '',
  parent_primary_number: '',
  parent_whatsapp_number: '',
  batch: '',
  registration_source: 'Website',
};

const logoSrc = '/images/spikitech-logo-cropped.png';

const workflowSteps = [
  {
    label: 'Day 1',
    title: 'Assessment first',
    detail: 'Assessment, score, mentor note, then parent feedback.',
  },
  {
    label: 'Day 2',
    title: 'Repeat assessment loop',
    detail: 'Second assessment, participation, pain points, then progress feedback.',
  },
  {
    label: 'Day 3',
    title: 'Counseling slot',
    detail: 'Pitch parent counseling, capture objection, and book the meeting.',
  },
  {
    label: 'Day 4',
    title: 'Certificate share',
    detail: 'Send certificate and request SpikiTech tag in story or post.',
  },
  {
    label: 'After Bootcamp',
    title: 'Next-day follow-up',
    detail: 'Progress summary, program recommendation, payment or nurture follow-up.',
  },
];

const quickActionLabels: Record<string, string> = {
  day1: 'Day 1 Done',
  day2: 'Day 2 Done',
  day3: 'Day 3 Done',
  'no-answer': 'No Answer',
  connected: 'Connected',
  counseling: 'Book Meeting',
  certificate: 'Certificate Sent',
};

function compactPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function nextHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function buildDuplicateMaps(leads: Lead[]) {
  const maps = {
    student_phone: new Map<string, number>(),
    parent_primary_number: new Map<string, number>(),
    student_email: new Map<string, number>(),
  };

  for (const lead of leads) {
    if (lead.student_phone) maps.student_phone.set(lead.student_phone, (maps.student_phone.get(lead.student_phone) ?? 0) + 1);
    if (lead.parent_primary_number) {
      maps.parent_primary_number.set(
        lead.parent_primary_number,
        (maps.parent_primary_number.get(lead.parent_primary_number) ?? 0) + 1,
      );
    }
    if (lead.student_email) maps.student_email.set(lead.student_email, (maps.student_email.get(lead.student_email) ?? 0) + 1);
  }

  return maps;
}

function hasDuplicate(lead: Lead, maps: ReturnType<typeof buildDuplicateMaps>) {
  return Boolean(
    (lead.student_phone && (maps.student_phone.get(lead.student_phone) ?? 0) > 1) ||
      (lead.parent_primary_number && (maps.parent_primary_number.get(lead.parent_primary_number) ?? 0) > 1) ||
      (lead.student_email && (maps.student_email.get(lead.student_email) ?? 0) > 1),
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [kraKpis, setKraKpis] = useState<KraKpi[]>([]);
  const [newLead, setNewLead] = useState(initialLeadForm);
  const [importRows, setImportRows] = useState<ImportedLeadRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importSummary, setImportSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadData();
  }, [session]);

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const rankDiff = priorityRank(a) - priorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.next_action_at ?? 0).getTime() - new Date(b.next_action_at ?? 0).getTime();
    });
  }, [leads]);

  const metrics = useMemo(() => {
    const active = leads.filter((lead) => !terminalStages.includes(lead.current_stage));
    return {
      active: active.length,
      hot: active.filter((lead) => lead.lead_priority === 'Hot').length,
      overdue: active.filter((lead) => lead.overdue_status === 'Overdue' || !lead.next_action_at).length,
      day3Ready: active.filter((lead) => lead.day3_attendance && lead.certificate_status !== 'Sent').length,
      paymentPending: active.filter((lead) => lead.current_stage === 'Payment Pending').length,
      dataFix: active.filter((lead) => getMissingFields(lead).length > 0).length,
    };
  }, [leads]);

  const focusLead = sortedLeads[0];

  async function loadData() {
    if (!supabase) return;

    setBusy(true);
    setError('');
    try {
      const [leadResult, counselorResult, kraResult] = await Promise.all([
        supabase.from('active_lead_queue').select('*'),
        supabase.from('counselors').select('id,name,email,role').eq('active', true).order('created_at'),
        supabase.from('kra_kpi_items').select('*').order('sort_order'),
      ]);

      if (leadResult.error) throw leadResult.error;
      if (counselorResult.error) throw counselorResult.error;
      if (kraResult.error) throw kraResult.error;

      setLeads((leadResult.data ?? []) as Lead[]);
      setCounselors((counselorResult.data ?? []) as Counselor[]);
      setKraKpis((kraResult.data ?? []) as KraKpi[]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load CRM data.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !loginId.trim() || !password) return;
    setBusy(true);
    setAuthMessage('');
    setError('');

    const expectedLoginId = import.meta.env.VITE_LOGIN_ID ?? 'spikitechvivudh.com';
    const loginEmail = import.meta.env.VITE_LOGIN_EMAIL ?? 'admin@spikitechvivudh.com';

    if (loginId.trim().toLowerCase() !== expectedLoginId.toLowerCase()) {
      setBusy(false);
      setError('Invalid login ID.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    setBusy(false);
    if (signInError) {
      setError('Invalid login ID or password.');
      return;
    }
    setAuthMessage('Login successful.');
  }

  async function createLead(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNotice('');

    const primary = counselors.find((counselor) => counselor.role !== 'Team Leader')?.id ?? null;
    const backup =
      counselors.find((counselor) => counselor.role === 'Backup Counselor')?.id ?? counselors[1]?.id ?? null;

    const duplicateFilters = [
      newLead.student_phone ? `student_phone.eq.${compactPhone(newLead.student_phone)}` : '',
      newLead.parent_primary_number ? `parent_primary_number.eq.${compactPhone(newLead.parent_primary_number)}` : '',
      newLead.student_email ? `student_email.eq.${newLead.student_email.trim()}` : '',
    ].filter(Boolean);

    let duplicateFound = false;
    if (duplicateFilters.length > 0) {
      const duplicateResult = await supabase.from('leads').select('id').or(duplicateFilters.join(',')).limit(1);
      if (duplicateResult.error) throw duplicateResult.error;
      duplicateFound = (duplicateResult.data ?? []).length > 0;
    }

    const { error: insertError } = await supabase.from('leads').insert({
      student_name: newLead.student_name.trim(),
      student_phone: compactPhone(newLead.student_phone),
      student_email: newLead.student_email.trim() || null,
      parent_name: newLead.parent_name.trim() || null,
      parent_primary_number: compactPhone(newLead.parent_primary_number),
      parent_whatsapp_number: compactPhone(newLead.parent_whatsapp_number || newLead.parent_primary_number),
      batch: newLead.batch.trim() || null,
      registration_source: newLead.registration_source.trim() || null,
      parent_consent: Boolean(newLead.parent_primary_number),
      primary_counselor_id: primary,
      backup_counselor_id: backup,
      current_stage: newLead.parent_primary_number ? 'Parent Contact Pending' : 'Verification Pending',
      next_action: newLead.parent_primary_number
        ? 'Call parent, confirm registration, introduce counselor and ask preferred callback time'
        : 'Ask student to verify parent number',
      next_action_at: nextHours(2),
      duplicate_flag: duplicateFound,
      notes: duplicateFound ? 'Possible duplicate detected on student phone, parent phone or student email.' : null,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewLead(initialLeadForm);
    setNotice('Lead created with counselor ownership and next action.');
    await loadData();
  }

  function buildLeadPayload(row: ImportedLeadRow, duplicateFound = false) {
    const primary = counselors.find((counselor) => counselor.role !== 'Team Leader')?.id ?? null;
    const backup =
      counselors.find((counselor) => counselor.role === 'Backup Counselor')?.id ?? counselors[1]?.id ?? null;
    const parentNumber = compactPhone(row.parent_primary_number ?? '');
    const studentPhone = compactPhone(row.student_phone ?? '');
    const whatsapp = compactPhone(row.parent_whatsapp_number ?? row.parent_primary_number ?? '');

    return {
      lead_id: row.lead_id || undefined,
      student_name: row.student_name?.trim(),
      student_phone: studentPhone || null,
      student_email: row.student_email?.trim() || null,
      parent_name: row.parent_name?.trim() || null,
      parent_relationship: row.parent_relationship || null,
      parent_primary_number: parentNumber || null,
      parent_alternate_number: compactPhone(row.parent_alternate_number ?? '') || null,
      parent_whatsapp_number: whatsapp || null,
      preferred_language: row.preferred_language || 'Hindi/English',
      preferred_calling_time: row.preferred_calling_time || null,
      parent_consent: Boolean(parentNumber),
      batch: row.batch || null,
      mode: row.mode || 'Online',
      registration_source: row.registration_source || `Sheet import: ${importFileName}`,
      primary_counselor_id: primary,
      backup_counselor_id: backup,
      assessment_status: row.assessment_status || undefined,
      assessment_score: row.assessment_score ?? undefined,
      day1_assessment_status: row.day1_assessment_status || undefined,
      day1_assessment_score: row.day1_assessment_score ?? undefined,
      day1_feedback_status: row.day1_feedback_status || undefined,
      day2_assessment_status: row.day2_assessment_status || undefined,
      day2_assessment_score: row.day2_assessment_score ?? undefined,
      day2_feedback_status: row.day2_feedback_status || undefined,
      student_goals: row.student_goals || null,
      pain_points: row.pain_points || null,
      day1_attendance: row.day1_attendance ?? undefined,
      day2_attendance: row.day2_attendance ?? undefined,
      day3_attendance: row.day3_attendance ?? undefined,
      participation_score: row.participation_score ?? undefined,
      mentor_notes: row.mentor_notes || null,
      before_video_status: row.before_video_status || undefined,
      after_video_status: row.after_video_status || undefined,
      testimonial_status: row.testimonial_status || undefined,
      current_stage: row.current_stage || (parentNumber ? 'Parent Contact Pending' : 'Verification Pending'),
      next_action:
        row.next_action ||
        (parentNumber
          ? 'Call parent, confirm registration, introduce counselor and ask preferred callback time'
          : 'Ask student to verify parent number'),
      next_action_at: row.next_action_at || nextHours(2),
      parent_objection: row.parent_objection || null,
      recommended_program: row.recommended_program || null,
      payment_status: row.payment_status || undefined,
      enrollment_status: row.enrollment_status || undefined,
      closure_reason: row.closure_reason || null,
      notes: row.notes || (duplicateFound ? 'Possible duplicate detected during sheet import.' : null),
      duplicate_flag: duplicateFound,
    };
  }

  async function findExistingLead(row: ImportedLeadRow) {
    if (!supabase) return null;
    const checks = [
      row.lead_id ? { field: 'lead_id', value: row.lead_id } : null,
      row.parent_primary_number ? { field: 'parent_primary_number', value: compactPhone(row.parent_primary_number) } : null,
      row.student_phone ? { field: 'student_phone', value: compactPhone(row.student_phone) } : null,
      row.student_email ? { field: 'student_email', value: row.student_email.trim() } : null,
    ].filter(Boolean) as Array<{ field: string; value: string }>;

    for (const check of checks) {
      const { data, error: queryError } = await supabase.from('leads').select('id').eq(check.field, check.value).limit(1);
      if (queryError) throw queryError;
      if (data && data.length > 0) return data[0] as { id: string };
    }

    return null;
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    setImportSummary('');

    try {
      const rows = await parseLeadImportFile(file);
      setImportRows(rows);
      setImportFileName(file.name);
      setNotice(`${rows.length} rows loaded from ${file.name}. Review the preview and click Import leads.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to read sheet.';
      setError(message);
      setImportRows([]);
      setImportFileName('');
    } finally {
      setBusy(false);
    }
  }

  async function importSpreadsheetLeads() {
    if (!supabase || importRows.length === 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    setImportSummary('');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      for (const row of importRows) {
        if (!row.student_name?.trim()) {
          skipped += 1;
          continue;
        }

        const existing = await findExistingLead(row);
        const payload = buildLeadPayload(row, Boolean(existing));
        const score = calculateScore({
          ...payload,
          id: '',
          lead_score: 0,
          lead_priority: 'Incomplete',
          number_of_contact_attempts: 0,
          last_contact_at: null,
          last_contact_outcome: null,
          overdue_status: null,
          counseling_at: null,
          certificate_status: 'Pending',
          parent_tag_request_status: 'Pending',
          post_bootcamp_next_day_activity: null,
          data_correction_required: false,
          duplicate_flag: Boolean(existing),
          escalated_to_backup: false,
          escalated_to_leader: false,
        } as Lead);

        const finalPayload = {
          ...payload,
          lead_score: score,
          lead_priority: classifyPriority(score),
          data_correction_required: !payload.parent_name || !payload.parent_primary_number,
        };

        if (existing) {
          const { error: updateError } = await supabase.from('leads').update(finalPayload).eq('id', existing.id);
          if (updateError) throw updateError;
          updated += 1;
        } else {
          const { error: insertError } = await supabase.from('leads').insert(finalPayload);
          if (insertError) throw insertError;
          created += 1;
        }
      }

      setImportSummary(`Imported ${created} new leads, updated ${updated}, skipped ${skipped} rows.`);
      setImportRows([]);
      setImportFileName('');
      await loadData();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Sheet import failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function logAction(lead: Lead, patch: Record<string, unknown>, outcome: string, notes: string) {
    if (!supabase) return;

    const nextScore = calculateScore({ ...lead, ...patch } as Lead);
    const finalPatch: Record<string, unknown> = {
      ...patch,
      lead_score: nextScore,
      lead_priority: classifyPriority(nextScore),
      last_contact_at: new Date().toISOString(),
      last_contact_outcome: outcome,
      data_correction_required: getMissingFields({ ...lead, ...patch } as Lead).length > 0,
    };

    const { error: updateError } = await supabase.from('leads').update(finalPatch).eq('id', lead.id);
    if (updateError) throw updateError;

    const { error: logError } = await supabase.from('lead_activity_logs').insert({
      lead_id: lead.id,
      counselor_id: lead.primary_counselor_id,
      channel: outcome === 'No Answer' ? 'Phone + WhatsApp' : 'CRM',
      attempt_number: Number(finalPatch.number_of_contact_attempts ?? lead.number_of_contact_attempts),
      outcome,
      previous_stage: lead.current_stage,
      current_stage: String(finalPatch.current_stage ?? lead.current_stage),
      next_action: String(finalPatch.next_action ?? lead.next_action ?? ''),
      next_action_at: (finalPatch.next_action_at as string | null | undefined) ?? lead.next_action_at,
      updated_score: nextScore,
      notes,
    });
    if (logError) throw logError;
  }

  async function runCycle() {
    if (!supabase) return;
    setBusy(true);
    setNotice('');
    setError('');

    try {
      let newLeadsProcessed = 0;
      let overdue = 0;
      let missing = 0;
      let escalated = 0;
      const duplicateMaps = buildDuplicateMaps(sortedLeads);

      for (const lead of sortedLeads) {
        const patch = buildWorkflowPatch(lead, counselors);
        const duplicateFlag = hasDuplicate(lead, duplicateMaps);
        if (lead.current_stage === 'New Registration') newLeadsProcessed += 1;
        if (lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now()) overdue += 1;
        if (getMissingFields(lead).length > 0) missing += 1;

        const shouldEscalate =
          lead.number_of_contact_attempts >= 3 ||
          (lead.lead_priority === 'Hot' && (!lead.next_action_at || new Date(lead.next_action_at) < new Date())) ||
          (lead.day3_attendance && lead.current_stage !== 'Counseling Scheduled' && lead.current_stage !== 'Payment Pending');

        const finalPatch = {
          ...patch,
          duplicate_flag: duplicateFlag,
          escalated_to_backup: lead.escalated_to_backup || lead.number_of_contact_attempts >= 3,
          escalated_to_leader: lead.escalated_to_leader || shouldEscalate,
        };

        if (shouldEscalate) escalated += 1;

        await logAction(
          lead,
          finalPatch,
          getMissingFields(lead).length > 0 ? 'Data Correction' : 'Feedback Shared',
          'Workflow cycle recalculated score, stage, next action, and escalation state.',
        );

        if (getMissingFields({ ...lead, ...finalPatch } as Lead).length > 0) {
          await supabase.from('pending_tasks').insert({
            lead_id: lead.id,
            owner_id: lead.primary_counselor_id,
            task_type: 'Data Correction',
            title: `Fix missing fields: ${getMissingFields({ ...lead, ...finalPatch } as Lead).join(', ')}`,
            due_at: nextHours(6),
          });
        }

        if (duplicateFlag) {
          await supabase.from('pending_tasks').insert({
            lead_id: lead.id,
            owner_id: lead.primary_counselor_id,
            task_type: 'Duplicate Review',
            title: 'Review possible duplicate phone or email without deleting historical notes',
            due_at: nextHours(6),
          });
        }
      }

      await supabase.from('cycle_reports').insert({
        total_active_checked: sortedLeads.length,
        new_leads_processed: newLeadsProcessed,
        parents_contacted: sortedLeads.filter((lead) => lead.last_contact_outcome === 'Connected').length,
        calls_unanswered: sortedLeads.filter((lead) => lead.last_contact_outcome === 'No Answer').length,
        whatsapp_replies: sortedLeads.filter((lead) => lead.last_contact_outcome === 'WhatsApp Reply Received').length,
        parent_details_missing: missing,
        followups_completed: sortedLeads.filter((lead) => lead.last_contact_at).length,
        followups_overdue: overdue,
        counseling_booked: sortedLeads.filter((lead) => lead.current_stage === 'Counseling Scheduled').length,
        counseling_completed: sortedLeads.filter((lead) => lead.current_stage === 'Counseling Completed').length,
        hot_leads_attention: sortedLeads.filter((lead) => lead.lead_priority === 'Hot').length,
        payment_pending: sortedLeads.filter((lead) => lead.current_stage === 'Payment Pending').length,
        leads_escalated: escalated,
        enrollments_completed: leads.filter((lead) => lead.current_stage === 'Enrolled').length,
        opt_outs: leads.filter((lead) => lead.current_stage === 'Opted Out').length,
        invalid_contacts: leads.filter((lead) => lead.current_stage === 'Invalid Contact').length,
        leads_remaining_queue: sortedLeads.length,
      });

      setNotice('Workflow cycle completed. Active leads now have refreshed scores, ownership, next actions and tasks.');
      await loadData();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Workflow cycle failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function quickAction(lead: Lead, action: string) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      if (action === 'day1') {
        await logAction(
          lead,
          {
            day1_attendance: true,
            day1_assessment_status: 'Completed',
            assessment_status: 'Completed',
            current_stage: 'Assessment Completed',
            next_action: 'Share Day 1 feedback with parent and send Day 2 activity reminder',
            next_action_at: nextHours(4),
          },
          'Assessment Completed',
          'Day 1 attendance and first assessment completed.',
        );
      }

      if (action === 'day2') {
        await logAction(
          lead,
          {
            day2_attendance: true,
            day2_assessment_status: 'Completed',
            current_stage: 'Assessment Completed',
            next_action: 'Share Day 2 progress feedback and qualify counseling interest',
            next_action_at: nextHours(4),
          },
          'Assessment Completed',
          'Day 2 assessment completed.',
        );
      }

      if (action === 'day3') {
        await logAction(
          lead,
          {
            day3_attendance: true,
            current_stage: 'Bootcamp Attending',
            next_action: 'Pitch certificate counseling meeting and book parent counseling slot',
            next_action_at: nextHours(3),
          },
          'Attendance Marked',
          'Day 3 completed. Certificate counseling and slot booking are due.',
        );
      }

      if (action === 'no-answer') {
        const attempts = lead.number_of_contact_attempts + 1;
        await logAction(
          lead,
          {
            number_of_contact_attempts: attempts,
            current_stage:
              attempts === 1
                ? 'Parent Attempt 1 Completed'
                : attempts === 2
                  ? 'Parent Attempt 2 Completed'
                  : 'Parent Attempt 3 Completed',
            next_action:
              attempts >= 3
                ? 'Backup counselor recovery attempt with short voice-note script'
                : `Call parent attempt ${attempts + 1} and ask suitable callback time`,
            next_action_at: nextHours(attempts >= 3 ? 24 : 6),
            escalated_to_backup: attempts >= 3,
          },
          'No Answer',
          `Parent call attempt ${attempts} was unanswered. WhatsApp follow-up is required.`,
        );
      }

      if (action === 'connected') {
        await logAction(
          lead,
          {
            current_stage: 'Parent Connected',
            next_action: 'Identify parent requirement and schedule counseling if interested',
            next_action_at: nextHours(24),
          },
          'Connected',
          'Parent connected. Requirement and next decision step must be captured.',
        );
      }

      if (action === 'counseling') {
        await logAction(
          lead,
          {
            current_stage: 'Counseling Scheduled',
            counseling_at: nextHours(24),
            next_action: 'Conduct counseling meeting, record objection and program fit',
            next_action_at: nextHours(24),
          },
          'Counseling Booked',
          'Counseling slot booked for parent.',
        );
      }

      if (action === 'certificate') {
        await logAction(
          lead,
          {
            certificate_status: 'Sent',
            parent_tag_request_status: 'Requested',
            next_action: 'Post-bootcamp next-day activity: share progress summary and recommend program',
            next_action_at: nextHours(24),
          },
          'Certificate Sent',
          'Certificate sent. Parent asked to tag SpikiTech in story or post.',
        );
      }

      setNotice('Action logged and next step scheduled.');
      await loadData();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Action failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteLead(lead: Lead) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Delete lead for ${lead.student_name}? This will remove the lead and its activity history from the CRM.`,
    );

    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const { error: deleteError } = await supabase.from('leads').delete().eq('id', lead.id);
      if (deleteError) throw deleteError;

      setNotice(`Deleted lead: ${lead.student_name}`);
      await loadData();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Lead delete failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="center-screen">
        <section className="auth-panel">
          <ShieldAlert />
          <h1>Supabase config missing</h1>
          <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="center-screen">
        <RefreshCw className="spin" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="center-screen branded-login">
        <form className="auth-panel" onSubmit={signIn}>
          <img className="auth-logo" src={logoSrc} alt="SpikiTech" />
          <h1>SpikiTech CRM</h1>
          <p>Parent engagement desk for bootcamp leads, feedback calls, counseling and certificates.</p>
          <label>
            Login ID
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="spikitechvivudh.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              required
            />
          </label>
          <button className="primary-button" disabled={busy}>
            <Send size={18} />
            Login
          </button>
          {authMessage && <div className="notice">{authMessage}</div>}
          {error && <div className="error">{error}</div>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="app-logo" src={logoSrc} alt="SpikiTech" />
          <div>
            <p className="eyebrow">SpikiTech CRM</p>
            <h1>Parent Engagement Desk</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button onClick={loadData} disabled={busy} title="Refresh data">
            <RefreshCw size={18} className={busy ? 'spin' : ''} />
          </button>
          <button onClick={() => supabase?.auth.signOut()} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}
      {error && (
        <div className="error">
          {error.includes('relation') || error.includes('schema') ? (
            <>
              Supabase schema is not installed yet. Apply `supabase/migrations/20260628000000_bootcamp_crm.sql`,
              then refresh.
            </>
          ) : (
            error
          )}
        </div>
      )}

      <section className="workbench">
        <div className="workbench-main">
          <p className="eyebrow">Next lead to handle</p>
          <h2>{focusLead ? focusLead.student_name : 'No active lead due'}</h2>
          <p>
            {focusLead
              ? focusLead.next_action ?? 'Add a clear next action for this lead.'
              : 'The active queue is clear right now.'}
          </p>
          {focusLead && (
            <div className="focus-meta">
              <span>{focusLead.parent_name ?? 'Parent missing'}</span>
              <span>{focusLead.parent_primary_number ?? 'Phone missing'}</span>
              <span>{formatDate(focusLead.next_action_at)}</span>
            </div>
          )}
        </div>
        <div className="workbench-side">
          <button className="primary-button" onClick={runCycle} disabled={busy || sortedLeads.length === 0}>
            <Play size={18} />
            Prepare Today&apos;s Work
          </button>
          <button onClick={loadData} disabled={busy}>
            <RefreshCw size={18} className={busy ? 'spin' : ''} />
            Refresh CRM
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric icon={<Users />} label="Parents to handle" value={metrics.active} />
        <Metric icon={<Sparkles />} label="High priority" value={metrics.hot} />
        <Metric icon={<CalendarClock />} label="Late or missing" value={metrics.overdue} />
        <Metric icon={<GraduationCap />} label="Certificates due" value={metrics.day3Ready} />
        <Metric icon={<MessageSquareText />} label="Payment follow-ups" value={metrics.paymentPending} />
        <Metric icon={<ShieldAlert />} label="Data to fix" value={metrics.dataFix} />
      </section>

      <section className="workflow-band">
        {workflowSteps.map((step) => (
          <article key={step.label} className="workflow-step">
            <span>{step.label}</span>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <form className="lead-form panel" onSubmit={createLead}>
          <div className="section-title">
            <ClipboardCheck />
            <div>
              <h2>Add One Lead</h2>
              <p>Use this when one parent registers manually.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Student name
              <input
                value={newLead.student_name}
                onChange={(event) => setNewLead({ ...newLead, student_name: event.target.value })}
                required
              />
            </label>
            <label>
              Student phone
              <input
                value={newLead.student_phone}
                onChange={(event) => setNewLead({ ...newLead, student_phone: event.target.value })}
              />
            </label>
            <label>
              Student email
              <input
                type="email"
                value={newLead.student_email}
                onChange={(event) => setNewLead({ ...newLead, student_email: event.target.value })}
              />
            </label>
            <label>
              Parent name
              <input
                value={newLead.parent_name}
                onChange={(event) => setNewLead({ ...newLead, parent_name: event.target.value })}
              />
            </label>
            <label>
              Parent phone
              <input
                value={newLead.parent_primary_number}
                onChange={(event) => setNewLead({ ...newLead, parent_primary_number: event.target.value })}
              />
            </label>
            <label>
              WhatsApp number
              <input
                value={newLead.parent_whatsapp_number}
                onChange={(event) => setNewLead({ ...newLead, parent_whatsapp_number: event.target.value })}
              />
            </label>
            <label>
              Batch
              <input value={newLead.batch} onChange={(event) => setNewLead({ ...newLead, batch: event.target.value })} />
            </label>
            <label>
              Source
              <input
                value={newLead.registration_source}
                onChange={(event) => setNewLead({ ...newLead, registration_source: event.target.value })}
              />
            </label>
          </div>
          <button className="primary-button" disabled={busy}>
            <CheckCircle2 size={18} />
            Add lead
          </button>
        </form>

        <section className="panel import-panel">
          <div className="section-title">
            <UploadCloud />
            <div>
              <h2>Fill From Excel</h2>
              <p>Use this when registrations are already in a sheet.</p>
            </div>
          </div>
          <label className="file-drop">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <FileSpreadsheet size={24} />
            <strong>{importFileName || 'Choose Excel or CSV file'}</strong>
            <span>Student Name, Parent Phone, Batch, Attendance, Stage and Next Action are detected.</span>
          </label>
          {importRows.length > 0 && (
            <>
              <div className="import-actions">
                <span>{importRows.length} rows ready</span>
                <button className="primary-button" onClick={importSpreadsheetLeads} disabled={busy}>
                  <CheckCircle2 size={18} />
                  Import leads
                </button>
              </div>
              <div className="table-wrap preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Student</th>
                      <th>Parent</th>
                      <th>Phone</th>
                      <th>Batch</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((row) => (
                      <tr key={row.source_row}>
                        <td>{row.source_row}</td>
                        <td>{row.student_name ?? 'Missing'}</td>
                        <td>{row.parent_name ?? 'Missing'}</td>
                        <td>{row.parent_primary_number ?? row.student_phone ?? 'Missing'}</td>
                        <td>{row.batch ?? '-'}</td>
                        <td>{row.current_stage ?? 'Auto'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {importSummary && <div className="notice">{importSummary}</div>}
        </section>

        <section className="panel">
          <div className="section-title">
            <ClipboardList />
            <div>
              <h2>Team KRA / KPI</h2>
              <p>Daily ownership for assessment, feedback, counseling and certificate work.</p>
            </div>
          </div>
          <div className="kra-list">
            {kraKpis.map((item) => (
              <article key={item.id} className="kra-item">
                <span>{item.day_label}</span>
                <h3>{item.kra}</h3>
                <p>{item.kpi}</p>
                <footer>
                  <strong>{item.owner_role}</strong>
                  <small>{item.target}</small>
                </footer>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="panel queue-panel">
        <div className="section-title">
          <PhoneCall />
          <div>
            <h2>Today&apos;s Parent Queue</h2>
            <p>Work from the top. Each row shows the parent, current status and next action.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Parent</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Next work</th>
                <th>When</th>
                <th>Mark Result</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.student_name}</strong>
                    <small>{lead.lead_id ?? 'Lead ID pending'}</small>
                  </td>
                  <td>
                    <strong>{lead.parent_name ?? 'Parent missing'}</strong>
                    <small>{lead.parent_primary_number ?? 'Number missing'}</small>
                  </td>
                  <td>{lead.current_stage}</td>
                  <td>
                    <span className={`priority ${lead.lead_priority.toLowerCase()}`}>{lead.lead_priority}</span>
                    <small>{lead.lead_score}/100</small>
                  </td>
                  <td>{lead.next_action ?? 'Missing next action'}</td>
                  <td>{formatDate(lead.next_action_at)}</td>
                  <td>
                    <div className="action-row">
                      <button title="Day 1 assessment done" onClick={() => quickAction(lead, 'day1')} disabled={busy}>
                        {quickActionLabels.day1}
                      </button>
                      <button title="Day 2 assessment done" onClick={() => quickAction(lead, 'day2')} disabled={busy}>
                        {quickActionLabels.day2}
                      </button>
                      <button title="Day 3 completed" onClick={() => quickAction(lead, 'day3')} disabled={busy}>
                        {quickActionLabels.day3}
                      </button>
                      <button title="No answer" onClick={() => quickAction(lead, 'no-answer')} disabled={busy}>
                        <PhoneCall size={16} />
                        {quickActionLabels['no-answer']}
                      </button>
                      <button title="Parent connected" onClick={() => quickAction(lead, 'connected')} disabled={busy}>
                        <MessageSquareText size={16} />
                        {quickActionLabels.connected}
                      </button>
                      <button title="Book counseling" onClick={() => quickAction(lead, 'counseling')} disabled={busy}>
                        <CalendarClock size={16} />
                        {quickActionLabels.counseling}
                      </button>
                      <button title="Send certificate and tag request" onClick={() => quickAction(lead, 'certificate')} disabled={busy}>
                        <GraduationCap size={16} />
                        {quickActionLabels.certificate}
                      </button>
                    </div>
                    {getMissingFields(lead).length > 0 && <small>Missing: {getMissingFields(lead).join(', ')}</small>}
                  </td>
                  <td>
                    <button className="danger-button" title="Delete lead" onClick={() => deleteLead(lead)} disabled={busy}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {sortedLeads.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No active leads in the queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="metric-tile">
      {icon}
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

export default App;
