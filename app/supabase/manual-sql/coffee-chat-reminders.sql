begin;

alter table public.notification_preferences
  add column if not exists coffee_chat_reminders_enabled boolean not null default false,
  add column if not exists coffee_chat_reminder_minutes integer not null default 30
    check (coffee_chat_reminder_minutes in (15, 30, 60, 1440));

create table if not exists public.coffee_chat_reminder_log (
  meeting_id bigint not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  reminder_minutes integer not null check (reminder_minutes in (15, 30, 60, 1440)),
  notification_id bigint references public.notifications(id) on delete set null,
  queued_at timestamptz not null default now(),
  primary key (meeting_id, user_id, starts_at)
);
alter table public.coffee_chat_reminder_log enable row level security;
revoke all on table public.coffee_chat_reminder_log from anon, authenticated;

create index if not exists brework_confirmed_meeting_reminder_dates
  on public.meetings (scheduled_date, start_time)
  where status = 'scheduled';

create or replace function public.brework_queue_coffee_chat_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  candidate record;
  locked_meeting public.meetings%rowtype;
  claimed integer;
  queued_count integer := 0;
  new_notification_id bigint;
  current_lead integer;
  other_name text;
  checked_at timestamptz := now();
begin
  -- Serialize manual and scheduled runs without blocking another job.
  if not pg_try_advisory_xact_lock(218645789103::bigint) then return 0; end if;

  for candidate in
    select m.id as meeting_id, m.match_id, m.scheduled_date, m.start_time,
      person.user_id, person.other_user_id,
      ((m.scheduled_date + m.start_time) at time zone 'America/Los_Angeles') as starts_at
    from public.meetings m
    join public.matches connection on connection.id = m.match_id and connection.status = 'active'
    cross join lateral (values
      (connection.user_1_id, connection.user_2_id),
      (connection.user_2_id, connection.user_1_id)
    ) as person(user_id, other_user_id)
    join public.notification_preferences preference on preference.user_id = person.user_id
      and preference.coffee_chat_reminders_enabled = true
    where m.status = 'scheduled' and m.start_time is not null
      and m.scheduled_date between (checked_at at time zone 'America/Los_Angeles')::date
        and ((checked_at + interval '1440 minutes') at time zone 'America/Los_Angeles')::date
      and ((m.scheduled_date + m.start_time) at time zone 'America/Los_Angeles') > checked_at
      and ((m.scheduled_date + m.start_time) at time zone 'America/Los_Angeles')
        <= checked_at + make_interval(mins => preference.coffee_chat_reminder_minutes)
      and exists (select 1 from public.push_tokens device where device.user_id = person.user_id)
      and not exists (
        select 1 from public.coffee_chat_reminder_log history
        where history.meeting_id = m.id and history.user_id = person.user_id
          and history.starts_at = ((m.scheduled_date + m.start_time) at time zone 'America/Los_Angeles')
      )
    order by m.scheduled_date, m.start_time, m.id, person.user_id
    limit 200
  loop
    -- Recheck under a lock so cancellation or a time change before queuing wins.
    select * into locked_meeting from public.meetings where id = candidate.meeting_id for update;
    if not found or locked_meeting.status is distinct from 'scheduled'
       or locked_meeting.match_id is distinct from candidate.match_id
       or locked_meeting.scheduled_date is distinct from candidate.scheduled_date
       or locked_meeting.start_time is distinct from candidate.start_time then
      continue;
    end if;
    if not exists (select 1 from public.matches where id = candidate.match_id and status = 'active') then continue; end if;

    select coffee_chat_reminder_minutes into current_lead
    from public.notification_preferences
    where user_id = candidate.user_id and coffee_chat_reminders_enabled = true
    for share;
    if not found or current_lead not in (15,30,60,1440)
       or candidate.starts_at > checked_at + make_interval(mins => current_lead) then continue; end if;

    insert into public.coffee_chat_reminder_log (meeting_id, user_id, starts_at, reminder_minutes)
    values (candidate.meeting_id, candidate.user_id, candidate.starts_at, current_lead)
    on conflict (meeting_id, user_id, starts_at) do nothing;
    get diagnostics claimed = row_count;
    if claimed = 0 then continue; end if;

    select nullif(trim(concat_ws(' ', first_name, last_name)), '') into other_name
    from public.profiles where id = candidate.other_user_id;

    insert into public.notifications (
      user_id, type, title, message, related_user_id, related_match_id, is_read
    ) values (
      candidate.user_id, 'coffee_chat_reminder', 'Upcoming coffee chat',
      'Your coffee chat with ' || coalesce(other_name, 'your connection') ||
      ' is on ' || to_char(locked_meeting.scheduled_date, 'FMMonth FMDD') ||
      ' at ' || to_char(locked_meeting.start_time, 'FMHH12:MI AM') || ' Pacific time.' ||
      case when nullif(trim(locked_meeting.location), '') is null then ''
        else ' Place: ' || left(locked_meeting.location, 150) || '.' end,
      candidate.other_user_id, candidate.match_id, false
    ) returning id into new_notification_id;

    update public.coffee_chat_reminder_log set notification_id = new_notification_id
    where meeting_id = candidate.meeting_id and user_id = candidate.user_id and starts_at = candidate.starts_at;
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$function$;
revoke all on function public.brework_queue_coffee_chat_reminders() from public, anon, authenticated;

commit;

-- The cron job runs as the database administrator, never as an app user.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'brework-coffee-chat-reminders',
  '* * * * *',
  'select public.brework_queue_coffee_chat_reminders();'
);
