export const terminalStages = ['Enrolled', 'Not Interested', 'Invalid Contact', 'Opted Out'];

export type Lead = {
  id: string;
  lead_id: string | null;
  student_name: string;
  student_phone: string | null;
  student_email: string | null;
  parent_name: string | null;
  parent_primary_number: string | null;
  parent_whatsapp_number: string | null;
  preferred_language: string | null;
  preferred_calling_time: string | null;
  parent_consent: boolean;
  batch: string | null;
  mode: string | null;
  registration_source: string | null;
  primary_counselor_id: string | null;
  backup_counselor_id: string | null;
  assessment_status: string | null;
  assessment_score: number | null;
  day1_assessment_status: string | null;
  day1_assessment_score: number | null;
  day1_feedback_status: string | null;
  day2_assessment_status: string | null;
  day2_assessment_score: number | null;
  day2_feedback_status: string | null;
  day1_attendance: boolean | null;
  day2_attendance: boolean | null;
  day3_attendance: boolean | null;
  participation_score: number | null;
  mentor_notes: string | null;
  before_video_status: string | null;
  after_video_status: string | null;
  testimonial_status: string | null;
  certificate_status: string | null;
  parent_tag_request_status: string | null;
  post_bootcamp_next_day_activity: string | null;
  current_stage: string;
  lead_score: number;
  lead_priority: string;
  number_of_contact_attempts: number;
  last_contact_at: string | null;
  last_contact_outcome: string | null;
  next_action: string | null;
  next_action_at: string | null;
  overdue_status: string | null;
  parent_objection: string | null;
  recommended_program: string | null;
  counseling_at: string | null;
  payment_status: string | null;
  enrollment_status: string | null;
  closure_reason: string | null;
  notes: string | null;
  duplicate_flag: boolean;
  data_correction_required: boolean;
  escalated_to_backup: boolean;
  escalated_to_leader: boolean;
  primary_counselor_name?: string | null;
  backup_counselor_name?: string | null;
  priority_rank?: number;
  overdue_duration?: string;
};

export type Counselor = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

export type KraKpi = {
  id: string;
  day_label: string;
  kra: string;
  kpi: string;
  owner_role: string;
  target: string;
  sort_order: number;
};

export type LeadPatch = Partial<Lead> & {
  next_action_at?: string | null;
  last_contact_outcome?: string | null;
};

const addHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const tomorrowAt = (hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export function calculateScore(lead: Lead): number {
  let score = 0;
  if (lead.parent_primary_number && lead.parent_consent) score += 5;
  if (lead.assessment_status === 'Completed' || lead.day1_assessment_status === 'Completed') score += 10;
  if (lead.day1_attendance && lead.day2_attendance && lead.day3_attendance) score += 20;
  if ((lead.participation_score ?? 0) >= 7) score += 10;
  if (lead.before_video_status === 'Received' && lead.after_video_status === 'Received') score += 10;
  if (['Connected', 'Counseling Booked', 'Interested', 'Payment Pending'].includes(lead.last_contact_outcome ?? '')) score += 10;
  if (lead.last_contact_outcome === 'WhatsApp Reply Received') score += 5;
  if (lead.day1_feedback_status === 'Shared' || lead.day2_feedback_status === 'Shared') score += 10;
  if (lead.recommended_program) score += 5;
  if (lead.current_stage === 'Decision Pending') score += 5;
  if (lead.recommended_program && lead.parent_objection) score += 5;
  if (lead.payment_status === 'Payment Link Sent' || lead.current_stage === 'Payment Pending') score += 5;
  return Math.min(score, 100);
}

export function classifyPriority(score: number) {
  if (score >= 75) return 'Hot';
  if (score >= 50) return 'Warm';
  if (score >= 25) return 'Nurture';
  return 'Incomplete';
}

export function getMissingFields(lead: Lead) {
  const missing: string[] = [];
  if (!lead.parent_name) missing.push('Parent name');
  if (!lead.parent_primary_number) missing.push('Parent primary number');
  if (!lead.primary_counselor_id) missing.push('Primary counselor');
  if (!lead.backup_counselor_id) missing.push('Backup counselor');
  if (!terminalStages.includes(lead.current_stage) && !lead.next_action) missing.push('Next action');
  if (!terminalStages.includes(lead.current_stage) && !lead.next_action_at) missing.push('Next-action date/time');
  return missing;
}

export function isDue(lead: Lead) {
  return !lead.next_action_at || new Date(lead.next_action_at).getTime() <= Date.now();
}

export function buildWorkflowPatch(lead: Lead, counselors: Counselor[]): LeadPatch {
  const score = calculateScore(lead);
  const base: LeadPatch = {
    lead_score: score,
    lead_priority: classifyPriority(score),
    overdue_status: lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now() ? 'Overdue' : 'Not Due',
    data_correction_required: getMissingFields(lead).length > 0,
  };

  const primary = lead.primary_counselor_id ?? counselors.find((c) => c.role !== 'Team Leader')?.id ?? null;
  const backup = lead.backup_counselor_id ?? counselors.find((c) => c.role === 'Backup Counselor')?.id ?? counselors[1]?.id ?? null;

  if (!lead.primary_counselor_id || !lead.backup_counselor_id) {
    return {
      ...base,
      primary_counselor_id: primary,
      backup_counselor_id: backup,
      current_stage: lead.parent_primary_number ? 'Parent Contact Pending' : 'Verification Pending',
      next_action: lead.parent_primary_number
        ? 'Call parent for registration verification and preferred callback time'
        : 'Ask student to verify parent number',
      next_action_at: addHours(2),
    };
  }

  if (!lead.parent_primary_number) {
    return {
      ...base,
      current_stage: 'Verification Pending',
      next_action: 'Ask student to verify parent number',
      next_action_at: addHours(4),
    };
  }

  if (lead.current_stage === 'New Registration') {
    return {
      ...base,
      current_stage: 'Parent Contact Pending',
      next_action: 'Call parent, confirm registration, introduce counselor and ask preferred callback time',
      next_action_at: addHours(2),
    };
  }

  if (lead.day1_attendance && lead.day1_assessment_status !== 'Completed') {
    return {
      ...base,
      current_stage: 'Assessment Pending',
      next_action: 'Complete Day 1 assessment and update score',
      next_action_at: addHours(3),
    };
  }

  if (lead.day1_assessment_status === 'Completed' && lead.day1_feedback_status !== 'Shared') {
    return {
      ...base,
      current_stage: 'Assessment Completed',
      next_action: 'Share Day 1 feedback with parent and send Day 2 activity reminder',
      next_action_at: tomorrowAt(11),
    };
  }

  if (lead.day2_attendance && lead.day2_assessment_status !== 'Completed') {
    return {
      ...base,
      current_stage: 'Assessment Pending',
      next_action: 'Complete Day 2 assessment, participation score and pain points',
      next_action_at: addHours(3),
    };
  }

  if (lead.day2_assessment_status === 'Completed' && lead.day2_feedback_status !== 'Shared') {
    return {
      ...base,
      current_stage: 'Assessment Completed',
      next_action: 'Share Day 2 progress feedback and qualify counseling interest',
      next_action_at: tomorrowAt(11),
    };
  }

  if (lead.day3_attendance && lead.current_stage !== 'Counseling Scheduled' && lead.current_stage !== 'Payment Pending') {
    return {
      ...base,
      current_stage: 'Bootcamp Attending',
      next_action: 'Pitch certificate counseling meeting and book parent counseling slot',
      next_action_at: addHours(4),
    };
  }

  if (lead.certificate_status !== 'Sent' && lead.current_stage === 'Counseling Scheduled') {
    return {
      ...base,
      next_action: 'Send certificate and ask parent to tag SpikiTech in story or post',
      next_action_at: tomorrowAt(10),
    };
  }

  if (lead.certificate_status === 'Sent' && lead.parent_tag_request_status !== 'Requested') {
    return {
      ...base,
      next_action: 'Ask parent to post certificate story/post and tag SpikiTech',
      next_action_at: addHours(4),
    };
  }

  if (!lead.post_bootcamp_next_day_activity && lead.certificate_status === 'Sent') {
    return {
      ...base,
      next_action: 'Schedule post-bootcamp next-day activity and conversion follow-up',
      next_action_at: tomorrowAt(12),
    };
  }

  if (lead.current_stage === 'Payment Pending') {
    return {
      ...base,
      next_action: 'Follow up payment after approved payment information was shared',
      next_action_at: addHours(24),
    };
  }

  if (!lead.next_action || !lead.next_action_at) {
    return {
      ...base,
      next_action: 'Call parent for progress update and next decision step',
      next_action_at: addHours(24),
    };
  }

  return base;
}

export function priorityRank(lead: Lead) {
  if (lead.last_contact_outcome === 'Callback Requested' && isDue(lead)) return 1;
  if (lead.lead_priority === 'Hot' && isDue(lead)) return 2;
  if (lead.current_stage === 'Payment Pending') return 3;
  if (lead.day3_attendance && lead.day2_feedback_status !== 'Shared') return 4;
  if (lead.current_stage === 'New Registration') return 5;
  if (lead.counseling_at && new Date(lead.counseling_at).toDateString() === new Date().toDateString()) return 6;
  if ([1, 2].includes(lead.number_of_contact_attempts)) return 7;
  if (lead.lead_priority === 'Warm') return 8;
  if (lead.data_correction_required) return 9;
  return 10;
}
