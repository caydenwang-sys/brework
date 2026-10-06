-- Already applied manually to the live project on October 6, 2026.
-- Historical backfill: run once during rollout, not repeatedly.
begin;
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

update public.profiles p
set onboarding_completed_at = now()
where p.onboarding_completed_at is null
  and nullif(trim(p.first_name), '') is not null
  and nullif(trim(p.last_name), '') is not null
  and nullif(trim(p.major), '') is not null
  and p.academic_year is not null
  and exists (
    select 1 from public.match_preferences mp where mp.user_id = p.id
  );
commit;
