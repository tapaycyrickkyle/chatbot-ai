-- Drops tables from the removed business-owner portal.
-- Run this after deploying the admin-only app if you no longer need owner/order data.

drop table if exists public.orders;
drop table if exists public.business_users;
