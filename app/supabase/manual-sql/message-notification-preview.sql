create or replace function public.create_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  recipient_id uuid;
  sender_name text;
  message_notifications_enabled boolean;
begin
  select case when user_1_id = new.sender_id then user_2_id else user_1_id end
  into recipient_id
  from public.matches
  where id = new.match_id and new.sender_id in (user_1_id, user_2_id);
  if recipient_id is null then return new; end if;

  select message_notifications into message_notifications_enabled
  from public.notification_preferences where user_id = recipient_id;
  if coalesce(message_notifications_enabled, true) = false then return new; end if;

  select nullif(trim(concat_ws(' ', first_name, last_name)), '') into sender_name
  from public.profiles where id = new.sender_id;

  insert into public.notifications (
    user_id, type, title, message, related_user_id, related_match_id, is_read
  ) values (
    recipient_id, 'message', coalesce(sender_name, 'New message'),
    left(coalesce(nullif(new.message, ''), 'You received a new message.'), 500),
    new.sender_id, new.match_id, false
  );
  return new;
end;
$function$;
