-- Template: assign a Supabase Auth user as the business owner for one client.
-- First create the user in Supabase Dashboard > Authentication > Users.
-- Then replace the values below and run this file.

insert into public.business_users (client_id, email)
values (1, 'owner@example.com')
on conflict (email) do update
set client_id = excluded.client_id;
