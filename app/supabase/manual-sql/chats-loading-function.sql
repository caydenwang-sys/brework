begin;

create index if not exists brework_messages_latest_by_match
  on public.messages (match_id, created_at desc, id desc);
create index if not exists brework_messages_unread_by_match
  on public.messages (match_id, sender_id) where read_at is null;

create or replace function public.brework_chat_summaries()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'matchId', summary.id,
      'otherUser', case when summary.profile_id is null then null else
        jsonb_build_object('id', summary.profile_id,
          'first_name', summary.first_name, 'last_name', summary.last_name) end,
      'latestMessage', summary.message,
      'latestMessageTime', summary.message_time,
      'unreadCount', summary.unread_count
    ) order by summary.message_time desc nulls last, summary.created_at desc, summary.id desc
  ), '[]'::jsonb)
  from (
    select m.id, m.created_at, p.id as profile_id, p.first_name, p.last_name,
      latest.message, latest.created_at as message_time, unread.unread_count
    from public.matches m
    left join public.profiles p on p.id = case
      when m.user_1_id = (select auth.uid()) then m.user_2_id else m.user_1_id end
    left join lateral (
      select message.message, message.created_at
      from public.messages message
      where message.match_id = m.id
      order by message.created_at desc, message.id desc limit 1
    ) latest on true
    cross join lateral (
      select count(*) as unread_count
      from public.messages message
      where message.match_id = m.id and message.sender_id <> (select auth.uid())
        and message.read_at is null
    ) unread
    where m.status = 'active' and (select auth.uid()) is not null
      and (m.user_1_id = (select auth.uid()) or m.user_2_id = (select auth.uid()))
  ) summary;
$function$;

revoke all on function public.brework_chat_summaries() from public, anon;
grant execute on function public.brework_chat_summaries() to authenticated;
commit;
