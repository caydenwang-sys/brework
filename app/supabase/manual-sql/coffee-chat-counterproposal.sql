begin;

-- Compare the proposal the user actually saw, under a row lock.
-- These functions do not change existing meetings, policies, or notification triggers.
create or replace function public.brework_counter_coffee_chat(
  p_meeting_id bigint,
  p_expected jsonb,
  p_date date,
  p_start time without time zone,
  p_end time without time zone,
  p_location text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  meeting public.meetings%rowtype;
  participant public.matches%rowtype;
  actor_name text;
  proposed_at timestamptz;
begin
  if actor is null then raise exception 'Please sign in again.'; end if;
  select * into meeting from public.meetings where id = p_meeting_id for update;
  if not found then raise exception 'Request not found or unavailable.'; end if;
  select * into participant from public.matches where id = meeting.match_id;
  if not found or (actor is distinct from participant.user_1_id and actor is distinct from participant.user_2_id)
     or participant.status is distinct from 'active' then
    raise exception 'Request not found or unavailable.';
  end if;
  if meeting.status is distinct from 'pending' or meeting.proposed_by is null
     or actor = meeting.proposed_by
     or (meeting.proposed_by is distinct from participant.user_1_id and meeting.proposed_by is distinct from participant.user_2_id) then
    raise exception 'Only the recipient can suggest a new time for a pending request.';
  end if;
  if p_expected is null or not (p_expected ?& array['scheduled_date', 'start_time', 'end_time', 'location', 'proposed_by'])
     or meeting.scheduled_date is distinct from (p_expected->>'scheduled_date')::date
     or meeting.start_time is distinct from (p_expected->>'start_time')::time
     or meeting.end_time is distinct from (p_expected->>'end_time')::time
     or meeting.location is distinct from p_expected->>'location'
     or meeting.proposed_by is distinct from (p_expected->>'proposed_by')::uuid then
    raise exception 'This request changed. Refresh Coffee Chats and review the latest time.';
  end if;
  if p_date is null or p_start is null or p_end is null or p_end <= p_start
     or p_end - p_start > interval '4 hours' then
    raise exception 'Choose a date and a valid start and end time on the same day.';
  end if;
  proposed_at := (p_date + p_start) at time zone 'America/Los_Angeles';
  if proposed_at <= now() or (proposed_at at time zone 'America/Los_Angeles') <> (p_date + p_start) then
    raise exception 'Choose a valid future time in Pacific time.';
  end if;
  if length(coalesce(p_location, '')) > 150 then raise exception 'Keep the place or link under 150 characters.'; end if;

  update public.meetings
  set scheduled_date = p_date, start_time = p_start, end_time = p_end,
      location = nullif(trim(p_location), ''), proposed_by = actor,
      responded_by = null, responded_at = null
  where id = p_meeting_id;

  select nullif(trim(concat_ws(' ', first_name, last_name)), '') into actor_name
  from public.profiles where id = actor;
  insert into public.notifications (user_id, type, title, message, related_user_id, related_match_id, is_read)
  values (meeting.proposed_by, 'coffee_chat_request', 'New coffee chat time suggested',
    coalesce(actor_name, 'Your Brework connection') || ' suggested ' ||
    to_char(p_date, 'FMMonth FMDD') || ' at ' || to_char(p_start, 'FMHH12:MI AM') ||
    ' Pacific time. Open Coffee Chats to accept or suggest another time.',
    actor, meeting.match_id, false);
  return p_meeting_id;
end;
$$;

create or replace function public.brework_respond_coffee_chat(
  p_meeting_id bigint,
  p_expected jsonb,
  p_response text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  meeting public.meetings%rowtype;
  participant public.matches%rowtype;
begin
  if actor is null then raise exception 'Please sign in again.'; end if;
  if p_response is null or p_response not in ('accepted', 'declined') then raise exception 'Invalid response.'; end if;
  select * into meeting from public.meetings where id = p_meeting_id for update;
  if not found then raise exception 'Request not found or unavailable.'; end if;
  select * into participant from public.matches where id = meeting.match_id;
  if not found or (actor is distinct from participant.user_1_id and actor is distinct from participant.user_2_id)
     or participant.status is distinct from 'active' then
    raise exception 'Request not found or unavailable.';
  end if;
  if meeting.status is distinct from 'pending' or meeting.proposed_by is null
     or actor = meeting.proposed_by
     or (meeting.proposed_by is distinct from participant.user_1_id and meeting.proposed_by is distinct from participant.user_2_id) then
    raise exception 'Only the recipient can respond to a pending request.';
  end if;
  if p_expected is null or not (p_expected ?& array['scheduled_date', 'start_time', 'end_time', 'location', 'proposed_by'])
     or meeting.scheduled_date is distinct from (p_expected->>'scheduled_date')::date
     or meeting.start_time is distinct from (p_expected->>'start_time')::time
     or meeting.end_time is distinct from (p_expected->>'end_time')::time
     or meeting.location is distinct from p_expected->>'location'
     or meeting.proposed_by is distinct from (p_expected->>'proposed_by')::uuid then
    raise exception 'This request changed. Refresh Coffee Chats and review the latest time.';
  end if;
  if p_response = 'accepted' and (meeting.scheduled_date is null or meeting.start_time is null
     or ((meeting.scheduled_date + meeting.start_time) at time zone 'America/Los_Angeles') <= now()) then
    raise exception 'That time has passed. Suggest a new time instead.';
  end if;
  update public.meetings
  set status = case when p_response = 'accepted' then 'scheduled' else 'declined' end,
      responded_by = actor, responded_at = now()
  where id = p_meeting_id;
  -- Existing pending -> scheduled trigger sends the acceptance notification.
  return p_meeting_id;
end;
$$;

revoke all on function public.brework_counter_coffee_chat(bigint,jsonb,date,time,time,text) from public, anon;
revoke all on function public.brework_respond_coffee_chat(bigint,jsonb,text) from public, anon;
grant execute on function public.brework_counter_coffee_chat(bigint,jsonb,date,time,time,text) to authenticated;
grant execute on function public.brework_respond_coffee_chat(bigint,jsonb,text) to authenticated;

commit;
