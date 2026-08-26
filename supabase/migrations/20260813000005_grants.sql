-- PostgREST needs USAGE + SELECT on non-public schemas for the JS client
-- (.schema('silver')/.schema('bronze')/.schema('gold')) to reach the views.
-- Without these grants every query returns "permission denied for view <x>".

grant usage on schema bronze, silver, gold to anon, authenticated, service_role;

grant select on all tables in schema bronze to anon, authenticated, service_role;
grant select on all tables in schema silver to anon, authenticated, service_role;
grant select on all tables in schema gold   to anon, authenticated, service_role;

alter default privileges in schema bronze grant select on tables to anon, authenticated, service_role;
alter default privileges in schema silver grant select on tables to anon, authenticated, service_role;
alter default privileges in schema gold   grant select on tables to anon, authenticated, service_role;

notify pgrst, 'reload schema';
