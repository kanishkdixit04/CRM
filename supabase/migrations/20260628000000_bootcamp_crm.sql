create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'New Registration',
      'Verification Pending',
      'Assessment Pending',
      'Assessment Completed',
      'Bootcamp Attending',
      'Parent Contact Pending',
      'Parent Attempt 1 Completed',
      'Parent Attempt 2 Completed',
      'Parent Attempt 3 Completed',
      'Parent Connected',
      'Counseling Scheduled',
      'Counseling Completed',
      'Interested',
      'Decision Pending',
      'Payment Pending',
      'Enrolled',
      'Long-Term Nurture',
      'Not Interested',
      'Invalid Contact',
      'Opted Out'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'contact_outcome') then
    create type public.contact_outcome as enum (
      'Connected',
      'No Answer',
      'Busy',
      'Switched Off',
      'Invalid Number',
      'Callback Requested',
      'WhatsApp Reply Received',
      'Counseling Booked',
      'Interested',
      'Decision Pending',
      'Payment Pending',
      'Not Interested',
      'Opted Out',
      'Assessment Completed',
      'Attendance Marked',
      'Certificate Sent',
      'Feedback Shared',
      'Data Correction'
    );
  end if;
end $$;

create table if not exists public.counselors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  phone text,
  role text not null default 'Counselor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_id text unique,
  student_name text not null,
  student_phone text,
  student_email text,
  parent_name text,
  parent_relationship text,
  parent_primary_number text,
  parent_alternate_number text,
  parent_whatsapp_number text,
  preferred_language text default 'Hindi/English',
  preferred_calling_time text,
  parent_consent boolean not null default false,
  batch text,
  mode text default 'Online',
  registration_source text,
  primary_counselor_id uuid references public.counselors(id),
  backup_counselor_id uuid references public.counselors(id),
  assessment_status text default 'Pending',
  assessment_score numeric(5,2),
  day1_assessment_status text default 'Pending',
  day1_assessment_score numeric(5,2),
  day1_feedback_status text default 'Pending',
  day2_assessment_status text default 'Pending',
  day2_assessment_score numeric(5,2),
  day2_feedback_status text default 'Pending',
  student_goals text,
  pain_points text,
  day1_attendance boolean default false,
  day2_attendance boolean default false,
  day3_attendance boolean default false,
  participation_score numeric(5,2) default 0,
  mentor_notes text,
  before_video_status text default 'Pending',
  after_video_status text default 'Pending',
  testimonial_status text default 'Pending',
  certificate_status text default 'Pending',
  parent_tag_request_status text default 'Pending',
  post_bootcamp_next_day_activity text,
  current_stage public.lead_stage not null default 'New Registration',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  lead_priority text not null default 'Incomplete',
  number_of_contact_attempts integer not null default 0,
  last_contact_at timestamptz,
  last_contact_outcome public.contact_outcome,
  next_action text,
  next_action_at timestamptz,
  overdue_status text default 'Not Due',
  parent_objection text,
  recommended_program text,
  counseling_at timestamptz,
  payment_status text default 'Not Started',
  enrollment_status text default 'Open',
  closure_reason text,
  notes text,
  duplicate_flag boolean not null default false,
  data_correction_required boolean not null default false,
  escalated_to_backup boolean not null default false,
  escalated_to_leader boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  counselor_id uuid references public.counselors(id),
  channel text not null default 'System',
  attempt_number integer default 0,
  outcome public.contact_outcome not null,
  parent_response text,
  objection text,
  previous_stage public.lead_stage,
  current_stage public.lead_stage,
  next_action text,
  next_action_at timestamptz,
  updated_score integer,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pending_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  owner_id uuid references public.counselors(id),
  task_type text not null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'Open',
  created_at timestamptz not null default now()
);

create table if not exists public.kra_kpi_items (
  id uuid primary key default gen_random_uuid(),
  day_label text not null,
  kra text not null,
  kpi text not null,
  owner_role text not null,
  target text not null,
  sort_order integer not null default 0
);

