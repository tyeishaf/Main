-- 0009_import_status.sql — Phase 15: keep the vendor's original status
-- import_status holds the disposition/result the lead had in the source
-- system when it was uploaded (e.g. the VanillaSoft "CRM Result").

alter table contacts add column if not exists import_status text;
