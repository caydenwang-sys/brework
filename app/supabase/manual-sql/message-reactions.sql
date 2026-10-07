begin;

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id bigint not null references public.matches(id) on delete cascade,
  emoji text check (emoji in ('❤️', '👍', '😂', '👎')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_match_id_idx
  on public.message_reactions(match_id);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

drop policy if exists "Participants can view message reactions" on public.message_reactions;
create policy "Participants can view message reactions"
on public.message_reactions for select to authenticated
using (exists (
  select 1 from public.matches m
  where m.id = message_reactions.match_id and m.status = 'active'
    and (m.user_1_id = (select auth.uid()) or m.user_2_id = (select auth.uid()))
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = m.user_1_id and b.blocked_id = m.user_2_id)
         or (b.blocker_id = m.user_2_id and b.blocked_id = m.user_1_id)
    )
));

-- A cleared reaction keeps a NULL emoji so removal is an UPDATE for Realtime.
-- Only this function can write reactions; the caller cannot choose another user.
create or replace function public.brework_toggle_message_reaction(
  p_message_id bigint, p_emoji text
)
returns public.message_reactions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  chat_id bigint;
  connection public.matches%rowtype;
  result public.message_reactions%rowtype;
begin
  if actor is null then raise exception 'Please sign in again.'; end if;
  if p_emoji is null or p_emoji not in ('❤️', '👍', '😂', '👎') then
    raise exception 'Invalid reaction.';
  end if;
  select match_id into chat_id from public.messages where id = p_message_id for share;
  if not found then raise exception 'Message not found or unavailable.'; end if;
  select * into connection from public.matches where id = chat_id for share;
  if not found or connection.status is distinct from 'active'
     or (actor is distinct from connection.user_1_id and actor is distinct from connection.user_2_id) then
    raise exception 'Message not found or unavailable.';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = connection.user_1_id and b.blocked_id = connection.user_2_id)
       or (b.blocker_id = connection.user_2_id and b.blocked_id = connection.user_1_id)
  ) then raise exception 'This conversation is unavailable.'; end if;

  insert into public.message_reactions as existing (message_id, user_id, match_id, emoji)
  values (p_message_id, actor, chat_id, p_emoji)
  on conflict (message_id, user_id) do update
  set emoji = case when existing.emoji = excluded.emoji then null else excluded.emoji end,
      updated_at = clock_timestamp()
  returning * into result;
  return result;
end;
$function$;
revoke all on function public.brework_toggle_message_reaction(bigint, text) from public, anon;
grant execute on function public.brework_toggle_message_reaction(bigint, text) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$publication$;

commit;