create table if not exists public.cycle_reports (
  id uuid primary key default gen_random_uuid(),
  total_active_checked integer not null default 0,
  new_leads_processed integer not null default 0,
  parents_contacted integer not null default 0,
  calls_unanswered integer not null default 0,
  whatsapp_replies integer not null default 0,
  parent_details_missing integer not null default 0,
  followups_completed integer not null default 0,
  followups_overdue integer not null default 0,
  counseling_booked integer not null default 0,
  counseling_completed integer not null default 0,
  hot_leads_attention integer not null default 0,
  payment_pending integer not null default 0,
  leads_escalated integer not null default 0,
  enrollments_completed integer not null default 0,
  opt_outs integer not null default 0,
  invalid_contacts integer not null default 0,
  leads_remaining_queue integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
before update on public.leads
for each row
execute function public.touch_updated_at();

create or replace function public.assign_lead_identifier()
returns trigger
language plpgsql
as $$
begin
  if new.lead_id is null or length(trim(new.lead_id)) = 0 then
    new.lead_id = 'STB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists leads_assign_identifier on public.leads;
create trigger leads_assign_identifier
before insert on public.leads
for each row
execute function public.assign_lead_identifier();

create or replace function public.calculate_lead_score(target public.leads)
returns integer
language plpgsql
stable
as $$
declare
  score integer := 0;
begin
  if target.parent_primary_number is not null and target.parent_consent then score := score + 5; end if;
  if target.assessment_status = 'Completed' or target.day1_assessment_status = 'Completed' then score := score + 10; end if;
  if target.day1_attendance and target.day2_attendance and target.day3_attendance then score := score + 20; end if;
  if coalesce(target.participation_score, 0) >= 7 then score := score + 10; end if;
  if target.before_video_status = 'Received' and target.after_video_status = 'Received' then score := score + 10; end if;
  if target.last_contact_outcome in ('Connected', 'Counseling Booked', 'Interested', 'Payment Pending') then score := score + 10; end if;
  if target.last_contact_outcome = 'WhatsApp Reply Received' then score := score + 5; end if;
  if target.day1_feedback_status = 'Shared' or target.day2_feedback_status = 'Shared' then score := score + 10; end if;
  if target.recommended_program is not null then score := score + 5; end if;
  if target.current_stage = 'Decision Pending' then score := score + 5; end if;
  if target.recommended_program is not null and target.parent_objection is not null then score := score + 5; end if;
  if target.payment_status = 'Payment Link Sent' or target.current_stage = 'Payment Pending' then score := score + 5; end if;
  return least(score, 100);
end;
$$;

create or replace function public.classify_lead_priority(score integer)
returns text
language sql
immutable
as $$
  select case
    when score >= 75 then 'Hot'
    when score >= 50 then 'Warm'
    when score >= 25 then 'Nurture'
    else 'Incomplete'
  end;
$$;

create or replace function public.recalculate_lead(target_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  computed_score integer;
begin
  select public.calculate_lead_score(l) into computed_score
  from public.leads l
  where l.id = target_id;

  update public.leads
  set
    lead_score = coalesce(computed_score, 0),
    lead_priority = public.classify_lead_priority(coalesce(computed_score, 0)),
    overdue_status = case
      when next_action_at is not null and next_action_at < now() then 'Overdue'
      when next_action_at is null and current_stage not in ('Enrolled', 'Not Interested', 'Invalid Contact', 'Opted Out') then 'Missing Next Action'
      else 'Not Due'
    end,
    data_correction_required = (
      parent_name is null
      or parent_primary_number is null
      or primary_counselor_id is null
      or backup_counselor_id is null
      or (
        current_stage not in ('Enrolled', 'Not Interested', 'Invalid Contact', 'Opted Out')
        and (next_action is null or next_action_at is null)
      )
    )
  where id = target_id
  returning * into updated;

  return updated;
end;
$$;

create or replace view public.active_lead_queue as
select
  l.*,
  pc.name as primary_counselor_name,
  bc.name as backup_counselor_name,
  case
    when l.current_stage = 'Payment Pending' then 3
    when l.lead_priority = 'Hot' and (l.next_action_at is null or l.next_action_at <= now()) then 2
    when l.day3_attendance and l.day2_feedback_status <> 'Shared' then 4
    when l.current_stage = 'New Registration' then 5
    when l.counseling_at::date = current_date then 6
    when l.number_of_contact_attempts in (1, 2) then 7
    when l.lead_priority = 'Warm' then 8
    when l.data_correction_required then 9
    else 10
  end as priority_rank,
  case
    when l.next_action_at is not null and l.next_action_at < now() then now() - l.next_action_at
    else interval '0'
  end as overdue_duration
from public.leads l
left join public.counselors pc on pc.id = l.primary_counselor_id
left join public.counselors bc on bc.id = l.backup_counselor_id
where l.current_stage not in ('Enrolled', 'Not Interested', 'Invalid Contact', 'Opted Out')
and not (l.current_stage = 'Long-Term Nurture' and (l.next_action_at is null or l.next_action_at > now()))
order by priority_rank asc, l.next_action_at asc nulls first, l.created_at asc;

insert into public.counselors (name, email, phone, role)
values
  ('Primary Counselor', 'primary@spikitech.local', null, 'Counselor'),
  ('Backup Counselor', 'backup@spikitech.local', null, 'Backup Counselor'),
  ('Team Leader', 'leader@spikitech.local', null, 'Team Leader')
on conflict (email) do nothing;

insert into public.kra_kpi_items (day_label, kra, kpi, owner_role, target, sort_order)
values
  ('Day 0', 'Registration verification and counselor ownership', '100% valid leads get Lead ID, parent details check, primary counselor, backup counselor and first callback slot', 'Ops + Counselor', 'Within 2 hours of registration', 10),
  ('Day 1', 'First-day assessment completion', 'Assessment status, score, mentor notes and student goals captured for every attendee', 'Mentor', 'Same day before EOD', 20),
  ('Day 1', 'Parent feedback for Day 1', 'Parent receives day-1 feedback summary and next-day activity reminder', 'Primary Counselor', 'Within 24 hours', 30),
  ('Day 2', 'Second-day assessment completion', 'Day-2 assessment score, participation and pain points updated', 'Mentor', 'Same day before EOD', 40),
  ('Day 2', 'Parent feedback for Day 2', 'Parent receives progress update, objection is captured, counseling interest is qualified', 'Primary Counselor', 'Within 24 hours', 50),
  ('Day 3', 'Certificate counseling and slot booking', 'Certificate readiness checked, counseling meeting pitched and slot booked for interested parents', 'Counselor', 'Before bootcamp close', 60),
  ('Day 4', 'Certificate delivery and parent tagging request', 'Certificate sent and parent asked to tag SpikiTech in story/post with student achievement', 'Counselor + Social Media', 'Within 24 hours after Day 3', 70),
  ('Post Bootcamp', 'Next-day nurture and conversion activity', 'Progress summary, program recommendation, payment follow-up or nurture task scheduled', 'Counselor', 'Next day after certificate delivery', 80),
  ('Operations', 'No missed active lead', 'Every active lead has current stage, last result, specific next action and due date/time', 'Team Leader', 'Checked every cycle', 90),
  ('Operations', 'Escalation discipline', 'Hot, payment-ready, missed Day-3 feedback and 48-hour unresolved leads escalated', 'Team Leader', 'Same cycle', 100)
on conflict do nothing;

alter table public.counselors enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activity_logs enable row level security;
alter table public.pending_tasks enable row level security;
alter table public.kra_kpi_items enable row level security;
alter table public.cycle_reports enable row level security;

drop policy if exists "authenticated read counselors" on public.counselors;
create policy "authenticated read counselors" on public.counselors
for select to authenticated using (true);

drop policy if exists "authenticated manage leads" on public.leads;
create policy "authenticated manage leads" on public.leads
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage logs" on public.lead_activity_logs;
create policy "authenticated manage logs" on public.lead_activity_logs
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage tasks" on public.pending_tasks;
create policy "authenticated manage tasks" on public.pending_tasks
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read kra kpi" on public.kra_kpi_items;
create policy "authenticated read kra kpi" on public.kra_kpi_items
for select to authenticated using (true);

drop policy if exists "authenticated manage reports" on public.cycle_reports;
create policy "authenticated manage reports" on public.cycle_reports
for all to authenticated using (true) with check (true);

grant usage on schema public to authenticated;
grant select on public.active_lead_queue to authenticated;
grant select on public.counselors, public.kra_kpi_items to authenticated;
grant select, insert, update, delete on public.leads, public.lead_activity_logs, public.pending_tasks, public.cycle_reports to authenticated;
grant execute on function public.recalculate_lead(uuid) to authenticated;
