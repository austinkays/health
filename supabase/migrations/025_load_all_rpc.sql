-- Single RPC that returns all user data in one round-trip.
-- Replaces 24 parallel SELECT calls from the client.
create or replace function load_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'profile',           coalesce((select row_to_json(p)::jsonb from profiles p where p.id = uid), '{}'::jsonb),
    'medications',       coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from medications r where r.user_id = uid), '[]'::jsonb),
    'conditions',        coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from conditions r where r.user_id = uid), '[]'::jsonb),
    'allergies',         coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from allergies r where r.user_id = uid), '[]'::jsonb),
    'providers',         coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from providers r where r.user_id = uid), '[]'::jsonb),
    'pharmacies',        coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from pharmacies r where r.user_id = uid), '[]'::jsonb),
    'vitals',            coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from vitals r where r.user_id = uid), '[]'::jsonb),
    'appointments',      coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from appointments r where r.user_id = uid), '[]'::jsonb),
    'journal_entries',   coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from journal_entries r where r.user_id = uid), '[]'::jsonb),
    'labs',              coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from labs r where r.user_id = uid), '[]'::jsonb),
    'procedures',        coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from procedures r where r.user_id = uid), '[]'::jsonb),
    'immunizations',     coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from immunizations r where r.user_id = uid), '[]'::jsonb),
    'care_gaps',         coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from care_gaps r where r.user_id = uid), '[]'::jsonb),
    'anesthesia_flags',  coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from anesthesia_flags r where r.user_id = uid), '[]'::jsonb),
    'appeals_and_disputes', coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from appeals_and_disputes r where r.user_id = uid), '[]'::jsonb),
    'surgical_planning', coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from surgical_planning r where r.user_id = uid), '[]'::jsonb),
    'insurance',         coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from insurance r where r.user_id = uid), '[]'::jsonb),
    'insurance_claims',  coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from insurance_claims r where r.user_id = uid), '[]'::jsonb),
    'drug_prices',       coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from drug_prices r where r.user_id = uid), '[]'::jsonb),
    'todos',             coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from todos r where r.user_id = uid), '[]'::jsonb),
    'cycles',            coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from cycles r where r.user_id = uid), '[]'::jsonb),
    'activities',        coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from activities r where r.user_id = uid), '[]'::jsonb),
    'genetic_results',   coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from genetic_results r where r.user_id = uid), '[]'::jsonb),
    'feedback',          coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r.created_at) from feedback r where r.user_id = uid), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
