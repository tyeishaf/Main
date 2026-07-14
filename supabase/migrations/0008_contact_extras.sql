-- 0008_contact_extras.sql — Phase 14: birthday/age, client type, call logging
--
-- date_of_birth: shown on the contact card (age derived on read)
-- client_type:   'individual' | 'business' — separates business-owner clients

alter table contacts add column if not exists date_of_birth date;
alter table contacts add column if not exists client_type   text not null default 'individual';

create index if not exists idx_contacts_client_type on contacts(org_id, client_type);
