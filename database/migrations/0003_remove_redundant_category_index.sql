-- The UNIQUE(concert_id, code) constraint already owns an equivalent index.
-- Keep one index only; this migration cleans databases that applied 0002 before
-- the redundancy was identified.
DROP INDEX IF EXISTS idx_ticket_categories_concert_code;
